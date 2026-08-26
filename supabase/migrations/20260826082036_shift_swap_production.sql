-- Shift Swap production: MOVE + EXCHANGE + legacy REPLACEMENT with atomic execution
-- Canonical staffing remains ShiftRegistration; swaps are durable requests with server-authoritative RPCs

create table if not exists public.swap_requests (
  id text primary key default gen_random_uuid()::text,
  requester_id text not null references public.business_users(id) on delete restrict,
  source_registration_id text not null references public.shift_registrations(id) on delete restrict,
  source_shift_id text not null references public.shifts(id) on delete restrict,
  target_shift_id text references public.shifts(id) on delete restrict,
  counterpart_registration_id text references public.shift_registrations(id) on delete restrict,
  counterpart_id text references public.business_users(id) on delete restrict,
  operational_role text not null check (operational_role in ('host','support','technical')),
  mode text not null check (mode in ('replacement','move','exchange')),
  status text not null check (status in ('pending','accepted','rejected','cancelled','approved','completed')),
  reason text not null check (btrim(reason) <> ''),
  notes text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  responded_at timestamptz,
  responded_by text references public.business_users(id) on delete set null,
  approved_at timestamptz,
  approved_by text references public.business_users(id) on delete set null,
  completed_at timestamptz,
  -- legacy compat columns kept nullable
  shift_id text references public.shifts(id) on delete restrict,
  original_staff_id text references public.business_users(id) on delete set null,
  replacement_staff_id text references public.business_users(id) on delete set null,
  new_host_id text references public.business_users(id) on delete set null,
  new_support_id text references public.business_users(id) on delete set null,
  new_technical_id text references public.business_users(id) on delete set null,
  approval_history jsonb not null default '[]'::jsonb,
  deleted_at timestamptz,
  deleted_by text references public.business_users(id) on delete set null,
  deletion_reason text,
  constraint swap_source_target_not_equal check (target_shift_id is null or source_shift_id <> target_shift_id),
  constraint swap_mode_counterpart_check check (
    (mode = 'replacement' and target_shift_id is null and counterpart_registration_id is null and counterpart_id is null and replacement_staff_id is not null)
    or (mode = 'move' and target_shift_id is not null and counterpart_registration_id is null and counterpart_id is null and replacement_staff_id is null)
    or (mode = 'exchange' and target_shift_id is not null and counterpart_registration_id is not null and counterpart_id is not null and replacement_staff_id is null)
  )
);

create index if not exists swap_requests_requester_idx on public.swap_requests(requester_id);
create index if not exists swap_requests_source_shift_idx on public.swap_requests(source_shift_id);
create index if not exists swap_requests_target_shift_idx on public.swap_requests(target_shift_id);
create index if not exists swap_requests_counterpart_idx on public.swap_requests(counterpart_id) where counterpart_id is not null;
create index if not exists swap_requests_status_idx on public.swap_requests(status);
create unique index if not exists swap_requests_active_unique on public.swap_requests(source_registration_id) where status in ('pending','accepted','approved');
create unique index if not exists swap_requests_counterpart_active_unique on public.swap_requests(counterpart_registration_id)
  where counterpart_registration_id is not null and status in ('pending','accepted','approved');

create trigger swap_requests_set_updated_at before update on public.swap_requests for each row execute function private.set_updated_at();

alter table public.swap_requests enable row level security;
revoke all on table public.swap_requests from anon, authenticated;
grant select on table public.swap_requests to authenticated;

create policy swap_requests_select on public.swap_requests for select to authenticated using (
  (select private.current_business_user_is_active()) and (
    requester_id = (select private.current_business_user_id())
    or counterpart_id = (select private.current_business_user_id())
    or (select private.is_leader_or_admin())
    or exists (select 1 from public.shift_registrations sr where sr.shift_id = source_shift_id and sr.user_id = (select private.current_business_user_id()) and sr.status in ('approved','manually_assigned'))
  )
);
drop policy if exists swap_requests_insert on public.swap_requests;
drop policy if exists swap_requests_update on public.swap_requests;

create or replace function private.enforce_swap_request_transition()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> old.status and not (
    (old.status = 'pending' and new.status in ('accepted','approved','rejected','cancelled'))
    or (old.status = 'accepted' and new.status in ('approved','rejected','cancelled'))
    or (old.status = 'approved' and new.status = 'completed')
  ) then
    raise exception using errcode='22023', message='SWAP_ILLEGAL_TRANSITION';
  end if;
  return new;
