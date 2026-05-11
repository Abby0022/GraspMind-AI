-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 011: Secure teacher signup via backend only
--
-- SECURITY MODEL:
--   The trigger ALWAYS creates users with role='student'.
--   The backend API validates TEACHER_INVITE_CODE before calling
--   public.users upsert with role='teacher'. This means:
--     - Calling Supabase Auth directly → always gets student role
--     - Only our backend (which knows the secret code) can promote
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Always insert as 'student'. Role elevation to 'teacher' happens
  -- ONLY via the validated backend signup endpoint, which upserts
  -- public.users after checking TEACHER_INVITE_CODE.
  -- DO NOTHING on conflict: if the backend already upserted the
  -- correct role before the trigger fires, preserve it.
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'student'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger binding is already in place from migration 005.
-- CREATE OR REPLACE replaces the function body; no need to re-attach.
