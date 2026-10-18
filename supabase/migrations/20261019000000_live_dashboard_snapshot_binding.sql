-- Forward-only validation for live snapshots. Apply after the Reports read-RLS migration.
-- Existing snapshots remain unchanged; request_id is nullable for old app clients.
do $$ begin
  if to_regprocedure('private.can_read_report(text,text)') is null
    or to_regprocedure('public.create_dashboard_update(jsonb)') is null then
    raise exception 'LIVE_SNAPSHOT_BASELINE_MISSING';
  end if;
end $$;

alter table public.dashboard_updates
  add column request_id uuid,
  add column request_fingerprint text;

create unique index dashboard_updates_actor_request_id_key
  on public.dashboard_updates (created_by, request_id)
  where request_id is not null;

drop policy if exists dashboard_updates_scoped_read on public.dashboard_updates;
create policy dashboard_updates_scoped_read
  on public.dashboard_updates for select to authenticated
  using (
    deleted_at is null
    and (select private.current_business_user_is_active())
    and (
      (select private.current_system_permission()) in ('admin', 'leader')
      or (select private.can_read_report(shift_id, created_by))
    )
  );

create or replace function public.create_dashboard_update(p_data jsonb)
returns public.dashboard_updates
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.current_business_user_id();
  actor_permission text := private.current_system_permission();
  shift_key text := nullif(btrim(p_data ->> 'shift_id'), '');
  target_shift public.shifts;
  platform_name text;
  requested_platform text := nullif(p_data ->> 'dashboard_platform', '');
  snapshot_time timestamptz;
  request_key uuid;
  request_hash text;
  metric record;
  reviewed_metric jsonb;
  created_row public.dashboard_updates;