end $$;
revoke all on function private.enforce_swap_request_transition() from public, anon, authenticated;
drop trigger if exists swap_requests_enforce_transition on public.swap_requests;
create trigger swap_requests_enforce_transition before update on public.swap_requests
for each row execute function private.enforce_swap_request_transition();

-- Helper to lock registrations/shifts deterministically
create or replace function private.lock_swap_rows(p_ids text[])
returns void language plpgsql security definer set search_path='' as $$
declare id text;
begin
  for id in select * from unnest(p_ids) order by 1 asc loop
    perform pg_advisory_xact_lock(hashtextextended(id, 0));
  end loop;
end $$;
revoke all on function private.lock_swap_rows(text[]) from public, anon, authenticated;

create or replace function public.create_shift_swap_request(
  p_source_registration_id text,
  p_target_shift_id text,
  p_counterpart_registration_id text,
  p_reason text,
  p_notes text default null
) returns public.swap_requests language plpgsql security definer set search_path='' as $$
declare
  actor_id text;
  src_reg public.shift_registrations;
  src_shift public.shifts;
  tgt_shift public.shifts;
  cp_reg public.shift_registrations;
  cp_user public.business_users;
  v_mode text;
  v_role text;
begin
  actor_id := private.require_shift_actor(false);
  if btrim(coalesce(p_reason,'')) = '' then raise exception using errcode='22023', message='SWAP_REASON_REQUIRED'; end if;
  select * into src_reg from public.shift_registrations where id = p_source_registration_id for update;
  if src_reg.id is null then raise exception using errcode='P0001', message='SOURCE_REGISTRATION_NOT_FOUND'; end if;
  if src_reg.user_id <> actor_id then raise exception using errcode='42501', message='SWAP_NOT_OWNER'; end if;
  if src_reg.status not in ('approved','manually_assigned','pending') then raise exception using errcode='P0001', message='SOURCE_NOT_ACTIVE'; end if;
  select * into src_shift from public.shifts where id = src_reg.shift_id and deleted_at is null and archived_at is null for update;
  if src_shift.id is null then raise exception using errcode='P0001', message='SOURCE_SHIFT_NOT_FOUND'; end if;
  if src_shift.status <> 'scheduled' then raise exception using errcode='P0001', message='SOURCE_SHIFT_NOT_SCHEDULED'; end if;
  v_role := src_reg.operational_role;

  if p_target_shift_id is null or btrim(p_target_shift_id) = '' then
    -- REPLACEMENT legacy: same shift, need replacement counterpart via cp id? For now treat as move to same shift requiring counterpart
    raise exception using errcode='22023', message='TARGET_SHIFT_REQUIRED';
  end if;
  if p_target_shift_id = src_reg.shift_id then raise exception using errcode='22023', message='SWAP_SAME_SHIFT_MOVE_NOT_ALLOWED'; end if;
  select * into tgt_shift from public.shifts where id = p_target_shift_id and deleted_at is null and archived_at is null for update;
  if tgt_shift.id is null then raise exception using errcode='P0001', message='TARGET_SHIFT_NOT_FOUND'; end if;
  if tgt_shift.status <> 'scheduled' then raise exception using errcode='P0001', message='TARGET_SHIFT_NOT_SCHEDULED'; end if;
  if tgt_shift.date is distinct from src_shift.date then
    -- allow cross-date moves, but keep role same
    null;
  end if;

  if p_counterpart_registration_id is not null and btrim(p_counterpart_registration_id) <> '' then
    v_mode := 'exchange';
    select * into cp_reg from public.shift_registrations where id = p_counterpart_registration_id for update;
    if cp_reg.id is null then raise exception using errcode='P0001', message='COUNTERPART_NOT_FOUND'; end if;
    if cp_reg.shift_id <> p_target_shift_id then raise exception using errcode='22023', message='COUNTERPART_SHIFT_MISMATCH'; end if;
    if cp_reg.operational_role <> v_role then raise exception using errcode='22023', message='SWAP_ROLE_MISMATCH'; end if;
    if cp_reg.status not in ('approved','manually_assigned') then raise exception using errcode='P0001', message='COUNTERPART_NOT_ACTIVE'; end if;
    select * into cp_user from public.business_users where id = cp_reg.user_id;
    if cp_user.id is null or cp_user.status <> 'active' or cp_user.archived_at is not null then raise exception using errcode='P0001', message='COUNTERPART_INACTIVE'; end if;
    -- duplicate active check
    if exists (select 1 from public.swap_requests where source_registration_id = p_source_registration_id and status in ('pending','accepted','approved')) then
      raise exception using errcode='23505', message='DUPLICATE_ACTIVE_SWAP';
    end if;
    insert into public.swap_requests (requester_id, source_registration_id, source_shift_id, target_shift_id, counterpart_registration_id, counterpart_id, operational_role, mode, status, reason, notes, shift_id, original_staff_id, replacement_staff_id)
    values (actor_id, p_source_registration_id, src_reg.shift_id, p_target_shift_id, p_counterpart_registration_id, cp_reg.user_id, v_role, 'exchange', 'pending', btrim(p_reason), nullif(btrim(coalesce(p_notes,'')),''), src_reg.shift_id, actor_id, cp_reg.user_id)
    returning * into src_reg;
    return src_reg;
  else
    v_mode := 'move';
    -- move: check target capacity and conflict for requester
    perform private.assert_shift_role_eligibility(actor_id, v_role);
    perform private.assert_shift_capacity(tgt_shift, v_role, null);
    perform private.assert_no_shift_registration_conflict(actor_id, tgt_shift, v_role, p_source_registration_id);
    if exists (select 1 from public.swap_requests where source_registration_id = p_source_registration_id and status in ('pending','accepted','approved')) then
      raise exception using errcode='23505', message='DUPLICATE_ACTIVE_SWAP';
    end if;
    insert into public.swap_requests (requester_id, source_registration_id, source_shift_id, target_shift_id, operational_role, mode, status, reason, notes, shift_id, original_staff_id)
    values (actor_id, p_source_registration_id, src_reg.shift_id, p_target_shift_id, v_role, 'move', 'pending', btrim(p_reason), nullif(btrim(coalesce(p_notes,'')),''), src_reg.shift_id, actor_id)
    returning * into src_reg;
    return src_reg;
  end if;
