import os
import warnings
from typing import List

from composio import Composio
from composio_langchain import LangchainProvider
from dotenv import load_dotenv
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI

from database import get_active_provider, get_composio_session, save_composio_session

load_dotenv()

# Suppress warnings
warnings.filterwarnings("ignore", message=".*BaseAuthenticatedTool.*")

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
COMPOSIO_API_KEY = os.getenv("COMPOSIO_API_KEY")
COMPOSIO_USER_ID = os.getenv("COMPOSIO_USER_ID")


def get_llm():
    """Get the LLM based on active provider in DB or available config."""
    # 1. Try active provider from database (highest priority)
    active_provider = get_active_provider()
    if active_provider:
        print(
            f"Using active provider: {active_provider['name']} ({active_provider['model']}) via {active_provider['base_url']}..."
        )
        return ChatOpenAI(
            model=active_provider["model"],
            api_key=active_provider.get("api_key") or "dummy-key",
            base_url=active_provider["base_url"],
            streaming=True,
        )

    # 2. Fallback to generic environment variables
    MODEL_NAME = os.getenv("MODEL_NAME")
    LLM_API_KEY = os.getenv("LLM_API_KEY")
    BASE_URL = os.getenv("BASE_URL")

    if MODEL_NAME and LLM_API_KEY:
        print(
            f"Using custom model from env: {MODEL_NAME} (Base URL: {BASE_URL or 'Default OpenAI'})..."
        )
        return ChatOpenAI(
            model=MODEL_NAME,
            api_key=LLM_API_KEY or "dummy-key",
            base_url=BASE_URL,
            streaming=True,
        )

    # 3. Fallback to specific providers
    if OPENAI_API_KEY:
        print("Using OpenAI GPT-4o model...")
        return ChatOpenAI(model="gpt-4o", streaming=True)
    elif GOOGLE_API_KEY:
        print("Using Gemini 1.5 Flash model...")
        return ChatGoogleGenerativeAI(model="gemini-1.5-flash", streaming=True)
    else:
        raise ValueError(
            "No active AI provider in database and no environment variables (MODEL_NAME, OPENAI_API_KEY, or GOOGLE_API_KEY) are set."
        )


INSTRUCTIONS = (
    "You are AutoAgent, an intelligent executing AI assistant with access to 500+ applications through Composio.\n\n"
    "## CRITICAL INSTRUCTION: ACT, DO NOT NARRATE\n"
    "- NEVER say 'I will help you check', 'Let me first search', 'I am using the X tool', or 'Here are the results'.\n"
    "- NEVER explain what tools you are about to use or what you just did.\n"
    "- ONLY output the final, polished results of your actions.\n"
    "- If you need to perform an action, simply do it using the provided tools, and then present the data directly to the user.\n"
    "- Act as a direct, professional system. Output answers immediately without conversational filler.\n\n"
    "## Text Generation Rules - NEVER Split Words\n"
    "**You MUST generate text WITHOUT inserting spaces within words:**\n"
    "- CORRECT: 'Gmail', 'Outlook', 'authentication', 'authorize', 'connection', 'email'\n"
    "- WRONG: 'G mail', 'O utlook', 'a uthentication', 'Author ize', 'connec tion', 'e mail'\n"
    "- NEVER add spaces before punctuation marks (.,!?;:)\n\n"
    "## Response Formatting Standards\n"
    "Always format responses using proper Markdown:\n"
    "- **CRITICAL**: Use DOUBLE NEWLINES (`\\n\\n`) between EVERY paragraph, header, and list item.\n"
    "- Bullet points (`- `) and numbered lists (`1. `) MUST be separated by blank lines from surrounding text.\n"
    "- Proper link formatting: [Connect to AppName](https://url) - descriptive text, NEVER empty brackets\n"
    "- Headings (##, ###) ALWAYS start on a new line with a blank line above.\n\n"
    "## Authentication & Connection Management\n"
    "**CRITICAL - Link Formatting Rules:**\n"
    "- OAuth/auth links MUST use descriptive text: [Connect to AppName](url)\n"
    "- NEVER use empty brackets [](url) or raw URLs without link text\n\n"
    "## Tool Usage Rules\n"
    "1. Need to use an app/service? CALL `COMPOSIO_SEARCH_TOOLS` first to find and load the specific tools needed.\n"
    "2. Connection status -> Call `COMPOSIO_MANAGE_CONNECTIONS` to check if you are authenticated or need a new link.\n"
    "3. Missing instance config (Salesforce URL, etc.)? Call `REQUEST_USER_INPUT` to ask the user.\n"
    "Execute silently and output only the polished, final response."
)

from langchain.tools import tool


@tool
def REQUEST_USER_INPUT(prompt: str) -> str:
    """
    Use this tool ONLY when you need specific configuration from the user that is not yet provided.
    Examples: Pipedrive subdomain, Salesforce instance URL, Jira Server URL.
    The message returned will be shown to the user.
    """
    return f"PENDING_USER_INPUT: {prompt}"


# Initialize Composio with LangChain Provider
composio_client = Composio(api_key=COMPOSIO_API_KEY, provider=LangchainProvider())


def get_agent_executor(user_id: str = COMPOSIO_USER_ID):
    """
    Creates a LangChain AgentExecutor for the given user_id.
    Optimized: Reuses sessions and uses Meta Tools to keep context small and fast.
    """
    print(f"Initializing optimized LangChain agent for user: {user_id}...")

    # 1. Reuse existing session if available
    existing_session_id = get_composio_session(user_id)
    session = None

    if existing_session_id:
        try:
            print(f"Retrieving existing Composio session: {existing_session_id}")
            # Correct way to get an existing session in this SDK version
            session = composio_client.client.tool_router.session(
                session_id=existing_session_id
            )
        except Exception as e:
            print(f"⚠️ Failed to retrieve session {existing_session_id}: {e}")

    if session is None:
        try:
            print("Creating new Composio session...")
            # Pass meta-tools at creation time to the 'tools' parameter
            # In Tool Router, meta-tools are under the 'composio' toolkit
            session = composio_client.create(
                user_id=user_id,
                tools={
                    "composio": ["COMPOSIO_SEARCH_TOOLS", "COMPOSIO_MANAGE_CONNECTIONS"]
                },
            )
            save_composio_session(user_id, session.session_id)
        except Exception as e:
            print(f"⚠️ Session creation failed: {e}")
            # Last resort fallback: create minimal session
            session = composio_client.create(user_id=user_id)
            save_composio_session(user_id, session.session_id)

    # 2. Get tools from the session
    # session.tools() without arguments should return the tools configured during create()
    composio_tools = session.tools()

    # Combine with our custom management tools
    tools = [REQUEST_USER_INPUT] + composio_tools

    llm = get_llm()

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", INSTRUCTIONS),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ]
    )

    # Create the agent using create_openai_tools_agent
    agent = create_openai_tools_agent(llm, tools, prompt)

    # Create the executor
    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=True,
        handle_parsing_errors=True,
        max_iterations=15,
    )

    return executor


# Export a placeholder, will be initialized per-request in main.py for reliability
root_agent = None

print("\nAutoAgent setup complete with LangChain. Optimized for Composio Tool Router.")
