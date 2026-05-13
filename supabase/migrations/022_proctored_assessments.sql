-- Migration 022: Proctored Assessments Schema
-- Focus: Academic integrity tracking and high-stakes session management.

-- 1. Add proctoring flags to assignments
ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS is_proctored BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS time_limit_mins INTEGER, -- NULL means no limit
ADD COLUMN IF NOT EXISTS require_fullscreen BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS allow_navigation BOOLEAN DEFAULT TRUE;

-- 2. Add integrity telemetry to submissions
ALTER TABLE assignment_submissions
ADD COLUMN IF NOT EXISTS integrity_alerts JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS focus_lost_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS session_ended_at TIMESTAMPTZ;

-- 3. Create an audit log for proctoring events
CREATE TABLE IF NOT EXISTS assessment_integrity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES users(id),
    event_type TEXT NOT NULL, -- 'tab_switch', 'window_blur', 'dev_tools_open', 'fullscreen_exit'
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS on integrity logs
ALTER TABLE assessment_integrity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Faculty can view integrity logs for their courses"
ON assessment_integrity_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM assignment_submissions asub
        JOIN assignments a ON asub.assignment_id = a.id
        JOIN classes c ON a.class_id = c.id
        LEFT JOIN course_staff cs ON c.id = cs.class_id
        WHERE asub.id = assessment_integrity_logs.submission_id
        AND (c.teacher_id = auth.uid() OR cs.user_id = auth.uid())
    )
);

-- 5. Helper function to record integrity alert
CREATE OR REPLACE FUNCTION record_integrity_alert(p_submission_id UUID, p_event_type TEXT, p_metadata JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO assessment_integrity_logs (submission_id, student_id, event_type, metadata)
    SELECT p_submission_id, student_id, p_event_type, p_metadata
    FROM assignment_submissions
    WHERE id = p_submission_id;

    UPDATE assignment_submissions
    SET focus_lost_count = focus_lost_count + 1,
        integrity_alerts = integrity_alerts || jsonb_build_object(
            'event', p_event_type,
            'timestamp', now(),
            'metadata', p_metadata
        )
    WHERE id = p_submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
