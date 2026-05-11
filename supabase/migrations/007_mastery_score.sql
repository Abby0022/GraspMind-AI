-- Migration to add mastery_score to notebooks table
-- This provides a cached score of the student's mastery of the notebook content

ALTER TABLE public.notebooks 
ADD COLUMN IF NOT EXISTS mastery_score INTEGER DEFAULT 0;
