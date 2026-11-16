DO $identity$
BEGIN
  IF current_database() <> 'rc19_w4_legacy_20261115_01'
    OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()), 'pg_database')
      <> 'CODEX_DISPOSABLE_RC19_W4_LEGACY_SEGMENT_TEST_ONLY'
    OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999 THEN
    RAISE EXCEPTION 'W4_LEGACY_SEGMENT_DISPOSABLE_PG17_IDENTITY_REQUIRED';
  END IF;
END;
$identity$;

BEGIN;
DO $test$
DECLARE
  base_shift public.shifts%ROWTYPE;
  actor_id text;
  legacy_user_id text;
  assignment_user_id text;
  replacement_user_id text;
  mapped_id text;
  legacy_id text;
  assigned public.shift_registrations%ROWTYPE;
  replacement_result jsonb;
BEGIN
  SELECT * INTO STRICT base_shift FROM public.shifts WHERE status='scheduled' ORDER BY id LIMIT 1;
  SELECT id INTO STRICT actor_id FROM public.business_users
  WHERE system_permission = 'admin' AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL
  ORDER BY id LIMIT 1;
  SELECT id INTO STRICT legacy_user_id FROM public.business_users
  WHERE operational_roles @> ARRAY['host']::text[] AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL
  ORDER BY id OFFSET 0 LIMIT 1;
  SELECT id INTO STRICT assignment_user_id FROM public.business_users
  WHERE operational_roles @> ARRAY['host']::text[] AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL
  ORDER BY id OFFSET 1 LIMIT 1;
  SELECT id INTO STRICT replacement_user_id FROM public.business_users
  WHERE operational_roles @> ARRAY['host']::text[] AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL
  ORDER BY id OFFSET 2 LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',
    ((SELECT auth_user_id FROM public.business_users WHERE id=actor_id)::text), true);

  INSERT INTO public.shifts (
    id,date,start_time,end_time,timezone,start_at,end_at,end_date,crosses_midnight,duration_minutes,
    brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,
    required_support_count,required_technical_count,host_id,support_id,technical_id
  ) VALUES
    ('w4-legacy-zero',DATE '2026-11-16',TIME '10:00',TIME '12:00','Asia/Ho_Chi_Minh',
     TIMESTAMPTZ '2026-11-16 10:00:00+07',TIMESTAMPTZ '2026-11-16 12:00:00+07',DATE '2026-11-16',false,120,
     base_shift.brand_id,base_shift.platform_id,TIMESTAMPTZ '2026-11-16 09:00:00+07','scheduled','W4 legacy zero segment',1,0,0,NULL,NULL,NULL),
    ('w4-legacy-one',DATE '2026-11-16',TIME '12:00',TIME '14:00','Asia/Ho_Chi_Minh',
     TIMESTAMPTZ '2026-11-16 12:00:00+07',TIMESTAMPTZ '2026-11-16 14:00:00+07',DATE '2026-11-16',false,120,
     base_shift.brand_id,base_shift.platform_id,TIMESTAMPTZ '2026-11-16 11:00:00+07','scheduled','W4 legacy one segment',1,0,0,NULL,NULL,NULL),
    ('w4-legacy-multi',DATE '2026-11-16',TIME '14:00',TIME '16:00','Asia/Ho_Chi_Minh',
     TIMESTAMPTZ '2026-11-16 14:00:00+07',TIMESTAMPTZ '2026-11-16 16:00:00+07',DATE '2026-11-16',false,120,
     base_shift.brand_id,base_shift.platform_id,TIMESTAMPTZ '2026-11-16 13:00:00+07','scheduled','W4 legacy overlapping segments',1,0,0,NULL,NULL,NULL),
    ('w4-legacy-incompatible',DATE '2026-11-16',TIME '16:00',TIME '18:00','Asia/Ho_Chi_Minh',
     TIMESTAMPTZ '2026-11-16 16:00:00+07',TIMESTAMPTZ '2026-11-16 18:00:00+07',DATE '2026-11-16',false,120,
     base_shift.brand_id,base_shift.platform_id,TIMESTAMPTZ '2026-11-16 15:00:00+07','scheduled','W4 incompatible role',1,0,0,NULL,NULL,NULL),
    ('w4-legacy-overnight',DATE '2026-11-16',TIME '23:00',TIME '01:00','Asia/Ho_Chi_Minh',
     TIMESTAMPTZ '2026-11-16 23:00:00+07',TIMESTAMPTZ '2026-11-17 01:00:00+07',DATE '2026-11-17',true,120,
     base_shift.brand_id,base_shift.platform_id,TIMESTAMPTZ '2026-11-16 22:00:00+07','scheduled','W4 overnight segment',1,0,0,NULL,NULL,NULL);

  INSERT INTO public.shift_staffing_segments (
    id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,
    required_technical_count,created_by
  ) VALUES
    ('w4-seg-one','w4-legacy-one',1,TIMESTAMPTZ '2026-11-16 12:00:00+07',TIMESTAMPTZ '2026-11-16 14:00:00+07',1,0,0,actor_id),
    ('w4-seg-multi-a','w4-legacy-multi',1,TIMESTAMPTZ '2026-11-16 14:00:00+07',TIMESTAMPTZ '2026-11-16 15:15:00+07',2,0,0,actor_id),
    ('w4-seg-multi-b','w4-legacy-multi',2,TIMESTAMPTZ '2026-11-16 15:00:00+07',TIMESTAMPTZ '2026-11-16 16:00:00+07',1,0,0,actor_id),
    ('w4-seg-incompatible','w4-legacy-incompatible',1,TIMESTAMPTZ '2026-11-16 16:00:00+07',TIMESTAMPTZ '2026-11-16 18:00:00+07',0,1,0,actor_id),
    ('w4-seg-overnight','w4-legacy-overnight',1,TIMESTAMPTZ '2026-11-16 23:15:00+07',TIMESTAMPTZ '2026-11-17 00:15:00+07',1,0,0,actor_id);

  -- Seed an old-format row before enabling the current insert guard to model pre-C511 history.
  EXECUTE 'ALTER TABLE public.shift_registrations DISABLE TRIGGER USER';
  INSERT INTO public.shift_registrations(id,shift_id,user_id,operational_role,status,source)
  VALUES ('w4-legacy-parent-old','w4-legacy-multi',legacy_user_id,'host','manually_assigned','manual_assignment');
  EXECUTE 'ALTER TABLE public.shift_registrations ENABLE TRIGGER USER';

  INSERT INTO public.shift_registrations(shift_id,user_id,operational_role,status,source)
  VALUES ('w4-legacy-zero',actor_id,'host','manually_assigned','manual_assignment')
  RETURNING id,staffing_segment_id INTO legacy_id,mapped_id;
  IF mapped_id IS NOT NULL THEN RAISE EXCEPTION 'ZERO_SEGMENT_PARENT_ASSIGNMENT_CHANGED'; END IF;

  INSERT INTO public.shift_registrations(shift_id,user_id,operational_role,status,source)
  VALUES ('w4-legacy-one',actor_id,'host','manually_assigned','manual_assignment')
  RETURNING staffing_segment_id INTO mapped_id;
  IF mapped_id IS DISTINCT FROM 'w4-seg-one' THEN RAISE EXCEPTION 'SINGLE_SEGMENT_ASSIGNMENT_NOT_MAPPED'; END IF;

  INSERT INTO public.shift_registrations(shift_id,user_id,operational_role,status,source)
  VALUES ('w4-legacy-overnight',actor_id,'host','manually_assigned','manual_assignment')
  RETURNING staffing_segment_id INTO mapped_id;
  IF mapped_id IS DISTINCT FROM 'w4-seg-overnight' THEN RAISE EXCEPTION 'OVERNIGHT_SEGMENT_ASSIGNMENT_NOT_MAPPED'; END IF;

  BEGIN
    INSERT INTO public.shift_registrations(shift_id,user_id,operational_role,status,source)
    VALUES ('w4-legacy-multi',actor_id,'host','pending','self_registration');
    RAISE EXCEPTION 'AMBIGUOUS_PARENT_ASSIGNMENT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    IF SQLERRM NOT LIKE '%STAFFING_SEGMENT_SELECTION_REQUIRED%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.shift_registrations(shift_id,user_id,operational_role,status,source)
    VALUES ('w4-legacy-incompatible',actor_id,'host','pending','self_registration');
    RAISE EXCEPTION 'ROLE_INCOMPATIBLE_PARENT_ASSIGNMENT_WAS_ACCEPTED';
  EXCEPTION WHEN SQLSTATE '23514' THEN
    IF SQLERRM NOT LIKE '%STAFFING_SEGMENT_ROLE_INCOMPATIBLE%' THEN RAISE; END IF;
  END;

  SELECT * INTO assigned
  FROM public.manual_assign_shift_staff_to_segment(
    'w4-legacy-multi', assignment_user_id, 'host', 'W4 disposable segment assignment',
    (SELECT version FROM public.shifts WHERE id='w4-legacy-multi'), 'w4-seg-multi-a'
  );
  IF assigned.staffing_segment_id IS DISTINCT FROM 'w4-seg-multi-a'
    OR assigned.status <> 'manually_assigned' THEN
    RAISE EXCEPTION 'EXPLICIT_SEGMENT_ASSIGNMENT_NOT_PERSISTED';
  END IF;

  replacement_result := public.replace_shift_assignment(
    'w4-legacy-multi','w4-seg-multi-a','w4-legacy-parent-old',replacement_user_id,'host',
    (SELECT version FROM public.shifts WHERE id='w4-legacy-multi'),1,statement_timestamp(),
    'W4 explicit legacy mapping confirmation',false,gen_random_uuid()
  );
  IF replacement_result->>'staffing_segment_id' <> 'w4-seg-multi-a'
    OR (SELECT staffing_segment_id FROM public.shift_registrations WHERE id='w4-legacy-parent-old') IS NOT NULL
    OR (SELECT old_assignment_snapshot->>'staffing_segment_id' FROM public.rc19_shift_assignment_replacements
        WHERE id=(replacement_result->>'replacement_id')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'LEGACY_REPLACEMENT_MAPPING_OR_HISTORY_INVALID';
  END IF;

  IF (SELECT staffing_segment_id FROM public.shift_registrations WHERE id=legacy_id) IS NOT NULL THEN
    RAISE EXCEPTION 'LEGACY_PARENT_ASSIGNMENT_WAS_REWRITTEN';
  END IF;
END;
$test$;
ROLLBACK;

\echo W4_LEGACY_SEGMENT_PG17_PASS
