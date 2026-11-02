-- RC19 Batch 05A: provider integrity metadata and private dashboard evidence links.
-- Additive metadata and private legacy-image cutover. Any rollback needs an access review
-- and must preserve screenshot references; this migration never deletes provider files.

begin;

alter table public.report_images
  add column if not exists external_parent_id text,
  add column if not exists checksum_sha256 text;

alter table public.live_report_images
  add column if not exists external_parent_id text,
  add column if not exists checksum_sha256 text;

alter table public.report_images
  drop constraint if exists report_images_external_parent_id_check,
  add constraint report_images_external_parent_id_check
    check (external_parent_id is null or btrim(external_parent_id) <> ''),
  drop constraint if exists report_images_checksum_sha256_check,
  add constraint report_images_checksum_sha256_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$');

-- Legacy dashboard images remain readable only through an authenticated shift-scoped path.
update storage.buckets set public = false where id = 'live-dashboard-images';
drop policy if exists "live dashboard image public read" on storage.objects;
create policy "live dashboard image scoped read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'live-dashboard-images'
    and exists (
      select 1 from public.dashboard_updates update_row
      where update_row.screenshot_storage_path = storage.objects.name
        and update_row.deleted_at is null
        and (select private.can_read_shift(update_row.shift_id))
    )
  );

alter table public.live_report_images
  drop constraint if exists live_report_images_external_parent_id_check,
  add constraint live_report_images_external_parent_id_check
    check (external_parent_id is null or btrim(external_parent_id) <> ''),
  drop constraint if exists live_report_images_checksum_sha256_check,
  add constraint live_report_images_checksum_sha256_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$');

create or replace function public.upload_report_image_with_storage_metadata(
  p_report_id text,
  p_storage_path text,
  p_image_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_image_type text,
  p_provider text,
  p_external_file_id text,
  p_external_parent_id text,
  p_checksum_sha256 text
)
returns public.report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_image public.report_images;
begin
  if p_provider is null or p_provider not in ('google_drive', 'onedrive')
    or nullif(btrim(p_external_file_id), '') is null
    or nullif(btrim(p_external_parent_id), '') is null
    or p_checksum_sha256 is null
    or p_checksum_sha256 !~ '^[a-f0-9]{64}$'
    or p_size_bytes is null
    or p_size_bytes <= 0 then
    raise exception using errcode = '22023', message = 'REPORT_FILE_STORAGE_METADATA_INVALID';
  end if;

  created_image := public.upload_report_image_with_provider(
    p_report_id,
    p_storage_path,
    p_image_url,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_image_type,
    p_provider,
    p_external_file_id
  );

  update public.report_images
  set external_parent_id = p_external_parent_id,
      checksum_sha256 = p_checksum_sha256
  where id = created_image.id
  returning * into created_image;
  return created_image;
end;
$$;

create or replace function public.upsert_live_report_image_with_storage_metadata(p_data jsonb)
returns public.live_report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_image public.live_report_images;
  provider_value text := p_data->>'provider';
  external_id text := p_data->>'external_file_id';
  parent_id text := p_data->>'external_parent_id';
  checksum text := p_data->>'checksum_sha256';
begin
  if provider_value is null or provider_value not in ('google_drive', 'onedrive')
    or nullif(btrim(external_id), '') is null
    or nullif(btrim(parent_id), '') is null
    or checksum is null
    or checksum !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'REPORT_FILE_STORAGE_METADATA_INVALID';
  end if;

  created_image := public.upsert_live_report_image_with_provider(
    p_data - 'external_parent_id' - 'checksum_sha256'
  );

  -- Keep the metadata belonging to a concurrent idempotency winner.
  if created_image.external_file_id is not null then
    if created_image.external_file_id = external_id
      and (created_image.external_parent_id is null or created_image.checksum_sha256 is null) then
      update public.live_report_images
      set external_parent_id = parent_id,
          checksum_sha256 = checksum
      where id = created_image.id
      returning * into created_image;
    end if;
    return created_image;
  end if;

  update public.live_report_images
  set external_parent_id = parent_id,
      checksum_sha256 = checksum
  where id = created_image.id
  returning * into created_image;
  return created_image;
