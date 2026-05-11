# 🧠 GraspMind AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

**GraspMind AI** is an intelligent, high-density study platform designed to transform passive reading into active mastery. It leverages Retrieval-Augmented Generation (RAG) and agentic AI to help students organize, analyze, and retain information from their course materials.

> **The $0/month Philosophy:** This entire stack is explicitly designed to run on the generous free tiers of Vercel, Supabase, Qdrant, and Groq/Gemini, making it enterprise-grade yet accessible to every student.

---

## ✨ Key Features

- **📂 Agentic Notebooks:** Create dedicated spaces for subjects. Upload PDFs, DOCX, and text files.
- **💬 Contextual Chat:** Talk to your documents. Ask complex questions and get answers grounded in your specific materials.
- **🧠 Active Recall Engine:**
  - **Adaptive Quizzes:** AI-generated assessments based on your notes.
  - **Feynman Mode:** AI roleplays as a confused peer; you master the concept by explaining it.
  - **SRS Integration:** Spaced Repetition schedules calculated around your real exam dates.
- **🕸️ Knowledge Graph:** Visualize connections between concepts across multiple notebooks.
- **🛡️ BYOK (Bring Your Own Key):** Connect your own LLM providers (Groq, Gemini, Ollama) for maximum privacy and cost control.

---

## 🛠️ Technical Stack

| Layer | Technology | Why? |
|-------|------------|------|
| **Frontend** | [Next.js 15+](https://nextjs.org/) | App Router, Server Components, and Edge performance. |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) | High-performance Python async API. |
| **Database** | [Supabase](https://supabase.com/) | Postgres, Row-Level Security (RLS), and secure Auth. |
| **Vector Store** | [Qdrant](https://qdrant.tech/) | Production-grade vector search for RAG. |
| **AI Orchestration** | [LlamaIndex](https://www.llamaindex.ai/) | Advanced data ingestion and retrieval pipelines. |
| **Task Queue** | [Taskiq](https://taskiq.py) + Redis | Asynchronous background processing for heavy ingestion. |

---

## 🚀 Getting Started

### Prerequisites

- **Docker Desktop** (for Redis & Qdrant)
- **Node.js 24+**
- **Python 3.13+**
- **uv** — Fast Python package manager ([Installation Guide](https://astral.sh/uv/install.sh))

### 1. Repository Setup

```bash
git clone https://github.com/Abby0022/GraspMind-AI.git
cd GraspMind-AI
cp .env.example .env
```

### 2. Infrastructure

```bash
docker-compose up -d  # Launches local Redis and Qdrant
```

### 3. Backend Implementation

```bash
cd backend
uv sync
uv run uvicorn graspmind.main:app --reload --port 8000
```

### 4. Frontend Implementation

```bash
cd frontend
npm install
npm run dev
```

---

## ⚙️ Configuration

GraspMind AI requires several environment variables to be set in your `.env` file:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL. |
| `SUPABASE_ANON_KEY` | Public key for frontend auth. |
| `GROQ_API_KEY` | (Optional) For high-speed Llama 3.3 inference. |
| `GOOGLE_API_KEY` | (Required) For Gemini 1.5 Flash embeddings. |
| `JWT_SECRET` | 256-bit secret for backend authentication. |

---

## 🛡️ Security & Privacy

- **Row-Level Security (RLS):** All data access is enforced at the database level. No user can ever see another's notebooks.
- **Data Isolation:** Vector embeddings are tagged with user IDs to prevent cross-tenant information leakage.
- **No Training:** We explicitly use providers and models with zero-retention policies.

---

## 🗺️ Roadmap

Check out the full [ROADMAP.md](./ROADMAP.md) for planned features like **Vision Support**, **Browser Extensions**, and **Collaborative Study Groups**.

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

*Built with ❤️ for students who want to study smarter, not harder.*
