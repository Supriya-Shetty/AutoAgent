# OneChat ADK 🤖✨

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Python](https://img.shields.io/badge/python-3.10%2B-blue) ![Composio](https://img.shields.io/badge/Composio-Enabled-orange) ![Gemini](https://img.shields.io/badge/Gemini-2.0-AE4C9E)

**OneChat ADK** is a next-generation agentic AI application that bridges the gap between natural language and actionable workflows. Powered by **Google's Gemini 2.0 Flash** and **Composio's Tool Router**, it autonomously orchestrates complex tasks across 500+ SaaS applications.

---

## 🚀 Features

- **🧠 Advanced Cognitive Engine**: Leveraging `gemini-2.0-flash` for high-speed, reasoning-heavy task execution.
- **🔌 massive Connectivity**: Seamless interaction with GitHub, Slack, Gmail, Salesforce, and 500+ other tools via [Composio](https://composio.dev).
- **⚡ Real-time Streaming**: Instant feedback loop with Server-Sent Events (SSE) for a fluid conversational experience.
- **🎨 Modern Web Interface**: A sleek, responsive React-based UI (served via FastAPI) for effortless interaction.
- **🛡️ Robust Session Management**: Persistent chat history and context-aware execution using Google ADK.

## 🛠️ Architecture

OneChat is built on a robust, scalable stack:

- **Backend**: Python (FastAPI) + Google ADK + Composio SDK
- **Frontend**: OneChat modern web UI (Static HTML/JS/CSS)
- **Agent**: `composio_agent` executing autonomous multi-step workflows

## 🏁 Getting Started

### Prerequisites

- Python 3.10 or higher
- A [Composio API Key](https://composio.dev)
- A [Google AI Studio API Key](https://aistudio.google.com/)

### Installation

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/onechat-adk.git
    cd onechat-adk
    ```

2.  **Install Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

### Configuration

Create a `.env` file in the `composio_agent` directory:

```bash
# composio_agent/.env
GOOGLE_API_KEY=your_google_api_key
COMPOSIO_API_KEY=your_composio_api_key
COMPOSIO_USER_ID=your_unique_user_id
```

## 🏃‍♂️ Usage

1.  **Start the Server**
    ```bash
    uvicorn main:app --reload
    ```

2.  **Launch the UI**
    Open your browser and navigate to:
    `http://localhost:8000`

3.  **Chat & Create**
    Start chatting! Ask OneChat to "Star a repo on GitHub", "Draft an email in Gmail", or "Create a task in Asana".

## 🤝 Contributing

Contributions are welcome! Please check out the [issues](https://github.com/yourusername/onechat-adk/issues) or submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
