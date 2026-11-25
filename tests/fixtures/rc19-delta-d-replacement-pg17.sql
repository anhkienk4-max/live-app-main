\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'rc19_delta_d_persisted_v3_20261125' OR
    shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') <>
      'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125' OR
    current_setting('server_version_num')::int NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'DELTA_D_DISPOSABLE_IDENTITY_REQUIRED';
  END IF;
END $$;
BEGIN;
DO $$
DECLARE
  base public.shifts%ROWTYPE;
  actor public.business_users%ROWTYPE;
  old_user text;
  new_user text;
  old_registration public.shift_registrations%ROWTYPE;
  result jsonb;
  retry jsonb;
  effective timestamptz := statement_timestamp();
  target_date date := (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 30;
  start_time timestamptz;
  expected_shift_version integer;
  key uuid := 'dddddddd-1111-4111-8111-111111111111';
BEGIN
  SELECT * INTO STRICT base FROM public.shifts WHERE status='scheduled' ORDER BY id LIMIT 1;
  SELECT * INTO STRICT actor FROM public.business_users WHERE system_permission='admin'
    AND status='active' AND account_status='active' AND archived_at IS NULL AND deleted_at IS NULL
    AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1;
  SELECT id INTO STRICT old_user FROM public.business_users WHERE operational_roles @> ARRAY['host']::text[]
    AND status='active' AND account_status='active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY id LIMIT 1;
  SELECT id INTO STRICT new_user FROM public.business_users WHERE operational_roles @> ARRAY['host']::text[]
    AND status='active' AND account_status='active' AND archived_at IS NULL AND deleted_at IS NULL AND id<>old_user ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor.auth_user_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  start_time := (target_date::timestamp + time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  INSERT INTO public.shifts(id,date,start_time,end_time,timezone,start_at,end_at,end_date,crosses_midnight,duration_minutes,
    brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count)
  VALUES ('delta-d-shift',target_date,'08:00','12:00','Asia/Ho_Chi_Minh',start_time,start_time+interval '4 hours',target_date,false,240,
    base.brand_id,base.platform_id,start_time-interval '1 hour','scheduled','Delta D synthetic',1,0,0);
  INSERT INTO public.shift_staffing_segments(id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,created_by)
  VALUES ('delta-d-segment','delta-d-shift',1,start_time,start_time+interval '4 hours',1,0,0,actor.id);
  SELECT * INTO old_registration FROM public.manual_assign_shift_staff_to_segment('delta-d-shift',old_user,'host',
    'Delta D fixture',(SELECT version FROM public.shifts WHERE id='delta-d-shift'),'delta-d-segment');
  SELECT version INTO expected_shift_version FROM public.shifts WHERE id='delta-d-shift';
  result := public.replace_shift_assignment_with_incident_v1('delta-d-shift','delta-d-segment',old_registration.id,new_user,'host',
    expected_shift_version,old_registration.version,effective,'Synthetic replacement',false,key,'skip',NULL);
  IF result->'canonical_incident'->>'original_staff_id' IS DISTINCT FROM old_user OR
     result->'canonical_incident'->>'replacement_staff_id' IS DISTINCT FROM new_user OR
     result->'canonical_incident'->>'review_state' IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'DELTA_D_INCIDENT_ATTRIBUTION_FAILED';
  END IF;
  retry := public.replace_shift_assignment_with_incident_v1('delta-d-shift','delta-d-segment',old_registration.id,new_user,'host',
    expected_shift_version,old_registration.version,effective,'Synthetic replacement',false,key,'skip',NULL);
  IF retry->'canonical_incident'->>'id' IS DISTINCT FROM result->'canonical_incident'->>'id' OR
     (retry->>'replayed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'DELTA_D_REPLAY_FAILED'; END IF;
END $$;
COMMIT;
