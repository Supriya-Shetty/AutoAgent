# AutoAgent 🤖✨

<p align="center">
  <img src="https://img.shields.io/badge/UI-Premium_Zinc-09090b?style=for-the-badge" alt="UI Theme" />
  <img src="https://img.shields.io/badge/Admin-Secure-2563eb?style=for-the-badge" alt="Admin Dashboard" />
  <img src="https://img.shields.io/badge/Security-Firebase-FFCA28?style=for-the-badge&logo=firebase" alt="Firebase" />
  <img src="https://img.shields.io/badge/AI-Gemini_2.0-AE4C9E?style=for-the-badge" alt="Gemini" />
</p>

**AutoAgent** is a high-performance, premium AI assistant platform designed for the modern enterprise. It bridges the gap between natural language and complex workflows across 500+ SaaS applications with a sleek, technical aesthetic and industrial-grade security.

---

## ✨ Key Features

- **🎨 Premium UX (Anti-Slop Protocol)**: A stunning Zinc-based dark theme with editorial spacing, tactile micro-interactions, and Space Grotesk typography.
- **🛡️ Secure Admin Dashboard**: A standalone, protected interface to manage users, monitor usage statistics, and handle blocklists.
- **🔌 Enterprise Connectivity**: Out-of-the-box support for 500+ tools (GitHub, Slack, Salesforce, etc.) via a robust tool-routing engine.
- **🧠 Advanced Reasoning**: Built on Google's Gemini 2.0 Flash for low-latency, high-accuracy task execution.
- **⚡ Real-time Streaming**: Fluid, SSE-powered conversational interface for instant response visibility.

---

## 🛠️ Technology Stack

- **Backend**: Python (FastAPI) + Google Generative AI (ADK)
- **Frontend**: Vanila HTML5/JS + Custom Zinc Design System
- **Auth**: Firebase Authentication (Google/Email)
- **Database**: SQLite (SQLAlchemy) for persistence and usage tracking
- **Integrations**: Composio SDK for autonomous tool orchestration

---

## 🏁 Quick Start

### 1. Prerequisites
- Python 3.10+
- Firebase Project (with Web App & Service Account)
- API Keys: Google AI Studio, Composio

### 2. Environment Setup
Clone the repository and copy the example environment file:
```bash
cp .env.example .env
```
Open `.env` and fill in your keys. Follow the comments in `.env.example` for instructions on where to obtain each value.

### 3. Installation
```bash
pip install -r requirements.txt
```

### 4. Run the Platform
```bash
python main.py
```
Visit `http://localhost:8000` to start chatting.

---

## 🔐 Admin Dashboard

AutoAgent includes a comprehensive Admin Dashboard protected by email-based authorization.

### Adding Admins
To grant admin privileges, add the user's email to the `ADMIN_EMAILS` variable in your `.env`:
```env
ADMIN_EMAILS=your.email@example.com,another.admin@example.com
```

### Features
- **User Management**: View all registered users and their activity.
- **Security Control**: Block/Unblock users with a single click.
- **Analytics**: Visualize total logins, message volume, and daily growth trends.

---

## 📄 License
This project is proprietary. Ensure you have the necessary licenses for Firebase and Google Cloud services.

---

<p align="center">
  Built with precision for the technical age.
</p>
