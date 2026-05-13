# GraspMind AI

> **The AI-powered study platform that transforms your documents into an active learning engine.**

![Python 3.13+](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![Supabase](https://img.shields.io/badge/Database-Supabase-3ECF8E?logo=supabase&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## What is GraspMind AI?

GraspMind AI is a full-stack, AI-native study platform. Students upload PDFs, DOCX, PPTX, and notes; the platform indexes them via a multi-stage **Retrieval-Augmented Generation (RAG)** pipeline. They can then chat with their material, generate flashcards, take adaptive quizzes, build knowledge graphs, and track mastery.

For educators, a **Teacher Portal** provides class management, assignment creation (with proctoring), analytics, and roster management.

The entire stack runs on **free cloud tiers** (Vercel + Render + Supabase + Qdrant Cloud + Upstash Redis) with enterprise-grade security.

---

## ✨ Key Features

### Students
- **Smart Notebooks** — Organise materials by subject with colour-coded notebooks
- **Multi-format Ingestion** — PDF, DOCX, PPTX, TXT, images — all indexed automatically
- **RAG Chat** — Hybrid semantic + BM25 retrieval with streaming responses via WebSocket
- **Flashcards + SRS** — AI-generated cards with the SuperMemo-2 scheduler + Cram Mode
- **Adaptive Quizzes** — LLM-generated quizzes grounded in your own material
- **Knowledge Graph** — Visual mind-map of concepts (`@xyflow/react`)
- **Feynman Mode** — AI plays confused student; you explain concepts to reinforce them
- **Mastery Tracking** — Per-concept mastery scores with progress ring
- **Scratchpad + Focus Timer** — Persistent notes and Pomodoro timer
- **PWA** — Installable, offline-capable

### Teachers
- **Class Management** — Create classes, generate invite codes, clone/archive courses
- **Assignment Builder** — Read, quiz, or flashcard assignments linked to any notebook
- **Proctored Assessments** — Full-screen enforcement + focus-loss integrity alerts
- **Analytics Dashboard** — Per-student mastery, quiz completion, weakest concepts
- **Staff Roles** — Add TAs with granular permission scopes

### Platform-wide
- **BYOK (Bring Your Own Key)** — 14+ LLM providers; keys encrypted with AES-256-GCM
- **Multi-tenant RLS** — PostgreSQL Row-Level Security — data can never leak across users
- **Redis Rate Limiting** — Atomic Lua-script limits on every endpoint
- **Audit Logs** — All security-significant events persisted to `audit_logs`
- **Compliance Vault** — GDPR/FERPA data export and deletion pipeline

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js 16 (Vercel)         FastAPI (Render)                │
│  App Router / React 19  ◄──► RAG Pipeline                    │
│  Tailwind v4 / Zustand   REST  Flashcards / SRS / Quiz       │
│  Framer Motion          + WS   Memory System                 │
│                                Taskiq Workers                 │
│                                14+ LLM Providers (BYOK)       │
├─────────────────┬───────────────────────┬────────────────────┤
│  Supabase       │  Qdrant Cloud         │  Redis (Upstash)   │
│  PostgreSQL+RLS │  Vector DB (3072-dim) │  Rate limit/Queue  │
│  GoTrue Auth    │                       │  Session cache      │
│  Storage (S3)   │                       │                    │
└─────────────────┴───────────────────────┴────────────────────┘
```

### Document Ingestion Flow
```
Upload → Supabase Storage
       → Taskiq worker (background)
       → Parser (PDF/DOCX/PPTX/TXT/Image)
       → Chunker (parent-child hierarchy)
       → Gemini Embeddings (3072-dim)
       → Qdrant upsert
       → source.status = "ready"
```

### RAG Chat Flow
```
User message (WebSocket)
  → Query Rewriter
  → BM25 retriever + Qdrant dense retriever
  → Reciprocal Rank Fusion
  → Cross-encoder Reranker
  → Prompt Builder (system + history + context)
  → LLM (BYOK-resolved provider)
  → Streaming tokens → WebSocket → UI
```

---

## 🗂️ Repository Layout

```
GraspMind-AI/
├── backend/                 # FastAPI Python backend (see backend/README.md)
│   ├── src/graspmind/
│   │   ├── api/routes/      # 16 REST route modules
│   │   ├── api/websockets/  # Streaming chat WebSocket
│   │   ├── rag/             # Full RAG pipeline (12 modules)
│   │   ├── study/           # Flashcards, quizzes, SM-2 SRS
│   │   ├── memory/          # Episodic, semantic, working memory
│   │   ├── providers/       # LLM provider registry + BYOK resolver
│   │   ├── security/        # Auth, RBAC, rate limiter, vault, middleware
│   │   ├── parsers/         # PDF, DOCX, PPTX, TXT, image
│   │   ├── workers/         # Taskiq async workers
│   │   └── main.py          # FastAPI application factory
│   ├── pyproject.toml
│   └── render.yaml          # One-click Render deployment
│
├── frontend/                # Next.js 16 frontend (see frontend/README.md)
│   ├── app/                 # App Router pages
│   │   ├── (auth)/          # Login / signup
│   │   ├── dashboard/       # Student dashboard
│   │   ├── notebook/[id]/   # Per-notebook study interface
│   │   ├── knowledge/       # Knowledge graph page
│   │   ├── classes/         # Student enrollment view
│   │   ├── teacher/         # Teacher portal
│   │   └── settings/        # BYOK provider settings
│   ├── components/          # Shared + role-specific components
│   ├── lib/                 # API client, Zustand store, Supabase helpers
│   └── next.config.ts       # Next.js + PWA + security headers
│
├── supabase/migrations/     # 24 ordered SQL migrations
├── docker-compose.yml       # Local dev: Redis + Qdrant
└── .env.example             # Environment variable template
```

---

## 🚀 Quick Start

### Prerequisites
- Python ≥ 3.13 + [`uv`](https://docs.astral.sh/uv/)
- Node.js ≥ 20 + npm
- Docker (for local Redis + Qdrant)
- [Supabase](https://supabase.com) project (free tier)
- [Google AI Studio](https://aistudio.google.com) API key (free embeddings)
- [Groq](https://console.groq.com) API key (free LLM inference)

### 1. Clone & Configure
```bash
git clone https://github.com/YOUR_USERNAME/GraspMind-AI.git
cd GraspMind-AI
cp .env.example backend/.env
```

Edit `backend/.env` — minimum required vars:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...
JWT_SECRET=<openssl rand -hex 32>
```

Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 2. Start Infrastructure
```bash
docker-compose up -d        # Redis :6379 + Qdrant :6333
```

### 3. Apply Database Migrations
Run each file in `supabase/migrations/` (001 → 024) in the Supabase SQL Editor.

### 4. Start the Backend
```bash
cd backend && uv sync
uv run uvicorn graspmind.main:app --reload --port 8000
```

In a second terminal (background workers):
```bash
cd backend
uv run taskiq worker graspmind.workers.broker:broker \
  graspmind.workers.ingestion \
  graspmind.workers.episodic_worker \
  graspmind.workers.feynman_worker
```

### 5. Start the Frontend
```bash
cd frontend && npm install && npm run dev
```

Open **http://localhost:3000** 🎉

---

## ⚙️ Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Zustand, Framer Motion |
| Backend | FastAPI, Python 3.13, Uvicorn, Pydantic v2 |
| Database | Supabase (PostgreSQL + RLS + GoTrue Auth + Storage) |
| Vector DB | Qdrant (3072-dim Gemini embeddings) |
| RAG | LlamaIndex Core, BM25, Hybrid Retrieval, Cross-encoder Reranking |
| LLM | 14 providers: Groq, Google Gemini, OpenAI, Anthropic, Mistral, DeepSeek, xAI, Cohere, Perplexity, Together, Fireworks, Cerebras, OpenRouter, Ollama |
| Cache/Queue | Redis + Taskiq (async background workers) |
| Security | HttpOnly cookies, AES-256-GCM vault, Redis rate limiting, RLS, RBAC, audit logs |
| Deployment | Vercel (frontend) + Render (backend + worker + Redis) |

---

## 🔐 Security Highlights

1. **HttpOnly Cookies** — Auth tokens never touch JavaScript; set by the FastAPI backend
2. **Server-side Role Assignment** — Teacher role validated via `hmac.compare_digest()` on a secret invite code; user input cannot influence DB role
3. **Row-Level Security** — Every PostgreSQL table has RLS policies — zero cross-tenant data leakage
4. **AES-256-GCM Vault** — BYOK provider keys encrypted before storage; vault master key never in DB
5. **Redis Rate Limiting** — Atomic Lua scripts on signup (5/10min), login (20/min), chat (60/min), upload (10/min)
6. **Security Headers** — HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy

---

## 🚢 Deployment

### Frontend (Vercel)
1. Import repo → set **root directory** to `frontend`
2. Add env vars (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_*`)
3. Deploy

### Backend (Render)
The root `render.yaml` defines three services: API, Worker, Redis.  
Connect your repo in Render → "Use render.yaml" → fill in the `graspmind-secrets` env group.

See [`backend/README.md`](backend/README.md) for full backend docs.

---

## 🗄️ Database Migrations (24 total)

| Range | Area |
|---|---|
| 001–009 | Core schema: users, notebooks, sources, sessions, quizzes, flashcards, memory, storage |
| 010–012 | Teacher portal: classes, members, assignments, RLS fixes |
| 013–014 | Performance indexes, security audit tables |
| 015–019 | BYOK vault, notifications, RBAC, key storage |
| 020–024 | Sections hierarchy, delegated security, proctoring, compliance vault, audit logs |

---

## 📄 License

MIT © 2026 GraspMind AI Inc. Built for students.
