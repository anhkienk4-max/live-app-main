-- RC19 P2-04. Matches staging migration ledger version 20261022185140.
-- Immutable raw events only, NOT approved actual minutes, NOT Payroll.
create table if not exists public.self_attendance_events (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique,
 shift_id text not null references public.shifts(id),
 staff_id text not null references public.business_users(id),
 operational_role text not null check (operational_role in ('host','support','technical')),
 event_kind text not null check (event_kind in ('check_in','check_out')),
 recorded_at timestamptz not null default statement_timestamp(),
 verification_status text not null default 'pending_verification'
  check (verification_status = 'pending_verification'),
 evidence_note text check (char_length(evidence_note) <= 2000),
 unique (shift_id,staff_id,operational_role,event_kind)
);
create index if not exists self_attendance_owner_idx on public.self_attendance_events(staff_id,shift_id,recorded_at);
alter table public.self_attendance_events enable row level security;
revoke all on public.self_attendance_events from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.reject_self_attendance_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 raise exception using errcode='42501', message='ATTENDANCE_EVENTS_IMMUTABLE';
end $function$;

drop trigger if exists self_attendance_immutable on public.self_attendance_events;
create trigger self_attendance_immutable before update or delete on public.self_attendance_events
for each row execute function private.reject_self_attendance_mutation();
CREATE OR REPLACE FUNCTION public.self_attendance_record(p_shift_id text, p_operational_role text, p_event_kind text, p_request_id uuid, p_evidence_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_actor text;
 v_shift public.shifts;
 v_existing public.self_attendance_events;
 v_now timestamptz := statement_timestamp();
 v_assigned boolean;
 v_surrendered boolean;
begin
 v_actor := private.require_shift_actor(false);
 if p_shift_id is null or btrim(p_shift_id)='' or p_request_id is null or
    p_operational_role not in ('host','support','technical') or
    p_event_kind not in ('check_in','check_out') or
    (p_evidence_note is not null and char_length(p_evidence_note)>2000) then
   raise exception using errcode='22023', message='ATTENDANCE_REQUEST_INVALID';
 end if;

 -- Idempotent retry, scoped to exact actor + request payload.
 select * into v_existing from public.self_attendance_events where request_id=p_request_id;
 if found then
   if v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
       raise exception using errcode='23505', message='ATTENDANCE_REQUEST_ID_REUSED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 -- Hold the shift lock to serialize against swap/assignment changes.
 select * into v_shift from public.shifts
 where id=p_shift_id and deleted_at is null and archived_at is null for share;
 if not found or v_shift.start_at is null or v_shift.end_at is null or
    v_shift.end_at <= v_shift.start_at or
    v_shift.status not in ('scheduled','preparing','live','paused','completed') then
   raise exception using errcode='P0001', message='ATTENDANCE_SHIFT_NOT_ELIGIBLE';
 end if;

 -- An approved exchange/replacement surrenders the old person's source shift.
 select exists (
   select 1 from public.swap_requests sw
   where sw.status in ('approved','completed') and sw.deleted_at is null
     and sw.mode in ('replacement','exchange')
     and (
       (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and sw.requester_id=v_actor and sw.operational_role=p_operational_role)
       or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.counterpart_id=v_actor and sw.operational_role=p_operational_role)
     )
 ) into v_surrendered;
 if v_surrendered then
   raise exception using errcode='42501', message='ATTENDANCE_ASSIGNMENT_SURRENDERED';
 end if;

 select (
   (p_operational_role='host' and v_shift.host_id=v_actor) or
   (p_operational_role='support' and v_shift.support_id=v_actor) or
   (p_operational_role='technical' and v_shift.technical_id=v_actor) or
   exists (select 1 from public.shift_registrations sr
      where sr.shift_id=p_shift_id and sr.user_id=v_actor
        and sr.operational_role=p_operational_role
        and sr.status in ('approved','manually_assigned')) or
   exists (select 1 from public.swap_requests sw
      where sw.status in ('approved','completed') and sw.deleted_at is null
        and sw.operational_role=p_operational_role
        and (
          (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and
            coalesce(sw.counterpart_id,sw.replacement_staff_id)=v_actor
            and coalesce(sw.counterpart_id,sw.replacement_staff_id)<>sw.requester_id)
          or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.requester_id=v_actor and
              sw.requester_id<>sw.counterpart_id)
        ))
 ) into v_assigned;
 if not coalesce(v_assigned,false) then
   raise exception using errcode='42501', message='ATTENDANCE_NOT_ASSIGNED';
 end if;

 if p_event_kind='check_in' then
   if v_shift.status='completed' or v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKIN_OUTSIDE_WINDOW';
   end if;
 else
   if v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at+interval '6 hours' then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_OUTSIDE_WINDOW';
   end if;
   if not exists (
     select 1 from public.self_attendance_events ev where ev.shift_id=p_shift_id
     and ev.staff_id=v_actor and ev.operational_role=p_operational_role
     and ev.event_kind='check_in' and ev.recorded_at<=v_now
   ) then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_REQUIRES_CHECKIN';
   end if;
 end if;

 insert into public.self_attendance_events
  (request_id,shift_id,staff_id,operational_role,event_kind,evidence_note)
 values
  (p_request_id,p_shift_id,v_actor,p_operational_role,p_event_kind,nullif(btrim(p_evidence_note),''))
 on conflict do nothing returning * into v_existing;
 if not found then
   -- Concurrent idempotent retry is the ONLY acceptable duplicate.
   select * into v_existing from public.self_attendance_events where request_id=p_request_id;
   if not found or v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
     raise exception using errcode='23505',message='ATTENDANCE_ALREADY_RECORDED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
     'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
     'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
     'verification_status',v_existing.verification_status,'replayed',false);
end $function$;

CREATE OR REPLACE FUNCTION public.get_my_self_attendance(p_shift_id text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor text; v_events jsonb;
begin
 v_actor := private.require_shift_actor(false);
 if p_limit is null or p_limit<1 or p_limit>100 then
   raise exception using errcode='22023',message='ATTENDANCE_PAGE_INVALID';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
      'event_id',ev.id,'shift_id',ev.shift_id,'staff_id',ev.staff_id,
      'role',ev.operational_role,'event',ev.event_kind,'recorded_at',ev.recorded_at,
      'verification_status',ev.verification_status
 ) order by ev.recorded_at desc,ev.id), '[]'::jsonb) into v_events
 from (select * from public.self_attendance_events where staff_id=v_actor
   and (p_shift_id is null or shift_id=p_shift_id)
   order by recorded_at desc,id limit p_limit) ev;
 return v_events;
end $function$;

revoke all on function public.self_attendance_record(text,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public.get_my_self_attendance(text,integer) from public,anon,authenticated;
grant execute on function public.self_attendance_record(text,text,text,uuid,text) to authenticated;
grant execute on function public.get_my_self_attendance(text,integer) to authenticated;
