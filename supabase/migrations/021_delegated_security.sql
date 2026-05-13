-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 021: Granular Faculty Security & Delegation
-- ══════════════════════════════════════════════════════════════

-- ── 1. Course Staff Delegation ──────────────────────────────
-- Allows multiple faculty members (TAs, Admins) to manage a single course.
CREATE TABLE IF NOT EXISTS public.course_staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'ta' CHECK (role IN ('ta', 'teacher', 'admin')),
  permissions JSONB DEFAULT '{"can_manage_roster": true, "can_manage_assignments": true, "can_archive": false}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, user_id)
);
ALTER TABLE public.course_staff ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_course_staff_user ON public.course_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_course_staff_class ON public.course_staff(class_id);

-- ── 2. Staff RLS Policies ────────────────────────────────────

-- Only the Course Owner (Teacher) or a SuperAdmin can manage staff
CREATE POLICY "owner_manages_staff"
  ON public.course_staff FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.classes 
      WHERE id = class_id AND teacher_id = auth.uid()
    )
  );

-- Staff can read their own delegation status
CREATE POLICY "staff_read_own_status"
  ON public.course_staff FOR SELECT
  USING (user_id = auth.uid());

-- ── 3. Update Course Access for Staff ────────────────────────

-- Allow Staff to READ the course details
CREATE POLICY "staff_read_assigned_course"
  ON public.classes FOR SELECT
  USING (
    id IN (SELECT class_id FROM public.course_staff WHERE user_id = auth.uid())
  );

-- Allow Staff to READ and MANAGE assignments
CREATE POLICY "staff_manage_assignments"
  ON public.assignments FOR ALL
  USING (
    class_id IN (
      SELECT class_id FROM public.course_staff 
      WHERE user_id = auth.uid() AND (permissions->>'can_manage_assignments')::boolean = true
    )
  );

-- Allow Staff to READ and MANAGE the roster (class_members)
CREATE POLICY "staff_manage_roster"
  ON public.class_members FOR ALL
  USING (
    class_id IN (
      SELECT class_id FROM public.course_staff 
      WHERE user_id = auth.uid() AND (permissions->>'can_manage_roster')::boolean = true
    )
  );

-- ── 4. SAFETY: Block Destructive Actions for TAs ──────────────
-- TAs should NOT be able to update 'teacher_id' or 'is_archived' on the main class table
-- unless explicitly granted 'can_archive' permission.

CREATE OR REPLACE FUNCTION public.check_faculty_permissions()
RETURNS TRIGGER AS $$
BEGIN
    -- If user is NOT the teacher_id (Owner)
    IF (SELECT teacher_id FROM public.classes WHERE id = NEW.id) <> auth.uid() THEN
        -- Check if they have 'can_archive' permission in course_staff
        IF NOT EXISTS (
            SELECT 1 FROM public.course_staff 
            WHERE class_id = NEW.id AND user_id = auth.uid() AND (permissions->>'can_archive')::boolean = true
        ) THEN
            IF (OLD.is_archived <> NEW.is_archived) THEN
                RAISE EXCEPTION 'Permission Denied: Staff cannot archive this course.';
            END IF;
            IF (OLD.teacher_id <> NEW.teacher_id) THEN
                RAISE EXCEPTION 'Permission Denied: Only the owner can transfer course ownership.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_class_update_check_perms ON public.classes;
CREATE TRIGGER on_class_update_check_perms
    BEFORE UPDATE ON public.classes
    FOR EACH ROW
    EXECUTE FUNCTION public.check_faculty_permissions();
