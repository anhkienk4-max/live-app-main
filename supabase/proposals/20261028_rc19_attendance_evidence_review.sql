-- RC19 Attendance #130: review-only proposal. Do not add to the executable migration ledger.
begin;

create table public.self_attendance_photo_evidence_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.self_attendance_events(id),
  evidence_request_id uuid not null,
  review_version integer not null check (review_version > 0),
  decision text not null check (decision in ('approved','rejected','correction_requested')),
  reason text not null check (char_length(btrim(reason)) between 8 and 2000),
  reviewer_id text not null references public.business_users(id),
  reviewed_at timestamptz not null default statement_timestamp(),
  unique (event_id, review_version),
  unique (event_id, evidence_request_id)
);
alter table public.self_attendance_photo_evidence_reviews enable row level security;
revoke all on public.self_attendance_photo_evidence_reviews from public, anon, authenticated;
grant select on public.self_attendance_photo_evidence_reviews to service_role;
create trigger self_attendance_photo_evidence_reviews_immutable
  before update or delete on public.self_attendance_photo_evidence_reviews
  for each row execute function private.reject_self_attendance_mutation();

create table public.self_attendance_photo_evidence_addenda (
  request_id uuid primary key,
  event_id uuid not null references public.self_attendance_events(id),
  revision_no integer not null check (revision_no > 0),
  previous_request_id uuid not null,
  submitted_by text not null references public.business_users(id),
  provider text not null check (provider='google_drive'),
  external_file_id text not null unique check (char_length(external_file_id) between 8 and 512),
  external_parent_id text not null check (char_length(external_parent_id) between 8 and 512),
  file_name text not null check (char_length(file_name) between 16 and 255),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 4194304),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  shift_context jsonb not null check (jsonb_typeof(shift_context)='object'),
  capture_source text not null check (capture_source in ('camera','file_picker')),
  created_at timestamptz not null default statement_timestamp(),
  unique (event_id, revision_no)
);
alter table public.self_attendance_photo_evidence_addenda enable row level security;
revoke all on public.self_attendance_photo_evidence_addenda from public, anon, authenticated;
grant select on public.self_attendance_photo_evidence_addenda to service_role;
create trigger self_attendance_photo_evidence_addenda_immutable
  before update or delete on public.self_attendance_photo_evidence_addenda
  for each row execute function private.reject_self_attendance_mutation();

