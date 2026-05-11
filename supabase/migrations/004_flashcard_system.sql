-- Flashcard system tables for Grasp
-- Adds flashcard_decks and flashcards with SM-2 spaced repetition

CREATE TABLE IF NOT EXISTS public.flashcard_decks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled Deck',
    card_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own decks"
    ON public.flashcard_decks FOR ALL
    USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_flashcard_decks_user ON public.flashcard_decks(user_id);
CREATE INDEX idx_flashcard_decks_notebook ON public.flashcard_decks(notebook_id);

-- ── Flashcards table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.flashcards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    deck_id UUID NOT NULL REFERENCES public.flashcard_decks(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    card_type TEXT NOT NULL DEFAULT 'basic',
    tags JSONB DEFAULT '[]'::jsonb,

    -- SM-2 spaced repetition fields
    ease_factor NUMERIC(4,2) DEFAULT 2.50 NOT NULL,
    interval INTEGER DEFAULT 0 NOT NULL,
    repetitions INTEGER DEFAULT 0 NOT NULL,
    next_review TIMESTAMPTZ,
    last_reviewed TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage cards via deck ownership"
    ON public.flashcards FOR ALL
    USING (
        deck_id IN (
            SELECT id FROM public.flashcard_decks
            WHERE (SELECT auth.uid()) = user_id
        )
    );

CREATE INDEX idx_flashcards_deck ON public.flashcards(deck_id);
CREATE INDEX idx_flashcards_next_review ON public.flashcards(next_review);

-- Auto-update trigger
CREATE TRIGGER set_flashcard_deck_updated_at
    BEFORE UPDATE ON public.flashcard_decks
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
