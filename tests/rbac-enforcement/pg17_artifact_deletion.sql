\set ON_ERROR_STOP on
INSERT INTO public.stored_files(id,provider,external_file_id,external_parent_id,logical_category,folder_path,file_name,mime_type,size_bytes,checksum_sha256,artifact_key,report_id,shift_id,uploaded_by)
VALUES ('file-x','google_drive','drive-x','parent-x','data_source','path','file.txt','text/plain',1,repeat('a',64),'source:x','report-x','shift-x','staff-x');
CREATE TEMP TABLE deletion_proof (claim jsonb);
GRANT SELECT,INSERT,UPDATE ON deletion_proof TO authenticated,service_role;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
INSERT INTO deletion_proof SELECT public.rc19_claim_report_artifact_deletion('file-x','11111111-1111-4111-8111-111111111111');
DO $$ BEGIN
  IF (SELECT claim->>'status' FROM deletion_proof) <> 'pending' THEN RAISE EXCEPTION 'CLAIM_FAILED'; END IF;
  IF public.rc19_claim_report_artifact_deletion('file-x','22222222-2222-4222-8222-222222222222')->>'status' <> 'in_progress'
    THEN RAISE EXCEPTION 'SECOND_CLAIM_WAS_GRANTED'; END IF;
  BEGIN
    PERFORM public.rc19_begin_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
      '22222222-2222-4222-8222-222222222222',1);
    RAISE EXCEPTION 'WRONG_OWNER_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
SELECT public.rc19_begin_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '11111111-1111-4111-8111-111111111111',1);
DO $$ BEGIN
  IF public.rc19_claim_report_artifact_deletion('file-x','22222222-2222-4222-8222-222222222222')->>'status' <> 'in_progress'
    THEN RAISE EXCEPTION 'IN_FLIGHT_CLAIM_WAS_GRANTED'; END IF;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_record_report_artifact_delete_outcome((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
      '11111111-1111-4111-8111-111111111111',2,true);
    RAISE EXCEPTION 'STALE_FENCE_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
END $$;
SELECT public.rc19_record_report_artifact_delete_outcome((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '11111111-1111-4111-8111-111111111111',1,true);
SELECT public.rc19_finalize_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '11111111-1111-4111-8111-111111111111',1);
SELECT public.rc19_finalize_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '11111111-1111-4111-8111-111111111111',1);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT deleted_at IS NULL FROM public.stored_files WHERE id='file-x') THEN RAISE EXCEPTION 'TOMBSTONE_MISSING'; END IF;
  IF (SELECT status FROM public.rc19_report_artifact_deletions WHERE stored_file_id='file-x') <> 'completed'
    THEN RAISE EXCEPTION 'COMPLETION_MISSING'; END IF;
  IF has_function_privilege('authenticated','public.rc19_finalize_report_artifact_deletion(uuid,uuid,integer)','EXECUTE')
    THEN RAISE EXCEPTION 'FINALIZE_PRIVILEGE_LEAK'; END IF;
END $$;
SELECT 'RC19_ARTIFACT_DELETION_PG17_PASS';
INSERT INTO public.stored_files(id,provider,external_file_id,external_parent_id,logical_category,folder_path,file_name,mime_type,size_bytes,checksum_sha256,artifact_key,report_id,shift_id,uploaded_by)
VALUES ('file-y','google_drive','drive-y','parent-y','data_source','path','file.txt','text/plain',1,repeat('b',64),'source:y','report-x','shift-x','staff-x');
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_claim_report_artifact_deletion('file-y','33333333-3333-4333-8333-333333333333');
    RAISE EXCEPTION 'UNSCOPED_LEADER_CLAIM_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.review',true,0,statement_timestamp(),NULL,'test grant');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
UPDATE deletion_proof SET claim=public.rc19_claim_report_artifact_deletion('file-y','33333333-3333-4333-8333-333333333333');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.review',false,1,statement_timestamp(),NULL,'test revoke');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_begin_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
      '33333333-3333-4333-8333-333333333333',1);
    RAISE EXCEPTION 'REVOKED_LEADER_BEGIN_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
SELECT public.rc19_release_report_artifact_delete_claim((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '33333333-3333-4333-8333-333333333333',1,false);
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('leader-a','brand-x','reports.review',true,2,statement_timestamp(),NULL,'test regrant');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000021';
SET ROLE authenticated;
UPDATE deletion_proof SET claim=public.rc19_claim_report_artifact_deletion('file-y','44444444-4444-4444-8444-444444444444');
DO $$ BEGIN
  IF (SELECT (claim->>'fencing_version')::int FROM deletion_proof) <> 2 THEN RAISE EXCEPTION 'RETRY_FENCE_NOT_INCREMENTED'; END IF;
  BEGIN
    PERFORM public.rc19_begin_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
      '33333333-3333-4333-8333-333333333333',1);
    RAISE EXCEPTION 'STALE_RETRY_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
