-- VitaWise Migration 008: Realtime Publication & Storage Security
-- Configures live synchronization channels and secure storage access

-- 1. Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.nutrition_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.symptom_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cycle_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sync_operations;

-- 2. Storage Policies
CREATE POLICY "profile_photos_user_isolation" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "health_docs_user_isolation" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'health-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "educational_media_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'educational-media');
