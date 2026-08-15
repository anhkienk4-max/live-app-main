-- P1C-B2B-L shift lifecycle persistence.
-- Adds Admin-only soft-delete and restore for shifts, matching the existing
-- mock-mode lifecycle semantics (deleted_at/deleted_by/deletion_reason,
-- status cancelled, registration_locked). Hard delete is intentionally NOT
-- added: no production UI currently reaches lifecycleService.forceDelete.

-- Soft-delete a shift: Admin only, actor derived server-side.
-- Preserves registration/history rows; hides the shift from normal reads via
-- deleted_at (shifts_scoped_select already denies deleted rows to non-admin).
create or replace function public.soft_delete_shift(p_shift_id text, p_reason text)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  actor_permission text;
  target_shift public.shifts;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  actor_permission := private.current_system_permission();
  if actor_permission <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  select * into target_shift
  from public.shifts
  where id = p_shift_id
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'SHIFT_ALREADY_DELETED';
  end if;

  update public.shifts as shift
  set
    status = 'cancelled',
    deleted_at = statement_timestamp(),
    deleted_by = actor_id,
    deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
    registration_locked = true,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;

-- Restore a soft-deleted shift: Admin only, actor derived server-side.
create or replace function public.restore_shift(p_shift_id text)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  actor_permission text;
  target_shift public.shifts;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  actor_permission := private.current_system_permission();
  if actor_permission <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  select * into target_shift
  from public.shifts
  where id = p_shift_id
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_DELETED';
  end if;

  update public.shifts as shift
  set
    status = 'scheduled',
    deleted_at = null,
    deleted_by = null,
    deletion_reason = null,
    registration_locked = false,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;

revoke all on function public.soft_delete_shift(text, text) from public, anon, authenticated;
revoke all on function public.restore_shift(text) from public, anon, authenticated;
grant execute on function public.soft_delete_shift(text, text) to authenticated;
grant execute on function public.restore_shift(text) to authenticated;

comment on function public.soft_delete_shift(text, text) is
  'Admin-only lifecycle soft-delete. Registration and history rows are preserved; the shift is hidden from normal reads.';
comment on function public.restore_shift(text) is
  'Admin-only lifecycle restore of a soft-deleted shift.';