end $$;
revoke all on function public.create_shift_swap_request(text,text,text,text,text) from public, anon, authenticated; grant execute on function public.create_shift_swap_request(text,text,text,text,text) to authenticated;

create or replace function public.respond_shift_swap_request(p_request_id text, p_action text, p_notes text default null)
returns public.swap_requests language plpgsql security definer set search_path='' as $$
declare actor_id text; req public.swap_requests;
begin
  actor_id := private.require_shift_actor(false);
  select * into req from public.swap_requests where id = p_request_id for update;
  if req.id is null then raise exception using errcode='P0001', message='SWAP_NOT_FOUND'; end if;
  if req.mode <> 'exchange' then raise exception using errcode='22023', message='SWAP_NOT_EXCHANGE'; end if;
  if req.status <> 'pending' then raise exception using errcode='P0001', message='SWAP_NOT_PENDING'; end if;
  if req.counterpart_id <> actor_id then raise exception using errcode='42501', message='SWAP_NOT_COUNTERPART'; end if;
  if p_action not in ('accept','reject') then raise exception using errcode='22023', message='SWAP_ACTION_INVALID'; end if;
  if p_action = 'accept' then
    update public.swap_requests set status='accepted', responded_at=statement_timestamp(), responded_by=actor_id, notes=coalesce(p_notes, notes), updated_at=statement_timestamp() where id=p_request_id returning * into req;
  else
    update public.swap_requests set status='rejected', responded_at=statement_timestamp(), responded_by=actor_id, notes=coalesce(p_notes, notes), updated_at=statement_timestamp() where id=p_request_id returning * into req;
  end if;
  return req;
end $$;
revoke all on function public.respond_shift_swap_request(text,text,text) from public, anon, authenticated; grant execute on function public.respond_shift_swap_request(text,text,text) to authenticated;

