-- Durable live-dashboard snapshots. Mock mode remains in-memory; Supabase mode
-- uses this table plus the object reference stored with each update.
create table public.dashboard_updates (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete restrict,
  time timestamptz not null default statement_timestamp(),
  revenue numeric not null default 0,
  gmv numeric null,
  orders integer not null default 0,
  peak_viewers integer not null default 0,
  current_viewers integer not null default 0,
  total_views integer null,
  total_viewers integer null,
  likes integer null,
  comments integer null,
  shares integer null,
  screenshot_url text null,
  screenshot_storage_path text null,
  dashboard_platform text not null default 'other',
  normalized_metrics jsonb null,
  ocr_review jsonb null,
  raw_ocr_output text null,
  notes text null,
  created_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  constraint dashboard_updates_platform_check check (dashboard_platform in ('tiktok_shop', 'shopee_live', 'other')),
  constraint dashboard_updates_revenue_check check (revenue >= 0),
  constraint dashboard_updates_screenshot_path_check check (
    screenshot_storage_path is null
    or screenshot_storage_path like 'dashboard/%'
  )
);

create index dashboard_updates_shift_idx on public.dashboard_updates (shift_id, time desc);
create index dashboard_updates_created_by_idx on public.dashboard_updates (created_by);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'live-dashboard-images',
  'live-dashboard-images',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "live dashboard image upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'live-dashboard-images'
    and split_part(name, '/', 1) = 'dashboard'
    and exists (
      select 1
      from public.shifts as shift
      where shift.id = split_part(name, '/', 2)
        and shift.status in ('preparing', 'live', 'paused')
        and shift.deleted_at is null
        and shift.archived_at is null
    )
    and (select private.can_read_shift(split_part(name, '/', 2)))
  );

create policy "live dashboard image public read"
  on storage.objects for select
  using (bucket_id = 'live-dashboard-images');

create policy "live dashboard image delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'live-dashboard-images'
    and (
      (select private.is_leader_or_admin())
      or exists (
        select 1
        from public.dashboard_updates as update_row
        where update_row.screenshot_storage_path = name
          and update_row.created_by = (select private.current_business_user_id())
      )
    )
  );

alter table public.dashboard_updates enable row level security;
revoke all on table public.dashboard_updates from anon, authenticated;
grant select on table public.dashboard_updates to authenticated;

create policy dashboard_updates_scoped_read
  on public.dashboard_updates for select to authenticated
  using ((select private.can_read_shift(shift_id)));

create or replace function public.create_dashboard_update(p_data jsonb)
returns public.dashboard_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_row public.dashboard_updates;
  shift_key text := nullif(btrim(p_data ->> 'shift_id'), '');
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if shift_key is null or not private.can_read_shift(shift_key) then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_NOT_ALLOWED';
  end if;
  if nullif(p_data ->> 'screenshot_storage_path', '') is not null
    and split_part(nullif(p_data ->> 'screenshot_storage_path', ''), '/', 2) <> shift_key then
    raise exception using errcode = '42501', message = 'DASHBOARD_SCREENSHOT_NOT_ALLOWED';
  end if;
  if not exists (
    select 1
    from public.shifts
    where id = shift_key
      and status in ('preparing', 'live', 'paused')
      and deleted_at is null
      and archived_at is null
  ) then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_NOT_ALLOWED';
  end if;
  insert into public.dashboard_updates (
    shift_id, time, revenue, gmv, orders, peak_viewers, current_viewers,
    total_views, total_viewers, likes, comments, shares, screenshot_url,
    screenshot_storage_path, dashboard_platform, normalized_metrics,
    ocr_review, raw_ocr_output, notes, created_by
  ) values (
    shift_key,
    coalesce(nullif(p_data ->> 'time', '')::timestamptz, statement_timestamp()),
    coalesce((p_data ->> 'revenue')::numeric, 0),
    (p_data ->> 'gmv')::numeric,
    coalesce((p_data ->> 'orders')::integer, 0),
    coalesce((p_data ->> 'peak_viewers')::integer, 0),
    coalesce((p_data ->> 'current_viewers')::integer, 0),
    (p_data ->> 'total_views')::integer,
    (p_data ->> 'total_viewers')::integer,
    (p_data ->> 'likes')::integer,
    (p_data ->> 'comments')::integer,
    (p_data ->> 'shares')::integer,
    nullif(p_data ->> 'screenshot_url', ''),
    nullif(p_data ->> 'screenshot_storage_path', ''),
    coalesce(nullif(p_data ->> 'dashboard_platform', ''), 'other'),
    p_data -> 'normalized_metrics',
    p_data -> 'ocr_review',
    nullif(p_data ->> 'raw_ocr_output', ''),
    nullif(p_data ->> 'notes', ''),
    actor_id
  ) returning * into created_row;
  return created_row;
end;
$$;

create or replace function public.delete_dashboard_update(p_update_id text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_row public.dashboard_updates;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_row from public.dashboard_updates where id = p_update_id and deleted_at is null for update;
  if not found then return false; end if;
  if target_row.created_by <> actor_id and not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_DELETE_NOT_ALLOWED';
  end if;
  update public.dashboard_updates
  set deleted_at = statement_timestamp(), notes = coalesce(notes, '') || case when p_reason is null or btrim(p_reason) = '' then '' else E'\n' || btrim(p_reason) end
  where id = p_update_id;
  return true;
end;
$$;

revoke all on function public.create_dashboard_update(jsonb) from public, anon, authenticated;
revoke all on function public.delete_dashboard_update(text, text) from public, anon, authenticated;
grant execute on function public.create_dashboard_update(jsonb) to authenticated;
grant execute on function public.delete_dashboard_update(text, text) to authenticated;
