-- ══════════════════════════════════════════════════════════════
-- Grasp — Storage Bucket RLS Policies
-- Run this in the Supabase SQL Editor to allow users to upload files.
-- ══════════════════════════════════════════════════════════════

-- Allow authenticated users to upload files to their own folder (user_id/notebook_id/...)
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sources'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sources'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sources'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
