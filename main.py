"""
FastAPI server for Composio Agent Web UI.
Uses the existing composio_agent as the backend.
"""

import asyncio
import logging
import os
import uuid
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Header, HTTPException
from database import (
    increment_usage, save_message, get_session_history, 
    get_user_sessions, delete_user_session, register_user,
    is_user_blocked, get_admin_stats, get_all_users_with_counts,
    set_user_block_status
)

# Load environment variables from .env
load_dotenv(Path(__file__).parent / ".env", override=True)

# Suppress the "non-text parts" warning from google-genai
warnings.filterwarnings("ignore", message=".*non-text parts.*")
logging.getLogger("google.genai").setLevel(logging.ERROR)

# Import the agent AFTER loading env vars
from composio_agent.agent import root_agent

# Session service for storing chat history
session_service = InMemorySessionService()

# Create runner with the agent
runner = Runner(
    agent=root_agent,
    app_name="composio_web_ui",
    session_service=session_service,
)


class ChatMessage(BaseModel):
    message: str
    session_id: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("\n✨ Composio Agent Web UI is starting...")
    print("🌐 Open http://localhost:8000 in your browser")
    yield
    print("\n👋 Shutting down...")


app = FastAPI(
    title="AutoAgent",
    description="Intelligent Tool Orchestration Platform",
    lifespan=lifespan,
)

# Initialize Firebase Admin
try:
    service_account_path = Path(__file__).parent / "signupform2-6e36c-firebase-adminsdk-6r9af-395e431632.json"
    
    if service_account_path.exists():
        cred = credentials.Certificate(str(service_account_path))
        firebase_admin.initialize_app(cred)
        print(f"✅ Firebase Admin initialized using {service_account_path.name}")
    else:
        # Try to initialize with service account from env vars
        service_account_info = {
            "type": "service_account",
            "project_id": os.getenv("FIREBASE_PROJECT_ID"),
            "private_key_id": os.getenv("FIREBASE_PRIVATE_KEY_ID"),
            "private_key": os.getenv("FIREBASE_PRIVATE_KEY", "").replace("\\n", "\n"),
            "client_email": os.getenv("FIREBASE_CLIENT_EMAIL"),
            "client_id": os.getenv("FIREBASE_CLIENT_ID"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_x509_cert_url": os.getenv("FIREBASE_CLIENT_X509_CERT_URL"),
        }
        
        if all([service_account_info["private_key"], service_account_info["client_email"]]):
            cred = credentials.Certificate(service_account_info)
            firebase_admin.initialize_app(cred)
            print("✅ Firebase Admin initialized using environment variables")
        else:
            # Fallback to default (useful if GOOGLE_APPLICATION_CREDENTIALS is set)
            firebase_admin.initialize_app()
            print("✅ Firebase Admin initialized using default credentials")
except ValueError:
    # App already initialized
    pass
except Exception as e:
    print(f"⚠️ Firebase Admin initialization warning: {e}")
    print("Ensure you have set up your Firebase Service Account credentials.")

async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized: No Bearer token provided")
    
    token = authorization.split("Bearer ")[1]
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        email = decoded_token.get("email")
        
        # DEBUG: Print token info
        print(f"🔑 Token Verified: uid={uid}, email={email}")
        
        # Register/Update user in our local db
        if uid and email:
            register_user(uid, email)
            
        # Check if user is blocked
        if is_user_blocked(uid):
            raise HTTPException(status_code=403, detail="Your account has been blocked. Please contact support.")
            
        return decoded_token
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"❌ Token Verification Failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Unauthorized: {str(e)}")

async def verify_admin(token_data: dict = Depends(verify_token)):
    email = token_data.get("email")
    # Force reload of env vars for debugging
    load_dotenv(Path(__file__).parent / ".env", override=True)
    admin_emails_str = os.getenv("ADMIN_EMAILS", "")
    admin_emails = [e.strip().lower() for e in admin_emails_str.split(",") if e.strip()]
    
    print(f"🔒 Admin Check: User Email='{email}', Admin Emails Allowed={admin_emails}")
    
    if not email or email.lower() not in admin_emails:
        print(f"❌ Access Denied: {email} not in {admin_emails}")
        raise HTTPException(status_code=403, detail="Access denied: Admin privileges required")
    
    print(f"✅ Access Granted: {email}")
    return token_data

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_path = Path(__file__).parent / "static"
static_path.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_path), name="static")

