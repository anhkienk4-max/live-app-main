-- RC19 W4 PRODUCTION CONSOLIDATED MIGRATION MANIFEST (11 Verified Unapplied Migrations)
-- Target: Supabase Production (egdjnpmoasarrttvhgds)
-- Generated at: 2026-11-18T04:54:10.860Z
-- Reconciled: Excludes already-applied 20261110140000 and 20261111000000

BEGIN;

-- =============================================================================
-- FAIL-CLOSED PRE-EXECUTION LEDGER AND SCHEMA SANITY CHECKS
-- =============================================================================
DO $precheck$
BEGIN
  -- 1. Assert schema_migrations table exists
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: supabase_migrations.schema_migrations table does not exist';
  END IF;

  -- 2. Assert already-applied baseline migrations 20261110140000 and 20261111000000 are present
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261110140000') THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Expected baseline migration 20261110140000 is missing from schema_migrations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261111000000') THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Expected baseline migration 20261111000000 is missing from schema_migrations';
  END IF;

  -- 3. Assert baseline tables workforce_overtime_requests and workforce_cancellation_compensation_cases exist
  IF to_regclass('public.workforce_overtime_requests') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.workforce_overtime_requests must already exist';
  END IF;
  IF to_regclass('public.workforce_cancellation_compensation_cases') IS NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.workforce_cancellation_compensation_cases must already exist';
  END IF;

  -- 4. Assert NONE of the 11 candidate versions are already applied (fail-closed against replay)
  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN (
      '20261112000000', '20261112120000', '20261112130000',
      '20261113083000', '20261113084154', '20261115120000',
      '20261115130000', '20261115140000', '20261115174231',
      '20261116120000', '20261117160000'
    )
  ) THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: One or more RC19 W4 candidate migrations already exist in schema_migrations (refusing replay)';
  END IF;

  -- 5. Assert candidate-introduced relation rc19_shift_assignment_replacements does NOT already exist
  IF to_regclass('public.rc19_shift_assignment_replacements') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK_FAILED: Table public.rc19_shift_assignment_replacements already exists prior to running manifest';
  END IF;
END $precheck$;

/*******************************************************************************
 * Migration: 20261112000000_rc19_c2_calendar_overlap_range.sql
 * Version:   20261112000000
 *******************************************************************************/
-- begin; (outer transaction wrapper)

-- Calendar date windows use half-open timestamp overlap while other list consumers keep start-date semantics.
do $guard$
begin
  if to_regclass('public.shifts') is null
    or to_regclass('public.shift_staffing_segments') is null
    or to_regprocedure('private.current_business_user_id()') is null
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='start_at' and data_type='timestamp with time zone')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shifts' and column_name='end_at' and data_type='timestamp with time zone')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='shift_staffing_segments' and column_name='shift_id') then
    raise exception using errcode='55000', message='RC19_C2_CALENDAR_BASELINE_REQUIRED';
  end if;
end
$guard$;

create or replace function private.filtered_shift_ids(p_scope text, p_filters jsonb)
returns table(id text, date date, start_time time, status text)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  actor text := private.current_business_user_id();
  key text;
  roles text[];
  reg_statuses text[];
  search_text text;
begin
  if actor is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_scope not in ('all', 'open', 'mine') or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds','eligibleOnly','calendarOverlap') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  foreach key in array array['brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','shiftIds'] loop
    if p_filters ? key and (jsonb_typeof(p_filters->key) is distinct from 'array') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if p_filters ? key and jsonb_array_length(p_filters->key) > 50 then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(p_filters->key, '[]'::jsonb)) value
      where jsonb_typeof(value) <> 'string' or length(value#>>'{}') > 128) then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  if (p_filters ? 'hasImportedStaffing' and jsonb_typeof(p_filters->'hasImportedStaffing') <> 'boolean')
    or (p_filters ? 'eligibleOnly' and jsonb_typeof(p_filters->'eligibleOnly') <> 'boolean')
    or (p_filters ? 'calendarOverlap' and jsonb_typeof(p_filters->'calendarOverlap') <> 'boolean')
    or (p_filters ? 'search' and jsonb_typeof(p_filters->'search') <> 'string')
    or (p_filters ? 'descending' and jsonb_typeof(p_filters->'descending') <> 'boolean')
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from') <> 'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to') <> 'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date > (p_filters->>'to')::date) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if coalesce((p_filters->>'calendarOverlap')::boolean, false) and not (p_filters ? 'from' and p_filters ? 'to') then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if length(coalesce(p_filters->>'search', '')) > 256 then raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID'; end if;
  roles := array(select jsonb_array_elements_text(coalesce(p_filters->'roles', '[]'::jsonb)));
  reg_statuses := array(select jsonb_array_elements_text(coalesce(p_filters->'registrationStatuses', '[]'::jsonb)));
  if exists(select 1 from unnest(roles) value where value not in ('host', 'support', 'technical'))
    or exists(select 1 from unnest(reg_statuses) value where value not in ('pending', 'approved', 'manually_assigned')) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search', '')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');
  return query
    select s.id, s.date, s.start_time, s.status
    from public.shifts s
    left join public.brands b on b.id = s.brand_id
    left join public.platforms p on p.id = s.platform_id
    where s.deleted_at is null and s.archived_at is null
      and (jsonb_array_length(coalesce(p_filters->'shiftIds', '[]')) = 0 or s.id in (select jsonb_array_elements_text(p_filters->'shiftIds')))
      and (
        p_scope <> 'open'
        or (
          s.status = 'scheduled'
          and not coalesce(s.registration_locked, false)
          and s.end_at > statement_timestamp()
          and (s.registration_cutoff_at is null or s.registration_cutoff_at > statement_timestamp())
          and exists (
            select 1
            from (values
              ('host', s.required_host_count),
              ('support', s.required_support_count),
              ('technical', s.required_technical_count)
            ) demand(role, required)
            where demand.required > 0
              and (
                cardinality(roles) = 0
                or demand.role = any(roles)
              )
              and (
                jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]'::jsonb)) = 0
                or demand.role in (select jsonb_array_elements_text(p_filters->'operationalRoles'))
              )
              and (
                not coalesce((p_filters->>'eligibleOnly')::boolean, false)
                or exists (
                  select 1 from public.business_users u
                  where u.id = actor and u.status = 'active' and demand.role = any(u.operational_roles)
                )
              )
              and (
                select count(*)
                from public.shift_registrations r
                where r.shift_id = s.id
                  and r.operational_role = demand.role
                  and r.status in ('approved', 'manually_assigned')
              ) < demand.required
          )
        )
      )
      and (
        (coalesce((p_filters->>'calendarOverlap')::boolean, false)
          and s.start_at < (((p_filters->>'to')::date + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
          and s.end_at > ((p_filters->>'from')::date::timestamp at time zone 'Asia/Ho_Chi_Minh'))
        or (not coalesce((p_filters->>'calendarOverlap')::boolean, false)
          and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
          and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date))
      )
      and (jsonb_array_length(coalesce(p_filters->'brandIds', '[]')) = 0 or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'platformIds', '[]')) = 0 or s.platform_id in (select jsonb_array_elements_text(p_filters->'platformIds')))
      and (jsonb_array_length(coalesce(p_filters->'campaignIds', '[]')) = 0 or s.campaign_id in (select jsonb_array_elements_text(p_filters->'campaignIds')))
      and (jsonb_array_length(coalesce(p_filters->'statuses', '[]')) = 0 or s.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (jsonb_array_length(coalesce(p_filters->'studios', '[]')) = 0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'studios') studio
        where lower(regexp_replace(btrim(coalesce(s.studio, '')), '\s+', ' ', 'g')) = studio
          or (studio = '__unassigned__' and btrim(coalesce(s.studio, '')) = '')
      ))
      and (search_text = '' or lower(concat_ws(' ', b.name, p.name, s.title, s.product_notes, s.studio)) like '%'||search_text||'%' escape E'\\')
      and (jsonb_array_length(coalesce(p_filters->'assignedUserIds', '[]')) = 0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'assignedUserIds') staff_id
        where staff_id in (s.host_id, s.support_id, s.technical_id) or exists(
          select 1 from public.shift_registrations r where r.shift_id = s.id and r.user_id = staff_id and r.status in ('approved', 'manually_assigned')
        )
      ))
      and (jsonb_array_length(coalesce(p_filters->'hostIds', '[]')) = 0 or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
      and (jsonb_array_length(coalesce(p_filters->'supportIds', '[]')) = 0 or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
      and (jsonb_array_length(coalesce(p_filters->'technicalIds', '[]')) = 0 or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
      and (jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]')) = 0 or exists(
        select 1 from (values ('host', s.required_host_count), ('support', s.required_support_count), ('technical', s.required_technical_count)) demand(role, n)
        where demand.n > 0 and demand.role in (select jsonb_array_elements_text(p_filters->'operationalRoles'))))
      and (jsonb_array_length(coalesce(p_filters->'staffingStates', '[]')) = 0 or exists(
        select 1 from public.get_shift_staffing_summary(array[s.id]) summary
        where (jsonb_array_length(coalesce(p_filters->'operationalRoles', '[]')) = 0
          or summary.role in (select jsonb_array_elements_text(p_filters->'operationalRoles')))
        having (bool_and(summary.approved >= summary.required) and p_filters->'staffingStates' ? 'fully_staffed')
          or (not bool_and(summary.approved >= summary.required) and p_filters->'staffingStates' ? 'missing_staff')))
      and (jsonb_array_length(coalesce(p_filters->'registrationStates', '[]')) = 0 or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.status::text in (select jsonb_array_elements_text(p_filters->'registrationStates'))))
      and (not coalesce((p_filters->>'hasImportedStaffing')::boolean, false) or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and (r.imported_name is not null or r.source = 'legacy_assignment')))
      and (p_scope <> 'mine' or exists(
        select 1 from public.shift_registrations r where r.shift_id = s.id and r.user_id = actor
          and r.status in ('pending', 'approved', 'manually_assigned')
          and (cardinality(roles) = 0 or r.operational_role::text = any(roles))
          and (cardinality(reg_statuses) = 0 or r.status::text = any(reg_statuses))
      ));
