-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 009: Fix Missing Tables
-- Creates tables that existing backend routes already reference
-- but were never included in migrations 001–008.
-- ══════════════════════════════════════════════════════════════

-- ── Notebook Shares ─────────────────────────────────────────
-- Referenced in notebooks.py: list_notebooks, get_notebook,
-- share_notebook, list_notebook_shares
CREATE TABLE IF NOT EXISTS public.notebook_shares (
  notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  shared_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (notebook_id, user_id)
);
ALTER TABLE public.notebook_shares ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notebook_shares_user ON public.notebook_shares(user_id);

-- Notebook owner can manage all shares for their notebooks
CREATE POLICY "owner_manages_shares"
  ON public.notebook_shares FOR ALL
  USING (
    notebook_id IN (
      SELECT id FROM public.notebooks WHERE user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    notebook_id IN (
      SELECT id FROM public.notebooks WHERE user_id = (SELECT auth.uid())
    )
  );

-- Share recipient can read their own share record
CREATE POLICY "recipient_reads_own_share"
  ON public.notebook_shares FOR SELECT
  USING ((SELECT auth.uid()) = user_id);


-- ── Quizzes ─────────────────────────────────────────────────
-- Referenced in quizzes.py: generate_quiz, list_quizzes,
-- get_quiz, submit_quiz, get_due_reviews
-- NOTE: 002_quiz_system.sql has 'quiz_attempts' (JSONB blob design).
-- This is the normalised design the current route code actually uses.
CREATE TABLE IF NOT EXISTS public.quizzes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id    UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  question_count INT DEFAULT 0,
  difficulty     TEXT DEFAULT 'mixed' CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed')),
  score          FLOAT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_quizzes_user     ON public.quizzes(user_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_notebook ON public.quizzes(notebook_id);

CREATE POLICY "users_own_quizzes"
  ON public.quizzes FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── Quiz Questions ───────────────────────────────────────────
-- Referenced in quizzes.py: question insert, SM-2 state update
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id        UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question       TEXT NOT NULL,
  question_type  TEXT NOT NULL CHECK (question_type IN ('mcq', 'fill_blank', 'short_answer', 'true_false')),
  correct_answer TEXT NOT NULL,
  options        JSONB DEFAULT '[]',
  explanation    TEXT,
  source_title   TEXT,
  page_num       INT,
  difficulty     TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- SM-2 spaced repetition state
  ease_factor    FLOAT DEFAULT 2.5,
  interval       INT DEFAULT 0,
  repetitions    INT DEFAULT 0,
  next_review    DATE,
  last_reviewed  TIMESTAMPTZ
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);

-- Access scoped through the parent quiz's user_id
CREATE POLICY "users_own_quiz_questions"
  ON public.quiz_questions FOR ALL
  USING (
    quiz_id IN (
      SELECT id FROM public.quizzes WHERE user_id = (SELECT auth.uid())
    )
  );


-- ── Mastery Score Column on Notebooks ───────────────────────
-- Referenced in quizzes.py:submit_quiz mastery update path.
-- 007_mastery_score.sql may have added this already; use IF NOT EXISTS guard.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notebooks'
      AND column_name  = 'mastery_score'
  ) THEN
    ALTER TABLE public.notebooks ADD COLUMN mastery_score INT DEFAULT 0;
  END IF;
END;
$$;
