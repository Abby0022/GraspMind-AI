-- ══════════════════════════════════════════════════════════════
-- Grasp — Migration 010: Teacher Portal
-- Adds classes, class_members, assignments, assignment_submissions,
-- teacher-scoped RLS on student data, and the analytics function.
-- ══════════════════════════════════════════════════════════════

-- ── Classes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.classes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  subject     TEXT,
  -- High-entropy invite code: 6 random bytes → base64 → 8 URL-safe chars
  invite_code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(6), 'base64'),
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON public.classes(teacher_id);

CREATE TRIGGER set_updated_at_classes
  BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Teachers own their classes
CREATE POLICY "teacher_owns_classes"
  ON public.classes FOR ALL
  USING ((SELECT auth.uid()) = teacher_id)
  WITH CHECK ((SELECT auth.uid()) = teacher_id);

-- NOTE: "student_reads_enrolled_class" policy is defined AFTER
-- public.class_members is created below (line ordering requirement).


-- ── Class Members ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.class_members (
  class_id    UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (class_id, student_id)
);
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_class_members_student ON public.class_members(student_id);
CREATE INDEX IF NOT EXISTS idx_class_members_class   ON public.class_members(class_id);

-- Teachers can read & delete members of their classes
CREATE POLICY "teacher_manages_class_members"
  ON public.class_members FOR ALL
  USING (
    class_id IN (
      SELECT id FROM public.classes WHERE teacher_id = (SELECT auth.uid())
    )
  );

-- Students can insert themselves (join) and read their own memberships
CREATE POLICY "student_joins_class"
  ON public.class_members FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = student_id);

CREATE POLICY "student_reads_own_membership"
  ON public.class_members FOR SELECT
  USING ((SELECT auth.uid()) = student_id);

-- Students can read classes they are enrolled in
-- (defined here because it references public.class_members)
CREATE POLICY "student_reads_enrolled_class"
  ON public.classes FOR SELECT
  USING (
    id IN (
      SELECT class_id FROM public.class_members
      WHERE student_id = (SELECT auth.uid())
    )
  );


-- ── Assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  notebook_id  UUID REFERENCES public.notebooks(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  type         TEXT NOT NULL CHECK (type IN ('read', 'quiz', 'flashcard')),
  due_date     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_assignments_class ON public.assignments(class_id);

-- Teachers can CRUD assignments for their classes
CREATE POLICY "teacher_manages_assignments"
  ON public.assignments FOR ALL
  USING (
    class_id IN (
      SELECT id FROM public.classes WHERE teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    class_id IN (
      SELECT id FROM public.classes WHERE teacher_id = (SELECT auth.uid())
    )
  );

-- Students can read assignments for classes they are enrolled in
CREATE POLICY "student_reads_class_assignments"
  ON public.assignments FOR SELECT
  USING (
    class_id IN (
      SELECT class_id FROM public.class_members
      WHERE student_id = (SELECT auth.uid())
    )
  );


-- ── Assignment Submissions ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status        TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted')),
  score         FLOAT,
  submitted_at  TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON public.assignment_submissions(student_id);

-- Students can upsert and read their own submissions
CREATE POLICY "student_manages_own_submission"
  ON public.assignment_submissions FOR ALL
  USING ((SELECT auth.uid()) = student_id)
  WITH CHECK ((SELECT auth.uid()) = student_id);

-- Teachers can read all submissions for their class assignments
CREATE POLICY "teacher_reads_class_submissions"
  ON public.assignment_submissions FOR SELECT
  USING (
    assignment_id IN (
      SELECT a.id FROM public.assignments a
      JOIN public.classes c ON a.class_id = c.id
      WHERE c.teacher_id = (SELECT auth.uid())
    )
  );


-- ── Teacher RLS on Student Knowledge ────────────────────────
-- Teachers can read student_knowledge for students in their class.
-- The existing "Users own knowledge records" policy remains intact for students.
CREATE POLICY "teacher_reads_class_student_knowledge"
  ON public.student_knowledge FOR SELECT
  USING (
    -- Teacher owns a class that this student has joined
    user_id IN (
      SELECT cm.student_id FROM public.class_members cm
      JOIN public.classes c ON cm.class_id = c.id
      WHERE c.teacher_id = (SELECT auth.uid())
    )
  );

-- Teachers can read quiz_attempts for students in their class
CREATE POLICY "teacher_reads_class_quiz_attempts"
  ON public.quiz_attempts FOR SELECT
  USING (
    user_id IN (
      SELECT cm.student_id FROM public.class_members cm
      JOIN public.classes c ON cm.class_id = c.id
      WHERE c.teacher_id = (SELECT auth.uid())
    )
  );

-- Teachers can read study_sessions for students in their class
CREATE POLICY "teacher_reads_class_study_sessions"
  ON public.study_sessions FOR SELECT
  USING (
    user_id IN (
      SELECT cm.student_id FROM public.class_members cm
      JOIN public.classes c ON cm.class_id = c.id
      WHERE c.teacher_id = (SELECT auth.uid())
    )
  );


-- ── Analytics Function ───────────────────────────────────────
-- Single round-trip aggregation replaces N+1 Python loop.
-- Called via: supabase.rpc('get_class_analytics', {'p_class_id': '...'})
-- SECURITY DEFINER runs as the function owner (postgres), not the caller,
-- but the WHERE clause is tightly scoped to the given class_id.
-- The calling route must verify teacher ownership before calling this fn.
CREATE OR REPLACE FUNCTION public.get_class_analytics(p_class_id UUID)
RETURNS JSON
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'student_count',
    (SELECT COUNT(*) FROM public.class_members WHERE class_id = p_class_id),

    'avg_mastery',
    ROUND(
      COALESCE(
        (
          SELECT AVG(sk.mastery_score)
          FROM public.student_knowledge sk
          WHERE sk.user_id IN (
            SELECT student_id FROM public.class_members WHERE class_id = p_class_id
          )
        ),
        0
      )::numeric,
      3
    ),

    'weakest_concepts',
    (
      SELECT COALESCE(json_agg(concept ORDER BY avg_score), '[]'::json)
      FROM (
        SELECT
          sk.concept,
          AVG(sk.mastery_score) AS avg_score
        FROM public.student_knowledge sk
        WHERE sk.user_id IN (
          SELECT student_id FROM public.class_members WHERE class_id = p_class_id
        )
        GROUP BY sk.concept
        ORDER BY avg_score ASC
        LIMIT 5
      ) sub
    ),

    'assignment_completion_rate',
    ROUND(
      COALESCE(
        (
          SELECT
            COUNT(*) FILTER (WHERE asub.status = 'submitted')::float
            / NULLIF(COUNT(*), 0)
          FROM public.assignment_submissions asub
          JOIN public.assignments a ON asub.assignment_id = a.id
          WHERE a.class_id = p_class_id
        ),
        0
      )::numeric,
      3
    ),

    'per_student',
    (
      SELECT COALESCE(json_agg(
        json_build_object(
          'student_id',    u.id,
          'name',          u.name,
          'email',         u.email,
          'avg_mastery',   ROUND(COALESCE(avg_sk.score, 0)::numeric, 3),
          'quizzes_done',  COALESCE(qz.quiz_count, 0),
          'joined_at',     cm.joined_at
        )
        ORDER BY cm.joined_at
      ), '[]'::json)
      FROM public.class_members cm
      JOIN public.users u ON cm.student_id = u.id
      LEFT JOIN (
        SELECT user_id, AVG(mastery_score) AS score
        FROM public.student_knowledge
        GROUP BY user_id
      ) avg_sk ON avg_sk.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS quiz_count
        FROM public.quiz_attempts
        GROUP BY user_id
      ) qz ON qz.user_id = u.id
      WHERE cm.class_id = p_class_id
    )
  );
$$;

-- Revoke public execute; only the backend service role should call this
REVOKE EXECUTE ON FUNCTION public.get_class_analytics(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_class_analytics(UUID) TO service_role;
