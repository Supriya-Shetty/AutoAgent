import asyncio
import logging
import os
import uuid
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

import firebase_admin
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from composio_agent.agent import get_agent_executor, root_agent
from database import (
    add_ai_provider,
    delete_ai_provider,
    delete_user_session,
    get_admin_stats,
    get_ai_providers,
    get_all_users_with_counts,
    get_session_history,
    get_user_sessions,
    increment_usage,
    is_user_blocked,
    register_user,
    save_message,
    set_active_provider,
    set_user_block_status,
)

# Load environment variables from .env
load_dotenv(Path(__file__).parent / ".env", override=True)

# Suppress warnings
warnings.filterwarnings("ignore", message=".*non-text parts.*")
logging.getLogger("google.genai").setLevel(logging.ERROR)


class ChatMessage(BaseModel):
    message: str
    session_id: str | None = None


class AIProviderCreate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str


class AIProviderUpdate(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str


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
def init_firebase_admin():
    try:
        service_account_path = (
            Path(__file__).parent
            / "signupform2-6e36c-firebase-adminsdk-6r9af-395e431632.json"
        )

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

            if all(
                [service_account_info["private_key"], service_account_info["client_email"]]
            ) and "Your_Private_Key_Here" not in service_account_info["private_key"]:
                cred = credentials.Certificate(service_account_info)
                firebase_admin.initialize_app(cred)
                print("✅ Firebase Admin initialized using environment variables")
            else:
                # Last resort: Try default credentials (ADC) if available, or just mock it if not
                try:
                    firebase_admin.initialize_app()
                    print("✅ Firebase Admin initialized using default credentials")
                except Exception:
                    print("⚠️ Firebase Admin could not be initialized. Authentication will fail.")
                    return False
        return True
    except Exception as e:
        print(f"⚠️ Firebase Admin initialization warning: {e}")
        return False

# Run initialization
FIREBASE_READY = init_firebase_admin()


async def verify_token(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Unauthorized: No Bearer token provided"
        )

    token = authorization.split("Bearer ")[1]
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        email = decoded_token.get("email")

        if uid and email:
            register_user(uid, email)

        if is_user_blocked(uid):
            raise HTTPException(
                status_code=403,
                detail="Your account has been blocked. Please contact support.",
            )

        return decoded_token
    except HTTPException as e:
        raise e
    except Exception as e:
        print(f"❌ Token Verification Failed: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Unauthorized: {str(e)}")


async def verify_admin(token_data: dict = Depends(verify_token)):
    email = token_data.get("email")
    load_dotenv(Path(__file__).parent / ".env", override=True)
    admin_emails_str = os.getenv("ADMIN_EMAILS", "")
    admin_emails = [e.strip().lower() for e in admin_emails_str.split(",") if e.strip()]

    if not email or email.lower() not in admin_emails:
        raise HTTPException(
            status_code=403, detail="Access denied: Admin privileges required"
        )
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

auth_path = static_path / "auth"
app.mount("/auth", StaticFiles(directory=auth_path), name="auth")


@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html", "r") as f:
        return f.read()


@app.get("/admin", response_class=HTMLResponse)
async def admin_root():
    with open("static/admin/index.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/login", response_class=HTMLResponse)
async def login():
    html_path = static_path / "auth" / "index.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(
        content="<h1>Login files not found. Please create static/auth/index.html</h1>"
    )


@app.post("/chat")
async def chat(
    request: Request,
    chat_message: ChatMessage,
    token_data: dict = Depends(verify_token),
):
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    usage_count = increment_usage(user_id)
    message = chat_message.message.strip()
    if not message:
        return {"error": "Message cannot be empty"}

    # Strip any trailing whitespace/newlines from the session_id to prevent HTTP header errors
    raw_session_id = (
        chat_message.session_id.strip() if chat_message.session_id else None
    )
    session_id = raw_session_id or str(uuid.uuid4())

    save_message(user_id, session_id, "user", message)

    # Get history and format for LangChain
    raw_history = get_session_history(user_id, session_id)
    chat_history = []
    # raw_history contains all messages including the one we just saved.
    # LangChain agent expects chat_history to be PRIOR messages.
    for h in raw_history[:-1]:
        if h["role"] == "user":
            chat_history.append(HumanMessage(content=h["content"]))
        else:
            chat_history.append(AIMessage(content=h["content"]))

    # Use a per-user agent executor if needed
    if user_id == os.getenv("COMPOSIO_USER_ID"):
        executor = root_agent
    else:
        executor = get_agent_executor(user_id=user_id)

    async def event_generator():
        full_assistant_message = ""
        try:
            async for event in executor.astream_events(
                {"input": message, "chat_history": chat_history},
                version="v1",
            ):
                kind = event["event"]

                if kind == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if content:
                        full_assistant_message += content
                        yield {
                            "event": "message",
                            "data": content,
                        }

                elif kind == "on_tool_start":
                    yield {
                        "event": "tool_call",
                        "data": event["name"],
                    }

        except Exception as e:
            print(f"❌ Stream error: {e}")
            yield {"event": "error", "data": str(e)}
        finally:
            if full_assistant_message.strip():
                save_message(user_id, session_id, "assistant", full_assistant_message)
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
    return {
        "apiKey": os.getenv("FIREBASE_API_KEY"),
        "authDomain": os.getenv("FIREBASE_AUTH_DOMAIN"),
        "databaseURL": os.getenv("FIREBASE_DATABASE_URL"),
        "projectId": os.getenv("FIREBASE_PROJECT_ID"),
        "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET"),
        "messagingSenderId": os.getenv("FIREBASE_MESSAGING_SENDER_ID"),
        "appId": os.getenv("FIREBASE_APP_ID"),
    }


