-- RC19 #130 proposal only. Do not apply before separate migration approval.
-- Review decisions are append-only and independent of Workforce Actual/Payroll.
begin;

create table if not exists public.self_attendance_photo_review_events (
  id uuid primary key default gen_random_uuid(),
  attendance_event_id uuid not null references public.self_attendance_events(id),
  evidence_request_id uuid not null,
  reviewer_id text not null references public.business_users(id),
  decision text not null check (decision in ('approved','rejected','correction_requested')),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  version integer not null check (version > 0),
  evidence_revision integer not null check (evidence_revision > 0),
  idempotency_key uuid not null unique,
  created_at timestamptz not null default statement_timestamp(),
  unique (attendance_event_id, version)
);
create index if not exists self_attendance_photo_review_event_version_idx
  on public.self_attendance_photo_review_events(attendance_event_id, version desc);
alter table public.self_attendance_photo_review_events enable row level security;
revoke all on public.self_attendance_photo_review_events from public, anon, authenticated;
grant select, insert on public.self_attendance_photo_review_events to service_role;
drop trigger if exists self_attendance_photo_review_immutable on public.self_attendance_photo_review_events;
create trigger self_attendance_photo_review_immutable
  before update or delete on public.self_attendance_photo_review_events
  for each row execute function private.reject_self_attendance_mutation();

-- Correction uploads are separate immutable provider references. The original
-- self_attendance_photo_evidence row remains the attendance proof forever.
create table if not exists public.self_attendance_photo_evidence_revisions (
  id uuid primary key default gen_random_uuid(),
  attendance_event_id uuid not null references public.self_attendance_events(id),
  request_id uuid not null unique,
  previous_request_id uuid not null,
  revision integer not null check (revision > 1),
  submitted_by text not null references public.business_users(id),
  provider text not null default 'google_drive' check (provider='google_drive'),
  external_file_id text not null unique check (char_length(external_file_id) between 8 and 512),
  external_parent_id text not null check (char_length(external_parent_id) between 8 and 512),
  file_name text not null check (char_length(file_name) between 16 and 255),
  mime_type text not null check (mime_type='image/jpeg'),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  shift_context jsonb not null check (jsonb_typeof(shift_context)='object'),
  capture_source text not null check (capture_source in ('camera','file_picker')),
  created_at timestamptz not null default statement_timestamp(),
  unique (attendance_event_id,revision)
);
create index if not exists self_attendance_photo_revision_event_idx
  on public.self_attendance_photo_evidence_revisions(attendance_event_id,revision desc);
alter table public.self_attendance_photo_evidence_revisions enable row level security;
revoke all on public.self_attendance_photo_evidence_revisions from public,anon,authenticated;
grant select,insert on public.self_attendance_photo_evidence_revisions to service_role;
drop trigger if exists self_attendance_photo_revision_immutable on public.self_attendance_photo_evidence_revisions;
create trigger self_attendance_photo_revision_immutable
  before update or delete on public.self_attendance_photo_evidence_revisions
  for each row execute function private.reject_self_attendance_mutation();

