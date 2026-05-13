-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 018: Notification Integrity & Cascading
-- ══════════════════════════════════════════════════════════════

-- Add relational links to notifications for automatic cleanup
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;

-- Index these for faster lookups during cleanup/filtering
CREATE INDEX IF NOT EXISTS idx_notifications_assignment ON public.notifications(assignment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_class ON public.notifications(class_id);

-- Update RLS to ensure students can still only manage their own notifications
-- (The existing policy handles this, but we'll ensure it remains authoritative)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
