# GraspMind AI - Product Roadmap & Architecture Plan

This roadmap outlines the phased evolution of GraspMind AI into a world-class, intelligent study platform. The architecture is explicitly designed to remain **100% free to operate** by utilizing generous cloud free-tiers, while maintaining enterprise-grade security, privacy, and speed.

## 🛡️ Core Constraints & Architecture (The "$0, Fast, Secure" Foundation)

**Cloud Service Stack (All Free Tiers):**
* **Frontend (Next.js):** Vercel - Edge caching, fast global CDN.
* **Backend (FastAPI):** Render/Koyeb - Container hosting for the Python backend.
* **Database & Auth:** Supabase - PostgreSQL, GoTrue Auth, and S3-compatible storage.
* **Vector Database:** Qdrant Cloud - 1GB free cluster.
* **Asynchronous Tasks:** Upstash - Free serverless Redis for Taskiq background workers.
* **LLM Inference:** Groq (Llama 3) for fast/free conversational AI, plus Google AI Studio (Gemini 1.5 Flash) for embeddings and multi-modal tasks.

**Security & Privacy Baseline:**
* **Zero-Data-Retention AI:** Explicit non-training policies enforced on API boundaries.
* **Multi-tenant Isolation:** Supabase Row-Level Security (RLS) policies force hard isolation at the database kernel level.
* **Data Minimization:** No unnecessary PII stored outside the Auth provider.

---

## 📅 Execution Plan

### Phase 1: Performance, Reliability & Offline PWA (Weeks 1-2)
*Goal: Guarantee a lightning-fast, crash-proof user experience under all network conditions.*
- [ ] **Task 1.1: PWA Integration (Offline Support)**: Implement `next-pwa` to cache the app shell, allowing students to view Knowledge Profiles and previously cached Flashcards offline.
- [ ] **Task 1.2: Fallback LLM Mesh**: Implement automatic retry-and-fallback logic (Groq -> Gemini -> local Ollama).
- [ ] **Task 1.3: Background Task Hardening**: Add dead-letter queues to Taskiq for large PDF parsing failures.
- [ ] **Security**: Implement Rate Limiting via Redis on all API gateways.

### Phase 2: Advanced Pedagogy & Active Recall Engine (Weeks 3-4)
*Goal: Transition from a passive "chat" app to a proactive, method-driven tutor.*
- [ ] **Task 2.1: Exam-Date Spaced Repetition (SRS)**: Calculate `next_review` schedules based on user-defined exam dates.
- [ ] **Task 2.2: Feynman Technique Mode**: AI roleplays as a confused student, user must explain concepts.
- [ ] **Task 2.3: Adaptive Quiz Engine (IRT)**: Generate question difficulty dynamically based on current mastery scores.

### Phase 3: Multi-Modal Ingestion & Edge Ecosystem (Weeks 5-6)
*Goal: Allow students to ingest knowledge from anywhere with zero friction.*
- [ ] **Task 3.1: Vision & Audio Support**: Gemini 1.5 Flash Vision for handwritten notes and Whisper for voice chat.
- [ ] **Task 3.2: Universal Browser Extension**: Chrome/Firefox extension for highlighting web text directly into Notebooks.
- [ ] **Security**: Strict pre-signed URLs via Supabase Storage with rapid expiration.

### Phase 4: Knowledge Graphs & Collaborative Study (Weeks 7-8)
*Goal: Synthesize information visually and enable secure group learning.*
- [ ] **Task 4.1: Cross-Notebook GraphRAG**: Extract named entities and map concepts visually using `@xyflow/react`.
- [ ] **Task 4.2: Secure Study Groups**: Evolve Supabase RLS to allow cryptographic invite links for group Notebooks.

---
*Roadmap generated: May 2026*
