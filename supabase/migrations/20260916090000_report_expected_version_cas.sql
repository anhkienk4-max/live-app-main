-- Enforce expected-version compare-and-swap for report writes.
-- The legacy four-argument RPC remains defined for compatibility but is no
-- longer callable by application roles.
create or replace function public.create_report(p_data jsonb)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_report public.reports;
  existing_report public.reports;
  input_key text;
  shift_status text;
begin
  actor_id := private.require_report_actor(false);

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'REPORT_PAYLOAD_INVALID';
  end if;

  if p_data ? 'top_products'
    and jsonb_typeof(p_data->'top_products') <> 'array' then
    raise exception using errcode = '22023', message = 'REPORT_TOP_PRODUCTS_INVALID';
  end if;
  if p_data ? 'status' and coalesce(nullif(p_data->>'status', ''), 'draft') <> 'draft' then
    raise exception using errcode = '22023', message = 'REPORT_STATUS_INVALID';
  end if;

  for input_key in select jsonb_object_keys(p_data)
  loop
    if input_key <> all (array[
      'shift_id', 'revenue', 'orders', 'peak_viewer', 'average_viewer',
      'likes', 'comments', 'shares', 'top_products', 'insights_good',
      'insights_improvement', 'final_recap', 'replay_url', 'dashboard_url',
      'gmv', 'viewers', 'product_clicks', 'ctr', 'cvr', 'average_order_value',
      'live_duration_minutes', 'dashboard_platform', 'normalized_metrics',
      'platform_metrics', 'raw_ocr_output', 'ocr_review', 'status'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'REPORT_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  select status into shift_status
  from public.shifts
  where id = nullif(p_data->>'shift_id', '')
    and deleted_at is null
    and archived_at is null;
  if shift_status is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if shift_status not in ('preparing', 'live', 'paused', 'completed') then
    raise exception using errcode = '22023', message = 'REPORT_SHIFT_NOT_REPORTABLE';
  end if;
  if private.current_system_permission() = 'member'
    and not exists (
      select 1
      from public.shifts as shift
      where shift.id = nullif(p_data->>'shift_id', '')
        and (
          shift.host_id = actor_id
          or shift.support_id = actor_id
          or shift.technical_id = actor_id
          or exists (
            select 1
            from public.shift_registrations as registration
            where registration.shift_id = shift.id
              and registration.user_id = actor_id
              and registration.status in ('approved', 'manually_assigned')
          )
        )
    ) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  select id into existing_report
  from public.reports
  where shift_id = nullif(p_data->>'shift_id', '')
    and deleted_at is null
    and archived_at is null
  for update;
  if existing_report.id is not null then
    raise exception using errcode = '23505', message = 'REPORT_ALREADY_EXISTS';
  end if;

  insert into public.reports (
    shift_id, revenue, orders, peak_viewer, average_viewer, likes, comments, shares,
    top_products, insights_good, insights_improvement, replay_url, dashboard_url,
    gmv, viewers, product_clicks, ctr, cvr, average_order_value,
    live_duration_minutes, dashboard_platform, normalized_metrics,
    platform_metrics, raw_ocr_output, ocr_review, final_recap, status,
    submitted_by, metrics_confirmed, updated_by
  ) values (
    nullif(p_data->>'shift_id', ''),
    (p_data->>'revenue')::numeric,
    (p_data->>'orders')::integer,
    (p_data->>'peak_viewer')::integer,
    (p_data->>'average_viewer')::integer,
    (p_data->>'likes')::integer,
    (p_data->>'comments')::integer,
    (p_data->>'shares')::integer,
    case when p_data ? 'top_products'
      then array(select jsonb_array_elements_text(p_data->'top_products'))
      else null end,
    nullif(p_data->>'insights_good', ''),
    nullif(p_data->>'insights_improvement', ''),
    nullif(p_data->>'replay_url', ''),
    nullif(p_data->>'dashboard_url', ''),
    (p_data->>'gmv')::numeric,
    (p_data->>'viewers')::integer,
    (p_data->>'product_clicks')::integer,
    (p_data->>'ctr')::numeric,
    (p_data->>'cvr')::numeric,
    (p_data->>'average_order_value')::numeric,
    (p_data->>'live_duration_minutes')::integer,
    coalesce(nullif(p_data->>'dashboard_platform', ''), 'other'),
    p_data->'normalized_metrics',
    p_data->'platform_metrics',
    nullif(p_data->>'raw_ocr_output', ''),
    p_data->'ocr_review',
    p_data->'final_recap',
    'draft',
    actor_id,
    false,
    actor_id
  ) returning * into created_report;

  perform private.record_report_revision(
    created_report.id, actor_id, created_report.status, 'create',
    'Initial Final Report draft',
    private.report_revision_snapshot(created_report),
    created_report.ocr_review,
    created_report.final_recap,
    array[]::text[]
  );

  select * into created_report from public.reports where id = created_report.id;
  return created_report;
end;
$$;

create or replace function public.update_report(
  p_report_id text,
  p_patch jsonb,
  p_expected_version integer,
  p_reason text,
  p_event text
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  actor_permission text;
  existing_report public.reports;
  updated_report public.reports;
  input_key text;
  patch_key text;
begin
  actor_id := private.require_report_actor(false);
  actor_permission := private.current_system_permission();

  if p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'REPORT_EXPECTED_VERSION_INVALID';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'REPORT_PAYLOAD_INVALID';
  end if;
  if p_patch ? 'top_products'
    and jsonb_typeof(p_patch->'top_products') <> 'array' then
    raise exception using errcode = '22023', message = 'REPORT_TOP_PRODUCTS_INVALID';
  end if;
  if p_event is null or p_event not in ('save', 'confirm', 'reopen', 'upload_image', 'remove_image') then
    raise exception using errcode = '22023', message = 'REPORT_EVENT_INVALID';
  end if;

  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'revenue', 'orders', 'peak_viewer', 'average_viewer', 'likes', 'comments', 'shares',
      'top_products', 'insights_good', 'insights_improvement', 'replay_url', 'dashboard_url',
      'gmv', 'viewers', 'product_clicks', 'ctr', 'cvr', 'average_order_value',
      'live_duration_minutes', 'dashboard_platform', 'normalized_metrics',
      'platform_metrics', 'raw_ocr_output', 'ocr_review', 'final_recap',
      'metrics_confirmed', 'confirmed_at', 'confirmed_by', 'status',
      'submitted_by', 'reviewed_by', 'reviewed_at', 'review_notes'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'REPORT_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  select * into existing_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if existing_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if existing_report.version_number <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'REPORT_VERSION_CONFLICT';
  end if;

  -- Permission: submitter can save; Leader/Admin required for confirm/reopen.
  if actor_permission = 'member' and existing_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and p_event in ('confirm', 'reopen') then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member' and exists (
    select 1
    from jsonb_object_keys(p_patch) as patch_key(key_name)
    where key_name in (
      'metrics_confirmed', 'confirmed_at', 'confirmed_by',
      'reviewed_by', 'reviewed_at', 'submitted_by'
    )
  ) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if actor_permission = 'member'
    and p_patch ? 'status'
    and coalesce(nullif(p_patch->>'status', ''), existing_report.status)
      not in ('draft', 'reopened') then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  -- A confirmed report cannot be saved (must be reopened first).
  if existing_report.metrics_confirmed and p_event = 'save' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;

  if p_patch ? 'status' then
    if existing_report.status = 'confirmed' and p_event = 'save' then
      raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
    end if;
  end if;

  update public.reports as report
  set
    revenue = case when p_patch ? 'revenue' then (p_patch->>'revenue')::numeric else report.revenue end,
    orders = case when p_patch ? 'orders' then (p_patch->>'orders')::integer else report.orders end,
    peak_viewer = case when p_patch ? 'peak_viewer' then (p_patch->>'peak_viewer')::integer else report.peak_viewer end,
    average_viewer = case when p_patch ? 'average_viewer' then (p_patch->>'average_viewer')::integer else report.average_viewer end,
    likes = case when p_patch ? 'likes' then (p_patch->>'likes')::integer else report.likes end,
    comments = case when p_patch ? 'comments' then (p_patch->>'comments')::integer else report.comments end,
    shares = case when p_patch ? 'shares' then (p_patch->>'shares')::integer else report.shares end,
    top_products = case when p_patch ? 'top_products'
      then array(select jsonb_array_elements_text(p_patch->'top_products'))
      else report.top_products end,
    insights_good = case when p_patch ? 'insights_good' then nullif(p_patch->>'insights_good', '') else report.insights_good end,
    insights_improvement = case when p_patch ? 'insights_improvement' then nullif(p_patch->>'insights_improvement', '') else report.insights_improvement end,
    replay_url = case when p_patch ? 'replay_url' then nullif(p_patch->>'replay_url', '') else report.replay_url end,
    dashboard_url = case when p_patch ? 'dashboard_url' then nullif(p_patch->>'dashboard_url', '') else report.dashboard_url end,
    gmv = case when p_patch ? 'gmv' then (p_patch->>'gmv')::numeric else report.gmv end,
    viewers = case when p_patch ? 'viewers' then (p_patch->>'viewers')::integer else report.viewers end,
    product_clicks = case when p_patch ? 'product_clicks' then (p_patch->>'product_clicks')::integer else report.product_clicks end,
    ctr = case when p_patch ? 'ctr' then (p_patch->>'ctr')::numeric else report.ctr end,
    cvr = case when p_patch ? 'cvr' then (p_patch->>'cvr')::numeric else report.cvr end,
    average_order_value = case when p_patch ? 'average_order_value' then (p_patch->>'average_order_value')::numeric else report.average_order_value end,
    live_duration_minutes = case when p_patch ? 'live_duration_minutes' then (p_patch->>'live_duration_minutes')::integer else report.live_duration_minutes end,
    dashboard_platform = case when p_patch ? 'dashboard_platform' then coalesce(nullif(p_patch->>'dashboard_platform', ''), 'other') else report.dashboard_platform end,
    normalized_metrics = case when p_patch ? 'normalized_metrics' then p_patch->'normalized_metrics' else report.normalized_metrics end,
    platform_metrics = case when p_patch ? 'platform_metrics' then p_patch->'platform_metrics' else report.platform_metrics end,
    raw_ocr_output = case when p_patch ? 'raw_ocr_output' then nullif(p_patch->>'raw_ocr_output', '') else report.raw_ocr_output end,
    ocr_review = case when p_patch ? 'ocr_review' then p_patch->'ocr_review' else report.ocr_review end,
    final_recap = case when p_patch ? 'final_recap' then p_patch->'final_recap' else report.final_recap end,
    metrics_confirmed = case when p_patch ? 'metrics_confirmed' then (p_patch->>'metrics_confirmed')::boolean else report.metrics_confirmed end,
    confirmed_at = case when p_patch ? 'confirmed_at' then (p_patch->>'confirmed_at')::timestamptz else report.confirmed_at end,
    confirmed_by = case when p_patch ? 'confirmed_by' then p_patch->>'confirmed_by' else report.confirmed_by end,
    status = case when p_patch ? 'status' then coalesce(nullif(p_patch->>'status', ''), report.status) else report.status end,
    submitted_by = case when p_patch ? 'submitted_by' then p_patch->>'submitted_by' else report.submitted_by end,
    reviewed_by = case when p_patch ? 'reviewed_by' then p_patch->>'reviewed_by' else report.reviewed_by end,
    reviewed_at = case when p_patch ? 'reviewed_at' then (p_patch->>'reviewed_at')::timestamptz else report.reviewed_at end,
    review_notes = case when p_patch ? 'review_notes' then nullif(p_patch->>'review_notes', '') else report.review_notes end,
    updated_by = actor_id
  where report.id = p_report_id
    and report.version_number = p_expected_version
  returning * into updated_report;

  if updated_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_VERSION_CONFLICT';
  end if;

  perform private.record_report_revision(
    p_report_id, actor_id, updated_report.status, p_event, p_reason,
    private.report_revision_snapshot(updated_report),
    updated_report.ocr_review,
    updated_report.final_recap,
    private.report_image_references(p_report_id)
  );

  select * into updated_report from public.reports where id = p_report_id;
  return updated_report;
end;
$$;

revoke all on function public.update_report(text, jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_report(text, jsonb, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.update_report(text, jsonb, integer, text, text) to authenticated;
