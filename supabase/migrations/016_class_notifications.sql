-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 016: Class Archiving & Notifications
-- Adds support for soft-deleting classes and a centralized
-- notification system for student alerts.
-- ══════════════════════════════════════════════════════════════

-- ── Class Archiving ─────────────────────────────────────────
-- Allows teachers to hide completed classes without losing data.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- ── Notifications ───────────────────────────────────────────
-- Centralized table for student alerts (new assignments, etc.)
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT DEFAULT 'info' CHECK (type IN ('info', 'assignment', 'mastery', 'system')),
  link        TEXT, -- Optional deep link (e.g., /classes or /dashboard?notebook=...)
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── Security Policies ────────────────────────────────────────

-- Users can only manage (read/update/delete) their own notifications
CREATE POLICY "users_manage_own_notifications"
  ON public.notifications FOR ALL
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ── Performance Optimization ────────────────────────────────

-- Fast lookup for unread notifications (dashboard alerts)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON public.notifications(user_id) 
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created 
  ON public.notifications(user_id, created_at DESC);
