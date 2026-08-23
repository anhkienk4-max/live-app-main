-- P3: Report persistence foundation.
-- Report drafts, confirmed reports, revisions, evidence images and live-session
-- gallery images now persist through the shared Supabase backend.
-- This migration contains no demo reports.

-- ============================================================
-- Tables
-- ============================================================

create table public.reports (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete restrict,
  status text not null default 'draft',
  revenue numeric not null default 0,
  orders integer not null default 0,
  peak_viewer integer not null default 0,
  average_viewer integer not null default 0,
  likes integer null,
  comments integer not null default 0,
  shares integer not null default 0,
  top_products text[] null,
  insights_good text null,
  insights_improvement text null,
  replay_url text null,
  dashboard_url text null,
  gmv numeric null,
  viewers integer null,
  product_clicks integer null,
  ctr numeric null,
  cvr numeric null,
  average_order_value numeric null,
  live_duration_minutes integer null,
  dashboard_platform text not null default 'other',
  normalized_metrics jsonb null,
  platform_metrics jsonb null,
  raw_ocr_output text null,
  ocr_review jsonb null,
  final_recap jsonb null,
  metrics_confirmed boolean not null default false,
  confirmed_at timestamptz null,
  confirmed_by text null references public.business_users(id) on delete set null,
  submitted_by text null references public.business_users(id) on delete set null,
  reviewed_by text null references public.business_users(id) on delete set null,
  reviewed_at timestamptz null,
  review_notes text null,
  version_number integer not null default 0,
  updated_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint reports_id_not_blank check (btrim(id) <> ''),
  constraint reports_shift_id_not_blank check (btrim(shift_id) <> ''),
  constraint reports_status_check
    check (status in ('draft', 'in_review', 'confirmed', 'reopened', 'archived')),
  constraint reports_dashboard_platform_check
    check (dashboard_platform in ('tiktok_shop', 'shopee_live', 'other')),
  constraint reports_revenue_not_negative check (revenue >= 0)
);

create table public.report_revisions (
  id text primary key default gen_random_uuid()::text,
  report_id text not null references public.reports(id) on delete cascade,
  version integer not null,
  created_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  status text not null,
  reason text null,
  event text not null,
  metrics jsonb null,
  ocr_review jsonb null,
  final_recap jsonb null,
  image_references text[] null,
  constraint report_revisions_id_not_blank check (btrim(id) <> ''),
  constraint report_revisions_event_check
    check (event in ('create', 'save', 'ocr_run', 'ocr_rerun', 'confirm', 'reopen', 'upload_image', 'remove_image', 'archive')),
  constraint report_revisions_status_check
    check (status in ('draft', 'in_review', 'confirmed', 'reopened', 'archived'))
);

create table public.report_images (
  id text primary key default gen_random_uuid()::text,
  report_id text not null references public.reports(id) on delete cascade,
  image_url text not null,
  storage_path text not null,
  original_name text null,
  mime_type text null,
  size_bytes bigint null,
  image_type text not null,
  uploaded_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  constraint report_images_id_not_blank check (btrim(id) <> ''),
  constraint report_images_type_check
    check (image_type in ('dashboard', 'livestream', 'host', 'support', 'technical', 'voucher', 'product', 'other'))
);

create table public.live_report_images (
  id text primary key default gen_random_uuid()::text,
  report_id text null references public.reports(id) on delete cascade,
  category text not null default 'other',
  title text null,
  description text null,
  captured_at timestamptz null,
  file_url text not null,
  thumbnail_url text null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  uploaded_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint live_report_images_id_not_blank check (btrim(id) <> ''),
  constraint live_report_images_category_check
    check (category in ('key_visual', 'live_session', 'other'))
);

-- ============================================================
-- Indexes
-- ============================================================

create unique index reports_active_shift_uidx
  on public.reports (shift_id)
  where deleted_at is null and archived_at is null;
create index reports_status_idx
  on public.reports (status)
  where deleted_at is null and archived_at is null;
create index reports_shift_id_idx on public.reports (shift_id);
create index reports_submitted_by_idx on public.reports (submitted_by);
create index reports_confirmed_idx
  on public.reports (confirmed_at)
  where metrics_confirmed and deleted_at is null and archived_at is null;

