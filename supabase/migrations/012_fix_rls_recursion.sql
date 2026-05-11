-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 012: Fix RLS infinite recursion on class_members
-- ══════════════════════════════════════════════════════════════
--
-- Root cause:
--   • "teacher_manages_class_members" on class_members queries
--     public.classes (which itself has an RLS policy).
--   • "student_reads_enrolled_class" on classes queries
--     public.class_members (which itself has an RLS policy).
--   Postgres evaluates these two policies simultaneously, producing
--   42P17: infinite recursion detected in policy for relation "class_members".
--
-- Fix: Replace the cross-table policy checks with SECURITY DEFINER
-- helper functions that bypass RLS, breaking the cycle.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Helper: does current user own a given class? ──────────
-- SECURITY DEFINER runs as the function owner (superuser),
-- bypassing RLS on public.classes so class_members policies
-- never trigger classes policies mid-evaluation.
CREATE OR REPLACE FUNCTION public.user_owns_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = p_class_id
      AND teacher_id = (SELECT auth.uid())
  );
$$;

-- ── 2. Helper: is current user a member of a given class? ────
-- Same pattern — bypasses RLS on class_members so the classes
-- policy never re-enters class_members policy evaluation.
CREATE OR REPLACE FUNCTION public.user_is_member_of_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_members
    WHERE class_id = p_class_id
      AND student_id = (SELECT auth.uid())
  );
$$;

-- ── 3. Drop & recreate the recursive policies ─────────────────

-- class_members: teacher policy (was querying classes → triggered class RLS)
DROP POLICY IF EXISTS "teacher_manages_class_members" ON public.class_members;
CREATE POLICY "teacher_manages_class_members"
  ON public.class_members FOR ALL
  USING (public.user_owns_class(class_id));

-- classes: student read policy (was querying class_members → triggered class_members RLS)
DROP POLICY IF EXISTS "student_reads_enrolled_class" ON public.classes;
CREATE POLICY "student_reads_enrolled_class"
  ON public.classes FOR SELECT
  USING (public.user_is_member_of_class(id));

-- assignments: student read policy (was querying class_members → same cycle)
DROP POLICY IF EXISTS "student_reads_class_assignments" ON public.assignments;
CREATE POLICY "student_reads_class_assignments"
  ON public.assignments FOR SELECT
  USING (public.user_is_member_of_class(class_id));

-- assignment_submissions: teacher read policy (if it queries class_members transitively)
DROP POLICY IF EXISTS "teacher_reads_class_submissions" ON public.assignment_submissions;
CREATE POLICY "teacher_reads_class_submissions"
  ON public.assignment_submissions FOR SELECT
  USING (
    assignment_id IN (
      SELECT a.id FROM public.assignments a
      WHERE public.user_owns_class(a.class_id)
    )
  );
