# GraspMind AI — Backend

> FastAPI backend powering the GraspMind AI study platform. Handles RAG ingestion, streaming chat, spaced-repetition, quizzes, flashcards, the Teacher Portal, and multi-provider LLM routing.

![Python 3.13+](https://img.shields.io/badge/Python-3.13+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)
![uv](https://img.shields.io/badge/Packager-uv-DE5FE9?logo=python&logoColor=white)

---

## Overview

The backend is a **FastAPI** application (Python 3.13) using `uv` for dependency management. It exposes a versioned REST API (`/api/v1/...`) and a **WebSocket** endpoint for real-time streaming chat.

A separate **Taskiq** worker process handles long-running background jobs (document ingestion, episodic memory extraction, Feynman technique scaffolding) so the API never blocks on heavy I/O.

---

## 📁 Source Structure

```
backend/
├── src/graspmind/
│   ├── main.py                  # App factory — registers routes, middleware, error handlers
│   ├── config.py                # Pydantic-settings; all env vars validated at startup
│   ├── supabase_client.py       # Singleton async Supabase service client
│   │
│   ├── api/
│   │   ├── deps.py              # FastAPI dependencies (auth user, supabase clients)
│   │   ├── routes/              # 16 REST route modules (one file per domain)
│   │   │   ├── auth.py          # signup, login, logout, refresh, /me
│   │   │   ├── notebooks.py     # CRUD for notebooks
│   │   │   ├── sources.py       # File upload, source listing/deletion
│   │   │   ├── chat.py          # Chat session management (REST)
│   │   │   ├── flashcards.py    # Flashcard CRUD + SRS review endpoint
│   │   │   ├── quizzes.py       # Quiz generation + submission
│   │   │   ├── history.py       # Chat history retrieval
│   │   │   ├── knowledge.py     # Knowledge graph data + mastery scores
│   │   │   ├── sessions.py      # Study session tracking
│   │   │   ├── providers.py     # BYOK key management + provider catalog
│   │   │   ├── notifications.py # Notification list, mark-read, delete
│   │   │   ├── compliance.py    # GDPR/FERPA export + deletion
│   │   │   ├── classes.py       # Teacher: class CRUD, members, sections, staff
│   │   │   ├── assignments.py   # Teacher: assignment CRUD, submissions, integrity alerts
│   │   │   └── analytics.py     # Teacher: per-class and per-student analytics
│   │   └── websockets/
│   │       └── chat.py          # WebSocket: streaming RAG chat handler
│   │
│   ├── rag/                     # Full RAG pipeline
│   │   ├── pipeline.py          # Orchestrator: chunk → embed → upsert
│   │   ├── chunker.py           # Hierarchical parent-child chunking
│   │   ├── embedder.py          # Google Gemini embedding calls (async, batched)
│   │   ├── vector_store.py      # Qdrant collection management + upsert/query
│   │   ├── hybrid_retriever.py  # Combines dense + BM25 results
│   │   ├── retriever.py         # Qdrant dense retriever
│   │   ├── bm25.py              # BM25 keyword retriever (in-memory)
│   │   ├── fusion.py            # Reciprocal Rank Fusion algorithm
│   │   ├── reranker.py          # Cross-encoder reranker (LLM-based)
│   │   ├── query_rewriter.py    # Multi-query expansion + HyDE
│   │   ├── prompt_builder.py    # System prompt + context assembly
│   │   └── llm_client.py        # Unified async LLM caller (streaming + non-streaming)
│   │
│   ├── study/
│   │   ├── flashcard_generator.py  # LLM-powered flashcard generation
│   │   ├── quiz_generator.py       # LLM-powered quiz generation
│   │   └── spaced_repetition.py    # SM-2 algorithm + Cram Mode scheduler
│   │
│   ├── memory/
│   │   ├── episodic.py          # Episodic memory: per-session conversation history
│   │   ├── semantic.py          # Semantic memory: long-term knowledge extraction
│   │   ├── working.py           # Working memory: in-context recent facts
│   │   └── knowledge_extractor.py # Extracts structured knowledge from conversations
│   │
│   ├── providers/
│   │   ├── registry.py          # 14+ provider specs (slug, base_url, models, auth format)
│   │   └── resolver.py          # BYOK resolver: picks and decrypts the right key at runtime
│   │
│   ├── parsers/
│   │   ├── pdf.py               # PyMuPDF — extracts text + page metadata
│   │   ├── docx.py              # python-docx — extracts headings + body
│   │   ├── slides.py            # python-pptx — extracts slide text
│   │   ├── text.py              # Plain text / markdown
│   │   └── image.py             # Image description via Gemini Vision
│   │
│   ├── security/
│   │   ├── middleware.py        # CORS, CSP, HSTS, trusted host config
│   │   ├── auth.py              # JWT validation; extracts AuthUser from cookie
│   │   ├── rate_limiter.py      # Redis Lua-script rate limiter (FastAPI Depends)
│   │   ├── rbac.py              # Role-based access control decorators
│   │   ├── vault.py             # AES-256-GCM encryption/decryption for API keys
│   │   ├── input_sanitizer.py   # bleach-based HTML sanitizer
│   │   └── key_sanitizer.py     # Strips/validates LLM API key format
│   │
│   ├── workers/
│   │   ├── broker.py            # Taskiq Redis broker setup
│   │   ├── ingestion.py         # Parse → chunk → embed → Qdrant (background task)
│   │   ├── episodic_worker.py   # Post-session episodic memory extraction
│   │   └── feynman_worker.py    # Feynman technique AI scaffolding
│   │
│   ├── models/
│   │   └── schemas.py           # All Pydantic request/response schemas
│   │
│   └── errors/                  # Typed exception hierarchy + FastAPI handlers
│
├── tests/                       # pytest test suite
├── pyproject.toml               # Project metadata + dependencies (uv)
└── render.yaml                  # One-click Render deployment (API + worker + Redis)
```

---

## 🌐 API Reference

All routes are prefixed with `/api/v1`. The API docs are available at `/docs` (only in `DEBUG=true` mode).

### Authentication — `/api/v1/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/signup` | — | Register (student or teacher via invite code) |
| `POST` | `/auth/login` | — | Email + password → HttpOnly cookies |
| `POST` | `/auth/logout` | ✅ | Clear auth cookies + invalidate Supabase session |
| `POST` | `/auth/refresh` | — | Refresh access token using refresh cookie |
| `GET` | `/auth/me` | ✅ | Current user profile (DB-authoritative role) |

> Tokens are stored in `HttpOnly; Secure; SameSite=Lax` cookies — never returned in JSON bodies to the browser.

### Notebooks — `/api/v1/notebooks`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notebooks/` | List all notebooks for current user |
| `POST` | `/notebooks/` | Create notebook (title, subject, colour, exam_date) |
| `GET` | `/notebooks/{id}` | Get notebook detail |
| `PATCH` | `/notebooks/{id}` | Update notebook metadata |
| `DELETE` | `/notebooks/{id}` | Delete notebook + all sources and vectors |

### Sources (File Ingestion) — `/api/v1/sources`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sources/upload` | Upload file → triggers background ingestion |
| `GET` | `/sources/{notebook_id}` | List sources for a notebook |
| `DELETE` | `/sources/{id}` | Delete source + remove from Qdrant |

> Supported formats: PDF, DOCX, PPTX, TXT, PNG/JPG/WEBP

### Chat — `/api/v1/chat` + WebSocket

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/chat/sessions` | List chat sessions |
| `POST` | `/chat/sessions` | Create new chat session |
| `WS` | `/ws/chat/{session_id}` | **Streaming RAG chat** (WebSocket) |

**WebSocket message format:**
```json
// Client → Server
{ "message": "Explain Newton's laws", "notebook_id": "uuid", "mode": "chat" }

// Server → Client (stream)
{ "type": "token", "content": "Newton..." }
{ "type": "done", "sources": [...], "session_id": "uuid" }
```

### Flashcards — `/api/v1/flashcards`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/flashcards/generate` | AI-generate cards from a notebook |
| `GET` | `/flashcards/{notebook_id}` | List cards with SRS state |
| `PATCH` | `/flashcards/{id}/review` | Submit review quality (0–5) → SM-2 schedules next review |
| `DELETE` | `/flashcards/{id}` | Delete card |

### Quizzes — `/api/v1/quizzes`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/quizzes/generate` | AI-generate quiz from a notebook |
| `GET` | `/quizzes/{notebook_id}` | List quizzes |
| `POST` | `/quizzes/{id}/submit` | Submit answers → returns score + explanations |

### Knowledge & History

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/knowledge/{notebook_id}` | Knowledge graph nodes + mastery scores |
| `GET` | `/history/{session_id}` | Full chat history for a session |

### Providers (BYOK) — `/api/v1/providers`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/providers/` | List all supported providers + default models |
| `POST` | `/providers/keys` | Save encrypted API key for a provider |
| `GET` | `/providers/keys` | List saved provider key slots (masked) |
| `DELETE` | `/providers/keys/{provider}` | Delete a saved key |

### Teacher Portal — `/api/v1/classes` & `/api/v1/assignments`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/classes` | List teacher's classes |
| `POST` | `/classes` | Create class |
| `GET` | `/classes/{id}` | Class detail + sections |
| `PATCH` | `/classes/{id}` | Update class |
| `DELETE` | `/classes/{id}` | Delete class |
| `PATCH` | `/classes/{id}/archive` | Archive class |
| `POST` | `/classes/{id}/clone` | Clone class structure |
| `GET` | `/classes/{id}/members` | Student roster |
| `PATCH` | `/classes/{id}/members/{student_id}` | Move student to section |
| `POST` | `/classes/{id}/sections` | Create section |
| `DELETE` | `/classes/{id}/sections/{section_id}` | Delete section |
| `GET` | `/classes/{id}/staff` | List staff/TA roles |
| `POST` | `/classes/{id}/staff` | Add staff with permissions |
| `DELETE` | `/classes/{id}/staff/{user_id}` | Remove staff |
| `GET` | `/classes/{id}/analytics` | Class analytics |
| `POST` | `/classes/join` | Student joins class by invite code |
| `GET` | `/classes/{id}/assignments` | List assignments |
| `POST` | `/classes/{id}/assignments` | Create assignment |
| `GET` | `/assignments/{id}` | Assignment detail + student submission |
| `PATCH` | `/assignments/{id}/submit` | Student submits / updates status + score |
| `POST` | `/assignments/submissions/{id}/alert` | Record integrity alert event |
| `GET` | `/assignments/{id}/submissions` | Teacher: all submissions for assignment |

### Notifications & Compliance

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notifications/` | List notifications |
| `PATCH` | `/notifications/{id}` | Mark read |
| `POST` | `/notifications/read-all` | Mark all read |
| `DELETE` | `/notifications/{id}` | Delete notification |
| `GET` | `/compliance/export` | GDPR/FERPA data export |
| `DELETE` | `/compliance/delete-account` | Full account deletion |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (no auth) |
| `GET` | `/` | Root status check |

---

## ⚙️ Configuration

All settings are read from environment variables (or `.env` file) and validated at startup by `pydantic-settings`.

| Variable | Default | Required | Description |
|---|---|---|---|
| `SUPABASE_URL` | — | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | — | ✅ | Supabase publishable key |
| `SUPABASE_SERVICE_KEY` | — | ✅ | Supabase service role key (backend only) |
| `GOOGLE_API_KEY` | — | ✅ | Google AI Studio key (embeddings) |
| `GROQ_API_KEY` | — | ✅ (default LLM) | Groq API key |
| `JWT_SECRET` | — | ✅ | Min 256-bit secret for JWT validation |
| `QDRANT_URL` | `http://localhost:6333` | ✅ | Qdrant instance URL |
| `QDRANT_API_KEY` | — | Cloud only | Qdrant cloud API key |
| `REDIS_URL` | `redis://localhost:6379` | ✅ | Redis connection string |
| `DEBUG` | `false` | — | Enables `/docs` and `/redoc` endpoints |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | — | Comma-separated CORS origins |
| `LLM_PROVIDER` | `groq` | — | Default LLM provider slug |
| `LLM_MODEL` | `llama-4-scout` | — | Default model for the LLM provider |
| `LLM_TIMEOUT` | `60.0` | — | LLM request timeout (seconds) |
| `EMBEDDING_MODEL` | `gemini-embedding-2` | — | Embedding model name |
| `EMBEDDING_DIMENSIONS` | `3072` | — | Vector dimensions (3072/768/256) |
| `RATE_LIMIT_CHAT` | `60` | — | Requests/minute for chat |
| `RATE_LIMIT_UPLOAD` | `10` | — | Requests/minute for file upload |
| `VAULT_MASTER_KEY` | — | BYOK only | 64-char hex (32 bytes) for AES-256-GCM |
| `TEACHER_INVITE_CODE` | — | Teacher portal | Server-side invite code for teacher signup |

---

## 🔐 Security Architecture

### Authentication Flow
```
Browser sends credentials
  → FastAPI sets HttpOnly Secure cookies (access_token 1h, refresh_token 7d)
  → JWT validated on every request by security/auth.py
  → Role fetched from public.users (DB), never from JWT metadata
  → Redis caches user profile for 15 minutes to reduce DB calls
```

### Rate Limiter
Uses a Redis **Lua atomic script** (get + increment + expire in one round-trip) to prevent race conditions. Applied as FastAPI `Depends()`:

```python
# 60 requests per minute per user
@router.post("/chat", dependencies=[Depends(RateLimiter(max_requests=60, window_seconds=60))])
```

### BYOK Vault
```python
# Encrypt before storage
ciphertext = vault.encrypt(plaintext_api_key)  # AES-256-GCM
supabase.table("provider_keys").insert({"ciphertext": ciphertext})

# Decrypt at runtime in resolver.py
key = vault.decrypt(row["ciphertext"])
```

### RBAC
```python
# Route-level guard
@router.get("/classes/{id}/analytics")
async def get_analytics(user: AuthUser = Depends(require_teacher)):
    ...
```

---

## 🧠 RAG Pipeline — Deep Dive

### Chunking Strategy
- **Parent chunks** — large semantic blocks (~1024 tokens) for context
- **Child chunks** — small focused chunks (~256 tokens) for precise retrieval
- Child chunks store a `parent_id` so the full context can be fetched after retrieval

### Retrieval Strategy
1. **Query Rewriting** — expands the user query into multiple sub-queries (HyDE)
2. **Dense retrieval** — Qdrant cosine similarity on 3072-dim Gemini embeddings
3. **BM25 retrieval** — keyword-based TF-IDF over the same corpus
4. **Fusion** — Reciprocal Rank Fusion merges both ranked lists
5. **Reranking** — Cross-encoder re-scores top candidates by relevance

### Supported LLM Providers (14)
| Provider | Free Tier | Notable Models |
|---|---|---|
| Groq | ✅ | llama-4-scout, llama-3.3-70b-versatile |
| Google Gemini | ✅ | gemini-3.1-flash, gemini-3.1-pro |
| OpenAI | ❌ | gpt-5.5, gpt-4o, o3-mini |
| Anthropic | ❌ | claude-4-7-sonnet, claude-4-7-opus |
| Mistral AI | ❌ | mistral-large-v4, mistral-small-v4 |
| Together AI | ✅ (limited) | llama-4-scout, qwen3-72b |
| Fireworks AI | ✅ (limited) | llama-v4-scout |
| OpenRouter | ✅ | aggregates 100s of models |
| DeepSeek | ❌ | deepseek-v4-pro, deepseek-reasoner |
| xAI (Grok) | ❌ | grok-4.3, grok-4-mini |
| Cerebras | ✅ (limited) | llama-4-scout |
| Perplexity | ❌ | sonar-pro, sonar-reasoning-pro |
| Cohere | ❌ | command-r-v2 |
| Ollama | ✅ (local) | llama4, phi4, gemma4 |

---

## 📚 Study Engine

### Spaced Repetition (SM-2)
`study/spaced_repetition.py` implements the **SuperMemo-2** algorithm:
- Students rate recall quality 0–5 after each card
- SM-2 adjusts `ease_factor`, `interval`, and `next_review` accordingly
- **Cram Mode** activates when an exam is ≤ 7 days away — overrides SM-2 to prioritise STRUGGLING and LEARNING cards regardless of interval

### Flashcard Generation
- Pulls top relevant chunks from Qdrant for the notebook
- Builds a structured prompt asking the LLM for Q&A pairs in a specific JSON schema
- Validates and stores cards with initial SRS state

### Quiz Generation
- Same RAG context retrieval as flashcards
- Generates multiple-choice questions with a correct answer + distractors + explanation
- Submitted answers are scored server-side; results stored per student

---

## 🔄 Background Workers

| Worker | Trigger | Task |
|---|---|---|
| `ingestion.py` | File upload → Taskiq task | Parse → chunk → embed → Qdrant |
| `episodic_worker.py` | Session end | Extract episodic memories from chat |
| `feynman_worker.py` | Feynman mode activation | Generate AI "confused student" prompts |

Workers use Taskiq with a Redis broker. On Render, the worker is deployed as a separate process (`render.yaml`).

---

## 🛠️ Development

### Setup
```bash
cd backend
uv sync --group dev
```

### Run (development)
```bash
uv run uvicorn graspmind.main:app --reload --port 8000
```

### Linting & Formatting
```bash
uv run ruff check src/          # Lint
uv run ruff format src/         # Format
uv run bandit -r src/           # Security scan
```

### Tests
```bash
uv run pytest tests/ -v --cov=src/graspmind
```

### API Docs
With `DEBUG=true`, visit:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 🚢 Deployment (Render)

The `render.yaml` in the repo root defines:

```yaml
services:
  - type: web          # FastAPI API
    name: graspmind-api
    startCommand: "cd backend && uv run uvicorn graspmind.main:app --host 0.0.0.0 --port $PORT"

  - type: worker       # Taskiq background worker
    name: graspmind-worker
    startCommand: "cd backend && uv run taskiq worker graspmind.workers.broker:broker ..."

  - type: redis        # Managed Redis
    name: graspmind-redis
```

**Required secrets** in the Render `graspmind-secrets` env group:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- `GOOGLE_API_KEY`
- `JWT_SECRET` (auto-generated by Render)
- `GROQ_API_KEY` (or another default LLM key)
- `QDRANT_URL`, `QDRANT_API_KEY` (Qdrant Cloud)
- `VAULT_MASTER_KEY` (for BYOK encryption)
- `TEACHER_INVITE_CODE` (optional)
