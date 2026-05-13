-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 020: Sections & Institutional Hierarchy
-- ══════════════════════════════════════════════════════════════

-- ── 1. Expand User Roles ──────────────────────────────────────
-- Support Teaching Assistants (ta) and Department Heads (admin).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'teacher', 'ta', 'admin'));

-- ── 2. Departmental Support ──────────────────────────────────
-- Allow courses to be grouped by department for institutional reporting.
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS department TEXT;
CREATE INDEX IF NOT EXISTS idx_classes_department ON public.classes(department);

-- ── 3. Course Sections ───────────────────────────────────────
-- Multiple sections (Labs, Tutorials, Cohorts) under one Course umbrella.
CREATE TABLE IF NOT EXISTS public.course_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name        TEXT NOT NULL, -- e.g., "Lab A", "Section 101"
  room        TEXT,
  schedule    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.course_sections ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sections_class ON public.course_sections(class_id);

-- RLS: Faculty and students in the course can see sections
CREATE POLICY "faculty_manages_sections"
  ON public.course_sections FOR ALL
  USING (
    class_id IN (
      SELECT id FROM public.classes WHERE teacher_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "student_reads_sections"
  ON public.course_sections FOR SELECT
  USING (
    class_id IN (
      SELECT class_id FROM public.class_members WHERE student_id = (SELECT auth.uid())
    )
  );

-- ── 4. Roster Section Assignment ─────────────────────────────
-- Link students to specific sections for granular analytics.
ALTER TABLE public.class_members ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.course_sections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_class_members_section ON public.class_members(section_id);

-- ── 5. Auto-update Trigger ───────────────────────────────────
CREATE TRIGGER set_updated_at_sections
  BEFORE UPDATE ON public.course_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
