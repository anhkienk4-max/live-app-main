-- F9 Patch-2: keep master-data lifecycle operations soft and preserve history.

revoke delete on table public.brands from public, anon, authenticated;
revoke delete on table public.platforms from public, anon, authenticated;
revoke delete on table public.campaigns from public, anon, authenticated;

-- Replace the prior FOR ALL Admin policies so authenticated callers have no
-- policy path for DELETE, while preserving Admin reads and lifecycle updates.
drop policy if exists brands_admin_all on public.brands;
drop policy if exists brands_admin_select on public.brands;
drop policy if exists brands_admin_insert on public.brands;
drop policy if exists brands_admin_update on public.brands;
create policy brands_admin_select
on public.brands
for select
to authenticated
using ((select private.is_admin()));
create policy brands_admin_insert
on public.brands
for insert
to authenticated
with check ((select private.is_admin()));
create policy brands_admin_update
on public.brands
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists platforms_admin_all on public.platforms;
drop policy if exists platforms_admin_select on public.platforms;
drop policy if exists platforms_admin_insert on public.platforms;
drop policy if exists platforms_admin_update on public.platforms;
create policy platforms_admin_select
on public.platforms
for select
to authenticated
using ((select private.is_admin()));
create policy platforms_admin_insert
on public.platforms
for insert
to authenticated
with check ((select private.is_admin()));
create policy platforms_admin_update
on public.platforms
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists campaigns_admin_all on public.campaigns;
drop policy if exists campaigns_admin_select on public.campaigns;
drop policy if exists campaigns_admin_insert on public.campaigns;
drop policy if exists campaigns_admin_update on public.campaigns;
create policy campaigns_admin_select
on public.campaigns
for select
to authenticated
using ((select private.is_admin()));
create policy campaigns_admin_insert
on public.campaigns
for insert
to authenticated
with check ((select private.is_admin()));
create policy campaigns_admin_update
on public.campaigns
for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

-- Existing campaign links are historical data. Future campaign deletion is
-- restricted even for explicitly privileged database maintenance, while NOT
-- VALID keeps legacy rows from making this additive migration fail.
alter table public.shifts
  drop constraint if exists shifts_campaign_id_fkey;
alter table public.shifts
  add constraint shifts_campaign_id_fkey
  foreign key (campaign_id)
  references public.campaigns(id)
  on delete restrict
  not valid;

-- Validate new or changed platform references only. An archived platform is
-- still canonical history; a deleted/nonexistent platform is not a new value.
create or replace function private.validate_campaign_platform_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  referenced_platform_id text;
begin
  if tg_op = 'INSERT' then
    foreach referenced_platform_id in array coalesce(new.platform_ids, '{}'::text[]) loop
      if referenced_platform_id is not null
        and not exists (
          select 1
          from public.platforms as platform_record
          where platform_record.id = referenced_platform_id
            and platform_record.deleted_at is null
        ) then
        raise exception using
          errcode = '23503',
          message = 'Campaign platform reference does not exist.';
      end if;
    end loop;
  elsif new.platform_ids is distinct from old.platform_ids then
    foreach referenced_platform_id in array coalesce(new.platform_ids, '{}'::text[]) loop
      if referenced_platform_id is not null
        and not exists (
          select 1
          from public.platforms as platform_record
          where platform_record.id = referenced_platform_id
            and platform_record.deleted_at is null
        ) then
        raise exception using
          errcode = '23503',
          message = 'Campaign platform reference does not exist.';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_campaign_platform_ids() from public, anon, authenticated;

drop trigger if exists campaigns_validate_platform_ids on public.campaigns;
create trigger campaigns_validate_platform_ids
before insert or update of platform_ids on public.campaigns
for each row execute function private.validate_campaign_platform_ids();
