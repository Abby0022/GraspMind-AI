# 🧠 GraspMind AI

> AI-Powered Study Platform — Your personal AI tutor that understands your course materials.

Built 100% on free & open-source tools. $0/month to run.

## Quick Start

### Prerequisites

- **Docker Desktop** — for Redis + Qdrant
- **Node.js 24+** — for the frontend
- **Python 3.13+** — for the backend
- **uv** — Python package manager (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Ollama** (optional) — for local LLM inference

### 1. Clone & Configure

```bash
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, JWT_SECRET
# Optional: GROQ_API_KEY, GOOGLE_API_KEY
```

### 2. Start Services

```bash
docker-compose up -d   # Redis + Qdrant
```

### 3. Backend

```bash
cd backend
uv sync                          # Install dependencies
uv run uvicorn graspmind.main:app --reload --port 8000
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

### 5. Open

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API Docs | http://localhost:8000/docs (debug mode only) |
| Qdrant Dashboard | http://localhost:6333/dashboard |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind CSS, shadcn/ui, Zustand |
| Backend | FastAPI, Python 3.13, uv |
| Database | Supabase (Postgres + Auth + Storage) |
| Vector DB | Qdrant 1.17 |
| LLM | Groq (Llama 3.3 70B) + Ollama fallback |
| Embeddings | Google Gemini Embedding 2 |
| RAG | LlamaIndex + Hybrid Agentic RAG |
| Task Queue | Taskiq + Redis |
| Hosting | Vercel (frontend) + Railway (backend) |

## License

MIT