SELECT public.rc19_begin_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '44444444-4444-4444-8444-444444444444',2);
RESET ROLE;
SET ROLE service_role;
SELECT public.rc19_record_report_artifact_delete_outcome((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '44444444-4444-4444-8444-444444444444',2,false);
RESET ROLE;
DO $$ BEGIN
  IF (SELECT status FROM public.rc19_report_artifact_deletions WHERE stored_file_id='file-y') <> 'manual_review'
    THEN RAISE EXCEPTION 'UNKNOWN_PROVIDER_OUTCOME_NOT_QUARANTINED'; END IF;
  IF (SELECT deleted_at IS NOT NULL FROM public.stored_files WHERE id='file-y') THEN RAISE EXCEPTION 'FAILED_DELETE_TOMBSTONED'; END IF;
END $$;
SELECT 'RC19_ARTIFACT_DELETION_REVOKE_RETRY_PG17_PASS';
UPDATE public.rc19_report_artifact_deletions SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE stored_file_id='file-y';
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.rc19_reconcile_report_artifact_deleted(uuid,uuid,integer,text,text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'RECONCILE_PRIVILEGE_LEAK'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_reconcile_report_artifact_deleted((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
      '44444444-4444-4444-8444-444444444444',2,'google_drive','drive-y','wrong-parent','admin-a');
    RAISE EXCEPTION 'WRONG_PARENT_RECONCILED';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
END $$;
SELECT public.rc19_reconcile_report_artifact_deleted((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '44444444-4444-4444-8444-444444444444',2,'google_drive','drive-y','parent-y','admin-a');
SELECT public.rc19_finalize_report_artifact_deletion((SELECT (claim->>'operation_id')::uuid FROM deletion_proof),
  '44444444-4444-4444-8444-444444444444',2);
RESET ROLE;
SELECT 'RC19_ARTIFACT_DELETION_RECONCILE_PG17_PASS';
INSERT INTO public.stored_files(id,provider,external_file_id,external_parent_id,logical_category,folder_path,file_name,mime_type,size_bytes,checksum_sha256,artifact_key,report_id,shift_id,uploaded_by)
VALUES ('file-legacy','google_drive','drive-legacy',NULL,'data_source','path','file.txt','text/plain',1,repeat('c',64),'source:legacy','report-x','shift-x','staff-x');
SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000011';
SET ROLE authenticated;
DO $$ BEGIN
  IF public.rc19_claim_report_artifact_deletion('file-legacy','55555555-5555-4555-8555-555555555555')->>'status' <> 'manual_review'
    THEN RAISE EXCEPTION 'LEGACY_PARENT_NOT_QUARANTINED'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rc19_report_artifact_deletions
    WHERE stored_file_id='file-legacy' AND status='manual_review' AND last_error_code='LEGACY_PARENT_VERIFICATION_REQUIRED')
    THEN RAISE EXCEPTION 'LEGACY_REVIEW_EVIDENCE_MISSING'; END IF;
END $$;
SELECT 'RC19_ARTIFACT_LEGACY_QUARANTINE_PG17_PASS';
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.rc19_backfill_report_artifact_parent(uuid,integer,text,text,text,text)','EXECUTE')
    THEN RAISE EXCEPTION 'LEGACY_BACKFILL_PRIVILEGE_LEAK'; END IF;
END $$;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.rc19_backfill_report_artifact_parent(
      (SELECT operation_id FROM public.rc19_report_artifact_deletions WHERE stored_file_id='file-legacy'),
      1,'google_drive','drive-legacy','verified-parent','staff-x');
    RAISE EXCEPTION 'NON_ADMIN_LEGACY_BACKFILL_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END $$;
SELECT public.rc19_backfill_report_artifact_parent(
  (SELECT operation_id FROM public.rc19_report_artifact_deletions WHERE stored_file_id='file-legacy'),
  1,'google_drive','drive-legacy','verified-parent','admin-a');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT external_parent_id FROM public.stored_files WHERE id='file-legacy') <> 'verified-parent'
    OR NOT EXISTS (SELECT 1 FROM public.rc19_report_artifact_deletion_events e
      JOIN public.rc19_report_artifact_deletions d ON d.operation_id=e.operation_id
      WHERE d.stored_file_id='file-legacy' AND e.status='legacy_parent_verified' AND e.actor_business_user_id='admin-a')
    THEN RAISE EXCEPTION 'LEGACY_BACKFILL_AUDIT_MISSING'; END IF;
END $$;
SELECT 'RC19_ARTIFACT_LEGACY_BACKFILL_PG17_PASS';
