"""
FastAPI server for Composio Agent Web UI.
Uses the existing composio_agent as the backend.
"""

import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Load environment variables from composio_agent/.env
load_dotenv(Path(__file__).parent / "composio_agent" / ".env")

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
    title="Composio Agent Web UI",
    description="A modern chat interface for Composio Agent",
    lifespan=lifespan,
)

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


@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve the main HTML page."""
    html_path = static_path / "index.html"
    if html_path.exists():
        return HTMLResponse(content=html_path.read_text(encoding="utf-8"))
    return HTMLResponse(content="<h1>Static files not found. Please create static/index.html</h1>")


@app.post("/chat")
async def chat(request: Request, chat_message: ChatMessage):
    """
    Chat endpoint that streams responses using Server-Sent Events.
    """
    message = chat_message.message.strip()
    if not message:
        return {"error": "Message cannot be empty"}

    # Use provided session_id or create a new one
    session_id = chat_message.session_id or str(uuid.uuid4())
    user_id = "web_user"

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
                            if hasattr(part, "text") and part.text:
                                yield {
                                    "event": "message",
                                    "data": part.text,
                                }
                    elif hasattr(event.content, "model_dump"):
                        content_dict = event.content.model_dump()
                        if "parts" in content_dict:
                            for part in content_dict["parts"]:
                                if "text" in part and part["text"]:
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
                            "data": f"🔧 Calling tool: {tool_name}",
                        }

                # Check for function calls in content
                if hasattr(event, "content") and event.content:
                    if hasattr(event.content, "parts"):
                        for part in event.content.parts:
                            if hasattr(part, "function_call") and part.function_call:
                                func_name = getattr(part.function_call, "name", "unknown")
                                yield {
                                    "event": "tool_call",
                                    "data": f"🔧 Calling: {func_name}",
                                }

                # Small delay to prevent overwhelming the client
                await asyncio.sleep(0.01)

            # Signal completion
            yield {"event": "done", "data": session_id}

        except Exception as e:
            yield {"event": "error", "data": str(e)}

    return EventSourceResponse(
        event_generator(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
        },
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "agent": root_agent.name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
