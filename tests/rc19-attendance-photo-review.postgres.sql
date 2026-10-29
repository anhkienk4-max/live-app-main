set role authenticated;
select set_config('rc19.test_actor','leader-1',false);
select public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0008',0,1,'approved','Authenticated reviewer role grant','cccccccc-cccc-4ccc-8ccc-cccccccc0010');
do $$ begin
  begin perform count(*) from public.self_attendance_photo_review_events;
    raise exception 'authenticated role can read review rows directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ declare v jsonb; begin
  perform set_config('rc19.test_actor','leader-1',false);
  v:=public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',0,1,'approved','Image and timestamp verified','cccccccc-cccc-4ccc-8ccc-cccccccc0001');
  if v->>'version'<>'1' or v->>'evidence_revision'<>'1' or v->>'decision'<>'approved' then raise exception 'positive review failed: %',v; end if;
  v:=public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',0,1,'approved','Image and timestamp verified','cccccccc-cccc-4ccc-8ccc-cccccccc0001');
  if v->>'replayed'<>'true' then raise exception 'idempotent replay failed: %',v; end if;
  perform set_config('rc19.test_actor','leader-2',false);
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',0,1,'approved','Image and timestamp verified','cccccccc-cccc-4ccc-8ccc-cccccccc0001');
    raise exception 'out-of-scope idempotent replay was accepted';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  if has_table_privilege('authenticated','public.self_attendance_photo_review_events','select') or
     has_table_privilege('authenticated','public.self_attendance_photo_evidence_revisions','select') or
     has_table_privilege('anon','public.self_attendance_photo_evidence_revisions','insert') then
    raise exception 'direct review/evidence table access was granted';
  end if;
  if not has_function_privilege('authenticated','public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid)','execute') or
     has_function_privilege('anon','public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid)','execute') then
    raise exception 'review RPC grants are invalid';
  end if;
end $$;

do $$ begin
  perform set_config('rc19.test_actor','member-1',false);
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',0,1,'approved','Self review denied','cccccccc-cccc-4ccc-8ccc-cccccccc0002');
    raise exception 'member reviewer was accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('rc19.test_actor','leader-1',false);
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002',0,1,'approved','Self review denied','cccccccc-cccc-4ccc-8ccc-cccccccc0003');
    raise exception 'self review was accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('rc19.test_actor','leader-2',false);
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',0,1,'approved','Out of scope denied','cccccccc-cccc-4ccc-8ccc-cccccccc0004');
    raise exception 'out-of-scope review was accepted';
  exception when insufficient_privilege then null; end;
end $$;

do $$ declare v jsonb; c jsonb; begin
  perform set_config('rc19.test_actor','leader-1',false);
  v:=public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',0,1,'correction_requested','Please provide a clearer image','cccccccc-cccc-4ccc-8ccc-cccccccc0005');
  if v->>'decision'<>'correction_requested' then raise exception 'correction request failed'; end if;
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,1,'approved','No revision exists yet','cccccccc-cccc-4ccc-8ccc-cccccccc0006');
    raise exception 'review without a new evidence revision was accepted';
  exception when check_violation then null; end;

  perform set_config('rc19.test_actor','member-1',false);
  c:=public.get_self_attendance_photo_correction_context('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005');
  if c->>'previous_request_id'<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005' or c->>'expected_revision'<>'1' then
    raise exception 'owner correction context invalid: %',c;
  end if;
  v:=public.commit_self_attendance_photo_correction(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005','dddddddd-dddd-4ddd-8ddd-dddddddd0005',
    'drive-file-revision-2','private-folder-123456','attendance-correction-r2.jpg',32000,repeat('b',64),
    '{"sanitized":true}'::jsonb,'file_picker');
  if v->>'revision'<>'2' or v->>'replayed'<>'false' then raise exception 'revision insert failed: %',v; end if;
  v:=public.commit_self_attendance_photo_correction(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005','dddddddd-dddd-4ddd-8ddd-dddddddd0005',
    'drive-file-revision-2','private-folder-123456','attendance-correction-r2.jpg',32000,repeat('b',64),
    '{"sanitized":true}'::jsonb,'file_picker');
  if v->>'replayed'<>'true' then raise exception 'correction request retry was not idempotent'; end if;
  if (select checksum_sha256 from public.self_attendance_photo_evidence where request_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005')=repeat('b',64)
     or (select count(*) from public.self_attendance_photo_evidence where request_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005')<>1 then
    raise exception 'original evidence changed or was lost';
  end if;
  begin update public.self_attendance_photo_evidence set checksum_sha256=repeat('b',64) where request_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005';
    raise exception 'original evidence update was accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.commit_self_attendance_photo_correction(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005','dddddddd-dddd-4ddd-8ddd-dddddddd0006',
    'drive-file-revision-3','private-folder-123456','attendance-correction-r3.jpg',32000,repeat('b',64),
    '{"sanitized":true}'::jsonb,'file_picker');
    raise exception 'duplicate correction image was accepted';
  exception when unique_violation then null; end;

  perform set_config('rc19.test_actor','member-1',false);
  begin perform public.get_self_attendance_photo_correction_context('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002');
    raise exception 'non-owner member correction context was accepted';
  exception when insufficient_privilege then null; end;

  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,1,'approved','Stale evidence revision denied','cccccccc-cccc-4ccc-8ccc-cccccccc0008');
    raise exception 'stale evidence revision was accepted';
  exception when serialization_failure then null; end;
  v:=public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',1,2,'approved','Corrected evidence verified','cccccccc-cccc-4ccc-8ccc-cccccccc0009');
  if v->>'evidence_revision'<>'2' or v->>'decision'<>'approved' then raise exception 'new revision review failed: %',v; end if;

  begin update public.self_attendance_photo_evidence_revisions set file_name='overwritten.jpg' where request_id='dddddddd-dddd-4ddd-8ddd-dddddddd0005';
    raise exception 'evidence revision update was accepted';
  exception when insufficient_privilege then null; end;
end $$;

do $$ begin
  perform set_config('rc19.test_actor','leader-1',false);
  begin perform public.review_self_attendance_photo('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001',1,1,'rejected','Terminal decision cannot change','cccccccc-cccc-4ccc-8ccc-cccccccc0007');
    raise exception 'terminal review transition was accepted';
  exception when check_violation then null; end;
  if (select count(*) from public.workforce_actual_segments)<>0 or (select count(*) from public.payroll_lines)<>0 then
    raise exception 'review modified Actual Staffing or Payroll';
  end if;
  if (select verification_status from public.self_attendance_events where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001')<>'pending_verification' then
    raise exception 'raw attendance was changed by review';
  end if;
end $$;
