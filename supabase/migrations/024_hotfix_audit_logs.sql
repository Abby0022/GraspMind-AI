-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 024: Audit Logs Hotfix
-- ══════════════════════════════════════════════════════════════

-- 1. Ensure all required columns exist for Phase 5 auditing.
DO $$ 
BEGIN
    -- 'action'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'action') THEN
        ALTER TABLE public.audit_logs ADD COLUMN action TEXT NOT NULL DEFAULT 'unknown';
    END IF;

    -- 'ip_address'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'ip_address') THEN
        ALTER TABLE public.audit_logs ADD COLUMN ip_address TEXT;
    END IF;

    -- 'status_code'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'status_code') THEN
        ALTER TABLE public.audit_logs ADD COLUMN status_code INTEGER;
    END IF;

    -- 'metadata'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'metadata') THEN
        ALTER TABLE public.audit_logs ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;
END $$;

-- 2. Force PostgREST to reload the schema cache.
-- This is critical to resolve PGRST204 errors where the API
-- doesn't see recently added columns.
NOTIFY pgrst, 'reload schema';

-- 3. Verify RLS policies (Harden system insertion)
DROP POLICY IF EXISTS "backend_insert_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "system_insert_audit_logs" ON public.audit_logs;

CREATE POLICY "system_insert_audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);
