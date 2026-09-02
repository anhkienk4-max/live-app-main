-- F9 Patch-1: align the existing Leader campaign edit contract with Supabase.
-- Leader operational fields: status, type, notes, campaign URLs/title/preview,
-- embed setting, platform source, and owner assignment. Identity, master-data,
-- date, platform-array, audit/archive, and timestamp fields stay protected.

create or replace function private.enforce_campaign_leader_update_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select private.current_system_permission()) = 'leader'
    and (
      new.id is distinct from old.id
      or new.name is distinct from old.name
      or new.brand_id is distinct from old.brand_id
      or new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.platform_ids is distinct from old.platform_ids
      or new.created_at is distinct from old.created_at
      or new.updated_at is distinct from old.updated_at
      or new.deleted_at is distinct from old.deleted_at
      or new.deleted_by is distinct from old.deleted_by
      or new.archived_at is distinct from old.archived_at
      or new.archived_by is distinct from old.archived_by
      or new.deletion_reason is distinct from old.deletion_reason
    ) then
    raise exception using
      errcode = '42501',
      message = 'Leader campaign updates are limited to operational fields.';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_campaign_leader_update_scope() from public, anon, authenticated;

drop trigger if exists campaigns_leader_update_scope on public.campaigns;
create trigger campaigns_leader_update_scope
before update on public.campaigns
for each row execute function private.enforce_campaign_leader_update_scope();

drop policy if exists campaigns_leader_operational_update on public.campaigns;
create policy campaigns_leader_operational_update
on public.campaigns
for update
to authenticated
using (
  (select private.current_system_permission()) = 'leader'
  and archived_at is null
  and deleted_at is null
)
with check (
  (select private.current_system_permission()) = 'leader'
  and archived_at is null
  and deleted_at is null
);
