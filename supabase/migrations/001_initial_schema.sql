-- ══════════════════════════════════════════════════════════════
-- Grasp — Database Schema (Supabase Postgres)
-- Run this in the Supabase SQL Editor to create all tables.
-- RLS is enabled on EVERY table with user-scoped policies.
-- ══════════════════════════════════════════════════════════════

-- ── Users ───────────────────────────────────────────────────
-- Note: Supabase Auth creates auth.users automatically.
-- This is an application-level profile table.
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- ── Notebooks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT,
  color TEXT DEFAULT '#6366f1',
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notebooks_user ON public.notebooks(user_id);

CREATE POLICY "Users own notebooks"
  ON public.notebooks FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Sources ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf','docx','pptx','audio','youtube','web','markdown','image')),
  file_path TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sources_notebook ON public.sources(notebook_id);

CREATE POLICY "Users own sources via notebook"
  ON public.sources FOR ALL
  USING (
    notebook_id IN (
      SELECT id FROM public.notebooks WHERE user_id = (SELECT auth.uid())
    )
  );

-- ── Chunks ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_type TEXT NOT NULL CHECK (chunk_type IN ('parent','child')),
  parent_id UUID REFERENCES public.chunks(id),
  page_num INT,
  token_count INT,
  qdrant_id UUID
);
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_chunks_source ON public.chunks(source_id);

CREATE POLICY "Users own chunks via source → notebook"
  ON public.chunks FOR ALL
  USING (
    source_id IN (
      SELECT s.id FROM public.sources s
      JOIN public.notebooks n ON s.notebook_id = n.id
      WHERE n.user_id = (SELECT auth.uid())
    )
  );

-- ── Chat Sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  summary TEXT,
  message_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sessions_user ON public.chat_sessions(user_id);

CREATE POLICY "Users own chat sessions"
  ON public.chat_sessions FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Messages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  citations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own messages via session"
  ON public.messages FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.chat_sessions WHERE user_id = (SELECT auth.uid())
    )
  );

-- ── Quiz Attempts ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  topic TEXT,
  questions JSONB NOT NULL DEFAULT '[]',
  score FLOAT,
  duration INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own quiz attempts"
  ON public.quiz_attempts FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Flashcard Decks ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flashcard_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cards JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own flashcard decks"
  ON public.flashcard_decks FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Study Sessions (Episodic Memory) ────────────────────────
CREATE TABLE IF NOT EXISTS public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  topics_covered JSONB DEFAULT '[]',
  duration INT,
  tools_used JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own study sessions"
  ON public.study_sessions FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Student Knowledge (Semantic Memory + Spaced Rep) ────────
CREATE TABLE IF NOT EXISTS public.student_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  mastery_score FLOAT DEFAULT 0,
  ease_factor FLOAT DEFAULT 2.5,
  next_review DATE,
  last_reviewed TIMESTAMPTZ,
  UNIQUE(user_id, concept)
);
ALTER TABLE public.student_knowledge ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_knowledge_user ON public.student_knowledge(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_review ON public.student_knowledge(next_review);

CREATE POLICY "Users own knowledge records"
  ON public.student_knowledge FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Audit Log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  action TEXT NOT NULL,
  resource TEXT,
  ip_address INET,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log: users can read their own entries, only service role can write
CREATE POLICY "Users can read own audit log"
  ON public.audit_log FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ── Auto-update updated_at trigger ──────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER set_updated_at_notebooks
  BEFORE UPDATE ON public.notebooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
