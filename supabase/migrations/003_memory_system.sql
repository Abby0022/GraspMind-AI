-- Episodic memory tables for Grasp
-- Stores LLM-generated session summaries for cross-session continuity

CREATE TABLE IF NOT EXISTS public.episodes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notebook_id UUID NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    topics JSONB DEFAULT '[]'::jsonb,
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own episodes"
    ON public.episodes FOR ALL
    USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_episodes_user ON public.episodes(user_id);
CREATE INDEX idx_episodes_notebook ON public.episodes(notebook_id);
CREATE INDEX idx_episodes_created ON public.episodes(created_at DESC);

-- Chunks table (for BM25 / indexing reference)
CREATE TABLE IF NOT EXISTS public.chunks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_type TEXT NOT NULL DEFAULT 'child',
    parent_id UUID,
    page_num INTEGER,
    headings JSONB DEFAULT '[]'::jsonb,
    token_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access chunks via source ownership"
    ON public.chunks FOR ALL
    USING (
        source_id IN (
            SELECT id FROM public.sources
            WHERE notebook_id IN (
                SELECT id FROM public.notebooks
                WHERE (SELECT auth.uid()) = user_id
            )
        )
    );

CREATE INDEX idx_chunks_source ON public.chunks(source_id);
CREATE INDEX idx_chunks_type ON public.chunks(chunk_type);