create unique index report_revisions_report_version_uidx
  on public.report_revisions (report_id, version);
create index report_revisions_created_at_idx on public.report_revisions (created_at desc);

create index report_images_report_id_idx on public.report_images (report_id);
create index report_images_uploaded_by_idx on public.report_images (uploaded_by);

create index live_report_images_report_id_idx on public.live_report_images (report_id);
create index live_report_images_sort_order_idx
  on public.live_report_images (report_id, sort_order)
  where report_id is not null;
create index live_report_images_cover_idx
  on public.live_report_images (report_id)
  where is_cover and report_id is not null;

-- ============================================================
-- Triggers
-- ============================================================

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function private.set_updated_at();
create trigger report_images_set_updated_at
  before update on public.report_images
  for each row execute function private.set_updated_at();
create trigger live_report_images_set_updated_at
  before update on public.live_report_images
  for each row execute function private.set_updated_at();

-- ============================================================
-- Storage bucket
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit)
  values ('report-images', 'report-images', true, 10485760)
  on conflict (id) do nothing;

create policy "report-images-upload"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'report-images'
    and (select private.current_business_user_id()) is not null
    and (
      (
        split_part(name, '/', 1) = 'reports'
        and exists (
          select 1
          from public.reports as report
          where report.id = split_part(name, '/', 2)
            and report.deleted_at is null
            and report.archived_at is null
            and (
              (select private.is_leader_or_admin())
              or report.submitted_by = (select private.current_business_user_id())
            )
        )
      )
      or (
        split_part(name, '/', 1) = 'live'
        and exists (
          select 1
          from public.reports as report
          where report.id = split_part(name, '/', 2)
            and report.deleted_at is null
            and report.archived_at is null
            and (
              (select private.is_leader_or_admin())
              or report.submitted_by = (select private.current_business_user_id())
            )
        )
      )
    )
  );

create policy "report-images-read"
  on storage.objects
  for select
  using (bucket_id = 'report-images');

create policy "report-images-delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'report-images'
    and (
      owner_id = (select auth.uid())::text
      or (select private.is_leader_or_admin())
    )
  );

-- ============================================================
-- Private helpers
-- ============================================================