end;
$$;

revoke all on function private.filtered_shift_ids(text, jsonb) from public, anon, service_role;
grant execute on function private.filtered_shift_ids(text, jsonb) to authenticated;

-- commit; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112000000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261112120000_rc19_audit_history_keyset.sql
 * Version:   20261112120000
 *******************************************************************************/
-- Bounded Audit History reads. The invoker keeps the existing audit_logs RLS
-- policy authoritative; this function only changes pagination and query shape.
CREATE INDEX IF NOT EXISTS audit_logs_cursor_created_at_id_idx
  ON public.audit_logs (created_at DESC, id DESC);

DO $$
DECLARE
  v_policy_qual text;
  v_permission_is_stable boolean;
BEGIN
  SELECT qual INTO v_policy_qual FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_read'
    AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[] AND permissive = 'PERMISSIVE';
  IF v_policy_qual IS NULL OR v_policy_qual !~ $re$rbac_has_permission\('audit\.view'.*rbac_has_permission\('audit\.view_team'.*module.*calendar.*imports$re$ THEN
    RAISE EXCEPTION 'C12_AUDIT_POLICY_DEFINITION_DRIFT';
  END IF;
  SELECT provolatile = 's' INTO v_permission_is_stable
  FROM pg_catalog.pg_proc WHERE oid = 'private.rbac_has_permission(text)'::regprocedure;
  IF v_permission_is_stable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C12_AUDIT_PERMISSION_VOLATILITY_DRIFT';
  END IF;
END;
$$;

-- Scalar subqueries let PostgreSQL cache stable RBAC decisions per statement,
-- instead of rerunning the effective-permission lookup for every audit row.
ALTER POLICY audit_logs_read ON public.audit_logs USING (
  (SELECT private.rbac_has_permission('audit.view'))
  OR ((SELECT private.rbac_has_permission('audit.view_team'))
    AND module IN ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'))
);

CREATE OR REPLACE FUNCTION public.get_audit_history_page(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id text DEFAULT NULL,
  p_snapshot_at timestamptz DEFAULT NULL,
  p_page_size integer DEFAULT 20,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_from date;
  v_to date;
  v_snapshot timestamptz := least(coalesce(p_snapshot_at, statement_timestamp()), statement_timestamp());
  v_rows jsonb;
  v_count integer;
  v_last_created_at timestamptz;
  v_last_id text;
  v_has_more boolean;
  v_key text;
  v_query text;
BEGIN
  IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object'
    OR octet_length(p_filters::text) > 16384
    OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR p_sort IS NULL OR p_sort NOT IN ('newest', 'oldest')
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL))
    OR ((p_cursor_created_at IS NOT NULL) <> (p_snapshot_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_QUERY_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_filters) LOOP
    IF v_key NOT IN ('from', 'to', 'actor', 'brand_id', 'role', 'module', 'action', 'status', 'source', 'entity_type', 'entity_id', 'query') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
    IF v_key IN ('actor', 'brand_id', 'role', 'module', 'action', 'status', 'source')
      AND (jsonb_typeof(p_filters->v_key) IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_filters->v_key) > 50
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters->v_key) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(item #>> '{}') > 128)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
  END LOOP;

  IF p_filters ? 'from' AND (p_filters->>'from') !~ '^\d{4}-\d{2}-\d{2}$'
    OR p_filters ? 'to' AND (p_filters->>'to') !~ '^\d{4}-\d{2}-\d{2}$'
    OR length(coalesce(p_filters->>'entity_type', '')) > 128
    OR length(coalesce(p_filters->>'entity_id', '')) > 256
    OR length(coalesce(p_filters->>'query', '')) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END IF;

  BEGIN
    v_to := coalesce(nullif(p_filters->>'to', '')::date, (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
    v_from := coalesce(nullif(p_filters->>'from', '')::date, v_to - 29);
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END;
  IF v_to < v_from OR v_to - v_from > 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_DATE_RANGE_INVALID';
  END IF;
  v_query := nullif(btrim(p_filters->>'query'), '');

  IF p_sort = 'newest' THEN
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at DESC, id DESC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at ASC, id ASC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  ELSE
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) > (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at ASC, id ASC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at DESC, id DESC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at ASC, id ASC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  END IF;

  v_has_more := v_count > p_page_size;
  RETURN jsonb_build_object(
    'items', v_rows,
    'has_more', v_has_more,
    'next_cursor', CASE WHEN v_has_more THEN jsonb_build_object('created_at', v_last_created_at, 'id', v_last_id, 'snapshot_at', v_snapshot) ELSE NULL END,
    'page_size', p_page_size,
    'range', jsonb_build_object('from', v_from, 'to', v_to)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) TO authenticated;


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261112130000_rc19_c6_import_source_reconciliation.sql
 * Version:   20261112130000
 *******************************************************************************/
-- Import Confirm is atomic with its row receipt. Changed rows are never used
-- to mutate an existing Shift until an approved reconciliation contract exists.

create or replace function private.c6_import_changed_fields(p_previous jsonb, p_current jsonb)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  changed text[] := '{}'::text[];
  field_name text;
begin
  for field_name in
    select key
    from jsonb_object_keys(coalesce(p_previous, '{}'::jsonb) || coalesce(p_current, '{}'::jsonb)) as fields(key)
    where key not in ('row_number', 'warnings', 'errors')
      and p_previous->key is distinct from p_current->key
    order by key
  loop
    changed := array_append(changed, field_name);
  end loop;

  if p_previous->'custom_fields' is distinct from p_current->'custom_fields' then
    if exists (
      select 1
      from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
      full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
        using (key)
      where lower(key) like '%external%shift%'
         or lower(key) like '%shift%id%'
         or lower(key) like '%khung nhân sự%'
         or lower(key) like '%staffing slot%'
         or lower(key) like '%staffing segment%'
    ) then
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%external%shift%'
            or lower(key) like '%shift%id%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'external_shift_code'); end if;
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%khung nhân sự%'
            or lower(key) like '%staffing slot%'
            or lower(key) like '%staffing segment%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'staffing_segments'); end if;
      if not ('external_shift_code' = any(changed) or 'staffing_segments' = any(changed)) then
        changed := array_append(changed, 'source_custom_fields');
      end if;
    else
      changed := array_append(changed, 'source_custom_fields');
    end if;
  end if;

  return changed;
end;
$$;

alter function private.c6_import_changed_fields(jsonb, jsonb) owner to postgres;
revoke all on function private.c6_import_changed_fields(jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_schedule_import_shift(
  p_batch_id text,
  p_row_number integer,
  p_data jsonb,
  p_segments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.require_shift_actor(true);
  batch_row public.schedule_import_batches%rowtype;
  import_row public.schedule_import_batch_rows%rowtype;
  previous_row public.schedule_import_batch_rows%rowtype;
  previous_shift public.shifts%rowtype;
  existing_shift_id text;
  slot_count integer;
  exact_slot_count integer;
  ambiguous_slot_count integer;
  created_shift public.shifts%rowtype;
  previous_shift_ids text[];
  changed_fields text[];
  failure text;
  requested_outcome text;
  result jsonb;
begin
  if p_row_number is null or p_row_number < 1 then
    raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_PAYLOAD_INVALID';
  end if;

  select * into batch_row
  from public.schedule_import_batches
  where id = p_batch_id
  for update;
  if batch_row.id is null or batch_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if batch_row.created_by is distinct from actor_id then
    raise exception using errcode = '42501', message = 'IMPORT_BATCH_ACTOR_MISMATCH';
  end if;
  if batch_row.status not in ('previewed', 'failed', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(batch_row.source, batch_row.source_name, p_row_number)::text, 0
  ));

  select * into import_row
  from public.schedule_import_batch_rows
  where batch_id = p_batch_id and row_number = p_row_number
  for update;
  if import_row.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
  end if;

  if import_row.outcome in ('imported', 'warning') then
    select * into created_shift from public.shifts where id = import_row.shift_id;
    if created_shift.id is null or created_shift.import_batch_id is distinct from p_batch_id then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_SHIFT_MISMATCH';
    end if;
    return jsonb_build_object('outcome', import_row.outcome, 'shift', to_jsonb(created_shift), 'idempotent', true);
  elsif import_row.outcome = 'duplicate_skipped' then
    return jsonb_build_object('outcome', 'duplicate_skipped', 'idempotent', true);
  elsif import_row.outcome not in ('pending', 'retryable') or batch_row.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;

  if coalesce(nullif(p_data->>'brand_id', ''), '') = ''
     or coalesce(nullif(p_data->>'platform_id', ''), '') = '' then
    raise exception using errcode = '22023', message = 'IMPORT_BRAND_PLATFORM_REQUIRED';
  end if;
  if private.current_system_permission() = 'leader'
     and not private.rc19_has_any_leader_brand_scope(p_data->>'brand_id', array['shifts.manage']::text[]) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if not exists (
       select 1 from public.brands b
       where b.id = p_data->>'brand_id'
         and lower(btrim(b.name)) = lower(btrim(import_row.source_row->>'brand_name'))
     ) or not exists (
       select 1 from public.platforms p
       where p.id = p_data->>'platform_id'
         and lower(btrim(p.name)) = lower(btrim(import_row.source_row->>'platform_name'))
     ) then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;
  if p_data->>'date' is distinct from import_row.source_row->>'date'
     or left(p_data->>'start_time', 5) is distinct from import_row.source_row->>'start_time'
     or left(p_data->>'end_time', 5) is distinct from import_row.source_row->>'end_time' then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;

  select array_agg(distinct prior.shift_id order by prior.shift_id)
    into previous_shift_ids
  from public.schedule_import_batches prior_batch
  join public.schedule_import_batch_rows prior
    on prior.batch_id = prior_batch.id
  join public.shifts prior_shift
    on prior_shift.id = prior.shift_id
  where prior_batch.source = batch_row.source
    and prior_batch.source_name = batch_row.source_name
    and prior_batch.id <> batch_row.id
    and prior.row_number = p_row_number
    and prior.outcome in ('imported', 'warning')
    and prior.shift_id is not null;

  if coalesce(cardinality(previous_shift_ids), 0) > 1 then
    failure := 'IMPORT_SOURCE_HISTORY_AMBIGUOUS_REVIEW_REQUIRED';
  elsif coalesce(cardinality(previous_shift_ids), 0) = 1 then
    select prior.* into previous_row
    from public.schedule_import_batch_rows prior
    join public.schedule_import_batches prior_batch on prior_batch.id = prior.batch_id
    where prior_batch.source = batch_row.source
      and prior_batch.source_name = batch_row.source_name
      and prior_batch.id <> batch_row.id
      and prior.row_number = p_row_number
      and prior.outcome in ('imported', 'warning')
      and prior.shift_id = previous_shift_ids[1]
    order by prior_batch.confirmed_at desc nulls last, prior_batch.created_at desc, prior.updated_at desc
    limit 1;

    select * into previous_shift from public.shifts where id = previous_shift_ids[1];
    if previous_shift.id is null or not private.can_read_shift(previous_shift.id) then
      failure := 'IMPORT_SOURCE_HISTORY_SCOPE_REVIEW_REQUIRED';
    else
      changed_fields := private.c6_import_changed_fields(previous_row.source_row, import_row.source_row);
      if cardinality(changed_fields) = 0 then
        update public.schedule_import_batch_rows
        set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
        where id = import_row.id and outcome in ('pending', 'retryable');
        perform private.sync_schedule_import_batch_counts(p_batch_id);
        return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', previous_shift.id, 'idempotent', false);
      end if;
      failure := 'IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:' || array_to_string(changed_fields, ',');
    end if;
  end if;

  if failure is null then
    select count(*)::integer,
      count(*) filter (
        where coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      )::integer,
      count(*) filter (
        where not (
          (nullif(btrim(s.studio), '') is not null
            and nullif(btrim(p_data->>'studio'), '') is not null
            and lower(btrim(s.studio)) <> lower(btrim(p_data->>'studio')))
          or (nullif(btrim(s.campaign_id), '') is not null
            and nullif(btrim(p_data->>'campaign_id'), '') is not null
            and lower(btrim(s.campaign_id)) <> lower(btrim(p_data->>'campaign_id')))
        )
        and not (
          coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
        )
      )::integer
    into slot_count, exact_slot_count, ambiguous_slot_count
    from public.shifts s
    where s.deleted_at is null and s.archived_at is null
      and s.brand_id = p_data->>'brand_id'
      and s.platform_id = p_data->>'platform_id'
      and s.date = (p_data->>'date')::date
      and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
      and left(s.end_time::text, 5) = left(p_data->>'end_time', 5);
    if exact_slot_count > 1 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    elsif exact_slot_count = 1 and ambiguous_slot_count = 0 then
      select s.id into existing_shift_id from public.shifts s
      where s.deleted_at is null and s.archived_at is null
        and s.brand_id = p_data->>'brand_id'
        and s.platform_id = p_data->>'platform_id'
        and s.date = (p_data->>'date')::date
        and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
        and left(s.end_time::text, 5) = left(p_data->>'end_time', 5)
        and coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
        and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      order by s.id limit 1;
      update public.schedule_import_batch_rows
      set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
      where id = import_row.id and outcome in ('pending', 'retryable');
      perform private.sync_schedule_import_batch_counts(p_batch_id);
      return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', existing_shift_id, 'idempotent', false);
    elsif ambiguous_slot_count > 0 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    end if;
  end if;

  if failure is not null then
    update public.schedule_import_batch_rows
    set outcome = 'retryable', shift_id = null, failure_code = left(failure, 200)
    where id = import_row.id and outcome in ('pending', 'retryable');
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
    perform private.sync_schedule_import_batch_counts(p_batch_id);
    return jsonb_build_object('outcome', 'retryable', 'failure_code', left(failure, 200), 'changed_fields', to_jsonb(changed_fields));
  end if;

  requested_outcome := case
    when jsonb_typeof(import_row.source_row->'warnings') = 'array'
      and jsonb_array_length(import_row.source_row->'warnings') > 0 then 'warning'
    else 'imported'
  end;
  result := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('import_batch_id', p_batch_id);
  if jsonb_array_length(p_segments) > 0 then
    created_shift := public.create_shift_with_staffing_segments(result, p_segments);
  else
    created_shift := public.create_shift(result);
  end if;

  update public.schedule_import_batch_rows
  set outcome = requested_outcome, shift_id = created_shift.id, failure_code = null
  where id = import_row.id and outcome in ('pending', 'retryable');
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  return jsonb_build_object('outcome', requested_outcome, 'shift', to_jsonb(created_shift), 'idempotent', false);
end;
$$;

alter function public.create_schedule_import_shift(text, integer, jsonb, jsonb) owner to postgres;
revoke all on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) to authenticated;

comment on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) is
  'Atomically creates an imported shift with segments and its row receipt; identical source replays are skipped and changed source rows are held for authorized manual review without mutating operational history.';


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261112130000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261113083000_rc19_c4_audit_dependency.sql
 * Version:   20261113083000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $migration$
BEGIN
  IF to_regprocedure('private.log_shift_audit(text,text,text,text,text,jsonb,text[])') IS NULL THEN
    EXECUTE $definition$
      CREATE FUNCTION private.log_shift_audit(
        p_module text, p_action text, p_entity_type text, p_entity_id text,
        p_reason text, p_metadata jsonb, p_shift_ids text[]
      ) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
      AS $function$
      DECLARE
        v_actor_id text := private.current_business_user_id();
        v_actor_name text;
        v_actor_role text := private.current_system_permission();
      BEGIN
        SELECT full_name INTO v_actor_name FROM public.business_users WHERE id = v_actor_id;
        INSERT INTO public.audit_logs (
          actor_auth_user_id, actor_business_user_id, actor_name, actor_role,
          module, action, entity_type, entity_id, entity_name, after_data,
          reason, metadata, related_records
        ) VALUES (
          auth.uid(), v_actor_id, v_actor_name, v_actor_role,
          p_module, p_action, p_entity_type, p_entity_id, coalesce(p_entity_id, 'unknown'), p_metadata,
          p_reason, coalesce(p_metadata, '{}'::jsonb),
          coalesce((SELECT jsonb_agg(jsonb_build_object('entity_type', 'shift', 'entity_id', shift_id))
            FROM unnest(coalesce(p_shift_ids, ARRAY[]::text[])) shift_id), '[]'::jsonb)
        );
      END;
      $function$
    $definition$;
    REVOKE ALL ON FUNCTION private.log_shift_audit(text,text,text,text,text,jsonb,text[])
      FROM PUBLIC, anon, authenticated, service_role;
  END IF;
END;
$migration$;

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261113083000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261113084154_rc19_c4_atomic_staffing_replacement.sql
 * Version:   20261113084154
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.business_users') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.current_business_user_is_active()') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.log_shift_audit(text,text,text,text,text,jsonb,text[])') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = 'public.shift_registrations'::regclass
        AND a.attname = 'staffing_segment_id'
        AND a.attnum > 0
        AND NOT a.attisdropped
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      WHERE c.oid = 'public.shift_registrations'::regclass AND c.relrowsecurity
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'C4_REPLACEMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE TABLE public.rc19_shift_assignment_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_business_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  request_payload jsonb NOT NULL,
  shift_id text NOT NULL REFERENCES public.shifts(id) ON DELETE RESTRICT,
  staffing_segment_id text NOT NULL REFERENCES public.shift_staffing_segments(id) ON DELETE RESTRICT,
  old_registration_id text NOT NULL REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  new_registration_id text NOT NULL UNIQUE REFERENCES public.shift_registrations(id) ON DELETE RESTRICT,
  old_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  replacement_user_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  operational_role text NOT NULL CHECK (operational_role IN ('host', 'support', 'technical')),
  old_assignment_snapshot jsonb NOT NULL,
  expected_shift_version integer NOT NULL CHECK (expected_shift_version > 0),
  expected_registration_version integer NOT NULL CHECK (expected_registration_version > 0),
  effective_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  is_emergency boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CONSTRAINT rc19_shift_assignment_replacement_actor_key UNIQUE (actor_business_user_id, idempotency_key),
  CONSTRAINT rc19_shift_assignment_replacement_distinct_staff CHECK (old_user_id <> replacement_user_id)
);

CREATE INDEX rc19_shift_assignment_replacements_shift_created_idx
  ON public.rc19_shift_assignment_replacements (shift_id, created_at DESC, id DESC);

ALTER TABLE public.rc19_shift_assignment_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rc19_shift_assignment_replacements FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.replace_shift_assignment(
  p_shift_id text,
  p_staffing_segment_id text,
  p_registration_id text,
  p_replacement_user_id text,
  p_role text,
  p_expected_shift_version integer,
  p_expected_registration_version integer,
  p_effective_at timestamptz,
  p_reason text,
  p_is_emergency boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_permission text;
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz;
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_old public.shift_registrations%ROWTYPE;
  v_old_assignment_snapshot jsonb;
  v_new public.shift_registrations%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_request jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_active_count integer;
  v_roster jsonb;
  v_replayed boolean := false;
BEGIN
  v_actor_id := private.require_shift_actor(true);
  v_permission := private.current_system_permission();

  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_registration_id IS NULL OR btrim(p_registration_id) = ''
    OR p_replacement_user_id IS NULL OR btrim(p_replacement_user_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical')
    OR p_expected_shift_version IS NULL OR p_expected_shift_version < 1
    OR p_expected_registration_version IS NULL OR p_expected_registration_version < 1
    OR p_effective_at IS NULL
    OR p_idempotency_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF v_permission = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_staffing_segment_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
  END IF;

  v_request := jsonb_build_object(
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'registration_id', p_registration_id,
    'replacement_user_id', p_replacement_user_id,
    'role', p_role,
    'expected_shift_version', p_expected_shift_version,
    'expected_registration_version', p_expected_registration_version,
    'effective_at_epoch', extract(epoch FROM p_effective_at)::numeric,
    'reason', btrim(p_reason),
    'is_emergency', p_is_emergency
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO v_receipt
  FROM public.rc19_shift_assignment_replacements
  WHERE actor_business_user_id = v_actor_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO v_new FROM public.shift_registrations WHERE id = v_receipt.new_registration_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'user_id', r.user_id,
      'role', r.operational_role,
      'status', r.status,
      'version', r.version
    ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
    INTO v_roster
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = p_staffing_segment_id
      AND r.status IN ('approved', 'manually_assigned');
    SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;
    v_replayed := true;
    RETURN jsonb_build_object(
      'replacement_id', v_receipt.id,
      'shift_id', p_shift_id,
      'staffing_segment_id', p_staffing_segment_id,
      'old_registration_id', v_receipt.old_registration_id,
      'registration', jsonb_build_object(
        'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
        'operational_role', v_new.operational_role, 'status', v_new.status,
        'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
        'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
        'review_notes', v_new.review_notes, 'version', v_new.version
      ),
      'effective_at', v_receipt.effective_at,
      'shift_version', v_shift.version,
      'roster', v_roster,
      'replayed', v_replayed
    );
  END IF;

  IF v_shift.version <> p_expected_shift_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHIFT_VERSION_CONFLICT';
  END IF;
  IF v_shift.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_REPLACEABLE';
  END IF;
  IF NOT p_is_emergency AND v_shift.status NOT IN ('scheduled', 'preparing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMERGENCY_REPLACEMENT_REQUIRED';
  END IF;

  IF p_is_emergency THEN
    IF p_effective_at > v_now OR p_effective_at < v_segment.start_at OR p_effective_at >= v_segment.end_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT';
    END IF;
    v_effective_at := p_effective_at;
  ELSE
    IF p_effective_at < v_now - interval '30 seconds'
      OR p_effective_at > v_now + interval '30 seconds' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_EFFECTIVE_TIME_INVALID';
    END IF;
    v_effective_at := v_now;
  END IF;

  SELECT * INTO v_old
  FROM public.shift_registrations
  WHERE id = p_registration_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_old.version <> p_expected_registration_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_VERSION_CONFLICT';
  END IF;
  IF v_old.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_ACTIVE';
  END IF;
  IF v_old.staffing_segment_id IS DISTINCT FROM p_staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;
  IF v_old.operational_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_ROLE_MISMATCH';
  END IF;
  IF v_old.user_id = p_replacement_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_TARGET_IS_CURRENT_STAFF';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_replacement_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_replacement_user_id, v_shift, p_role, p_registration_id);

  SELECT count(*) INTO v_active_count
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.operational_role = p_role
    AND r.status IN ('approved', 'manually_assigned')
    AND r.id <> p_registration_id;
  IF v_active_count + 1 > (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;

  v_old_assignment_snapshot := jsonb_build_object(
    'id', v_old.id, 'user_id', v_old.user_id, 'status', v_old.status,
    'operational_role', v_old.operational_role, 'source', v_old.source,
    'staffing_segment_id', v_old.staffing_segment_id, 'version', v_old.version,
    'reviewed_by', v_old.reviewed_by, 'reviewed_at', v_old.reviewed_at,
    'review_notes', v_old.review_notes, 'cancelled_at', v_old.cancelled_at
  );

  UPDATE public.shift_registrations
  SET status = 'removed',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_notes = concat_ws(E'\n', nullif(btrim(review_notes), ''), 'REPLACED: ' || btrim(p_reason)),
      cancelled_at = v_now
  WHERE id = v_old.id
  RETURNING * INTO v_old;

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    requested_at, reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_replacement_user_id, p_role, 'manually_assigned', 'manual_assignment',
    v_now, v_actor_id, v_now, btrim(p_reason), p_staffing_segment_id
  ) RETURNING * INTO v_new;

  UPDATE public.shifts SET updated_at = v_now, updated_by = v_actor_id WHERE id = p_shift_id;
  SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;

  INSERT INTO public.rc19_shift_assignment_replacements (
    id, actor_business_user_id, idempotency_key, request_payload,
    shift_id, staffing_segment_id, old_registration_id, new_registration_id,
    old_user_id, replacement_user_id, operational_role, old_assignment_snapshot,
    expected_shift_version, expected_registration_version, effective_at, reason, is_emergency
  ) VALUES (
    v_replacement_id, v_actor_id, p_idempotency_key, v_request,
    p_shift_id, p_staffing_segment_id, v_old.id, v_new.id,
    v_old.user_id, p_replacement_user_id, p_role,
    v_old_assignment_snapshot,
    p_expected_shift_version, p_expected_registration_version, v_effective_at,
    btrim(p_reason), p_is_emergency
  ) RETURNING * INTO v_receipt;

  PERFORM private.log_shift_audit(
    'staffing', 'assignment_replaced', 'shift_registration', v_new.id,
    btrim(p_reason),
    jsonb_build_object(
      'replacement_id', v_receipt.id,
      'old_registration_id', v_old.id,
      'new_registration_id', v_new.id,
      'staffing_segment_id', p_staffing_segment_id,
      'operational_role', p_role,
      'effective_at', v_effective_at,
      'is_emergency', p_is_emergency,
      'expected_shift_version', p_expected_shift_version,
      'expected_registration_version', p_expected_registration_version
    ),
    ARRAY[p_shift_id]::text[]
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'user_id', r.user_id,
    'role', r.operational_role,
    'status', r.status,
    'version', r.version
  ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
  INTO v_roster
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.status IN ('approved', 'manually_assigned');

  RETURN jsonb_build_object(
    'replacement_id', v_receipt.id,
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'old_registration_id', v_old.id,
    'registration', jsonb_build_object(
      'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
      'operational_role', v_new.operational_role, 'status', v_new.status,
      'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
      'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
      'review_notes', v_new.review_notes, 'version', v_new.version
    ),
    'effective_at', v_effective_at,
    'shift_version', v_shift.version,
    'roster', v_roster,
    'replayed', false
  );
END;
$$;

ALTER FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) TO authenticated;

COMMENT ON TABLE public.rc19_shift_assignment_replacements IS
  'Private idempotency and immutable history receipt for atomic C4 shift staffing replacement.';
COMMENT ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) IS
  'Atomically replaces one active staffing-segment registration; derives actor and scope from the authenticated request.';

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261113084154') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115120000_rc19_w4_legacy_segment_compatibility.sql
 * Version:   20261115120000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.c511_guard_segment_registration()') IS NULL
    OR to_regprocedure('public.replace_shift_assignment(text,text,text,text,text,integer,integer,timestamp with time zone,text,boolean,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_LEGACY_SEGMENT_COMPATIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.c511_guard_segment_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_segment_count integer;
  v_role_segment_count integer;
  v_filled integer;
  v_capacity smallint;
BEGIN
  IF NEW.status IN ('approved', 'manually_assigned')
    AND private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(
      (SELECT s.brand_id FROM public.shifts s WHERE s.id = NEW.shift_id),
      ARRAY['shifts.manage']::text[]
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  IF NEW.staffing_segment_id IS NULL THEN
    IF TG_OP <> 'INSERT' THEN
      RETURN NEW;
    END IF;

    SELECT s.* INTO v_shift
    FROM public.shifts s
    WHERE s.id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE CASE NEW.operational_role
      WHEN 'host' THEN s.required_host_count
      WHEN 'support' THEN s.required_support_count
      WHEN 'technical' THEN s.required_technical_count
      ELSE 0
    END > 0)
    INTO v_segment_count, v_role_segment_count
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id;

    IF v_segment_count = 0 THEN
      RETURN NEW;
    END IF;
    IF v_role_segment_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    IF v_role_segment_count > 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_SELECTION_REQUIRED';
    END IF;

    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id
      AND CASE NEW.operational_role
        WHEN 'host' THEN s.required_host_count
        WHEN 'support' THEN s.required_support_count
        WHEN 'technical' THEN s.required_technical_count
        ELSE 0
      END > 0;
    NEW.staffing_segment_id := v_segment.id;
  ELSE
    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.id = NEW.staffing_segment_id AND s.shift_id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.staffing_segment_id IS NOT NULL
    AND OLD.staffing_segment_id <> NEW.staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_REGISTRATION_IMMUTABLE';
  END IF;

  IF NEW.status IN ('approved', 'manually_assigned') THEN
    v_capacity := CASE NEW.operational_role
      WHEN 'host' THEN v_segment.required_host_count
      WHEN 'support' THEN v_segment.required_support_count
      WHEN 'technical' THEN v_segment.required_technical_count
      ELSE NULL
    END;
    IF v_capacity IS NULL OR v_capacity <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    SELECT count(*) INTO v_filled
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = v_segment.id
      AND r.operational_role = NEW.operational_role
      AND r.status IN ('approved', 'manually_assigned')
      AND r.id <> NEW.id;
    IF v_filled >= v_capacity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_FULL';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION private.c511_guard_segment_registration() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.c511_guard_segment_registration() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.replace_shift_assignment(
  p_shift_id text,
  p_staffing_segment_id text,
  p_registration_id text,
  p_replacement_user_id text,
  p_role text,
  p_expected_shift_version integer,
  p_expected_registration_version integer,
  p_effective_at timestamptz,
  p_reason text,
  p_is_emergency boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_permission text;
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz;
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_old public.shift_registrations%ROWTYPE;
  v_old_assignment_snapshot jsonb;
  v_new public.shift_registrations%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_request jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_active_count integer;
  v_roster jsonb;
  v_replayed boolean := false;
BEGIN
  v_actor_id := private.require_shift_actor(true);
  v_permission := private.current_system_permission();

  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_registration_id IS NULL OR btrim(p_registration_id) = ''
    OR p_replacement_user_id IS NULL OR btrim(p_replacement_user_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical')
    OR p_expected_shift_version IS NULL OR p_expected_shift_version < 1
    OR p_expected_registration_version IS NULL OR p_expected_registration_version < 1
    OR p_effective_at IS NULL
    OR p_idempotency_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF v_permission = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_staffing_segment_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
  END IF;

  v_request := jsonb_build_object(
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'registration_id', p_registration_id,
    'replacement_user_id', p_replacement_user_id,
    'role', p_role,
    'expected_shift_version', p_expected_shift_version,
    'expected_registration_version', p_expected_registration_version,
    'effective_at_epoch', extract(epoch FROM p_effective_at)::numeric,
    'reason', btrim(p_reason),
    'is_emergency', p_is_emergency
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO v_receipt
  FROM public.rc19_shift_assignment_replacements
  WHERE actor_business_user_id = v_actor_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO v_new FROM public.shift_registrations WHERE id = v_receipt.new_registration_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'user_id', r.user_id,
      'role', r.operational_role,
      'status', r.status,
      'version', r.version
    ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
    INTO v_roster
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = p_staffing_segment_id
      AND r.status IN ('approved', 'manually_assigned');
    SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;
    v_replayed := true;
    RETURN jsonb_build_object(
      'replacement_id', v_receipt.id,
      'shift_id', p_shift_id,
      'staffing_segment_id', p_staffing_segment_id,
      'old_registration_id', v_receipt.old_registration_id,
      'registration', jsonb_build_object(
        'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
        'operational_role', v_new.operational_role, 'status', v_new.status,
        'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
        'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
        'review_notes', v_new.review_notes, 'version', v_new.version
      ),
      'effective_at', v_receipt.effective_at,
      'shift_version', v_shift.version,
      'roster', v_roster,
      'replayed', v_replayed
    );
  END IF;

  IF v_shift.version <> p_expected_shift_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHIFT_VERSION_CONFLICT';
  END IF;
  IF v_shift.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_REPLACEABLE';
  END IF;
  IF NOT p_is_emergency AND v_shift.status NOT IN ('scheduled', 'preparing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMERGENCY_REPLACEMENT_REQUIRED';
  END IF;

  IF p_is_emergency THEN
    IF p_effective_at > v_now OR p_effective_at < v_segment.start_at OR p_effective_at >= v_segment.end_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT';
    END IF;
    v_effective_at := p_effective_at;
  ELSE
    IF p_effective_at < v_now - interval '30 seconds'
      OR p_effective_at > v_now + interval '30 seconds' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_EFFECTIVE_TIME_INVALID';
    END IF;
    v_effective_at := v_now;
  END IF;

  SELECT * INTO v_old
  FROM public.shift_registrations
  WHERE id = p_registration_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_old.version <> p_expected_registration_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_VERSION_CONFLICT';
  END IF;
  IF v_old.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_ACTIVE';
  END IF;
  IF v_old.staffing_segment_id IS NOT NULL
    AND v_old.staffing_segment_id IS DISTINCT FROM p_staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;
  IF v_old.staffing_segment_id IS NULL AND (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;
  IF v_old.operational_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_ROLE_MISMATCH';
  END IF;
  IF v_old.user_id = p_replacement_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_TARGET_IS_CURRENT_STAFF';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_replacement_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_replacement_user_id, v_shift, p_role, p_registration_id);

  SELECT count(*) INTO v_active_count
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.operational_role = p_role
    AND r.status IN ('approved', 'manually_assigned')
    AND r.id <> p_registration_id;
  IF v_active_count + 1 > (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;

  v_old_assignment_snapshot := jsonb_build_object(
    'id', v_old.id, 'user_id', v_old.user_id, 'status', v_old.status,
    'operational_role', v_old.operational_role, 'source', v_old.source,
    'staffing_segment_id', v_old.staffing_segment_id, 'version', v_old.version,
    'reviewed_by', v_old.reviewed_by, 'reviewed_at', v_old.reviewed_at,
    'review_notes', v_old.review_notes, 'cancelled_at', v_old.cancelled_at
  );

  UPDATE public.shift_registrations
  SET status = 'removed',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_notes = concat_ws(E'\n', nullif(btrim(review_notes), ''), 'REPLACED: ' || btrim(p_reason)),
      cancelled_at = v_now
  WHERE id = v_old.id
  RETURNING * INTO v_old;

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    requested_at, reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_replacement_user_id, p_role, 'manually_assigned', 'manual_assignment',
    v_now, v_actor_id, v_now, btrim(p_reason), p_staffing_segment_id
  ) RETURNING * INTO v_new;

  UPDATE public.shifts SET updated_at = v_now, updated_by = v_actor_id WHERE id = p_shift_id;
  SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;

  INSERT INTO public.rc19_shift_assignment_replacements (
    id, actor_business_user_id, idempotency_key, request_payload,
    shift_id, staffing_segment_id, old_registration_id, new_registration_id,
    old_user_id, replacement_user_id, operational_role, old_assignment_snapshot,
    expected_shift_version, expected_registration_version, effective_at, reason, is_emergency
  ) VALUES (
    v_replacement_id, v_actor_id, p_idempotency_key, v_request,
    p_shift_id, p_staffing_segment_id, v_old.id, v_new.id,
    v_old.user_id, p_replacement_user_id, p_role,
    v_old_assignment_snapshot,
    p_expected_shift_version, p_expected_registration_version, v_effective_at,
    btrim(p_reason), p_is_emergency
  ) RETURNING * INTO v_receipt;

  PERFORM private.log_shift_audit(
    'staffing', 'assignment_replaced', 'shift_registration', v_new.id,
    btrim(p_reason),
    jsonb_build_object(
      'replacement_id', v_receipt.id,
      'old_registration_id', v_old.id,
      'new_registration_id', v_new.id,
      'staffing_segment_id', p_staffing_segment_id,
      'operational_role', p_role,
      'effective_at', v_effective_at,
      'is_emergency', p_is_emergency,
      'legacy_parent_assignment_mapped', v_old.staffing_segment_id IS NULL,
      'expected_shift_version', p_expected_shift_version,
      'expected_registration_version', p_expected_registration_version
    ),
    ARRAY[p_shift_id]::text[]
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'user_id', r.user_id,
    'role', r.operational_role,
    'status', r.status,
    'version', r.version
  ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
  INTO v_roster
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.status IN ('approved', 'manually_assigned');

  RETURN jsonb_build_object(
    'replacement_id', v_receipt.id,
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'old_registration_id', v_old.id,
    'registration', jsonb_build_object(
      'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
      'operational_role', v_new.operational_role, 'status', v_new.status,
      'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
      'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
      'review_notes', v_new.review_notes, 'version', v_new.version
    ),
    'effective_at', v_effective_at,
    'shift_version', v_shift.version,
    'roster', v_roster,
    'replayed', false
  );
END;
$$;
ALTER FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) TO authenticated;
COMMENT ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) IS 'Atomically replaces segment-linked assignments and permits an authorized explicit segment choice for legacy parent-level assignments without rewriting the original row.';

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115130000_rc19_w4_segmented_manual_assignment.sql
 * Version:   20261115130000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SEGMENT_ASSIGNMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.insert_manual_shift_assignment_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_actor_id text,
  p_notes text,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  created_registration public.shift_registrations;
BEGIN
  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF target_shift.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF target_shift.status <> 'scheduled' OR target_shift.registration_locked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_OPEN';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, NULL);

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_user_id, p_role, 'manually_assigned', 'manual_assignment',
    p_actor_id, statement_timestamp(), p_notes, p_staffing_segment_id
  ) RETURNING * INTO created_registration;

  PERFORM private.refresh_shift_registration_lock(p_shift_id, false);
  RETURN created_registration;
END;
$$;
ALTER FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manual_assign_shift_staff_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_notes text,
  p_expected_version integer,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text;
  target_shift public.shifts;
  current_version integer;
BEGIN
  actor_id := private.require_shift_actor(true);
  IF NOT private.current_business_user_is_active()
    OR NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host','support','technical') OR p_expected_version IS NULL
    OR p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SEGMENT_ASSIGNMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(target_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;
  current_version := target_shift.version;
  PERFORM private.assert_expected_version('Shift', p_expected_version, current_version);

  RETURN private.insert_manual_shift_assignment_to_segment(
    p_shift_id, p_user_id, p_role, actor_id, p_notes, p_staffing_segment_id
  );
END;
$$;
ALTER FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  TO authenticated;
COMMENT ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) IS
  'Assigns staff to an explicitly selected persisted staffing segment with actor, permission, Brand, version, qualification, availability and segment-capacity checks.';

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115130000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115140000_rc19_w4_pass_swap_segment_preservation.sql
 * Version:   20261115140000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)
DO $guard$
BEGIN
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='W4_PASS_SWAP_SEGMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;
create or replace function public.approve_shift_swap_request(p_request_id text, p_notes text default null)
returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  request_row public.swap_requests;
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  requester public.business_users;
  participant public.business_users;
  approved_history jsonb;
  completed_history jsonb;
  now_at timestamptz := statement_timestamp();
  new_target_reg_id text := gen_random_uuid()::text;
  new_source_reg_id text := gen_random_uuid()::text;
  new_replacement_reg_id text := gen_random_uuid()::text;
begin
  actor_id := private.require_shift_actor(true);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.status <> 'accepted' then raise exception using errcode = 'P0001', message = 'SWAP_NOT_ACCEPTED'; end if;

  perform private.lock_swap_registrations(array_remove(array[
    request_row.source_registration_id,
    request_row.counterpart_registration_id
  ]::text[], null));
  perform private.lock_swap_shifts(array_remove(array[
    request_row.source_shift_id,
    coalesce(request_row.target_shift_id, request_row.source_shift_id)
  ]::text[], null));
  perform private.lock_swap_rows(array_remove(array[
    'user:' || request_row.requester_id,
    'user:' || request_row.counterpart_id,
    'user:' || request_row.replacement_staff_id
  ]::text[], null));
  perform private.lock_swap_users(array_remove(array[
    request_row.requester_id,
    request_row.counterpart_id,
    request_row.replacement_staff_id
  ]::text[], null));

  select * into source_registration from public.shift_registrations where id = request_row.source_registration_id;
  if source_registration.id is null or source_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_STALE';
  end if;
  if source_registration.user_id <> request_row.requester_id
     or source_registration.shift_id <> request_row.source_shift_id
     or source_registration.operational_role <> request_row.operational_role then
    raise exception using errcode = 'P0001', message = 'SOURCE_OWNER_MISMATCH';
  end if;
  select * into source_shift from public.shifts where id = request_row.source_shift_id;
  select * into target_shift from public.shifts where id = coalesce(request_row.target_shift_id, request_row.source_shift_id);
  if source_shift.id is null or target_shift.id is null
     or source_shift.deleted_at is not null or source_shift.archived_at is not null
     or target_shift.deleted_at is not null or target_shift.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'SHIFT_STALE';
  end if;
  if source_shift.status <> 'scheduled' or target_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_SCHEDULED';
  end if;

  -- Issue #93: Validation on Approval Timing
  if request_row.mode = 'replacement' then
    -- Ordinary PASS cannot be approved during or after live
    if now_at >= source_shift.start_at then
      raise exception using errcode = 'P0001', message = 'PASS_DURING_LIVE_NOT_ALLOWED';
    end if;

    -- Campaign PASS MUST be approved at least 24 hours (1440 minutes) before live start
    -- QUY TẮC: Ca có campaign_id luôn là ca Campaign, kể cả khi campaign đã archived.
    -- Campaign archived KHÔNG BAO GIỜ hạ cấp thành ca Daily!
    if source_shift.campaign_id is not null
       and btrim(source_shift.campaign_id) <> ''
       and lower(btrim(source_shift.campaign_id)) <> 'none' then
      if now_at > (source_shift.start_at - interval '24 hours') then
        raise exception using errcode = 'P0001', message = 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED';
      end if;
    end if;
  else
    -- Exchange cannot be approved during live
    if now_at >= source_shift.start_at or now_at >= target_shift.start_at then
      raise exception using errcode = 'P0001', message = 'EXCHANGE_DURING_LIVE_NOT_ALLOWED';
    end if;
  end if;

  select * into requester from public.business_users where id = request_row.requester_id;
  if requester.id is null or requester.status <> 'active' or requester.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REQUESTER_INACTIVE';
  end if;
  perform private.assert_shift_role_eligibility(requester.id, request_row.operational_role);

  if request_row.mode = 'replacement' then
    if request_row.replacement_staff_id is null or request_row.replacement_staff_id = requester.id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_MISSING';
    end if;
    select * into participant from public.business_users where id = request_row.replacement_staff_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id and user_id = participant.id
        and status in ('approved', 'manually_assigned')
    ) then
      raise exception using errcode = '23505', message = 'REPLACEMENT_ALREADY_ASSIGNED';
    end if;
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, null);

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id = source_registration.id;

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values (
      new_replacement_reg_id, source_shift.id, participant.id, request_row.operational_role,
      'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id
    );
  else
    select * into counterpart_registration
    from public.shift_registrations
    where id = request_row.counterpart_registration_id;
    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_STALE';
    end if;
    if counterpart_registration.shift_id <> target_shift.id
       or counterpart_registration.operational_role <> request_row.operational_role
       or counterpart_registration.user_id <> request_row.counterpart_id
       or counterpart_registration.user_id = requester.id then
      raise exception using errcode = '22023', message = 'COUNTERPART_MISMATCH';
    end if;
    select * into participant from public.business_users where id = request_row.counterpart_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and id <> request_row.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    perform private.assert_shift_capacity(target_shift, request_row.operational_role, counterpart_registration.id);
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(requester.id, target_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, counterpart_registration.id);

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id in (source_registration.id, counterpart_registration.id);

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values
      (new_target_reg_id, target_shift.id, requester.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, counterpart_registration.staffing_segment_id),
      (new_source_reg_id, source_shift.id, participant.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id);
  end if;

  approved_history := jsonb_build_object(
    'action', 'approved',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'accepted',
    'to_status', 'approved',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );
  completed_history := jsonb_build_object(
    'action', 'completed',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'approved',
    'to_status', 'completed',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );

  update public.swap_requests
  set status = 'approved',
      approved_by = actor_id,
      approved_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(approved_history)
  where id = request_row.id
  returning * into request_row;

  update public.swap_requests
  set status = 'completed',
      completed_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(completed_history)
  where id = request_row.id
  returning * into request_row;

  perform private.log_shift_audit(
    'swaps', 'approve', 'swap_request', request_row.id,
    'Swap approved & completed: ' || request_row.mode,
    jsonb_build_object('request_id', request_row.id, 'mode', request_row.mode),
    array_remove(array[source_shift.id, case when request_row.mode = 'exchange' then target_shift.id end], null)
  );

  return request_row;
end;
$$;
ALTER FUNCTION public.approve_shift_swap_request(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text,text) TO authenticated;

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115140000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261115174231_rc19_w4_retire_unguarded_swap_approval.sql
 * Version:   20261115174231
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text,integer)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.approve_shift_swap_request(
  p_request_id text,
  p_notes text,
  p_expected_version integer
)
RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_version integer;
BEGIN
  SELECT version INTO current_version
  FROM public.swap_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF current_version IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_NOT_FOUND';
  END IF;

  PERFORM private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  RETURN public.approve_shift_swap_request(p_request_id, p_notes);
END;
$$;

ALTER FUNCTION public.approve_shift_swap_request(text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text, integer) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text, text) FROM PUBLIC, anon, authenticated, service_role;

DO $verify$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_APPROVAL_VERSION_GUARD_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261115174231') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261116120000_rc19_w4_swap_preflight_and_segment_capacity.sql
 * Version:   20261116120000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.swap_requests') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.assert_shift_capacity(public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- Serialize capacity checks on the segment row; the authoritative write path
-- still validates the same invariant in its transaction.
CREATE OR REPLACE FUNCTION private.enforce_staffing_segment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  segment public.shift_staffing_segments%ROWTYPE;
  capacity integer;
  active_count integer;
BEGIN
  IF NEW.status NOT IN ('approved', 'manually_assigned') OR NEW.staffing_segment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.staffing_segment_id IS NOT DISTINCT FROM OLD.staffing_segment_id
    AND NEW.operational_role IS NOT DISTINCT FROM OLD.operational_role
    AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO segment
  FROM public.shift_staffing_segments
  WHERE id = NEW.staffing_segment_id AND shift_id = NEW.shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;

  capacity := CASE NEW.operational_role::text
    WHEN 'host' THEN segment.required_host_count
    WHEN 'support' THEN segment.required_support_count
    WHEN 'technical' THEN segment.required_technical_count
    ELSE 0
  END;
  IF capacity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.shift_registrations
  WHERE staffing_segment_id = NEW.staffing_segment_id
    AND operational_role = NEW.operational_role
    AND status IN ('approved', 'manually_assigned')
    AND id IS DISTINCT FROM NEW.id;
  IF active_count + 1 > capacity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.enforce_staffing_segment_capacity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_staffing_segment_capacity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS shift_registrations_enforce_segment_capacity ON public.shift_registrations;
CREATE TRIGGER shift_registrations_enforce_segment_capacity
BEFORE INSERT OR UPDATE OF shift_id, staffing_segment_id, operational_role, status
ON public.shift_registrations
FOR EACH ROW EXECUTE FUNCTION private.enforce_staffing_segment_capacity();

CREATE OR REPLACE FUNCTION private.swap_conflict_exists(
  p_user_id text,
  p_shift_id text,
  p_role text,
  p_exclude_registration_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  error_message text;
BEGIN
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_shift_id;
  IF target_shift.id IS NULL THEN RETURN true; END IF;
  BEGIN
    PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, p_exclude_registration_id);
    RETURN false;
  EXCEPTION
    WHEN unique_violation THEN RETURN true;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      IF error_message IN ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED') THEN RETURN true; END IF;
      RAISE;
  END;
END;
$$;
REVOKE ALL ON FUNCTION private.swap_conflict_exists(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_shift_swap_conflict(
  p_source_registration_id text,
  p_mode text,
  p_replacement_staff_id text DEFAULT NULL,
  p_target_shift_id text DEFAULT NULL,
  p_counterpart_registration_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.require_shift_actor(false);
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  source_segment public.shift_staffing_segments;
  target_segment public.shift_staffing_segments;
  candidate public.business_users;
  role_name text;
  source_capacity integer;
  target_capacity integer;
  active_count integer;
BEGIN
  IF p_source_registration_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('replacement', 'exchange') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_PREFLIGHT_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO source_registration
  FROM public.shift_registrations
  WHERE id = p_source_registration_id
  FOR UPDATE;
  IF source_registration.id IS NULL OR source_registration.user_id <> actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_NOT_OWNER';
  END IF;
  IF source_registration.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_NOT_ACTIVE';
  END IF;

  SELECT * INTO source_shift
  FROM public.shifts
  WHERE id = source_registration.shift_id
  FOR SHARE;
  IF source_shift.id IS NULL OR source_shift.deleted_at IS NOT NULL OR source_shift.archived_at IS NOT NULL
    OR source_shift.status <> 'scheduled' OR NOT private.can_read_shift(source_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SHIFT_NOT_SCHEDULED';
  END IF;
  role_name := source_registration.operational_role::text;
  PERFORM private.assert_shift_role_eligibility(actor_id, role_name);

  IF p_mode = 'replacement' THEN
    IF p_replacement_staff_id IS NULL OR p_target_shift_id IS NOT NULL
      OR p_counterpart_registration_id IS NOT NULL OR p_replacement_staff_id = actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_staff_id, 91731));
    SELECT * INTO candidate FROM public.business_users
    WHERE id = p_replacement_staff_id AND status = 'active' AND account_status = 'active'
      AND archived_at IS NULL AND deleted_at IS NULL;
    IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPLACEMENT_INACTIVE'; END IF;
    PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);
    IF EXISTS (SELECT 1 FROM public.shift_registrations
      WHERE shift_id = source_shift.id AND user_id = candidate.id
        AND status IN ('approved', 'manually_assigned')) THEN RETURN 'CONFLICT'; END IF;

    IF source_registration.staffing_segment_id IS NULL THEN
      PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    ELSE
      SELECT * INTO source_segment FROM public.shift_staffing_segments
      WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
      IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
      source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
        WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
      SELECT count(*) INTO active_count FROM public.shift_registrations
      WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
        AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
      IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
    END IF;
    IF private.swap_conflict_exists(candidate.id, source_shift.id, role_name, NULL) THEN RETURN 'CONFLICT'; END IF;
    RETURN 'VERIFIED_CLEAR';
  END IF;

  IF p_replacement_staff_id IS NOT NULL OR p_target_shift_id IS NULL
    OR p_counterpart_registration_id IS NULL OR p_target_shift_id = source_shift.id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  END IF;
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_target_shift_id FOR SHARE;
  IF target_shift.id IS NULL OR target_shift.deleted_at IS NOT NULL OR target_shift.archived_at IS NOT NULL
    OR target_shift.status <> 'scheduled' OR NOT private.can_read_shift(target_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SHIFT_NOT_ELIGIBLE';
  END IF;
  SELECT * INTO counterpart_registration FROM public.shift_registrations
  WHERE id = p_counterpart_registration_id AND shift_id = target_shift.id FOR UPDATE;
  IF counterpart_registration.id IS NULL OR counterpart_registration.operational_role::text <> role_name
    OR counterpart_registration.status NOT IN ('approved', 'manually_assigned')
    OR counterpart_registration.user_id = actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_NOT_ELIGIBLE';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(counterpart_registration.user_id, 91731));
  SELECT * INTO candidate FROM public.business_users
  WHERE id = counterpart_registration.user_id AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL;
  IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_INACTIVE'; END IF;
  PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);

  IF source_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
  ELSE
    SELECT * INTO target_segment FROM public.shift_staffing_segments
    WHERE id = counterpart_registration.staffing_segment_id AND shift_id = target_shift.id FOR SHARE;
    IF target_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SEGMENT_INVALID'; END IF;
    target_capacity := CASE role_name WHEN 'host' THEN target_segment.required_host_count
      WHEN 'support' THEN target_segment.required_support_count ELSE target_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = target_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> counterpart_registration.id;
    IF target_capacity <= 0 OR active_count + 1 > target_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF counterpart_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
  ELSE
    SELECT * INTO source_segment FROM public.shift_staffing_segments
    WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
    IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
    source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
      WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
    IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF private.swap_conflict_exists(actor_id, target_shift.id, role_name, source_registration.id)
    OR private.swap_conflict_exists(candidate.id, source_shift.id, role_name, counterpart_registration.id) THEN
    RETURN 'CONFLICT';
  END IF;
  RETURN 'VERIFIED_CLEAR';
END;
$$;
ALTER FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) TO authenticated;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.enforce_staffing_segment_capacity()', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261116120000') ON CONFLICT (version) DO NOTHING;

/*******************************************************************************
 * Migration: 20261117160000_rc19_w4_pass_recipient_visibility.sql
 * Version:   20261117160000
 *******************************************************************************/
-- BEGIN; (outer transaction wrapper)

DO $guard$
BEGIN
  IF to_regclass('public.swap_requests') IS NULL
    OR to_regclass('public.shifts') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL
    OR to_regprocedure('public.get_swap_list_page(integer,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_PASS_RECIPIENT_VISIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- 1. Extend RLS on swap_requests to allow the replacement staff (PASS recipient)
-- to view their pending, accepted, and completed swap requests.
DROP POLICY IF EXISTS swap_requests_select ON public.swap_requests;
CREATE POLICY swap_requests_select ON public.swap_requests FOR SELECT TO authenticated USING (
  (SELECT private.current_business_user_is_active()) AND (
    requester_id = (SELECT private.current_business_user_id())
    OR counterpart_id = (SELECT private.current_business_user_id())
    OR replacement_staff_id = (SELECT private.current_business_user_id())
    OR new_host_id = (SELECT private.current_business_user_id())
    OR new_support_id = (SELECT private.current_business_user_id())
    OR new_technical_id = (SELECT private.current_business_user_id())
    OR ((SELECT private.current_system_permission()) = 'admin')
    OR (
      (SELECT private.current_system_permission()) = 'leader'
      AND EXISTS (
        SELECT 1 FROM public.shifts s
        WHERE (s.id = coalesce(nullif(swap_requests.shift_id, ''), swap_requests.source_shift_id)
               OR s.id = swap_requests.target_shift_id)
          AND private.can_read_shift(s.id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.shift_registrations sr
      WHERE sr.shift_id = source_shift_id
        AND sr.user_id = (SELECT private.current_business_user_id())
        AND sr.status IN ('approved','manually_assigned')
    )
  )
);

-- 2. Update can_read_shift so that:
-- a) Members can read future scheduled shifts (end_at > statement_timestamp())
--    even if filled/locked, allowing exchange candidate browsing.
-- b) Members involved in a swap request (as requester, counterpart, or replacement staff)
--    can read the shift even if it has ended or was locked.
CREATE OR REPLACE FUNCTION private.can_read_shift(p_shift_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN private.current_system_permission() = 'admin' THEN true
      WHEN shift.deleted_at IS NOT NULL OR shift.archived_at IS NOT NULL THEN false
      WHEN private.current_system_permission() = 'leader' THEN
        private.rc19_has_any_leader_brand_scope(shift.brand_id, ARRAY[
          'shifts.read', 'shifts.manage'
        ]::text[])
      ELSE (
        (shift.status = 'scheduled' AND shift.end_at > statement_timestamp())
        OR private.current_business_user_id() IN (shift.host_id, shift.support_id, shift.technical_id)
        OR EXISTS (
          SELECT 1 FROM public.shift_registrations AS registration
          WHERE registration.shift_id = shift.id
            AND registration.user_id = private.current_business_user_id()
            AND registration.status IN ('pending', 'approved', 'manually_assigned')
        )
        OR EXISTS (
          SELECT 1 FROM public.swap_requests AS sw
          WHERE (sw.shift_id = shift.id OR sw.source_shift_id = shift.id OR sw.target_shift_id = shift.id)
            AND (
              sw.requester_id = private.current_business_user_id()
              OR sw.counterpart_id = private.current_business_user_id()
              OR sw.replacement_staff_id = private.current_business_user_id()
              OR sw.new_host_id = private.current_business_user_id()
              OR sw.new_support_id = private.current_business_user_id()
              OR sw.new_technical_id = private.current_business_user_id()
            )
            AND sw.deleted_at IS NULL
        )
      )
    END
    FROM public.shifts AS shift
    WHERE shift.id = p_shift_id AND private.current_business_user_is_active()
  ), false);
$$;
ALTER FUNCTION private.can_read_shift(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_shift(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_shift(text) TO authenticated;

-- 3. Update get_swap_list_page:
-- Support scope='forMe' for both replacement_staff_id and counterpart_id.
-- Ensure counts and matching rows respect the caller's brand and shift scope.
CREATE OR REPLACE FUNCTION public.get_swap_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
RETURNS jsonb language plpgsql stable security invoker set search_path=''
AS $$
DECLARE
  actor text := private.current_business_user_id();
  result jsonb;
  search_text text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text) > 16384
    OR coalesce(p_filters->>'scope', 'all') NOT IN ('all', 'mine', 'forMe')
    OR length(coalesce(p_filters->>'search', '')) > 256 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_QUERY_INVALID';
  END IF;
  IF (p_filters ? 'statuses' AND (jsonb_typeof(p_filters->'statuses') <> 'array' OR jsonb_array_length(p_filters->'statuses') > 50))
    OR (p_filters ? 'roles' AND (jsonb_typeof(p_filters->'roles') <> 'array' OR jsonb_array_length(p_filters->'roles') > 3))
    OR (p_filters ? 'requesterIds' AND (jsonb_typeof(p_filters->'requesterIds') <> 'array' OR jsonb_array_length(p_filters->'requesterIds') > 50)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_FILTER_INVALID';
  END IF;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search', '')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');

  WITH shift_ids AS MATERIALIZED (
    SELECT * FROM private.filtered_shift_ids('all', p_filters - 'scope' - 'roles' - 'statuses' - 'requesterIds' - 'search')
  ), directory AS MATERIALIZED (
    SELECT id, full_name FROM public.get_staff_directory() WHERE search_text <> ''
    UNION SELECT id, full_name FROM public.business_users WHERE search_text <> ''
  ), all_rows AS MATERIALIZED (
    SELECT sw.* FROM public.swap_requests sw
    JOIN shift_ids ids ON ids.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE sw.deleted_at IS NULL
  ), matching AS MATERIALIZED (
    SELECT sw.* FROM all_rows sw
    JOIN public.shifts s ON s.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE (
      coalesce(p_filters->>'scope', 'all') = 'all'
      OR (p_filters->>'scope' = 'mine' AND sw.requester_id = actor)
      OR (p_filters->>'scope' = 'forMe' AND (
        sw.counterpart_id = actor
        OR sw.replacement_staff_id = actor
        OR sw.new_host_id = actor
        OR sw.new_support_id = actor
        OR sw.new_technical_id = actor
      ))
    )
    AND (jsonb_array_length(coalesce(p_filters->'requesterIds', '[]')) = 0 OR sw.requester_id IN (SELECT jsonb_array_elements_text(p_filters->'requesterIds')))
    AND (jsonb_array_length(coalesce(p_filters->'roles', '[]')) = 0 OR coalesce(sw.operational_role, CASE WHEN sw.new_support_id IS NOT NULL THEN 'support' WHEN sw.new_technical_id IS NOT NULL THEN 'technical' ELSE 'host' END) IN (SELECT jsonb_array_elements_text(p_filters->'roles')))
    AND (jsonb_array_length(coalesce(p_filters->'statuses', '[]')) = 0 OR sw.status::text IN (SELECT jsonb_array_elements_text(p_filters->'statuses')))
    AND (search_text = '' OR lower(concat_ws(' ', sw.id, s.title, sw.reason,
      (SELECT full_name FROM directory WHERE id = sw.requester_id LIMIT 1),
      (SELECT full_name FROM directory WHERE id = coalesce(sw.replacement_staff_id, sw.new_host_id, sw.new_support_id, sw.new_technical_id, sw.counterpart_id) LIMIT 1))) LIKE '%'||search_text||'%' ESCAPE E'\\')
  ), stats AS (
    SELECT count(*) total, least(p_page, greatest(1, ceil(count(*)::numeric / p_page_size)::integer)) page FROM matching
  ), selected AS (
    SELECT * FROM matching ORDER BY created_at DESC, id LIMIT p_page_size OFFSET ((SELECT page FROM stats) - 1) * p_page_size
  ), counts AS (
    SELECT jsonb_build_object(
      'all', count(*),
      'mine', count(*) FILTER (WHERE requester_id = actor),
      'forMe', count(*) FILTER (WHERE counterpart_id = actor OR replacement_staff_id = actor OR new_host_id = actor OR new_support_id = actor OR new_technical_id = actor),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'accepted', count(*) FILTER (WHERE status IN ('accepted', 'approved')),
      'completed', count(*) FILTER (WHERE status = 'completed'),
      'rejected', count(*) FILTER (WHERE status = 'rejected'),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled')
    ) value FROM all_rows
  )
  SELECT jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(selected) ORDER BY created_at DESC, id), '[]'::jsonb),
    'total', (SELECT total FROM stats),
    'page', (SELECT page FROM stats),
    'pageSize', p_page_size,
    'counts', (SELECT value FROM counts)
  ) INTO result FROM selected;
  RETURN result;
END;
$$;
ALTER FUNCTION public.get_swap_list_page(integer, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) TO authenticated;

-- COMMIT; (outer transaction wrapper)


-- Record migration receipt
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('20261117160000') ON CONFLICT (version) DO NOTHING;

COMMIT;
