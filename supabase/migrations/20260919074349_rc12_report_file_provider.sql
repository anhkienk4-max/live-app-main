-- RC1.2: provider-neutral storage metadata for new report images.
-- Existing rows remain legacy Supabase Storage rows when both columns are NULL.

alter table public.report_images
  add column if not exists provider text null,
  add column if not exists external_file_id text null;

alter table public.live_report_images
  add column if not exists provider text null,
  add column if not exists external_file_id text null;

alter table public.report_images
  drop constraint if exists report_images_file_provider_pair,
  add constraint report_images_file_provider_pair check (
    (provider is null and external_file_id is null)
    or (provider in ('google_drive', 'onedrive') and btrim(external_file_id) <> '')
  );

alter table public.live_report_images
  drop constraint if exists live_report_images_file_provider_pair,
  add constraint live_report_images_file_provider_pair check (
    (provider is null and external_file_id is null)
    or (provider in ('google_drive', 'onedrive') and btrim(external_file_id) <> '')
  );

-- Keep the legacy RPC contract intact while making cloud metadata persistence
-- atomic with the existing report-image authorization and revision logic.
create or replace function public.upload_report_image_with_provider(
  p_report_id text,
  p_storage_path text,
  p_image_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_image_type text,
  p_provider text,
  p_external_file_id text
)
returns public.report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_image public.report_images;
begin
  if p_provider not in ('google_drive', 'onedrive')
    or p_external_file_id is null
    or btrim(p_external_file_id) = '' then
    raise exception using errcode = '22023', message = 'REPORT_FILE_PROVIDER_METADATA_INVALID';
  end if;

  created_image := public.upload_report_image(
    p_report_id,
    p_storage_path,
    p_image_url,
    p_original_name,
    p_mime_type,
    p_size_bytes,
    p_image_type
  );

  update public.report_images
  set provider = p_provider,
      external_file_id = p_external_file_id
  where id = created_image.id
  returning * into created_image;

  return created_image;
end;
$$;

create or replace function public.upsert_live_report_image_with_provider(p_data jsonb)
returns public.live_report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_image public.live_report_images;
  provider_value text;
  external_id text;
begin
  provider_value := p_data->>'provider';
  external_id := p_data->>'external_file_id';
  if provider_value not in ('google_drive', 'onedrive')
    or external_id is null
    or btrim(external_id) = '' then
    raise exception using errcode = '22023', message = 'REPORT_FILE_PROVIDER_METADATA_INVALID';
  end if;

  created_image := public.upsert_live_report_image(
    p_data - 'provider' - 'external_file_id'
  );

  update public.live_report_images
  set provider = provider_value,
      external_file_id = external_id
  where id = created_image.id
  returning * into created_image;

  return created_image;
end;
$$;

-- Provider-backed deletes must authorize without removing metadata first.
create or replace function public.authorize_report_image_delete(p_image_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_image public.report_images;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.report_images where id = p_image_id;
  if target_image.id is null then return false; end if;
  select * into target_report
  from public.reports
  where id = target_image.report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and target_image.uploaded_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  return true;
end;
$$;

create or replace function public.authorize_live_report_image_delete(p_image_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_image public.live_report_images;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.live_report_images where id = p_image_id;
  if target_image.id is null then return false; end if;
  select * into target_report
  from public.reports
  where id = target_image.report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and target_image.uploaded_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  return true;
end;
$$;

revoke all on function public.upload_report_image_with_provider(text, text, text, text, text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.upsert_live_report_image_with_provider(jsonb) from public, anon, authenticated;
revoke all on function public.authorize_report_image_delete(text) from public, anon, authenticated;
revoke all on function public.authorize_live_report_image_delete(text) from public, anon, authenticated;

grant execute on function public.upload_report_image_with_provider(text, text, text, text, text, bigint, text, text, text) to authenticated;
grant execute on function public.upsert_live_report_image_with_provider(jsonb) to authenticated;
grant execute on function public.authorize_report_image_delete(text) to authenticated;
grant execute on function public.authorize_live_report_image_delete(text) to authenticated;
