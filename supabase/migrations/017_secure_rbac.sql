-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 017: Secure RBAC & Role Protection
-- ══════════════════════════════════════════════════════════════

-- ── 1. Role Protection Trigger ────────────────────────────────
-- Prevents any user from updating their own 'role' field via RLS.
-- Only the service_role (backend) or superadmins can change roles.

CREATE OR REPLACE FUNCTION public.protect_user_role()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the role is being changed
    IF OLD.role <> NEW.role THEN
        -- Allow the change ONLY if performed by the service role
        -- In Supabase, the backend usually connects via service_role which bypasses RLS
        -- or identifies as 'service_role' in some contexts.
        -- We check the current user role in Postgres.
        IF current_user <> 'service_role' AND current_user <> 'postgres' AND current_user <> 'supabase_admin' THEN
            -- Revert the role change to the old value
            NEW.role := OLD.role;
            -- Optionally log this attempt to audit_logs
            INSERT INTO public.audit_logs (user_id, event_type, action, metadata)
            VALUES (auth.uid(), 'role_escalation_attempt', 'Attempted to change role from ' || OLD.role || ' to ' || NEW.role, jsonb_build_object('ip', inet_client_addr()));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_role_update ON public.users;
CREATE TRIGGER on_user_role_update
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_user_role();

-- ── 2. Strict Update Policy ───────────────────────────────────
-- Revise the update policy to explicitly restrict what users can change.
-- While the trigger handles 'role', this is an extra layer of defense.

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- ── 3. Audit Log Enhancement ──────────────────────────────────
-- Ensure signup/login attempts are trackable for security measurement.

CREATE OR REPLACE FUNCTION public.log_auth_event()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.audit_logs (user_id, event_type, action)
        VALUES (NEW.id, 'user_registered', 'User account created via auth trigger');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_signup_log ON public.users;
CREATE TRIGGER on_user_signup_log
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.log_auth_event();