end;
$$;

alter table public.dashboard_updates
  add column if not exists screenshot_file_id text
    references public.operational_files(id) on delete restrict;

create index if not exists dashboard_updates_screenshot_file_idx
  on public.dashboard_updates(screenshot_file_id)
  where screenshot_file_id is not null;

alter table public.dashboard_updates
  drop constraint if exists dashboard_updates_screenshot_file_reference_check,
  add constraint dashboard_updates_screenshot_file_reference_check check (
    screenshot_file_id is null
    or (
      screenshot_storage_path = 'dashboard/' || shift_id || '/' || screenshot_file_id
      and screenshot_url = '/api/dashboard-screenshots?file_id=' || screenshot_file_id
    )
  );

create or replace function public.create_dashboard_update(p_data jsonb)
returns public.dashboard_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_row public.dashboard_updates;
  screenshot_file public.operational_files;
  shift_key text := nullif(btrim(p_data ->> 'shift_id'), '');
  screenshot_file_key text := nullif(btrim(p_data ->> 'screenshot_file_id'), '');
  screenshot_url_value text := nullif(p_data ->> 'screenshot_url', '');
  screenshot_path_value text := nullif(p_data ->> 'screenshot_storage_path', '');
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if shift_key is null or not private.can_read_shift(shift_key) then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_NOT_ALLOWED';
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

  if screenshot_file_key is not null then
    select * into screenshot_file
    from public.operational_files
    where id = screenshot_file_key and deleted_at is null
    for key share;
    if screenshot_file.id is null
      or screenshot_file.shift_id is distinct from shift_key
      or screenshot_file.scope_key is distinct from ('shift:' || shift_key)
      or screenshot_file.category <> 'live_snapshot'
      or screenshot_file.provider is distinct from 'google_drive'
      or screenshot_file.integrity_status is distinct from 'sha256_verified'
      or screenshot_file.external_file_id is null
      or screenshot_file.external_parent_id is null
      or screenshot_file.checksum_sha256 is null
      or screenshot_file.checksum_sha256 !~ '^[a-f0-9]{64}$'
      or screenshot_file.mime_type is null
      or screenshot_file.mime_type not in ('image/png', 'image/jpeg', 'image/webp') then
      raise exception using errcode = '42501', message = 'DASHBOARD_SCREENSHOT_NOT_ALLOWED';
    end if;
    screenshot_url_value := '/api/dashboard-screenshots?file_id=' || screenshot_file.id;
    screenshot_path_value := 'dashboard/' || shift_key || '/' || screenshot_file.id;
  elsif screenshot_path_value is not null then
    if split_part(screenshot_path_value, '/', 2) <> shift_key then
      raise exception using errcode = '42501', message = 'DASHBOARD_SCREENSHOT_NOT_ALLOWED';
    end if;
    screenshot_url_value := '/api/dashboard-screenshots?storage_path=' || screenshot_path_value;
  end if;
  if screenshot_file_key is null and screenshot_url_value like 'blob:%' then
    raise exception using errcode = '42501', message = 'DASHBOARD_SCREENSHOT_NOT_ALLOWED';
  end if;

  insert into public.dashboard_updates (
    shift_id, time, revenue, gmv, orders, peak_viewers, current_viewers,
    total_views, total_viewers, likes, comments, shares, screenshot_url,
    screenshot_storage_path, screenshot_file_id, dashboard_platform, normalized_metrics,
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
    screenshot_url_value,
    screenshot_path_value,
    screenshot_file_key,
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

revoke all on function public.upload_report_image_with_storage_metadata(text, text, text, text, text, bigint, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.upsert_live_report_image_with_storage_metadata(jsonb) from public, anon, authenticated;
revoke all on function public.create_dashboard_update(jsonb) from public, anon, authenticated;
grant execute on function public.upload_report_image_with_storage_metadata(text, text, text, text, text, bigint, text, text, text, text, text) to authenticated;
grant execute on function public.upsert_live_report_image_with_storage_metadata(jsonb) to authenticated;
grant execute on function public.create_dashboard_update(jsonb) to authenticated;

commit;