create or replace function public.review_self_attendance_photo_evidence(
  p_event_id uuid, p_evidence_request_id uuid, p_expected_version integer,
  p_decision text, p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor text := private.current_business_user_id();
  v_event public.self_attendance_events;
  v_version integer;
begin
  if v_actor is null or not private.current_business_user_is_active()
     or not private.is_leader_or_admin() then
    raise exception using errcode='42501',message='ATTENDANCE_REVIEW_FORBIDDEN';
  end if;
  if p_decision not in ('approved','rejected','correction_requested')
     or p_reason is null or char_length(btrim(p_reason)) < 8 or char_length(p_reason)>2000
     or p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode='22023',message='ATTENDANCE_REVIEW_INVALID';
  end if;
  select * into v_event from public.self_attendance_events where id=p_event_id for update;
  if not found or not private.can_read_shift(v_event.shift_id) then
    raise exception using errcode='42501',message='ATTENDANCE_REVIEW_SCOPE_DENIED';
  end if;
  if v_event.staff_id=v_actor then
    raise exception using errcode='42501',message='ATTENDANCE_REVIEW_SELF_REVIEW';
  end if;
  if not (exists(select 1 from public.self_attendance_photo_evidence p
      where p.request_id=p_evidence_request_id and p.shift_id=v_event.shift_id
        and p.staff_id=v_event.staff_id and p.operational_role=v_event.operational_role
        and p.event_kind=v_event.event_kind)
    or exists(select 1 from public.self_attendance_photo_evidence_addenda a
      where a.request_id=p_evidence_request_id and a.event_id=v_event.id)) then
    raise exception using errcode='22023',message='ATTENDANCE_REVIEW_EVIDENCE_INVALID';
  end if;
  select count(*) into v_version from public.self_attendance_photo_evidence_reviews
    where event_id=v_event.id;
  if v_version<>p_expected_version then
    raise exception using errcode='40001',message='ATTENDANCE_REVIEW_VERSION_CONFLICT';
  end if;
  if exists(select 1 from public.self_attendance_photo_evidence_reviews
      where event_id=v_event.id and evidence_request_id=p_evidence_request_id) then
    raise exception using errcode='23505',message='ATTENDANCE_EVIDENCE_ALREADY_REVIEWED';
  end if;
  if p_evidence_request_id is distinct from coalesce(
      (select a.request_id from public.self_attendance_photo_evidence_addenda a
       where a.event_id=v_event.id order by a.revision_no desc limit 1),v_event.request_id) then
    raise exception using errcode='22023',message='ATTENDANCE_REVIEW_EVIDENCE_STALE';
  end if;
  insert into public.self_attendance_photo_evidence_reviews
    (event_id,evidence_request_id,review_version,decision,reason,reviewer_id)
  values (v_event.id,p_evidence_request_id,v_version+1,p_decision,btrim(p_reason),v_actor)
  returning review_version into v_version;
  return jsonb_build_object('event_id',v_event.id,'evidence_request_id',p_evidence_request_id,
    'review_version',v_version,'decision',p_decision);
end;
$$;
revoke all on function public.review_self_attendance_photo_evidence(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.review_self_attendance_photo_evidence(uuid,uuid,integer,text,text) to authenticated;

create or replace function public.get_my_self_attendance_photo_review_context(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor text := private.current_business_user_id(); v_event public.self_attendance_events; v_latest public.self_attendance_photo_evidence_reviews;
begin
  if v_actor is null or not private.current_business_user_is_active() then
    raise exception using errcode='42501',message='ATTENDANCE_REVIEW_FORBIDDEN';
  end if;
  select * into v_event from public.self_attendance_events where id=p_event_id and staff_id=v_actor;
  if not found then raise exception using errcode='42501',message='ATTENDANCE_REVIEW_FORBIDDEN'; end if;
  select * into v_latest from public.self_attendance_photo_evidence_reviews where event_id=v_event.id order by review_version desc limit 1;
  return jsonb_build_object('event_id',v_event.id,'shift_id',v_event.shift_id,'role',v_event.operational_role,
    'event',v_event.event_kind,'staff_id',v_event.staff_id,'review_version',coalesce(v_latest.review_version,0),
    'decision',v_latest.decision,'reason',v_latest.reason,'evidence_request_id',v_latest.evidence_request_id,
    'can_submit_correction',coalesce(v_latest.decision='correction_requested',false)
      and not exists(select 1 from public.self_attendance_photo_evidence_addenda a where a.event_id=v_event.id
        and a.previous_request_id=v_latest.evidence_request_id));
end;
$$;
revoke all on function public.get_my_self_attendance_photo_review_context(uuid) from public,anon,authenticated;
grant execute on function public.get_my_self_attendance_photo_review_context(uuid) to authenticated;

create or replace function public.attach_self_attendance_photo_evidence_addendum(
  p_request_id uuid,p_event_id uuid,p_previous_request_id uuid,p_provider text,
  p_external_file_id text,p_external_parent_id text,p_file_name text,p_mime_type text,
  p_size_bytes integer,p_checksum_sha256 text,p_shift_context jsonb,p_capture_source text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor text := private.current_business_user_id(); v_event public.self_attendance_events; v_review public.self_attendance_photo_evidence_reviews; v_revision integer;
begin
  if v_actor is null or not private.current_business_user_is_active() then
    raise exception using errcode='42501',message='ATTENDANCE_REVIEW_FORBIDDEN';
  end if;
  select * into v_event from public.self_attendance_events where id=p_event_id and staff_id=v_actor for update;
  if not found then raise exception using errcode='42501',message='ATTENDANCE_REVIEW_FORBIDDEN'; end if;
  select * into v_review from public.self_attendance_photo_evidence_reviews where event_id=v_event.id order by review_version desc limit 1;
  if not found or v_review.decision<>'correction_requested' or v_review.evidence_request_id<>p_previous_request_id then
    raise exception using errcode='42501',message='ATTENDANCE_CORRECTION_NOT_REQUESTED';
  end if;
  if exists(select 1 from public.self_attendance_photo_evidence_addenda where request_id=p_request_id) then
    if exists(select 1 from public.self_attendance_photo_evidence_addenda where request_id=p_request_id and event_id=v_event.id and previous_request_id=p_previous_request_id and submitted_by=v_actor) then
      return jsonb_build_object('request_id',p_request_id,'replayed',true);
    end if;
    raise exception using errcode='23505',message='ATTENDANCE_CORRECTION_REQUEST_REUSED';
  end if;  if exists(select 1 from public.self_attendance_photo_evidence_addenda where event_id=v_event.id and previous_request_id=p_previous_request_id) then
    raise exception using errcode='23505',message='ATTENDANCE_CORRECTION_ALREADY_SUBMITTED';
  end if;
  select coalesce(max(revision_no),0)+1 into v_revision from public.self_attendance_photo_evidence_addenda where event_id=v_event.id;
  insert into public.self_attendance_photo_evidence_addenda
   (request_id,event_id,revision_no,previous_request_id,submitted_by,provider,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256,shift_context,capture_source)
  values (p_request_id,v_event.id,v_revision,p_previous_request_id,v_actor,p_provider,p_external_file_id,p_external_parent_id,p_file_name,p_mime_type,p_size_bytes,p_checksum_sha256,p_shift_context,p_capture_source);
  return jsonb_build_object('request_id',p_request_id,'revision_no',v_revision,'replayed',false);
end;
$$;
revoke all on function public.attach_self_attendance_photo_evidence_addendum(uuid,uuid,uuid,text,text,text,text,text,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.attach_self_attendance_photo_evidence_addendum(uuid,uuid,uuid,text,text,text,text,text,integer,text,jsonb,text) to authenticated;
commit;
