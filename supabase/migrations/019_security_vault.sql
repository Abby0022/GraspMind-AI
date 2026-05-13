-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 019: Audit Vault & Security Hardening
-- ══════════════════════════════════════════════════════════════

-- ── 1. Immutable Audit Logs ──────────────────────────────────
-- Ensure audit logs can NEVER be updated or deleted.
DROP POLICY IF EXISTS "admins_read_all_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "backend_insert_audit_logs" ON public.audit_logs;

-- Backend can always insert logs (system process)
CREATE POLICY "system_insert_audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- Only SuperAdmins (role='admin') can READ logs.
CREATE POLICY "admins_read_audit_logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Explicitly block UPDATE and DELETE for everyone
CREATE POLICY "no_one_updates_audit_logs" ON public.audit_logs FOR UPDATE USING (false);
CREATE POLICY "no_one_deletes_audit_logs" ON public.audit_logs FOR DELETE USING (false);

-- ── 2. Harden Notifications Update ───────────────────────────
-- Students should only be able to update 'is_read'.
-- We use a trigger to prevent tampering with IDs or Links.

CREATE OR REPLACE FUNCTION public.protect_notification_content()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.user_id <> NEW.user_id) OR 
       (OLD.assignment_id <> NEW.assignment_id) OR 
       (OLD.class_id <> NEW.class_id) OR
       (OLD.link <> NEW.link) THEN
        RAISE EXCEPTION 'Notification content is immutable. Only is_read can be updated.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_notification_update_protect ON public.notifications;
CREATE TRIGGER on_notification_update_protect
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_notification_content();