create or replace function private.require_report_actor(p_leader_required boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_leader_required and not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return actor_id;
end;
$$;

revoke all on function private.require_report_actor(boolean) from public, anon, authenticated;

create or replace function private.assert_report_editable(p_report public.reports)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_report is null or p_report.deleted_at is not null or p_report.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if p_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
end;
$$;

revoke all on function private.assert_report_editable(public.reports) from public, anon, authenticated;

create or replace function private.record_report_revision(
  p_report_id text,
  p_actor_id text,
  p_status text,
  p_event text,
  p_reason text,
  p_metrics jsonb,
  p_ocr_review jsonb,
  p_final_recap jsonb,
  p_image_references text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  select coalesce(max(version), 0) + 1 into next_version
  from public.report_revisions
  where report_id = p_report_id;

  insert into public.report_revisions (
    report_id, version, created_by, status, reason, event,
    metrics, ocr_review, final_recap, image_references
  ) values (
    p_report_id, next_version, p_actor_id, p_status, p_reason, p_event,
    p_metrics, p_ocr_review, p_final_recap, p_image_references
  );

  update public.reports
  set version_number = next_version
  where id = p_report_id;
end;
$$;

revoke all on function private.record_report_revision(
  text, text, text, text, text, jsonb, jsonb, jsonb, text[]
) from public, anon, authenticated;

create or replace function private.report_revision_snapshot(p_report public.reports)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'normalized', p_report.normalized_metrics,
    'platform', p_report.platform_metrics,
    'revenue', p_report.revenue,
    'orders', p_report.orders,
    'peak_viewer', p_report.peak_viewer,
    'average_viewer', p_report.average_viewer
  );
$$;

revoke all on function private.report_revision_snapshot(public.reports) from public, anon, authenticated;

create or replace function private.report_image_references(p_report_id text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(id order by created_at)
  from (
    select id, created_at from public.report_images
    where report_id = p_report_id and deleted_at is null
    union all
    select id, created_at from public.live_report_images
    where report_id = p_report_id
  ) as combined;
$$;

revoke all on function private.report_image_references(text) from public, anon, authenticated;

create or replace function private.capture_report_revision(p_report_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.current_business_user_id();
  select * into target_report from public.reports where id = p_report_id;
  if target_report.id is not null then
    perform private.record_report_revision(
      p_report_id, actor_id, target_report.status, 'save',
      null,
      private.report_revision_snapshot(target_report),
      target_report.ocr_review,
      target_report.final_recap,
      private.report_image_references(p_report_id)
    );
  end if;
end;
$$;

revoke all on function private.capture_report_revision(text) from public, anon, authenticated;

-- ============================================================
-- Report RPCs
-- ============================================================

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

  -- Validate the target shift exists and is in a reportable status.
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

  -- Enforce a single active report per shift.
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
    coalesce((p_data->>'revenue')::numeric, 0),
    coalesce((p_data->>'orders')::integer, 0),
    coalesce((p_data->>'peak_viewer')::integer, 0),
    coalesce((p_data->>'average_viewer')::integer, 0),
    (p_data->>'likes')::integer,
    coalesce((p_data->>'comments')::integer, 0),
    coalesce((p_data->>'shares')::integer, 0),
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

  return created_report;
end;
$$;

create or replace function public.update_report(
  p_report_id text,
  p_patch jsonb,
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
    revenue = case when p_patch ? 'revenue' then coalesce((p_patch->>'revenue')::numeric, 0) else report.revenue end,
    orders = case when p_patch ? 'orders' then coalesce((p_patch->>'orders')::integer, 0) else report.orders end,
    peak_viewer = case when p_patch ? 'peak_viewer' then (p_patch->>'peak_viewer')::integer else report.peak_viewer end,
    average_viewer = case when p_patch ? 'average_viewer' then (p_patch->>'average_viewer')::integer else report.average_viewer end,
    likes = case when p_patch ? 'likes' then (p_patch->>'likes')::integer else report.likes end,
    comments = case when p_patch ? 'comments' then coalesce((p_patch->>'comments')::integer, 0) else report.comments end,
    shares = case when p_patch ? 'shares' then coalesce((p_patch->>'shares')::integer, 0) else report.shares end,
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
  returning * into updated_report;

  perform private.record_report_revision(
    p_report_id, actor_id, updated_report.status, p_event, p_reason,
    private.report_revision_snapshot(updated_report),
    updated_report.ocr_review,
    updated_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return updated_report;
end;
$$;

create or replace function public.start_report_review(p_report_id text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(true);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;

  update public.reports
  set status = 'in_review', reviewed_by = actor_id, reviewed_at = statement_timestamp(),
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'in_review', 'save', 'Started report review',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.reject_report_review(p_report_id text, p_notes text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(true);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;

  update public.reports
  set status = 'reopened', metrics_confirmed = false,
      reviewed_by = actor_id, reviewed_at = statement_timestamp(),
      review_notes = coalesce(nullif(btrim(p_notes), ''), review_notes),
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'reopened', 'reopen', coalesce(nullif(btrim(p_notes), ''), 'Rejected review'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.reopen_report(p_report_id text, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(true);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.status <> 'confirmed' or not target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_CONFIRMED';
  end if;

  update public.reports
  set metrics_confirmed = false, status = 'reopened',
      review_notes = coalesce(nullif(btrim(p_reason), ''), review_notes),
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'reopened', 'reopen', coalesce(nullif(btrim(p_reason), ''), 'Reopened report'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.reset_report_ocr(p_report_id text, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;

  update public.reports
  set raw_ocr_output = null,
      ocr_review = jsonb_build_object('status', 'waiting', 'metrics', '{}'::jsonb),
      normalized_metrics = null,
      platform_metrics = null,
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status, 'ocr_run',
    coalesce(nullif(btrim(p_reason), ''), 'Reset OCR'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.record_report_ocr_run(
  p_report_id text,
  p_review jsonb,
  p_rerun boolean
)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(false);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  if private.current_system_permission() = 'member'
    and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  update public.reports
  set ocr_review = p_review,
      raw_ocr_output = p_review->>'raw_output',
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status,
    case when p_rerun then 'ocr_rerun' else 'ocr_run' end,
    null,
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.soft_delete_report(p_report_id text, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  actor_permission text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  actor_permission := (select system_permission from public.business_users where id = actor_id);
  if actor_permission = 'member' and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  -- Keep evidence metadata and Storage paths attached to the soft-deleted
  -- report so Admin restore remains reversible and no blobs are orphaned.

  update public.reports
  set deleted_at = statement_timestamp(),
      deleted_by = actor_id,
      deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
      status = 'archived',
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'archived', 'archive',
    coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    array[]::text[]
  );

  return target_report;
end;
$$;

create or replace function public.archive_report(p_report_id text, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(true);
  if private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;

  update public.reports
  set archived_at = statement_timestamp(),
      archived_by = actor_id,
      deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Archived by operator'),
      status = 'archived',
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, 'archived', 'archive',
    coalesce(nullif(btrim(p_reason), ''), 'Archived by operator'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.restore_report(p_report_id text, p_reason text)
returns public.reports
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  was_deleted boolean;
begin
  actor_id := private.require_report_actor(true);
  if private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;

  was_deleted := target_report.deleted_at is not null;

  update public.reports
  set deleted_at = null,
      deleted_by = null,
      archived_at = null,
      archived_by = null,
      deletion_reason = null,
      status = case when was_deleted then 'reopened' else coalesce(nullif(p_reason, ''), target_report.status) end,
      metrics_confirmed = case when was_deleted then metrics_confirmed else metrics_confirmed end,
      updated_by = actor_id
  where id = p_report_id
  returning * into target_report;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status, 'reopen',
    coalesce(nullif(btrim(p_reason), ''), 'Restored report'),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return target_report;
end;
$$;

create or replace function public.upload_report_image(
  p_report_id text,
  p_storage_path text,
  p_image_url text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_image_type text
)
returns public.report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  created_image public.report_images;
begin
  actor_id := private.require_report_actor(false);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
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

  insert into public.report_images (
    report_id, image_url, storage_path, original_name,
    mime_type, size_bytes, image_type, uploaded_by
  ) values (
    p_report_id, p_image_url, p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, p_image_type, actor_id
  ) returning * into created_image;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status, 'upload_image',
    'Uploaded ' || coalesce(p_original_name, p_image_type),
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );

  return created_image;
end;
$$;

create or replace function public.remove_report_image(p_image_id text)
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
  if target_image.id is null then
    return false;
  end if;
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

  delete from public.report_images where id = p_image_id;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'remove_image',
    'Removed report evidence image',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return true;
end;
$$;

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
      'sort_order', 'is_cover'
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
    sort_order, is_cover, uploaded_by
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
    actor_id
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

create or replace function public.set_live_report_image_cover(p_report_id text, p_image_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  target_image public.live_report_images;
begin
  actor_id := private.require_report_actor(true);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
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

  select * into target_image
  from public.live_report_images
  where id = p_image_id and report_id = p_report_id;
  if target_image.id is null then
    raise exception using errcode = 'P0001', message = 'IMAGE_NOT_FOUND';
  end if;

  update public.live_report_images
  set is_cover = (id = p_image_id)
  where report_id = p_report_id;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status, 'save',
    'Set live report image as cover',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );
end;
$$;

create or replace function public.update_live_report_image_metadata(
  p_image_id text,
  p_category text,
  p_title text,
  p_description text,
  p_captured_at timestamptz
)
returns public.live_report_images
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
  actor_id := private.require_report_actor(false);
  select * into target_image
  from public.live_report_images
  where id = p_image_id
  for update;
  if target_image.id is null then
    raise exception using errcode = 'P0001', message = 'IMAGE_NOT_FOUND';
  end if;
  select * into target_report
  from public.reports
  where id = target_image.report_id and deleted_at is null and archived_at is null
  for update;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
  actor_permission := private.current_system_permission();
  if actor_permission = 'member' and target_report.submitted_by <> actor_id then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if p_category is null or p_category not in ('key_visual', 'live_session', 'other') then
    raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_CATEGORY_INVALID';
  end if;

  update public.live_report_images
  set category = p_category,
      title = nullif(btrim(p_title), ''),
      description = nullif(btrim(p_description), ''),
      captured_at = p_captured_at
  where id = p_image_id
  returning * into target_image;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'save',
    'Updated live-session image metadata',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return target_image;
end;
$$;

create or replace function public.reorder_live_report_images(
  p_report_id text,
  p_ordered_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
  index integer;
  requested_count integer;
  existing_count integer;
begin
  actor_id := private.require_report_actor(true);
  select * into target_report
  from public.reports
  where id = p_report_id and deleted_at is null and archived_at is null
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

  requested_count := coalesce(cardinality(p_ordered_ids), 0);
  select count(*) into existing_count
  from public.live_report_images
  where report_id = p_report_id;
  if requested_count <> existing_count
    or requested_count <> (
      select count(distinct requested.id)
      from unnest(coalesce(p_ordered_ids, array[]::text[])) as requested(id)
    )
    or exists (
      select 1
      from unnest(coalesce(p_ordered_ids, array[]::text[])) as requested(id)
      where not exists (
        select 1
        from public.live_report_images as image
        where image.report_id = p_report_id and image.id = requested.id
      )
    ) then
    raise exception using errcode = '22023', message = 'LIVE_REPORT_IMAGE_ORDER_INVALID';
  end if;

  index := 0;
  if requested_count > 0 then
    for index in 1..requested_count
    loop
      update public.live_report_images
      set sort_order = index - 1
      where report_id = p_report_id and id = p_ordered_ids[index];
    end loop;
  end if;

  perform private.record_report_revision(
    p_report_id, actor_id, target_report.status, 'save',
    'Reordered live-session images',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(p_report_id)
  );
end;
$$;

create or replace function public.remove_live_report_image(p_image_id text)
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
  remaining integer;
  removed_sort_order integer;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  select * into target_image from public.live_report_images where id = p_image_id;
  if target_image.id is null then
    return false;
  end if;
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

  removed_sort_order := target_image.sort_order;

  delete from public.live_report_images where id = p_image_id;

  -- Promote first remaining image to cover if the deleted one was the cover.
  if target_image.is_cover then
    select count(*) into remaining
    from public.live_report_images
    where report_id = target_image.report_id;
    if remaining > 0 then
      update public.live_report_images
      set is_cover = true
      where id = (
        select id from public.live_report_images
        where report_id = target_image.report_id
        order by sort_order, created_at
        limit 1
      );
      update public.live_report_images
      set sort_order = sort_order - 1
      where report_id = target_image.report_id
        and sort_order > removed_sort_order;
    end if;
  end if;

  perform private.record_report_revision(
    target_report.id, actor_id, target_report.status, 'remove_image',
    'Removed live session image',
    private.report_revision_snapshot(target_report),
    target_report.ocr_review,
    target_report.final_recap,
    private.report_image_references(target_report.id)
  );

  return true;
end;
$$;

create or replace function public.get_report_revisions(p_report_id text)
returns table (
  version integer,
  created_at timestamptz,
  created_by text,
  status text,
  reason text,
  event text,
  metrics jsonb,
  ocr_review jsonb,
  final_recap jsonb,
  image_references text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.require_report_actor(false);
  select * into target_report
  from public.reports
  where id = p_report_id;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if (target_report.deleted_at is not null or target_report.archived_at is not null)
    and private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return query
  select v, created_at, created_by, status, reason, event,
    metrics, ocr_review, final_recap, image_references
  from public.report_revisions
  where report_id = p_report_id
  order by version;
end;
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.reports enable row level security;
alter table public.report_revisions enable row level security;
alter table public.report_images enable row level security;
alter table public.live_report_images enable row level security;

revoke all on table public.reports from anon, authenticated;
revoke all on table public.report_revisions from anon, authenticated;
revoke all on table public.report_images from anon, authenticated;
revoke all on table public.live_report_images from anon, authenticated;

-- Active reports are readable by all authenticated users;
-- archived/deleted rows require Admin.
create policy reports_active_select
  on public.reports for select to authenticated
  using (
    deleted_at is null and archived_at is null
  );
create policy reports_archived_select
  on public.reports for select to authenticated
  using (
    (deleted_at is not null or archived_at is not null)
    and (select private.current_system_permission() = 'admin')
  );

-- Revisions are visible for reports the user can read.
create policy report_revisions_read
  on public.report_revisions for select to authenticated using (
    exists (
      select 1 from public.reports as report
      where report.id = report_revisions.report_id
        and (report.deleted_at is null and report.archived_at is null
          or (select private.current_system_permission() = 'admin'))
    )
  );

create policy report_images_read
  on public.report_images for select to authenticated using (
    exists (
      select 1 from public.reports as report
      where report.id = report_images.report_id
        and (report.deleted_at is null and report.archived_at is null
          or (select private.current_system_permission() = 'admin')
        )
        and report_images.deleted_at is null
    )
  );

create policy live_report_images_read
  on public.live_report_images for select to authenticated using (
    report_id is null
    or exists (
      select 1 from public.reports as report
      where report.id = live_report_images.report_id
        and (report.deleted_at is null and report.archived_at is null
          or (select private.current_system_permission() = 'admin'))
    )
  );

-- ============================================================
-- Grants
-- ============================================================

revoke all on function public.create_report(jsonb) from public, anon, authenticated;
revoke all on function public.update_report(text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.start_report_review(text) from public, anon, authenticated;
revoke all on function public.reject_report_review(text, text) from public, anon, authenticated;
revoke all on function public.reopen_report(text, text) from public, anon, authenticated;
revoke all on function public.reset_report_ocr(text, text) from public, anon, authenticated;
revoke all on function public.record_report_ocr_run(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.soft_delete_report(text, text) from public, anon, authenticated;
revoke all on function public.archive_report(text, text) from public, anon, authenticated;
revoke all on function public.restore_report(text, text) from public, anon, authenticated;
revoke all on function public.upload_report_image(text, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.remove_report_image(text) from public, anon, authenticated;
revoke all on function public.upsert_live_report_image(jsonb) from public, anon, authenticated;
revoke all on function public.set_live_report_image_cover(text, text) from public, anon, authenticated;
revoke all on function public.update_live_report_image_metadata(text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.reorder_live_report_images(text, text[]) from public, anon, authenticated;
revoke all on function public.remove_live_report_image(text) from public, anon, authenticated;
revoke all on function public.get_report_revisions(text) from public, anon, authenticated;

grant execute on function public.create_report(jsonb) to authenticated;
grant execute on function public.update_report(text, jsonb, text, text) to authenticated;
grant execute on function public.start_report_review(text) to authenticated;
grant execute on function public.reject_report_review(text, text) to authenticated;
grant execute on function public.reopen_report(text, text) to authenticated;
grant execute on function public.reset_report_ocr(text, text) to authenticated;
grant execute on function public.record_report_ocr_run(text, jsonb, boolean) to authenticated;
grant execute on function public.soft_delete_report(text, text) to authenticated;
grant execute on function public.archive_report(text, text) to authenticated;
grant execute on function public.restore_report(text, text) to authenticated;
grant execute on function public.upload_report_image(text, text, text, text, text, bigint, text) to authenticated;
grant execute on function public.remove_report_image(text) to authenticated;
grant execute on function public.upsert_live_report_image(jsonb) to authenticated;
grant execute on function public.set_live_report_image_cover(text, text) to authenticated;
grant execute on function public.update_live_report_image_metadata(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.reorder_live_report_images(text, text[]) to authenticated;
grant execute on function public.remove_live_report_image(text) to authenticated;
grant execute on function public.get_report_revisions(text) to authenticated;

-- Read access is deliberately granted separately from write access. All
-- mutations above are RPC-only and re-check the mapped actor in the function.
grant select on table public.reports to authenticated;
grant select on table public.report_revisions to authenticated;
grant select on table public.report_images to authenticated;
grant select on table public.live_report_images to authenticated;

-- ============================================================
-- Comments
-- ============================================================

comment on table public.reports is 'P3 persistent final reports for Shopee and TikTok Shop live streams.';
comment on table public.report_revisions is 'P3 audit revision history for reports.';
comment on table public.report_images is 'P3 evidence images attached to reports.';
comment on table public.live_report_images is 'P3 live-session gallery images attached to reports.';
