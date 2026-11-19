-- Synthetic-only app RLS assertions; these rows are not provider ACL evidence.
INSERT INTO public.storage_resources (
  id, provider, canonical_id, canonical_url, title, resource_type, owner_id,
  visibility, verification_status, is_active, created_by, updated_by
)
VALUES
  ('c4-rls-public', 'google_drive', 'c4-rls-public', 'https://drive.google.com/drive/folders/c4-rls-public',
   'Synthetic public metadata', 'image', 'c4-rehearsal-admin', 'public', 'unverified', true,
   'c4-rehearsal-admin', 'c4-rehearsal-admin'),
  ('c4-rls-admin-only', 'google_drive', 'c4-rls-admin-only', 'https://drive.google.com/drive/folders/c4-rls-admin-only',
   'Synthetic admin metadata', 'image', 'c4-rehearsal-admin', 'admin_only', 'unverified', true,
   'c4-rehearsal-admin', 'c4-rehearsal-admin');

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 4 THEN
    RAISE EXCEPTION 'C2_RLS_ADMIN_GLOBAL_READ_FAILED';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rls-public')
     OR EXISTS (SELECT 1 FROM public.storage_resources WHERE id <> 'c4-rls-public') THEN
    RAISE EXCEPTION 'C2_RLS_LEADER_SCOPE_FAILED';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rls-public')
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rehearsal-granted-resource')
     OR EXISTS (SELECT 1 FROM public.storage_resources WHERE id IN ('c4-rehearsal-owner-resource','c4-rls-admin-only')) THEN
    RAISE EXCEPTION 'C2_RLS_MEMBER_SCOPE_FAILED';
  END IF;
END $$;
COMMIT;
