\set ON_ERROR_STOP on
DO $preflight$
DECLARE marker text;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'C5_3_ROLE_FIXTURE_REQUIRES_POSTGRES'; END IF;
  SELECT shobj_description(oid, 'pg_database') INTO marker FROM pg_database WHERE datname=current_database();
  IF marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY' THEN
    RAISE EXCEPTION 'C5_3_ROLE_FIXTURE_REFUSED_DATABASE:%', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM public.brands WHERE id LIKE 'c53-%')
     OR EXISTS (SELECT 1 FROM public.platforms WHERE id LIKE 'c53-%')
     OR EXISTS (SELECT 1 FROM public.shifts WHERE id LIKE 'c53-%')
     OR EXISTS (SELECT 1 FROM public.reports WHERE id LIKE 'c53-%') THEN
    RAISE EXCEPTION 'C5_3_SYNTHETIC_FIXTURE_ALREADY_SEEDED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_users WHERE id='c4-rehearsal-admin' AND auth_user_id='c4c00000-0000-4000-8000-000000000001' AND system_permission='admin' AND status='active')
     OR NOT EXISTS (SELECT 1 FROM public.business_users WHERE id='c4-rehearsal-leader' AND auth_user_id='c4c00000-0000-4000-8000-000000000002' AND system_permission='leader' AND status='active')
     OR NOT EXISTS (SELECT 1 FROM public.business_users WHERE id='c4-rehearsal-member' AND auth_user_id='c4c00000-0000-4000-8000-000000000003' AND system_permission='member' AND status='active') THEN
    RAISE EXCEPTION 'C5_3_AUTH_BUSINESS_IDENTITY_FIXTURE_MISSING';
  END IF;
END
$preflight$;

SET request.jwt.claim.sub='c4c00000-0000-4000-8000-000000000001';
INSERT INTO public.brands (id,name) VALUES
  ('c53-brand-a','C5.3 Synthetic Brand A'),
  ('c53-brand-b','C5.3 Synthetic Brand B'),
  ('c53-brand-c','C5.3 Synthetic Brand C');