begin
  if actor_id is null or not private.current_business_user_is_active() then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or shift_key is null then
    raise exception using errcode = '22023', message = 'DASHBOARD_UPDATE_INVALID';
  end if;
  select * into target_shift from public.shifts where id = shift_key;
  if not found or target_shift.deleted_at is not null or target_shift.archived_at is not null
    or target_shift.status not in ('preparing', 'live', 'paused') then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_NOT_ALLOWED';
  end if;
  if actor_permission is distinct from 'admin' and actor_permission is distinct from 'leader'
    and actor_id is distinct from target_shift.host_id
    and actor_id is distinct from target_shift.support_id
    and actor_id is distinct from target_shift.technical_id
    and not exists (
      select 1 from public.shift_registrations r
      where r.shift_id = shift_key and r.user_id = actor_id
        and r.status in ('approved', 'manually_assigned')
    ) then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_NOT_ALLOWED';
  end if;
  if (p_data ? 'brand_id' and p_data ->> 'brand_id' is distinct from target_shift.brand_id)
    or (p_data ? 'platform_id' and p_data ->> 'platform_id' is distinct from target_shift.platform_id) then
    raise exception using errcode = '42501', message = 'DASHBOARD_UPDATE_SHIFT_MISMATCH';
  end if;
  select name into platform_name from public.platforms where id = target_shift.platform_id;
  if platform_name is null
    or (requested_platform = 'tiktok_shop' and platform_name !~* 'tiktok')
    or (requested_platform = 'shopee_live' and platform_name !~* 'shopee')
    or requested_platform not in ('tiktok_shop', 'shopee_live')
    or requested_platform is null then
    raise exception using errcode = '22023', message = 'DASHBOARD_PLATFORM_MISMATCH';
  end if;
  if not (p_data ? 'time') or jsonb_typeof(p_data -> 'time') <> 'string' then
    raise exception using errcode = '22023', message = 'DASHBOARD_TIME_REQUIRED';
  end if;
  snapshot_time := (p_data ->> 'time')::timestamptz;
  if snapshot_time < target_shift.start_at or snapshot_time >= target_shift.end_at then
    raise exception using errcode = '22023', message = 'DASHBOARD_TIME_OUTSIDE_SHIFT';
  end if;
  if nullif(p_data ->> 'screenshot_storage_path', '') is not null
    and split_part(p_data ->> 'screenshot_storage_path', '/', 2) <> shift_key then
    raise exception using errcode = '42501', message = 'DASHBOARD_SCREENSHOT_NOT_ALLOWED';
  end if;
  if p_data ? 'ocr_review' and p_data -> 'ocr_review' <> 'null'::jsonb then
    if jsonb_typeof(p_data -> 'ocr_review') <> 'object'
      or jsonb_typeof(p_data #> '{ocr_review,metrics}') <> 'object' then
      raise exception using errcode = '22023', message = 'DASHBOARD_OCR_REVIEW_INVALID';
    end if;
    for metric in select key, value from jsonb_each(p_data #> '{ocr_review,metrics}') loop
      if jsonb_typeof(metric.value) <> 'object'
        or metric.value ->> 'status' in ('review_required', 'low_confidence')
        or coalesce((metric.value ->> 'needs_review')::boolean, false)
        or (metric.value ->> 'status' = 'confirmed' and (
          jsonb_typeof(metric.value -> 'value') <> 'number'
          or p_data #> array['normalized_metrics', metric.key] is distinct from metric.value -> 'value'
        )) then
        raise exception using errcode = '22023', message = 'DASHBOARD_OCR_REVIEW_REQUIRED';
      end if;
    end loop;
  end if;
  if p_data ? 'normalized_metrics' and jsonb_typeof(p_data -> 'normalized_metrics') <> 'object' then
    raise exception using errcode = '22023', message = 'DASHBOARD_METRICS_INVALID';
  end if;
  if p_data ? 'normalized_metrics' and exists (
    select 1 from jsonb_each(p_data -> 'normalized_metrics') m
    where jsonb_typeof(m.value) <> 'number'
  ) then
    raise exception using errcode = '22023', message = 'DASHBOARD_METRICS_INVALID';
  end if;
  if jsonb_typeof(p_data -> 'normalized_metrics') = 'object' then
    for metric in select key, value from jsonb_each(p_data -> 'normalized_metrics') loop
      reviewed_metric := p_data #> array['ocr_review', 'metrics', metric.key];
      if jsonb_typeof(reviewed_metric) is distinct from 'object'
        or reviewed_metric -> 'value' is distinct from metric.value
        or coalesce(reviewed_metric ->> 'status', '') not in ('confirmed', 'accepted', 'manual')
        or coalesce((reviewed_metric ->> 'needs_review')::boolean, false)
        or (reviewed_metric ->> 'status' = 'manual' and (
          reviewed_metric ->> 'source' is distinct from 'manual'
          or reviewed_metric #>> '{manual_edit,edited_by}' is distinct from actor_id
          or reviewed_metric #> '{manual_edit,manual_value}' is distinct from metric.value
        )) then
        raise exception using errcode = '22023', message = 'DASHBOARD_OCR_REVIEW_REQUIRED';
      end if;
    end loop;
  end if;
  if nullif(p_data ->> 'request_id', '') is not null then
    request_key := (p_data ->> 'request_id')::uuid;
    request_hash := md5((p_data - 'request_id')::text);
  end if;

  insert into public.dashboard_updates (
    shift_id, time, revenue, gmv, orders, peak_viewers, current_viewers,
    total_views, total_viewers, likes, comments, shares, screenshot_url,
    screenshot_storage_path, dashboard_platform, normalized_metrics,
    ocr_review, raw_ocr_output, notes, created_by, request_id, request_fingerprint
  ) values (
    shift_key, snapshot_time,
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
    requested_platform,
    p_data -> 'normalized_metrics',
    p_data -> 'ocr_review',
    nullif(p_data ->> 'raw_ocr_output', ''),
    nullif(p_data ->> 'notes', ''),
    actor_id, request_key, request_hash
  ) on conflict (created_by, request_id) where request_id is not null do nothing
  returning * into created_row;
  if created_row.id is null then
    select * into created_row from public.dashboard_updates
    where created_by = actor_id and request_id = request_key;
    if created_row.id is null or created_row.request_fingerprint is distinct from request_hash then
      raise exception using errcode = '23505', message = 'DASHBOARD_REQUEST_CONFLICT';
    end if;
  end if;
  return created_row;
end;
$$;