@app.get("/sessions/{session_id}/history")
async def get_history(session_id: str, token_data: dict = Depends(verify_token)):
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    return get_session_history(user_id, session_id)


@app.get("/sessions")
async def list_sessions(token_data: dict = Depends(verify_token)):
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    return get_user_sessions(user_id)


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, token_data: dict = Depends(verify_token)):
    user_id = token_data.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    delete_user_session(user_id, session_id)
    return {"status": "success", "message": f"Session {session_id} deleted"}


# --- Admin Endpoints ---


@app.get("/admin/stats")
async def get_stats(admin_data: dict = Depends(verify_admin)):
    return get_admin_stats()


@app.get("/admin/users")
async def list_users(admin_data: dict = Depends(verify_admin)):
    return get_all_users_with_counts()


@app.post("/admin/users/{uid}/block")
async def block_user(uid: str, admin_data: dict = Depends(verify_admin)):
    set_user_block_status(uid, True)
    return {"status": "success", "message": f"User {uid} blocked"}


@app.post("/admin/users/{uid}/unblock")
async def unblock_user(uid: str, admin_data: dict = Depends(verify_admin)):
    set_user_block_status(uid, False)
    return {"status": "success", "message": f"User {uid} unblocked"}


# AI Provider Endpoints


@app.get("/admin/ai-providers")
async def list_ai_providers(admin_data: dict = Depends(verify_admin)):
    return get_ai_providers()


@app.post("/admin/ai-providers")
async def create_ai_provider(
    provider: AIProviderCreate, admin_data: dict = Depends(verify_admin)
):
    success = add_ai_provider(
        provider.name, provider.base_url, provider.api_key, provider.model
    )
    if success:
        return {"status": "success", "message": "AI Provider added"}
    raise HTTPException(status_code=500, detail="Failed to add AI Provider")


@app.put("/admin/ai-providers/{provider_id}")
async def update_ai_provider_endpoint(
    provider_id: int, provider: AIProviderCreate, admin_data: dict = Depends(verify_admin)
):
    from database import update_ai_provider
    success = update_ai_provider(
        provider_id, provider.name, provider.base_url, provider.api_key, provider.model
    )
    if success:
        return {"status": "success", "message": "AI Provider updated"}
    raise HTTPException(status_code=500, detail="Failed to update AI Provider")


@app.delete("/admin/ai-providers/{provider_id}")
async def remove_ai_provider(provider_id: int, admin_data: dict = Depends(verify_admin)):
    success = delete_ai_provider(provider_id)
    if success:
        return {"status": "success", "message": "AI Provider deleted"}
    raise HTTPException(status_code=500, detail="Failed to delete AI Provider")


@app.post("/admin/ai-providers/{provider_id}/activate")
async def activate_provider(provider_id: int, admin_data: dict = Depends(verify_admin)):
    success = set_active_provider(provider_id)
    if success:
        return {"status": "success", "message": "AI Provider activated"}
    raise HTTPException(status_code=500, detail="Failed to activate AI Provider")


@app.get("/admin/ai-providers/fetch-models")
async def fetch_models(
    base_url: str, api_key: str = "", provider_id: int = None, admin_data: dict = Depends(verify_admin)
):
    import httpx
    import sqlite3

    if not api_key and provider_id is not None:
        conn = sqlite3.connect("usage.db")
        cursor = conn.cursor()
        cursor.execute("SELECT api_key FROM ai_providers WHERE id = ?", (provider_id,))
        row = cursor.fetchone()
        conn.close()
        if row and row[0]:
            api_key = row[0]
            
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required")

    async with httpx.AsyncClient() as client:
        try:
            # Most OpenAI-compatible APIs use /models
            url = f"{base_url.rstrip('/')}/models"
            response = await client.get(
                url, headers={"Authorization": f"Bearer {api_key}"}, timeout=10.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            print(f"❌ Error fetching models from {url}: {e}")
            raise HTTPException(
                status_code=500, detail=f"Failed to fetch models: {str(e)}"
            )


@app.get("/admin/ai-providers/{provider_id}/test")
async def test_provider_connection(
    provider_id: int, admin_data: dict = Depends(verify_admin)
):
    import httpx
    from database import get_ai_providers

    # Get the specific provider (including the real key)
    conn = sqlite3.connect("usage.db")
    cursor = conn.cursor()
    cursor.execute(
        "SELECT base_url, api_key, model FROM ai_providers WHERE id = ?", (provider_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Provider not found")

    base_url, api_key, model = row

    async with httpx.AsyncClient() as client:
        try:
            url = f"{base_url.rstrip('/')}/chat/completions"
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": "say hi"}],
                "max_tokens": 5,
            }
            response = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
                timeout=10.0,
            )
            if response.status_code == 200:
                return {"status": "success", "message": "Connection working!"}
            else:
                return {
                    "status": "error",
                    "message": f"Provider returned {response.status_code}: {response.text}",
                }
        except Exception as e:
            return {"status": "error", "message": str(e)}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
