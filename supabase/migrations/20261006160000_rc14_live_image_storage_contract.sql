-- Additive Storage V1 contract. Legacy rows/clients retain NULL storage metadata.
-- Live metadata uses hard removal; all surviving rows participate in the key constraint.
begin;
alter table public.live_report_images
  add column if not exists storage_file_name text,
  add column if not exists storage_idempotency_key text;

create unique index if not exists live_report_images_storage_idempotency_key
  on public.live_report_images (report_id, storage_idempotency_key)
  where storage_idempotency_key is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.live_report_images'::regclass
    and conname = 'live_report_images_storage_metadata_check') then
    alter table public.live_report_images add constraint live_report_images_storage_metadata_check check (
      (storage_file_name is null and storage_idempotency_key is null) or
      (storage_file_name is not null and char_length(storage_file_name) between 1 and 180
        and storage_idempotency_key is not null
        and storage_idempotency_key ~ '^(key_visual|live_session|other):[a-f0-9]{64}$'
        and split_part(storage_idempotency_key, ':', 1) = category)
    );
  end if;
end;
$$;

-- Category edits keep the content digest and key in sync; a collision fails closed.
create or replace function private.sync_live_image_storage_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.storage_idempotency_key is not null then
    new.storage_idempotency_key := new.category || ':' || split_part(new.storage_idempotency_key, ':', 2);
  end if;
  return new;
end;
$$;
revoke all on function private.sync_live_image_storage_category() from public, anon, authenticated;
drop trigger if exists live_image_storage_category on public.live_report_images;
create trigger live_image_storage_category before update of category on public.live_report_images
  for each row execute function private.sync_live_image_storage_category();

create or replace function public.upsert_live_report_image(p_data jsonb)
returns public.live_report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  created_image public.live_report_images;
  image_count integer;
  input_key text;
begin
  actor_id := private.require_report_actor(false);

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'REPORT_PAYLOAD_INVALID';
  end if;
  for input_key in select jsonb_object_keys(p_data)
  loop
    if input_key <> all (array[
      'report_id', 'category', 'title', 'description', 'captured_at',
      'file_url', 'thumbnail_url', 'file_name', 'mime_type', 'size_bytes',
      'sort_order', 'is_cover', 'storage_file_name', 'storage_idempotency_key'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  select * into target_report
  from public.reports
  where id = nullif(p_data->>'report_id', '') and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  if private.current_system_permission() = 'member'
    and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  -- The report lock serializes concurrent retries before count/cover/revision side effects.
  if nullif(p_data->>'storage_idempotency_key', '') is not null then
    if p_data->>'storage_idempotency_key' !~ '^(key_visual|live_session|other):[a-f0-9]{64}$'
      or split_part(p_data->>'storage_idempotency_key', ':', 1) <> coalesce(nullif(p_data->>'category', ''), 'other')
      or nullif(p_data->>'storage_file_name', '') is null then
      raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_STORAGE_METADATA_INVALID';
    end if;
    select * into created_image from public.live_report_images
    where report_id = target_report.id and storage_idempotency_key = p_data->>'storage_idempotency_key';
    if created_image.id is not null then return created_image; end if;
  elsif nullif(p_data->>'storage_file_name', '') is not null then
    raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_STORAGE_METADATA_INVALID';
  end if;

  select count(*) into image_count
  from public.live_report_images
  where report_id = target_report.id;
  if image_count >= 30 then
    raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_LIMIT_EXCEEDED';
  end if;

  if (p_data->>'is_cover')::boolean or image_count = 0 then
    update public.live_report_images
    set is_cover = false
    where report_id = target_report.id;
  end if;

  insert into public.live_report_images (
    report_id, category, title, description, captured_at,
    file_url, thumbnail_url, file_name, mime_type, size_bytes,
    sort_order, is_cover, uploaded_by, storage_file_name, storage_idempotency_key
  ) values (
    target_report.id,
    coalesce(nullif(p_data->>'category', ''), 'other'),
    nullif(p_data->>'title', ''),
    nullif(p_data->>'description', ''),
    (p_data->>'captured_at')::timestamptz,
    p_data->>'file_url',
    nullif(p_data->>'thumbnail_url', ''),
    p_data->>'file_name',
    p_data->>'mime_type',
    (p_data->>'size_bytes')::bigint,
    coalesce((p_data->>'sort_order')::integer, image_count),
    coalesce((p_data->>'is_cover')::boolean, image_count = 0),
    actor_id,
    nullif(p_data->>'storage_file_name', ''),
    nullif(p_data->>'storage_idempotency_key', '')
  ) returning * into created_image;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'upload_image',
    'Uploaded ' || coalesce(p_data->>'file_name', 'live image'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return created_image;
end;
$$;

revoke all on function public.upsert_live_report_image(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_live_report_image(jsonb) to authenticated;

-- Compat Production does not require the earlier provider-column migration.
-- Update the optional database-mode wrapper only where that contract exists.
do $migration$
begin
  if to_regprocedure('public.upsert_live_report_image_with_provider(jsonb)') is not null then
    execute $wrapper$
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

  -- Do not overwrite the winner of an idempotent retry with the redundant object.
  if created_image.external_file_id is not null then return created_image; end if;

  update public.live_report_images
  set provider = provider_value,
      external_file_id = external_id
  where id = created_image.id
  returning * into created_image;

  return created_image;
end;
$$;

$wrapper$;
  end if;
end;
$migration$;
commit;
