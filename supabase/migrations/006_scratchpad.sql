-- Migration to add a scratchpad column to the notebooks table
-- This allows users to store quick notes directly on the notebook

ALTER TABLE public.notebooks 
ADD COLUMN IF NOT EXISTS scratchpad TEXT DEFAULT '';
