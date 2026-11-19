-- Shift reads must not mutate global status. Run automatic transitions from a
-- single audited database schedule and keep the explicit RPC leader/admin-only.
do $migration_role$
begin
  if current_user <> 'postgres' then
    raise exception 'SHIFT_STATUS_MIGRATION_REQUIRES_POSTGRES_ROLE';
  end if;
end;
$migration_role$;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create or replace function private.refresh_automatic_shift_statuses_scheduled()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  perform set_config('app.audit_source', 'system', true);
  with desired as (
    select shift.id, shift.version,
      case
        when statement_timestamp() >= shift.end_at then 'completed'
        when statement_timestamp() >= shift.start_at then 'live'
        when statement_timestamp() >= shift.registration_cutoff_at then 'preparing'
        else 'scheduled'
      end as next_status
    from public.shifts as shift
    where shift.deleted_at is null
      and shift.archived_at is null
      and shift.status_mode = 'auto'
      and shift.status <> 'cancelled'
  ), updated as (
    update public.shifts as shift
    set status = desired.next_status
    from desired
    where shift.id = desired.id
      and shift.status_mode = 'auto'
      and shift.version = desired.version
      and shift.status is distinct from desired.next_status
    returning shift.id
  )
  select count(*)::integer into changed_count from updated;
  return changed_count;
end;
$$;

revoke all on function private.refresh_automatic_shift_statuses_scheduled() from public, anon, authenticated, service_role;
grant execute on function private.refresh_automatic_shift_statuses_scheduled() to postgres;

create or replace function public.refresh_automatic_shift_statuses()
returns table(updated_count integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_shift_actor(true);
  return query select private.refresh_automatic_shift_statuses_scheduled();
end;
$$;

revoke all on function public.refresh_automatic_shift_statuses() from public, anon, service_role;
grant execute on function public.refresh_automatic_shift_statuses() to authenticated;

do $schedule_guard$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'refresh-automatic-shift-statuses'
      and username <> current_user
  ) then
    raise exception 'SHIFT_STATUS_CRON_JOB_OWNED_BY_ANOTHER_ROLE';
  end if;
end;
$schedule_guard$;

select cron.schedule(
  'refresh-automatic-shift-statuses',
  '* * * * *',
  'select private.refresh_automatic_shift_statuses_scheduled();'
);