create or replace function public.get_self_attendance_photo_correction_context(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text;
  v_event public.self_attendance_events;
  v_shift public.shifts;
  v_latest public.self_attendance_photo_review_events;
  v_revision public.self_attendance_photo_evidence_revisions;
  v_previous_request_id uuid;
  v_staff_name text;
  v_brand_name text;
  v_platform_name text;
begin
  v_actor := private.require_shift_actor(false);
  select * into v_event from public.self_attendance_events where id=p_event_id;
  if not found or v_event.staff_id<>v_actor or not private.can_read_shift(v_event.shift_id) then
    raise exception using errcode='42501',message='ATTENDANCE_CORRECTION_SCOPE_DENIED';
  end if;
  if not exists(select 1 from public.self_attendance_photo_evidence e
      where e.request_id=v_event.request_id and e.shift_id=v_event.shift_id
        and e.staff_id=v_event.staff_id and e.operational_role=v_event.operational_role
        and e.event_kind=v_event.event_kind) then
    raise exception using errcode='23514',message='ATTENDANCE_REVIEW_EVIDENCE_NOT_FOUND';
  end if;
  select * into v_latest from public.self_attendance_photo_review_events
    where attendance_event_id=p_event_id order by version desc limit 1;
  if not found or v_latest.decision<>'correction_requested' then
    raise exception using errcode='23514',message='ATTENDANCE_CORRECTION_NOT_REQUESTED';
  end if;
  select * into v_revision from public.self_attendance_photo_evidence_revisions
    where attendance_event_id=p_event_id order by revision desc limit 1;
  v_previous_request_id := coalesce(v_revision.request_id,v_event.request_id);
  if v_previous_request_id<>v_latest.evidence_request_id then
    raise exception using errcode='23514',message='ATTENDANCE_CORRECTION_ALREADY_SUBMITTED';
  end if;
  select * into v_shift from public.shifts where id=v_event.shift_id;
  select full_name into v_staff_name from public.business_users where id=v_actor;
  select name into v_brand_name from public.brands where id=v_shift.brand_id;
  select name into v_platform_name from public.platforms where id=v_shift.platform_id;
  return jsonb_build_object(
    'event_id',v_event.id,'shift_id',v_event.shift_id,'staff_id',v_actor,
    'role',v_event.operational_role,'event',v_event.event_kind,
    'date',v_shift.date,'start_time',v_shift.start_time,'end_time',v_shift.end_time,
    'start_at',v_shift.start_at,'end_at',v_shift.end_at,
    'brand',coalesce(v_brand_name,v_shift.brand_id),'platform',coalesce(v_platform_name,v_shift.platform_id),
    'studio',v_shift.studio,'title',v_shift.title,'staff_name',coalesce(v_staff_name,v_actor),
    'previous_request_id',v_previous_request_id,'expected_revision',coalesce(v_revision.revision,1)
  );
end;
$$;
revoke all on function public.get_self_attendance_photo_correction_context(uuid) from public,anon,authenticated;
grant execute on function public.get_self_attendance_photo_correction_context(uuid) to authenticated;

create or replace function public.commit_self_attendance_photo_correction(
  p_event_id uuid,p_expected_revision integer,p_previous_request_id uuid,p_request_id uuid,
  p_external_file_id text,p_external_parent_id text,p_file_name text,p_size_bytes integer,
  p_checksum_sha256 text,p_shift_context jsonb,p_capture_source text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text;
  v_event public.self_attendance_events;
  v_latest public.self_attendance_photo_review_events;
  v_revision public.self_attendance_photo_evidence_revisions;
  v_previous_request_id uuid;
  v_next_revision integer;
begin
  v_actor := private.require_shift_actor(false);
  if p_event_id is null or p_request_id is null or p_previous_request_id is null
     or p_expected_revision is null or p_expected_revision < 1
     or p_external_file_id is null or char_length(p_external_file_id) not between 8 and 512
     or p_external_parent_id is null or char_length(p_external_parent_id) not between 8 and 512
     or p_file_name is null or char_length(p_file_name) not between 16 and 255
     or p_size_bytes is null or p_size_bytes not between 1 and 4194304
     or p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_shift_context)<>'object'
     or p_capture_source not in ('camera','file_picker') then
    raise exception using errcode='22023',message='ATTENDANCE_CORRECTION_REQUEST_INVALID';
  end if;

  select * into v_event from public.self_attendance_events where id=p_event_id for update;
  if not found or v_event.staff_id<>v_actor or not private.can_read_shift(v_event.shift_id) then
    raise exception using errcode='42501',message='ATTENDANCE_CORRECTION_SCOPE_DENIED';
  end if;

  -- A network retry with the same request UUID returns its original revision.
  select * into v_revision from public.self_attendance_photo_evidence_revisions where request_id=p_request_id;
  if found then
    if v_revision.attendance_event_id<>p_event_id or v_revision.submitted_by<>v_actor
       or v_revision.checksum_sha256<>p_checksum_sha256 then
      raise exception using errcode='23505',message='ATTENDANCE_CORRECTION_REQUEST_REUSED';
    end if;
    return jsonb_build_object('event_id',p_event_id,'revision',v_revision.revision,'request_id',p_request_id,'replayed',true);
  end if;

  select * into v_latest from public.self_attendance_photo_review_events
    where attendance_event_id=p_event_id order by version desc limit 1;
  if not found or v_latest.decision<>'correction_requested' then
    raise exception using errcode='23514',message='ATTENDANCE_CORRECTION_NOT_REQUESTED';
  end if;
  select * into v_revision from public.self_attendance_photo_evidence_revisions
    where attendance_event_id=p_event_id order by revision desc limit 1;
  v_previous_request_id := coalesce(v_revision.request_id,v_event.request_id);
  v_next_revision := coalesce(v_revision.revision,1)+1;
  if v_previous_request_id<>v_latest.evidence_request_id or p_previous_request_id<>v_previous_request_id
     or p_expected_revision<>v_next_revision-1 then
    raise exception using errcode='40001',message='ATTENDANCE_CORRECTION_VERSION_CONFLICT';
  end if;
  if exists(select 1 from public.self_attendance_photo_evidence e
      where e.request_id=v_event.request_id and e.checksum_sha256=p_checksum_sha256)
     or exists(select 1 from public.self_attendance_photo_evidence_revisions r
      where r.attendance_event_id=p_event_id and r.checksum_sha256=p_checksum_sha256) then
    raise exception using errcode='23505',message='ATTENDANCE_CORRECTION_DUPLICATE_EVIDENCE';
  end if;
  insert into public.self_attendance_photo_evidence_revisions(
    attendance_event_id,request_id,previous_request_id,revision,submitted_by,
    external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256,
    shift_context,capture_source
  ) values(
    p_event_id,p_request_id,v_previous_request_id,v_next_revision,v_actor,
    p_external_file_id,p_external_parent_id,p_file_name,'image/jpeg',p_size_bytes,p_checksum_sha256,
    p_shift_context,p_capture_source
  ) returning * into v_revision;
  return jsonb_build_object('event_id',p_event_id,'revision',v_revision.revision,'request_id',p_request_id,'replayed',false);
end;
$$;
revoke all on function public.commit_self_attendance_photo_correction(uuid,integer,uuid,uuid,text,text,text,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.commit_self_attendance_photo_correction(uuid,integer,uuid,uuid,text,text,text,integer,text,jsonb,text) to authenticated;

create or replace function public.review_self_attendance_photo(
  p_event_id uuid,
  p_expected_version integer,
  p_expected_evidence_revision integer,
  p_decision text,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor text;
  v_event public.self_attendance_events;
  v_latest public.self_attendance_photo_review_events;
  v_replay public.self_attendance_photo_review_events;
  v_revision public.self_attendance_photo_evidence_revisions;
  v_evidence_revision integer;
  v_evidence_request_id uuid;
  v_next_version integer;
begin
  v_actor := private.require_shift_actor(true);
  if p_event_id is null or p_idempotency_key is null or p_expected_version is null
     or p_expected_evidence_revision is null or p_expected_evidence_revision < 1
     or p_expected_version < 0 or p_decision not in ('approved','rejected','correction_requested')
     or p_reason is null or char_length(btrim(p_reason)) < 8 or char_length(p_reason) > 2000 then
    raise exception using errcode='22023', message='ATTENDANCE_REVIEW_REQUEST_INVALID';
  end if;

  select * into v_event from public.self_attendance_events where id=p_event_id for update;
  if not found or not private.can_read_shift(v_event.shift_id) then
    raise exception using errcode='42501', message='ATTENDANCE_REVIEW_SCOPE_DENIED';
  end if;
  if v_event.staff_id=v_actor then
    raise exception using errcode='42501', message='ATTENDANCE_REVIEW_SELF_REVIEW_BLOCKED';
  end if;
  if not exists (select 1 from public.self_attendance_photo_evidence e
    where e.request_id=v_event.request_id and e.shift_id=v_event.shift_id
      and e.staff_id=v_event.staff_id and e.operational_role=v_event.operational_role
      and e.event_kind=v_event.event_kind) then
    raise exception using errcode='23514', message='ATTENDANCE_REVIEW_EVIDENCE_NOT_FOUND';
  end if;
  -- Idempotent retries still have to pass the caller's current role and shift scope.
  select * into v_replay from public.self_attendance_photo_review_events
    where idempotency_key=p_idempotency_key;
  if found then
    if v_replay.attendance_event_id<>p_event_id or v_replay.reviewer_id<>v_actor
       or v_replay.decision<>p_decision or v_replay.reason<>btrim(p_reason)
       or v_replay.version<>p_expected_version+1
       or v_replay.evidence_revision<>p_expected_evidence_revision then
      raise exception using errcode='23505', message='ATTENDANCE_REVIEW_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('id',v_replay.id,'event_id',p_event_id,'decision',v_replay.decision,
      'version',v_replay.version,'evidence_revision',v_replay.evidence_revision,
      'reviewer_id',v_actor,'created_at',v_replay.created_at,'replayed',true);
  end if;
  v_evidence_request_id := v_event.request_id;
  select * into v_revision from public.self_attendance_photo_evidence_revisions
    where attendance_event_id=p_event_id order by revision desc limit 1;
  if found then v_evidence_request_id:=v_revision.request_id; end if;
  v_evidence_revision:=coalesce(v_revision.revision,1);

  select * into v_latest from public.self_attendance_photo_review_events
    where attendance_event_id=p_event_id order by version desc limit 1;
  v_next_version := coalesce(v_latest.version,0)+1;
  if p_expected_version<>v_next_version-1 then
    raise exception using errcode='40001', message='ATTENDANCE_REVIEW_VERSION_CONFLICT';
  end if;
  if p_expected_evidence_revision<>v_evidence_revision then
    raise exception using errcode='40001',message='ATTENDANCE_REVIEW_EVIDENCE_VERSION_CONFLICT';
  end if;
  if v_latest.decision in ('approved','rejected') then
    raise exception using errcode='23514', message='ATTENDANCE_REVIEW_TRANSITION_INVALID';
  end if;
  if v_latest.decision='correction_requested' and v_latest.evidence_request_id=v_evidence_request_id then
    raise exception using errcode='23514', message='ATTENDANCE_REVIEW_CORRECTION_REVISION_REQUIRED';
  end if;

  insert into public.self_attendance_photo_review_events
    (attendance_event_id,evidence_request_id,reviewer_id,decision,reason,version,evidence_revision,idempotency_key)
  values (p_event_id,v_evidence_request_id,v_actor,p_decision,btrim(p_reason),v_next_version,v_evidence_revision,p_idempotency_key)
  returning * into v_latest;
  return jsonb_build_object('id',v_latest.id,'event_id',p_event_id,'decision',v_latest.decision,
    'version',v_latest.version,'evidence_revision',v_latest.evidence_revision,
    'reviewer_id',v_actor,'created_at',v_latest.created_at,'replayed',false);
end;
$$;
revoke all on function public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid) from public, anon, authenticated;
grant execute on function public.review_self_attendance_photo(uuid,integer,integer,text,text,uuid) to authenticated;
commit;