INSERT INTO public.platforms (id,name) VALUES ('c53-platform','C5.3 Synthetic Platform');
INSERT INTO public.shifts (
  id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,
  brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count
) VALUES
  ('c53-report-shift-a','2026-11-06','09:00','10:00','2026-11-06 09:00+07','2026-11-06 10:00+07','2026-11-06',false,60,'c53-brand-a','c53-platform','2026-11-06 08:30+07','completed','C5.3 Report A',0,0,0),
  ('c53-report-shift-b','2026-11-06','09:00','10:00','2026-11-06 09:00+07','2026-11-06 10:00+07','2026-11-06',false,60,'c53-brand-b','c53-platform','2026-11-06 08:30+07','completed','C5.3 Report B',0,0,0),
  ('c53-report-shift-c','2026-11-06','09:00','10:00','2026-11-06 09:00+07','2026-11-06 10:00+07','2026-11-06',false,60,'c53-brand-c','c53-platform','2026-11-06 08:30+07','completed','C5.3 Report C',0,0,0),
  ('c53-open-shift-a',current_date+3,'09:00','10:00',((current_date+3)+time '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',((current_date+3)+time '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',current_date+3,false,60,'c53-brand-a','c53-platform',((current_date+3)+time '08:30') AT TIME ZONE 'Asia/Ho_Chi_Minh','scheduled','C5.3 Open A',1,0,0),
  ('c53-open-shift-b',current_date+3,'09:00','10:00',((current_date+3)+time '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',((current_date+3)+time '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',current_date+3,false,60,'c53-brand-b','c53-platform',((current_date+3)+time '08:30') AT TIME ZONE 'Asia/Ho_Chi_Minh','scheduled','C5.3 Open B',1,0,0);
INSERT INTO public.shifts (
  id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,
  brand_id,platform_id,registration_cutoff_at,status,title,studio,required_host_count,required_support_count,required_technical_count
) VALUES (
  'c53-identity-parallel',current_date+3,'09:00','10:00',((current_date+3)+time '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
  ((current_date+3)+time '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',current_date+3,false,60,'c53-brand-a','c53-platform',
  ((current_date+3)+time '08:30') AT TIME ZONE 'Asia/Ho_Chi_Minh','completed','C5.3 Parallel Studio','studio b',0,0,0
);
DO $identity$
DECLARE duplicate_rejected boolean := false; rejected_constraint text;
BEGIN
  BEGIN
    INSERT INTO public.shifts (
      id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,
      brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count
    ) VALUES (
      'c53-identity-duplicate',current_date+3,'09:00','10:00',((current_date+3)+time '09:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
      ((current_date+3)+time '10:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',current_date+3,false,60,'c53-brand-a','c53-platform',
      ((current_date+3)+time '08:30') AT TIME ZONE 'Asia/Ho_Chi_Minh','completed','C5.3 Duplicate Identity',0,0,0
    );
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS rejected_constraint = CONSTRAINT_NAME;
    IF rejected_constraint IS DISTINCT FROM 'shifts_active_identity_uidx' THEN RAISE; END IF;
    duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN RAISE EXCEPTION 'C5_3_DUPLICATE_SHIFT_IDENTITY_ALLOWED'; END IF;
  IF (SELECT count(*) FROM public.shifts WHERE id IN ('c53-open-shift-a','c53-identity-parallel')) <> 2 THEN
    RAISE EXCEPTION 'C5_3_LEGACY_SHIFT_READ_FIELDS_MISSING';
  END IF;
END
$identity$;

INSERT INTO public.reports (id,shift_id,status,submitted_by,metrics_confirmed,revenue)
VALUES
  ('c53-report-a','c53-report-shift-a','draft','c4-rehearsal-member',false,100),
  ('c53-report-b','c53-report-shift-b','draft','c4-rehearsal-admin',false,200),
  ('c53-report-c','c53-report-shift-c','draft','c4-rehearsal-admin',false,300);
INSERT INTO public.report_revisions (id,report_id,version,status,event,created_by,metrics)
VALUES
  ('c53-revision-a','c53-report-a',1,'draft','created','c4-rehearsal-member','{"synthetic":true}'::jsonb),
  ('c53-revision-b','c53-report-b',1,'draft','created','c4-rehearsal-admin','{"synthetic":true}'::jsonb),
  ('c53-revision-c','c53-report-c',1,'draft','created','c4-rehearsal-admin','{"synthetic":true}'::jsonb);
INSERT INTO public.report_images (id,report_id,image_url,storage_path,original_name,mime_type,size_bytes,image_type,uploaded_by)
VALUES
  ('c53-image-a','c53-report-a','https://synthetic.invalid/c53-a.jpg','c53/report-a/a.jpg','a.jpg','image/jpeg',123,'dashboard','c4-rehearsal-admin'),
  ('c53-image-b','c53-report-b','https://synthetic.invalid/c53-b.jpg','c53/report-b/b.jpg','b.jpg','image/jpeg',123,'dashboard','c4-rehearsal-admin'),
  ('c53-image-c','c53-report-c','https://synthetic.invalid/c53-c.jpg','c53/report-c/c.jpg','c.jpg','image/jpeg',123,'dashboard','c4-rehearsal-admin');

SET ROLE authenticated;
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-a','reports.read',true,0,statement_timestamp(),NULL,'C5.3 synthetic active scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-a','reports.export',true,0,statement_timestamp(),NULL,'C5.3 synthetic active scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-a','shifts.read',true,0,statement_timestamp(),NULL,'C5.3 synthetic active scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-a','shifts.manage',true,0,statement_timestamp(),NULL,'C5.3 synthetic active scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-b','reports.read',true,0,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','C5.3 synthetic expired scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-b','reports.export',true,0,statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour','C5.3 synthetic expired scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-c','reports.read',true,0,statement_timestamp(),NULL,'C5.3 synthetic revoke scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-c','reports.export',true,0,statement_timestamp(),NULL,'C5.3 synthetic revoke scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-c','reports.read',false,1,statement_timestamp(),NULL,'C5.3 synthetic revoke scope');
SELECT public.rc19_set_leader_brand_scope('c4-rehearsal-leader','c53-brand-c','reports.export',false,1,statement_timestamp(),NULL,'C5.3 synthetic revoke scope');
SELECT public.add_shift_operational_note('c53-open-shift-a',current_date+3,'normal','C5.3 synthetic note',statement_timestamp(),'host','c4-rehearsal-member');
RESET ROLE;
RESET request.jwt.claim.sub;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c4c00000-0000-4000-8000-000000000001';
DO $admin$
DECLARE bundle jsonb;
BEGIN
  IF (SELECT count(*) FROM public.reports WHERE id LIKE 'c53-report-%') <> 3
     OR (SELECT count(*) FROM public.report_revisions WHERE report_id LIKE 'c53-report-%') <> 3
     OR (SELECT count(*) FROM public.report_images WHERE report_id LIKE 'c53-report-%') <> 3 THEN
    RAISE EXCEPTION 'C5_3_ADMIN_GLOBAL_REPORT_RLS_FAILED';
  END IF;
  bundle := public.rc19_export_report_bundle(ARRAY['c53-report-a','c53-report-b','c53-report-c'],'reports');
  IF jsonb_array_length(bundle->'reports') <> 3 OR jsonb_array_length(bundle->'images') <> 0 THEN
    RAISE EXCEPTION 'C5_3_ADMIN_GLOBAL_EXPORT_FAILED';
  END IF;
  IF (SELECT count(*) FROM private.filtered_shift_ids('open','{}'::jsonb)) <> 2 THEN
    RAISE EXCEPTION 'C5_3_ADMIN_OPEN_SHIFT_SELECTION_FAILED';
  END IF;
  IF jsonb_array_length(public.search_staffing_candidates('c53-open-shift-a','host','',20,0)->'items') < 1 THEN
    RAISE EXCEPTION 'C5_3_ADMIN_STAFFING_CANDIDATE_READ_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.shift_operational_notes WHERE shift_id='c53-open-shift-a') <> 1 THEN
    RAISE EXCEPTION 'C5_3_ADMIN_NOTE_READ_FAILED';
  END IF;
END
$admin$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c4c00000-0000-4000-8000-000000000002';
DO $leader$
DECLARE bundle jsonb; image_bundle jsonb; blocked boolean;
BEGIN
  IF (SELECT count(*) FROM public.reports WHERE id LIKE 'c53-report-%') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='c53-report-a')
     OR EXISTS (SELECT 1 FROM public.reports WHERE id IN ('c53-report-b','c53-report-c')) THEN
    RAISE EXCEPTION 'C5_3_LEADER_REPORT_BRAND_RLS_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.report_revisions WHERE report_id LIKE 'c53-report-%') <> 1
     OR (SELECT count(*) FROM public.report_images WHERE report_id LIKE 'c53-report-%') <> 1 THEN
    RAISE EXCEPTION 'C5_3_LEADER_CHILD_REPORT_RLS_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.shift_operational_notes WHERE shift_id LIKE 'c53-open-shift-%') <> 1 THEN
    RAISE EXCEPTION 'C5_3_LEADER_SHIFT_NOTE_SCOPE_FAILED';
  END IF;
  bundle := public.rc19_export_report_bundle(ARRAY['c53-report-a'],'report');
  IF jsonb_array_length(bundle->'reports') <> 1 OR bundle->'reports'->0->>'id' <> 'c53-report-a' THEN
    RAISE EXCEPTION 'C5_3_LEADER_SCOPED_EXPORT_FAILED';
  END IF;
  image_bundle := public.rc19_export_report_bundle(ARRAY['c53-report-a'],'images');
  IF jsonb_array_length(image_bundle->'images') <> 1 OR image_bundle->'images'->0->>'report_id' <> 'c53-report-a' THEN
    RAISE EXCEPTION 'C5_3_LEADER_IMAGE_EXPORT_SCOPE_FAILED';
  END IF;
  blocked := false;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-report-b'],'report'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_EXPIRED_SCOPE_EXPORT_ALLOWED'; END IF;
  blocked := false;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-report-c'],'report'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_REVOKED_SCOPE_EXPORT_ALLOWED'; END IF;
  blocked := false;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-report-a','c53-report-b'],'reports'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_MIXED_BRAND_EXPORT_ALLOWED'; END IF;
  blocked := false;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-forged-report'],'report'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_FORGED_REPORT_EXPORT_ALLOWED'; END IF;
  IF (SELECT count(*) FROM private.filtered_shift_ids('open','{}'::jsonb)) <> 1 THEN
    RAISE EXCEPTION 'C5_3_LEADER_OPEN_SHIFT_SCOPE_FAILED';
  END IF;
  IF jsonb_array_length(public.search_staffing_candidates('c53-open-shift-a','host','',20,0)->'items') < 1 THEN
    RAISE EXCEPTION 'C5_3_LEADER_STAFFING_CANDIDATE_READ_FAILED';
  END IF;
  blocked := false;
  BEGIN PERFORM public.search_staffing_candidates('c53-open-shift-b','host','',20,0); EXCEPTION WHEN SQLSTATE 'P0001' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_FOREIGN_BRAND_STAFFING_ALLOWED'; END IF;
END
$leader$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c4c00000-0000-4000-8000-000000000003';
DO $member$
DECLARE blocked boolean := false;
BEGIN
  IF (SELECT count(*) FROM public.reports WHERE id LIKE 'c53-report-%') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.reports WHERE id='c53-report-a') THEN
    RAISE EXCEPTION 'C5_3_MEMBER_OWN_REPORT_READ_FAILED';
  END IF;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-report-a'],'report'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_MEMBER_EXPORT_ALLOWED'; END IF;
  blocked := false;
  BEGIN PERFORM public.search_staffing_candidates('c53-open-shift-a','host','',20,0); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_MEMBER_STAFFING_CANDIDATE_ALLOWED'; END IF;
END
$member$;
COMMIT;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c4c00000-0000-4000-8000-00000000dead';
DO $forged$
DECLARE blocked boolean := false;
BEGIN
  IF private.current_business_user_id() IS NOT NULL
     OR (SELECT count(*) FROM public.reports WHERE id LIKE 'c53-report-%') <> 0 THEN
    RAISE EXCEPTION 'C5_3_FORGED_ACTOR_READ_ALLOWED';
  END IF;
  BEGIN PERFORM public.rc19_export_report_bundle(ARRAY['c53-report-a'],'report'); EXCEPTION WHEN SQLSTATE '42501' THEN blocked := true; END;
  IF NOT blocked THEN RAISE EXCEPTION 'C5_3_FORGED_ACTOR_EXPORT_ALLOWED'; END IF;
END
$forged$;
COMMIT;

SELECT 'C5_3_C3_REPORT_RLS_EXPORT_ROLES: PASS';
SELECT 'C5_3_SHIFT_NOTES_OPEN_SELECTION_STAFFING_SCOPE: PASS';