# Mount auth static files separately to ensure they are accessible
auth_path = static_path / "auth"
app.mount("/auth", StaticFiles(directory=auth_path), name="auth")


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML page."""
    with open("static/index.html", "r") as f:
        return f.read()

@app.get("/admin", response_class=HTMLResponse)
async def admin_root():
    """Serve the admin dashboard."""
    with open("static/admin/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/login", response_class=HTMLResponse)
async def login():
    """Serve the login HTML page."""
    html_path = static_path / "auth" / "index.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Login files not found. Please create static/auth/index.html</h1>")


@app.post("/chat")
async def chat(request: Request, chat_message: ChatMessage, token_data: dict = Depends(verify_token)):
    """
    Chat endpoint that streams responses using Server-Sent Events.
    Only accessible with a valid Firebase ID Token.
    """
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    # Track usage
    usage_count = increment_usage(user_id)
    print(f"📈 Usage for {user_id}: {usage_count} requests today")

    message = chat_message.message.strip()
    if not message:
        return {"error": "Message cannot be empty"}

    # Use provided session_id or create a new one
    session_id = chat_message.session_id or str(uuid.uuid4())
    
    # Save user message to history
    save_message(user_id, session_id, "user", message)

    # Ensure session exists
    session = await session_service.get_session(
        app_name="composio_web_ui",
        user_id=user_id,
        session_id=session_id,
    )
    if session is None:
        session = await session_service.create_session(
            app_name="composio_web_ui",
            user_id=user_id,
            session_id=session_id,
        )

    # Create the user message content
    user_content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=message)],
    )

    async def event_generator():
        """Generate SSE events from agent responses."""
        # Accumulate full assistant response
        full_assistant_message = ""
        try:
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=user_content,
            ):
                # Check for text content in the event
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            # Safer way to get text without triggering property warning
                            part_dict = part.model_dump() if hasattr(part, "model_dump") else {}
                            text = part_dict.get("text")
                            if text:
                                full_assistant_message += text
                                yield {
                                    "event": "message",
                                    "data": text,
                                }
                    elif hasattr(event.content, "model_dump"):
                        content_dict = event.content.model_dump()
                        if "parts" in content_dict:
                            for part in content_dict["parts"]:
                                if "text" in part and part["text"]:
                                    full_assistant_message += part["text"]
                                    yield {
                                        "event": "message",
                                        "data": part["text"],
                                    }

                # Check for tool calls
                if hasattr(event, "tool_calls") and event.tool_calls:
                    for tool_call in event.tool_calls:
                        tool_name = getattr(tool_call, "name", "unknown")
                        yield {
                            "event": "tool_call",
                            "data": tool_name, # Send just name for cleaner parsing
                        }

                # Check for function calls in content
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "function_call") and part.function_call:
                                func_name = getattr(part.function_call, "name", "unknown")
                                yield {
                                    "event": "tool_call",
                                    "data": func_name,
                                }

                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)

        except asyncio.CancelledError:
            print(f"⚠️ Stream cancelled for user {user_id}")
            raise
        except Exception as e:
            print(f"❌ Stream error: {e}")
            yield {"event": "error", "data": str(e)}
        finally:
            # Save assistant response to history even if interrupted
            if full_assistant_message.strip():
                save_message(user_id, session_id, "assistant", full_assistant_message)
                print(f"💾 Saved assistant message for session {session_id}")

            # Signal completion
            yield {"event": "done", "data": session_id}

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
        },
    )


@app.get("/firebase-config")
async def get_firebase_config():
    """Serve Firebase configuration from environment variables."""
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY"),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "databaseURL": os.getenv("FIREBASE_DATABASE_URL"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.getenv("FIREBASE_APP_ID")
    }


@app.get("/sessions/{session_id}/history")
async def get_history(session_id: str, token_data: dict = Depends(verify_token)):
    """Fetch chat history for a specific session."""
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    return get_session_history(user_id, session_id)


@app.get("/sessions")
async def list_sessions(token_data: dict = Depends(verify_token)):
    """List all chat sessions for the authenticated user."""
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    return get_user_sessions(user_id)


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, token_data: dict = Depends(verify_token)):
    """Delete a specific chat session."""
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    delete_user_session(user_id, session_id)
    return {"status": "success", "message": f"Session {session_id} deleted"}

# --- Admin Endpoints ---

@app.get("/admin/stats")
async def get_stats(admin_data: dict = Depends(verify_admin)):
    """Get aggregate stats for the admin dashboard."""
    return get_admin_stats()

@app.get("/admin/users")
async def list_users(admin_data: dict = Depends(verify_admin)):
    """List all users with their message counts."""
    return get_all_users_with_counts()

@app.post("/admin/users/{uid}/block")
async def block_user(uid: str, admin_data: dict = Depends(verify_admin)):
    """Block a user."""
    set_user_block_status(uid, True)
    return {"status": "success", "message": f"User {uid} blocked"}

@app.post("/admin/users/{uid}/unblock")
async def unblock_user(uid: str, admin_data: dict = Depends(verify_admin)):
    """Unblock a user."""
    set_user_block_status(uid, False)
    return {"status": "success", "message": f"User {uid} unblocked"}

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "agent": root_agent.name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
