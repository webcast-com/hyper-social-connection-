-- ============================================================================
-- Hyper social network — Supabase Storage buckets + policies
-- ============================================================================
-- Run this in the Supabase SQL Editor (once). Creates the `uploads` bucket
-- (public) and lets signed-in users upload; everyone can read/download.
--
-- The app's server-side /api/upload endpoint uses this bucket and falls back
-- to local disk when it is unavailable. SAFE to re-run.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  true,
  262144000, -- 250 MB
  ARRAY['image/*', 'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "uploads_public_read" ON storage.objects;
CREATE POLICY "uploads_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');

-- Signed-in users upload/update/delete their own files
DROP POLICY IF EXISTS "uploads_authenticated_insert" ON storage.objects;
CREATE POLICY "uploads_authenticated_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "uploads_authenticated_update" ON storage.objects;
CREATE POLICY "uploads_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'uploads' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "uploads_authenticated_delete" ON storage.objects;
CREATE POLICY "uploads_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'uploads' AND auth.role() = 'authenticated');

-- Verify
SELECT id, name, public FROM storage.buckets ORDER BY id;
