-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 015: Provider Customization
-- Adds advanced LLM configuration fields to user_providers.
-- ══════════════════════════════════════════════════════════════

-- Add advanced configuration fields to user_providers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_providers'
      AND column_name  = 'temperature'
  ) THEN
    ALTER TABLE public.user_providers ADD COLUMN temperature FLOAT DEFAULT 0.7;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_providers'
      AND column_name  = 'max_tokens'
  ) THEN
    ALTER TABLE public.user_providers ADD COLUMN max_tokens INT DEFAULT 2048;
  END IF;
END;
$$;
