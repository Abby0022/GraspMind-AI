-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 013: Performance Optimization Indexes
-- Adds indexes to foreign keys and status columns used in 
-- high-frequency filters.
-- ══════════════════════════════════════════════════════════════

-- ── Messages ────────────────────────────────────────────────
-- Speeds up retrieval of chat history by session_id
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);

-- ── Chat Sessions ───────────────────────────────────────────
-- Speeds up listing sessions for a specific notebook
CREATE INDEX IF NOT EXISTS idx_chat_sessions_notebook_id ON public.chat_sessions(notebook_id);

-- ── Sources ─────────────────────────────────────────────────
-- Speeds up background worker polling for pending/processing documents
CREATE INDEX IF NOT EXISTS idx_sources_status ON public.sources(status);

-- ── Chunks ──────────────────────────────────────────────────
-- Speeds up mapping vectors back to Postgres records
CREATE INDEX IF NOT EXISTS idx_chunks_qdrant_id ON public.chunks(qdrant_id);