create or replace function public.cancel_own_shift_swap_request(p_request_id text, p_reason text default null)
returns public.swap_requests language plpgsql security definer set search_path='' as $$
declare actor_id text; req public.swap_requests;
begin
  actor_id := private.require_shift_actor(false);
  select * into req from public.swap_requests where id=p_request_id for update;
  if req.id is null then raise exception using errcode='P0001', message='SWAP_NOT_FOUND'; end if;
  if req.requester_id <> actor_id then raise exception using errcode='42501', message='SWAP_NOT_OWNER'; end if;
  if req.status not in ('pending','accepted') then raise exception using errcode='P0001', message='SWAP_NOT_CANCELLABLE'; end if;
  update public.swap_requests set status='cancelled', updated_at=statement_timestamp(), notes=coalesce(p_reason, notes) where id=p_request_id returning * into req;
  return req;
end $$;
revoke all on function public.cancel_own_shift_swap_request(text,text) from public, anon, authenticated; grant execute on function public.cancel_own_shift_swap_request(text,text) to authenticated;

create or replace function public.approve_shift_swap_request(p_request_id text, p_notes text default null)
returns public.swap_requests language plpgsql security definer set search_path='' as $$
declare actor_id text; req public.swap_requests; src_reg public.shift_registrations; tgt_shift public.shifts; src_shift public.shifts; cp_reg public.shift_registrations; cp_shift public.shifts;
declare src_user public.business_users; cp_user public.business_users;
begin
  actor_id := private.require_shift_actor(true);
  if not private.is_leader_or_admin() then raise exception using errcode='42501', message='SWAP_APPROVAL_NOT_ALLOWED'; end if;
  select * into req from public.swap_requests where id=p_request_id for update;
  if req.id is null then raise exception using errcode='P0001', message='SWAP_NOT_FOUND'; end if;
  if req.mode = 'exchange' and req.status <> 'accepted' then raise exception using errcode='P0001', message='SWAP_NOT_ACCEPTED'; end if;
  if req.mode in ('move','replacement') and req.status <> 'pending' then raise exception using errcode='P0001', message='SWAP_NOT_PENDING'; end if;

  -- deterministic lock order: request, then registrations sorted, then shifts sorted
  perform private.lock_swap_rows(array[req.id]);
  select * into src_reg from public.shift_registrations where id=req.source_registration_id for update;
  if src_reg.id is null or src_reg.status not in ('approved','manually_assigned') then raise exception using errcode='P0001', message='SOURCE_STALE'; end if;
  if src_reg.user_id <> req.requester_id then raise exception using errcode='P0001', message='SOURCE_OWNER_MISMATCH'; end if;
  select * into src_shift from public.shifts where id=req.source_shift_id and deleted_at is null and archived_at is null for update;
  select * into tgt_shift from public.shifts where id=coalesce(req.target_shift_id, req.source_shift_id) and deleted_at is null and archived_at is null for update;
  if src_shift.id is null or tgt_shift.id is null then raise exception using errcode='P0001', message='SHIFT_STALE'; end if;
  if src_shift.status <> 'scheduled' or tgt_shift.status <> 'scheduled' then raise exception using errcode='P0001', message='SHIFT_NOT_SCHEDULED'; end if;

  -- lock shifts in order
  if src_shift.id < tgt_shift.id then
    perform private.lock_swap_rows(array[src_shift.id, tgt_shift.id]);
  elsif src_shift.id > tgt_shift.id then
    perform private.lock_swap_rows(array[tgt_shift.id, src_shift.id]);
  else
    perform private.lock_swap_rows(array[src_shift.id]);
  end if;

  select * into src_user from public.business_users where id=req.requester_id;
  if src_user.status <> 'active' or src_user.archived_at is not null then raise exception using errcode='P0001', message='REQUESTER_INACTIVE'; end if;
  perform private.assert_shift_role_eligibility(src_user.id, req.operational_role);

  if req.mode = 'exchange' then
    select * into cp_reg from public.shift_registrations where id=req.counterpart_registration_id for update;
    if cp_reg.id is null or cp_reg.status not in ('approved','manually_assigned') then raise exception using errcode='P0001', message='COUNTERPART_STALE'; end if;
    if cp_reg.user_id <> req.counterpart_id then raise exception using errcode='P0001', message='COUNTERPART_MISMATCH'; end if;
    select * into cp_user from public.business_users where id=req.counterpart_id;
    if cp_user.status <> 'active' or cp_user.archived_at is not null then raise exception using errcode='P0001', message='COUNTERPART_INACTIVE'; end if;
    perform private.assert_shift_role_eligibility(cp_user.id, req.operational_role);
    -- lock registrations in order
    if src_reg.id < cp_reg.id then
      perform private.lock_swap_rows(array[src_reg.id, cp_reg.id]);
    else
      perform private.lock_swap_rows(array[cp_reg.id, src_reg.id]);
    end if;
    perform private.assert_shift_capacity(tgt_shift, req.operational_role, src_reg.id);
    perform private.assert_shift_capacity(src_shift, req.operational_role, cp_reg.id);
    perform private.assert_no_shift_registration_conflict(src_user.id, tgt_shift, req.operational_role, src_reg.id);
    perform private.assert_no_shift_registration_conflict(cp_user.id, src_shift, req.operational_role, cp_reg.id);
    -- atomic exchange: remove old, create new
    update public.shift_registrations set status='cancelled', cancelled_at=statement_timestamp(), updated_at=statement_timestamp() where id in (src_reg.id, cp_reg.id);
    insert into public.shift_registrations (shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at)
    values (tgt_shift.id, src_user.id, req.operational_role, 'approved', 'manual_assignment', statement_timestamp(), actor_id, statement_timestamp()),
           (src_shift.id, cp_user.id, req.operational_role, 'approved', 'manual_assignment', statement_timestamp(), actor_id, statement_timestamp());
    perform private.refresh_shift_registration_lock(src_shift.id, true);
    perform private.refresh_shift_registration_lock(tgt_shift.id, true);
  elsif req.mode = 'move' then
    perform private.assert_shift_capacity(tgt_shift, req.operational_role, null);
    perform private.assert_no_shift_registration_conflict(src_user.id, tgt_shift, req.operational_role, src_reg.id);
    update public.shift_registrations set status='cancelled', cancelled_at=statement_timestamp(), updated_at=statement_timestamp() where id=src_reg.id;
    insert into public.shift_registrations (shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at)
    values (tgt_shift.id, src_user.id, req.operational_role, 'approved', 'manual_assignment', statement_timestamp(), actor_id, statement_timestamp());
    perform private.refresh_shift_registration_lock(src_shift.id, true);
    perform private.refresh_shift_registration_lock(tgt_shift.id, true);
  else -- replacement (legacy same-shift)
    -- find replacement user from request (counterpart_id or replacement)
    declare rep_id text; rep_user public.business_users;
    begin
      rep_id := coalesce(req.counterpart_id, req.replacement_staff_id, req.new_host_id, req.new_support_id, req.new_technical_id);
      if rep_id is null then raise exception using errcode='P0001', message='REPLACEMENT_MISSING'; end if;
      select * into rep_user from public.business_users where id=rep_id;
      if rep_user.status <> 'active' or rep_user.archived_at is not null then raise exception using errcode='P0001', message='REPLACEMENT_INACTIVE'; end if;
      perform private.assert_shift_role_eligibility(rep_id, req.operational_role);
      perform private.assert_shift_capacity(src_shift, req.operational_role, src_reg.id);
      perform private.assert_no_shift_registration_conflict(rep_id, src_shift, req.operational_role, null);
      update public.shift_registrations set status='cancelled', cancelled_at=statement_timestamp(), updated_at=statement_timestamp() where id=src_reg.id;
      insert into public.shift_registrations (shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at)
      values (src_shift.id, rep_id, req.operational_role, 'approved', 'manual_assignment', statement_timestamp(), actor_id, statement_timestamp());
      perform private.refresh_shift_registration_lock(src_shift.id, true);
    end;
  end if;

  update public.swap_requests set status='completed', approved_at=statement_timestamp(), approved_by=actor_id, completed_at=statement_timestamp(), updated_at=statement_timestamp(), approval_history = approval_history || jsonb_build_array(jsonb_build_object('action','approved','by',actor_id,'at',statement_timestamp(),'notes',coalesce(p_notes,'')))
  where id=p_request_id returning * into req;
  return req;
exception when others then
  -- ensure full rollback occurs automatically; re-raise with original message
  raise;
end $$;
revoke all on function public.approve_shift_swap_request(text,text) from public, anon, authenticated; grant execute on function public.approve_shift_swap_request(text,text) to authenticated;
