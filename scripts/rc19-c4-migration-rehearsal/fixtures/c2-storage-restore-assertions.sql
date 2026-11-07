DO $$ BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 106
     OR (SELECT count(*) FROM public.storage_resources WHERE id LIKE 'c4-rehearsal-%') <> 2
     OR (SELECT count(*) FROM public.storage_resources WHERE id LIKE 'c4-rls-%') <> 2
     OR (SELECT count(*) FROM public.storage_resource_audit_events WHERE resource_id LIKE 'c4-%') <> 5
     OR NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    RAISE EXCEPTION 'RESTORE_SYNTHETIC_DATA_OR_PUBLICATION_MISMATCH';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid='public.storage_resources'::regclass AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid='public.storage_resources'::regclass
      AND polname='storage_resources_read_allowed'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_resources'::regclass
      AND conname='storage_resources_visibility_check' AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%public%'
  ) OR to_regclass('public.storage_resource_edit_grants') IS NULL
    OR to_regclass('public.attendance_photo_drive_folders') IS NULL
    OR to_regclass('public.operational_storage_folder_locks') IS NULL
    OR to_regprocedure('public.storage_resource_registry_edit(text,text)') IS NULL THEN
    RAISE EXCEPTION 'RESTORE_C2_SCHEMA_CONTRACT_MISMATCH';
  END IF;
  IF has_table_privilege('anon','public.storage_resources','SELECT')
     OR NOT has_table_privilege('authenticated','public.storage_resources','SELECT') THEN
    RAISE EXCEPTION 'RESTORE_C2_TABLE_GRANTS_MISMATCH';
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 4 THEN
    RAISE EXCEPTION 'RESTORE_C2_ADMIN_RLS_FAILED';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000002';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 1
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rls-public') THEN
    RAISE EXCEPTION 'RESTORE_C2_LEADER_RLS_FAILED';
  END IF;
END $$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = 'c4c00000-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.storage_resources) <> 2
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rls-public')
     OR NOT EXISTS (SELECT 1 FROM public.storage_resources WHERE id='c4-rehearsal-granted-resource') THEN
    RAISE EXCEPTION 'RESTORE_C2_MEMBER_RLS_FAILED';
  END IF;
END $$;
COMMIT;
