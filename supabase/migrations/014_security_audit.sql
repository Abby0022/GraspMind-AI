-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 014: Security Audit & Measurement System
-- ══════════════════════════════════════════════════════════════

-- ── 1. Audit Logs Table ──────────────────────────────────────
-- Stores security-relevant events for measurement and auditing.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- e.g., 'auth_failure', 'rate_limit', 'role_escalation'
    action TEXT NOT NULL,     -- e.g., 'GET /api/v1/chat', 'DELETE notebook'
    status_code INTEGER,
    ip_address TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. Security Configuration ───────────────────────────────
-- Enable RLS — Audit logs are extremely sensitive.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only Admins can see audit logs
CREATE POLICY "admins_read_all_audit_logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System service (backend) can insert logs
-- We use a service role for this, or allow authenticated if backend uses user context
CREATE POLICY "backend_insert_audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- ── 3. Retention Policy ──────────────────────────────────────
-- Create a function to prune logs older than 90 days (privacy & performance)
CREATE OR REPLACE FUNCTION public.prune_old_audit_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM public.audit_logs WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Indexes for Measurement ──────────────────────────────
-- Speeds up security dashboards and trend analysis
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
