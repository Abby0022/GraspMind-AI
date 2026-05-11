-- Quiz system tables for Grasp
-- Adds quizzes, quiz_questions with SM-2 spaced repetition fields

-- ── Quizzes table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quizzes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Quiz',
    question_count INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL DEFAULT 'mixed',
    score NUMERIC(5,1),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own quizzes"
    ON public.quizzes FOR ALL
    USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_quizzes_user ON public.quizzes(user_id);
CREATE INDEX idx_quizzes_notebook ON public.quizzes(notebook_id);

-- ── Quiz Questions table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    question_type TEXT NOT NULL DEFAULT 'mcq',
    correct_answer TEXT NOT NULL,
    options JSONB DEFAULT '[]'::jsonb,
    explanation TEXT DEFAULT '',
    source_title TEXT DEFAULT '',
    page_num INTEGER,
    difficulty TEXT NOT NULL DEFAULT 'medium',

    -- SM-2 spaced repetition fields
    ease_factor NUMERIC(4,2) DEFAULT 2.50 NOT NULL,
    interval INTEGER DEFAULT 0 NOT NULL,
    repetitions INTEGER DEFAULT 0 NOT NULL,
    next_review TIMESTAMPTZ,
    last_reviewed TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

-- RLS via quiz ownership
CREATE POLICY "Users can manage questions via quiz ownership"
    ON public.quiz_questions FOR ALL
    USING (
        quiz_id IN (
            SELECT id FROM public.quizzes
            WHERE (SELECT auth.uid()) = user_id
        )
    );

CREATE INDEX idx_quiz_questions_quiz ON public.quiz_questions(quiz_id);
CREATE INDEX idx_quiz_questions_next_review ON public.quiz_questions(next_review);

-- Auto-update trigger for quizzes
CREATE TRIGGER set_quiz_updated_at
    BEFORE UPDATE ON public.quizzes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
