--
-- PostgreSQL database dump
--

\restrict pK9EeTlgjww1zADtOjtbQEiwi929xZrJIFNZa7SuyGNKDfRDOkafISWFRI9fAJL

-- Dumped from database version 17.6 (Ubuntu 17.6-2.pgdg24.04+1)
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auth;


--
-- Name: cron; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA cron;


--
-- Name: SCHEMA cron; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA cron IS 'Local PG17 rehearsal adapter; pg_cron worker behavior is not simulated.';


--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA storage;


--
-- Name: supabase_migrations; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA supabase_migrations;


--
-- Name: jwt(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.jwt() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;


--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user)
$$;


--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: -
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;


--
-- Name: schedule(text, text, text); Type: FUNCTION; Schema: cron; Owner: -
--

CREATE FUNCTION cron.schedule(text, text, text) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE result bigint;
BEGIN
  INSERT INTO cron.job(jobname, schedule, command, username, database)
  VALUES ($1, $2, $3, current_user, current_database())
  ON CONFLICT (jobname) DO UPDATE
    SET schedule = excluded.schedule, command = excluded.command,
        username = excluded.username, database = excluded.database
  RETURNING jobid INTO result;
  RETURN result;
END
$_$;


--
-- Name: assert_expected_version(text, integer, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_expected_version(p_entity text, p_expected_version integer, p_actual_version integer) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'EXPECTED_VERSION_REQUIRED',
      detail = pg_catalog.format('%s mutations require the positive revision that was read by the caller', p_entity);
  end if;
  if p_expected_version <> p_actual_version then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_WRITE',
      detail = pg_catalog.format('%s revision is stale; expected %s, actual %s', p_entity, p_expected_version, p_actual_version);
  end if;
end;
$$;


--
-- Name: is_valid_shift_supplemental_fields(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_valid_shift_supplemental_fields(p_fields jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $_$
  select case
    when p_fields is null or jsonb_typeof(p_fields) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(p_fields)) > 50 then false
    else not exists (
      select 1
      from jsonb_each(p_fields) as item(field_key, field_value)
      where case
        when jsonb_typeof(item.field_value) <> 'object' then true
        else item.field_key !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
          or (select count(*) from jsonb_object_keys(item.field_value)) <> 3
          or not (item.field_value ?& array['label', 'type', 'value'])
          or jsonb_typeof(item.field_value->'label') <> 'string'
          or length(btrim(item.field_value->>'label')) not between 1 and 80
          or item.field_value->>'type' not in ('text', 'number', 'boolean', 'date', 'time')
          or case item.field_value->>'type'
            when 'text' then jsonb_typeof(item.field_value->'value') <> 'string'
              or length(item.field_value->>'value') > 2000
            when 'number' then jsonb_typeof(item.field_value->'value') <> 'number'
            when 'boolean' then jsonb_typeof(item.field_value->'value') <> 'boolean'
            when 'date' then jsonb_typeof(item.field_value->'value') <> 'string'
              or item.field_value->>'value' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            when 'time' then jsonb_typeof(item.field_value->'value') <> 'string'
              or item.field_value->>'value' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            else true
          end
      end
    )
  end;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    date date NOT NULL,
    start_time time(0) without time zone NOT NULL,
    end_time time(0) without time zone NOT NULL,
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    end_date date NOT NULL,
    crosses_midnight boolean NOT NULL,
    duration_minutes smallint NOT NULL,
    brand_id text NOT NULL,
    platform_id text NOT NULL,
    campaign_id text,
    title text,
    studio text,
    host_id text,
    support_id text,
    technical_id text,
    required_host_count smallint DEFAULT 1 NOT NULL,
    required_support_count smallint DEFAULT 1 NOT NULL,
    required_technical_count smallint DEFAULT 1 NOT NULL,
    registration_locked boolean DEFAULT false NOT NULL,
    registration_cutoff_at timestamp with time zone NOT NULL,
    allow_multi_role boolean DEFAULT false NOT NULL,
    import_batch_id text,
    status text DEFAULT 'scheduled'::text NOT NULL,
    live_link text,
    product_notes text,
    updated_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    host_names text[] DEFAULT '{}'::text[] NOT NULL,
    assistant_names text[] DEFAULT '{}'::text[] NOT NULL,
    technical_names text[] DEFAULT '{}'::text[] NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    status_mode text DEFAULT 'auto'::text NOT NULL,
    execution_source text,
    agency_code text,
    supplemental_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT shifts_agency_code_check CHECK (((agency_code IS NULL) OR (agency_code = ANY (ARRAY['ada'::text, 'snap'::text, 'live_ai'::text])))),
    CONSTRAINT shifts_agency_execution_source_check CHECK (((agency_code IS NULL) OR ((agency_code = 'ada'::text) AND (execution_source = 'internal'::text)) OR ((agency_code = ANY (ARRAY['snap'::text, 'live_ai'::text])) AND (execution_source = 'agency'::text)))),
    CONSTRAINT shifts_crosses_midnight_check CHECK ((crosses_midnight = (end_date > date))),
    CONSTRAINT shifts_duration_check CHECK (((duration_minutes >= 1) AND (duration_minutes <= 1439))),
    CONSTRAINT shifts_end_date_check CHECK (((end_date >= date) AND (end_date <= (date + 1)))),
    CONSTRAINT shifts_execution_source_check CHECK ((execution_source = ANY (ARRAY['internal'::text, 'agency'::text]))),
    CONSTRAINT shifts_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT shifts_registration_cutoff_check CHECK ((registration_cutoff_at <= start_at)),
    CONSTRAINT shifts_required_host_count_check CHECK (((required_host_count >= 0) AND (required_host_count <= 100))),
    CONSTRAINT shifts_required_support_count_check CHECK (((required_support_count >= 0) AND (required_support_count <= 100))),
    CONSTRAINT shifts_required_technical_count_check CHECK (((required_technical_count >= 0) AND (required_technical_count <= 100))),
    CONSTRAINT shifts_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'preparing'::text, 'live'::text, 'paused'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT shifts_status_mode_check CHECK ((status_mode = ANY (ARRAY['auto'::text, 'manual'::text]))),
    CONSTRAINT shifts_supplemental_fields_object_check CHECK (private.is_valid_shift_supplemental_fields(supplemental_fields)),
    CONSTRAINT shifts_time_order_check CHECK ((end_at > start_at)),
    CONSTRAINT shifts_version_positive_check CHECK ((version > 0))
);


--
-- Name: TABLE shifts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shifts IS 'P1C canonical shift schedule. Direct role IDs are compatibility projections only.';


--
-- Name: COLUMN shifts.timezone; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.timezone IS 'IANA business timezone used to derive canonical start_at/end_at timestamps.';


--
-- Name: COLUMN shifts.host_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.host_id IS 'Compatibility projection of the first active staffed Host registration.';


--
-- Name: COLUMN shifts.support_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.support_id IS 'Compatibility projection of the first active staffed Support registration.';


--
-- Name: COLUMN shifts.technical_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.technical_id IS 'Compatibility projection of the first active staffed Technical registration.';


--
-- Name: COLUMN shifts.host_names; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.host_names IS 'Display-only Host names imported from a schedule; not personnel assignments.';


--
-- Name: COLUMN shifts.assistant_names; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.assistant_names IS 'Display-only Assistant/Trợ live names imported from a schedule; not personnel assignments.';


--
-- Name: COLUMN shifts.technical_names; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.technical_names IS 'Display-only Technical names imported from a schedule; not personnel assignments.';


--
-- Name: COLUMN shifts.execution_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.execution_source IS 'Nullable until explicit operator classification. NEVER infer existing shifts as internal/agency.';


--
-- Name: COLUMN shifts.agency_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.agency_code IS 'Designates partner agency assigned to shift: ada, snap, live_ai, or null for internal/unassigned.';


--
-- Name: COLUMN shifts.supplemental_fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shifts.supplemental_fields IS 'Typed, RLS-protected operational fields retained from schedule imports; values use {label,type,value}.';


--
-- Name: assert_no_shift_registration_conflict(text, public.shifts, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_no_shift_registration_conflict(p_user_id text, p_shift public.shifts, p_role text, p_exclude_registration_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if exists (
    select 1 from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.user_id = p_user_id
      and registration.operational_role = p_role
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
  ) then
    raise exception using errcode = '23505', message = 'ALREADY_REGISTERED';
  end if;

  if not coalesce(p_shift.allow_multi_role, false)
    and not coalesce((select allow_multi_role_per_shift from public.system_settings limit 1), false)
    and exists (
      select 1 from public.shift_registrations as registration
      where registration.shift_id = p_shift.id
        and registration.user_id = p_user_id
        and registration.status in ('pending', 'approved', 'manually_assigned')
        and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
    )
  then
    raise exception using errcode = 'P0001', message = 'MULTI_ROLE_NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.shift_registrations as registration
    join public.shifts as other_shift on other_shift.id = registration.shift_id
    where registration.user_id = p_user_id
      and registration.shift_id <> p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
      and other_shift.deleted_at is null
      and other_shift.archived_at is null
      and other_shift.status <> 'cancelled'
      and other_shift.start_at < p_shift.end_at
      and other_shift.end_at > p_shift.start_at
  ) then
    raise exception using errcode = 'P0001', message = 'SHIFT_CONFLICT';
  end if;
end;
$$;


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reports (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    shift_id text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    revenue numeric,
    orders integer,
    peak_viewer integer,
    average_viewer integer,
    likes integer,
    comments integer,
    shares integer,
    top_products text[],
    insights_good text,
    insights_improvement text,
    replay_url text,
    dashboard_url text,
    gmv numeric,
    viewers integer,
    product_clicks integer,
    ctr numeric,
    cvr numeric,
    average_order_value numeric,
    live_duration_minutes integer,
    dashboard_platform text DEFAULT 'other'::text NOT NULL,
    normalized_metrics jsonb,
    platform_metrics jsonb,
    raw_ocr_output text,
    ocr_review jsonb,
    final_recap jsonb,
    metrics_confirmed boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_by text,
    submitted_by text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_notes text,
    version_number integer DEFAULT 0 NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    CONSTRAINT reports_dashboard_platform_check CHECK ((dashboard_platform = ANY (ARRAY['tiktok_shop'::text, 'shopee_live'::text, 'other'::text]))),
    CONSTRAINT reports_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT reports_revenue_not_negative CHECK ((revenue >= (0)::numeric)),
    CONSTRAINT reports_shift_id_not_blank CHECK ((btrim(shift_id) <> ''::text)),
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'confirmed'::text, 'reopened'::text, 'archived'::text])))
);


--
-- Name: TABLE reports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reports IS 'P3 persistent final reports for Shopee and TikTok Shop live streams.';


--
-- Name: assert_report_editable(public.reports); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_report_editable(p_report public.reports) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_report is null or p_report.deleted_at is not null or p_report.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  if p_report.metrics_confirmed then
    raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
  end if;
end;
$$;


--
-- Name: assert_shift_capacity(public.shifts, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_shift_capacity(p_shift public.shifts, p_role text, p_exclude_registration_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  staffed_count integer;
begin
  select count(*)
  into staffed_count
  from public.shift_registrations as registration
  where registration.shift_id = p_shift.id
    and registration.operational_role = p_role
    and registration.status in ('approved', 'manually_assigned')
    and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id);

  if staffed_count >= private.shift_required_capacity(p_shift, p_role) then
    raise exception using errcode = 'P0001', message = 'SHIFT_FULL';
  end if;
end;
$$;


--
-- Name: assert_shift_role_eligibility(text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_shift_role_eligibility(p_user_id text, p_role text) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_role is null or p_role not in ('host', 'support', 'technical') then
    raise exception using errcode = '22023', message = 'OPERATIONAL_ROLE_INVALID';
  end if;
  if not exists (
    select 1
    from public.business_users as business_user
    where business_user.id = p_user_id
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
      and business_user.operational_roles @> array[p_role]::text[]
  ) then
    raise exception using errcode = '22023', message = 'ROLE_NOT_QUALIFIED';
  end if;
end;
$$;


--
-- Name: assert_shift_staffing_consistent(public.shifts); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.assert_shift_staffing_consistent(p_shift public.shifts) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  registrant_id text;
  multi_role_allowed boolean;
begin
  select allow_multi_role_per_shift into multi_role_allowed
  from public.system_settings
  limit 1;
  if multi_role_allowed is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  if (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) > p_shift.required_host_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) > p_shift.required_support_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) > p_shift.required_technical_count
  then
    raise exception using errcode = 'P0001', message = 'SHIFT_CAPACITY_BELOW_STAFFING';
  end if;

  if not p_shift.allow_multi_role and not multi_role_allowed and exists (
    select 1
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
    group by registration.user_id
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'MULTI_ROLE_NOT_ALLOWED';
  end if;

  for registrant_id in
    select distinct registration.user_id
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
    order by registration.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(registrant_id, 91731));
    if exists (
      select 1
      from public.shift_registrations as other_registration
      join public.shifts as other_shift on other_shift.id = other_registration.shift_id
      where other_registration.user_id = registrant_id
        and other_registration.shift_id <> p_shift.id
        and other_registration.status in ('pending', 'approved', 'manually_assigned')
        and other_shift.deleted_at is null
        and other_shift.archived_at is null
        and other_shift.status <> 'cancelled'
        and other_shift.start_at < p_shift.end_at
        and other_shift.end_at > p_shift.start_at
    ) then
      raise exception using errcode = 'P0001', message = 'SHIFT_CONFLICT';
    end if;
  end loop;
end;
$$;


--
-- Name: audit_action_for_change(text, text, jsonb, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.audit_action_for_change(p_table_name text, p_operation text, p_before jsonb, p_after jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  old_deleted timestamptz;
  new_deleted timestamptz;
  old_archived timestamptz;
  new_archived timestamptz;
  old_status text;
  new_status text;
  old_locked boolean;
  new_locked boolean;
begin
  if p_operation = 'INSERT' then return 'create'; end if;
  if p_operation = 'DELETE' then return 'delete'; end if;
  old_deleted := nullif(p_before->>'deleted_at', '')::timestamptz;
  new_deleted := nullif(p_after->>'deleted_at', '')::timestamptz;
  old_archived := nullif(p_before->>'archived_at', '')::timestamptz;
  new_archived := nullif(p_after->>'archived_at', '')::timestamptz;
  if old_deleted is null and new_deleted is not null then return 'soft_delete'; end if;
  if old_deleted is not null and new_deleted is null then return 'restore'; end if;
  if old_archived is null and new_archived is not null then return 'archive'; end if;
  if old_archived is not null and new_archived is null then return 'restore'; end if;
  old_locked := nullif(p_before->>'registration_locked', '')::boolean;
  new_locked := nullif(p_after->>'registration_locked', '')::boolean;
  if old_locked is false and new_locked is true then return 'lock'; end if;
  if old_locked is true and new_locked is false then return 'reopen'; end if;
  old_status := p_before->>'status';
  new_status := p_after->>'status';
  if old_status is distinct from new_status then
    if new_status = 'approved' then return 'approve'; end if;
    if new_status = 'rejected' then return 'reject'; end if;
    if new_status = 'cancelled' then return 'cancel_registration'; end if;
    if new_status = 'completed' then return 'confirm'; end if;
  end if;
  return 'update';
end;
$$;


--
-- Name: audit_sanitize_row(jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.audit_sanitize_row(p_value jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
declare
  result jsonb;
  item record;
  sanitized jsonb;
  normalized_key text;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      result := '{}'::jsonb;

      for item in
        select entry.key, entry.value
        from jsonb_each(p_value) as entry(key, value)
      loop
        normalized_key := regexp_replace(
          lower(coalesce(item.key, '')),
          '[^a-z0-9]',
          '',
          'g'
        );

        -- Keep the key visible for audit shape compatibility, but never retain
        -- a credential value. Separators/case are normalized before comparison.
        if normalized_key = any (array[
          'password', 'passwd', 'passphrase', 'passwordhash',
          'token', 'accesstoken', 'accesskey', 'refreshtoken', 'idtoken',
          'apikey', 'clientsecret', 'secret', 'secretkey',
          'authorization', 'authtoken', 'bearer',
          'privatekey', 'oauthtoken', 'oauthsecret',
          'providertoken', 'providersecret',
          'credentials', 'credential', 'cookie', 'sessiontoken',
          'refresh', 'otp', 'base64', 'binary'
        ]) then
          sanitized := to_jsonb('[REDACTED]'::text);
        elsif normalized_key ~ '^(file|image|thumbnail)url$'
          and jsonb_typeof(item.value) = 'string' then
          sanitized := to_jsonb('[redacted_reference]'::text);
        else
          sanitized := private.audit_sanitize_row(item.value);
        end if;

        result := result || jsonb_build_object(item.key, sanitized);
      end loop;

      return result;

    when 'array' then
      select coalesce(
        jsonb_agg(private.audit_sanitize_row(entry.value) order by entry.ordinality),
        '[]'::jsonb
      )
      into result
      from jsonb_array_elements(p_value) with ordinality as entry(value, ordinality);

      return result;

    when 'string' then
      if length(p_value #>> '{}') > 10000 then
        return to_jsonb('[redacted_large_value]'::text);
      end if;
      return p_value;

    else
      -- Numbers, booleans, and JSON null are safe scalar values and are
      -- retained exactly. SQL NULL was handled above.
      return p_value;
  end case;
end;
$_$;


--
-- Name: audit_storage_resource_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.audit_storage_resource_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare rid text; action_name text;
begin
  if tg_table_name = 'storage_resources' then rid := coalesce(new.id, old.id);
  else rid := coalesce(new.resource_id, old.resource_id); end if;
  action_name := case
    when tg_table_name = 'storage_resources' then 'resource_' || lower(tg_op)
    when tg_table_name = 'storage_resource_scopes' then 'scope_' || lower(tg_op)
    when tg_table_name = 'storage_resource_user_grants' then 'grant_' || lower(tg_op)
    when tg_table_name = 'storage_resource_edit_grants' then 'edit_grant_' || lower(tg_op)
    else 'grant_' || lower(tg_op)
  end;
  insert into public.storage_resource_audit_events(resource_id, action, actor_id, before_data, after_data)
  values (
    rid, action_name,
    private.current_business_user_id(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


--
-- Name: brand01_campaign_sku_brand_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_campaign_sku_brand_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare campaign_brand text; product text;
begin
  select c.brand_id into campaign_brand from public.campaigns c where c.id = new.campaign_id and c.deleted_at is null and c.archived_at is null;
  select s.product_id into product from public.brand01_product_skus s where s.id = new.sku_id and s.lifecycle_status = 'active';
  if campaign_brand is null or product is null or not exists (
    select 1 from public.brand01_product_brands pb where pb.product_id = product and pb.brand_id = campaign_brand
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_CAMPAIGN_SKU_BRAND_MISMATCH';
  end if;
  return new;
end $$;


--
-- Name: brand01_can_read_brand(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_can_read_brand(p_brand_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(private.current_business_user_is_active() and (
    private.is_admin() or exists (
      select 1 from public.brand01_user_brand_access access
      where access.user_id = private.current_business_user_id()
        and access.brand_id = p_brand_id and access.revoked_at is null
        and (access.expires_at is null or access.expires_at > statement_timestamp())
    )
  ), false)
$$;


--
-- Name: brand01_catalog_audit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_catalog_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare before_row jsonb; after_row jsonb; row_data jsonb; actor text; record_key text;
begin
  before_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data := coalesce(after_row, before_row);
  actor := private.current_business_user_id();
  record_key := coalesce(row_data->>'id', row_data->>'grant_id',
    case when row_data ? 'sku_id' and row_data ? 'platform_id' then (row_data->>'sku_id') || ':' || (row_data->>'platform_id') end,
    case when row_data ? 'user_id' and row_data ? 'brand_id' then (row_data->>'user_id') || ':' || (row_data->>'brand_id') end,
    case when row_data ? 'product_id' and row_data ? 'brand_id' then (row_data->>'product_id') || ':' || (row_data->>'brand_id') end,
    case when row_data ? 'campaign_id' and row_data ? 'sku_id' then (row_data->>'campaign_id') || ':' || (row_data->>'sku_id') end);
  insert into public.brand01_catalog_audit_events(table_name,record_id,action,actor_id,before_data,after_data)
  values (tg_table_name, coalesce(record_key, 'unknown'), lower(tg_op), actor, before_row, after_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;


--
-- Name: brand01_has_current_knowledge_approval(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_has_current_knowledge_approval(p_knowledge_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.current_business_user_is_active() and exists (
    select 1 from public.brand01_product_knowledge_versions k
    join public.brand01_knowledge_reviews r on r.knowledge_version_id=k.id
    where k.id=p_knowledge_id and k.status='pending_review'
      and r.decision='approved'
      and not exists(select 1 from public.brand01_knowledge_reviews later where later.knowledge_version_id=k.id and later.created_at>r.created_at)
      and k.effective_from<=current_date and (k.effective_to is null or k.effective_to>=current_date)
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=k.product_id and pb.is_active and private.brand01_can_read_brand(pb.brand_id))
  )
$$;


--
-- Name: brand01_knowledge_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_knowledge_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '55000', message = 'BRAND01_KNOWLEDGE_VERSIONS_IMMUTABLE';
  end if;
  if new.sku_id is not null and not exists (
    select 1 from public.brand01_product_skus s where s.id = new.sku_id and s.product_id = new.product_id
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_KNOWLEDGE_SKU_PRODUCT_MISMATCH';
  end if;
  if new.status = 'approved' then raise exception using errcode = '23514', message = 'BRAND01_APPROVAL_REQUIRES_SEPARATE_REVIEW'; end if;
  if new.source_resource_id is not null and not exists (
    select 1 from public.storage_resources r where r.id = new.source_resource_id and r.is_active and r.resource_type <> 'attendance_evidence'
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;


--
-- Name: brand01_resource_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_resource_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare target_brand text;
begin
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if not exists(select 1 from public.storage_resources r where r.id=new.resource_id and r.is_active and r.resource_type<>'attendance_evidence') then
    raise exception using errcode='23514', message='BRAND01_RESOURCE_UNAVAILABLE_OR_PRIVATE';
  end if;
  if new.product_id is not null then
    if not exists(select 1 from public.brand01_product_brands pb where pb.product_id=new.product_id and pb.is_active) then raise exception using errcode='23514', message='BRAND01_RESOURCE_PRODUCT_BRAND_REQUIRED'; end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_product_brands pb on pb.brand_id=rs.brand_id where rs.resource_id=new.resource_id and pb.product_id=new.product_id and pb.is_active) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
  elsif new.sku_id is not null then
    if not exists(select 1 from public.brand01_product_skus s join public.brand01_products p on p.id=s.product_id
      where s.id=new.sku_id and s.lifecycle_status <> 'archived' and p.archived_at is null
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=p.id and pb.is_active)) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SKU_NOT_FOUND';
    end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_product_skus s on s.id=new.sku_id
        join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=rs.brand_id and pb.is_active
        where rs.resource_id=new.resource_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.campaign_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_campaign_product_skus cps
        on cps.campaign_id=rs.campaign_id and cps.sku_id=new.sku_id
        join public.campaigns c on c.id=cps.campaign_id and c.deleted_at is null and c.archived_at is null
        join public.brand01_product_skus s on s.id=cps.sku_id
        join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=c.brand_id and pb.is_active
        where rs.resource_id=new.resource_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_CAMPAIGN_SCOPE_MISMATCH';
    end if;
  else
    select c.brand_id into target_brand from public.campaigns c where c.id=new.campaign_id and c.deleted_at is null and c.archived_at is null;
    if target_brand is null then raise exception using errcode='23514', message='BRAND01_RESOURCE_CAMPAIGN_NOT_FOUND'; end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null and rs.brand_id<>target_brand)
      or exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.campaign_id is not null and rs.campaign_id<>new.campaign_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
  end if;
  return new;
end $$;


--
-- Name: brand01_review_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_review_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare knowledge_owner text; knowledge_status text;
begin
  if tg_op<>'INSERT' or not private.current_business_user_is_active() or not private.is_admin()
    or new.reviewer_id is distinct from private.current_business_user_id() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REVIEW_REQUIRED';
  end if;
  select k.created_by,k.status into knowledge_owner,knowledge_status
    from public.brand01_product_knowledge_versions k where k.id=new.knowledge_version_id for update;
  if not found or knowledge_owner=new.reviewer_id or knowledge_status<>'pending_review'
    or exists(select 1 from public.brand01_knowledge_reviews r where r.knowledge_version_id=new.knowledge_version_id) then
    raise exception using errcode='42501', message='BRAND01_INDEPENDENT_REVIEW_REQUIRED';
  end if;
  if new.decision='approved' and not exists (
    select 1 from public.brand01_product_knowledge_versions k
    where k.id=new.knowledge_version_id and (k.source_resource_id is not null or nullif(btrim(k.source_url),'') is not null or nullif(btrim(k.source_reference),'') is not null)
      and k.effective_from is not null
  ) then raise exception using errcode='23514', message='BRAND01_APPROVAL_SOURCE_AND_EFFECTIVE_DATE_REQUIRED'; end if;
  return new;
end $$;


--
-- Name: brand01_scheme_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_scheme_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if tg_op='UPDATE' and (new.created_by is distinct from old.created_by or new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id or new.id is distinct from old.id) then
    raise exception using errcode='55000', message='BRAND01_SCHEME_IDENTITY_IMMUTABLE';
  end if;
  if new.sku_id is not null and not exists(select 1 from public.brand01_campaign_product_skus cps where cps.campaign_id=new.campaign_id and cps.sku_id=new.sku_id) then
    raise exception using errcode='23514', message='BRAND01_SCHEME_SKU_NOT_IN_CAMPAIGN';
  end if;
  if new.status in ('approved','rejected') and (new.reviewed_by is distinct from private.current_business_user_id()
    or new.reviewed_by=new.created_by or new.reviewed_at is null) then
    raise exception using errcode='42501', message='BRAND01_SCHEME_APPROVAL_INVALID';
  end if;
  if new.status='approved' and (new.source_resource_id is null and nullif(btrim(new.source_url),'') is null) then
    raise exception using errcode='23514', message='BRAND01_SOURCE_REQUIRED';
  end if;
  if new.source_resource_id is not null and not exists(select 1 from public.storage_resources r where r.id=new.source_resource_id and r.is_active and r.resource_type<>'attendance_evidence') then
    raise exception using errcode='23514', message='BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;


--
-- Name: brand01_user_brand_access_guard(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.brand01_user_brand_access_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if tg_op='INSERT' then
    if not exists(select 1 from public.business_users u where u.id=new.user_id and u.status='active' and u.account_status='active' and u.archived_at is null and u.deleted_at is null)
      or not exists(select 1 from public.brands b where b.id=new.brand_id and b.status='active' and b.archived_at is null and b.deleted_at is null)
      or (new.expires_at is not null and new.expires_at<=statement_timestamp()) then
      raise exception using errcode='23514', message='BRAND01_SCOPE_TARGET_INVALID';
    end if;
    if new.granted_by is distinct from private.current_business_user_id() or new.revoked_at is not null or new.revoked_by is not null then
      raise exception using errcode='42501', message='BRAND01_SCOPE_GRANT_ACTOR_INVALID';
    end if;
  elsif tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.brand_id is distinct from old.brand_id
      or new.access_level is distinct from old.access_level or new.granted_by is distinct from old.granted_by
      or new.granted_at is distinct from old.granted_at then
      raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_IMMUTABLE';
    end if;
    if old.revoked_at is null and (new.revoked_at is null or new.revoked_by is distinct from private.current_business_user_id()) then
      raise exception using errcode='42501', message='BRAND01_SCOPE_REVOKE_ACTOR_INVALID';
    end if;
    if old.revoked_at is not null then
      raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_REISSUE_REQUIRED';
    end if;
  else
    raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_DELETE_FORBIDDEN';
  end if;
  return new;
end $$;


--
-- Name: bump_concurrency_version(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.bump_concurrency_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.version := old.version + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;


--
-- Name: can_read_report(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_read_report(p_report_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  allowed boolean := false;
BEGIN
  IF actor_id IS NULL OR actor_role NOT IN ('member', 'leader', 'admin')
    OR NOT private.current_business_user_is_active() THEN
    RETURN false;
  END IF;

  SELECT CASE
    WHEN actor_role = 'admin' THEN true
    WHEN report.deleted_at IS NOT NULL OR report.archived_at IS NOT NULL THEN false
    WHEN actor_role = 'leader' THEN EXISTS (
      SELECT 1 FROM public.shifts AS shift
      WHERE shift.id = report.shift_id
        AND (
          private.rc19_has_any_leader_brand_scope(shift.brand_id, ARRAY['reports.read', 'reports.review']::text[])
          OR (report.submitted_by = actor_id
            AND private.rc19_has_leader_brand_scope(shift.brand_id, 'reports.submit'))
        )
    )
    ELSE coalesce(report.submitted_by = actor_id, false)
      OR EXISTS (
        SELECT 1 FROM public.shifts AS shift
        WHERE shift.id = report.shift_id
          AND (
            actor_id IN (shift.host_id, shift.support_id, shift.technical_id)
            OR EXISTS (
              SELECT 1 FROM public.shift_registrations AS assignment
              WHERE assignment.shift_id = shift.id AND assignment.user_id = actor_id
                AND assignment.status IN ('approved', 'manually_assigned')
            )
          )
      )
  END INTO allowed
  FROM public.reports AS report
  WHERE report.id = p_report_id;
  RETURN coalesce(allowed, false);
END;
$$;


--
-- Name: can_read_shift(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_read_shift(p_shift_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
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
        (shift.status = 'scheduled' AND shift.registration_locked = false AND shift.end_at > statement_timestamp())
        OR private.current_business_user_id() IN (shift.host_id, shift.support_id, shift.technical_id)
        OR EXISTS (
          SELECT 1 FROM public.shift_registrations AS registration
          WHERE registration.shift_id = shift.id
            AND registration.user_id = private.current_business_user_id()
            AND registration.status IN ('pending', 'approved', 'manually_assigned')
        )
      )
    END
    FROM public.shifts AS shift
    WHERE shift.id = p_shift_id AND private.current_business_user_is_active()
  ), false);
$$;


--
-- Name: can_read_shift_operational_notes(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_read_shift_operational_notes(p_shift_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
begin
  if v_actor_id is null or not private.current_business_user_is_active() then
    return false;
  end if;

  if v_permission = 'admin' then
    return true;
  end if;

  select id, brand_id, host_id, support_id, technical_id, deleted_at, archived_at
  into v_shift
  from public.shifts
  where id = p_shift_id;

  if not found or v_shift.deleted_at is not null or v_shift.archived_at is not null then
    return false;
  end if;

  -- Leader: strictly scoped to Brand via rc19_leader_brand_scopes
  if v_permission = 'leader' then
    return coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, array['shifts.read', 'shifts.manage']::text[]),
      false
    );
  end if;

  -- Member: only permitted if actively assigned to the shift
  if v_permission = 'member' then
    return coalesce(
      (
        v_actor_id = v_shift.host_id
        or v_actor_id = v_shift.support_id
        or v_actor_id = v_shift.technical_id
        or exists (
          select 1 from public.shift_registrations r
          where r.shift_id = p_shift_id
            and r.user_id = v_actor_id
            and r.status in ('approved', 'manually_assigned')
        )
      ),
      false
    );
  end if;

  return false;
end;
$$;


--
-- Name: can_write_shift_operational_notes(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.can_write_shift_operational_notes(p_shift_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_shift record;
begin
  if v_actor_id is null or not private.current_business_user_is_active() then
    return false;
  end if;

  if v_permission = 'admin' then
    return true;
  end if;

  select id, brand_id, host_id, support_id, technical_id, deleted_at, archived_at
  into v_shift
  from public.shifts
  where id = p_shift_id;

  if not found or v_shift.deleted_at is not null or v_shift.archived_at is not null then
    return false;
  end if;

  -- Leader: strictly scoped to Brand via rc19_leader_brand_scopes
  if v_permission = 'leader' then
    return coalesce(
      private.rc19_has_any_leader_brand_scope(v_shift.brand_id, array['shifts.manage', 'shifts.read']::text[]),
      false
    );
  end if;

  -- Member: only permitted if actively assigned to the shift
  if v_permission = 'member' then
    return coalesce(
      (
        v_actor_id = v_shift.host_id
        or v_actor_id = v_shift.support_id
        or v_actor_id = v_shift.technical_id
        or exists (
          select 1 from public.shift_registrations r
          where r.shift_id = p_shift_id
            and r.user_id = v_actor_id
            and r.status in ('approved', 'manually_assigned')
        )
      ),
      false
    );
  end if;

  return false;
end;
$$;


--
-- Name: capture_audit_row_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.capture_audit_row_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  before_row jsonb;
  after_row jsonb;
  actor_business_id text;
  actor_auth_id uuid;
  actor_display_name text;
  actor_permission text;
  entity_id_value text;
  entity_name_value text;
  changed text[];
  action_value text;
  source_value text := coalesce(nullif(current_setting('app.audit_source', true), ''), 'manual');
  metadata_value jsonb := '{}'::jsonb;
begin
  if source_value not in ('manual', 'excel_import', 'google_sheets', 'system', 'ocr', 'upload') then
    source_value := 'manual';
  end if;
  before_row := private.audit_sanitize_row(case when tg_op <> 'INSERT' then to_jsonb(old) else null end);
  after_row := private.audit_sanitize_row(case when tg_op <> 'DELETE' then to_jsonb(new) else null end);
  entity_id_value := coalesce(after_row->>'id', before_row->>'id');
  if entity_id_value is null or btrim(entity_id_value) = '' then return coalesce(new, old); end if;
  entity_name_value := coalesce(after_row->>'title', after_row->>'name', after_row->>'full_name', before_row->>'title', before_row->>'name', before_row->>'full_name', entity_id_value);
  actor_auth_id := auth.uid();
  actor_business_id := private.current_business_user_id();
  select business_user.full_name, business_user.system_permission
    into actor_display_name, actor_permission
  from public.business_users as business_user
  where business_user.id = actor_business_id;
  action_value := private.audit_action_for_change(tg_table_name, tg_op, before_row, after_row);
  if tg_op = 'INSERT' and coalesce(after_row->>'source', '') in ('excel_import', 'google_sheets') then
    source_value := after_row->>'source';
  elsif coalesce(after_row->>'source', '') in ('ocr', 'upload', 'system') then
    source_value := after_row->>'source';
  end if;
  metadata_value := jsonb_build_object('table', tg_table_name, 'operation', tg_op);
  if after_row ? 'status' then metadata_value := metadata_value || jsonb_build_object('status', after_row->>'status'); end if;
  if after_row ? 'status_mode' then metadata_value := metadata_value || jsonb_build_object('status_mode', after_row->>'status_mode'); end if;
  if after_row ? 'version' then metadata_value := metadata_value || jsonb_build_object('version', after_row->>'version'); end if;
  select coalesce(array_agg(key order by key), '{}'::text[]) into changed
  from (
    select key from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as old_keys(key)
    union select key from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as new_keys(key)
  ) as keys
  where (before_row->key) is distinct from (after_row->key);
  insert into public.audit_logs (
    actor_auth_user_id, actor_business_user_id, actor_name, actor_role,
    module, action, entity_type, entity_id, entity_name,
    before_data, after_data, changed_fields, reason, source, correlation_id,
    metadata, entity_exists
  ) values (
    actor_auth_id, actor_business_id, actor_display_name, actor_permission,
    case tg_table_name
      when 'shifts' then 'calendar' when 'shift_registrations' then 'calendar'
      when 'reports' then 'reports' when 'report_revisions' then 'reports'
      when 'report_images' then 'reports' when 'live_report_images' then 'reports'
      when 'swap_requests' then 'swaps' when 'schedule_import_batches' then 'imports'
      when 'schedule_import_batch_rows' then 'imports' when 'business_users' then 'staff'
      when 'brands' then 'brands' when 'platforms' then 'platforms'
      when 'campaigns' then 'campaigns' else 'settings'
    end,
    action_value, replace(tg_table_name, '_', ' '), entity_id_value, entity_name_value,
    before_row, after_row, changed, coalesce(after_row->>'deletion_reason', after_row->>'review_notes'),
    source_value, coalesce(nullif(current_setting('request.header.x-request-id', true), ''), gen_random_uuid()::text),
    metadata_value, tg_op <> 'DELETE'
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;


--
-- Name: capture_report_revision(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.capture_report_revision(p_report_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: capture_workforce_actual_audit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.capture_workforce_actual_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  before_row jsonb;
  after_row jsonb;
  actor_business_id text;
  actor_auth_id uuid;
  actor_display_name text;
  actor_permission text;
  entity_id_value text;
  entity_name_value text;
  changed text[];
  action_value text;
  reason_value text;
  metadata_value jsonb := '{}'::jsonb;
begin
  before_row := private.audit_sanitize_row(case when tg_op <> 'INSERT' then to_jsonb(old) else null end);
  after_row := private.audit_sanitize_row(case when tg_op <> 'DELETE' then to_jsonb(new) else null end);

  entity_id_value := coalesce(after_row->>'id', before_row->>'id');
  if entity_id_value is null or btrim(entity_id_value) = '' then
    return coalesce(new, old);
  end if;

  entity_name_value := coalesce(
    (after_row->>'staff_id') || ' (' || (after_row->>'operational_role') || ')',
    (before_row->>'staff_id') || ' (' || (before_row->>'operational_role') || ')',
    entity_id_value
  );

  -- Determine lifecycle action
  if tg_op = 'INSERT' then
    action_value := 'create';
    actor_business_id := coalesce(after_row->>'created_by', private.current_business_user_id());
    reason_value := after_row->>'evidence_note';
  elsif tg_op = 'DELETE' then
    action_value := 'delete';
    actor_business_id := private.current_business_user_id();
    reason_value := before_row->>'evidence_note';
  else
    if (before_row->>'review_status') is distinct from (after_row->>'review_status') then
      if after_row->>'review_status' = 'approved' then
        action_value := 'approve';
      elsif after_row->>'review_status' = 'rejected' then
        action_value := 'reject';
      else
        action_value := 'update';
      end if;
      actor_business_id := coalesce(after_row->>'reviewed_by', private.current_business_user_id());
      reason_value := coalesce(after_row->>'review_note', after_row->>'evidence_note');
    else
      action_value := 'update';
      actor_business_id := private.current_business_user_id();
      reason_value := after_row->>'evidence_note';
    end if;
  end if;

  actor_auth_id := auth.uid();
  if actor_business_id is not null then
    select business_user.full_name, business_user.system_permission
      into actor_display_name, actor_permission
    from public.business_users as business_user
    where business_user.id = actor_business_id;
  end if;

  metadata_value := jsonb_build_object(
    'table', tg_table_name,
    'operation', tg_op,
    'shift_id', coalesce(after_row->>'shift_id', before_row->>'shift_id'),
    'event_kind', coalesce(after_row->>'event_kind', before_row->>'event_kind'),
    'coverage_kind', coalesce(after_row->>'coverage_kind', before_row->>'coverage_kind'),
    'version', coalesce(after_row->>'version', before_row->>'version')
  );

  select coalesce(array_agg(key order by key), '{}'::text[])
    into changed
  from (
    select key from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as old_keys(key)
    union
    select key from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as new_keys(key)
  ) as keys
  where (before_row->key) is distinct from (after_row->key);

  insert into public.audit_logs (
    actor_auth_user_id,
    actor_business_user_id,
    actor_name,
    actor_role,
    module,
    action,
    entity_type,
    entity_id,
    entity_name,
    before_data,
    after_data,
    changed_fields,
    reason,
    source,
    correlation_id,
    metadata,
    entity_exists
  ) values (
    actor_auth_id,
    actor_business_id,
    actor_display_name,
    actor_permission,
    'calendar',
    action_value,
    'workforce_actual_segment',
    entity_id_value,
    entity_name_value,
    before_row,
    after_row,
    changed,
    reason_value,
    'manual',
    coalesce(nullif(current_setting('request.header.x-request-id', true), ''), gen_random_uuid()::text),
    metadata_value,
    tg_op <> 'DELETE'
  );

  return coalesce(new, old);
end;
$$;


--
-- Name: consume_account_request_rate_limit(text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.consume_account_request_rate_limit(p_request_key text, p_now timestamp with time zone DEFAULT statement_timestamp()) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_count integer;
begin
  insert into private.account_request_rate_limits (
    request_key, window_started_at, request_count, updated_at
  ) values (
    p_request_key, p_now, 1, p_now
  )
  on conflict (request_key) do update
  set
    window_started_at = case
      when private.account_request_rate_limits.window_started_at + interval '15 minutes' <= excluded.updated_at
        then excluded.updated_at
      else private.account_request_rate_limits.window_started_at
    end,
    request_count = case
      when private.account_request_rate_limits.window_started_at + interval '15 minutes' <= excluded.updated_at
        then 1
      else private.account_request_rate_limits.request_count + 1
    end,
    updated_at = excluded.updated_at
  returning request_count into v_count;

  return v_count <= 5;
end;
$$;


--
-- Name: FUNCTION consume_account_request_rate_limit(p_request_key text, p_now timestamp with time zone); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.consume_account_request_rate_limit(p_request_key text, p_now timestamp with time zone) IS 'Atomic five-per-fifteen-minute Account Request submission counter.';


--
-- Name: current_business_user_id(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_business_user_id() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select business_user.id
  from public.business_users as business_user
  where business_user.auth_user_id = (select auth.uid())
    and business_user.status = 'active'
    and business_user.account_status = 'active'
    and business_user.archived_at is null
    and business_user.deleted_at is null
  limit 1;
$$;


--
-- Name: current_business_user_is_active(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.business_users as business_user
    where business_user.auth_user_id = (select auth.uid())
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  );
$$;


--
-- Name: current_system_permission(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_system_permission() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select business_user.system_permission
  from public.business_users as business_user
  where business_user.auth_user_id = (select auth.uid())
    and business_user.status = 'active'
    and business_user.account_status = 'active'
    and business_user.archived_at is null
    and business_user.deleted_at is null
  limit 1;
$$;


--
-- Name: current_user_can_edit_storage_resource(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_user_can_edit_storage_resource(p_resource_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select private.current_business_user_is_active()
    and private.current_system_permission() in ('admin', 'leader', 'member')
    and exists (
      select 1 from public.storage_resource_edit_grants g
      join public.storage_resources r on r.id = g.resource_id
      where g.resource_id = p_resource_id
        and g.user_id = private.current_business_user_id()
        and g.decision = 'allow'
        and g.revoked_at is null
        and r.is_active
        and r.resource_type <> 'attendance_evidence'
        and r.visibility <> 'admin_only'
        and (
          r.visibility = 'public'
          or (r.visibility = 'owner_only' and r.owner_id = private.current_business_user_id())
          or (r.visibility = 'granted_users' and (
            r.owner_id = private.current_business_user_id()
            or private.current_user_has_storage_resource_grant(r.id)
          ))
        )
    )
    and not exists (
      select 1 from public.storage_resource_edit_grants g
      where g.resource_id = p_resource_id
        and g.user_id = private.current_business_user_id()
        and g.decision = 'deny'
        and g.revoked_at is null
    )
$$;


--
-- Name: current_user_has_storage_resource_grant(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.current_user_has_storage_resource_grant(p_resource_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1
    from public.storage_resource_user_grants g
    join public.storage_resources r on r.id = g.resource_id
    where g.resource_id = p_resource_id
      and g.user_id = private.current_business_user_id()
      and g.revoked_at is null
      and private.current_business_user_is_active()
      and r.is_active
      and r.visibility = 'granted_users'
      and r.resource_type <> 'attendance_evidence'
  )
$$;


--
-- Name: emit_account_request_notification(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emit_account_request_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  recipient_id text;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  for recipient_id in
    select business_user.id
    from public.business_users as business_user
    where business_user.system_permission = 'admin'
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  loop
    perform private.insert_notification(
      recipient_id,
      'account_request_submitted',
      'system',
      'info',
      'New account request',
      'A new account request is ready for review.',
      'account_requests',
      new.id::text,
      '/staff',
      'account_request_submitted:' || new.id::text || ':' || recipient_id
    );
  end loop;

  return new;
end;
$$;


--
-- Name: emit_import_notification(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emit_import_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  event_type text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if (tg_op = 'INSERT' and new.status in ('confirmed', 'failed'))
    or (tg_op = 'UPDATE' and old.status is distinct from new.status and new.status in ('confirmed', 'failed')) then
    event_type := case when new.status = 'confirmed' then 'import_completed' else 'import_failure' end;
    perform private.insert_notification(
      new.created_by, event_type, 'system', case when new.status = 'confirmed' then 'success' else 'error' end,
      case when new.status = 'confirmed' then 'Import completed' else 'Import failed' end,
      case when new.status = 'confirmed' then 'Your schedule import completed.' else 'Your schedule import failed.' end,
      'schedule_import', new.id, '/calendar',
      event_type || ':' || new.id || ':' || new.created_by
    );
  end if;
  return new;
end;
$$;


--
-- Name: emit_report_notification(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emit_report_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  actor_id text;
  recipient_id text;
  event_type text;
  title text;
  message text;
  transition_version integer;
  report_action_url text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  -- Report identifiers are not URL path parameters. Use an explicitly
  -- restricted shift identifier in the deep link, otherwise fall back safely.
  report_action_url := case
    when new.shift_id ~ '^[A-Za-z0-9_-]+$' then '/reports?shiftId=' || new.shift_id
    else '/reports'
  end;
  transition_version := case
    when tg_op = 'UPDATE' then coalesce(old.version_number, 0) + 1
    else coalesce(new.version_number, 0) + 1
  end;

  if (tg_op = 'INSERT' and new.status = 'in_review')
    or (tg_op = 'UPDATE' and old.status in ('draft', 'reopened') and new.status = 'in_review') then
    for recipient_id in select private.notification_reviewer_ids(new.shift_id)
    loop
      perform private.insert_notification(
        recipient_id, 'report_submitted', 'report', 'info',
        'Report submitted', 'A report is ready for review.',
        'report', new.id, report_action_url,
        'report_submitted:' || new.id || ':' || transition_version || ':' || recipient_id
      );
    end loop;
  elsif tg_op = 'UPDATE' and old.status = 'in_review' and new.status in ('confirmed', 'reopened') then
    event_type := 'report_reviewed';
    title := case when new.status = 'confirmed' then 'Report approved' else 'Report needs updates' end;
    message := case when new.status = 'confirmed' then 'Your report was approved.'
      else coalesce(new.review_notes, 'Your report needs updates.') end;
    perform private.insert_notification(
      new.submitted_by, event_type, 'report',
      case when new.status = 'confirmed' then 'success' else 'warning' end,
      title, message, 'report', new.id, report_action_url,
      event_type || ':' || new.id || ':' || transition_version || ':' ||
        coalesce(new.submitted_by, '') || ':' || new.status
    );
  end if;
  return new;
end;
$_$;


--
-- Name: emit_shift_registration_notification(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emit_shift_registration_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  reviewer_id text;
  transition text;
  notification_type text;
  title text;
  message text;
  event_prefix text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    for reviewer_id in select private.notification_reviewer_ids(new.shift_id)
    loop
      perform private.insert_notification(
        reviewer_id, 'registration_submitted', 'shift', 'info',
        'Registration pending', 'A staff member submitted a shift registration for review.',
        'shift', new.shift_id, '/calendar',
        'registration_submitted:' || new.id || ':' || reviewer_id
      );
    end loop;
  elsif tg_op = 'INSERT' and new.status = 'manually_assigned' then
    perform private.insert_notification(
      new.user_id, 'shift_assigned', 'shift', 'info',
      'Shift assigned', 'You were assigned to a shift.',
      'shift', new.shift_id, '/calendar',
      'shift_assigned:' || new.id || ':' || new.user_id
    );
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status in ('approved', 'rejected') then
    transition := case when new.status = 'approved' then 'staffing_approval' else 'staffing_rejection' end;
    notification_type := case when new.status = 'approved' then 'staffing_approval' else 'staffing_rejection' end;
    title := case when new.status = 'approved' then 'Registration approved' else 'Registration rejected' end;
    message := case when new.status = 'approved' then 'Your shift registration was approved.' else coalesce(new.review_notes, 'Your shift registration was rejected.') end;
    perform private.insert_notification(
      new.user_id, notification_type, 'shift', case when new.status = 'approved' then 'success' else 'warning' end,
      title, message, 'shift', new.shift_id, '/calendar',
      transition || ':' || new.id || ':' || new.user_id
    );
  end if;
  return new;
end;
$$;


--
-- Name: emit_swap_notification(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.emit_swap_notification() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  participant_id text;
  recipient_id text;
  event_type text;
  title text;
  message text;
  related_id text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  related_id := new.id;
  if tg_op = 'INSERT' and new.status = 'pending' then
    participant_id := coalesce(new.counterpart_id, new.replacement_staff_id);
    if participant_id is not null then
      perform private.insert_notification(
        participant_id, 'swap_request', 'swap', 'info',
        'Swap request', 'A swap request needs your response.',
        'swap_request', related_id, '/swaps',
        'swap_request:' || related_id || ':' || participant_id
      );
    end if;
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    event_type := case
      when new.status = 'accepted' then 'swap_accepted'
      when new.status = 'rejected' then 'swap_rejected'
      when new.status in ('approved', 'completed') then 'swap_approved'
      else null
    end;
    if event_type is null then return new; end if;
    title := case event_type
      when 'swap_accepted' then 'Swap accepted'
      when 'swap_rejected' then 'Swap rejected'
      else 'Swap approved'
    end;
    message := case event_type
      when 'swap_accepted' then 'The selected participant accepted the swap request.'
      when 'swap_rejected' then 'The swap request was rejected.'
      else 'Your swap request was completed.'
    end;
    for recipient_id in
      select distinct id from unnest(array_remove(array[new.requester_id, new.counterpart_id, new.replacement_staff_id], null)) as ids(id)
    loop
      perform private.insert_notification(
        recipient_id, event_type, 'swap', case when event_type = 'swap_rejected' then 'warning' else 'success' end,
        title, message, 'swap_request', related_id, '/swaps',
        event_type || ':' || related_id || ':' || recipient_id || ':' || new.status
      );
    end loop;
  end if;
  return new;
end;
$$;


--
-- Name: enforce_account_request_rate_limit(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_account_request_rate_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_forwarded text;
  v_request_key text;
begin
  v_forwarded := left(coalesce(
    nullif(btrim(current_setting('request.header.x-forwarded-for', true)), ''),
    nullif(btrim(current_setting('request.header.x-real-ip', true)), ''),
    'unknown'
  ), 256);
  v_request_key := pg_catalog.md5(btrim(split_part(v_forwarded, ',', 1)));

  if not private.consume_account_request_rate_limit(v_request_key) then
    raise exception 'ACCOUNT_REQUEST_RATE_LIMITED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


--
-- Name: FUNCTION enforce_account_request_rate_limit(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.enforce_account_request_rate_limit() IS 'Derives a non-reversible request key from trusted request metadata and enforces the public submission limit.';


--
-- Name: enforce_campaign_leader_update_scope(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_campaign_leader_update_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: enforce_rbac_staffing_permission(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_rbac_staffing_permission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_enabled boolean;
  v_requires_assignment boolean := false;
BEGIN
  SELECT enabled INTO v_enabled
  FROM private.rbac_runtime_gate
  WHERE id = true;

  IF NOT coalesce(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_requires_assignment := NEW.status = 'manually_assigned';
  ELSIF (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'manually_assigned')
    OR (OLD.status IN ('approved', 'manually_assigned') AND NEW.status = 'removed') THEN
    v_requires_assignment := true;
  END IF;

  IF v_requires_assignment AND NOT private.rbac_has_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_rbac_swap_permission(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_rbac_swap_permission() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_enabled boolean;
  v_permission text;
BEGIN
  SELECT enabled INTO v_enabled FROM private.rbac_runtime_gate WHERE id = true;
  IF NOT coalesce(v_enabled, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_permission := 'swaps.request';
  ELSIF OLD.status IS DISTINCT FROM NEW.status AND (
    NEW.status = 'approved'
    OR (NEW.status = 'rejected' AND NEW.approved_by IS NOT NULL
      AND NEW.approved_by IS DISTINCT FROM OLD.approved_by)
  ) THEN
    v_permission := 'swaps.approve';
  ELSE
    RETURN NEW;
  END IF;

  IF NOT private.rbac_has_permission(v_permission) THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_report_required_metrics(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_report_required_metrics() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  missing_metrics text[] := array[]::text[];
begin
  if (new.status = 'confirmed' and not new.metrics_confirmed)
    or (new.metrics_confirmed and new.status not in ('confirmed', 'archived')) then
    raise exception using errcode = '22023', message = 'REPORT_CONFIRMATION_STATE_INVALID';
  end if;

  if new.status = 'confirmed'
    and new.ocr_review is not null
    and jsonb_typeof(new.ocr_review) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'REPORT_OCR_REVIEW_UNRESOLVED';
  end if;

  if new.status = 'confirmed'
    and new.ocr_review ? 'metrics'
    and jsonb_typeof(new.ocr_review->'metrics') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'REPORT_OCR_REVIEW_UNRESOLVED';
  end if;

  if new.status = 'confirmed' and exists (
    select 1
    from jsonb_each(coalesce(new.ocr_review->'metrics', '{}'::jsonb)) as reviewed_metric(metric_key, metric_value)
    where jsonb_typeof(reviewed_metric.metric_value) is distinct from 'object'
      or reviewed_metric.metric_value->>'status' in ('review_required', 'low_confidence')
      or reviewed_metric.metric_value->'needs_review' = 'true'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'REPORT_OCR_REVIEW_UNRESOLVED';
  end if;

  if new.status = 'confirmed' then
    if new.dashboard_platform = 'shopee_live' then
      if new.revenue is null or (
        jsonb_typeof(new.normalized_metrics->'sales') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'sales') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Sales'); end if;
      if new.orders is null or (
        jsonb_typeof(new.normalized_metrics->'orders') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'orders') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Orders'); end if;
      if new.peak_viewer is null or (
        jsonb_typeof(new.normalized_metrics->'pcu') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'pcu') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'PCU'); end if;
      if new.average_viewer is null or (
        jsonb_typeof(new.normalized_metrics->'total_viewers') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'total_viewers') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Total Viewers'); end if;
      if new.comments is null or (
        jsonb_typeof(new.normalized_metrics->'comments') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'comments') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Comments'); end if;
      if new.shares is null or (
        jsonb_typeof(new.normalized_metrics->'shares') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'shares') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Shares'); end if;
      if new.product_clicks is null or (
        jsonb_typeof(new.normalized_metrics->'add_to_cart') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'add_to_cart') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Add to Cart'); end if;
      if new.ctr is null or (
        jsonb_typeof(new.normalized_metrics->'ctr') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'ctr') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'CTR'); end if;
      if new.cvr is null or (
        jsonb_typeof(new.normalized_metrics->'click_to_order_rate') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'click_to_order_rate') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Click-to-order Rate'); end if;
      if new.average_order_value is null or (
        jsonb_typeof(new.normalized_metrics->'average_basket_size') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'average_basket_size') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Average Basket Size'); end if;
    elsif new.dashboard_platform = 'tiktok_shop' then
      if new.gmv is null or new.revenue is null or (
        jsonb_typeof(new.normalized_metrics->'gmv') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'gmv') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'GMV'); end if;
      if new.orders is null or (
        jsonb_typeof(new.normalized_metrics->'sku_orders') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'sku_orders') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'SKU Orders'); end if;
      if new.peak_viewer is null or (
        jsonb_typeof(new.normalized_metrics->'current_viewers') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'current_viewers') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Current Viewers'); end if;
      if new.viewers is null or (
        jsonb_typeof(new.normalized_metrics->'total_views') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'total_views') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Total Views'); end if;
      if new.comments is null or (
        jsonb_typeof(new.normalized_metrics->'comments') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'comments') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Comments'); end if;
      if new.shares is null or (
        jsonb_typeof(new.normalized_metrics->'shares') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'shares') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Shares'); end if;
      if new.product_clicks is null or (
        jsonb_typeof(new.normalized_metrics->'product_clicks') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'product_clicks') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Product Clicks'); end if;
      if new.ctr is null or (
        jsonb_typeof(new.normalized_metrics->'live_ctr') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'live_ctr') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'LIVE CTR'); end if;
      if new.cvr is null or (
        jsonb_typeof(new.normalized_metrics->'ctor') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'ctor') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'CTOR'); end if;
      if new.average_order_value is null or (
        jsonb_typeof(new.normalized_metrics->'average_order_value') is distinct from 'number'
        and jsonb_typeof(new.platform_metrics->'average_order_value') is distinct from 'number'
      ) then missing_metrics := array_append(missing_metrics, 'Average Order Value'); end if;
    end if;

    if cardinality(missing_metrics) > 0 then
      raise exception using
        errcode = '22023',
        message = 'REPORT_REQUIRED_METRICS_MISSING',
        detail = array_to_string(missing_metrics, ', ');
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_swap_request_transition(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.enforce_swap_request_transition() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.status <> old.status and not (
    old.mode in ('replacement', 'exchange')
    and (
      (old.status = 'pending' and new.status in ('accepted', 'rejected', 'cancelled'))
      or (old.status = 'accepted' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'completed')
    )
  ) then
    raise exception using errcode = '22023', message = 'SWAP_ILLEGAL_TRANSITION';
  end if;
  return new;
end
$$;


--
-- Name: filtered_shift_ids(text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.filtered_shift_ids(p_scope text, p_filters jsonb) RETURNS TABLE(id text, date date, start_time time without time zone, status text)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
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
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds','eligibleOnly') then
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
    or (p_filters ? 'search' and jsonb_typeof(p_filters->'search') <> 'string')
    or (p_filters ? 'descending' and jsonb_typeof(p_filters->'descending') <> 'boolean')
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from') <> 'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to') <> 'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date > (p_filters->>'to')::date) then
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
      and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
      and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date)
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
$_$;


--
-- Name: guard_excel_source_receipt_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_excel_source_receipt_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  source_batch_id text;
  source_batch_status text;
BEGIN
  source_batch_id := CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.batch_id ELSE NEW.batch_id END;
  SELECT status INTO source_batch_status
  FROM public.schedule_import_batches
  WHERE id = source_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_BATCH_NOT_FOUND';
  END IF;
  IF source_batch_status = 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_RECEIPT_IMMUTABLE';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.reconciliation_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_RECEIPT_MUST_START_PENDING';
  END IF;
  IF TG_OP = 'UPDATE'
    AND (NEW.batch_id IS DISTINCT FROM OLD.batch_id
      OR NEW.checksum_sha256 IS DISTINCT FROM OLD.checksum_sha256) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_RECEIPT_IDENTITY_IMMUTABLE';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION guard_excel_source_receipt_mutation(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.guard_excel_source_receipt_mutation() IS 'Lock the parent batch while mutating source receipts and preserve receipt/batch references after confirmation.';


--
-- Name: guard_storage_resource_attendance(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_storage_resource_attendance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if new.resource_type = 'attendance_evidence' and exists (
    select 1 from public.storage_resource_scopes s
    where s.resource_id = new.id and (
      s.brand_id is not null or s.campaign_id is not null or s.client_group_key is not null
    )
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE';
  end if;
  return new;
end;
$$;


--
-- Name: guard_storage_resource_grant(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_storage_resource_grant() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.revoked_at is null and not exists (
    select 1 from public.storage_resources r
    where r.id = new.resource_id
      and r.visibility = 'granted_users'
      and r.resource_type <> 'attendance_evidence'
  ) then
    raise exception using errcode = '23514', message = 'STORAGE_RESOURCE_GRANT_TARGET_NOT_GRANTABLE';
  end if;
  return new;
end;
$$;


--
-- Name: guard_storage_resource_scope(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.guard_storage_resource_scope() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare kind text;
begin
  select resource_type into kind from public.storage_resources where id = new.resource_id;
  if kind = 'attendance_evidence' and (
    new.brand_id is not null or new.campaign_id is not null or new.client_group_key is not null
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE';
  end if;
  return new;
end;
$$;


--
-- Name: shift_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_registrations (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    shift_id text NOT NULL,
    user_id text NOT NULL,
    operational_role text NOT NULL,
    status text NOT NULL,
    source text NOT NULL,
    requested_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_notes text,
    cancelled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    imported_name text,
    match_method text,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT shift_registrations_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT shift_registrations_import_match_pair_check CHECK ((((imported_name IS NULL) AND (match_method IS NULL)) OR ((imported_name IS NOT NULL) AND (match_method IS NOT NULL)))),
    CONSTRAINT shift_registrations_imported_name_not_blank CHECK (((imported_name IS NULL) OR (btrim(imported_name) <> ''::text))),
    CONSTRAINT shift_registrations_match_method_check CHECK (((match_method IS NULL) OR (match_method = ANY (ARRAY['exact'::text, 'normalized'::text, 'manual'::text])))),
    CONSTRAINT shift_registrations_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT shift_registrations_source_check CHECK ((source = ANY (ARRAY['self_registration'::text, 'manual_assignment'::text, 'legacy_assignment'::text]))),
    CONSTRAINT shift_registrations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text, 'manually_assigned'::text, 'removed'::text]))),
    CONSTRAINT shift_registrations_version_positive_check CHECK ((version > 0))
);


--
-- Name: TABLE shift_registrations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.shift_registrations IS 'Canonical P1C staffing and registration history.';


--
-- Name: COLUMN shift_registrations.imported_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shift_registrations.imported_name IS 'Original display-only schedule label confirmed by a Leader/Admin for this canonical assignment.';


--
-- Name: COLUMN shift_registrations.match_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.shift_registrations.match_method IS 'How the confirmed imported label was related to the assigned user: exact, normalized, or manual.';


--
-- Name: insert_manual_shift_assignment(text, text, text, text, text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.insert_manual_shift_assignment(p_shift_id text, p_user_id text, p_role text, p_actor_id text, p_notes text, p_auto_lock boolean) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  target_shift public.shifts;
  created_registration public.shift_registrations;
begin
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.status <> 'scheduled' or target_shift.registration_locked then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  perform private.assert_shift_role_eligibility(p_user_id, p_role);
  perform private.assert_shift_capacity(target_shift, p_role, null);
  perform private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, null);

  insert into public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    reviewed_by, reviewed_at, review_notes
  ) values (
    p_shift_id, p_user_id, p_role, 'manually_assigned', 'manual_assignment',
    p_actor_id, statement_timestamp(), p_notes
  ) returning * into created_registration;

  perform private.reg02_reject_surplus(p_shift_id, p_role, p_actor_id);
  if p_auto_lock then
    perform private.refresh_shift_registration_lock(p_shift_id, false);
  end if;
  return created_registration;
end;
$$;


--
-- Name: insert_notification(text, text, text, text, text, text, text, text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.insert_notification(p_recipient_id text, p_type text, p_legacy_type text, p_severity text, p_title text, p_message text, p_related_entity_type text, p_related_entity_id text, p_action_url text, p_event_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_recipient_id is null or not exists (
    select 1
    from public.business_users as business_user
    where business_user.id = p_recipient_id
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  ) then
    return;
  end if;

  insert into public.notifications (
    user_id, recipient_id, type, notification_type, severity, title, message,
    related_entity_type, related_entity_id, action_url, event_key, read, read_at
  ) values (
    null,
    p_recipient_id,
    p_legacy_type,
    p_type,
    p_severity,
    p_title,
    p_message,
    p_related_entity_type,
    p_related_entity_id,
    case when p_action_url like '/%' and p_action_url not like '//%' then p_action_url else null end,
    p_event_key,
    false,
    null
  )
  on conflict (event_key) where event_key is not null do nothing;
end;
$$;


--
-- Name: insert_schedule_import_batch_rows(text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.insert_schedule_import_batch_rows(p_batch_id text, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_index integer;
  v_count integer;
  v_row jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_ROWS_INVALID';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = 'IMPORT_ROWS_LIMIT';
  end if;
  for v_index in 0..v_count - 1 loop
    v_row := p_rows->v_index;
    -- Two separate guards: PL/pgSQL boolean evaluation order is not guaranteed,
    -- so the ::int cast must never run on a non-numeric value.
    if v_row->>'row_number' is null or v_row->>'row_number' !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    if (v_row->>'row_number')::int < 1 then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    insert into public.schedule_import_batch_rows (batch_id, row_number, source_row)
    values (p_batch_id, (v_row->>'row_number')::int, v_row);
  end loop;
end;
$_$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce((select private.current_system_permission()) = 'admin', false);
$$;


--
-- Name: is_leader_or_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.is_leader_or_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select coalesce(
    (select private.current_system_permission()) in ('leader', 'admin'),
    false
  );
$$;


--
-- Name: lock_swap_registrations(text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_swap_registrations(p_ids text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform id from public.shift_registrations where id = any(coalesce(p_ids, '{}'::text[])) order by id for update;
end $$;


--
-- Name: lock_swap_rows(text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_swap_rows(p_ids text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  lock_id text;
begin
  for lock_id in
    select distinct u.value
    from unnest(coalesce(p_ids, '{}'::text[])) as u(value)
    order by u.value
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_id, 0));
  end loop;
end
$$;


--
-- Name: lock_swap_shifts(text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_swap_shifts(p_ids text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform id from public.shifts where id = any(coalesce(p_ids, '{}'::text[])) order by id for update;
end $$;


--
-- Name: lock_swap_users(text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.lock_swap_users(p_ids text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform id from public.business_users where id = any(coalesce(p_ids, '{}'::text[])) order by id for update;
end $$;


--
-- Name: normalize_shift_capacity(text, smallint); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.normalize_shift_capacity(p_value text, p_default smallint) RETURNS smallint
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
declare
  parsed numeric;
begin
  if p_value is null or btrim(p_value) = '' then
    return p_default;
  end if;
  begin
    parsed := p_value::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end;
  if parsed < 0 or parsed > 100 or trunc(parsed) <> parsed then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end if;
  return parsed::smallint;
end;
$$;


--
-- Name: normalize_staff_identity_name(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.normalize_staff_identity_name(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO ''
    AS $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        pg_catalog.btrim(p_value),
        'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
        'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYDaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;


--
-- Name: notification_reviewer_ids(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.notification_reviewer_ids(p_shift_id text) RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  with direct_reviewers as (
    select business_user.id
    from public.business_users as business_user
    join public.shifts as shift on shift.id = p_shift_id
    where business_user.id in (shift.host_id, shift.support_id, shift.technical_id)
      and business_user.system_permission in ('leader', 'admin')
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
  )
  select id from direct_reviewers;
$$;


--
-- Name: rbac01_active_version_id(text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rbac01_active_version_id(p_role text, p_at timestamp with time zone) RETURNS bigint
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT e.resulting_version_id
  FROM private.rbac01_role_default_events e
  WHERE e.role = p_role
    AND e.event_type IN ('activation','revocation','rollback')
    AND e.effective_at <= p_at
  ORDER BY e.effective_at DESC, e.id DESC
  LIMIT 1
$$;


--
-- Name: rbac02_append_account_decision(text, text, text, text, timestamp with time zone, integer); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rbac02_append_account_decision(p_target_business_user_id text, p_permission text, p_decision text, p_reason text, p_expires_at timestamp with time zone, p_expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor text; v_target public.business_users%ROWTYPE; v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_current_version integer; v_next_version integer; v_id bigint;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission()<>'admin'
    OR NOT private.rbac_has_permission('permissions.manage') THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_target_business_user_id IS NULL OR p_permission IS NULL
    OR p_decision NOT IN ('allow','deny','reset','revoke')
    OR p_expected_version IS NULL OR p_expected_version<0
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'RBAC02_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  IF p_target_business_user_id=v_actor THEN
    RAISE EXCEPTION 'RBAC02_SELF_CHANGE_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_target FROM public.business_users u
  WHERE u.id=p_target_business_user_id AND u.status='active' AND u.account_status='active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'RBAC02_TARGET_INACTIVE' USING ERRCODE='42501'; END IF;
  IF v_target.system_permission='admin' THEN
    RAISE EXCEPTION 'RBAC02_ADMIN_TARGET_PROTECTED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_catalog FROM private.rbac_permission_catalog c WHERE c.permission=p_permission;
  IF v_catalog.permission IS NULL OR v_catalog.hard_restricted
    OR NOT (v_target.system_permission=ANY(v_catalog.account_override_roles))
    OR (p_decision='allow' AND NOT (v_target.system_permission=ANY(v_catalog.account_allow_roles))) THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_NOT_CONFIGURABLE' USING ERRCODE='42501';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'RBAC02_EXPIRY_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'rbac02:'||p_target_business_user_id||':'||p_permission,0));
  SELECT coalesce(max(version),0) INTO v_current_version FROM private.rbac02_account_permission_versions
  WHERE target_business_user_id=p_target_business_user_id AND permission=p_permission;
  IF v_current_version<>p_expected_version THEN RAISE EXCEPTION 'RBAC02_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  v_next_version:=v_current_version+1;
  INSERT INTO private.rbac02_account_permission_versions(
    target_business_user_id,permission,version,expected_version,decision,
    actor_business_user_id,reason,expires_at
  ) VALUES (
    p_target_business_user_id,p_permission,v_next_version,v_current_version,p_decision,
    v_actor,btrim(p_reason),p_expires_at
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id',v_id,'target_business_user_id',p_target_business_user_id,
    'permission',p_permission,'version',v_next_version,'decision',p_decision,
    'expires_at',p_expires_at,'effective',p_decision IN ('allow','deny')
      AND (p_expires_at IS NULL OR p_expires_at>statement_timestamp()));
END;
$$;


--
-- Name: rbac_has_permission(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rbac_has_permission(p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce((private.rbac_permission_decision_for_user(
    private.current_business_user_id(),p_permission
  )->>'allowed')::boolean,false)
$$;


--
-- Name: rbac_permission_decision_for_user(text, text, timestamp with time zone); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rbac_permission_decision_for_user(p_business_user_id text, p_permission text, p_at timestamp with time zone DEFAULT statement_timestamp()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_user public.business_users%ROWTYPE;
  v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_enabled boolean;
  v_allowed boolean;
  v_version_id bigint;
  v_decision text;
  v_effective_at timestamptz;
  v_account private.rbac02_account_permission_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM public.business_users u
  WHERE u.id = p_business_user_id AND u.status = 'active' AND u.account_status = 'active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'RBAC_ACTOR_INACTIVE' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_catalog FROM private.rbac_permission_catalog c WHERE c.permission = p_permission;
  IF v_catalog.permission IS NULL THEN RAISE EXCEPTION 'RBAC_PERMISSION_UNKNOWN' USING ERRCODE='22023'; END IF;
  v_allowed := coalesce((v_catalog.legacy_defaults ->> v_user.system_permission)::boolean, false);
  SELECT g.enabled INTO v_enabled FROM private.rbac_runtime_gate g WHERE g.id = true;
  IF v_catalog.hard_restricted OR NOT coalesce(v_enabled, false) THEN
    RETURN jsonb_build_object(
      'actor_business_user_id',v_user.id,'role',v_user.system_permission,'permission',p_permission,
      'allowed',v_allowed,'source',CASE WHEN v_catalog.hard_restricted THEN 'hard_restriction' ELSE 'legacy_default' END,
      'reason',CASE WHEN v_catalog.hard_restricted THEN 'This action is fixed by the security baseline.'
                    ELSE 'The dynamic policy gate is disabled; the legacy matrix applies.' END,
      'version',NULL,'expires_at',NULL,'effective_at',NULL
    );
  END IF;

  v_version_id := private.rbac01_active_version_id(v_user.system_permission,p_at);
  IF v_version_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM private.rbac01_role_default_events approval
      JOIN private.rbac01_role_default_versions version ON version.id=approval.version_id
      WHERE approval.version_id=v_version_id AND approval.event_type='approval'
        AND approval.actor_business_user_id<>version.proposed_by
    ) THEN
      RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
        'permission',p_permission,'allowed',false,'source','invalid_version',
        'reason','The active role configuration lacks independent approval.',
        'version',v_version_id,'expires_at',NULL,'effective_at',NULL);
    END IF;
    SELECT version.decisions->>p_permission INTO v_decision
    FROM private.rbac01_role_default_versions version
    WHERE version.id=v_version_id AND version.role=v_user.system_permission;
    IF v_decision IN ('allow','deny') THEN
      v_allowed := (v_decision='allow');
      v_effective_at := (SELECT e.effective_at FROM private.rbac01_role_default_events e
        WHERE e.event_type IN ('activation','rollback') AND e.resulting_version_id=v_version_id
        ORDER BY e.effective_at DESC,e.id DESC LIMIT 1);
    END IF;
  END IF;

  SELECT * INTO v_account FROM private.rbac02_account_permission_versions a
  WHERE a.target_business_user_id=v_user.id AND a.permission=p_permission
  ORDER BY a.version DESC LIMIT 1;
  IF v_account.id IS NOT NULL AND v_account.decision IN ('allow','deny') THEN
    IF v_account.expires_at IS NOT NULL AND v_account.expires_at <= p_at THEN
      RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
        'permission',p_permission,'allowed',v_allowed,'source','expired',
        'reason','The account override expired; the role policy applies.',
        'version',v_account.version,'expires_at',v_account.expires_at,'effective_at',v_effective_at);
    END IF;
    IF v_account.decision='deny' THEN v_allowed := false;
    ELSIF v_user.system_permission = ANY(v_catalog.account_allow_roles) THEN v_allowed := true;
    ELSE v_allowed := false;
    END IF;
    RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
      'permission',p_permission,'allowed',v_allowed,
      'source',CASE WHEN v_account.decision='deny' THEN 'account_deny' ELSE 'account_allow' END,
      'reason',CASE WHEN v_account.decision='deny' THEN 'An active account deny takes precedence.'
                    WHEN v_allowed THEN 'An active account allow is permitted by the catalog.'
                    ELSE 'This account role is not allowed to receive this permission.' END,
      'version',v_account.version,'expires_at',v_account.expires_at,'effective_at',v_effective_at);
  END IF;
  IF v_account.id IS NOT NULL AND v_account.decision IN ('reset','revoke') THEN
    RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
      'permission',p_permission,'allowed',v_allowed,
      'source',CASE WHEN v_account.decision='revoke' THEN 'revoked' ELSE 'legacy_default' END,
      'reason',CASE WHEN v_account.decision='revoke' THEN 'The account override was revoked; the role policy applies.'
                    ELSE 'The account override was reset; the role policy applies.' END,
      'version',v_account.version,'expires_at',NULL,'effective_at',v_effective_at);
  END IF;
  RETURN jsonb_build_object('actor_business_user_id',v_user.id,'role',v_user.system_permission,
    'permission',p_permission,'allowed',v_allowed,
    'source',CASE WHEN v_version_id IS NULL THEN 'legacy_default' ELSE 'role_override' END,
    'reason',CASE WHEN v_version_id IS NULL THEN 'No active role override changes this permission.'
                  ELSE format('Approved role policy v%s applies.',v_version_id) END,
    'version',v_version_id,'expires_at',NULL,'effective_at',v_effective_at);
END;
$$;


--
-- Name: rbac_reject_immutable_change(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rbac_reject_immutable_change() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  RAISE EXCEPTION 'RBAC_HISTORY_IMMUTABLE' USING ERRCODE = '55000';
END;
$$;


--
-- Name: rc16k_report_metric(public.reports, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc16k_report_metric(r public.reports, k text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
begin
  if jsonb_typeof(r.normalized_metrics->k)='number' then return (r.normalized_metrics->>k)::numeric; end if;
  if jsonb_typeof(r.platform_metrics->k)='number' then return (r.platform_metrics->>k)::numeric; end if;
  if k='revenue' then
    if jsonb_typeof(r.platform_metrics->'sales')='number' then return (r.platform_metrics->>'sales')::numeric; end if;
    return r.revenue;
  end if;
  if k='gmv' then return r.gmv; end if;
  if k='orders' then return r.orders; end if;
  if k='engaged_viewers' then return coalesce(r.viewers,r.average_viewer); end if;
  if k='product_clicks' then return r.product_clicks; end if;
  if k='ctr' then return r.ctr; end if;
  if k='conversion_rate' then return r.cvr; end if;
  if k='live_duration_seconds' then return r.live_duration_minutes*60; end if;
  raise exception using errcode='22023',message='ANALYTICS_METRIC_INVALID';
end;
$$;


--
-- Name: rc19_artifact_delete_authorized(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_artifact_delete_authorized(p_file_id text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce((
    SELECT private.current_business_user_is_active()
      AND private.current_business_user_id() IS NOT NULL
      AND public.rbac01_effective_permission('reports.submit')
      AND public.rbac01_effective_permission(CASE WHEN private.current_system_permission() = 'member'
        THEN 'storage.edit_own' ELSE 'storage.delete' END)
      AND private.rc19_can_mutate_report(f.report_id)
      AND (private.current_system_permission() <> 'member' OR f.uploaded_by = private.current_business_user_id())
      AND r.shift_id = f.shift_id AND r.deleted_at IS NULL AND r.archived_at IS NULL
      AND NOT coalesce(r.metrics_confirmed, false) AND r.status <> 'confirmed'
      AND btrim(f.external_file_id) <> ''
    FROM public.stored_files f JOIN public.reports r ON r.id = f.report_id
    WHERE f.id = p_file_id
  ), false);
$$;


--
-- Name: rc19_can_mutate_report(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_can_mutate_report(p_report_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  submitted_by text;
  brand_id text;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN RETURN false; END IF;
  SELECT report.submitted_by, shift.brand_id INTO submitted_by, brand_id
  FROM public.reports AS report
  JOIN public.shifts AS shift ON shift.id = report.shift_id
  WHERE report.id = p_report_id AND report.deleted_at IS NULL AND report.archived_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF actor_role = 'admin' THEN RETURN true; END IF;
  IF actor_role = 'leader' THEN
    RETURN private.rc19_has_leader_brand_scope(brand_id, 'reports.review')
      OR (submitted_by = actor_id AND private.rc19_has_leader_brand_scope(brand_id, 'reports.submit'));
  END IF;
  RETURN actor_role = 'member' AND submitted_by = actor_id;
END;
$$;


--
-- Name: rc19_guard_report_child_write(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_guard_report_child_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  target_report public.reports;
  report_id text;
  brand_id text;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF actor_role = 'admin' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  report_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.report_id ELSE NEW.report_id END;
  SELECT report.* INTO target_report FROM public.reports AS report
  WHERE report.id = report_id AND report.deleted_at IS NULL AND report.archived_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT shift.brand_id INTO brand_id FROM public.shifts AS shift WHERE shift.id = target_report.shift_id;
  IF actor_role = 'leader' AND (
    private.rc19_has_leader_brand_scope(brand_id, 'reports.review')
    OR (target_report.submitted_by = actor_id AND private.rc19_has_leader_brand_scope(brand_id, 'reports.submit'))
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF actor_role = 'member' AND target_report.submitted_by = actor_id THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'REPORT_SCOPE_DENIED' USING ERRCODE = '42501';
END;
$$;


--
-- Name: rc19_guard_report_write(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_guard_report_write() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  brand_id text;
  submitted_by text;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF actor_role = 'admin' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    submitted_by := OLD.submitted_by;
    SELECT shift.brand_id INTO brand_id FROM public.shifts AS shift WHERE shift.id = OLD.shift_id;
  ELSE
    submitted_by := NEW.submitted_by;
    SELECT shift.brand_id INTO brand_id FROM public.shifts AS shift WHERE shift.id = NEW.shift_id;
  END IF;
  IF brand_id IS NULL THEN RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;

  IF actor_role = 'leader' THEN
    IF private.rc19_has_leader_brand_scope(brand_id, 'reports.review')
      OR (submitted_by = actor_id AND private.rc19_has_leader_brand_scope(brand_id, 'reports.submit')) THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
  ELSIF actor_role = 'member' AND submitted_by = actor_id THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'REPORT_SCOPE_DENIED' USING ERRCODE = '42501';
END;
$$;


--
-- Name: rc19_has_any_leader_brand_scope(text, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_has_any_leader_brand_scope(p_brand_id text, p_scope_keys text[]) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    (SELECT private.current_business_user_is_active()
      AND private.current_system_permission() = 'leader'
      AND EXISTS (
        SELECT 1
        FROM public.rc19_leader_brand_scopes AS scope_row
        JOIN public.brands AS brand ON brand.id = scope_row.brand_id
        WHERE scope_row.leader_business_user_id = private.current_business_user_id()
          AND scope_row.brand_id = p_brand_id
          AND scope_row.scope_key = ANY(p_scope_keys)
          AND scope_row.status = 'active'
          AND scope_row.valid_from <= statement_timestamp()
          AND (scope_row.valid_until IS NULL OR statement_timestamp() < scope_row.valid_until)
          AND brand.status = 'active'
          AND brand.archived_at IS NULL
          AND brand.deleted_at IS NULL
      )), false);
$$;


--
-- Name: rc19_has_leader_brand_scope(text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_has_leader_brand_scope(p_brand_id text, p_scope_key text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce(
    (SELECT private.current_business_user_is_active()
      AND private.current_system_permission() = 'leader'
      AND EXISTS (
        SELECT 1
        FROM public.rc19_leader_brand_scopes AS scope_row
        JOIN public.brands AS brand ON brand.id = scope_row.brand_id
        WHERE scope_row.leader_business_user_id = private.current_business_user_id()
          AND scope_row.brand_id = p_brand_id
          AND scope_row.scope_key = p_scope_key
          AND scope_row.status = 'active'
          AND scope_row.valid_from <= statement_timestamp()
          AND (scope_row.valid_until IS NULL OR statement_timestamp() < scope_row.valid_until)
          AND brand.status = 'active'
          AND brand.archived_at IS NULL
          AND brand.deleted_at IS NULL
      )), false);
$$;


--
-- Name: rc19_revoke_leader_brand_scopes_on_role_loss(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.rc19_revoke_leader_brand_scopes_on_role_loss() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
BEGIN
  IF OLD.system_permission = 'leader' AND OLD.status = 'active' AND OLD.account_status = 'active'
    AND OLD.archived_at IS NULL AND OLD.deleted_at IS NULL
    AND (NEW.system_permission <> 'leader' OR NEW.status <> 'active' OR NEW.account_status <> 'active'
      OR NEW.archived_at IS NOT NULL OR NEW.deleted_at IS NOT NULL) THEN
    WITH revoked AS (
      UPDATE public.rc19_leader_brand_scopes AS scope_row
      SET status = 'revoked', revoked_at = statement_timestamp(), version = version + 1,
          updated_by = coalesce(actor_id, updated_by), updated_at = statement_timestamp()
      WHERE leader_business_user_id = NEW.id AND status = 'active'
      RETURNING scope_row.*
    )
    INSERT INTO public.rc19_leader_brand_scope_events (
      scope_id, leader_business_user_id, brand_id, scope_key, event_type,
      prior_status, new_status, version, actor_business_user_id, reason
    )
    SELECT id, leader_business_user_id, brand_id, scope_key, 'automatic_revoke',
      'active', 'revoked', version, actor_id, 'Leader account lost active Leader status'
    FROM revoked;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: record_report_revision(text, text, text, text, text, jsonb, jsonb, jsonb, text[]); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.record_report_revision(p_report_id text, p_actor_id text, p_status text, p_event text, p_reason text, p_metrics jsonb, p_ocr_review jsonb, p_final_recap jsonb, p_image_references text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: refresh_automatic_shift_statuses_scheduled(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.refresh_automatic_shift_statuses_scheduled() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  changed_count integer;
begin
  perform set_config('app.audit_source', 'system', true);
  with desired as (
    select shift.id, shift.version,
      case
        when statement_timestamp() >= shift.end_at then 'completed'
        when statement_timestamp() >= shift.start_at then 'live'
        when statement_timestamp() >= shift.registration_cutoff_at then 'preparing'
        else 'scheduled'
      end as next_status
    from public.shifts as shift
    where shift.deleted_at is null
      and shift.archived_at is null
      and shift.status_mode = 'auto'
      and shift.status <> 'cancelled'
  ), updated as (
    update public.shifts as shift
    set status = desired.next_status
    from desired
    where shift.id = desired.id
      and shift.status_mode = 'auto'
      and shift.version = desired.version
      and shift.status is distinct from desired.next_status
    returning shift.id
  )
  select count(*)::integer into changed_count from updated;
  return changed_count;
end;
$$;


--
-- Name: refresh_shift_registration_lock(text, boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.refresh_shift_registration_lock(p_shift_id text, p_unlock_when_understaffed boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  fully_staffed boolean;
  auto_lock boolean;
begin
  select auto_lock_filled_shifts into auto_lock
  from public.system_settings
  limit 1;
  if auto_lock is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  select
    (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) >= shift.required_host_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) >= shift.required_support_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) >= shift.required_technical_count
  into fully_staffed
  from public.shifts as shift
  where shift.id = p_shift_id;

  if fully_staffed and auto_lock then
    update public.shifts set registration_locked = true where id = p_shift_id;
  elsif not fully_staffed and p_unlock_when_understaffed then
    update public.shifts set registration_locked = false where id = p_shift_id;
  end if;
end;
$$;


--
-- Name: reg02_reject_surplus(text, text, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reg02_reject_surplus(p_shift_id text, p_role text, p_actor_id text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_capacity integer;
  v_filled integer;
  v_rejected integer;
begin
  -- Caller MUST already hold public.shifts row FOR UPDATE. All canonical
  -- approval and manual-assignment writers acquire this lock before calling.
  if p_role not in ('host', 'support', 'technical') or p_role is null then
    raise exception using errcode = '22023', message = 'OPERATIONAL_ROLE_INVALID';
  end if;
  select private.shift_required_capacity(s, p_role) into v_capacity
  from public.shifts s where s.id = p_shift_id;
  if v_capacity is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  select count(*) into v_filled
  from public.shift_registrations r
  where r.shift_id = p_shift_id and r.operational_role = p_role
    and r.status in ('approved', 'manually_assigned');
  if v_filled < v_capacity then return 0; end if;
  if v_filled > v_capacity then
    raise exception using errcode = 'P0001', message = 'SHIFT_CAPACITY_BELOW_STAFFING';
  end if;
  -- UPDATE and approval live inside ONE PostgreSQL transaction. No row outside
  -- the completed role may be affected. Existing audit/version triggers fire.
  with surplus as (
    select r.id from public.shift_registrations r
    where r.shift_id = p_shift_id and r.operational_role = p_role
      and r.status = 'pending'
    order by r.requested_at, r.id
    for update
  ), changed as (
    update public.shift_registrations r
    set status = 'rejected', reviewed_by = p_actor_id,
        reviewed_at = statement_timestamp(),
        review_notes = 'ROLE_CAPACITY_FILLED'
    where r.id in (select id from surplus) and r.status = 'pending'
    returning r.id
  )
  select count(*) into v_rejected from changed;
  return v_rejected;
end;
$$;


--
-- Name: reject_self_attendance_mutation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.reject_self_attendance_mutation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
 raise exception using errcode='42501', message='ATTENDANCE_EVENTS_IMMUTABLE';
end $$;


--
-- Name: report_historical_staff_filters_match(text, jsonb); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_historical_staff_filters_match(p_report_id text, p_filters jsonb) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not private.current_business_user_is_active()
    or not private.can_read_report(p_report_id)
    or jsonb_typeof(p_filters) is distinct from 'object' then
    return false;
  end if;
  -- A user can always filter currently RLS-visible shifts through the
  -- existing canonical filtered_shift_ids helper. For RLS-HIDDEN shifts,
  -- selected personnel filters cannot be matched without leaking staffing.
  return jsonb_array_length(coalesce(p_filters->'hostIds','[]'::jsonb))=0
    and jsonb_array_length(coalesce(p_filters->'supportIds','[]'::jsonb))=0
    and jsonb_array_length(coalesce(p_filters->'technicalIds','[]'::jsonb))=0;
end;
$$;


--
-- Name: report_image_references(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_image_references(p_report_id text) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select array_agg(id order by created_at)
  from (
    select id, created_at from public.report_images
    where report_id = p_report_id and deleted_at is null
    union all
    select id, created_at from public.live_report_images
    where report_id = p_report_id
  ) as combined;
$$;


--
-- Name: report_revision_snapshot(public.reports); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_revision_snapshot(p_report public.reports) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select jsonb_build_object(
    'normalized', p_report.normalized_metrics,
    'platform', p_report.platform_metrics,
    'revenue', p_report.revenue,
    'orders', p_report.orders,
    'peak_viewer', p_report.peak_viewer,
    'average_viewer', p_report.average_viewer
  );
$$;


--
-- Name: report_shift_display_context(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.report_shift_display_context(p_report_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  context jsonb;
begin
  if p_report_id is null
    or not private.current_business_user_is_active()
    or not private.can_read_report(p_report_id) then
    return null;
  end if;

  select jsonb_build_object(
    'date', shift.date,
    'start_time', shift.start_time,
    'end_time', shift.end_time,
    'brand_id', shift.brand_id,
    'platform_id', shift.platform_id,
    'campaign_id', shift.campaign_id
  ) into context
  from public.reports as report
  join public.shifts as shift on shift.id = report.shift_id
  where report.id = p_report_id;

  return context;
end;
$$;


--
-- Name: require_excel_schedule_source_receipt(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_excel_schedule_source_receipt() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.import_batch_id IS NOT NULL
    AND OLD.import_batch_id IS DISTINCT FROM NEW.import_batch_id
    AND EXISTS (
      SELECT 1 FROM public.schedule_import_batches batch
      WHERE batch.id = OLD.import_batch_id AND batch.source = 'excel' AND batch.status = 'confirmed'
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_BATCH_REFERENCE_IMMUTABLE';
  END IF;

  IF NEW.import_batch_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.schedule_import_batches batch
      WHERE batch.id = NEW.import_batch_id AND batch.source = 'excel'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.operational_schedule_source_files source_file
      WHERE source_file.batch_id = NEW.import_batch_id
        AND source_file.reconciliation_status = 'provider_verified'
        AND source_file.external_file_id IS NOT NULL
        AND source_file.external_parent_id IS NOT NULL
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION require_excel_schedule_source_receipt(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.require_excel_schedule_source_receipt() IS 'Require provider-verified raw Excel bytes before a batch-linked shift write.';


--
-- Name: require_excel_source_before_batch_confirmation(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_excel_source_before_batch_confirmation() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed'
    AND (OLD.id IS DISTINCT FROM NEW.id
      OR OLD.source IS DISTINCT FROM NEW.source
      OR OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_CONFIRMED_BATCH_IMMUTABLE';
  END IF;

  IF NEW.status = 'confirmed' AND NEW.source = 'excel'
    AND NOT EXISTS (
      SELECT 1 FROM public.operational_schedule_source_files source_file
      WHERE source_file.batch_id = NEW.id
        AND source_file.reconciliation_status = 'provider_verified'
        AND source_file.external_file_id IS NOT NULL
        AND source_file.external_parent_id IS NOT NULL
    ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION require_excel_source_before_batch_confirmation(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.require_excel_source_before_batch_confirmation() IS 'Require a backend-verified source receipt before Excel batch confirmation; provider bytes are re-read and checksummed by the API before import.';


--
-- Name: require_report_actor(boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_report_actor(p_leader_required boolean) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: require_self_attendance_photo(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_self_attendance_photo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  -- For check_out, verify that check_in has already occurred
  if new.event_kind = 'check_out' and not exists (
    select 1 from public.self_attendance_events e
    where e.shift_id = new.shift_id
      and e.staff_id = new.staff_id
      and e.operational_role = new.operational_role
      and e.event_kind = 'check_in'
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_CHECKIN_REQUIRED';
  end if;

  -- Both check_in and check_out require verified provider photo evidence
  if new.event_kind in ('check_in', 'check_out') and not exists (
    select 1 from public.self_attendance_photo_evidence p
    where p.request_id = new.request_id
      and p.shift_id = new.shift_id
      and p.staff_id = new.staff_id
      and p.operational_role = new.operational_role
      and p.event_kind = new.event_kind
      and p.provider = 'google_drive'
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_PHOTO_REQUIRED';
  end if;

  return new;
end;
$$;


--
-- Name: require_shift_actor(boolean); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_shift_actor(p_leader_required boolean) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: require_staff_admin(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_staff_admin() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
begin
  v_actor_id := private.current_business_user_id();
  if v_actor_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  return v_actor_id;
end;
$$;


--
-- Name: require_staff_admin_for_auth_user(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.require_staff_admin_for_auth_user(p_actor_auth_user_id uuid) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
begin
  if p_actor_auth_user_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  perform pg_catalog.set_config(
    'request.jwt.claim.sub',
    p_actor_auth_user_id::text,
    true
  );
  v_actor_id := private.require_staff_admin();
  return v_actor_id;
end;
$$;


--
-- Name: schedule_import_summary_value(jsonb, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.schedule_import_summary_value(p_summary jsonb, p_key text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select greatest(coalesce((p_summary->>p_key)::int, 0), 0);
$$;


--
-- Name: set_provisioning_actor(uuid); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_provisioning_actor(p_actor_auth_user_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  perform private.require_staff_admin_for_auth_user(p_actor_auth_user_id);
end;
$$;


--
-- Name: set_shift_derived_fields(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_shift_derived_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  cutoff_hours smallint;
  old_cutoff_was_default boolean := false;
begin
  select registration_cutoff_hours into cutoff_hours
  from public.system_settings
  limit 1;
  if cutoff_hours is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  if new.timezone is distinct from 'Asia/Ho_Chi_Minh' then
    raise exception using errcode = '22023', message = 'SHIFT_TIMEZONE_INVALID';
  end if;
  if new.start_time = new.end_time then
    raise exception using errcode = '22023', message = 'SHIFT_DURATION_INVALID';
  end if;
  if tg_op = 'UPDATE' then
    old_cutoff_was_default := old.registration_cutoff_at = old.start_at - (cutoff_hours * interval '1 hour');
  end if;

  new.end_date := new.date + case when new.end_time < new.start_time then 1 else 0 end;
  new.crosses_midnight := new.end_date > new.date;
  new.start_at := (new.date + new.start_time) at time zone 'Asia/Ho_Chi_Minh';
  new.end_at := (new.end_date + new.end_time) at time zone 'Asia/Ho_Chi_Minh';
  new.duration_minutes := (extract(epoch from (new.end_at - new.start_at)) / 60)::smallint;

  if new.registration_cutoff_at is null
    or (tg_op = 'UPDATE' and old_cutoff_was_default and (
      new.date is distinct from old.date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
    ))
  then
    new.registration_cutoff_at := new.start_at - (cutoff_hours * interval '1 hour');
  end if;
  return new;
end;
$$;


--
-- Name: set_shift_status_mode(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_shift_status_mode() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  override_mode text;
  source_mode text;
begin
  override_mode := current_setting('app.shift_status_mode_override', true);
  source_mode := current_setting('app.audit_source', true);
  if override_mode in ('auto', 'manual') then
    new.status_mode := override_mode;
  elsif new.status is distinct from old.status and coalesce(source_mode, 'manual') <> 'system' then
    new.status_mode := 'manual';
  end if;
  return new;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;


--
-- Name: FUNCTION set_updated_at(); Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON FUNCTION private.set_updated_at() IS 'Sets authoritative updated_at timestamps for P1 business tables.';


--
-- Name: shift_required_capacity(public.shifts, text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.shift_required_capacity(p_shift public.shifts, p_role text) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case p_role
    when 'host' then p_shift.required_host_count
    when 'support' then p_shift.required_support_count
    when 'technical' then p_shift.required_technical_count
    else null
  end;
$$;


--
-- Name: sync_live_image_storage_category(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_live_image_storage_category() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.storage_idempotency_key is not null then
    new.storage_idempotency_key := new.category || ':' || split_part(new.storage_idempotency_key, ':', 2);
  end if;
  return new;
end;
$$;


--
-- Name: sync_schedule_import_batch_counts(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_schedule_import_batch_counts(p_batch_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.schedule_import_batches as batch
  set
    imported_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome in ('imported', 'warning')
    ),
    duplicate_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'duplicate_skipped'
    ),
    failed_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'validation_failed'
    ),
    retryable_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'retryable'
    )
  where batch.id = p_batch_id;
end;
$$;


--
-- Name: sync_shift_staffing_projection(text); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_shift_staffing_projection(p_shift_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.shifts as shift
  set
    host_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'host'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    support_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'support'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    technical_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'technical'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    updated_by = coalesce((select private.current_business_user_id()), shift.updated_by)
  where shift.id = p_shift_id;
end;
$$;


--
-- Name: sync_shift_staffing_projection_trigger(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.sync_shift_staffing_projection_trigger() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_shift_staffing_projection(old.shift_id);
    return old;
  end if;
  perform private.sync_shift_staffing_projection(new.shift_id);
  if tg_op = 'UPDATE' and new.shift_id is distinct from old.shift_id then
    perform private.sync_shift_staffing_projection(old.shift_id);
  end if;
  return new;
end;
$$;


--
-- Name: validate_campaign_platform_ids(); Type: FUNCTION; Schema: private; Owner: -
--

CREATE FUNCTION private.validate_campaign_platform_ids() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: acquire_operational_storage_folder_lock(text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acquire_operational_storage_folder_lock(p_lock_key text, p_owner uuid, p_lease_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare changed integer;
begin
  if p_lock_key !~ '^[0-9a-f]{64}$' or p_owner is null
     or p_lease_seconds is null or p_lease_seconds not between 5 and 180 then
    raise exception using errcode = '22023', message = 'STORAGE_FOLDER_LOCK_INPUT_INVALID';
  end if;
  insert into public.operational_storage_folder_locks as current_lock(lock_key, lock_owner, expires_at)
    values (p_lock_key, p_owner, clock_timestamp() + make_interval(secs => p_lease_seconds))
    on conflict (lock_key) do update
      set lock_owner = excluded.lock_owner, expires_at = excluded.expires_at
      where current_lock.expires_at <= clock_timestamp()
        or current_lock.lock_owner = excluded.lock_owner;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$_$;


--
-- Name: shift_operational_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shift_operational_notes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    shift_id text NOT NULL,
    business_date date NOT NULL,
    date date NOT NULL,
    category text NOT NULL,
    note text NOT NULL,
    author_id text NOT NULL,
    author_name text,
    author_role text,
    actual_event_time timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    event_time timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    affected_role text,
    affected_user_id text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT shift_operational_notes_affected_role_check CHECK (((affected_role IS NULL) OR (affected_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text])))),
    CONSTRAINT shift_operational_notes_category_check CHECK ((category = ANY (ARRAY['normal'::text, 'attendance'::text, 'swap'::text, 'incident'::text, 'sales'::text, 'other'::text]))),
    CONSTRAINT shift_operational_notes_note_check CHECK ((btrim(note) <> ''::text))
);


--
-- Name: add_shift_operational_note(text, date, text, text, timestamp with time zone, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_shift_operational_note(p_shift_id text, p_business_date date, p_category text, p_note text, p_actual_event_time timestamp with time zone DEFAULT statement_timestamp(), p_affected_role text DEFAULT NULL::text, p_affected_user_id text DEFAULT NULL::text) RETURNS public.shift_operational_notes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_actor_name text;
  v_actor_role text;
  v_shift record;
  v_new_note public.shift_operational_notes;
begin
  v_actor_id := private.require_shift_actor(false);
  if v_actor_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  if not private.can_write_shift_operational_notes(p_shift_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null;

  if not found then
    raise exception 'SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_business_date is null or v_shift.date <> p_business_date then
    raise exception 'BUSINESS_DATE_MISMATCH' using errcode = '22023';
  end if;

  if p_category is null or p_category not in ('normal', 'attendance', 'swap', 'incident', 'sales', 'other') then
    raise exception 'INVALID_CATEGORY' using errcode = '22023';
  end if;

  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'NOTE_EMPTY' using errcode = '22023';
  end if;

  if p_affected_role is not null and p_affected_role not in ('host', 'support', 'technical') then
    raise exception 'INVALID_AFFECTED_ROLE' using errcode = '22023';
  end if;

  if p_affected_user_id is not null then
    if not exists (
      select 1 from public.business_users u
      where u.id = p_affected_user_id and u.status = 'active'
    ) then
      raise exception 'AFFECTED_USER_NOT_FOUND' using errcode = '22023';
    end if;
  end if;

  select full_name, coalesce(role, 'staff')
  into v_actor_name, v_actor_role
  from public.business_users
  where id = v_actor_id;

  insert into public.shift_operational_notes (
    shift_id,
    business_date,
    date,
    category,
    note,
    author_id,
    author_name,
    author_role,
    actual_event_time,
    event_time,
    affected_role,
    affected_user_id,
    version
  ) values (
    p_shift_id,
    p_business_date,
    p_business_date,
    p_category,
    btrim(p_note),
    v_actor_id,
    v_actor_name,
    v_actor_role,
    coalesce(p_actual_event_time, statement_timestamp()),
    coalesce(p_actual_event_time, statement_timestamp()),
    p_affected_role,
    p_affected_user_id,
    1
  ) returning * into v_new_note;

  return v_new_note;
end;
$$;


--
-- Name: account_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    phone text,
    department text,
    status text DEFAULT 'pending'::text NOT NULL,
    provisioning_status text DEFAULT 'not_started'::text NOT NULL,
    staff_id text,
    auth_user_id uuid,
    submitted_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by text,
    rejection_reason text,
    provisioning_error_code text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    version integer DEFAULT 0 NOT NULL,
    CONSTRAINT account_requests_email_not_blank CHECK ((btrim(email) <> ''::text)),
    CONSTRAINT account_requests_full_name_not_blank CHECK ((btrim(full_name) <> ''::text)),
    CONSTRAINT account_requests_provisioning_status_check CHECK ((provisioning_status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'invited'::text, 'linked'::text, 'failed'::text]))),
    CONSTRAINT account_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text]))),
    CONSTRAINT account_requests_version_nonnegative_check CHECK ((version >= 0))
);


--
-- Name: TABLE account_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.account_requests IS 'Unauthenticated access requests. Phase 1 persists pending requests only; approval and provisioning are separate workflows.';


--
-- Name: COLUMN account_requests.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.account_requests.version IS 'Server-controlled optimistic concurrency revision for Admin review.';


--
-- Name: approve_account_request(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_account_request(p_request_id uuid, p_expected_version integer) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_request public.account_requests;
begin
  v_actor_id := private.require_staff_admin();

  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'approved' then
    return v_request;
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;

  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  update public.account_requests as request_row
  set status = 'approved',
      reviewed_at = statement_timestamp(),
      reviewed_by = v_actor_id,
      rejection_reason = null,
      provisioning_status = 'not_started',
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'pending'
    and request_row.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  return v_request;
end;
$$;


--
-- Name: FUNCTION approve_account_request(p_request_id uuid, p_expected_version integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.approve_account_request(p_request_id uuid, p_expected_version integer) IS 'Admin-only Phase 2 review transition. Does not provision Auth or Staff.';


--
-- Name: approve_shift_registration(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_shift_registration(p_registration_id text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift public.shifts;
  target_registration public.shift_registrations;
begin
  actor_id := private.require_shift_actor(true);
  select shift_id into target_registration.shift_id
  from public.shift_registrations where id = p_registration_id;
  if target_registration.shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  select * into target_shift from public.shifts
  where id = target_registration.shift_id and deleted_at is null and archived_at is null
  for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id for update;
  if target_registration.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  if target_shift.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_registration.user_id, 91731));
  perform private.assert_shift_role_eligibility(
    target_registration.user_id,
    target_registration.operational_role
  );
  perform private.assert_shift_capacity(target_shift, target_registration.operational_role, p_registration_id);
  perform private.assert_no_shift_registration_conflict(
    target_registration.user_id, target_shift, target_registration.operational_role, p_registration_id
  );
  update public.shift_registrations
  set status = 'approved', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes
  where id = p_registration_id
  returning * into target_registration;
  perform private.reg02_reject_surplus(target_shift.id, target_registration.operational_role, actor_id);
  perform private.refresh_shift_registration_lock(target_shift.id, false);
  return target_registration;
end;
$$;


--
-- Name: approve_shift_registration(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_shift_registration(p_registration_id text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
        current_shift_id text;
begin
  -- Order: shift -> registration -> user advisory (matches canonical RPC and bulk review).
  select shift_id into current_shift_id from public.shift_registrations where id = p_registration_id;
  if current_shift_id is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform 1 from public.shifts where id = current_shift_id for update;
  select version into current_version from public.shift_registrations where id = p_registration_id and shift_id = current_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.approve_shift_registration(p_registration_id, p_notes);
end;
$$;


--
-- Name: swap_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.swap_requests (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    requester_id text NOT NULL,
    source_registration_id text NOT NULL,
    source_shift_id text NOT NULL,
    target_shift_id text,
    counterpart_registration_id text,
    counterpart_id text,
    operational_role text NOT NULL,
    mode text NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    responded_at timestamp with time zone,
    responded_by text,
    approved_at timestamp with time zone,
    approved_by text,
    completed_at timestamp with time zone,
    shift_id text,
    original_staff_id text,
    replacement_staff_id text,
    new_host_id text,
    new_support_id text,
    new_technical_id text,
    approval_history jsonb DEFAULT '[]'::jsonb NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    deletion_reason text,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT swap_mode_counterpart_check CHECK ((((mode = 'replacement'::text) AND (target_shift_id IS NULL) AND (counterpart_registration_id IS NULL) AND (counterpart_id IS NULL) AND (replacement_staff_id IS NOT NULL)) OR ((mode = 'move'::text) AND (target_shift_id IS NOT NULL) AND (counterpart_registration_id IS NULL) AND (counterpart_id IS NULL) AND (replacement_staff_id IS NULL)) OR ((mode = 'exchange'::text) AND (target_shift_id IS NOT NULL) AND (counterpart_registration_id IS NOT NULL) AND (counterpart_id IS NOT NULL) AND (replacement_staff_id IS NULL)))),
    CONSTRAINT swap_requests_mode_check CHECK ((mode = ANY (ARRAY['replacement'::text, 'move'::text, 'exchange'::text]))),
    CONSTRAINT swap_requests_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT swap_requests_reason_check CHECK ((btrim(reason) <> ''::text)),
    CONSTRAINT swap_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'cancelled'::text, 'approved'::text, 'completed'::text]))),
    CONSTRAINT swap_requests_version_positive_check CHECK ((version > 0)),
    CONSTRAINT swap_source_target_not_equal CHECK (((target_shift_id IS NULL) OR (source_shift_id <> target_shift_id)))
);


--
-- Name: approve_shift_swap_request(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_shift_swap_request(p_request_id text, p_notes text DEFAULT NULL::text) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  end if;

  approved_history := jsonb_build_object(
    'action', 'approved', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', 'accepted', 'to_status', 'approved',
    'reason', request_row.reason, 'notes', p_notes, 'at', now_at
  );
  update public.swap_requests
  set status = 'approved', approved_by = actor_id, approved_at = now_at,
      notes = coalesce(p_notes, notes), updated_at = now_at,
      approval_history = approval_history || jsonb_build_array(approved_history)
  where id = p_request_id
  returning * into request_row;

  if request_row.mode = 'replacement' then
    insert into public.shift_registrations (
      shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at
    ) values (
      source_shift.id, participant.id, request_row.operational_role,
      'approved', 'manual_assignment', now_at, actor_id, now_at
    );
    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id = source_registration.id;
    perform private.refresh_shift_registration_lock(source_shift.id, true);
  else
    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id in (source_registration.id, counterpart_registration.id);
    insert into public.shift_registrations (
      shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at
    ) values
      (target_shift.id, requester.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at),
      (source_shift.id, participant.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at);
    perform private.refresh_shift_registration_lock(source_shift.id, true);
    perform private.refresh_shift_registration_lock(target_shift.id, true);
  end if;

  completed_history := jsonb_build_object(
    'action', 'completed', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', 'approved', 'to_status', 'completed',
    'reason', request_row.reason, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'completed', completed_at = statement_timestamp(), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(completed_history)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;


--
-- Name: approve_shift_swap_request(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_shift_swap_request(p_request_id text, p_notes text, p_expected_version integer) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.approve_shift_swap_request(p_request_id, p_notes);
end;
$$;


--
-- Name: business_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_users (
    id text NOT NULL,
    auth_user_id uuid,
    email text NOT NULL,
    full_name text NOT NULL,
    avatar_url text,
    avatar_storage_path text,
    phone text,
    role text DEFAULT 'staff'::text NOT NULL,
    system_permission text DEFAULT 'member'::text NOT NULL,
    operational_roles text[] DEFAULT '{}'::text[] NOT NULL,
    department text,
    status text DEFAULT 'active'::text NOT NULL,
    account_status text DEFAULT 'pending_approval'::text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    auth_provider text,
    join_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    CONSTRAINT business_users_account_status_check CHECK ((account_status = ANY (ARRAY['pending_email_verification'::text, 'pending_approval'::text, 'rejected'::text, 'active'::text]))),
    CONSTRAINT business_users_auth_provider_check CHECK (((auth_provider IS NULL) OR (auth_provider = ANY (ARRAY['email'::text, 'google'::text])))),
    CONSTRAINT business_users_email_not_blank CHECK ((btrim(email) <> ''::text)),
    CONSTRAINT business_users_full_name_not_blank CHECK ((btrim(full_name) <> ''::text)),
    CONSTRAINT business_users_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT business_users_operational_roles_check CHECK ((operational_roles <@ ARRAY['host'::text, 'support'::text, 'technical'::text])),
    CONSTRAINT business_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'leader'::text, 'staff'::text]))),
    CONSTRAINT business_users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
    CONSTRAINT business_users_system_permission_check CHECK ((system_permission = ANY (ARRAY['member'::text, 'leader'::text, 'admin'::text])))
);


--
-- Name: COLUMN business_users.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_users.auth_user_id IS 'Supabase Auth UUID. Domain relations continue to use business_users.id.';


--
-- Name: COLUMN business_users.email_verified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.business_users.email_verified IS 'Business workflow metadata only; Supabase Auth remains authoritative for authentication.';


--
-- Name: approve_staff_account(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_staff_account(p_user_id text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
  v_email_verified boolean;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_APPROVAL_DENIED';
  end if;
  select * into v_result
  from public.business_users
  where id = p_user_id
    and account_status = 'pending_approval'
    and archived_at is null
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
  if v_result.auth_user_id is not null then
    select auth_user.email_confirmed_at is not null
      into v_email_verified
    from auth.users as auth_user
    where auth_user.id = v_result.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
  end if;
  update public.business_users
  set status = 'active',
      account_status = 'active',
      email_verified = coalesce(v_email_verified, email_verified)
  where id = p_user_id
  returning * into v_result;
  return v_result;
end;
$$;


--
-- Name: archive_report(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_report(p_report_id text, p_reason text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: archive_staff_member(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.archive_staff_member(p_user_id text, p_reason text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_ARCHIVE_DENIED';
  end if;
  update public.business_users
  set status = 'inactive', archived_at = statement_timestamp(), archived_by = v_actor_id,
      deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Archived by administrator')
  where id = p_user_id and archived_at is null and deleted_at is null
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND_OR_ARCHIVED';
  end if;
  return v_result;
end;
$$;


--
-- Name: authorize_live_report_image_delete(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_live_report_image_delete(p_image_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  target_image public.live_report_images;
  target_report public.reports;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target_image FROM public.live_report_images WHERE id = p_image_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO target_report FROM public.reports
  WHERE id = target_image.report_id AND deleted_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF actor_role = 'member' AND (target_image.uploaded_by IS DISTINCT FROM actor_id
      OR target_report.submitted_by IS DISTINCT FROM actor_id) THEN
    RAISE EXCEPTION 'OPERATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF target_report.metrics_confirmed OR target_report.status = 'confirmed' THEN
    RAISE EXCEPTION 'REPORT_CONFIRMED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.rc19_can_mutate_report(target_report.id) THEN
    RAISE EXCEPTION 'REPORT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;


--
-- Name: authorize_report_image_delete(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.authorize_report_image_delete(p_image_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  actor_role text := private.current_system_permission();
  target_image public.report_images;
  target_report public.reports;
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO target_image FROM public.report_images WHERE id = p_image_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO target_report FROM public.reports
  WHERE id = target_image.report_id AND deleted_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF actor_role = 'member' AND (target_image.uploaded_by IS DISTINCT FROM actor_id
      OR target_report.submitted_by IS DISTINCT FROM actor_id) THEN
    RAISE EXCEPTION 'OPERATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF target_report.metrics_confirmed OR target_report.status = 'confirmed' THEN
    RAISE EXCEPTION 'REPORT_CONFIRMED' USING ERRCODE = 'P0001';
  END IF;
  IF NOT private.rc19_can_mutate_report(target_report.id) THEN
    RAISE EXCEPTION 'REPORT_SCOPE_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN true;
END;
$$;


--
-- Name: before_user_created_block_google(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.before_user_created_block_google(event jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_provider text;
begin
  -- A missing provider is treated as the existing non-Google flow so email
  -- provisioning and recovery are not coupled to this Google-only guard.
  if event is null or pg_catalog.jsonb_typeof(event) <> 'object' then
    return '{}'::jsonb;
  end if;

  v_provider := event->'user'->'app_metadata'->>'provider';
  if pg_catalog.lower(pg_catalog.btrim(coalesce(v_provider, ''))) = 'google' then
    return pg_catalog.jsonb_build_object(
      'error', pg_catalog.jsonb_build_object(
        'http_code', 403,
        'message', 'Google account creation is not allowed. Use an approved invitation.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;


--
-- Name: FUNCTION before_user_created_block_google(event jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.before_user_created_block_google(event jsonb) IS 'Before User Created hook: block new Google Auth users without creating or linking application Staff records.';


--
-- Name: begin_account_request_provisioning(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean DEFAULT false) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_APPROVED';
  end if;
  if v_request.provisioning_status in ('invited', 'linked') then
    return v_request;
  end if;
  if v_request.provisioning_status = 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_IN_PROGRESS';
  end if;
  if v_request.provisioning_status = 'failed' and not coalesce(p_retry, false) then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_RETRY_REQUIRED';
  end if;
  if v_request.provisioning_status not in ('not_started', 'failed') then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STATE_INVALID';
  end if;
  if coalesce(p_retry, false) and v_request.provisioning_status <> 'failed' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_RETRY_INVALID';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;

  update public.account_requests as request_row
  set provisioning_status = 'in_progress',
      provisioning_error_code = null,
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'approved'
    and request_row.provisioning_status in ('not_started', 'failed')
    and request_row.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  return v_request;
end;
$$;


--
-- Name: FUNCTION begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean) IS 'Admin-only provisioning claim. Approval and provisioning remain separate state transitions.';


--
-- Name: brand01_product_knowledge_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_product_knowledge_versions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    product_id text NOT NULL,
    sku_id text,
    knowledge_type text NOT NULL,
    content jsonb NOT NULL,
    version integer NOT NULL,
    status text NOT NULL,
    source_resource_id text,
    source_url text,
    source_reference text,
    effective_from date,
    effective_to date,
    owner_id text NOT NULL,
    created_by text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_knowledge_approval_required CHECK (((status <> 'approved'::text) OR ((reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> owner_id) AND (effective_from IS NOT NULL)))),
    CONSTRAINT brand01_knowledge_effective_dates CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
    CONSTRAINT brand01_knowledge_source_required CHECK (((status <> 'approved'::text) OR ((source_resource_id IS NOT NULL) OR (NULLIF(btrim(source_url), ''::text) IS NOT NULL) OR (NULLIF(btrim(source_reference), ''::text) IS NOT NULL)))),
    CONSTRAINT brand01_product_knowledge_versions_content_check CHECK ((jsonb_typeof(content) = ANY (ARRAY['object'::text, 'array'::text, 'string'::text]))),
    CONSTRAINT brand01_product_knowledge_versions_knowledge_type_check CHECK ((knowledge_type = ANY (ARRAY['description'::text, 'ingredient'::text, 'feature'::text, 'claim'::text, 'restriction'::text, 'disclaimer'::text, 'usage_note'::text, 'faq'::text, 'training'::text]))),
    CONSTRAINT brand01_product_knowledge_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'retired'::text]))),
    CONSTRAINT brand01_product_knowledge_versions_version_check CHECK ((version > 0))
);


--
-- Name: TABLE brand01_product_knowledge_versions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brand01_product_knowledge_versions IS 'Append-only sourced knowledge versions. Non-Admin reads require approved, effective content.';


--
-- Name: brand01_admin_create_knowledge_version(text, text, text, jsonb, text, text, text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_create_knowledge_version(p_product_id text, p_sku_id text, p_knowledge_type text, p_content jsonb, p_source_resource_id text, p_source_url text, p_source_reference text, p_effective_from date, p_effective_to date) RETURNS public.brand01_product_knowledge_versions
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; parent_product public.brand01_products; next_version integer; created public.brand01_product_knowledge_versions;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  select * into parent_product from public.brand01_products p where p.id=p_product_id and p.archived_at is null for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND'; end if;
  if p_sku_id is not null and not exists(select 1 from public.brand01_product_skus s where s.id=p_sku_id and s.product_id=p_product_id and s.lifecycle_status<>'archived') then
    raise exception using errcode='23514', message='BRAND01_KNOWLEDGE_SKU_PRODUCT_MISMATCH';
  end if;
  select coalesce(max(k.version),0)+1 into next_version from public.brand01_product_knowledge_versions k
    where k.product_id=p_product_id and k.knowledge_type=p_knowledge_type;
  insert into public.brand01_product_knowledge_versions(
    product_id,sku_id,knowledge_type,content,version,status,source_resource_id,source_url,
    source_reference,effective_from,effective_to,owner_id,created_by
  ) values (
    p_product_id,p_sku_id,p_knowledge_type,p_content,next_version,'pending_review',p_source_resource_id,
    nullif(btrim(p_source_url),''),nullif(btrim(p_source_reference),''),p_effective_from,p_effective_to,actor,actor
  ) returning * into created;
  return created;
end $$;


--
-- Name: brand01_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_products (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    product_code text NOT NULL,
    name text NOT NULL,
    category text,
    description text,
    lifecycle_status text DEFAULT 'draft'::text NOT NULL,
    owner_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    archived_at timestamp with time zone,
    archived_by text,
    CONSTRAINT brand01_products_archive_pair CHECK (((archived_at IS NULL) = (archived_by IS NULL))),
    CONSTRAINT brand01_products_code_not_blank CHECK (((btrim(product_code) <> ''::text) AND (length(product_code) <= 120))),
    CONSTRAINT brand01_products_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['draft'::text, 'active'::text, 'inactive'::text, 'archived'::text]))),
    CONSTRAINT brand01_products_name_check CHECK (((btrim(name) <> ''::text) AND (length(name) <= 200))),
    CONSTRAINT brand01_products_version_check CHECK ((version > 0))
);


--
-- Name: TABLE brand01_products; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brand01_products IS 'BRAND-01 review-only product catalog. Brand/platform relationships are many-to-many; binaries remain in provider storage.';


--
-- Name: brand01_admin_create_product(text, text, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_create_product(p_product_code text, p_name text, p_category text, p_internal_description text, p_owner_id text, p_brand_ids text[]) RETURNS public.brand01_products
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; created public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'BRAND01_ADMIN_REQUIRED';
  end if;
  if nullif(btrim(p_product_code), '') is null or nullif(btrim(p_name), '') is null
    or coalesce(cardinality(p_brand_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value) <> cardinality(p_brand_ids) then
    raise exception using errcode = '22023', message = 'BRAND01_DUPLICATE_BRAND_LINK';
  end if;
  if exists (select 1 from unnest(p_brand_ids) as requested(id)
      left join public.brands b on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null
      where b.id is null) then
    raise exception using errcode = '23503', message = 'BRAND01_BRAND_UNAVAILABLE';
  end if;
  insert into public.brand01_products(product_code,name,category,description,lifecycle_status,owner_id,created_by,updated_by)
  values (btrim(p_product_code),btrim(p_name),nullif(btrim(p_category),''),nullif(btrim(p_internal_description),''),'draft',coalesce(p_owner_id,actor),actor,actor)
  returning * into created;
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by) values(created.id,brand_id,actor,actor);
  end loop;
  return created;
end $$;


--
-- Name: brand01_product_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_product_skus (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    product_id text NOT NULL,
    sku_code text NOT NULL,
    variant_name text NOT NULL,
    size_or_package text,
    packaging_type text,
    lifecycle_status text DEFAULT 'active'::text NOT NULL,
    owner_id text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_product_skus_lifecycle_status_check CHECK ((lifecycle_status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]))),
    CONSTRAINT brand01_product_skus_sku_code_check CHECK (((btrim(sku_code) <> ''::text) AND (length(sku_code) <= 120))),
    CONSTRAINT brand01_product_skus_variant_name_check CHECK (((btrim(variant_name) <> ''::text) AND (length(variant_name) <= 200))),
    CONSTRAINT brand01_product_skus_version_check CHECK ((version > 0))
);


--
-- Name: brand01_admin_create_sku(text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_create_sku(p_product_id text, p_sku_code text, p_variant_name text, p_size_or_package text, p_packaging_type text, p_platform_mappings jsonb) RETURNS public.brand01_product_skus
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; created public.brand01_product_skus; mapping jsonb;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_sku_code),'') is null or nullif(btrim(p_variant_name),'') is null
    or p_product_id is null or (p_platform_mappings is not null and jsonb_typeof(p_platform_mappings)<>'array') then
    raise exception using errcode='22023', message='BRAND01_SKU_INPUT_INVALID';
  end if;
  if not exists(select 1 from public.brand01_products p where p.id=p_product_id and p.lifecycle_status<>'archived' and p.archived_at is null) then
    raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) e
    where nullif(btrim(e->>'platform_id'),'') is null or nullif(btrim(e->>'external_sku_id'),'') is null
      or not exists(select 1 from public.platforms p where p.id=e->>'platform_id' and p.status='active' and p.archived_at is null and p.deleted_at is null)
  ) then raise exception using errcode='23503', message='BRAND01_PLATFORM_MAPPING_INVALID'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)))
    <> (select count(distinct e->>'platform_id') from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) e) then
    raise exception using errcode='22023', message='BRAND01_PLATFORM_MAPPING_DUPLICATE';
  end if;
  insert into public.brand01_product_skus(product_id,sku_code,variant_name,size_or_package,packaging_type,owner_id,created_by,updated_by)
    values(p_product_id,btrim(p_sku_code),btrim(p_variant_name),nullif(btrim(p_size_or_package),''),nullif(btrim(p_packaging_type),''),actor,actor,actor)
    returning * into created;
  for mapping in select value from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) loop
    insert into public.brand01_product_platform_skus(sku_id,platform_id,external_sku_id,created_by)
      values(created.id,mapping->>'platform_id',btrim(mapping->>'external_sku_id'),actor);
  end loop;
  return created;
end $$;


--
-- Name: brand01_admin_replace_product_brands(text, text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_replace_product_brands(p_product_id text, p_brand_ids text[], p_expected_version integer) RETURNS public.brand01_products
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; current_product public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'BRAND01_ADMIN_REQUIRED';
  end if;
  if coalesce(cardinality(p_brand_ids),0)=0 or p_expected_version is null then
    raise exception using errcode = '22023', message = 'BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  select * into current_product from public.brand01_products where id=p_product_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'BRAND01_PRODUCT_NOT_FOUND'; end if;
  if current_product.version <> p_expected_version then raise exception using errcode = '40001', message = 'BRAND01_VERSION_CONFLICT'; end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value) <> cardinality(p_brand_ids)
    or exists (select 1 from unnest(p_brand_ids) as requested(id)
      left join public.brands b on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null where b.id is null) then
    raise exception using errcode = '23503', message = 'BRAND01_BRAND_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.brand01_campaign_product_skus cps
    join public.brand01_product_skus s on s.id=cps.sku_id
    join public.campaigns c on c.id=cps.campaign_id
    join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=c.brand_id
    where s.product_id=p_product_id and pb.is_active and not (c.brand_id = any(p_brand_ids))
  ) then raise exception using errcode = '23514', message = 'BRAND01_CAMPAIGN_BRAND_LINK_IN_USE'; end if;
  update public.brand01_product_brands set is_active=false,updated_by=actor,updated_at=statement_timestamp()
   where product_id=p_product_id and is_active and not (brand_id=any(p_brand_ids));
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by)
      values(p_product_id,brand_id,actor,actor)
      on conflict on constraint brand01_product_brands_pkey do update set is_active=true,updated_by=excluded.updated_by,updated_at=statement_timestamp();
  end loop;
  update public.brand01_products set version=version+1,updated_by=actor where id=p_product_id returning * into current_product;
  return current_product;
end $$;


--
-- Name: brand01_campaign_schemes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_campaign_schemes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    campaign_id text NOT NULL,
    sku_id text,
    scheme_name text NOT NULL,
    terms text NOT NULL,
    eligibility text,
    exclusions text,
    valid_from timestamp with time zone NOT NULL,
    valid_to timestamp with time zone NOT NULL,
    owner_id text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    source_resource_id text,
    source_url text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_campaign_scheme_approval CHECK (((status <> 'approved'::text) OR (((source_resource_id IS NOT NULL) OR (NULLIF(btrim(source_url), ''::text) IS NOT NULL)) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> owner_id)))),
    CONSTRAINT brand01_campaign_scheme_dates CHECK ((valid_to > valid_from)),
    CONSTRAINT brand01_campaign_schemes_scheme_name_check CHECK (((btrim(scheme_name) <> ''::text) AND (length(scheme_name) <= 200))),
    CONSTRAINT brand01_campaign_schemes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT brand01_campaign_schemes_version_check CHECK ((version > 0))
);


--
-- Name: brand01_admin_review_campaign_scheme(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_review_campaign_scheme(p_scheme_id text, p_decision text) RETURNS public.brand01_campaign_schemes
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; scheme public.brand01_campaign_schemes;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved','rejected') then raise exception using errcode='22023', message='BRAND01_SCHEME_DECISION_INVALID'; end if;
  select * into scheme from public.brand01_campaign_schemes where id=p_scheme_id for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_SCHEME_NOT_FOUND'; end if;
  if scheme.created_by=actor then raise exception using errcode='42501', message='BRAND01_INDEPENDENT_REVIEW_REQUIRED'; end if;
  update public.brand01_campaign_schemes set status=p_decision,reviewed_by=actor,reviewed_at=statement_timestamp(),
    updated_by=actor,updated_at=statement_timestamp(),version=version+1 where id=p_scheme_id returning * into scheme;
  return scheme;
end $$;


--
-- Name: brand01_user_brand_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_user_brand_access (
    grant_id text DEFAULT (gen_random_uuid())::text NOT NULL,
    user_id text NOT NULL,
    brand_id text NOT NULL,
    access_level text DEFAULT 'read'::text NOT NULL,
    granted_by text NOT NULL,
    granted_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    expires_at timestamp with time zone,
    revoked_at timestamp with time zone,
    revoked_by text,
    CONSTRAINT brand01_access_expiry_after_grant CHECK (((expires_at IS NULL) OR (expires_at > granted_at))),
    CONSTRAINT brand01_access_revoke_after_grant CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT brand01_user_brand_access_access_level_check CHECK ((access_level = 'read'::text))
);


--
-- Name: brand01_admin_set_brand_access(text, text, boolean, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_set_brand_access(p_user_id text, p_brand_id text, p_active boolean, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS public.brand01_user_brand_access
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; target public.business_users; current_access public.brand01_user_brand_access; result public.brand01_user_brand_access;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or p_brand_id is null then raise exception using errcode='22023', message='BRAND01_SCOPE_INPUT_INVALID'; end if;
  if p_expires_at is not null and p_expires_at <= statement_timestamp() then raise exception using errcode='22023', message='BRAND01_SCOPE_EXPIRY_INVALID'; end if;
  select * into target from public.business_users where id=p_user_id and status='active' and account_status='active' and archived_at is null and deleted_at is null;
  if not found then raise exception using errcode='P0002', message='BRAND01_SCOPE_USER_NOT_FOUND'; end if;
  if not exists(select 1 from public.brands where id=p_brand_id and status='active' and archived_at is null and deleted_at is null) then
    raise exception using errcode='P0002', message='BRAND01_SCOPE_BRAND_NOT_FOUND';
  end if;
  select * into current_access from public.brand01_user_brand_access where user_id=p_user_id and brand_id=p_brand_id and revoked_at is null for update;
  if p_active then
    if found then raise exception using errcode='23505', message='BRAND01_SCOPE_ALREADY_ACTIVE'; end if;
    insert into public.brand01_user_brand_access(user_id,brand_id,access_level,granted_by,expires_at)
      values(p_user_id,p_brand_id,'read',actor,p_expires_at) returning * into result;
  else
    if not found or current_access.revoked_at is not null then raise exception using errcode='P0002', message='BRAND01_SCOPE_NOT_ACTIVE'; end if;
    update public.brand01_user_brand_access set revoked_at=statement_timestamp(), revoked_by=actor
      where user_id=p_user_id and brand_id=p_brand_id returning * into result;
  end if;
  return result;
end $$;


--
-- Name: brand01_product_platform_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_product_platform_skus (
    sku_id text NOT NULL,
    platform_id text NOT NULL,
    external_sku_id text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_product_platform_skus_external_sku_id_check CHECK (((btrim(external_sku_id) <> ''::text) AND (length(external_sku_id) <= 160)))
);


--
-- Name: brand01_admin_set_sku_platform(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_set_sku_platform(p_sku_id text, p_platform_id text, p_external_sku_id text) RETURNS public.brand01_product_platform_skus
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; result public.brand01_product_platform_skus;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_external_sku_id),'') is null then raise exception using errcode='22023', message='BRAND01_PLATFORM_SKU_INVALID'; end if;
  if not exists(select 1 from public.brand01_product_skus where id=p_sku_id) then raise exception using errcode='P0002', message='BRAND01_SKU_NOT_FOUND'; end if;
  if not exists(select 1 from public.platforms where id=p_platform_id and status='active' and archived_at is null and deleted_at is null) then raise exception using errcode='P0002', message='BRAND01_PLATFORM_NOT_FOUND'; end if;
  insert into public.brand01_product_platform_skus(sku_id,platform_id,external_sku_id,created_by)
    values(p_sku_id,p_platform_id,btrim(p_external_sku_id),actor)
    on conflict(sku_id,platform_id) do update set external_sku_id=excluded.external_sku_id
    returning * into result;
  return result;
end $$;


--
-- Name: brand01_admin_update_product(text, integer, text, text, text, text, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_admin_update_product(p_product_id text, p_expected_version integer, p_product_code text, p_name text, p_category text, p_internal_description text, p_lifecycle_status text, p_brand_ids text[]) RETURNS public.brand01_products
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare actor text; current_product public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version <= 0 or nullif(btrim(p_product_code),'') is null
    or nullif(btrim(p_name),'') is null or p_lifecycle_status not in ('draft','active','inactive','archived')
    or coalesce(cardinality(p_brand_ids),0)=0 then
    raise exception using errcode='22023', message='BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  select * into current_product from public.brand01_products where id=p_product_id for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND'; end if;
  if current_product.version<>p_expected_version then raise exception using errcode='40001', message='BRAND01_VERSION_CONFLICT'; end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value)<>cardinality(p_brand_ids)
    or exists(select 1 from unnest(p_brand_ids) requested(id) left join public.brands b
      on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null where b.id is null) then
    raise exception using errcode='23503', message='BRAND01_BRAND_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.brand01_campaign_product_skus cps
    join public.brand01_product_skus s on s.id=cps.sku_id
    join public.campaigns c on c.id=cps.campaign_id
    where s.product_id=p_product_id and c.brand_id <> all(p_brand_ids)
  ) then raise exception using errcode='23514', message='BRAND01_CAMPAIGN_BRAND_LINK_IN_USE'; end if;
  update public.brand01_products set product_code=btrim(p_product_code),name=btrim(p_name),category=nullif(btrim(p_category),''),
    description=nullif(btrim(p_internal_description),''),lifecycle_status=p_lifecycle_status,
    version=version+1,updated_by=actor,updated_at=statement_timestamp(),
    archived_at=case when p_lifecycle_status='archived' then coalesce(archived_at,statement_timestamp()) else null end,
    archived_by=case when p_lifecycle_status='archived' then coalesce(archived_by,actor) else null end
    where id=p_product_id returning * into current_product;
  update public.brand01_product_brands as product_brand set is_active=false,updated_by=actor,updated_at=statement_timestamp()
    where product_brand.product_id=p_product_id and product_brand.is_active and not (product_brand.brand_id=any(p_brand_ids));
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by) values(p_product_id,brand_id,actor,actor)
    on conflict on constraint brand01_product_brands_pkey do update set is_active=true,updated_by=actor,updated_at=statement_timestamp();
  end loop;
  return current_product;
end $$;


--
-- Name: brand01_knowledge_approval_status(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.brand01_knowledge_approval_status(p_version_ids text[]) RETURNS TABLE(knowledge_version_id text, decision text, reviewed_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select k.id, r.decision, r.created_at
  from public.brand01_product_knowledge_versions k
  join lateral (
    select review.decision, review.created_at
    from public.brand01_knowledge_reviews review
    where review.knowledge_version_id=k.id
    order by review.created_at desc, review.id desc limit 1
  ) r on true
  where k.id=any(coalesce(p_version_ids, '{}'::text[]))
    and private.current_business_user_is_active()
    and (private.is_admin() or (r.decision='approved' and k.effective_from<=current_date
      and (k.effective_to is null or k.effective_to>=current_date)
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=k.product_id and pb.is_active and private.brand01_can_read_brand(pb.brand_id))))
$$;


--
-- Name: bulk_review_shift_registrations(text[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_review_shift_registrations(p_registration_ids text[], p_action text, p_notes text DEFAULT NULL::text) RETURNS TABLE(registration_id text, review_action text, success boolean, error_code text, error_message text, reviewed_registration jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  input_id text;
  reviewed public.shift_registrations;
  diagnostic_state text;
  diagnostic_message text;
  processed_ids text[] := array[]::text[];
begin
  -- Fail the whole request when the actor is not an active Leader/Admin.
  -- Row-level failures below are isolated only after authority is established.
  perform private.require_shift_actor(true);

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'REGISTRATION_REVIEW_ACTION_INVALID';
  end if;
  if p_registration_ids is null or cardinality(p_registration_ids) = 0 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_REQUIRED';
  end if;
  if cardinality(p_registration_ids) > 100 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_LIMIT_EXCEEDED';
  end if;

  -- Match the canonical single-review lock order (shift -> registration -> user)
  -- and acquire each group deterministically before processing the batch.
  -- This prevents two overlapping bulk requests from locking the same rows in
  -- opposite orders while keeping all validation inside the canonical RPCs.
  perform 1
  from public.shifts as shift
  where shift.id in (
    select distinct registration.shift_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
  )
  order by shift.id
  for update;

  perform 1
  from public.shift_registrations as registration
  where registration.id = any(p_registration_ids)
  order by registration.id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(staff.user_id, 91731))
  from (
    select distinct registration.user_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
    order by registration.user_id
  ) as staff;

  foreach input_id in array p_registration_ids loop
    input_id := btrim(coalesce(input_id, ''));
    if input_id = '' or input_id = any(processed_ids) then
      continue;
    end if;
    processed_ids := array_append(processed_ids, input_id);

    registration_id := input_id;
    review_action := p_action;
    begin
      if p_action = 'approve' then
        reviewed := public.approve_shift_registration(input_id, p_notes);
      else
        reviewed := public.reject_shift_registration(input_id, p_notes);
      end if;
      success := true;
      error_code := null;
      error_message := null;
      reviewed_registration := to_jsonb(reviewed);
      return next;
    exception when others then
      get stacked diagnostics
        diagnostic_state = returned_sqlstate,
        diagnostic_message = message_text;
      success := false;
      error_code := case
        when diagnostic_message in (
          'REGISTRATION_NOT_FOUND',
          'INVALID_REGISTRATION_TRANSITION',
          'SHIFT_NOT_OPEN',
          'SHIFT_FULL',
          'SHIFT_CONFLICT',
          'ALREADY_REGISTERED',
          'MULTI_ROLE_NOT_ALLOWED',
          'ROLE_NOT_QUALIFIED'
        ) then diagnostic_message
        else diagnostic_state
      end;
      error_message := case
        when diagnostic_message in (
          'REGISTRATION_NOT_FOUND',
          'INVALID_REGISTRATION_TRANSITION',
          'SHIFT_NOT_OPEN',
          'SHIFT_FULL',
          'SHIFT_CONFLICT',
          'ALREADY_REGISTERED',
          'MULTI_ROLE_NOT_ALLOWED',
          'ROLE_NOT_QUALIFIED'
        ) then diagnostic_message
        else 'REGISTRATION_REVIEW_FAILED'
      end;
      reviewed_registration := null;
      return next;
    end;
  end loop;
end;
$$;


--
-- Name: bulk_review_shift_registrations(text[], text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_review_shift_registrations(p_registration_ids text[], p_action text, p_notes text, p_expected_versions jsonb) RETURNS TABLE(registration_id text, review_action text, success boolean, error_code text, error_message text, reviewed_registration jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  input_id text;
  expected_text text;
  expected_version integer;
  current_registration public.shift_registrations;
  valid_ids text[] := array[]::text[];
  processed_ids text[] := array[]::text[];
begin
  perform private.require_shift_actor(true);

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'REGISTRATION_REVIEW_ACTION_INVALID';
  end if;
  if p_registration_ids is null or cardinality(p_registration_ids) = 0 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_REQUIRED';
  end if;
  if cardinality(p_registration_ids) > 100 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_LIMIT_EXCEEDED';
  end if;
  if p_expected_versions is null or jsonb_typeof(p_expected_versions) <> 'object' then
    raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED';
  end if;

  -- Match the existing bulk RPC lock order before checking any row version.
  perform 1
  from public.shifts as shift
  where shift.id in (
    select distinct registration.shift_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
  )
  order by shift.id
  for update;

  perform 1
  from public.shift_registrations as registration
  where registration.id = any(p_registration_ids)
  order by registration.id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(staff.user_id, 91731))
  from (
    select distinct registration.user_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
    order by registration.user_id
  ) as staff;

  foreach input_id in array p_registration_ids loop
    input_id := btrim(coalesce(input_id, ''));
    if input_id = '' or input_id = any(processed_ids) then
      continue;
    end if;
    processed_ids := array_append(processed_ids, input_id);
    registration_id := input_id;
    review_action := p_action;
    select * into current_registration
    from public.shift_registrations
    where id = input_id;
    if not found then
      success := false;
      error_code := 'REGISTRATION_NOT_FOUND';
      error_message := 'REGISTRATION_NOT_FOUND';
      reviewed_registration := null;
      return next;
      continue;
    end if;

    expected_text := p_expected_versions ->> input_id;
    begin
      if expected_text is null or expected_text !~ '^[1-9][0-9]*$' then
        raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED';
      end if;
      expected_version := expected_text::integer;
      perform private.assert_expected_version('ShiftRegistration', expected_version, current_registration.version);
      valid_ids := array_append(valid_ids, input_id);
    exception when others then
      success := false;
      error_code := case
        when sqlerrm in ('EXPECTED_VERSION_REQUIRED', 'STALE_WRITE') then sqlerrm
        else sqlstate
      end;
      error_message := case
        when sqlerrm in ('EXPECTED_VERSION_REQUIRED', 'STALE_WRITE') then sqlerrm
        else 'REGISTRATION_REVIEW_FAILED'
      end;
      reviewed_registration := null;
      return next;
    end;
  end loop;

  if cardinality(valid_ids) > 0 then
    return query
      select * from public.bulk_review_shift_registrations(valid_ids, p_action, p_notes);
  end if;
end;
$_$;


--
-- Name: cancel_own_shift_registration(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_own_shift_registration(p_registration_id text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift public.shifts;
  target_registration public.shift_registrations;
  was_staffed boolean;
begin
  actor_id := private.require_shift_actor(false);
  select shift_id into target_registration.shift_id
  from public.shift_registrations
  where id = p_registration_id and user_id = actor_id;
  if target_registration.shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;

  select * into target_shift from public.shifts
  where id = target_registration.shift_id and deleted_at is null and archived_at is null
  for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id and user_id = actor_id
  for update;

  if target_registration.source = 'manual_assignment'
     or target_registration.status = 'manually_assigned' then
    raise exception using errcode = 'P0001', message = 'MANUAL_ASSIGNMENT_REQUIRES_MANAGER_REMOVAL';
  end if;
  if target_registration.status not in ('pending', 'approved') then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  if target_shift.status <> 'scheduled'
    or target_shift.registration_locked
    or target_shift.registration_cutoff_at <= statement_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_CLOSED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id, 91731));
  was_staffed := target_registration.status = 'approved';
  update public.shift_registrations
  set status = 'cancelled', cancelled_at = statement_timestamp(),
      review_notes = coalesce(p_notes, review_notes)
  where id = p_registration_id
  returning * into target_registration;
  if was_staffed then
    perform private.refresh_shift_registration_lock(target_shift.id, true);
  end if;
  return target_registration;
end;
$$;


--
-- Name: FUNCTION cancel_own_shift_registration(p_registration_id text, p_notes text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.cancel_own_shift_registration(p_registration_id text, p_notes text) IS 'Self-cancel is limited to self-registered pending/approved registrations; manually assigned staffing must be removed via remove_shift_staffing.';


--
-- Name: cancel_own_shift_registration(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_own_shift_registration(p_registration_id text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.cancel_own_shift_registration(p_registration_id, p_notes);
end;
$$;


--
-- Name: cancel_own_shift_swap_request(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_own_shift_swap_request(p_request_id text, p_reason text DEFAULT NULL::text) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare actor_id text; request_row public.swap_requests; history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.requester_id <> actor_id then raise exception using errcode = '42501', message = 'SWAP_NOT_OWNER'; end if;
  if request_row.status not in ('pending', 'accepted') then raise exception using errcode = 'P0001', message = 'SWAP_NOT_CANCELLABLE'; end if;
  history_entry := jsonb_build_object(
    'action', 'cancelled', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', 'cancelled',
    'reason', coalesce(p_reason, request_row.reason), 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'cancelled', deleted_at = statement_timestamp(), deleted_by = actor_id,
      deletion_reason = coalesce(p_reason, deletion_reason), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;


--
-- Name: cancel_own_shift_swap_request(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_own_shift_swap_request(p_request_id text, p_reason text, p_expected_version integer) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.cancel_own_shift_swap_request(p_request_id, p_reason);
end;
$$;


--
-- Name: schedule_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_import_batches (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    source text NOT NULL,
    source_name text NOT NULL,
    status text DEFAULT 'previewed'::text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    invalid_rows integer DEFAULT 0 NOT NULL,
    warning_rows integer DEFAULT 0 NOT NULL,
    imported_rows integer DEFAULT 0 NOT NULL,
    duplicate_rows integer DEFAULT 0 NOT NULL,
    failed_rows integer DEFAULT 0 NOT NULL,
    retryable_rows integer DEFAULT 0 NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    confirmed_at timestamp with time zone,
    deleted_at timestamp with time zone,
    deleted_by text,
    deletion_reason text,
    CONSTRAINT schedule_import_batches_counts_nonnegative_check CHECK (((total_rows >= 0) AND (valid_rows >= 0) AND (invalid_rows >= 0) AND (warning_rows >= 0) AND (imported_rows >= 0) AND (duplicate_rows >= 0) AND (failed_rows >= 0) AND (retryable_rows >= 0))),
    CONSTRAINT schedule_import_batches_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT schedule_import_batches_source_check CHECK ((source = ANY (ARRAY['excel'::text, 'google_sheets'::text]))),
    CONSTRAINT schedule_import_batches_source_name_not_blank CHECK ((btrim(source_name) <> ''::text)),
    CONSTRAINT schedule_import_batches_status_check CHECK ((status = ANY (ARRAY['previewed'::text, 'confirmed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE schedule_import_batches; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schedule_import_batches IS 'S4A import batch registry: source file -> batch -> rows -> shifts traceability.';


--
-- Name: cancel_schedule_import_batch(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_schedule_import_batch(p_batch_id text, p_reason text DEFAULT NULL::text) RETURNS public.schedule_import_batches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  -- Confirmed batches must remain in history.
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_REMOVABLE';
  end if;

  update public.schedule_import_batches
  set status = 'cancelled',
      deleted_at = statement_timestamp(),
      deleted_by = v_actor_id,
      deletion_reason = nullif(p_reason, '')
  where id = p_batch_id;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;


--
-- Name: claim_operational_storage_drive_probe_rate_limit(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_operational_storage_drive_probe_rate_limit(p_actor_auth_user_id text, p_limit integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  changed integer;
  request_time timestamptz := statement_timestamp();
BEGIN
  IF nullif(btrim(p_actor_auth_user_id), '') IS NULL
    OR p_limit < 1 OR p_limit > 10
    OR p_window_seconds < 30 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STORAGE_PROBE_RATE_LIMIT_INPUT_INVALID';
  END IF;

  INSERT INTO public.operational_storage_drive_probe_rate_limits AS current_limit
    (actor_auth_user_id, window_started_at, request_count)
  VALUES (p_actor_auth_user_id, request_time, 1)
  ON CONFLICT (actor_auth_user_id) DO UPDATE
  SET window_started_at = CASE
        WHEN current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
          THEN request_time ELSE current_limit.window_started_at END,
      request_count = CASE
        WHEN current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
          THEN 1 ELSE current_limit.request_count + 1 END
  WHERE current_limit.window_started_at <= request_time - make_interval(secs => p_window_seconds)
    OR current_limit.request_count < p_limit;

  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;


--
-- Name: complete_account_request_provisioning(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
  v_email_verified boolean;
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.provisioning_status in ('invited', 'linked') then
    return v_request;
  end if;
  if v_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_APPROVED';
  end if;
  if v_request.provisioning_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS';
  end if;
  if p_provisioning_status not in ('invited', 'linked') then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_STATUS_INVALID';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  if v_request.staff_id is null or v_request.auth_user_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_IDENTITY_INCOMPLETE';
  end if;

  select auth_user.email_confirmed_at is not null
    into v_email_verified
  from auth.users as auth_user
  where auth_user.id = v_request.auth_user_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  update public.business_users as business_user
  set status = 'active',
      account_status = 'active',
      email_verified = v_email_verified
  where business_user.id = v_request.staff_id
    and business_user.auth_user_id = v_request.auth_user_id
    and lower(btrim(business_user.email)) = lower(btrim(v_request.email))
    and business_user.archived_at is null
    and business_user.deleted_at is null
    and business_user.account_status <> 'rejected';
  if not found then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_IDENTITY_CONFLICT';
  end if;

  update public.account_requests as request_row
  set provisioning_status = p_provisioning_status,
      provisioning_error_code = null,
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'approved'
    and request_row.provisioning_status = 'in_progress'
    and request_row.version = p_expected_version
  returning * into v_request;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  return v_request;
end;
$$;


--
-- Name: FUNCTION complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text) IS 'Server-only provisioning completion that activates the reconciled Staff profile and reflects Supabase Auth email confirmation.';


--
-- Name: confirm_attendance_import_batch(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_attendance_import_batch(p_batch_id text, p_actor_id text, p_expected_version integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_batch public.workforce_attendance_import_batches;
  v_actor public.business_users;
  v_row record;
  v_shift public.shifts;
  v_staff public.business_users;
  v_segment_id text;
  v_created_count integer := 0;
  v_reconciled_count integer := 0;
  v_skipped_count integer := 0;
  v_has_overlap boolean;
begin
  -- 1. Verify actor permissions
  select * into v_actor from public.business_users
  where id = p_actor_id and status = 'active';

  if v_actor.id is null or v_actor.system_permission not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_ATTENDANCE_ACTION';
  end if;

  -- 2. Concurrency Lock: Lock batch row FOR UPDATE
  select * into v_batch from public.workforce_attendance_import_batches
  where id = p_batch_id
  for update;

  if v_batch.id is null then
    raise exception using errcode = 'P0002', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;

  -- 3. Idempotent / Replay Protection
  if v_batch.status = 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BATCH_ALREADY_CONFIRMED',
      'batch_id', p_batch_id,
      'message', 'Batch has already been confirmed'
    );
  end if;

  if v_batch.status <> 'staged' then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_STAGED';
  end if;

  -- 4. Optimistic Version CAS check
  if p_expected_version is not null and v_batch.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'BATCH_VERSION_MISMATCH';
  end if;

  -- 5. Atomic Row-by-Row Re-verification and Insert
  for v_row in
    select * from public.workforce_attendance_import_rows
    where batch_id = p_batch_id and status = 'matched'
    order by source_row_number
    for update
  loop
    v_reconciled_count := v_reconciled_count + 1;

    -- 5a. Verify Shift is still completed
    select * into v_shift from public.shifts
    where id = v_row.matched_shift_id and status = 'completed';

    if v_shift.id is null then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'SHIFT_NOT_COMPLETED',
          exception_detail = 'Shift is not completed or does not exist',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5b. Verify Staff is still active
    select * into v_staff from public.business_users
    where id = v_row.matched_staff_id and status = 'active';

    if v_staff.id is null then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'STAFF_NOT_FOUND',
          exception_detail = 'Staff is not active or does not exist',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5c. Overlap Check with existing actual segments
    select exists (
      select 1 from public.workforce_actual_segments was
      where was.staff_id = v_row.matched_staff_id
        and was.review_status in ('draft', 'approved')
        and was.actual_start_at is not null
        and was.actual_end_at is not null
        and (v_row.resulting_segment_id is null or was.id <> v_row.resulting_segment_id)
        and greatest(v_row.parsed_start_at, was.actual_start_at) < least(v_row.parsed_end_at, was.actual_end_at)
    ) into v_has_overlap;

    if v_has_overlap then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'OVERLAP_CONFLICT',
          exception_detail = 'Actual work interval overlaps with an existing segment',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5d. Insert into workforce_actual_segments as DRAFT (Independent 4-eyes review)
    insert into public.workforce_actual_segments (
      shift_id,
      staff_id,
      operational_role,
      event_kind,
      coverage_kind,
      actual_start_at,
      actual_end_at,
      review_status,
      evidence_note,
      created_by,
      reviewed_by,
      reviewed_at,
      review_note
    ) values (
      v_row.matched_shift_id,
      v_row.matched_staff_id,
      v_row.operational_role,
      'worked',
      coalesce(v_row.coverage_kind, 'planned'),
      v_row.parsed_start_at,
      v_row.parsed_end_at,
      'draft',
      substring('Imported from staged batch #' || p_batch_id || ' row ' || v_row.source_row_number || ': ' || coalesce(v_row.raw_notes, 'Xác nhận chấm công hợp lệ') from 1 for 2000),
      p_actor_id,
      null,
      null,
      null
    ) returning id into v_segment_id;

    -- 5e. Update row provenance
    update public.workforce_attendance_import_rows
    set status = 'drafted',
        resulting_segment_id = v_segment_id,
        updated_at = statement_timestamp()
    where id = v_row.id;

    v_created_count := v_created_count + 1;
  end loop;

  -- 6. Update Batch status to confirmed with atomic version increment
  update public.workforce_attendance_import_batches
  set status = 'confirmed',
      drafted_segments = v_created_count,
      version = v_batch.version + 1,
      updated_at = statement_timestamp()
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'created_count', v_created_count,
    'reconciled_count', v_reconciled_count,
    'skipped_count', v_skipped_count,
    'version', v_batch.version + 1,
    'message', 'Đã tạo ' || v_created_count || ' bản ghi Actual Staffing (DRAFT) từ batch #' || p_batch_id || ' chờ kiểm duyệt độc lập'
  );
end;
$$;


--
-- Name: confirm_schedule_import_batch(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_schedule_import_batch(p_batch_id text) RETURNS public.schedule_import_batches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;

  -- Confirmation is safe to replay. The first call performs the existing
  -- pending-row finalization; later calls only return the persisted batch and
  -- never create or relink operational shifts.
  if v_batch.status = 'confirmed' then
    if exists (
      select 1
      from public.schedule_import_batch_rows
      where batch_id = p_batch_id
        and outcome in ('pending', 'retryable')
    ) then
      raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_UNRESOLVED_ROWS';
    end if;
    perform private.sync_schedule_import_batch_counts(p_batch_id);
    select * into v_batch from public.schedule_import_batches where id = p_batch_id;
    return v_batch;
  end if;
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  if exists (
    select 1
    from public.schedule_import_batch_rows
    where batch_id = p_batch_id
      and outcome in ('retryable', 'pending')
      and (
        outcome = 'retryable'
        or coalesce(
          case when jsonb_typeof(source_row->'errors') = 'array'
            then jsonb_array_length(source_row->'errors') else 0 end,
          0
        ) = 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_UNRESOLVED_ROWS';
  end if;

  update public.schedule_import_batches
  set status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, statement_timestamp())
  where id = p_batch_id;
  update public.schedule_import_batch_rows
  set outcome = case
    when coalesce(
      case when jsonb_typeof(source_row->'errors') = 'array'
        then jsonb_array_length(source_row->'errors') else 0 end,
      0
    ) > 0 then 'validation_failed'
    else 'duplicate_skipped'
  end
  where batch_id = p_batch_id and outcome = 'pending';
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;


--
-- Name: FUNCTION confirm_schedule_import_batch(p_batch_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.confirm_schedule_import_batch(p_batch_id text) IS 'Idempotent schedule import confirmation; replay returns the existing batch.';


--
-- Name: dashboard_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_updates (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    shift_id text NOT NULL,
    "time" timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    revenue numeric DEFAULT 0 NOT NULL,
    gmv numeric,
    orders integer DEFAULT 0 NOT NULL,
    peak_viewers integer DEFAULT 0 NOT NULL,
    current_viewers integer DEFAULT 0 NOT NULL,
    total_views integer,
    total_viewers integer,
    likes integer,
    comments integer,
    shares integer,
    screenshot_url text,
    screenshot_storage_path text,
    dashboard_platform text DEFAULT 'other'::text NOT NULL,
    normalized_metrics jsonb,
    ocr_review jsonb,
    raw_ocr_output text,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    screenshot_file_id text,
    CONSTRAINT dashboard_updates_platform_check CHECK ((dashboard_platform = ANY (ARRAY['tiktok_shop'::text, 'shopee_live'::text, 'other'::text]))),
    CONSTRAINT dashboard_updates_revenue_check CHECK ((revenue >= (0)::numeric)),
    CONSTRAINT dashboard_updates_screenshot_file_reference_check CHECK (((screenshot_file_id IS NULL) OR ((screenshot_storage_path = ((('dashboard/'::text || shift_id) || '/'::text) || screenshot_file_id)) AND (screenshot_url = ('/api/dashboard-screenshots?file_id='::text || screenshot_file_id))))),
    CONSTRAINT dashboard_updates_screenshot_path_check CHECK (((screenshot_storage_path IS NULL) OR (screenshot_storage_path ~~ 'dashboard/%'::text)))
);


--
-- Name: create_dashboard_update(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_dashboard_update(p_data jsonb) RETURNS public.dashboard_updates
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  actor_id text;
  created_row public.dashboard_updates;
  screenshot_file public.operational_files;
  shift_key text := nullif(btrim(p_data ->> 'shift_id'), '');
  screenshot_file_key text := nullif(btrim(p_data ->> 'screenshot_file_id'), '');
  screenshot_url_value text := nullif(p_data ->> 'screenshot_url', '');
  screenshot_path_value text := nullif(p_data ->> 'screenshot_storage_path', '');
begin
  actor_id := private.require_shift_actor(true);
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
$_$;


--
-- Name: create_report(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_report(p_data jsonb) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: create_schedule_import_batch(text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_schedule_import_batch(p_source text, p_source_name text, p_summary jsonb, p_rows jsonb DEFAULT '[]'::jsonb) RETURNS public.schedule_import_batches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  if p_source not in ('excel', 'google_sheets') then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_INVALID';
  end if;
  if p_source_name is null or btrim(p_source_name) = '' then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_NAME_REQUIRED';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'IMPORT_SUMMARY_INVALID';
  end if;

  insert into public.schedule_import_batches (
    source, source_name, status,
    total_rows, valid_rows, invalid_rows, warning_rows, duplicate_rows,
    created_by
  ) values (
    p_source,
    btrim(p_source_name),
    'previewed',
    private.schedule_import_summary_value(p_summary, 'total_rows'),
    private.schedule_import_summary_value(p_summary, 'valid_rows'),
    private.schedule_import_summary_value(p_summary, 'invalid_rows'),
    private.schedule_import_summary_value(p_summary, 'warning_rows'),
    private.schedule_import_summary_value(p_summary, 'duplicate_rows'),
    v_actor_id
  ) returning * into v_batch;

  perform private.insert_schedule_import_batch_rows(v_batch.id, p_rows);
  select * into v_batch from public.schedule_import_batches where id = v_batch.id;
  return v_batch;
end;
$$;


--
-- Name: create_shift(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_shift(p_data jsonb) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  created_shift public.shifts;
  settings_row public.system_settings;
  input_key text;
  initial_user_id text;
  role_name text;
  effective_source text;
begin
  actor_id := private.require_shift_actor(true);
  select * into settings_row from public.system_settings limit 1;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  for input_key in select jsonb_object_keys(p_data)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'timezone', 'brand_id', 'platform_id',
      'campaign_id', 'title', 'studio', 'host_id', 'support_id', 'technical_id',
      'host_names', 'assistant_names', 'technical_names',
      'required_host_count', 'required_support_count', 'required_technical_count',
      'registration_cutoff_at', 'allow_multi_role', 'import_batch_id', 'status',
      'live_link', 'product_notes', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
  end loop;
  if (p_data ? 'execution_source' and p_data->>'execution_source' is not null
    and p_data->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_data ? 'agency_code' and p_data->>'agency_code' is not null
    and p_data->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  effective_source := coalesce(nullif(p_data->>'execution_source', ''),
    case p_data->>'agency_code' when 'ada' then 'internal' when 'snap' then 'agency' when 'live_ai' then 'agency' else null end);
  if (p_data->>'agency_code' is not null and effective_source is distinct from
    case p_data->>'agency_code' when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;
  if p_data ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_data->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  if (p_data ? 'host_names' and jsonb_typeof(p_data->'host_names') <> 'array')
    or (p_data ? 'assistant_names' and jsonb_typeof(p_data->'assistant_names') <> 'array')
    or (p_data ? 'technical_names' and jsonb_typeof(p_data->'technical_names') <> 'array')
  then
    raise exception using errcode = '22023', message = 'SHIFT_STAFFING_NAMES_INVALID';
  end if;

  insert into public.shifts (
    date, start_time, end_time, timezone, brand_id, platform_id, campaign_id,
    title, studio, host_names, assistant_names, technical_names,
    required_host_count, required_support_count, required_technical_count,
    registration_cutoff_at, allow_multi_role, import_batch_id, status,
    live_link, product_notes, updated_by, execution_source, agency_code, supplemental_fields
  ) values (
    (p_data->>'date')::date,
    (p_data->>'start_time')::time,
    (p_data->>'end_time')::time,
    coalesce(nullif(p_data->>'timezone', ''), 'Asia/Ho_Chi_Minh'),
    nullif(p_data->>'brand_id', ''),
    nullif(p_data->>'platform_id', ''),
    nullif(p_data->>'campaign_id', ''),
    nullif(p_data->>'title', ''),
    nullif(p_data->>'studio', ''),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'host_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'assistant_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'technical_names', '[]'::jsonb)) as names(value)),
    private.normalize_shift_capacity(p_data->>'required_host_count', settings_row.default_host_count),
    private.normalize_shift_capacity(p_data->>'required_support_count', settings_row.default_support_count),
    private.normalize_shift_capacity(p_data->>'required_technical_count', settings_row.default_technical_count),
    nullif(p_data->>'registration_cutoff_at', '')::timestamptz,
    coalesce((p_data->>'allow_multi_role')::boolean, settings_row.allow_multi_role_per_shift),
    nullif(p_data->>'import_batch_id', ''),
    coalesce(nullif(p_data->>'status', ''), 'scheduled'),
    nullif(p_data->>'live_link', ''),
    nullif(p_data->>'product_notes', ''),
    actor_id,
    effective_source,
    p_data->>'agency_code',
    coalesce(p_data->'supplemental_fields', '{}'::jsonb)
  ) returning * into created_shift;

  foreach role_name in array array['host', 'support', 'technical']::text[]
  loop
    initial_user_id := nullif(p_data->>(role_name || '_id'), '');
    if initial_user_id is not null then
      perform private.insert_manual_shift_assignment(
        created_shift.id, initial_user_id, role_name, actor_id, 'Initial shift assignment', false
      );
    end if;
  end loop;

  update public.shifts set registration_locked = false where id = created_shift.id;
  select * into created_shift from public.shifts where id = created_shift.id;
  return created_shift;
end;
$$;


--
-- Name: create_shift_swap_request(text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_shift_swap_request(p_source_registration_id text, p_mode text, p_reason text, p_target_shift_id text, p_replacement_staff_id text, p_counterpart_registration_id text, p_notes text) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  source_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  counterpart_registration public.shift_registrations;
  replacement_user public.business_users;
  counterpart_user public.business_users;
  created_request public.swap_requests;
  role_name text;
  history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  if p_mode not in ('replacement', 'exchange') then
    raise exception using errcode = '22023', message = 'SWAP_MODE_NOT_CREATABLE';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception using errcode = '22023', message = 'SWAP_REASON_REQUIRED';
  end if;
  if p_mode = 'replacement' and (
    p_target_shift_id is not null
    or p_counterpart_registration_id is not null
    or p_replacement_staff_id is null
  ) then
    raise exception using errcode = '22023', message = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
  end if;
  if p_mode = 'exchange' and (
    p_target_shift_id is null
    or p_counterpart_registration_id is null
    or p_replacement_staff_id is not null
  ) then
    raise exception using errcode = '22023', message = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  end if;

  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if source_registration.id is null then
    raise exception using errcode = 'P0001', message = 'SOURCE_REGISTRATION_NOT_FOUND';
  end if;
  if p_mode = 'exchange' then
    select * into counterpart_registration
    from public.shift_registrations
    where id = p_counterpart_registration_id;
  end if;

  perform private.lock_swap_registrations(array_remove(array[
    p_source_registration_id,
    case when p_mode = 'exchange' then p_counterpart_registration_id end
  ]::text[], null));
  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if p_mode = 'exchange' then
    select * into counterpart_registration
    from public.shift_registrations
    where id = p_counterpart_registration_id;
  end if;
  perform private.lock_swap_shifts(array_remove(array[
    source_registration.shift_id,
    case when p_mode = 'exchange' then p_target_shift_id end
  ]::text[], null));
  perform private.lock_swap_rows(array_remove(array[
    'user:' || actor_id,
    case when p_mode = 'replacement' then 'user:' || p_replacement_staff_id end,
    case when p_mode = 'exchange' then 'user:' || counterpart_registration.user_id end
  ]::text[], null));
  perform private.lock_swap_users(array_remove(array[
    actor_id,
    case when p_mode = 'replacement' then p_replacement_staff_id end,
    case when p_mode = 'exchange' then counterpart_registration.user_id end
  ]::text[], null));

  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if source_registration.id is null then
    raise exception using errcode = 'P0001', message = 'SOURCE_REGISTRATION_NOT_FOUND';
  end if;
  if source_registration.user_id <> actor_id then
    raise exception using errcode = '42501', message = 'SWAP_NOT_OWNER';
  end if;
  if source_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_NOT_ACTIVE';
  end if;
  select * into source_shift from public.shifts where id = source_registration.shift_id;
  if source_shift.id is null or source_shift.deleted_at is not null or source_shift.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'SOURCE_SHIFT_NOT_FOUND';
  end if;
  if source_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SOURCE_SHIFT_NOT_SCHEDULED';
  end if;
  role_name := source_registration.operational_role;
  perform private.assert_shift_role_eligibility(actor_id, role_name);

  if exists (
    select 1 from public.swap_requests
    where source_registration_id = source_registration.id
      and status in ('pending', 'accepted', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_ACTIVE_SWAP';
  end if;

  if p_mode = 'replacement' then
    if p_replacement_staff_id = actor_id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_SELF_NOT_ALLOWED';
    end if;
    select * into replacement_user
    from public.business_users
    where id = p_replacement_staff_id;
    if replacement_user.id is null or replacement_user.status <> 'active' or replacement_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(replacement_user.id, role_name);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id
        and user_id = replacement_user.id
        and status in ('approved', 'manually_assigned')
    ) then
      raise exception using errcode = '23505', message = 'REPLACEMENT_ALREADY_ASSIGNED';
    end if;
    perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(replacement_user.id, source_shift, role_name, null);
  else
    if p_target_shift_id = source_shift.id then
      raise exception using errcode = '22023', message = 'SWAP_SAME_SHIFT_EXCHANGE_NOT_ALLOWED';
    end if;
    select * into target_shift from public.shifts where id = p_target_shift_id;
    select * into counterpart_registration from public.shift_registrations where id = p_counterpart_registration_id;
    if target_shift.id is null or target_shift.deleted_at is not null or target_shift.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_FOUND';
    end if;
    if target_shift.status <> 'scheduled' then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_SCHEDULED';
    end if;
    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_NOT_ACTIVE';
    end if;
    if counterpart_registration.shift_id <> target_shift.id then
      raise exception using errcode = '22023', message = 'COUNTERPART_SHIFT_MISMATCH';
    end if;
    if counterpart_registration.operational_role <> role_name then
      raise exception using errcode = '22023', message = 'SWAP_ROLE_MISMATCH';
    end if;
    if counterpart_registration.user_id = actor_id then
      raise exception using errcode = '22023', message = 'SWAP_SELF_EXCHANGE_NOT_ALLOWED';
    end if;
    select * into counterpart_user from public.business_users where id = counterpart_registration.user_id;
    if counterpart_user.id is null or counterpart_user.status <> 'active' or counterpart_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(counterpart_user.id, role_name);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    perform private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
    perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(actor_id, target_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(counterpart_user.id, source_shift, role_name, counterpart_registration.id);
  end if;

  insert into public.swap_requests (
    requester_id, source_registration_id, source_shift_id, target_shift_id,
    counterpart_registration_id, counterpart_id, operational_role, mode, status,
    reason, notes, shift_id, original_staff_id, replacement_staff_id,
    new_host_id, new_support_id, new_technical_id, approval_history
  ) values (
    actor_id, source_registration.id, source_shift.id,
    case when p_mode = 'exchange' then target_shift.id else null end,
    case when p_mode = 'exchange' then counterpart_registration.id else null end,
    case when p_mode = 'exchange' then counterpart_registration.user_id else null end,
    role_name, p_mode, 'pending', btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    source_shift.id, actor_id,
    case when p_mode = 'replacement' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'host' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'support' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'technical' then replacement_user.id else null end,
    '[]'::jsonb
  ) returning * into created_request;

  history_entry := jsonb_build_object(
    'action', 'created', 'actor_id', actor_id, 'requester_id', actor_id,
    'counterpart_id', created_request.counterpart_id,
    'replacement_staff_id', created_request.replacement_staff_id,
    'source_registration_id', created_request.source_registration_id,
    'counterpart_registration_id', created_request.counterpart_registration_id,
    'source_shift_id', created_request.source_shift_id, 'target_shift_id', created_request.target_shift_id,
    'mode', created_request.mode, 'operational_role', created_request.operational_role,
    'from_status', null, 'to_status', 'pending', 'reason', created_request.reason,
    'at', statement_timestamp()
  );
  update public.swap_requests
  set approval_history = jsonb_build_array(history_entry)
  where id = created_request.id
  returning * into created_request;
  return created_request;
end
$$;


--
-- Name: create_staff_member(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_staff_member(p_data jsonb) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_permission text;
  v_roles text[];
  v_status text;
  v_account_status text;
  v_result public.business_users;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'status',
      'account_status', 'email_verified', 'auth_provider', 'join_date'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;
  if nullif(btrim(p_data ->> 'email'), '') is null
    or nullif(btrim(p_data ->> 'full_name'), '') is null
  then
    raise exception using errcode = '22023', message = 'STAFF_REQUIRED_FIELDS_MISSING';
  end if;

  v_permission := coalesce(nullif(btrim(p_data ->> 'system_permission'), ''), 'member');
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'STAFF_SYSTEM_PERMISSION_INVALID';
  end if;

  if p_data ? 'operational_roles' and jsonb_typeof(p_data -> 'operational_roles') <> 'array' then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;
  select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
    into v_roles
    from jsonb_array_elements_text(coalesce(p_data -> 'operational_roles', '[]'::jsonb))
      with ordinality as roles(role_value, ordinal);
  if not (v_roles <@ array['host', 'support', 'technical']::text[]) then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;

  v_status := coalesce(nullif(btrim(p_data ->> 'status'), ''), 'active');
  if v_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'STAFF_STATUS_INVALID';
  end if;
  v_account_status := coalesce(nullif(btrim(p_data ->> 'account_status'), ''), 'active');
  if v_account_status not in ('pending_email_verification', 'pending_approval', 'rejected', 'active') then
    raise exception using errcode = '22023', message = 'STAFF_ACCOUNT_STATUS_INVALID';
  end if;

  insert into public.business_users (
    id, email, full_name, avatar_url, avatar_storage_path, phone, role,
    system_permission, operational_roles, department, status, account_status,
    email_verified, auth_provider, join_date
  ) values (
    gen_random_uuid()::text,
    lower(btrim(p_data ->> 'email')),
    btrim(p_data ->> 'full_name'),
    nullif(btrim(p_data ->> 'avatar_url'), ''),
    nullif(btrim(p_data ->> 'avatar_storage_path'), ''),
    nullif(btrim(p_data ->> 'phone'), ''),
    case when v_permission = 'member' then 'staff' else v_permission end,
    v_permission,
    v_roles,
    nullif(btrim(p_data ->> 'department'), ''),
    v_status,
    v_account_status,
    coalesce((p_data ->> 'email_verified')::boolean, false),
    nullif(btrim(p_data ->> 'auth_provider'), ''),
    coalesce((p_data ->> 'join_date')::date, current_date)
  ) returning * into v_result;

  return v_result;
end;
$$;


--
-- Name: FUNCTION create_staff_member(p_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_staff_member(p_data jsonb) IS 'Admin-only staff creation. Does not create or modify an auth.users identity.';


--
-- Name: create_staff_member_with_auth(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_staff_member_with_auth(p_auth_user_id uuid, p_data jsonb) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_email text;
  v_permission text;
  v_roles text[];
  v_result public.business_users;
  v_auth_email text;
begin
  if p_auth_user_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'join_date'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;

  v_email := lower(btrim(p_data ->> 'email'));
  if v_email is null or v_email = '' or nullif(btrim(p_data ->> 'full_name'), '') is null then
    raise exception using errcode = '22023', message = 'STAFF_REQUIRED_FIELDS_MISSING';
  end if;

  select lower(btrim(email)) into v_auth_email from auth.users where id = p_auth_user_id;
  if v_auth_email is null or v_auth_email <> v_email then
    raise exception using errcode = '22023', message = 'STAFF_AUTH_EMAIL_MISMATCH';
  end if;
  if exists (select 1 from public.business_users where auth_user_id = p_auth_user_id)
    or exists (select 1 from public.business_users where lower(email) = v_email) then
    raise exception using errcode = '23505', message = 'STAFF_ACCOUNT_ALREADY_LINKED';
  end if;

  v_permission := coalesce(nullif(btrim(p_data ->> 'system_permission'), ''), 'member');
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'STAFF_SYSTEM_PERMISSION_INVALID';
  end if;
  if p_data ? 'operational_roles' and jsonb_typeof(p_data -> 'operational_roles') <> 'array' then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;
  select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
    into v_roles
    from jsonb_array_elements_text(coalesce(p_data -> 'operational_roles', '[]'::jsonb))
      with ordinality as roles(role_value, ordinal);
  if not (v_roles <@ array['host', 'support', 'technical']::text[]) then
    raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
  end if;

  insert into public.business_users (
    id, auth_user_id, email, full_name, avatar_url, avatar_storage_path, phone,
    role, system_permission, operational_roles, department, status, account_status,
    email_verified, auth_provider, join_date
  ) values (
    gen_random_uuid()::text, p_auth_user_id, v_email, btrim(p_data ->> 'full_name'),
    nullif(btrim(p_data ->> 'avatar_url'), ''), nullif(btrim(p_data ->> 'avatar_storage_path'), ''),
    nullif(btrim(p_data ->> 'phone'), ''), case when v_permission = 'member' then 'staff' else v_permission end,
    v_permission, v_roles, nullif(btrim(p_data ->> 'department'), ''), 'inactive', 'pending_approval',
    false, 'email', coalesce((p_data ->> 'join_date')::date, current_date)
  ) returning * into v_result;

  return v_result;
end;
$$;


--
-- Name: FUNCTION create_staff_member_with_auth(p_auth_user_id uuid, p_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_staff_member_with_auth(p_auth_user_id uuid, p_data jsonb) IS 'Admin-only Core V1 account creation. Links an existing Auth identity without accepting client actor identity.';


--
-- Name: delete_dashboard_update(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_dashboard_update(p_update_id text, p_reason text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: ensure_account_request_identity(uuid, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text DEFAULT NULL::text) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
  v_staff public.business_users;
  v_auth_email text;
  v_auth_metadata jsonb;
  v_email text;
  v_staff_count integer;
  v_auth_provider text;
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.status <> 'approved' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_APPROVED';
  end if;
  if v_request.provisioning_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  if p_auth_user_id is null then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  v_email := lower(btrim(v_request.email));
  select lower(btrim(email)), coalesce(raw_app_meta_data, '{}'::jsonb)
    into v_auth_email, v_auth_metadata
  from auth.users
  where id = p_auth_user_id;
  if not found or v_auth_email is null or v_auth_email = '' then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;
  if v_auth_email <> v_email then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
  end if;
  if nullif(btrim(v_auth_metadata ->> 'business_user_id'), '') is not null then
    if p_staff_id is not null and v_auth_metadata ->> 'business_user_id' <> p_staff_id then
      raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
    end if;
    if p_staff_id is null and not exists (
      select 1
      from public.business_users as metadata_staff
      where metadata_staff.id = v_auth_metadata ->> 'business_user_id'
        and lower(btrim(metadata_staff.email)) = v_email
    ) then
      raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
    end if;
  end if;

  v_auth_provider := case when exists (
    select 1 from auth.identities
    where user_id = p_auth_user_id and provider = 'google'
  ) then 'google' else 'email' end;

  if p_staff_id is not null and btrim(p_staff_id) <> '' then
    select staff_row.*
      into v_staff
    from public.business_users as staff_row
    where staff_row.id = p_staff_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'ACCOUNT_STAFF_NOT_FOUND';
    end if;
    if lower(btrim(v_staff.email)) <> v_email then
      raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
    end if;
    if v_staff.archived_at is not null or v_staff.deleted_at is not null then
      raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
    end if;
    if v_staff.status <> 'active' or v_staff.account_status = 'rejected' then
      raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_INACTIVE';
    end if;
    if v_staff.auth_user_id is not null and v_staff.auth_user_id <> p_auth_user_id then
      raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
    end if;
  else
    select count(*) into v_staff_count
    from public.business_users as staff_row
    where lower(btrim(staff_row.email)) = v_email;
    if v_staff_count > 1 then
      raise exception using errcode = '23505', message = 'ACCOUNT_EMAIL_AMBIGUOUS';
    end if;
    if v_staff_count = 1 then
      select staff_row.*
        into v_staff
      from public.business_users as staff_row
      where lower(btrim(staff_row.email)) = v_email
      for update;
      if v_staff.archived_at is not null or v_staff.deleted_at is not null then
        raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
      end if;
      if v_staff.status <> 'active' or v_staff.account_status = 'rejected' then
        raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_INACTIVE';
      end if;
      if v_staff.auth_user_id is not null and v_staff.auth_user_id <> p_auth_user_id then
        raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.business_users
    where auth_user_id = p_auth_user_id
      and (v_staff.id is null or id <> v_staff.id)
  ) then
    raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
  end if;

  if v_staff.id is null then
    select created_staff.*
      into v_staff
    from public.create_staff_member_with_auth(
      p_auth_user_id,
      jsonb_build_object(
        'email', v_email,
        'full_name', btrim(v_request.full_name),
        'phone', nullif(btrim(v_request.phone), ''),
        'department', nullif(btrim(v_request.department), '')
      )
    ) as created_staff;
    if v_staff.id is null or not exists (
      select 1
      from public.business_users as created_user
      where created_user.id = v_staff.id
        and created_user.auth_user_id = p_auth_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_FAILED';
    end if;
    if v_auth_provider = 'google' then
      update public.business_users
      set auth_provider = 'google'
      where id = v_staff.id
      returning * into v_staff;
    end if;
  elsif v_staff.auth_user_id is null then
    update public.business_users
    set auth_user_id = p_auth_user_id,
        auth_provider = v_auth_provider
    where id = v_staff.id
    returning * into v_staff;
  end if;

  update public.account_requests as request_row
  set staff_id = v_staff.id,
      auth_user_id = p_auth_user_id,
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'approved'
    and request_row.provisioning_status = 'in_progress'
    and request_row.version = p_expected_version
  returning * into v_request;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  return v_request;
end;
$$;


--
-- Name: FUNCTION ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text) IS 'Admin-only request-scoped Staff/Auth reconciliation. New identities default to member.';


--
-- Name: fail_account_request_provisioning(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_actor_id text := private.require_staff_admin();
  v_request public.account_requests;
  v_error_code text := upper(btrim(coalesce(p_error_code, '')));
begin
  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;
  if v_request.provisioning_status = 'failed' then
    return v_request;
  end if;
  if v_request.provisioning_status <> 'in_progress' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_NOT_IN_PROGRESS';
  end if;
  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  if v_error_code !~ '^[A-Z0-9_]{1,80}$' then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_ERROR_CODE_INVALID';
  end if;

  update public.account_requests as request_row
  set provisioning_status = 'failed',
      provisioning_error_code = v_error_code,
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.provisioning_status = 'in_progress'
    and request_row.version = p_expected_version
  returning * into v_request;
  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_PROVISIONING_STALE';
  end if;
  return v_request;
end;
$_$;


--
-- Name: FUNCTION fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text) IS 'Admin-only safe provisioning failure transition with a machine-readable error code.';


--
-- Name: fail_schedule_import_batch(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_schedule_import_batch(p_batch_id text) RETURNS public.schedule_import_batches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  update public.schedule_import_batches
  set status = 'failed'
  where id = p_batch_id;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;


--
-- Name: get_account_request(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_account_request(p_request_id uuid) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_request public.account_requests;
begin
  perform private.require_staff_admin();
  select request_row.* into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id;
  return v_request;
end;
$$;


--
-- Name: FUNCTION get_account_request(p_request_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_account_request(p_request_id uuid) IS 'Admin-only Account Request detail read boundary; no approval mutation.';


--
-- Name: get_analytics_snapshot(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_analytics_snapshot(p_filters jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
declare start_date date; end_date date; previous_start date; days integer; filter_key text; result jsonb;
  empty_metrics jsonb:='{"revenue":null,"gmv":null,"orders":null,"viewers":null,"productClicks":null,"ctr":null,"cvr":null,"averageOrderValue":null,"liveDuration":null,"reportCount":0}'::jsonb;
begin
  if private.current_business_user_id() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or not p_filters ? 'from' or not p_filters ? 'to'
    or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  for filter_key in select jsonb_object_keys(p_filters) loop
    if filter_key not in ('from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds') then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
  end loop;
  start_date:=(p_filters->>'from')::date; end_date:=(p_filters->>'to')::date;
  if start_date>end_date then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  days:=end_date-start_date+1; previous_start:=start_date-days;
  with scoped as materialized (
    select s.* from private.filtered_shift_ids('all',jsonb_set(jsonb_set(p_filters,'{from}',to_jsonb(previous_start::text)),'{to}',to_jsonb(end_date::text))) ids
    join public.shifts s on s.id=ids.id
  ), staffed as materialized (
    select s.id shift_id,a.user_id,a.role from scoped s
    cross join lateral (values (s.host_id,'host'),(s.support_id,'support'),(s.technical_id,'technical')) a(user_id,role) where a.user_id is not null
    union
    select s.id,r.user_id,r.operational_role::text from scoped s join public.shift_registrations r on r.shift_id=s.id
      where r.status in ('approved','manually_assigned')
  ), report_values as materialized (
    select r.id,s.id shift_id,s.date,s.brand_id,s.platform_id,s.campaign_id,
      private.rc16k_report_metric(r,'revenue') revenue,private.rc16k_report_metric(r,'gmv') gmv,
      private.rc16k_report_metric(r,'orders') orders,private.rc16k_report_metric(r,'engaged_viewers') viewers,
      private.rc16k_report_metric(r,'product_clicks') clicks,private.rc16k_report_metric(r,'ctr') ctr,
      private.rc16k_report_metric(r,'conversion_rate') cvr,private.rc16k_report_metric(r,'live_duration_seconds') duration
    from public.reports r join scoped s on s.id=r.shift_id
    where r.status='confirmed' and r.metrics_confirmed and r.deleted_at is null and r.archived_at is null
  ), grouped as materialized (
    select g.kind,g.key,sum(v.revenue) revenue,sum(v.gmv) gmv,sum(v.orders) orders,sum(v.viewers) viewers,
      sum(v.clicks) "productClicks",avg(v.ctr) ctr,avg(v.cvr) cvr,
      case when sum(v.orders) filter(where v.revenue is not null and v.orders is not null)>0
        then sum(v.revenue) filter(where v.revenue is not null and v.orders is not null)
          /sum(v.orders) filter(where v.revenue is not null and v.orders is not null) else null end "averageOrderValue",
      sum(v.duration)/60 "liveDuration",count(*) "reportCount"
    from report_values v cross join lateral (values
      ('total',case when v.date>=start_date then 'current' else 'previous' end),
      (case when v.date>=start_date then 'trend' else null end,
        case when days<=31 then v.date::text when days<=120 then date_trunc('week',v.date)::date::text else to_char(v.date,'YYYY-MM') end),
      (case when v.date>=start_date then 'brand' else null end,v.brand_id),
      (case when v.date>=start_date then 'platform' else null end,v.platform_id),
      (case when v.date>=start_date then 'campaign' else null end,v.campaign_id)
    ) g(kind,key) where g.kind is not null group by g.kind,g.key
  ), workload as (
    select st.user_id,count(*) filter(where st.role='host') host,count(*) filter(where st.role='support') support,
      count(*) filter(where st.role='technical') technical from staffed st join scoped s on s.id=st.shift_id
    where s.date>=start_date group by st.user_id
  ), host_performance as (
    select st.user_id,sum(v.revenue) revenue from report_values v join staffed st on st.shift_id=v.shift_id and st.role='host'
    where v.date>=start_date group by st.user_id
  )
  select jsonb_build_object(
    'totals',coalesce((select to_jsonb(g)-'kind'-'key' from grouped g where kind='total' and key='current'),empty_metrics),
    'previous',coalesce((select to_jsonb(g)-'kind'-'key' from grouped g where kind='total' and key='previous'),empty_metrics),
    'trend',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('period',key) order by key) from grouped g where kind='trend'),'[]'::jsonb),
    'brands',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='brand'),'[]'::jsonb),
    'platforms',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='platform'),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='campaign'),'[]'::jsonb),
    'workload',coalesce((select jsonb_agg(to_jsonb(w) order by w.user_id) from workload w),'[]'::jsonb),
    'hostPerformance',coalesce((select jsonb_agg(to_jsonb(h) order by h.user_id) from host_performance h),'[]'::jsonb)
  ) into result;
  return result;
end;
$_$;


--
-- Name: get_archived_entity_page(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_archived_entity_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or private.current_system_permission() is distinct from 'admin' then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then
    raise exception using errcode='22023',message='LIST_QUERY_INVALID';
  end if;
  with archived as materialized (
    select 'shift' entity_type,id entity_id,coalesce(title,date::text||' '||start_time::text) entity_name,
      coalesce(deleted_at,archived_at) archived_at,coalesce(deleted_by,archived_by) archived_by,deletion_reason reason,version
      from public.shifts where deleted_at is not null or archived_at is not null
    union all select 'report',id,'Report · '||shift_id,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.reports where deleted_at is not null or archived_at is not null
    union all select 'brand',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.brands where deleted_at is not null or archived_at is not null
    union all select 'platform',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.platforms where deleted_at is not null or archived_at is not null
    union all select 'campaign',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.campaigns where deleted_at is not null or archived_at is not null
    union all select 'staff',id,full_name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.business_users where deleted_at is not null or archived_at is not null
  ), stats as (select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from archived),
  selected as (select * from archived order by archived_at desc,entity_type,entity_id limit p_page_size offset ((select page from stats)-1)*p_page_size)
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by archived_at desc,entity_type,entity_id),'[]'),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;


--
-- Name: get_audit_actor_page(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_audit_actor_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  with actors as materialized (
    select actor_business_user_id id,max(coalesce(actor_name,actor_business_user_id)) name
    from public.audit_logs where actor_business_user_id is not null group by actor_business_user_id
  ), selected as (
    select * from actors order by name,id limit p_page_size offset (p_page-1)*p_page_size
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by name,id),'[]'::jsonb),'total',(select count(*) from actors)) into result from selected;
  return result;
end;
$$;


--
-- Name: get_live_update_page(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_live_update_page(p_shift_id text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or not private.can_read_shift(p_shift_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then
    raise exception using errcode='22023',message='LIST_QUERY_INVALID';
  end if;
  with matching as materialized (
    select * from public.dashboard_updates where shift_id=p_shift_id and deleted_at is null
  ), stats as (
    select count(*) total,max(peak_viewers) peak,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by time desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), recent as (select * from matching order by time desc,id limit 4)
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by time desc,id),'[]'),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,
    'peakViewers',(select peak from stats),'recent',(select coalesce(jsonb_agg(to_jsonb(recent) order by time desc,id),'[]') from recent))
    into result from selected;
  return result;
end;
$$;


--
-- Name: get_my_self_attendance(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_self_attendance(p_shift_id text DEFAULT NULL::text, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor text; v_events jsonb;
begin
  v_actor:=private.require_shift_actor(false);
  if p_limit is null or p_limit<1 or p_limit>100 then
    raise exception using errcode='22023',message='ATTENDANCE_PAGE_INVALID';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id',ev.id,'shift_id',ev.shift_id,'staff_id',ev.staff_id,
    'role',ev.operational_role,'event',ev.event_kind,'recorded_at',ev.recorded_at,
    'verification_status',ev.verification_status,
    'photo_available',exists(select 1 from public.self_attendance_photo_evidence p where p.request_id=ev.request_id)
  ) order by ev.recorded_at desc,ev.id),'[]'::jsonb) into v_events
  from (select * from public.self_attendance_events where staff_id=v_actor
    and (p_shift_id is null or shift_id=p_shift_id)
    order by recorded_at desc,id limit p_limit) ev;
  return v_events;
end;
$$;


--
-- Name: get_payroll_period_snapshot(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_payroll_period_snapshot(p_period_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb;
begin
  if current_user<>'service_role' then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_period_id is null or length(p_period_id) not between 1 and 120 then raise exception using errcode='22023',message='PERIOD_INVALID'; end if;
  with period as materialized (
    select * from public.workforce_payroll_periods where id=p_period_id
  ), lines as materialized (
    select * from public.workforce_payroll_lines where period_id=p_period_id
  ), audit as materialized (
    select * from public.workforce_payroll_audit where period_id=p_period_id
  )
  select case when exists(select 1 from period) then jsonb_build_object(
    'period',(select to_jsonb(period) from period),
    'lineCount',(select count(*) from lines),'auditCount',(select count(*) from audit),
    'lines',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from lines order by created_at,id limit 3000) selected),
    'audit',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from audit order by created_at,id limit 3000) selected)
  ) end into result;
  if (result->>'lineCount')::bigint>=3000 or (result->>'auditCount')::bigint>=3000 then
    raise exception using errcode='54000',message='WORKFORCE_PAYROLL_READ_INCOMPLETE';
  end if;
  return result;
end;
$$;


--
-- Name: get_registration_review_context(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_registration_review_context(p_registration_id text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare target_user text; target_date date; result jsonb; row_count integer;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  select r.user_id,s.date into target_user,target_date from public.shift_registrations r
    join public.shifts s on s.id=r.shift_id where r.id=p_registration_id and s.deleted_at is null and s.archived_at is null;
  if not found then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  with weekly as materialized (
    select r.*,to_jsonb(s) shift from public.shift_registrations r join public.shifts s on s.id=r.shift_id
    where r.user_id=target_user and r.status in ('approved','manually_assigned')
      and s.date>=date_trunc('week',target_date)::date and s.date<date_trunc('week',target_date)::date+7
      and s.deleted_at is null and s.archived_at is null
    order by s.date,s.id,r.id limit 501
  ) select count(*),jsonb_build_object('registrations',coalesce(jsonb_agg(to_jsonb(weekly)-'shift'),'[]'::jsonb),
    'shifts',coalesce(jsonb_agg(weekly.shift),'[]'::jsonb)) into row_count,result from weekly;
  if row_count>500 then raise exception using errcode='54000',message='REGISTRATION_CONTEXT_TOO_LARGE'; end if;
  return result;
end;
$$;


--
-- Name: get_registration_review_page(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_registration_review_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb; search_text text; key text;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','statuses','roles') then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  if (p_filters ? 'statuses' and (jsonb_typeof(p_filters->'statuses')<>'array' or jsonb_array_length(p_filters->'statuses')>6))
    or (p_filters ? 'roles' and (jsonb_typeof(p_filters->'roles')<>'array' or jsonb_array_length(p_filters->'roles')>3)) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  search_text:=replace(replace(replace(lower(trim(coalesce(p_filters->>'search',''))),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with all_rows as materialized (
    select r.* from public.shift_registrations r join public.shifts s on s.id=r.shift_id
    where s.deleted_at is null and s.archived_at is null
  ), matching as materialized (
    select r.* from all_rows r join public.shifts s on s.id=r.shift_id
    left join public.business_users u on u.id=r.user_id
    where (jsonb_array_length(coalesce(p_filters->'statuses','[]'))=0 or r.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (jsonb_array_length(coalesce(p_filters->'roles','[]'))=0 or r.operational_role::text in (select jsonb_array_elements_text(p_filters->'roles')))
      and (search_text='' or lower(concat_ws(' ',r.id,r.imported_name,u.full_name,u.email,s.id,s.title)) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by requested_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), counts as (
    select jsonb_build_object('all',count(*),'pending',count(*) filter(where status='pending'),
      'approved',count(*) filter(where status in ('approved','manually_assigned')),
      'rejected',count(*) filter(where status='rejected'),
      'cancelled',count(*) filter(where status in ('cancelled','removed'))) value from all_rows
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by requested_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,'counts',(select value from counts)) into result from selected;
  return result;
end;
$$;


--
-- Name: get_report_list_page(integer, integer, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_list_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb, p_summary boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb; search_text text;
begin
  if private.current_business_user_id() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  if (p_filters ? 'reportStatuses' and (jsonb_typeof(p_filters->'reportStatuses')<>'array' or jsonb_array_length(p_filters->'reportStatuses')>50))
    or (p_filters ? 'metricsStatuses' and (jsonb_typeof(p_filters->'metricsStatuses')<>'array' or jsonb_array_length(p_filters->'metricsStatuses')>2)) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search','')),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with shift_ids as materialized (
    select * from private.filtered_shift_ids('all',p_filters-'reportStatuses'-'metricsStatuses'-'search')
  ), matching as materialized (
    select r.* from public.reports r join shift_ids on shift_ids.id=r.shift_id
    join public.shifts s on s.id=r.shift_id
    left join public.brands b on b.id=s.brand_id left join public.platforms p on p.id=s.platform_id
    left join public.campaigns c on c.id=s.campaign_id
    where r.deleted_at is null and r.archived_at is null
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'))=0 or r.status::text in (select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'))=0 or (case when r.metrics_confirmed then 'confirmed' else 'unconfirmed' end) in (select jsonb_array_elements_text(p_filters->'metricsStatuses')))
      and (search_text='' or lower(concat_ws(' ',r.id,b.name,p.name,c.name)) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by updated_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(case when p_summary then (
      select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(selected)) where key in (
        'id','shift_id','status','metrics_confirmed','created_at','updated_at','normalized_metrics','platform_metrics',
        'revenue','gmv','orders','viewers','peak_viewer','average_viewer','product_clicks','ctr','cvr','average_order_value','live_duration_minutes','dashboard_platform'
      )
    ) else to_jsonb(selected) end order by updated_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;


--
-- Name: get_report_list_with_history(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_list_with_history(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb; search_text text;
begin
  if private.current_business_user_id() is null or not private.current_business_user_is_active()
  then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000
    or p_page_size is null or p_page_size not in(10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256
  then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;

  if (p_filters ? 'reportStatuses' and
    (jsonb_typeof(p_filters->'reportStatuses')<>'array'
      or jsonb_array_length(p_filters->'reportStatuses')>50))
    or (p_filters ? 'metricsStatuses' and
    (jsonb_typeof(p_filters->'metricsStatuses')<>'array'
      or jsonb_array_length(p_filters->'metricsStatuses')>2))
  then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  -- Reuse current canonical shift-filter validator and visible-shift RLS.
  -- SECURITY INVOKER means this query only sees rows authorized by report RLS.
  -- RC19_HISTORY_VALIDATE_ALL_FILTERS: validate regardless of whether any
  -- report rows match. Otherwise lazy CTE evaluation can accept unknown keys.
  if (p_filters ? 'search' and jsonb_typeof(p_filters->'search') <> 'string')
    or exists(select 1 from jsonb_array_elements(coalesce(p_filters->'reportStatuses','[]'::jsonb)) v
      where jsonb_typeof(v)<>'string' or length(v#>>'{}')>128)
    or exists(select 1 from jsonb_array_elements(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) v
      where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('confirmed','unconfirmed'))
  then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  -- This call intentionally executes even for an empty report set. It reuses
  -- canonical shift-list key, date, cardinality and type validation with RLS.
  perform 1 from private.filtered_shift_ids('all',
    p_filters-'reportStatuses'-'metricsStatuses'-'search') limit 1;
  search_text:=replace(replace(replace(lower(coalesce(p_filters->>'search','')),
    chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');

  with eligible_shifts as materialized (
    select id from private.filtered_shift_ids('all',
      p_filters-'reportStatuses'-'metricsStatuses'-'search')
  ), scoped as materialized (
    select r.*,private.report_shift_display_context(r.id) as shift_context,
      exists(select 1 from eligible_shifts v where v.id=r.shift_id) as visible_shift
    from public.reports r
    where r.deleted_at is null and r.archived_at is null
  ), matching as materialized (
    select scoped.* from scoped
    left join public.brands b on b.id=scoped.shift_context->>'brand_id'
    left join public.platforms p on p.id=scoped.shift_context->>'platform_id'
    left join public.campaigns c on c.id=scoped.shift_context->>'campaign_id'
    where scoped.shift_context is not null
      and (scoped.visible_shift or (
        -- Historical records may be listed only if the report itself is RLS
        -- readable. Unsupported historical shift-specific filters fail closed.
        not exists (
          select 1 from jsonb_each(p_filters-'search'-'reportStatuses'-'metricsStatuses'
             -'from'-'to'-'brandIds'-'platformIds'-'campaignIds'
             -'hostIds'-'supportIds'-'technicalIds') kv
          where case jsonb_typeof(kv.value)
            when 'array' then jsonb_array_length(kv.value)>0
            when 'boolean' then kv.value='true'::jsonb
            when 'string' then kv.value#>>'{}'<>''
            else kv.value is not null and kv.value<>'null'::jsonb end
        )
        and (not p_filters?'from' or (scoped.shift_context->>'date')::date >= (p_filters->>'from')::date)
        and (not p_filters?'to' or (scoped.shift_context->>'date')::date <= (p_filters->>'to')::date)
        and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'::jsonb))=0
          or scoped.shift_context->>'brand_id' in (select jsonb_array_elements_text(p_filters->'brandIds')))
        and (jsonb_array_length(coalesce(p_filters->'platformIds','[]'::jsonb))=0
          or scoped.shift_context->>'platform_id' in (select jsonb_array_elements_text(p_filters->'platformIds')))
        and (jsonb_array_length(coalesce(p_filters->'campaignIds','[]'::jsonb))=0
          or scoped.shift_context->>'campaign_id' in (select jsonb_array_elements_text(p_filters->'campaignIds')))
        and private.report_historical_staff_filters_match(scoped.id,p_filters)
      ))
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'::jsonb))=0
        or scoped.status::text in(select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'::jsonb))=0
        or (case when scoped.metrics_confirmed then 'confirmed' else 'unconfirmed' end)
          in(select jsonb_array_elements_text(p_filters->'metricsStatuses')))
      and (search_text='' or lower(concat_ws(' ',scoped.id,b.name,p.name,c.name))
        like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) as total,
      least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) as page
    from matching
  ), selected as (
    select * from matching
    order by updated_at desc,id
    limit p_page_size offset ((select page from stats)-1)*p_page_size
  )
  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(selected)-'shift_context'-'visible_shift'
      order by updated_at desc,id),'[]'::jsonb),
    'historicalShiftContexts',coalesce(jsonb_object_agg(selected.id,selected.shift_context)
      filter (where not selected.visible_shift),'{}'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size
  ) into result from selected;
  return result;
end;
$$;


--
-- Name: get_report_obligation_page(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_obligation_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $_$
declare
  actor text := private.current_business_user_id();
  permission text := private.current_system_permission();
  key text;
  search_text text;
  result jsonb;
begin
  if actor is null or permission is null or permission not in ('member', 'leader', 'admin') then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000
    or p_page_size is null or p_page_size not in (10, 20, 50)
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then
    raise exception using errcode = '22023', message = 'LIST_QUERY_INVALID';
  end if;

  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  foreach key in array array['brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses'] loop
    if p_filters ? key and jsonb_typeof(p_filters->key) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if p_filters ? key and jsonb_array_length(p_filters->key) > 50 then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(p_filters->key, '[]'::jsonb)) value
      where jsonb_typeof(value) <> 'string' or length(value #>> '{}') not between 1 and 128) then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  if (p_filters ? 'search' and (jsonb_typeof(p_filters->'search') <> 'string' or length(p_filters->>'search') > 256))
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from') <> 'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to') <> 'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date > (p_filters->>'to')::date) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'reportStatuses','[]'::jsonb)) value
    where value not in ('draft','in_review','confirmed','reopened','archived'))
    or exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) value
    where value not in ('confirmed','unconfirmed')) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search','')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');

  with matching as materialized (
    select s as shift_row, r as report_row
    from public.shifts s
    left join public.reports r on r.shift_id = s.id and r.deleted_at is null and r.archived_at is null
    left join public.brands b on b.id = s.brand_id
    left join public.platforms p on p.id = s.platform_id
    left join public.campaigns c on c.id = s.campaign_id
    where s.deleted_at is null and s.archived_at is null
      and s.status in ('preparing','live','paused','completed')
      and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
      and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date)
      and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'::jsonb)) = 0 or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'platformIds','[]'::jsonb)) = 0 or s.platform_id in (select jsonb_array_elements_text(p_filters->'platformIds')))
      and (jsonb_array_length(coalesce(p_filters->'campaignIds','[]'::jsonb)) = 0 or s.campaign_id in (select jsonb_array_elements_text(p_filters->'campaignIds')))
      and (jsonb_array_length(coalesce(p_filters->'hostIds','[]'::jsonb)) = 0 or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'host' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
      and (jsonb_array_length(coalesce(p_filters->'supportIds','[]'::jsonb)) = 0 or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'support' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
      and (jsonb_array_length(coalesce(p_filters->'technicalIds','[]'::jsonb)) = 0 or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'technical' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
      and (search_text = '' or lower(concat_ws(' ', s.id, s.title, b.name, p.name, c.name)) like '%'||search_text||'%' escape E'\\')
      and (permission in ('admin','leader') or s.host_id = actor or s.support_id = actor or s.technical_id = actor
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.user_id = actor and sr.status in ('approved','manually_assigned'))
        or r.submitted_by = actor)
      and (r.id is null or (not r.metrics_confirmed and r.status not in ('confirmed','archived')))
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'::jsonb)) = 0
        or coalesce(r.status, 'draft') in (select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) = 0
        or (case when coalesce(r.metrics_confirmed, false) then 'confirmed' else 'unconfirmed' end) in (select jsonb_array_elements_text(p_filters->'metricsStatuses')))
  ), stats as (
    select count(*)::bigint as total,
      least(p_page, greatest(1, ceil(count(*)::numeric / p_page_size)::integer)) as page
    from matching
  ), selected as (
    select * from matching
    order by (shift_row).start_at desc nulls last, (shift_row).date desc, (shift_row).start_time desc, (shift_row).id desc
    limit p_page_size offset ((select page from stats) - 1) * p_page_size
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'shift', to_jsonb(shift_row),
      'report', case when report_row is null then null else to_jsonb(report_row) end
    ) order by (shift_row).start_at desc nulls last, (shift_row).date desc, (shift_row).start_time desc, (shift_row).id desc), '[]'::jsonb),
    'total', (select total from stats), 'page', (select page from stats), 'pageSize', p_page_size
  ) into result from selected;
  return result;
end;
$_$;


--
-- Name: get_report_revisions(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_report_revisions(p_report_id text) RETURNS TABLE(version integer, created_at timestamp with time zone, created_by text, status text, reason text, event text, metrics jsonb, ocr_review jsonb, final_recap jsonb, image_references text[])
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_report public.reports;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null or not private.current_business_user_is_active() then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not private.can_read_report(p_report_id) then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  select * into target_report
  from public.reports
  where id = p_report_id;
  if target_report.id is null then
    raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  end if;
  return query
  select revision.version, revision.created_at, revision.created_by, revision.status,
    revision.reason, revision.event, revision.metrics, revision.ocr_review,
    revision.final_recap, revision.image_references
  from public.report_revisions as revision
  where revision.report_id = p_report_id
  order by revision.version;
end;
$$;


--
-- Name: get_schedule_change_page(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_schedule_change_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare result jsonb; key text;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('from','to','actorIds','actionIds','shiftIds','brandIds','sources') then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  foreach key in array array['actorIds','actionIds','shiftIds','brandIds','sources'] loop
    if p_filters ? key and (jsonb_typeof(p_filters->key)<>'array' or jsonb_array_length(p_filters->key)>50) then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  with matching as materialized (
    select a.id,a.created_at as timestamp,a.actor_business_user_id as actor_id,a.action,a.entity_id as shift_id,
      a.before_data as before,a.after_data as after,a.source,a.reason,a.status
    from public.audit_logs a
    where a.entity_type='shift' and a.module in ('calendar','imports')
      and (not p_filters ? 'from' or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date>=(p_filters->>'from')::date)
      and (not p_filters ? 'to' or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date<=(p_filters->>'to')::date)
      and (jsonb_array_length(coalesce(p_filters->'actorIds','[]'))=0 or a.actor_business_user_id in (select jsonb_array_elements_text(p_filters->'actorIds')))
      and (jsonb_array_length(coalesce(p_filters->'actionIds','[]'))=0 or a.action in (select jsonb_array_elements_text(p_filters->'actionIds')))
      and (jsonb_array_length(coalesce(p_filters->'shiftIds','[]'))=0 or a.entity_id in (select jsonb_array_elements_text(p_filters->'shiftIds')))
      and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'))=0 or coalesce(a.after_data->>'brand_id',a.before_data->>'brand_id') in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'sources','[]'))=0 or a.source in (select jsonb_array_elements_text(p_filters->'sources')))
  ), stats as (select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching),
  selected as (select * from matching order by timestamp desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size)
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by timestamp desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;


--
-- Name: get_self_attendance_photo_context(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_self_attendance_photo_context(p_shift_id text, p_operational_role text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return public.get_self_attendance_photo_context(p_shift_id, p_operational_role, 'check_in');
end;
$$;


--
-- Name: get_self_attendance_photo_context(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_self_attendance_photo_context(p_shift_id text, p_operational_role text, p_event_kind text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor text;
  v_shift public.shifts;
  v_assigned boolean;
  v_surrendered boolean;
  v_now timestamptz := statement_timestamp();
  v_staff_name text;
  v_brand_name text;
  v_platform_name text;
  v_kind text;
begin
  v_actor := private.require_shift_actor(false);
  v_kind := coalesce(nullif(btrim(p_event_kind), ''), 'check_in');

  if p_shift_id is null or btrim(p_shift_id) = '' or
     p_operational_role not in ('host', 'support', 'technical') or
     v_kind not in ('check_in', 'check_out') then
    raise exception using errcode = '22023', message = 'ATTENDANCE_PHOTO_CONTEXT_INVALID';
  end if;

  select * into v_shift from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null;

  if not found or v_shift.start_at is null or v_shift.end_at is null or
     v_shift.end_at <= v_shift.start_at then
    raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
  end if;

  -- P0-2: Check-in and Check-out have separate, isolated time boundary & status rules
  if v_kind = 'check_in' then
    -- Check-in retains canonical window: shift cannot be completed,
    -- must be within [start_at - 2 hours, end_at].
    if v_shift.status not in ('scheduled', 'preparing', 'live', 'paused') or
       v_now < v_shift.start_at - interval '2 hours' or
       v_now > v_shift.end_at then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
    end if;
  else -- 'check_out'
    -- Check-out allows completed shifts, with dedicated grace period [start_at - 2 hours, end_at + 4 hours].
    if v_shift.status not in ('scheduled', 'preparing', 'live', 'paused', 'completed') or
       v_now < v_shift.start_at - interval '2 hours' or
       v_now > v_shift.end_at + interval '4 hours' then
      raise exception using errcode = 'P0001', message = 'ATTENDANCE_PHOTO_SHIFT_NOT_ELIGIBLE';
    end if;
  end if;

  select exists (
    select 1 from public.swap_requests sw
    where sw.status in ('approved', 'completed') and sw.deleted_at is null
      and sw.mode in ('replacement', 'exchange')
      and ((coalesce(sw.source_shift_id, sw.shift_id) = p_shift_id
              and sw.requester_id = v_actor and sw.operational_role = p_operational_role)
        or (sw.mode = 'exchange' and sw.target_shift_id = p_shift_id
              and sw.counterpart_id = v_actor and sw.operational_role = p_operational_role))
  ) into v_surrendered;

  if v_surrendered then
    raise exception using errcode = '42501', message = 'ATTENDANCE_ASSIGNMENT_SURRENDERED';
  end if;

  select (
    (p_operational_role = 'host' and v_shift.host_id = v_actor) or
    (p_operational_role = 'support' and v_shift.support_id = v_actor) or
    (p_operational_role = 'technical' and v_shift.technical_id = v_actor) or
    exists (select 1 from public.shift_registrations sr
      where sr.shift_id = p_shift_id and sr.user_id = v_actor
       and sr.operational_role = p_operational_role and sr.status in ('approved', 'manually_assigned'))
    or exists (select 1 from public.swap_requests sw
      where sw.status in ('approved', 'completed') and sw.deleted_at is null
       and sw.operational_role = p_operational_role
       and ((coalesce(sw.source_shift_id, sw.shift_id) = p_shift_id
             and coalesce(sw.counterpart_id, sw.replacement_staff_id) = v_actor
             and coalesce(sw.counterpart_id, sw.replacement_staff_id) <> sw.requester_id)
         or (sw.mode = 'exchange' and sw.target_shift_id = p_shift_id
             and sw.requester_id = v_actor and sw.requester_id <> sw.counterpart_id)))
  ) into v_assigned;

  if not coalesce(v_assigned, false) then
    raise exception using errcode = '42501', message = 'ATTENDANCE_NOT_ASSIGNED';
  end if;

  if v_kind = 'check_in' then
    if exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_ALREADY_RECORDED';
    end if;

    if exists (select 1 from public.self_attendance_photo_evidence e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_PHOTO_ALREADY_RESERVED';
    end if;
  elsif v_kind = 'check_out' then
    -- Check-out requires an existing check_in event
    if not exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_in') then
      raise exception using errcode = '23514', message = 'ATTENDANCE_CHECKIN_REQUIRED';
    end if;

    if exists (select 1 from public.self_attendance_events e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_out') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_ALREADY_RECORDED';
    end if;

    if exists (select 1 from public.self_attendance_photo_evidence e
      where e.shift_id = p_shift_id and e.staff_id = v_actor and
            e.operational_role = p_operational_role and e.event_kind = 'check_out') then
      raise exception using errcode = '23505', message = 'ATTENDANCE_PHOTO_ALREADY_RESERVED';
    end if;
  end if;

  select full_name into v_staff_name from public.business_users where id = v_actor;
  select name into v_brand_name from public.brands where id = v_shift.brand_id;
  select name into v_platform_name from public.platforms where id = v_shift.platform_id;

  return jsonb_build_object(
    'shift_id', v_shift.id,
    'staff_id', v_actor,
    'staff_name', coalesce(v_staff_name, v_actor),
    'role', p_operational_role,
    'event_kind', v_kind,
    'date', v_shift.date,
    'start_time', v_shift.start_time,
    'end_time', v_shift.end_time,
    'start_at', v_shift.start_at,
    'end_at', v_shift.end_at,
    'brand', coalesce(v_brand_name, v_shift.brand_id),
    'platform', coalesce(v_platform_name, v_shift.platform_id),
    'studio', v_shift.studio,
    'title', v_shift.title
  );
end;
$$;


--
-- Name: get_shift_list_page(text, integer, integer, jsonb, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shift_list_page(p_scope text DEFAULT 'all'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb, p_pending_page integer DEFAULT 1, p_include_live boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare
  actor text := private.current_business_user_id();
  total bigint;
  safe_page integer;
  ids text[];
  key text;
  result jsonb;
  related jsonb;
  pending_total bigint := 0;
  pending_page integer := 1;
  pending_ids jsonb;
  latest_updates jsonb;
  roles text[];
  reg_statuses text[];
  search_text text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_scope is null or p_scope not in ('all','open','mine')
    or p_page is null or p_page < 1 or p_page > 100000
    or p_page_size is null or p_page_size not in (10,20,50)
    or p_pending_page is null or p_pending_page < 1
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then
    raise exception using errcode='22023',message='PAGINATION_INVALID';
  end if;
  roles := array(select jsonb_array_elements_text(coalesce(p_filters->'roles','[]'::jsonb)));
  with matching as materialized (
    select * from private.filtered_shift_ids(p_scope,p_filters)

  ), stats as (
    select count(*) n,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select m.* from matching m
    order by case when p_include_live then case m.status when 'live' then 0 when 'paused' then 1 when 'preparing' then 2 when 'scheduled' then 3 when 'completed' then 4 else 5 end end,
      case when coalesce((p_filters->>'descending')::boolean,false) then m.date end desc,
      case when not coalesce((p_filters->>'descending')::boolean,false) then m.date end,
      case when coalesce((p_filters->>'descending')::boolean,false) then m.start_time end desc,
      case when not coalesce((p_filters->>'descending')::boolean,false) then m.start_time end, m.id
    limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), rows as (
    select s.id, s.date, s.start_time, s.end_time, s.timezone, s.start_at, s.end_at, s.end_date, s.crosses_midnight, s.duration_minutes, s.brand_id, s.execution_source, s.platform_id, s.campaign_id, s.title, s.studio, s.host_id, s.support_id, s.technical_id, s.host_names, s.assistant_names, s.technical_names, s.required_host_count, s.required_support_count, s.required_technical_count, s.registration_locked, s.registration_cutoff_at, s.allow_multi_role, s.import_batch_id, s.status, s.status_mode, s.live_link, s.product_notes, s.updated_by, s.created_at, s.updated_at, s.version, s.deleted_at, s.deleted_by, s.archived_at, s.archived_by, s.deletion_reason, exists(
      select 1 from public.shift_registrations r join public.shifts other_shift on other_shift.id=r.shift_id
      where r.user_id=actor and r.shift_id<>s.id and r.status in ('pending','approved','manually_assigned')
        and other_shift.deleted_at is null and other_shift.archived_at is null
        and other_shift.start_at<s.end_at and other_shift.end_at>s.start_at
    ) as registration_conflict from selected chosen join public.shifts s on s.id=chosen.id
  ) select coalesce(jsonb_agg(to_jsonb(rows) order by
    case when p_include_live then case rows.status when 'live' then 0 when 'paused' then 1 when 'preparing' then 2 when 'scheduled' then 3 when 'completed' then 4 else 5 end end,
    case when coalesce((p_filters->>'descending')::boolean,false) then rows.date end desc,
    case when not coalesce((p_filters->>'descending')::boolean,false) then rows.date end,
    case when coalesce((p_filters->>'descending')::boolean,false) then rows.start_time end desc,
    case when not coalesce((p_filters->>'descending')::boolean,false) then rows.start_time end, rows.id), '[]'::jsonb),
    array_agg(rows.id), (select n from stats), (select page from stats) into result,ids,total,safe_page from rows;
  if total is null then total := 0; safe_page := 1; end if;
  ids := coalesce(ids,array[]::text[]);
  select count(*) into pending_total from public.shift_registrations r
    where r.shift_id=any(ids) and r.status='pending'
      and (cardinality(roles)=0 or r.operational_role::text=any(roles));
  pending_page := least(p_pending_page,greatest(1,ceil(pending_total::numeric/20)::integer));
  with mine as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.user_id=actor
      and r.status in ('pending','approved','manually_assigned')
  ), pending as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.status='pending'
      and (cardinality(roles)=0 or r.operational_role::text=any(roles))
    order by r.requested_at,r.id limit 20 offset (pending_page-1)*20
  ), approved as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.status in ('approved','manually_assigned')
    order by r.requested_at,r.id limit 150
  ), related_rows as (select * from mine union select * from pending union select * from approved)
  select coalesce(jsonb_agg(to_jsonb(related_rows) order by requested_at,id),'[]'::jsonb) into related from related_rows;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into pending_ids from (select r.id from public.shift_registrations r where r.shift_id=any(ids) and r.status='pending' and (cardinality(roles)=0 or r.operational_role::text=any(roles)) order by r.requested_at,r.id limit 20 offset (pending_page-1)*20) pending;
  if p_include_live then
    select coalesce(jsonb_agg(to_jsonb(latest)),'[]'::jsonb) into latest_updates from (
      select distinct on (u.shift_id) u.* from public.dashboard_updates u
      where u.shift_id=any(ids) and u.deleted_at is null order by u.shift_id,u.time desc,u.id
    ) latest;
  end if;
  return jsonb_build_object('rows',result,'registrations',related,'total',total,'page',safe_page,'pageSize',p_page_size,
    'updates',coalesce(latest_updates,'[]'::jsonb),'pendingIds',pending_ids,'pendingTotal',pending_total,'pendingPage',pending_page,'studios',
    (select coalesce(jsonb_agg(studio),'[]'::jsonb) from (
      select distinct lower(regexp_replace(btrim(coalesce(s.studio,'')), '\s+', ' ', 'g')) studio
      from public.shifts s where s.deleted_at is null and s.archived_at is null and btrim(coalesce(s.studio,''))<>''
      order by studio limit 50
    ) locations));
end;
$$;


--
-- Name: get_shift_staffing_summary(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_shift_staffing_summary(p_shift_ids text[]) RETURNS TABLE(shift_id text, role text, required integer, approved integer, pending integer, remaining integer, approved_staff jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.current_business_user_id() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return query
  select s.id, demand.role, demand.required,
    count(r.id) filter (where r.status in ('approved', 'manually_assigned'))::integer,
    count(r.id) filter (where r.status = 'pending')::integer,
    greatest(0, demand.required - (count(r.id) filter (where r.status in ('approved', 'manually_assigned')))::integer),
    coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(u.full_name, r.imported_name),
      'avatar_url', u.avatar_url,
      'imported_only', r.user_id is null
    ) order by r.created_at, r.id) filter (
      where r.status in ('approved', 'manually_assigned')
        and coalesce(u.full_name, r.imported_name) is not null
    ), '[]'::jsonb)
  from public.shifts as s
  cross join lateral (values
    ('host'::text, coalesce(s.required_host_count, 1)),
    ('support'::text, coalesce(s.required_support_count, 1)),
    ('technical'::text, coalesce(s.required_technical_count, 1))
  ) as demand(role, required)
  left join public.shift_registrations as r
    on r.shift_id = s.id and r.operational_role = demand.role
  left join public.business_users as u on u.id = r.user_id
  where s.id = any(p_shift_ids) and private.can_read_shift(s.id)
  group by s.id, demand.role, demand.required
  order by s.id, demand.role;
end;
$$;


--
-- Name: get_staff_directory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_directory() RETURNS TABLE(id text, full_name text, avatar_url text, operational_roles text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if private.current_business_user_id() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return query select u.id, u.full_name, u.avatar_url, u.operational_roles
    from public.business_users as u
    where u.status = 'active' and u.account_status = 'active'
      and u.archived_at is null and u.deleted_at is null
    order by u.full_name, u.id;
end;
$$;


--
-- Name: get_staff_workload(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_staff_workload(p_staff_ids text[]) RETURNS TABLE(staff_id text, role text, shift_count bigint)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_staff_ids is null or cardinality(p_staff_ids)>50 then
    raise exception using errcode='22023',message='STAFF_PAGE_INVALID';
  end if;
  return query
  select u.id, r.role, count(distinct s.id)
  from public.business_users u cross join (values ('host'),('support'),('technical')) r(role)
  left join public.shifts s on s.deleted_at is null and s.archived_at is null
    and (case r.role when 'host' then s.host_id when 'support' then s.support_id else s.technical_id end=u.id
      or exists(select 1 from public.shift_registrations registration where registration.shift_id=s.id
        and registration.user_id=u.id and registration.operational_role::text=r.role
        and registration.status in ('approved','manually_assigned')))
  where u.id=any(p_staff_ids)
  group by u.id,r.role;
end;
$$;


--
-- Name: get_swap_exchange_candidates(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_swap_exchange_candidates(p_shift_id text, p_role text) RETURNS TABLE(registration_id text, user_id text, full_name text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare actor_id text := private.current_business_user_id();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not private.can_read_shift(p_shift_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return query select r.id, u.id, u.full_name
  from public.shift_registrations as r
  join public.shifts as s on s.id = r.shift_id
  join public.business_users as u on u.id = r.user_id
  where s.id = p_shift_id and s.status = 'scheduled'
    and s.archived_at is null and s.deleted_at is null
    and r.operational_role = p_role and r.status in ('approved', 'manually_assigned')
    and u.id <> actor_id and u.status = 'active' and u.account_status = 'active'
    and u.archived_at is null and u.deleted_at is null
  order by u.full_name, r.id;
end;
$$;


--
-- Name: get_swap_list_page(integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_swap_list_page(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare actor text:=private.current_business_user_id(); result jsonb; search_text text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or coalesce(p_filters->>'scope','all') not in ('all','mine','forMe')
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  if (p_filters ? 'statuses' and (jsonb_typeof(p_filters->'statuses')<>'array' or jsonb_array_length(p_filters->'statuses')>50))
    or (p_filters ? 'roles' and (jsonb_typeof(p_filters->'roles')<>'array' or jsonb_array_length(p_filters->'roles')>3))
    or (p_filters ? 'requesterIds' and (jsonb_typeof(p_filters->'requesterIds')<>'array' or jsonb_array_length(p_filters->'requesterIds')>50)) then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  search_text:=replace(replace(replace(lower(coalesce(p_filters->>'search','')),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with shift_ids as materialized (
    select * from private.filtered_shift_ids('all',p_filters-'scope'-'roles'-'statuses'-'requesterIds'-'search')
  ), directory as materialized (
    select id,full_name from public.get_staff_directory() where search_text<>''
    union select id,full_name from public.business_users where search_text<>''
  ), all_rows as materialized (
    select * from public.swap_requests where deleted_at is null
  ), matching as materialized (
    select sw.* from all_rows sw join shift_ids ids on ids.id=coalesce(nullif(sw.shift_id,''),sw.source_shift_id)
    join public.shifts s on s.id=ids.id
    where (coalesce(p_filters->>'scope','all')='all' or (p_filters->>'scope'='mine' and sw.requester_id=actor) or (p_filters->>'scope'='forMe' and sw.counterpart_id=actor))
      and (jsonb_array_length(coalesce(p_filters->'requesterIds','[]'))=0 or sw.requester_id in (select jsonb_array_elements_text(p_filters->'requesterIds')))
      and (jsonb_array_length(coalesce(p_filters->'roles','[]'))=0 or coalesce(sw.operational_role,case when sw.new_support_id is not null then 'support' when sw.new_technical_id is not null then 'technical' else 'host' end) in (select jsonb_array_elements_text(p_filters->'roles')))
      and (jsonb_array_length(coalesce(p_filters->'statuses','[]'))=0 or sw.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (search_text='' or lower(concat_ws(' ',sw.id,s.title,sw.reason,
        (select full_name from directory where id=sw.requester_id limit 1),
        (select full_name from directory where id=coalesce(sw.replacement_staff_id,sw.new_host_id,sw.new_support_id,sw.new_technical_id,sw.counterpart_id) limit 1))) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by created_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), counts as (
    select jsonb_build_object('all',count(*),'mine',count(*) filter(where requester_id=actor),'forMe',count(*) filter(where counterpart_id=actor),
      'pending',count(*) filter(where status='pending'),'accepted',count(*) filter(where status in ('accepted','approved')),
      'completed',count(*) filter(where status='completed'),'rejected',count(*) filter(where status='rejected'),'cancelled',count(*) filter(where status='cancelled')) value from all_rows
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by created_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,'counts',(select value from counts)) into result from selected;
  return result;
end;
$$;


--
-- Name: link_staff_auth_user(text, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_staff_auth_user(p_staff_id text, p_auth_user_id uuid, p_system_permission text, p_mode text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_auth_email text;
  v_auth_metadata jsonb;
  v_target public.business_users;
  v_permission text;
begin
  if p_staff_id is null or btrim(p_staff_id) = ''
    or p_auth_user_id is null
    or p_mode is null
    or p_mode not in ('provision', 'link')
  then
    raise exception using errcode = '22023', message = 'ACCOUNT_PROVISIONING_PAYLOAD_INVALID';
  end if;

  select lower(btrim(email)), coalesce(raw_app_meta_data, '{}'::jsonb)
    into v_auth_email, v_auth_metadata
  from auth.users
  where id = p_auth_user_id;
  if not found or v_auth_email is null or v_auth_email = '' then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_AUTH_USER_NOT_FOUND';
  end if;

  select * into v_target
  from public.business_users
  where id = p_staff_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_STAFF_NOT_FOUND';
  end if;
  if v_target.archived_at is not null or v_target.deleted_at is not null then
    raise exception using errcode = '22023', message = 'ACCOUNT_STAFF_ARCHIVED';
  end if;
  if v_target.status <> 'active' or v_target.account_status = 'rejected' then
    raise exception using errcode = '42501', message = 'ACCOUNT_STAFF_INACTIVE';
  end if;
  if v_target.auth_user_id is not null then
    raise exception using errcode = '23505', message = 'ACCOUNT_STAFF_ALREADY_LINKED';
  end if;
  if exists (
    select 1 from public.business_users
    where auth_user_id = p_auth_user_id
      and id <> p_staff_id
  ) then
    raise exception using errcode = '23505', message = 'ACCOUNT_AUTH_USER_ALREADY_LINKED';
  end if;
  if lower(btrim(v_target.email)) <> v_auth_email then
    raise exception using errcode = '22023', message = 'ACCOUNT_AUTH_EMAIL_MISMATCH';
  end if;

  v_permission := coalesce(nullif(btrim(p_system_permission), ''), v_target.system_permission);
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'ACCOUNT_ROLE_INVALID';
  end if;

  update public.business_users
  set auth_user_id = p_auth_user_id,
      system_permission = v_permission,
      role = case when v_permission = 'member' then 'staff' else v_permission end,
      auth_provider = 'email',
      status = case when p_mode = 'provision' then 'inactive' else status end,
      account_status = case when p_mode = 'provision' then 'pending_approval' else account_status end,
      email_verified = case when p_mode = 'provision' then false else email_verified end
  where id = p_staff_id
  returning * into v_target;

  update auth.users
  set raw_app_meta_data = v_auth_metadata
    || jsonb_build_object(
      'system_permission', v_target.system_permission,
      'business_user_id', v_target.id
    )
  where id = p_auth_user_id;

  return v_target;
end;
$$;


--
-- Name: FUNCTION link_staff_auth_user(p_staff_id text, p_auth_user_id uuid, p_system_permission text, p_mode text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.link_staff_auth_user(p_staff_id text, p_auth_user_id uuid, p_system_permission text, p_mode text) IS 'Admin-only existing Staff/Auth link. The provision mode creates a pending activation state; link mode preserves the Staff lifecycle state.';


--
-- Name: list_account_requests(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_account_requests(p_status text DEFAULT 'pending'::text) RETURNS SETOF public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_status text := coalesce(nullif(btrim(p_status), ''), 'pending');
begin
  perform private.require_staff_admin();

  if v_status not in ('pending', 'approved', 'rejected', 'cancelled', 'all') then
    raise exception 'Invalid account request status.' using errcode = '22023';
  end if;

  if v_status = 'all' then
    return query
      select request_row.*
      from public.account_requests as request_row
      order by request_row.submitted_at desc, request_row.id desc;
  end if;

  return query
    select request_row.*
    from public.account_requests as request_row
    where request_row.status = v_status
    order by request_row.submitted_at desc, request_row.id desc;
end;
$$;


--
-- Name: FUNCTION list_account_requests(p_status text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.list_account_requests(p_status text) IS 'Admin-only read boundary for Account Request review; no approval mutation.';


--
-- Name: manual_assign_imported_shift_staff(text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_assign_imported_shift_staff(p_shift_id text, p_user_id text, p_role text, p_imported_name text, p_match_method text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_user public.business_users;
  created_registration public.shift_registrations;
  exact_name text;
  exact_user_name text;
begin
  actor_id := private.require_shift_actor(true);

  if p_imported_name is null or btrim(p_imported_name) = '' then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_NAME_INVALID';
  end if;
  if p_match_method is null or p_match_method not in ('exact', 'normalized', 'manual') then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_MATCH_METHOD_INVALID';
  end if;

  select * into target_user
  from public.business_users
  where id = p_user_id and status = 'active' and deleted_at is null;
  if target_user.id is null then
    raise exception using errcode = 'P0001', message = 'STAFF_NOT_FOUND';
  end if;

  exact_name := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_imported_name), '[[:space:]]+', ' ', 'g')
  );
  exact_user_name := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(target_user.full_name), '[[:space:]]+', ' ', 'g')
  );

  if p_match_method = 'exact' and exact_name is distinct from exact_user_name then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_EXACT_MATCH_INVALID';
  end if;
  if p_match_method = 'normalized'
    and private.normalize_staff_identity_name(p_imported_name)
      is distinct from private.normalize_staff_identity_name(target_user.full_name)
  then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_NORMALIZED_MATCH_INVALID';
  end if;

  created_registration := private.insert_manual_shift_assignment(
    p_shift_id,
    p_user_id,
    p_role,
    actor_id,
    p_notes,
    false
  );

  update public.shift_registrations
  set
    imported_name = btrim(p_imported_name),
    match_method = p_match_method
  where id = created_registration.id
  returning * into created_registration;

  perform private.refresh_shift_registration_lock(p_shift_id, false);
  return created_registration;
end;
$$;


--
-- Name: manual_assign_imported_shift_staff(text, text, text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_assign_imported_shift_staff(p_shift_id text, p_user_id text, p_role text, p_imported_name text, p_match_method text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.manual_assign_imported_shift_staff(p_shift_id, p_user_id, p_role, p_imported_name, p_match_method, p_notes);
end;
$$;


--
-- Name: manual_assign_shift_staff(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_assign_shift_staff(p_shift_id text, p_user_id text, p_role text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
begin
  actor_id := private.require_shift_actor(true);
  return private.insert_manual_shift_assignment(
    p_shift_id, p_user_id, p_role, actor_id, p_notes, true
  );
end;
$$;


--
-- Name: manual_assign_shift_staff(text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.manual_assign_shift_staff(p_shift_id text, p_user_id text, p_role text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.manual_assign_shift_staff(p_shift_id, p_user_id, p_role, p_notes);
end;
$$;


--
-- Name: mark_all_notifications_read(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_all_notifications_read() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.notifications
  set read_at = coalesce(read_at, statement_timestamp()), read = true
  where (
    recipient_id = (select private.current_business_user_id())
    or user_id = (select auth.uid())
  )
  and read_at is null;
end;
$$;


--
-- Name: mark_notification_read(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_notification_read(p_notification_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if not exists (
    select 1
    from public.notifications as notification
    where notification.id = p_notification_id
      and (
        notification.recipient_id = (select private.current_business_user_id())
        or notification.user_id = (select auth.uid())
      )
  ) then
    raise exception using errcode = '42501', message = 'NOTIFICATION_NOT_OWNED';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, statement_timestamp()), read = true
  where id = p_notification_id
    and (
      recipient_id = (select private.current_business_user_id())
      or user_id = (select auth.uid())
    );
end;
$$;


--
-- Name: normalize_shift_qualifier(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_shift_qualifier(val text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(regexp_replace(lower(btrim(val)), '\s+', ' ', 'g'), '');
$$;


--
-- Name: FUNCTION normalize_shift_qualifier(val text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.normalize_shift_qualifier(val text) IS 'RC19 Batch 01.3.1: Canonical identity qualifier normalization for Studio and Campaign. Equivalent to TypeScript trim().toLowerCase().replace(/\s+/g, '' '')';


--
-- Name: rbac01_activate_role_defaults(bigint, integer, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_activate_role_defaults(p_version_id bigint, p_expected_active_version integer, p_effective_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE; v_effective_at timestamptz; v_now timestamptz;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  IF coalesce((SELECT version FROM private.rbac01_role_default_versions
    WHERE id=private.rbac01_active_version_id(v_version.role,statement_timestamp())),0) <> p_expected_active_version
    OR p_expected_active_version <> v_version.expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
    WHERE e.version_id=p_version_id AND e.event_type='approval' AND e.actor_business_user_id<>v_version.proposed_by)
    OR EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
      WHERE e.version_id=p_version_id AND e.event_type IN ('activation','rollback')) THEN
    RAISE EXCEPTION 'RBAC01_APPROVAL_REQUIRED_OR_ALREADY_ACTIVE' USING ERRCODE='42501';
  END IF;
  v_now := clock_timestamp();
  v_effective_at := coalesce(p_effective_at,v_now);
  IF v_effective_at < v_now OR v_effective_at > v_now + interval '30 days' THEN
    RAISE EXCEPTION 'RBAC01_EFFECTIVE_TIME_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,occurred_at,effective_at,resulting_version_id,
    reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'activation',v_actor,clock_timestamp(),v_effective_at,v_version.id,
    'Approved role policy activated',jsonb_build_object('version',p_expected_active_version),
    jsonb_build_object('version',v_version.version,'effective_at',v_effective_at));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'version',v_version.version,'status','active','effective',v_effective_at<=clock_timestamp(),'effective_at',v_effective_at);
END;
$$;


--
-- Name: rbac01_approve_role_defaults(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_approve_role_defaults(p_version_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  IF v_version.proposed_by = v_actor THEN RAISE EXCEPTION 'RBAC01_SELF_APPROVAL_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  IF coalesce((SELECT version FROM private.rbac01_role_default_versions
      WHERE id=private.rbac01_active_version_id(v_version.role,statement_timestamp())),0)
       IS DISTINCT FROM v_version.expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM private.rbac01_role_default_events e
    WHERE e.version_id=p_version_id AND e.event_type='approval') THEN
    RAISE EXCEPTION 'RBAC01_ALREADY_APPROVED' USING ERRCODE='40001';
  END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'approval',v_actor,'Independent Admin approval',
    jsonb_build_object('status','proposed'),jsonb_build_object('status','approved','version',v_version.version));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'version',v_version.version,'status','approved','effective',false);
END;
$$;


--
-- Name: rbac01_effective_permission(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_effective_permission(p_permission text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT coalesce((public.rbac_permission_decision(p_permission)->>'allowed')::boolean,false)
$$;


--
-- Name: rbac01_list_role_defaults(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_list_role_defaults() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'role', v.role, 'version', v.version,
    'expected_active_version', v.expected_active_version,
    'decisions', v.decisions, 'proposed_by', v.proposed_by,
    'proposed_at', v.proposed_at, 'reason', v.reason,
    'approved_by', approval.actor_business_user_id,
    'approved_at', approval.occurred_at,
    'effective_at', activation.effective_at,
    'status', CASE
      WHEN current_version.id = v.id THEN 'active'
      WHEN rolled.id IS NOT NULL THEN 'rolled_back'
      WHEN revoked.id IS NOT NULL THEN 'revoked'
      WHEN approval.id IS NOT NULL THEN 'approved'
      ELSE 'proposed' END
  ) ORDER BY v.id DESC), '[]'::jsonb)
  INTO v_result
  FROM private.rbac01_role_default_versions v
  LEFT JOIN LATERAL (SELECT e.id,e.actor_business_user_id,e.occurred_at
    FROM private.rbac01_role_default_events e WHERE e.version_id=v.id AND e.event_type='approval'
    ORDER BY e.id DESC LIMIT 1) approval ON true
  LEFT JOIN LATERAL (SELECT e.id,e.effective_at FROM private.rbac01_role_default_events e
    WHERE e.resulting_version_id=v.id AND e.event_type IN ('activation','rollback')
    ORDER BY e.id DESC LIMIT 1) activation ON true
  LEFT JOIN LATERAL (SELECT e.id FROM private.rbac01_role_default_events e
    WHERE e.version_id=v.id AND e.event_type='rollback' ORDER BY e.id DESC LIMIT 1) rolled ON true
  LEFT JOIN LATERAL (SELECT e.id FROM private.rbac01_role_default_events e
    WHERE e.version_id=v.id AND e.event_type='revocation' ORDER BY e.id DESC LIMIT 1) revoked ON true
  LEFT JOIN LATERAL (SELECT active_version.id
    FROM private.rbac01_role_default_versions active_version
    WHERE active_version.id = private.rbac01_active_version_id(v.role, statement_timestamp())) current_version ON true;
  RETURN v_result;
END;
$$;


--
-- Name: rbac01_propose_role_defaults(text, jsonb, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_propose_role_defaults(p_role text, p_decisions jsonb, p_comment text, p_expected_active_version integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_actor text; v_active_id bigint; v_active_version integer := 0;
  v_next_version integer; v_id bigint; v_decisions jsonb := '{}'::jsonb;
  v_key text; v_value text; v_catalog private.rbac_permission_catalog%ROWTYPE;
  v_legacy_allowed boolean; v_reason text;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('member','leader','admin') OR p_role IS NULL
    OR p_decisions IS NULL OR jsonb_typeof(p_decisions) <> 'object'
    OR length(btrim(coalesce(p_comment,''))) NOT BETWEEN 5 AND 500
    OR p_expected_active_version IS NULL OR p_expected_active_version < 0
    OR (SELECT count(*) FROM jsonb_object_keys(p_decisions)) > 60
  THEN RAISE EXCEPTION 'RBAC01_INPUT_INVALID' USING ERRCODE = '22023'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || p_role, 0));
  v_active_id := private.rbac01_active_version_id(p_role, statement_timestamp());
  IF v_active_id IS NOT NULL THEN
    SELECT version, decisions INTO v_active_version, v_decisions
    FROM private.rbac01_role_default_versions WHERE id = v_active_id;
  END IF;
  IF v_active_version <> p_expected_active_version THEN
    RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO v_next_version
  FROM private.rbac01_role_default_versions WHERE role = p_role;

  FOR v_key, v_value IN SELECT key, value #>> '{}' FROM jsonb_each(p_decisions)
  LOOP
    SELECT * INTO v_catalog FROM private.rbac_permission_catalog WHERE permission = v_key;
    IF v_catalog.permission IS NULL OR v_catalog.hard_restricted
      OR NOT (p_role = ANY(v_catalog.role_override_roles))
      OR v_value IS NULL OR v_value NOT IN ('allow','deny','inherit')
    THEN RAISE EXCEPTION 'RBAC01_PERMISSION_NOT_CONFIGURABLE' USING ERRCODE = '42501'; END IF;
    v_legacy_allowed := coalesce((v_catalog.legacy_defaults ->> p_role)::boolean, false);
    IF v_value IN ('allow','deny') AND NOT v_legacy_allowed THEN
      RAISE EXCEPTION 'RBAC01_ROLE_ESCALATION_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v_value = 'inherit' THEN v_decisions := v_decisions - v_key;
    ELSE v_decisions := jsonb_set(v_decisions, ARRAY[v_key], to_jsonb(v_value), true);
    END IF;
  END LOOP;

  INSERT INTO private.rbac01_role_default_versions(
    role, version, expected_active_version, expected_active_version_id,
    decisions, proposed_by, reason
  ) VALUES (
    p_role, v_next_version, p_expected_active_version, v_active_id,
    v_decisions, v_actor, btrim(p_comment)
  ) RETURNING id INTO v_id;
  INSERT INTO private.rbac01_role_default_events(
    version_id, role, event_type, actor_business_user_id, reason, before_state, after_state
  ) VALUES (
    v_id, p_role, 'proposal', v_actor, btrim(p_comment),
    coalesce((SELECT to_jsonb(v) FROM private.rbac01_role_default_versions v WHERE v.id = v_active_id), '{}'::jsonb),
    jsonb_build_object('version', v_next_version, 'decisions', v_decisions)
  );
  RETURN jsonb_build_object('id',v_id,'role',p_role,'version',v_next_version,'status','proposed','effective',false);
END;
$$;


--
-- Name: rbac01_revoke_role_defaults(text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_revoke_role_defaults(p_role text, p_expected_active_version integer, p_reason text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_id bigint; v_version integer;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_role NOT IN ('member','leader','admin') OR p_expected_active_version < 1
    OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'RBAC01_INPUT_INVALID' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || p_role, 0));
  v_id := private.rbac01_active_version_id(p_role,statement_timestamp());
  SELECT version INTO v_version FROM private.rbac01_role_default_versions WHERE id=v_id;
  IF v_version IS DISTINCT FROM p_expected_active_version THEN RAISE EXCEPTION 'RBAC01_VERSION_CONFLICT' USING ERRCODE='40001'; END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,effective_at,resulting_version_id,reason,before_state,after_state
  ) VALUES (v_id,p_role,'revocation',v_actor,clock_timestamp(),NULL,btrim(p_reason),
    jsonb_build_object('active_version',v_version),jsonb_build_object('active_version',NULL));
  RETURN jsonb_build_object('role',p_role,'version',v_version,'status','revoked','effective',true);
END;
$$;


--
-- Name: rbac01_rollback_role_defaults(bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac01_rollback_role_defaults(p_version_id bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_version private.rbac01_role_default_versions%ROWTYPE; v_active_id bigint;
BEGIN
  v_actor := private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'RBAC01_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_version FROM private.rbac01_role_default_versions WHERE id=p_version_id FOR UPDATE;
  IF v_version.id IS NULL THEN RAISE EXCEPTION 'RBAC01_VERSION_NOT_FOUND' USING ERRCODE='22023'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('rbac01:' || v_version.role, 0));
  v_active_id := private.rbac01_active_version_id(v_version.role,statement_timestamp());
  IF v_active_id IS DISTINCT FROM v_version.id THEN RAISE EXCEPTION 'RBAC01_ROLLBACK_NOT_ACTIVE' USING ERRCODE='40001'; END IF;
  INSERT INTO private.rbac01_role_default_events(
    version_id,role,event_type,actor_business_user_id,effective_at,resulting_version_id,reason,before_state,after_state
  ) VALUES (v_version.id,v_version.role,'rollback',v_actor,clock_timestamp(),v_version.expected_active_version_id,
    'Rollback to previous approved role policy',jsonb_build_object('version',v_version.version),
    jsonb_build_object('restored_version_id',v_version.expected_active_version_id));
  RETURN jsonb_build_object('id',v_version.id,'role',v_version.role,'status','rolled_back','effective',true,
    'restored_version_id',v_version.expected_active_version_id);
END;
$$;


--
-- Name: rbac02_list_account_overrides(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac02_list_account_overrides() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL OR private.current_system_permission()<>'admin' THEN
    RAISE EXCEPTION 'RBAC02_PERMISSION_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'target_business_user_id',a.target_business_user_id,'permission',a.permission,
    'version',a.version,'decision',a.decision,'actor_business_user_id',a.actor_business_user_id,
    'reason',a.reason,'expires_at',a.expires_at,'created_at',a.created_at
  ) ORDER BY a.target_business_user_id,a.permission),'[]'::jsonb) INTO v_result
  FROM private.rbac02_account_permission_versions a
  JOIN (SELECT DISTINCT ON (target_business_user_id,permission)
      target_business_user_id,permission,version
    FROM private.rbac02_account_permission_versions
    ORDER BY target_business_user_id,permission,version DESC) latest
    USING (target_business_user_id,permission,version);
  RETURN v_result;
END;
$$;


--
-- Name: rbac02_reset_account_override(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac02_reset_account_override(p_target_business_user_id text, p_permission text, p_reason text, p_expected_version integer) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,'reset',p_reason,NULL,p_expected_version)
$$;


--
-- Name: rbac02_revoke_account_override(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac02_revoke_account_override(p_target_business_user_id text, p_permission text, p_reason text, p_expected_version integer) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,'revoke',p_reason,NULL,p_expected_version)
$$;


--
-- Name: rbac02_set_account_override(text, text, text, text, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac02_set_account_override(p_target_business_user_id text, p_permission text, p_decision text, p_reason text, p_expires_at timestamp with time zone, p_expected_version integer) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT private.rbac02_append_account_decision(
    p_target_business_user_id,p_permission,p_decision,p_reason,p_expires_at,p_expected_version)
$$;


--
-- Name: rbac_permission_decision(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac_permission_decision(p_permission text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  RETURN private.rbac_permission_decision_for_user(v_actor,p_permission);
END;
$$;


--
-- Name: rbac_permission_decisions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rbac_permission_decisions() RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE v_actor text; v_result jsonb;
BEGIN
  v_actor:=private.current_business_user_id();
  IF v_actor IS NULL THEN RAISE EXCEPTION 'RBAC_AUTHENTICATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(private.rbac_permission_decision_for_user(v_actor,c.permission)
    ORDER BY c.permission),'[]'::jsonb) INTO v_result
  FROM private.rbac_permission_catalog c;
  RETURN v_result;
END;
$$;


--
-- Name: rc19_backfill_report_artifact_parent(uuid, integer, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_backfill_report_artifact_parent(p_operation_id uuid, p_fencing_version integer, p_provider text, p_external_file_id text, p_external_parent_id text, p_actor_business_user_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions; file_id text;
BEGIN
  IF p_provider <> 'google_drive' OR nullif(btrim(p_external_parent_id),'') IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_users u WHERE u.id = p_actor_business_user_id AND u.system_permission = 'admin'
      AND u.status = 'active' AND u.account_status = 'active' AND u.deleted_at IS NULL AND u.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'REPORT_ARTIFACT_PARENT_VERIFICATION_INVALID' USING ERRCODE = '42501'; END IF;
  SELECT stored_file_id INTO file_id FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id;
  IF file_id IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  PERFORM 1 FROM public.stored_files WHERE id = file_id FOR UPDATE;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.status <> 'manual_review' OR op.last_error_code <> 'LEGACY_PARENT_VERIFICATION_REQUIRED'
    OR op.attempt_count <> 0 OR op.fencing_version IS DISTINCT FROM p_fencing_version
    OR op.provider IS DISTINCT FROM p_provider OR op.external_file_id IS DISTINCT FROM p_external_file_id
    OR op.external_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001';
  END IF;
  UPDATE public.stored_files SET external_parent_id = p_external_parent_id, updated_at = clock_timestamp()
    WHERE id = op.stored_file_id AND report_id = op.report_id AND provider = op.provider
      AND external_file_id = op.external_file_id AND nullif(btrim(external_parent_id),'') IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_REFERENCE_CHANGED' USING ERRCODE = '40001'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET external_parent_id = p_external_parent_id,
    status = 'retryable_failure', last_error_code = NULL, updated_at = clock_timestamp() WHERE operation_id = op.operation_id;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,'legacy_parent_verified',op.fencing_version,p_actor_business_user_id);
  RETURN 'retryable_failure';
END;
$$;


--
-- Name: rc19_begin_report_artifact_deletion(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_begin_report_artifact_deletion(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.lease_actor IS DISTINCT FROM actor OR NOT private.rc19_artifact_delete_authorized(op.stored_file_id)
    OR op.status <> 'pending' OR op.lease_owner IS DISTINCT FROM p_lease_owner
    OR op.fencing_version IS DISTINCT FROM p_fencing_version OR op.lease_expires_at <= clock_timestamp()
    OR NOT EXISTS (SELECT 1 FROM public.stored_files f WHERE f.id = op.stored_file_id AND f.deleted_at IS NULL
      AND f.report_id = op.report_id AND f.provider = op.provider AND f.external_file_id = op.external_file_id
      AND f.external_parent_id = op.external_parent_id) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_CLAIM_INVALID' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'provider_deleting', attempt_count = attempt_count + 1,
    updated_at = clock_timestamp() WHERE operation_id = op.operation_id RETURNING * INTO op;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,actor);
  RETURN jsonb_build_object('operation_id',op.operation_id,'provider',op.provider,
    'external_file_id',op.external_file_id,'external_parent_id',op.external_parent_id);
END;
$$;


--
-- Name: rc19_claim_report_artifact_deletion(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_claim_report_artifact_deletion(p_file_id text, p_lease_owner uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE f public.stored_files; op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  IF p_file_id IS NULL OR p_lease_owner IS NULL OR NOT private.rc19_artifact_delete_authorized(p_file_id) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO f FROM public.stored_files WHERE id = p_file_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE stored_file_id = f.id FOR UPDATE;
  IF FOUND THEN
    IF op.requested_by <> actor AND private.current_system_permission() <> 'admin' THEN
      RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501';
    END IF;
    IF op.status = 'retryable_failure' OR (op.status = 'pending' AND op.lease_expires_at <= clock_timestamp()) THEN
      UPDATE public.rc19_report_artifact_deletions SET status = 'pending', lease_owner = p_lease_owner, lease_actor = actor,
        lease_expires_at = clock_timestamp() + interval '2 minutes', fencing_version = fencing_version + 1,
        last_error_code = NULL, updated_at = clock_timestamp() WHERE operation_id = op.operation_id RETURNING * INTO op;
      INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
        VALUES(op.operation_id,op.status,op.fencing_version,actor);
    ELSIF op.status = 'provider_deleting' AND op.lease_expires_at <= clock_timestamp() THEN
      UPDATE public.rc19_report_artifact_deletions SET status = 'manual_review',
        last_error_code = 'PROVIDER_OUTCOME_UNKNOWN', updated_at = clock_timestamp()
        WHERE operation_id = op.operation_id RETURNING * INTO op;
      INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
        VALUES(op.operation_id,op.status,op.fencing_version,actor);
    END IF;
    IF (op.status = 'pending' AND op.lease_owner <> p_lease_owner) OR op.status = 'provider_deleting' THEN
      RETURN jsonb_build_object('status','in_progress');
    END IF;
  ELSE
    IF f.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_NOT_FOUND' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.rc19_report_artifact_deletions(stored_file_id,report_id,provider,external_file_id,external_parent_id,requested_by,lease_actor,status,lease_owner,lease_expires_at,last_error_code)
      VALUES(f.id,f.report_id,f.provider,f.external_file_id,nullif(btrim(f.external_parent_id),''),actor,actor,
        CASE WHEN nullif(btrim(f.external_parent_id),'') IS NULL THEN 'manual_review' ELSE 'pending' END,
        p_lease_owner,clock_timestamp()+interval '2 minutes',
        CASE WHEN nullif(btrim(f.external_parent_id),'') IS NULL THEN 'LEGACY_PARENT_VERIFICATION_REQUIRED' ELSE NULL END)
      RETURNING * INTO op;
    INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
      VALUES(op.operation_id,op.status,op.fencing_version,actor);
  END IF;
  RETURN jsonb_build_object('operation_id',op.operation_id,'status',op.status,'fencing_version',op.fencing_version,
    'lease_owner',op.lease_owner,'provider',op.provider,'external_file_id',op.external_file_id,'external_parent_id',op.external_parent_id);
END;
$$;


--
-- Name: rc19_current_leader_brand_ids(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_current_leader_brand_ids(p_scope_key text) RETURNS SETOF text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT DISTINCT scope_row.brand_id
  FROM public.rc19_leader_brand_scopes AS scope_row
  JOIN public.brands AS brand ON brand.id = scope_row.brand_id
  WHERE private.current_business_user_is_active()
    AND private.current_system_permission() = 'leader'
    AND scope_row.leader_business_user_id = private.current_business_user_id()
    AND scope_row.scope_key = p_scope_key
    AND p_scope_key IN (
      'shifts.read', 'shifts.manage', 'staff.read', 'staff.manage', 'workforce.read',
      'reports.read', 'reports.submit', 'reports.review', 'reports.export'
    )
    AND scope_row.status = 'active'
    AND scope_row.valid_from <= statement_timestamp()
    AND (scope_row.valid_until IS NULL OR statement_timestamp() < scope_row.valid_until)
    AND brand.status = 'active'
    AND brand.archived_at IS NULL
    AND brand.deleted_at IS NULL
  ORDER BY scope_row.brand_id;
$$;


--
-- Name: rc19_export_report_bundle(text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_export_report_bundle(p_report_ids text[], p_kind text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE actor text := private.current_business_user_id(); role_name text := private.current_system_permission(); result jsonb;
BEGIN
  IF actor IS NULL OR NOT private.current_business_user_is_active()
    OR NOT public.rbac01_effective_permission('reports.export')
    OR p_kind IS NULL OR p_kind NOT IN ('reports','report','images') OR p_report_ids IS NULL
    OR cardinality(p_report_ids) < 1 OR cardinality(p_report_ids) > 500
    OR (SELECT count(DISTINCT id) FROM unnest(p_report_ids) id) <> cardinality(p_report_ids)
    OR (p_kind = 'report' AND cardinality(p_report_ids) <> 1)
    OR role_name NOT IN ('admin','leader') THEN
    RAISE EXCEPTION 'REPORT_EXPORT_DENIED' USING ERRCODE='42501';
  END IF;

  IF role_name = 'leader' AND EXISTS (
    SELECT 1 FROM unnest(p_report_ids) requested(id)
    LEFT JOIN public.reports r ON r.id=requested.id AND r.deleted_at IS NULL AND r.archived_at IS NULL
    LEFT JOIN public.shifts s ON s.id=r.shift_id
    WHERE r.id IS NULL OR NOT private.rc19_has_leader_brand_scope(s.brand_id,'reports.export')
  ) THEN RAISE EXCEPTION 'REPORT_EXPORT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;

  IF role_name = 'member' THEN
    RAISE EXCEPTION 'REPORT_EXPORT_DENIED' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_report_ids) requested(id)
    LEFT JOIN public.reports r ON r.id=requested.id AND r.deleted_at IS NULL AND r.archived_at IS NULL
    WHERE r.id IS NULL) THEN RAISE EXCEPTION 'REPORT_EXPORT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;

  IF (SELECT count(*) FROM public.shift_registrations sr JOIN public.reports r ON r.shift_id=sr.shift_id WHERE r.id=ANY(p_report_ids)) > 10000
    OR (p_kind='images' AND (SELECT count(*) FROM public.report_images i WHERE i.report_id=ANY(p_report_ids) AND i.deleted_at IS NULL) > 10000) THEN
    RAISE EXCEPTION 'REPORT_EXPORT_SIZE_LIMIT' USING ERRCODE='22023';
  END IF;

  SELECT jsonb_build_object(
    'reports', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id',r.id,'shift_id',r.shift_id,'revenue',r.revenue,'gmv',r.gmv,'orders',r.orders,
      'dashboard_platform',r.dashboard_platform,'platform_metrics',r.platform_metrics,'normalized_metrics',r.normalized_metrics,
      'average_order_value',r.average_order_value,'average_viewer',r.average_viewer,'live_duration_minutes',r.live_duration_minutes,
      'peak_viewer',r.peak_viewer,'product_clicks',r.product_clicks,'ctr',r.ctr,'cvr',r.cvr,'likes',r.likes,
      'comments',r.comments,'shares',r.shares,'status',r.status,'metrics_confirmed',r.metrics_confirmed,
      'confirmed_at',r.confirmed_at,'confirmed_by',r.confirmed_by,'created_at',r.created_at,'submitted_by',r.submitted_by,
      'final_recap',r.final_recap
    ) ORDER BY r.id) FROM public.reports r WHERE r.id=ANY(p_report_ids)), '[]'::jsonb),
    'shifts', coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'date',s.date,'start_time',s.start_time,'end_time',s.end_time,'brand_id',s.brand_id,'platform_id',s.platform_id,'campaign_id',s.campaign_id,'host_id',s.host_id,'support_id',s.support_id,'technical_id',s.technical_id,'studio',s.studio) ORDER BY s.id) FROM public.shifts s WHERE s.id IN (SELECT r.shift_id FROM public.reports r WHERE r.id=ANY(p_report_ids))), '[]'::jsonb),
    'registrations', coalesce((SELECT jsonb_agg(jsonb_build_object('id',sr.id,'shift_id',sr.shift_id,'user_id',sr.user_id,'operational_role',sr.operational_role,'status',sr.status) ORDER BY sr.id) FROM public.shift_registrations sr WHERE sr.shift_id IN (SELECT r.shift_id FROM public.reports r WHERE r.id=ANY(p_report_ids))), '[]'::jsonb),
    'images', CASE WHEN p_kind='images' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'report_id',i.report_id,'image_url',i.image_url,'storage_path',i.storage_path,'original_name',i.original_name,'mime_type',i.mime_type,'size_bytes',i.size_bytes,'image_type',i.image_type,'created_at',i.created_at) ORDER BY i.id) FROM public.report_images i WHERE i.report_id=ANY(p_report_ids) AND i.deleted_at IS NULL), '[]'::jsonb) ELSE '[]'::jsonb END,
    'brands', coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name)) FROM public.brands b WHERE b.id IN (SELECT s.brand_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids))), '[]'::jsonb),
    'platforms', coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)) FROM public.platforms p WHERE p.id IN (SELECT s.platform_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids))), '[]'::jsonb),
    'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)) FROM public.campaigns c WHERE c.id IN (SELECT s.campaign_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids))), '[]'::jsonb),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'full_name',u.full_name)) FROM public.business_users u WHERE u.id IN (
      SELECT r.submitted_by FROM public.reports r WHERE r.id=ANY(p_report_ids) UNION SELECT r.confirmed_by FROM public.reports r WHERE r.id=ANY(p_report_ids)
      UNION SELECT s.host_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids)
      UNION SELECT s.support_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids)
      UNION SELECT s.technical_id FROM public.shifts s JOIN public.reports r ON r.shift_id=s.id WHERE r.id=ANY(p_report_ids)
      UNION SELECT sr.user_id FROM public.shift_registrations sr JOIN public.reports r ON r.shift_id=sr.shift_id WHERE r.id=ANY(p_report_ids)
    )), '[]'::jsonb)
  ) INTO result;

  INSERT INTO public.rc19_report_export_audit(actor_business_user_id, report_count, export_kind)
  VALUES (actor, cardinality(p_report_ids), p_kind);
  RETURN result;
END;
$$;


--
-- Name: rc19_finalize_report_artifact_deletion(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_finalize_report_artifact_deletion(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions; file_id text;
BEGIN
  SELECT stored_file_id INTO file_id FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id;
  IF file_id IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  PERFORM 1 FROM public.stored_files WHERE id = file_id FOR UPDATE;
  SELECT * INTO op FROM public.rc19_report_artifact_deletions WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR op.lease_owner IS DISTINCT FROM p_lease_owner OR op.fencing_version IS DISTINCT FROM p_fencing_version
    OR op.status NOT IN ('provider_deleted','completed') THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001';
  END IF;
  IF op.status = 'completed' THEN RETURN 'completed'; END IF;
  UPDATE public.stored_files SET deleted_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = op.stored_file_id AND report_id = op.report_id AND provider = op.provider
      AND external_file_id = op.external_file_id AND external_parent_id = op.external_parent_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_REFERENCE_CHANGED' USING ERRCODE = '40001'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'completed', completed_at = clock_timestamp(),
    updated_at = clock_timestamp() WHERE operation_id = op.operation_id;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,'completed',op.fencing_version,op.lease_actor);
  RETURN 'completed';
END;
$$;


--
-- Name: rc19_reconcile_report_artifact_deleted(uuid, uuid, integer, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_reconcile_report_artifact_deleted(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer, p_provider text, p_external_file_id text, p_external_parent_id text, p_actor_business_user_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_users u WHERE u.id = p_actor_business_user_id
    AND u.system_permission = 'admin' AND u.status = 'active' AND u.account_status = 'active'
    AND u.deleted_at IS NULL AND u.archived_at IS NULL) THEN
    RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_AUTHORIZATION_INVALID' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = 'provider_deleted', last_error_code = NULL, updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND status = 'manual_review' AND attempt_count > 0
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version AND lease_expires_at <= clock_timestamp()
      AND provider = p_provider AND external_file_id = p_external_file_id AND external_parent_id = p_external_parent_id
    RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,p_actor_business_user_id);
  RETURN op.status;
END;
$$;


--
-- Name: rc19_record_report_artifact_delete_outcome(uuid, uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_record_report_artifact_delete_outcome(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer, p_success boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions;
BEGIN
  IF p_success IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_OUTCOME_INVALID'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = CASE WHEN p_success THEN 'provider_deleted' ELSE 'manual_review' END,
    last_error_code = CASE WHEN p_success THEN NULL ELSE 'PROVIDER_OUTCOME_UNKNOWN' END, updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND status = 'provider_deleting'
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,op.lease_actor);
  RETURN op.status;
END;
$$;


--
-- Name: rc19_release_report_artifact_delete_claim(uuid, uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_release_report_artifact_delete_claim(p_operation_id uuid, p_lease_owner uuid, p_fencing_version integer, p_needs_review boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE op public.rc19_report_artifact_deletions; actor text := private.current_business_user_id();
BEGIN
  IF actor IS NULL OR p_needs_review IS NULL THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_CLAIM_INVALID' USING ERRCODE = '42501'; END IF;
  UPDATE public.rc19_report_artifact_deletions SET status = CASE WHEN p_needs_review THEN 'manual_review' ELSE 'retryable_failure' END,
    last_error_code = CASE WHEN p_needs_review THEN 'REFERENCE_VERIFICATION_FAILED' ELSE 'PRE_PROVIDER_ABORTED' END,
    updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id AND lease_actor = actor AND status = 'pending'
      AND lease_owner = p_lease_owner AND fencing_version = p_fencing_version RETURNING * INTO op;
  IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_ARTIFACT_DELETE_FENCE_INVALID' USING ERRCODE = '40001'; END IF;
  INSERT INTO public.rc19_report_artifact_deletion_events(operation_id,status,fencing_version,actor_business_user_id)
    VALUES(op.operation_id,op.status,op.fencing_version,actor);
  RETURN op.status;
END;
$$;


--
-- Name: rc19_leader_brand_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rc19_leader_brand_scopes (
    id bigint NOT NULL,
    leader_business_user_id text NOT NULL,
    brand_id text NOT NULL,
    scope_key text NOT NULL,
    status text NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    revoked_at timestamp with time zone,
    version integer NOT NULL,
    granted_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT rc19_leader_brand_scope_status_check CHECK ((((status = 'active'::text) AND (revoked_at IS NULL)) OR ((status = 'revoked'::text) AND (revoked_at IS NOT NULL)))),
    CONSTRAINT rc19_leader_brand_scope_window_check CHECK (((valid_until IS NULL) OR (valid_until > valid_from))),
    CONSTRAINT rc19_leader_brand_scopes_scope_key_check CHECK ((scope_key = ANY (ARRAY['shifts.read'::text, 'shifts.manage'::text, 'staff.read'::text, 'staff.manage'::text, 'workforce.read'::text, 'reports.read'::text, 'reports.submit'::text, 'reports.review'::text, 'reports.export'::text]))),
    CONSTRAINT rc19_leader_brand_scopes_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text]))),
    CONSTRAINT rc19_leader_brand_scopes_version_check CHECK ((version > 0))
);


--
-- Name: TABLE rc19_leader_brand_scopes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rc19_leader_brand_scopes IS 'Admin-managed, versioned Leader-to-Brand data authority. Team grants are intentionally unsupported until a key-backed team relation exists.';


--
-- Name: rc19_set_leader_brand_scope(text, text, text, boolean, integer, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rc19_set_leader_brand_scope(p_user_id text, p_brand_id text, p_scope_key text, p_enabled boolean, p_expected_version integer, p_valid_from timestamp with time zone DEFAULT statement_timestamp(), p_valid_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reason text DEFAULT NULL::text) RETURNS public.rc19_leader_brand_scopes
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_id text := private.current_business_user_id();
  target public.business_users;
  target_brand public.brands;
  current_scope public.rc19_leader_brand_scopes;
  saved_scope public.rc19_leader_brand_scopes;
  current_version integer := 0;
  event_kind text;
  clean_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION 'ADMIN_SCOPE_MANAGEMENT_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_brand_id IS NULL OR p_scope_key NOT IN (
    'shifts.read', 'shifts.manage', 'staff.read', 'staff.manage', 'workforce.read',
    'reports.read', 'reports.submit', 'reports.review', 'reports.export'
  ) OR p_enabled IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
    OR clean_reason IS NULL OR length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'LEADER_BRAND_SCOPE_INVALID' USING ERRCODE = '22023';
  END IF;
  IF p_enabled AND (p_valid_from IS NULL OR (p_valid_until IS NOT NULL AND p_valid_until <= p_valid_from)) THEN
    RAISE EXCEPTION 'LEADER_BRAND_SCOPE_WINDOW_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target FROM public.business_users WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEADER_BRAND_SCOPE_TARGET_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF p_enabled AND (target.system_permission <> 'leader' OR target.status <> 'active'
      OR target.account_status <> 'active' OR target.archived_at IS NOT NULL OR target.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'LEADER_BRAND_SCOPE_TARGET_NOT_ACTIVE_LEADER' USING ERRCODE = '42501';
  END IF;
  IF p_enabled THEN
    SELECT * INTO target_brand FROM public.brands WHERE id = p_brand_id FOR SHARE;
    IF NOT FOUND OR target_brand.status <> 'active' OR target_brand.archived_at IS NOT NULL OR target_brand.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'LEADER_BRAND_SCOPE_BRAND_NOT_ACTIVE' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_user_id || chr(31) || p_brand_id || chr(31) || p_scope_key, 0
  ));
  SELECT * INTO current_scope FROM public.rc19_leader_brand_scopes
  WHERE leader_business_user_id = p_user_id AND brand_id = p_brand_id AND scope_key = p_scope_key
  FOR UPDATE;
  IF FOUND THEN current_version := current_scope.version; END IF;
  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'LEADER_BRAND_SCOPE_VERSION_CONFLICT' USING ERRCODE = '40001';
  END IF;
  IF NOT p_enabled AND current_version = 0 THEN
    RAISE EXCEPTION 'LEADER_BRAND_SCOPE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_enabled THEN
    INSERT INTO public.rc19_leader_brand_scopes AS scope_row (
      leader_business_user_id, brand_id, scope_key, status, valid_from, valid_until,
      revoked_at, version, granted_by, updated_by
    ) VALUES (
      p_user_id, p_brand_id, p_scope_key, 'active', p_valid_from, p_valid_until,
      NULL, current_version + 1, actor_id, actor_id
    )
    ON CONFLICT (leader_business_user_id, brand_id, scope_key) DO UPDATE SET
      status = 'active', valid_from = EXCLUDED.valid_from, valid_until = EXCLUDED.valid_until,
      revoked_at = NULL, version = scope_row.version + 1,
      granted_by = EXCLUDED.granted_by, updated_by = EXCLUDED.updated_by,
      updated_at = statement_timestamp()
    RETURNING * INTO saved_scope;
    event_kind := CASE WHEN current_version = 0 THEN 'grant' ELSE 'update' END;
  ELSE
    UPDATE public.rc19_leader_brand_scopes
    SET status = 'revoked', revoked_at = statement_timestamp(), version = version + 1,
        updated_by = actor_id, updated_at = statement_timestamp()
    WHERE id = current_scope.id
    RETURNING * INTO saved_scope;
    event_kind := 'revoke';
  END IF;

  INSERT INTO public.rc19_leader_brand_scope_events (
    scope_id, leader_business_user_id, brand_id, scope_key, event_type,
    prior_status, new_status, version, actor_business_user_id, reason
  ) VALUES (
    saved_scope.id, saved_scope.leader_business_user_id, saved_scope.brand_id, saved_scope.scope_key,
    event_kind, current_scope.status, saved_scope.status, saved_scope.version, actor_id, clean_reason
  );
  RETURN saved_scope;
END;
$$;


--
-- Name: record_report_ocr_run(text, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_report_ocr_run(p_report_id text, p_review jsonb, p_rerun boolean) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: record_schedule_import_batch_outcomes(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_schedule_import_batch_outcomes(p_batch_id text, p_outcomes jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
  v_index integer;
  v_count integer;
  v_item jsonb;
  v_outcome text;
  v_expected_outcome text;
  v_current_outcome text;
  v_current_shift_id text;
  v_current_failure_code text;
  v_requested_shift_id text;
  v_requested_failure_code text;
  v_source_row jsonb;
begin
  v_actor_id := private.require_shift_actor(true);
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_OUTCOMES_INVALID';
  end if;
  v_count := jsonb_array_length(p_outcomes);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = 'IMPORT_OUTCOMES_LIMIT';
  end if;

  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status not in ('previewed', 'failed', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  for v_index in 0..v_count - 1 loop
    v_item := p_outcomes->v_index;
    v_outcome := v_item->>'outcome';
    v_expected_outcome := v_item->>'expected_outcome';
    v_requested_shift_id := nullif(v_item->>'shift_id', '');
    v_requested_failure_code := nullif(v_item->>'failure_code', '');

    if v_item->>'row_number' is null
      or v_item->>'row_number' !~ '^[0-9]+$'
    then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    if v_outcome not in ('imported', 'validation_failed', 'duplicate_skipped', 'warning', 'retryable') then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_INVALID';
    end if;
    if v_expected_outcome not in ('pending', 'validation_failed', 'retryable') then
      raise exception using errcode = '22023', message = 'IMPORT_EXPECTED_OUTCOME_INVALID';
    end if;
    if v_outcome in ('imported', 'warning') and v_requested_shift_id is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_REQUIRED';
    end if;
    if v_outcome = 'retryable' and v_requested_failure_code is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_FAILURE_CODE_REQUIRED';
    end if;

    select outcome, shift_id, failure_code, source_row
      into v_current_outcome, v_current_shift_id, v_current_failure_code, v_source_row
    from public.schedule_import_batch_rows
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
    end if;

    -- A replay of the same finalized result is a successful no-op. This is
    -- what lets two confirmations race safely after one already recorded the
    -- row. Duplicate-skipped rows intentionally have no persisted shift link;
    -- the incoming candidate link is therefore ignored for this comparison.
    if v_current_outcome in ('imported', 'warning', 'duplicate_skipped') then
      if v_current_outcome = v_outcome
        and (
          v_current_outcome = 'duplicate_skipped'
          or v_current_shift_id = v_requested_shift_id
        )
        and v_current_failure_code is null
      then
        continue;
      end if;
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_ALREADY_FINALIZED';
    end if;

    -- A confirmed batch is immutable except for the idempotent finalized-row
    -- replay above. Any unresolved row is a real lifecycle conflict.
    if v_batch.status = 'confirmed' then
      raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
    end if;
    if v_current_outcome <> v_expected_outcome then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;

    -- Imported/warning outcomes may link either to a Shift created by this
    -- batch or to the one existing Shift whose canonical slot is represented
    -- by the persisted source row. No caller-supplied identity fields are
    -- consulted, and the existing Shift's import provenance is untouched.
    if v_outcome in ('imported', 'warning') and not exists (
      select 1
      from public.shifts as linked_shift
      where linked_shift.id = v_requested_shift_id
        and (
          linked_shift.import_batch_id = p_batch_id
          or (
            nullif(btrim(v_source_row->>'date'), '') is not null
            and nullif(btrim(v_source_row->>'start_time'), '') is not null
            and nullif(btrim(v_source_row->>'end_time'), '') is not null
            and nullif(btrim(v_source_row->>'brand_name'), '') is not null
            and nullif(btrim(v_source_row->>'platform_name'), '') is not null
            and linked_shift.date::text = btrim(v_source_row->>'date')
            and left(linked_shift.start_time::text, 5) = btrim(v_source_row->>'start_time')
            and left(linked_shift.end_time::text, 5) = btrim(v_source_row->>'end_time')
            and exists (
              select 1
              from public.brands as source_brand
              where source_brand.id = linked_shift.brand_id
                and lower(btrim(source_brand.name)) = lower(btrim(v_source_row->>'brand_name'))
                and (
                  select count(*)
                  from public.brands as matching_brand
                  where lower(btrim(matching_brand.name)) = lower(btrim(v_source_row->>'brand_name'))
                ) = 1
            )
            and exists (
              select 1
              from public.platforms as source_platform
              where source_platform.id = linked_shift.platform_id
                and lower(btrim(source_platform.name)) = lower(btrim(v_source_row->>'platform_name'))
                and (
                  select count(*)
                  from public.platforms as matching_platform
                  where lower(btrim(matching_platform.name)) = lower(btrim(v_source_row->>'platform_name'))
                ) = 1
            )
          )
        )
    ) then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_MISMATCH';
    end if;

    update public.schedule_import_batch_rows
    set
      outcome = v_outcome,
      shift_id = case
        when v_outcome in ('imported', 'warning') then v_requested_shift_id
        else null
      end,
      failure_code = case
        when v_outcome = 'retryable' then v_requested_failure_code
        else null
      end
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int
      and outcome = v_expected_outcome;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
  end loop;
end;
$_$;


--
-- Name: FUNCTION record_schedule_import_batch_outcomes(p_batch_id text, p_outcomes jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.record_schedule_import_batch_outcomes(p_batch_id text, p_outcomes jsonb) IS 'CAS-protected schedule import outcomes; links created or canonically enriched existing shifts.';


--
-- Name: refresh_automatic_shift_statuses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_automatic_shift_statuses() RETURNS TABLE(updated_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.require_shift_actor(true);
  return query select private.refresh_automatic_shift_statuses_scheduled();
end;
$$;


--
-- Name: register_for_shift(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_for_shift(p_shift_id text, p_role text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift public.shifts;
  created_registration public.shift_registrations;
  settings_row public.system_settings;
begin
  actor_id := private.require_shift_actor(false);
  select * into settings_row from public.system_settings limit 1;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.status <> 'scheduled'
    or target_shift.registration_locked
    or target_shift.end_at <= statement_timestamp()
    or target_shift.registration_cutoff_at <= statement_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_CLOSED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id, 91731));
  perform private.assert_shift_role_eligibility(actor_id, p_role);
  perform private.assert_shift_capacity(target_shift, p_role, null);
  perform private.assert_no_shift_registration_conflict(actor_id, target_shift, p_role, null);

  insert into public.shift_registrations (
    shift_id, user_id, operational_role, status, source, reviewed_by, reviewed_at
  ) values (
    p_shift_id,
    actor_id,
    p_role,
    case when settings_row.require_registration_approval then 'pending' else 'approved' end,
    'self_registration',
    case when settings_row.require_registration_approval then null else actor_id end,
    case when settings_row.require_registration_approval then null else statement_timestamp() end
  ) returning * into created_registration;
  if not settings_row.require_registration_approval and settings_row.auto_lock_filled_shifts then
    perform private.refresh_shift_registration_lock(p_shift_id, false);
  end if;
  return created_registration;
end;
$$;


--
-- Name: reject_account_request(uuid, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_account_request(p_request_id uuid, p_expected_version integer, p_rejection_reason text) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_reason text;
  v_request public.account_requests;
begin
  v_actor_id := private.require_staff_admin();

  select request_row.*
    into v_request
  from public.account_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ACCOUNT_REQUEST_NOT_FOUND';
  end if;

  if v_request.status = 'rejected' then
    return v_request;
  end if;

  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_NOT_PENDING';
  end if;

  v_reason := btrim(coalesce(p_rejection_reason, ''));
  if v_reason = '' then
    raise exception using errcode = '22023', message = 'ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception using errcode = '22023', message = 'ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG';
  end if;

  if p_expected_version is null or p_expected_version <> v_request.version then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  update public.account_requests as request_row
  set status = 'rejected',
      reviewed_at = statement_timestamp(),
      reviewed_by = v_actor_id,
      rejection_reason = v_reason,
      provisioning_status = 'not_started',
      version = request_row.version + 1
  where request_row.id = p_request_id
    and request_row.status = 'pending'
    and request_row.version = p_expected_version
  returning * into v_request;

  if not found then
    raise exception using errcode = 'P0001', message = 'ACCOUNT_REQUEST_REVIEW_STALE';
  end if;

  return v_request;
end;
$$;


--
-- Name: FUNCTION reject_account_request(p_request_id uuid, p_expected_version integer, p_rejection_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reject_account_request(p_request_id uuid, p_expected_version integer, p_rejection_reason text) IS 'Admin-only Phase 2 review transition. Does not provision Auth or Staff.';


--
-- Name: reject_report_review(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_report_review(p_report_id text, p_notes text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: reject_shift_registration(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_shift_registration(p_registration_id text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift_id text;
  target_registration public.shift_registrations;
begin
  actor_id := private.require_shift_actor(true);
  select shift_id into target_shift_id
  from public.shift_registrations where id = p_registration_id;
  if target_shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  perform 1 from public.shifts where id = target_shift_id for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id for update;
  if target_registration.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  update public.shift_registrations
  set status = 'rejected', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes
  where id = p_registration_id
  returning * into target_registration;
  return target_registration;
end;
$$;


--
-- Name: reject_shift_registration(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_shift_registration(p_registration_id text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.reject_shift_registration(p_registration_id, p_notes);
end;
$$;


--
-- Name: reject_shift_swap_request(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_shift_swap_request(p_request_id text, p_notes text DEFAULT NULL::text) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare actor_id text; request_row public.swap_requests; history_entry jsonb;
begin
  actor_id := private.require_shift_actor(true);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.status not in ('pending', 'accepted') then raise exception using errcode = 'P0001', message = 'SWAP_NOT_REJECTABLE'; end if;
  history_entry := jsonb_build_object(
    'action', 'rejected', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', 'rejected',
    'reason', request_row.reason, 'notes', p_notes, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'rejected', approved_by = actor_id, approved_at = statement_timestamp(),
      notes = coalesce(p_notes, notes), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;


--
-- Name: reject_shift_swap_request(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_shift_swap_request(p_request_id text, p_notes text, p_expected_version integer) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.reject_shift_swap_request(p_request_id, p_notes);
end;
$$;


--
-- Name: reject_staff_account(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_staff_account(p_user_id text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
  v_email_verified boolean;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_REJECTION_DENIED';
  end if;
  select * into v_result
  from public.business_users
  where id = p_user_id
    and account_status = 'pending_approval'
    and archived_at is null
    and deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_PENDING_ACCOUNT_NOT_FOUND';
  end if;
  if v_result.auth_user_id is not null then
    select auth_user.email_confirmed_at is not null
      into v_email_verified
    from auth.users as auth_user
    where auth_user.id = v_result.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
  end if;
  update public.business_users
  set status = 'inactive',
      account_status = 'rejected',
      email_verified = coalesce(v_email_verified, email_verified)
  where id = p_user_id
  returning * into v_result;
  return v_result;
end;
$$;


--
-- Name: release_operational_storage_folder_lock(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_operational_storage_folder_lock(p_lock_key text, p_owner uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  delete from public.operational_storage_folder_locks
    where lock_key = p_lock_key and lock_owner = p_owner;
  return found;
end;
$$;


--
-- Name: remove_live_report_image(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_live_report_image(p_image_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: remove_report_image(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_report_image(p_image_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: remove_shift_staffing(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_shift_staffing(p_registration_id text, p_notes text DEFAULT NULL::text) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift public.shifts;
  target_registration public.shift_registrations;
begin
  actor_id := private.require_shift_actor(true);
  select shift_id into target_registration.shift_id
  from public.shift_registrations where id = p_registration_id;
  if target_registration.shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  select * into target_shift from public.shifts
  where id = target_registration.shift_id and deleted_at is null and archived_at is null
  for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id for update;
  if target_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_registration.user_id, 91731));
  update public.shift_registrations
  set status = 'removed', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes,
      cancelled_at = statement_timestamp()
  where id = p_registration_id
  returning * into target_registration;
  perform private.refresh_shift_registration_lock(target_shift.id, true);
  return target_registration;
end;
$$;


--
-- Name: remove_shift_staffing(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_shift_staffing(p_registration_id text, p_notes text, p_expected_version integer) RETURNS public.shift_registrations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.remove_shift_staffing(p_registration_id, p_notes);
end;
$$;


--
-- Name: reopen_report(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reopen_report(p_report_id text, p_reason text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: reorder_live_report_images(text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reorder_live_report_images(p_report_id text, p_ordered_ids text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: reset_report_ocr(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_report_ocr(p_report_id text, p_reason text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: respond_shift_swap_request(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_shift_swap_request(p_request_id text, p_action text, p_notes text DEFAULT NULL::text) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  request_row public.swap_requests;
  participant_id text;
  next_status text;
  history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  if p_action not in ('accept', 'reject') then
    raise exception using errcode = '22023', message = 'SWAP_ACTION_INVALID';
  end if;
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then
    raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY';
  end if;
  if request_row.status <> 'pending' then raise exception using errcode = 'P0001', message = 'SWAP_NOT_PENDING'; end if;
  participant_id := case when request_row.mode = 'replacement' then request_row.replacement_staff_id else request_row.counterpart_id end;
  if participant_id <> actor_id then raise exception using errcode = '42501', message = 'SWAP_NOT_SELECTED_PARTICIPANT'; end if;
  next_status := case when p_action = 'accept' then 'accepted' else 'rejected' end;
  history_entry := jsonb_build_object(
    'action', case when p_action = 'accept' then 'accepted' else 'rejected' end,
    'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', next_status,
    'reason', request_row.reason, 'notes', p_notes, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = next_status, responded_at = statement_timestamp(), responded_by = actor_id,
      notes = coalesce(p_notes, notes), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;


--
-- Name: respond_shift_swap_request(text, text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.respond_shift_swap_request(p_request_id text, p_action text, p_notes text, p_expected_version integer) RETURNS public.swap_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.respond_shift_swap_request(p_request_id, p_action, p_notes);
end;
$$;


--
-- Name: restore_report(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_report(p_report_id text, p_reason text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: restore_shift(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_shift(p_shift_id text) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  actor_permission text;
  target_shift public.shifts;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  actor_permission := private.current_system_permission();
  if actor_permission <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  select * into target_shift
  from public.shifts
  where id = p_shift_id
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.deleted_at is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_DELETED';
  end if;

  update public.shifts as shift
  set
    status = 'scheduled',
    deleted_at = null,
    deleted_by = null,
    deletion_reason = null,
    registration_locked = false,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;


--
-- Name: FUNCTION restore_shift(p_shift_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.restore_shift(p_shift_id text) IS 'Admin-only lifecycle restore of a soft-deleted shift.';


--
-- Name: restore_shift(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_shift(p_shift_id text, p_expected_version integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.restore_shift(p_shift_id);
end;
$$;


--
-- Name: restore_staff_member(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.restore_staff_member(p_user_id text, p_reason text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.require_staff_admin();
  v_result public.business_users;
begin
  if p_user_id = v_actor_id then
    raise exception using errcode = '42501', message = 'STAFF_SELF_RESTORE_DENIED';
  end if;
  update public.business_users
  set status = 'active', archived_at = null, archived_by = null,
      deleted_at = null, deleted_by = null, deletion_reason = null
  where id = p_user_id and (archived_at is not null or deleted_at is not null)
  returning * into v_result;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_ARCHIVED_RECORD_NOT_FOUND';
  end if;
  return v_result;
end;
$$;


--
-- Name: return_shift_to_automatic(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.return_shift_to_automatic(p_shift_id text, p_expected_version integer DEFAULT NULL::integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_shift public.shifts;
  updated_shift public.shifts;
begin
  perform private.require_shift_actor(true);
  select * into current_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if current_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if p_expected_version is null or p_expected_version <> current_shift.version then
    raise exception using errcode = 'P0001', message = 'STALE_WRITE';
  end if;
  if current_shift.status = 'cancelled' then
    raise exception using errcode = 'P0001', message = 'SHIFT_CANCELLED_CANNOT_AUTO';
  end if;
  perform set_config('app.shift_status_mode_override', 'auto', true);
  update public.shifts as shift
  set status = case
    when statement_timestamp() >= shift.end_at then 'completed'
    when statement_timestamp() >= shift.start_at then 'live'
    when statement_timestamp() >= shift.registration_cutoff_at then 'preparing'
    else 'scheduled'
  end,
  status_mode = 'auto'
  where shift.id = p_shift_id
  returning * into updated_shift;
  return updated_shift;
end;
$$;


--
-- Name: search_staffing_candidates(text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_staffing_candidates(p_shift_id text, p_role text, p_search text DEFAULT ''::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  actor_role text;
  target_shift public.shifts;
  normalized_search text;
  result jsonb;
BEGIN
  PERFORM private.require_shift_actor(true);

  IF NOT private.rbac_has_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  actor_role := private.current_system_permission();
  IF actor_role NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION 'OPERATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OPERATIONAL_ROLE_INVALID';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
    OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAGINATION_INVALID';
  END IF;
  IF pg_catalog.length(coalesce(p_search, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SEARCH_TOO_LONG';
  END IF;

  SELECT s.* INTO target_shift
  FROM public.shifts AS s
  WHERE s.id = p_shift_id
    AND s.deleted_at IS NULL
    AND s.archived_at IS NULL
    AND (
      actor_role = 'admin'
      OR (actor_role = 'leader'
        AND private.rc19_has_any_leader_brand_scope(s.brand_id, ARRAY['shifts.manage']::text[]))
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  normalized_search := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));

  WITH eligible AS MATERIALIZED (
    SELECT u.id AS user_id, u.full_name
    FROM public.business_users AS u
    WHERE u.status = 'active'
      AND u.account_status = 'active'
      AND u.archived_at IS NULL
      AND u.deleted_at IS NULL
      AND u.operational_roles @> ARRAY[p_role]::text[]
      AND (normalized_search = '' OR pg_catalog.strpos(pg_catalog.lower(u.full_name), normalized_search) > 0)
  ), paged_users AS MATERIALIZED (
    SELECT user_id, full_name FROM eligible
    ORDER BY pg_catalog.lower(full_name), user_id
    LIMIT p_limit OFFSET p_offset
  ), availability_rows AS (
    SELECT e.user_id, e.full_name,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.shift_registrations AS same_shift
          WHERE same_shift.shift_id = target_shift.id
            AND same_shift.user_id = e.user_id
            AND same_shift.status IN ('pending', 'approved', 'manually_assigned')
            AND (same_shift.operational_role = p_role OR NOT target_shift.allow_multi_role)
        ) THEN 'already_on_shift'
        WHEN EXISTS (
          SELECT 1
          FROM public.shift_registrations AS r
          JOIN public.shifts AS other_shift ON other_shift.id = r.shift_id
          WHERE r.user_id = e.user_id
            AND r.shift_id <> target_shift.id
            AND r.status IN ('pending', 'approved', 'manually_assigned')
            AND other_shift.deleted_at IS NULL
            AND other_shift.archived_at IS NULL
            AND other_shift.status <> 'cancelled'
            AND other_shift.start_at < target_shift.end_at
            AND other_shift.end_at > target_shift.start_at
        ) THEN 'conflict'
        ELSE 'available'
      END AS availability
    FROM paged_users AS e
  )
  SELECT pg_catalog.jsonb_build_object(
    'total', (SELECT count(*) FROM eligible),
    'items', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(availability_rows)
        ORDER BY pg_catalog.lower(availability_rows.full_name), availability_rows.user_id)
      FROM availability_rows
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;


--
-- Name: self_attendance_record(text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.self_attendance_record(p_shift_id text, p_operational_role text, p_event_kind text, p_request_id uuid, p_evidence_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
 v_actor text;
 v_shift public.shifts;
 v_existing public.self_attendance_events;
 v_now timestamptz := statement_timestamp();
 v_assigned boolean;
 v_surrendered boolean;
begin
 v_actor := private.require_shift_actor(false);
 if p_shift_id is null or btrim(p_shift_id)='' or p_request_id is null or
    p_operational_role not in ('host','support','technical') or
    p_event_kind not in ('check_in','check_out') or
    (p_evidence_note is not null and char_length(p_evidence_note)>2000) then
   raise exception using errcode='22023', message='ATTENDANCE_REQUEST_INVALID';
 end if;

 -- Idempotent retry, scoped to exact actor + request payload.
 select * into v_existing from public.self_attendance_events where request_id=p_request_id;
 if found then
   if v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
       raise exception using errcode='23505', message='ATTENDANCE_REQUEST_ID_REUSED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 -- Hold the shift lock to serialize against swap/assignment changes.
 select * into v_shift from public.shifts
 where id=p_shift_id and deleted_at is null and archived_at is null for share;
 if not found or v_shift.start_at is null or v_shift.end_at is null or
    v_shift.end_at <= v_shift.start_at or
    v_shift.status not in ('scheduled','preparing','live','paused','completed') then
   raise exception using errcode='P0001', message='ATTENDANCE_SHIFT_NOT_ELIGIBLE';
 end if;

 -- An approved exchange/replacement surrenders the old person's source shift.
 select exists (
   select 1 from public.swap_requests sw
   where sw.status in ('approved','completed') and sw.deleted_at is null
     and sw.mode in ('replacement','exchange')
     and (
       (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and sw.requester_id=v_actor and sw.operational_role=p_operational_role)
       or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.counterpart_id=v_actor and sw.operational_role=p_operational_role)
     )
 ) into v_surrendered;
 if v_surrendered then
   raise exception using errcode='42501', message='ATTENDANCE_ASSIGNMENT_SURRENDERED';
 end if;

 select (
   (p_operational_role='host' and v_shift.host_id=v_actor) or
   (p_operational_role='support' and v_shift.support_id=v_actor) or
   (p_operational_role='technical' and v_shift.technical_id=v_actor) or
   exists (select 1 from public.shift_registrations sr
      where sr.shift_id=p_shift_id and sr.user_id=v_actor
        and sr.operational_role=p_operational_role
        and sr.status in ('approved','manually_assigned')) or
   exists (select 1 from public.swap_requests sw
      where sw.status in ('approved','completed') and sw.deleted_at is null
        and sw.operational_role=p_operational_role
        and (
          (coalesce(sw.source_shift_id,sw.shift_id)=p_shift_id and
            coalesce(sw.counterpart_id,sw.replacement_staff_id)=v_actor
            and coalesce(sw.counterpart_id,sw.replacement_staff_id)<>sw.requester_id)
          or (sw.mode='exchange' and sw.target_shift_id=p_shift_id and sw.requester_id=v_actor and
              sw.requester_id<>sw.counterpart_id)
        ))
 ) into v_assigned;
 if not coalesce(v_assigned,false) then
   raise exception using errcode='42501', message='ATTENDANCE_NOT_ASSIGNED';
 end if;

 if p_event_kind='check_in' then
   if v_shift.status='completed' or v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKIN_OUTSIDE_WINDOW';
   end if;
 else
   if v_now < v_shift.start_at-interval '2 hours' or v_now>v_shift.end_at+interval '6 hours' then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_OUTSIDE_WINDOW';
   end if;
   if not exists (
     select 1 from public.self_attendance_events ev where ev.shift_id=p_shift_id
     and ev.staff_id=v_actor and ev.operational_role=p_operational_role
     and ev.event_kind='check_in' and ev.recorded_at<=v_now
   ) then
     raise exception using errcode='22023',message='ATTENDANCE_CHECKOUT_REQUIRES_CHECKIN';
   end if;
 end if;

 insert into public.self_attendance_events
  (request_id,shift_id,staff_id,operational_role,event_kind,evidence_note)
 values
  (p_request_id,p_shift_id,v_actor,p_operational_role,p_event_kind,nullif(btrim(p_evidence_note),''))
 on conflict do nothing returning * into v_existing;
 if not found then
   -- Concurrent idempotent retry is the ONLY acceptable duplicate.
   select * into v_existing from public.self_attendance_events where request_id=p_request_id;
   if not found or v_existing.staff_id<>v_actor or v_existing.shift_id<>p_shift_id or
      v_existing.operational_role<>p_operational_role or v_existing.event_kind<>p_event_kind or
      v_existing.evidence_note is distinct from nullif(btrim(p_evidence_note),'') then
     raise exception using errcode='23505',message='ATTENDANCE_ALREADY_RECORDED';
   end if;
   return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
       'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
       'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
       'verification_status',v_existing.verification_status,'replayed',true);
 end if;

 return jsonb_build_object('event_id',v_existing.id,'shift_id',v_existing.shift_id,
     'staff_id',v_existing.staff_id,'role',v_existing.operational_role,
     'event',v_existing.event_kind,'recorded_at',v_existing.recorded_at,
     'verification_status',v_existing.verification_status,'replayed',false);
end $$;


--
-- Name: server_begin_account_request_provisioning(uuid, integer, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.server_begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean, p_actor_auth_user_id uuid) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.begin_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_retry
  );
end;
$$;


--
-- Name: FUNCTION server_begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean, p_actor_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.server_begin_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_retry boolean, p_actor_auth_user_id uuid) IS 'Server-only Phase-3 provisioning claim with database-validated Admin actor.';


--
-- Name: server_complete_account_request_provisioning(uuid, integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.server_complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text, p_actor_auth_user_id uuid) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.complete_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_provisioning_status
  );
end;
$$;


--
-- Name: FUNCTION server_complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text, p_actor_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.server_complete_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_provisioning_status text, p_actor_auth_user_id uuid) IS 'Server-only Phase-3 completion with database-validated Admin actor.';


--
-- Name: server_ensure_account_request_identity(uuid, integer, uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.server_ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text, p_actor_auth_user_id uuid) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.ensure_account_request_identity(
    p_request_id,
    p_expected_version,
    p_auth_user_id,
    p_staff_id
  );
end;
$$;


--
-- Name: FUNCTION server_ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text, p_actor_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.server_ensure_account_request_identity(p_request_id uuid, p_expected_version integer, p_auth_user_id uuid, p_staff_id text, p_actor_auth_user_id uuid) IS 'Server-only Phase-3 Staff/Auth reconciliation with database-validated Admin actor.';


--
-- Name: server_fail_account_request_provisioning(uuid, integer, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.server_fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text, p_actor_auth_user_id uuid) RETURNS public.account_requests
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform private.set_provisioning_actor(p_actor_auth_user_id);
  return public.fail_account_request_provisioning(
    p_request_id,
    p_expected_version,
    p_error_code
  );
end;
$$;


--
-- Name: FUNCTION server_fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text, p_actor_auth_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.server_fail_account_request_provisioning(p_request_id uuid, p_expected_version integer, p_error_code text, p_actor_auth_user_id uuid) IS 'Server-only Phase-3 failure recording with database-validated Admin actor.';


--
-- Name: set_live_report_image_cover(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_live_report_image_cover(p_report_id text, p_image_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: set_shift_registration_lock(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shift_registration_lock(p_shift_id text, p_locked boolean) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target_shift public.shifts;
begin
  actor_id := private.require_shift_actor(true);
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if not p_locked and (
    target_shift.status <> 'scheduled' or target_shift.end_at <= statement_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SHIFT_CANNOT_REOPEN';
  end if;
  update public.shifts
  set registration_locked = p_locked, updated_by = actor_id
  where id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;


--
-- Name: set_shift_registration_lock(text, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_shift_registration_lock(p_shift_id text, p_locked boolean, p_expected_version integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.set_shift_registration_lock(p_shift_id, p_locked);
end;
$$;


--
-- Name: soft_delete_report(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_report(p_report_id text, p_reason text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: soft_delete_shift(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_shift(p_shift_id text, p_reason text) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  actor_permission text;
  target_shift public.shifts;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  actor_permission := private.current_system_permission();
  if actor_permission <> 'admin' then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;

  select * into target_shift
  from public.shifts
  where id = p_shift_id
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'SHIFT_ALREADY_DELETED';
  end if;

  update public.shifts as shift
  set
    status = 'cancelled',
    deleted_at = statement_timestamp(),
    deleted_by = actor_id,
    deletion_reason = coalesce(nullif(btrim(p_reason), ''), 'Removed by operator'),
    registration_locked = true,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;


--
-- Name: FUNCTION soft_delete_shift(p_shift_id text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.soft_delete_shift(p_shift_id text, p_reason text) IS 'Admin-only lifecycle soft-delete. Registration and history rows are preserved; the shift is hidden from normal reads.';


--
-- Name: soft_delete_shift(text, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soft_delete_shift(p_shift_id text, p_reason text, p_expected_version integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.soft_delete_shift(p_shift_id, p_reason);
end;
$$;


--
-- Name: stage_attendance_import_batch(text, text, text, text, text, text, jsonb, text, integer, integer, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.stage_attendance_import_batch(p_batch_id text, p_source_type text, p_source_name text, p_source_fingerprint text, p_timezone text, p_brand_id text, p_metadata jsonb, p_actor_id text, p_total_rows integer, p_matched_rows integer, p_exception_rows integer, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_existing public.workforce_attendance_import_batches;
  v_actor public.business_users;
  v_target_batch_id text;
  v_row jsonb;
begin
  -- 1. Check actor permissions
  select * into v_actor from public.business_users
  where id = p_actor_id and status = 'active';

  if v_actor.id is null or v_actor.system_permission not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_ATTENDANCE_ACTION';
  end if;

  -- 2. Concurrency lock on fingerprint
  select * into v_existing
  from public.workforce_attendance_import_batches
  where source_fingerprint = p_source_fingerprint
  for update;

  if v_existing.id is not null and v_existing.status = 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BATCH_ALREADY_CONFIRMED',
      'batch_id', v_existing.id,
      'message', 'Nguồn dữ liệu này đã được xác nhận trước đó (Batch #' || v_existing.id || '). Không thể nhập trùng lặp.'
    );
  end if;

  if v_existing.id is not null and v_existing.status = 'staged' then
    v_target_batch_id := v_existing.id;
    -- Atomic re-staging: replace staged rows in single transaction
    delete from public.workforce_attendance_import_rows where batch_id = v_target_batch_id;

    update public.workforce_attendance_import_batches
    set total_rows = p_total_rows,
        matched_rows = p_matched_rows,
        exception_rows = p_exception_rows,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        version = v_existing.version + 1,
        updated_at = statement_timestamp()
    where id = v_target_batch_id;
  else
    v_target_batch_id := coalesce(p_batch_id, gen_random_uuid()::text);
    insert into public.workforce_attendance_import_batches (
      id,
      source_type,
      source_name,
      source_fingerprint,
      timezone,
      brand_id,
      status,
      total_rows,
      matched_rows,
      exception_rows,
      drafted_segments,
      metadata,
      created_by,
      version
    ) values (
      v_target_batch_id,
      p_source_type,
      p_source_name,
      p_source_fingerprint,
      coalesce(p_timezone, 'Asia/Ho_Chi_Minh'),
      p_brand_id,
      'staged',
      p_total_rows,
      p_matched_rows,
      p_exception_rows,
      0,
      coalesce(p_metadata, '{}'::jsonb),
      p_actor_id,
      1
    );
  end if;

  -- Insert rows in batch
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.workforce_attendance_import_rows (
      batch_id,
      source_row_number,
      raw_payload,
      parsed_date,
      parsed_start_time,
      parsed_end_time,
      parsed_start_at,
      parsed_end_at,
      raw_staff_name,
      raw_role,
      raw_notes,
      matched_shift_id,
      matched_staff_id,
      operational_role,
      coverage_kind,
      evidence_kind,
      status,
      exception_code,
      exception_detail
    ) values (
      v_target_batch_id,
      (v_row->>'source_row_number')::integer,
      coalesce(v_row->'raw_payload', '{}'::jsonb),
      (v_row->>'parsed_date')::date,
      v_row->>'parsed_start_time',
      v_row->>'parsed_end_time',
      (v_row->>'parsed_start_at')::timestamptz,
      (v_row->>'parsed_end_at')::timestamptz,
      v_row->>'raw_staff_name',
      v_row->>'raw_role',
      v_row->>'raw_notes',
      v_row->>'matched_shift_id',
      v_row->>'matched_staff_id',
      v_row->>'operational_role',
      coalesce(v_row->>'coverage_kind', 'planned'),
      coalesce(v_row->>'evidence_kind', 'missing_evidence'),
      coalesce(v_row->>'status', 'pending'),
      v_row->>'exception_code',
      v_row->>'exception_detail'
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_target_batch_id,
    'status', 'staged',
    'total_rows', p_total_rows,
    'matched_rows', p_matched_rows,
    'exception_rows', p_exception_rows
  );
end;
$$;


--
-- Name: start_report_review(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.start_report_review(p_report_id text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: storage_resource_registry_create(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_resource_registry_create(p_resource jsonb, p_scope jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  created_resource public.storage_resources;
  created_scope public.storage_resource_scopes;
begin
  actor_id := private.current_business_user_id();
  created_scope := null;
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'STORAGE_RESOURCE_ADMIN_REQUIRED';
  end if;
  if p_resource is null or jsonb_typeof(p_resource) is distinct from 'object'
    or (p_scope is not null and jsonb_typeof(p_scope) is distinct from 'object') then
    raise exception using errcode = '22023', message = 'STORAGE_RESOURCE_INPUT_INVALID';
  end if;
  if p_resource->>'resource_type' = 'attendance_evidence' and (
    p_resource->>'visibility' is distinct from 'owner_only'
    or coalesce(p_scope->>'brand_id', '') <> ''
    or coalesce(p_scope->>'campaign_id', '') <> ''
    or coalesce(p_scope->>'client_group_key', '') <> ''
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE';
  end if;

  insert into public.storage_resources (
    provider, canonical_id, canonical_url, title, resource_type, owner_id,
    visibility, created_by, updated_by
  ) values (
    p_resource->>'provider', p_resource->>'canonical_id', p_resource->>'canonical_url',
    p_resource->>'title', p_resource->>'resource_type', coalesce(p_resource->>'owner_id', actor_id),
    p_resource->>'visibility', actor_id, actor_id
  ) returning * into created_resource;

  if p_scope is not null then
    insert into public.storage_resource_scopes (
      resource_id, brand_id, campaign_id, platform_id, shift_id, staff_id,
      client_group_key, sku_key, year, month, created_by
    ) values (
      created_resource.id,
      nullif(p_scope->>'brand_id', ''), nullif(p_scope->>'campaign_id', ''),
      nullif(p_scope->>'platform_id', ''), nullif(p_scope->>'shift_id', ''),
      nullif(p_scope->>'staff_id', ''), nullif(p_scope->>'client_group_key', ''),
      nullif(p_scope->>'sku_key', ''), nullif(p_scope->>'year', '')::integer,
      nullif(p_scope->>'month', '')::integer, actor_id
    ) returning * into created_scope;
  end if;
  return jsonb_build_object('resource', to_jsonb(created_resource),
    'scope', case when created_scope.id is null then null else to_jsonb(created_scope) end);
end;
$$;


--
-- Name: storage_resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_resources (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    provider text NOT NULL,
    canonical_id text NOT NULL,
    canonical_url text NOT NULL,
    title text NOT NULL,
    resource_type text NOT NULL,
    owner_id text NOT NULL,
    visibility text NOT NULL,
    verification_status text DEFAULT 'unverified'::text NOT NULL,
    verification_checked_at timestamp with time zone,
    verification_error_code text,
    is_active boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_resources_attendance_visibility CHECK (((resource_type <> 'attendance_evidence'::text) OR (visibility = 'owner_only'::text))),
    CONSTRAINT storage_resources_canonical_id_check CHECK (((btrim(canonical_id) <> ''::text) AND (canonical_id !~ '[/\\?#]'::text))),
    CONSTRAINT storage_resources_canonical_url_check CHECK (((canonical_url ~ '^https://(www\.)?(drive\.google\.com|docs\.google\.com|onedrive\.live\.com|[A-Za-z0-9-]+\.sharepoint\.com)/'::text) AND (canonical_url !~ '[?#@]'::text))),
    CONSTRAINT storage_resources_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]))),
    CONSTRAINT storage_resources_resource_type_check CHECK ((resource_type = ANY (ARRAY['root_folder'::text, 'google_sheet'::text, 'report_data'::text, 'product_document'::text, 'sku_document'::text, 'kv'::text, 'image'::text, 'livecut'::text, 'marketing_asset'::text, 'campaign_scheme'::text, 'script'::text, 'guideline'::text, 'contract'::text, 'acceptance'::text, 'attendance_evidence'::text, 'other'::text]))),
    CONSTRAINT storage_resources_title_check CHECK (((btrim(title) <> ''::text) AND (length(title) <= 200))),
    CONSTRAINT storage_resources_verification_pair CHECK ((((verification_status = 'unverified'::text) AND (verification_checked_at IS NULL)) OR ((verification_status <> 'unverified'::text) AND (verification_checked_at IS NOT NULL)))),
    CONSTRAINT storage_resources_verification_status_check CHECK ((verification_status = ANY (ARRAY['unverified'::text, 'verified_metadata'::text, 'broken'::text, 'verification_error'::text]))),
    CONSTRAINT storage_resources_visibility_check CHECK ((visibility = ANY (ARRAY['admin_only'::text, 'owner_only'::text, 'granted_users'::text, 'public'::text])))
);


--
-- Name: TABLE storage_resources; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.storage_resources IS 'Metadata-only provider resource registry. Provider binaries are never stored here; registry visibility does not imply provider access.';


--
-- Name: storage_resource_registry_edit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_resource_registry_edit(p_resource_id text, p_title text) RETURNS public.storage_resources
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text := private.current_business_user_id();
  target public.storage_resources;
begin
  if not private.current_business_user_is_active()
    or private.current_system_permission() not in ('admin', 'leader', 'member')
    or not private.is_admin() and not private.current_user_can_edit_storage_resource(p_resource_id) then
    raise exception using errcode = '42501', message = 'STORAGE_RESOURCE_EDIT_DENIED';
  end if;
  if p_resource_id is null or p_title is null or btrim(p_title) = '' or length(p_title) > 200 then
    raise exception using errcode = '22023', message = 'STORAGE_RESOURCE_INPUT_INVALID';
  end if;
  select * into target from public.storage_resources where id = p_resource_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'STORAGE_RESOURCE_NOT_FOUND'; end if;
  if target.resource_type = 'attendance_evidence' then
    raise exception using errcode = '42501', message = 'ATTENDANCE_RESOURCE_OWNER_ONLY';
  end if;
  update public.storage_resources set title = btrim(p_title), updated_by = actor_id, updated_at = statement_timestamp()
    where id = p_resource_id returning * into target;
  return target;
end;
$$;


--
-- Name: storage_resource_registry_editable_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_resource_registry_editable_ids() RETURNS TABLE(resource_id text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select g.resource_id
  from public.storage_resource_edit_grants g
  join public.storage_resources r on r.id = g.resource_id
  where g.user_id = private.current_business_user_id()
    and g.decision = 'allow' and g.revoked_at is null
    and r.is_active and r.resource_type <> 'attendance_evidence' and r.visibility <> 'admin_only'
    and private.current_business_user_is_active()
    and private.current_system_permission() in ('admin', 'leader', 'member')
    and (
      r.visibility = 'public'
      or (r.visibility = 'owner_only' and r.owner_id = private.current_business_user_id())
      or (r.visibility = 'granted_users' and (
        r.owner_id = private.current_business_user_id()
        or private.current_user_has_storage_resource_grant(r.id)
      ))
    )
    and not exists (
      select 1 from public.storage_resource_edit_grants denied
      where denied.resource_id = g.resource_id and denied.user_id = g.user_id
        and denied.decision = 'deny' and denied.revoked_at is null
    )
$$;


--
-- Name: storage_resource_registry_set_edit_grant(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_resource_registry_set_edit_grant(p_resource_id text, p_user_id text, p_decision text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  actor_id text := private.current_business_user_id();
  target public.storage_resources;
  changed_grant public.storage_resource_edit_grants;
begin
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'STORAGE_RESOURCE_ADMIN_REQUIRED';
  end if;
  if p_resource_id is null or p_user_id is null or (p_decision is not null and p_decision not in ('allow', 'deny')) then
    raise exception using errcode = '22023', message = 'STORAGE_RESOURCE_INPUT_INVALID';
  end if;
  select * into target from public.storage_resources where id = p_resource_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'STORAGE_RESOURCE_NOT_FOUND'; end if;
  if not exists (select 1 from public.business_users where id = p_user_id) then
    raise exception using errcode = '23503', message = 'STORAGE_RESOURCE_EDIT_TARGET_NOT_FOUND';
  end if;
  if p_decision = 'allow' and (
    target.resource_type = 'attendance_evidence'
    or target.visibility = 'admin_only'
    or (target.visibility = 'owner_only' and target.owner_id <> p_user_id)
  ) then
    raise exception using errcode = '23514', message = 'STORAGE_RESOURCE_EDIT_TARGET_NOT_GRANTABLE';
  end if;
  if p_decision is null then
    update public.storage_resource_edit_grants set revoked_at = statement_timestamp()
      where resource_id = p_resource_id and user_id = p_user_id and revoked_at is null
      returning * into changed_grant;
  else
    insert into public.storage_resource_edit_grants(resource_id, user_id, decision, granted_by, revoked_at)
      values (p_resource_id, p_user_id, p_decision, actor_id, null)
      on conflict (resource_id, user_id) do update
        set decision = excluded.decision, granted_by = excluded.granted_by, revoked_at = null
      returning * into changed_grant;
  end if;
  return jsonb_build_object('resource_id', p_resource_id,
    'grant', case when changed_grant.resource_id is null then null else to_jsonb(changed_grant) end);
end;
$$;


--
-- Name: storage_resource_registry_set_grant(text, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.storage_resource_registry_set_grant(p_resource_id text, p_user_id text, p_active boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  target public.storage_resources;
  changed_grant public.storage_resource_user_grants;
begin
  actor_id := private.current_business_user_id();
  changed_grant := null;
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'STORAGE_RESOURCE_ADMIN_REQUIRED';
  end if;
  if p_resource_id is null or p_user_id is null or p_active is null then
    raise exception using errcode = '22023', message = 'STORAGE_RESOURCE_INPUT_INVALID';
  end if;
  select * into target from public.storage_resources where id = p_resource_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STORAGE_RESOURCE_NOT_FOUND';
  end if;
  if p_active then
    if target.resource_type = 'attendance_evidence' then
      raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_OWNER_ONLY';
    end if;
    if target.visibility = 'public' then
      raise exception using errcode = '23514', message = 'STORAGE_RESOURCE_PUBLIC_ALREADY_VISIBLE';
    end if;
    update public.storage_resources set visibility = 'granted_users', updated_by = actor_id
      where id = p_resource_id returning * into target;
    insert into public.storage_resource_user_grants(resource_id, user_id, granted_by, revoked_at)
      values (p_resource_id, p_user_id, actor_id, null)
      on conflict (resource_id, user_id) do update set granted_by = excluded.granted_by, revoked_at = null
      returning * into changed_grant;
  else
    update public.storage_resource_user_grants set revoked_at = statement_timestamp()
      where resource_id = p_resource_id and user_id = p_user_id returning * into changed_grant;
  end if;
  return jsonb_build_object('resource', to_jsonb(target),
    'grant', case when changed_grant.resource_id is null then null else to_jsonb(changed_grant) end);
end;
$$;


--
-- Name: submit_account_request(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_account_request(p_email text, p_full_name text, p_phone text DEFAULT NULL::text, p_department text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_department text := nullif(btrim(coalesce(p_department, '')), '');
  v_conflict text;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or char_length(v_email) > 320 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_full_name = '' or char_length(v_full_name) > 200 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_phone is not null and char_length(v_phone) > 80 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  if v_department is not null and char_length(v_department) > 160 then
    raise exception 'Invalid account request.' using errcode = '22023';
  end if;

  select case
    when exists (
      select 1
      from public.business_users as business_user
      where lower(btrim(business_user.email)) = v_email
        and business_user.auth_user_id is not null
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
    ) then 'active_linked_account'
    when exists (
      select 1
      from public.business_users as business_user
      where lower(btrim(business_user.email)) = v_email
    ) then 'existing_staff'
    when exists (
      select 1
      from auth.users as auth_user
      where lower(btrim(coalesce(auth_user.email, ''))) = v_email
    ) then 'existing_auth'
    else 'new'
  end into v_conflict;

  -- A pending duplicate and an already active linked account both receive
  -- the same neutral acknowledgement. No existing row is changed.
  if v_conflict = 'active_linked_account'
    or exists (
      select 1
      from public.account_requests as request_row
      where lower(btrim(request_row.email)) = v_email
        and request_row.status = 'pending'
    ) then
    return jsonb_build_object(
      'ok', true,
      'message', 'If your request is eligible, it has been recorded for review.'
    );
  end if;

  -- Existing Staff-only and Auth-only identities are deliberately recorded
  -- without identifiers. They must be resolved by a later Admin workflow.
  insert into public.account_requests (
    email, full_name, phone, department
  ) values (
    v_email, v_full_name, v_phone, v_department
  ) on conflict do nothing;

  return jsonb_build_object(
    'ok', true,
    'message', 'If your request is eligible, it has been recorded for review.'
  );
end;
$_$;


--
-- Name: FUNCTION submit_account_request(p_email text, p_full_name text, p_phone text, p_department text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.submit_account_request(p_email text, p_full_name text, p_phone text, p_department text) IS 'Public neutral-acknowledgement boundary. Never creates Auth, Staff, permissions, notifications, or links.';


--
-- Name: sync_staff_auth_metadata(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_staff_auth_metadata(p_user_id text) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.current_business_user_id();
  v_target public.business_users;
  v_existing jsonb;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTIVE_USER_REQUIRED';
  end if;
  if p_user_id <> v_actor_id and not private.is_admin() then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;
  select * into v_target from public.business_users
  where id = p_user_id and deleted_at is null and archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;
  if v_target.auth_user_id is not null then
    select coalesce(raw_app_meta_data, '{}'::jsonb) into v_existing
    from auth.users where id = v_target.auth_user_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'STAFF_AUTH_IDENTITY_NOT_FOUND';
    end if;
    update auth.users
    set raw_app_meta_data = v_existing
      || jsonb_build_object('system_permission', v_target.system_permission, 'business_user_id', v_target.id)
    where id = v_target.auth_user_id;
  end if;
  return v_target;
end;
$$;


--
-- Name: audit_log_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log_reviews (
    audit_id text NOT NULL,
    admin_note text,
    review_status text DEFAULT 'unreviewed'::text NOT NULL,
    handling_reason text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT audit_log_reviews_status_check CHECK ((review_status = ANY (ARRAY['unreviewed'::text, 'reviewed'::text, 'action_required'::text, 'resolved'::text])))
);


--
-- Name: TABLE audit_log_reviews; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log_reviews IS 'Administrative review metadata kept separate from immutable audit events.';


--
-- Name: update_audit_review(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_audit_review(p_audit_id text, p_admin_note text, p_review_status text, p_handling_reason text) RETURNS public.audit_log_reviews
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text := private.current_business_user_id();
  result public.audit_log_reviews;
begin
  if actor_id is null or private.current_system_permission() <> 'admin' then
    raise exception using errcode = '42501', message = 'AUDIT_REVIEW_NOT_ALLOWED';
  end if;
  if not exists (select 1 from public.audit_logs where id = p_audit_id) then
    raise exception using errcode = 'P0001', message = 'AUDIT_EVENT_NOT_FOUND';
  end if;
  if p_review_status not in ('unreviewed', 'reviewed', 'action_required', 'resolved') then
    raise exception using errcode = '22023', message = 'AUDIT_REVIEW_STATUS_INVALID';
  end if;
  insert into public.audit_log_reviews (audit_id, admin_note, review_status, handling_reason, updated_by)
  values (p_audit_id, p_admin_note, p_review_status, p_handling_reason, actor_id)
  on conflict (audit_id) do update set
    admin_note = excluded.admin_note,
    review_status = excluded.review_status,
    handling_reason = excluded.handling_reason,
    updated_by = excluded.updated_by,
    updated_at = statement_timestamp()
  returning * into result;
  return result;
end;
$$;


--
-- Name: live_report_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.live_report_images (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    report_id text,
    category text DEFAULT 'other'::text NOT NULL,
    title text,
    description text,
    captured_at timestamp with time zone,
    file_url text NOT NULL,
    thumbnail_url text,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_cover boolean DEFAULT false NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    storage_file_name text,
    storage_idempotency_key text,
    provider text,
    external_file_id text,
    external_parent_id text,
    checksum_sha256 text,
    CONSTRAINT live_report_images_category_check CHECK ((category = ANY (ARRAY['key_visual'::text, 'live_session'::text, 'other'::text]))),
    CONSTRAINT live_report_images_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT live_report_images_external_parent_id_check CHECK (((external_parent_id IS NULL) OR (btrim(external_parent_id) <> ''::text))),
    CONSTRAINT live_report_images_file_provider_pair CHECK ((((provider IS NULL) AND (external_file_id IS NULL)) OR ((provider IS NOT NULL) AND (provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text])) AND (external_file_id IS NOT NULL) AND (btrim(external_file_id) <> ''::text)))),
    CONSTRAINT live_report_images_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT live_report_images_storage_metadata_check CHECK ((((storage_file_name IS NULL) AND (storage_idempotency_key IS NULL)) OR ((storage_file_name IS NOT NULL) AND ((char_length(storage_file_name) >= 1) AND (char_length(storage_file_name) <= 180)) AND (storage_idempotency_key IS NOT NULL) AND (storage_idempotency_key ~ '^(key_visual|live_session|other):[a-f0-9]{64}$'::text) AND (split_part(storage_idempotency_key, ':'::text, 1) = category))))
);


--
-- Name: TABLE live_report_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.live_report_images IS 'P3 live-session gallery images attached to reports.';


--
-- Name: update_live_report_image_metadata(text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_live_report_image_metadata(p_image_id text, p_category text, p_title text, p_description text, p_captured_at timestamp with time zone) RETURNS public.live_report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    require_shift_capacity_validation boolean DEFAULT true NOT NULL,
    require_time_overlap_validation boolean DEFAULT true NOT NULL,
    allow_leader_schedule_edit boolean DEFAULT false NOT NULL,
    strict_host_role_binding boolean DEFAULT true NOT NULL,
    default_view_mode text DEFAULT 'timeline'::text NOT NULL,
    calendar_density text DEFAULT 'comfortable'::text NOT NULL,
    show_unassigned_shifts boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    registration_cutoff_hours smallint DEFAULT 6 NOT NULL,
    require_registration_approval boolean DEFAULT true NOT NULL,
    auto_lock_filled_shifts boolean DEFAULT true NOT NULL,
    allow_multi_role_per_shift boolean DEFAULT false NOT NULL,
    default_host_count smallint DEFAULT 1 NOT NULL,
    default_support_count smallint DEFAULT 1 NOT NULL,
    default_technical_count smallint DEFAULT 1 NOT NULL,
    CONSTRAINT system_settings_default_host_count_check CHECK (((default_host_count >= 0) AND (default_host_count <= 100))),
    CONSTRAINT system_settings_default_support_count_check CHECK (((default_support_count >= 0) AND (default_support_count <= 100))),
    CONSTRAINT system_settings_default_technical_count_check CHECK (((default_technical_count >= 0) AND (default_technical_count <= 100))),
    CONSTRAINT system_settings_registration_cutoff_hours_check CHECK ((registration_cutoff_hours >= 0))
);


--
-- Name: update_operational_settings(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_operational_settings(p_patch jsonb) RETURNS public.system_settings
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  settings_row public.system_settings;
  input_key text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'OPERATIONAL_SETTINGS_PAYLOAD_INVALID';
  end if;

  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'registration_cutoff_hours', 'require_registration_approval',
      'auto_lock_filled_shifts', 'allow_multi_role_per_shift',
      'default_host_count', 'default_support_count', 'default_technical_count'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'OPERATIONAL_SETTING_NOT_ALLOWED';
    end if;
  end loop;

  if p_patch ? 'registration_cutoff_hours'
    and (jsonb_typeof(p_patch->'registration_cutoff_hours') <> 'number'
      or (p_patch->>'registration_cutoff_hours')::numeric < 0
      or trunc((p_patch->>'registration_cutoff_hours')::numeric) <> (p_patch->>'registration_cutoff_hours')::numeric)
  then
    raise exception using errcode = '22023', message = 'REGISTRATION_CUTOFF_INVALID';
  end if;
  if p_patch ? 'default_host_count'
    and (jsonb_typeof(p_patch->'default_host_count') <> 'number'
      or (p_patch->>'default_host_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_host_count')::numeric) <> (p_patch->>'default_host_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_HOST_COUNT_INVALID';
  end if;
  if p_patch ? 'default_support_count'
    and (jsonb_typeof(p_patch->'default_support_count') <> 'number'
      or (p_patch->>'default_support_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_support_count')::numeric) <> (p_patch->>'default_support_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_SUPPORT_COUNT_INVALID';
  end if;
  if p_patch ? 'default_technical_count'
    and (jsonb_typeof(p_patch->'default_technical_count') <> 'number'
      or (p_patch->>'default_technical_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_technical_count')::numeric) <> (p_patch->>'default_technical_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_TECHNICAL_COUNT_INVALID';
  end if;
  if (p_patch ? 'require_registration_approval'
    and jsonb_typeof(p_patch->'require_registration_approval') <> 'boolean')
    or (p_patch ? 'auto_lock_filled_shifts'
      and jsonb_typeof(p_patch->'auto_lock_filled_shifts') <> 'boolean')
    or (p_patch ? 'allow_multi_role_per_shift'
      and jsonb_typeof(p_patch->'allow_multi_role_per_shift') <> 'boolean')
  then
    raise exception using errcode = '22023', message = 'OPERATIONAL_SETTING_BOOLEAN_INVALID';
  end if;

  select * into settings_row
  from public.system_settings
  limit 1
  for update;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;

  update public.system_settings
  set registration_cutoff_hours = case when p_patch ? 'registration_cutoff_hours' then (p_patch->>'registration_cutoff_hours')::smallint else registration_cutoff_hours end,
      require_registration_approval = case when p_patch ? 'require_registration_approval' then (p_patch->>'require_registration_approval')::boolean else require_registration_approval end,
      auto_lock_filled_shifts = case when p_patch ? 'auto_lock_filled_shifts' then (p_patch->>'auto_lock_filled_shifts')::boolean else auto_lock_filled_shifts end,
      allow_multi_role_per_shift = case when p_patch ? 'allow_multi_role_per_shift' then (p_patch->>'allow_multi_role_per_shift')::boolean else allow_multi_role_per_shift end,
      default_host_count = case when p_patch ? 'default_host_count' then (p_patch->>'default_host_count')::smallint else default_host_count end,
      default_support_count = case when p_patch ? 'default_support_count' then (p_patch->>'default_support_count')::smallint else default_support_count end,
      default_technical_count = case when p_patch ? 'default_technical_count' then (p_patch->>'default_technical_count')::smallint else default_technical_count end,
      updated_at = statement_timestamp()
  where id = settings_row.id
  returning * into settings_row;
  return settings_row;
end;
$$;


--
-- Name: update_report(text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_report(p_report_id text, p_patch jsonb, p_reason text, p_event text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: update_report(text, jsonb, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_report(p_report_id text, p_patch jsonb, p_expected_version integer, p_reason text, p_event text) RETURNS public.reports
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: update_schedule_import_batch_preview(text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_schedule_import_batch_preview(p_batch_id text, p_summary jsonb, p_rows jsonb DEFAULT '[]'::jsonb) RETURNS public.schedule_import_batches
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'IMPORT_SUMMARY_INVALID';
  end if;

  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status <> 'previewed' then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_PREVIEWED';
  end if;
  -- Once any row has a recorded outcome (partial confirm, retry pass), the row
  -- set is audit data: replacing it would destroy shift traceability.
  if exists (
    select 1 from public.schedule_import_batch_rows
    where batch_id = p_batch_id and outcome <> 'pending'
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_ROWS_ALREADY_RECORDED';
  end if;

  update public.schedule_import_batches
  set
    total_rows = private.schedule_import_summary_value(p_summary, 'total_rows'),
    valid_rows = private.schedule_import_summary_value(p_summary, 'valid_rows'),
    invalid_rows = private.schedule_import_summary_value(p_summary, 'invalid_rows'),
    warning_rows = private.schedule_import_summary_value(p_summary, 'warning_rows'),
    duplicate_rows = private.schedule_import_summary_value(p_summary, 'duplicate_rows')
  where id = p_batch_id;

  -- Preview rows are the editable draft layer only; the guard above ensures
  -- only never-finalized (pending) rows are ever replaced.
  delete from public.schedule_import_batch_rows where batch_id = p_batch_id;
  perform private.insert_schedule_import_batch_rows(p_batch_id, p_rows);

  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;


--
-- Name: update_shift(text, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean DEFAULT false) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
  effective_agency text;
  effective_source text;
begin
  actor_id := private.require_shift_actor(true);
  actor_permission := private.current_system_permission();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  if p_patch ?| array['host_id', 'support_id', 'technical_id'] then
    raise exception using errcode = '22023', message = 'STAFFING_FIELDS_USE_STAFFING_RPC';
  end if;
  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id',
      'title', 'studio', 'required_host_count', 'required_support_count',
      'required_technical_count', 'status', 'live_link', 'product_notes',
      'registration_cutoff_at', 'allow_multi_role', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if (p_patch ? 'execution_source' and p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_patch ? 'agency_code' and p_patch->>'agency_code' is not null
    and p_patch->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  if p_patch ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_patch->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  effective_agency := case
    when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
    else existing_shift.agency_code
  end;
  effective_source := case
    when p_patch ? 'execution_source' then nullif(p_patch->>'execution_source', '')
    when p_patch ? 'agency_code' and effective_agency is not null then
      case effective_agency when 'ada' then 'internal' else 'agency' end
    else existing_shift.execution_source
  end;
  if (effective_agency is not null and effective_source is distinct from
    case effective_agency when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;

  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and requested_status = 'completed')
      or (existing_shift.status = 'cancelled' and requested_status = 'cancelled')
    ) then
    raise exception using errcode = '42501', message = 'SHIFT_STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if existing_shift.status = 'live' and p_patch ?| array['date', 'start_time', 'platform_id'] then
    raise exception using errcode = 'P0001', message = 'LIVE_SHIFT_FIELD_LOCKED';
  end if;
  if existing_shift.status = 'completed'
    and p_patch ?| array['date', 'start_time', 'end_time', 'platform_id', 'campaign_id']
    and not p_confirm_impact
  then
    raise exception using errcode = 'P0001', message = 'COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED';
  end if;
  update public.shifts as shift
  set
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else shift.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else shift.start_time end,
    end_time = case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else shift.end_time end,
    brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '') else shift.brand_id end,
    platform_id = case when p_patch ? 'platform_id' then nullif(p_patch->>'platform_id', '') else shift.platform_id end,
    campaign_id = case when p_patch ? 'campaign_id' then nullif(p_patch->>'campaign_id', '') else shift.campaign_id end,
    title = case when p_patch ? 'title' then nullif(p_patch->>'title', '') else shift.title end,
    studio = case when p_patch ? 'studio' then nullif(p_patch->>'studio', '') else shift.studio end,
    required_host_count = case when p_patch ? 'required_host_count' then private.normalize_shift_capacity(p_patch->>'required_host_count', 1::smallint) else shift.required_host_count end,
    required_support_count = case when p_patch ? 'required_support_count' then private.normalize_shift_capacity(p_patch->>'required_support_count', 1::smallint) else shift.required_support_count end,
    required_technical_count = case when p_patch ? 'required_technical_count' then private.normalize_shift_capacity(p_patch->>'required_technical_count', 1::smallint) else shift.required_technical_count end,
    registration_cutoff_at = case when p_patch ? 'registration_cutoff_at' then nullif(p_patch->>'registration_cutoff_at', '')::timestamptz else shift.registration_cutoff_at end,
    allow_multi_role = case when p_patch ? 'allow_multi_role' then (p_patch->>'allow_multi_role')::boolean else shift.allow_multi_role end,
    status = requested_status,
    live_link = case when p_patch ? 'live_link' then nullif(p_patch->>'live_link', '') else shift.live_link end,
    product_notes = case when p_patch ? 'product_notes' then nullif(p_patch->>'product_notes', '') else shift.product_notes end,
    supplemental_fields = case when p_patch ? 'supplemental_fields' then p_patch->'supplemental_fields' else shift.supplemental_fields end,
    execution_source = case
      when p_patch ? 'execution_source' then p_patch->>'execution_source'
      when p_patch ? 'agency_code' and nullif(p_patch->>'agency_code', '') is not null then
        case nullif(p_patch->>'agency_code', '') when 'ada' then 'internal' else 'agency' end
      else shift.execution_source end,
    agency_code = case
      when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
      else shift.agency_code end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$$;


--
-- Name: update_shift(text, jsonb, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean, p_expected_version integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
  effective_agency text;
  effective_source text;
begin
  actor_id := private.require_shift_actor(true);
  actor_permission := private.current_system_permission();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  if p_patch ?| array['host_id', 'support_id', 'technical_id'] then
    raise exception using errcode = '22023', message = 'STAFFING_FIELDS_USE_STAFFING_RPC';
  end if;
  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id',
      'title', 'studio', 'required_host_count', 'required_support_count',
      'required_technical_count', 'status', 'live_link', 'product_notes',
      'registration_cutoff_at', 'allow_multi_role', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if (p_patch ? 'execution_source' and p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_patch ? 'agency_code' and p_patch->>'agency_code' is not null
    and p_patch->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  if p_patch ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_patch->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  perform private.assert_expected_version('Shift', p_expected_version, existing_shift.version);

  effective_agency := case
    when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
    else existing_shift.agency_code
  end;
  effective_source := case
    when p_patch ? 'execution_source' then nullif(p_patch->>'execution_source', '')
    when p_patch ? 'agency_code' and effective_agency is not null then
      case effective_agency when 'ada' then 'internal' else 'agency' end
    else existing_shift.execution_source
  end;
  if (effective_agency is not null and effective_source is distinct from
    case effective_agency when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;

  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'auto'
        and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'manual' and requested_status = 'completed')
      or (existing_shift.status = 'cancelled' and requested_status = 'cancelled')
    ) then
    raise exception using errcode = '42501', message = 'SHIFT_STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if existing_shift.status = 'live' and p_patch ?| array['date', 'start_time', 'platform_id'] then
    raise exception using errcode = 'P0001', message = 'LIVE_SHIFT_FIELD_LOCKED';
  end if;
  if existing_shift.status = 'completed'
    and p_patch ?| array['date', 'start_time', 'end_time', 'platform_id', 'campaign_id']
    and not p_confirm_impact
  then
    raise exception using errcode = 'P0001', message = 'COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED';
  end if;
  update public.shifts as shift
  set
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else shift.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else shift.start_time end,
    end_time = case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else shift.end_time end,
    brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '') else shift.brand_id end,
    platform_id = case when p_patch ? 'platform_id' then nullif(p_patch->>'platform_id', '') else shift.platform_id end,
    campaign_id = case when p_patch ? 'campaign_id' then nullif(p_patch->>'campaign_id', '') else shift.campaign_id end,
    title = case when p_patch ? 'title' then nullif(p_patch->>'title', '') else shift.title end,
    studio = case when p_patch ? 'studio' then nullif(p_patch->>'studio', '') else shift.studio end,
    required_host_count = case when p_patch ? 'required_host_count' then private.normalize_shift_capacity(p_patch->>'required_host_count', 1::smallint) else shift.required_host_count end,
    required_support_count = case when p_patch ? 'required_support_count' then private.normalize_shift_capacity(p_patch->>'required_support_count', 1::smallint) else shift.required_support_count end,
    required_technical_count = case when p_patch ? 'required_technical_count' then private.normalize_shift_capacity(p_patch->>'required_technical_count', 1::smallint) else shift.required_technical_count end,
    registration_cutoff_at = case when p_patch ? 'registration_cutoff_at' then nullif(p_patch->>'registration_cutoff_at', '')::timestamptz else shift.registration_cutoff_at end,
    allow_multi_role = case when p_patch ? 'allow_multi_role' then (p_patch->>'allow_multi_role')::boolean else shift.allow_multi_role end,
    status = requested_status,
    live_link = case when p_patch ? 'live_link' then nullif(p_patch->>'live_link', '') else shift.live_link end,
    product_notes = case when p_patch ? 'product_notes' then nullif(p_patch->>'product_notes', '') else shift.product_notes end,
    supplemental_fields = case when p_patch ? 'supplemental_fields' then p_patch->'supplemental_fields' else shift.supplemental_fields end,
    execution_source = case
      when p_patch ? 'execution_source' then p_patch->>'execution_source'
      when p_patch ? 'agency_code' and nullif(p_patch->>'agency_code', '') is not null then
        case nullif(p_patch->>'agency_code', '') when 'ada' then 'internal' else 'agency' end
      else shift.execution_source end,
    agency_code = case
      when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
      else shift.agency_code end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$$;


--
-- Name: update_shift_staffing_labels(text, text[], text[], text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shift_staffing_labels(p_shift_id text, p_host_names text[], p_assistant_names text[], p_technical_names text[]) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  actor_id text;
  updated_shift public.shifts;
begin
  actor_id := private.require_shift_actor(true);

  if p_shift_id is null or btrim(p_shift_id) = '' then
    raise exception using errcode = '22023', message = 'SHIFT_ID_REQUIRED';
  end if;
  if p_host_names is null or p_assistant_names is null or p_technical_names is null then
    raise exception using errcode = '22023', message = 'SHIFT_STAFFING_NAMES_INVALID';
  end if;

  perform 1
  from public.shifts as target
  where target.id = p_shift_id
    and target.deleted_at is null
    and target.archived_at is null
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  update public.shifts as target
  set
    host_names = p_host_names,
    assistant_names = p_assistant_names,
    technical_names = p_technical_names,
    updated_by = actor_id
  where target.id = p_shift_id
  returning target.* into updated_shift;

  return updated_shift;
end;
$$;


--
-- Name: FUNCTION update_shift_staffing_labels(p_shift_id text, p_host_names text[], p_assistant_names text[], p_technical_names text[]); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_shift_staffing_labels(p_shift_id text, p_host_names text[], p_assistant_names text[], p_technical_names text[]) IS 'Leader/Admin-only update of display labels. Does not modify assignments, registrations, capacity, lifecycle, or import history.';


--
-- Name: update_shift_staffing_labels(text, text[], text[], text[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_shift_staffing_labels(p_shift_id text, p_host_names text[], p_assistant_names text[], p_technical_names text[], p_expected_version integer) RETURNS public.shifts
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_version integer;
begin
  select version into current_version from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null for update;
  if current_version is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.update_shift_staffing_labels(p_shift_id, p_host_names, p_assistant_names, p_technical_names);
end;
$$;


--
-- Name: update_staff_member(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_staff_member(p_user_id text, p_data jsonb) RETURNS public.business_users
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_actor_id text := private.current_business_user_id();
  v_is_admin boolean := private.is_admin();
  v_target public.business_users;
  v_permission text;
  v_roles text[];
  v_status text;
begin
  if v_actor_id is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTIVE_USER_REQUIRED';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'STAFF_PAYLOAD_INVALID';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as supplied(key)
    where supplied.key not in (
      'email', 'full_name', 'avatar_url', 'avatar_storage_path', 'phone',
      'system_permission', 'operational_roles', 'department', 'status'
    )
  ) then
    raise exception using errcode = '22023', message = 'STAFF_FIELD_NOT_ALLOWED';
  end if;
  if p_user_id = v_actor_id then
    if not v_is_admin and exists (
      select 1 from jsonb_object_keys(p_data) as supplied(key)
      where supplied.key not in (
        'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department'
      )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_SELF_PRIVILEGE_ESCALATION_DENIED';
    elsif v_is_admin and exists (
      select 1 from jsonb_object_keys(p_data) as supplied(key)
      where supplied.key not in (
        'full_name', 'avatar_url', 'avatar_storage_path', 'phone', 'department', 'operational_roles'
      )
    ) then
      raise exception using errcode = '42501', message = 'STAFF_SELF_PRIVILEGE_ESCALATION_DENIED';
    end if;
  elsif not v_is_admin then
    raise exception using errcode = '42501', message = 'STAFF_ADMIN_REQUIRED';
  end if;

  select * into v_target
  from public.business_users
  where id = p_user_id and deleted_at is null and archived_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'STAFF_NOT_FOUND';
  end if;

  v_permission := coalesce(p_data ->> 'system_permission', v_target.system_permission);
  if v_permission not in ('admin', 'leader', 'member') then
    raise exception using errcode = '22023', message = 'STAFF_SYSTEM_PERMISSION_INVALID';
  end if;
  if p_data ? 'operational_roles' then
    if jsonb_typeof(p_data -> 'operational_roles') <> 'array' then
      raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
    end if;
    select coalesce(array_agg(role_value order by ordinal), '{}'::text[])
      into v_roles
      from jsonb_array_elements_text(p_data -> 'operational_roles')
        with ordinality as roles(role_value, ordinal);
    if not (v_roles <@ array['host', 'support', 'technical']::text[]) then
      raise exception using errcode = '22023', message = 'STAFF_OPERATIONAL_ROLES_INVALID';
    end if;
  else
    v_roles := v_target.operational_roles;
  end if;
  v_status := coalesce(p_data ->> 'status', v_target.status);
  if v_status not in ('active', 'inactive') then
    raise exception using errcode = '22023', message = 'STAFF_STATUS_INVALID';
  end if;

  update public.business_users
  set email = case when p_data ? 'email' then lower(btrim(p_data ->> 'email')) else email end,
      full_name = case when p_data ? 'full_name' then btrim(p_data ->> 'full_name') else full_name end,
      avatar_url = case when p_data ? 'avatar_url' then nullif(btrim(p_data ->> 'avatar_url'), '') else avatar_url end,
      avatar_storage_path = case when p_data ? 'avatar_storage_path' then nullif(btrim(p_data ->> 'avatar_storage_path'), '') else avatar_storage_path end,
      phone = case when p_data ? 'phone' then nullif(btrim(p_data ->> 'phone'), '') else phone end,
      system_permission = v_permission,
      role = case when v_permission = 'member' then 'staff' else v_permission end,
      operational_roles = v_roles,
      department = case when p_data ? 'department' then nullif(btrim(p_data ->> 'department'), '') else department end,
      status = v_status
  where id = p_user_id
  returning * into v_target;

  return v_target;
end;
$$;


--
-- Name: FUNCTION update_staff_member(p_user_id text, p_data jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_staff_member(p_user_id text, p_data jsonb) IS 'Admin-only staff update. auth_user_id and account approval state are immutable here.';


--
-- Name: report_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_images (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    report_id text NOT NULL,
    image_url text NOT NULL,
    storage_path text NOT NULL,
    original_name text,
    mime_type text,
    size_bytes bigint,
    image_type text NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    provider text,
    external_file_id text,
    external_parent_id text,
    checksum_sha256 text,
    CONSTRAINT report_images_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT report_images_external_parent_id_check CHECK (((external_parent_id IS NULL) OR (btrim(external_parent_id) <> ''::text))),
    CONSTRAINT report_images_file_provider_pair CHECK ((((provider IS NULL) AND (external_file_id IS NULL)) OR ((provider IS NOT NULL) AND (provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text])) AND (external_file_id IS NOT NULL) AND (btrim(external_file_id) <> ''::text)))),
    CONSTRAINT report_images_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT report_images_type_check CHECK ((image_type = ANY (ARRAY['dashboard'::text, 'livestream'::text, 'host'::text, 'support'::text, 'technical'::text, 'voucher'::text, 'product'::text, 'other'::text])))
);


--
-- Name: TABLE report_images; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report_images IS 'P3 evidence images attached to reports.';


--
-- Name: upload_report_image(text, text, text, text, text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upload_report_image(p_report_id text, p_storage_path text, p_image_url text, p_original_name text, p_mime_type text, p_size_bytes bigint, p_image_type text) RETURNS public.report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: upload_report_image_with_provider(text, text, text, text, text, bigint, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upload_report_image_with_provider(p_report_id text, p_storage_path text, p_image_url text, p_original_name text, p_mime_type text, p_size_bytes bigint, p_image_type text, p_provider text, p_external_file_id text) RETURNS public.report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: upload_report_image_with_storage_metadata(text, text, text, text, text, bigint, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upload_report_image_with_storage_metadata(p_report_id text, p_storage_path text, p_image_url text, p_original_name text, p_mime_type text, p_size_bytes bigint, p_image_type text, p_provider text, p_external_file_id text, p_external_parent_id text, p_checksum_sha256 text) RETURNS public.report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: upsert_live_report_image(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_live_report_image(p_data jsonb) RETURNS public.live_report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: upsert_live_report_image_with_provider(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_live_report_image_with_provider(p_data jsonb) RETURNS public.live_report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: upsert_live_report_image_with_storage_metadata(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_live_report_image_with_storage_metadata(p_data jsonb) RETURNS public.live_report_images
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
$_$;


--
-- Name: workforce_rc16_immutable_approved_segment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_immutable_approved_segment() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op='INSERT' then
    if new.review_status <> 'draft' or new.reviewed_by is not null
      or new.reviewed_at is not null or new.review_note is not null then
      raise exception 'WORKFORCE_SEGMENT_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and new.version <> old.version + 1 then
    raise exception 'WORKFORCE_ACTUAL_STALE_VERSION';
  end if;
  if new.review_status='approved' then
    if not exists (select 1 from public.shifts s
      where s.id=new.shift_id and s.status='completed' and s.deleted_at is null) then
      raise exception 'WORKFORCE_SHIFT_NOT_COMPLETED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('staff-attendance:'||new.staff_id,0));
    if new.event_kind='worked' and exists (
      select 1 from public.workforce_actual_segments existing
      where existing.staff_id=new.staff_id and existing.id<>new.id
        and existing.review_status='approved' and existing.event_kind='worked'
        and tstzrange(existing.actual_start_at,existing.actual_end_at,'[)')
          && tstzrange(new.actual_start_at,new.actual_end_at,'[)')
    ) then
      raise exception 'WORKFORCE_APPROVED_STAFF_OVERLAP';
    end if;
    if exists (
      select 1 from public.workforce_actual_segments existing
      where existing.shift_id=new.shift_id and existing.staff_id=new.staff_id
        and existing.operational_role=new.operational_role
        and existing.id<>new.id and existing.review_status='approved'
        and existing.event_kind<>new.event_kind
    ) then
      raise exception 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;


--
-- Name: workforce_rc16_immutable_payroll_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_immutable_payroll_audit() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  raise exception 'WORKFORCE_PAYROLL_AUDIT_IMMUTABLE';
end $$;


--
-- Name: workforce_rc16_line_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_line_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_segment public.workforce_actual_segments%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_shift_date date;
  v_duration_seconds numeric;
  v_computed_gross bigint;
begin
  if tg_op='DELETE' then raise exception 'WORKFORCE_PAYROLL_LINE_DELETE_BLOCKED'; end if;
  if tg_op='UPDATE' then
    perform 1 from public.workforce_payroll_periods
      where id=old.period_id and status='draft' for update;
    if not found then raise exception 'WORKFORCE_PAYROLL_ORIGINAL_PERIOD_LOCKED'; end if;
  end if;
  select * into v_period from public.workforce_payroll_periods
    where id=new.period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;
  select * into v_segment from public.workforce_actual_segments where id=new.segment_id;
  if not found or v_segment.review_status <> 'approved' or v_segment.event_kind <> 'worked'
    or v_segment.staff_id <> new.staff_id or v_segment.operational_role <> new.operational_role then
    raise exception 'WORKFORCE_PAYROLL_SEGMENT_UNVERIFIED';
  end if;
  select date into v_shift_date from public.shifts where id=v_segment.shift_id;
  if v_shift_date is null or v_shift_date < v_period.period_start
    or v_shift_date > v_period.period_end then
    raise exception 'WORKFORCE_PAYROLL_OUTSIDE_PERIOD';
  end if;
  v_duration_seconds := extract(epoch from (v_segment.actual_end_at-v_segment.actual_start_at));
  if v_duration_seconds is null or v_duration_seconds <= 0
    or mod(v_duration_seconds,60) <> 0
    or v_duration_seconds/60 <> new.actual_minutes
    or new.payable_minutes > new.actual_minutes then
    raise exception 'WORKFORCE_PAYROLL_UNVERIFIED_MINUTES';
  end if;
  v_computed_gross := round(
    new.rate_vnd_per_hour::numeric *
      ((new.payable_minutes-new.overtime_minutes)::numeric
        + new.overtime_minutes::numeric*new.overtime_multiplier_basis_points::numeric/10000)
      / 60
  )::bigint;
  if v_computed_gross <> new.gross_vnd then
    raise exception 'WORKFORCE_PAYROLL_GROSS_MISMATCH';
  end if;
  select * into v_rate from public.workforce_rate_cards where id=new.rate_card_id;
  if not found or v_rate.operational_role <> new.operational_role
    or (v_rate.staff_id is not null and v_rate.staff_id <> new.staff_id)
    or v_shift_date < v_rate.effective_from
    or (v_rate.effective_through is not null and v_shift_date > v_rate.effective_through)
    or v_rate.vnd_per_hour <> new.rate_vnd_per_hour
    or v_rate.overtime_multiplier_basis_points <> new.overtime_multiplier_basis_points then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;
  return new;
end $$;


--
-- Name: workforce_rc16_period_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_period_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op='INSERT' then
    if new.status <> 'draft' or new.locked_by is not null or new.locked_at is not null then
      raise exception 'WORKFORCE_PERIOD_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op='DELETE' then
    raise exception 'WORKFORCE_PERIOD_DELETE_BLOCKED';
  end if;
  if old.status='locked' then
    raise exception 'WORKFORCE_PERIOD_LOCKED';
  end if;
  if new.period_start is distinct from old.period_start or new.period_end is distinct from old.period_end
    or new.revision is distinct from old.revision then
    raise exception 'WORKFORCE_PERIOD_IDENTITY_IMMUTABLE';
  end if;
  if new.status='reviewed' and new.reviewed_by is null then
    raise exception 'WORKFORCE_REVIEW_ACTOR_REQUIRED';
  end if;
  if new.status in ('confirmed','payroll_ready','locked')
    and (new.reviewed_by is null or new.confirmed_by is null) then
    raise exception 'WORKFORCE_CONFIRM_ACTORS_REQUIRED';
  end if;
  if new.status is distinct from old.status
    and coalesce(current_setting('workforce.rc16_transition_call',true),'') <> '1' then
    raise exception 'WORKFORCE_PERIOD_TRANSITION_REQUIRES_AUDITED_RPC';
  end if;
  if new.status is distinct from old.status
    and not (
      (old.status='draft' and new.status='reviewed')
      or (old.status='reviewed' and new.status='confirmed')
      or (old.status='confirmed' and new.status='payroll_ready')
      or (old.status='payroll_ready' and new.status='locked')
    ) then
    raise exception 'WORKFORCE_PAYROLL_INVALID_TRANSITION';
  end if;
  return new;
end $$;


--
-- Name: workforce_rc16_rate_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_rate_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op = 'DELETE' then
    raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
  end if;
  if tg_op = 'UPDATE' then
    -- Updates are only permitted via the authorized supersession RPC
    if coalesce(current_setting('workforce.rc17b_supersede_call', true), '') <> '1' then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;

    -- Only effective_through is allowed to be closed to a bounded date. All financial, identity, and approval fields are strictly immutable.
    if (new.id, new.staff_id, new.operational_role, new.effective_from, new.vnd_per_hour,
        new.overtime_multiplier_basis_points, new.approved_by, new.approval_note, new.approved_at, new.created_at)
      is distinct from
       (old.id, old.staff_id, old.operational_role, old.effective_from, old.vnd_per_hour,
        old.overtime_multiplier_basis_points, old.approved_by, old.approval_note, old.approved_at, old.created_at) then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;
    if new.effective_through is null or new.effective_through < old.effective_from
      or (old.effective_through is not null and new.effective_through > old.effective_through) then
      raise exception 'WORKFORCE_APPROVED_RATE_IMMUTABLE';
    end if;
    return new;
  end if;

  -- INSERT checks
  if new.staff_id is not null and new.staff_id=new.approved_by then
    raise exception 'WORKFORCE_RATE_SELF_APPROVAL_BLOCKED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.staff_id,'__ROLE_DEFAULT__')||':'||new.operational_role,0));
  if exists (
    select 1 from public.workforce_rate_cards r
    where r.operational_role=new.operational_role
      and r.staff_id is not distinct from new.staff_id
      and r.effective_from <= coalesce(new.effective_through,'infinity'::date)
      and new.effective_from <= coalesce(r.effective_through,'infinity'::date)
  ) then
    raise exception 'WORKFORCE_APPROVED_RATE_OVERLAP';
  end if;
  return new;
end $$;


--
-- Name: workforce_payroll_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_payroll_periods (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_by text NOT NULL,
    reviewed_by text,
    confirmed_by text,
    locked_by text,
    locked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT workforce_lock_fields CHECK ((((status = 'locked'::text) AND (locked_by IS NOT NULL) AND (locked_at IS NOT NULL)) OR ((status <> 'locked'::text) AND (locked_by IS NULL) AND (locked_at IS NULL)))),
    CONSTRAINT workforce_payroll_periods_revision_check CHECK ((revision >= 1)),
    CONSTRAINT workforce_payroll_periods_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'reviewed'::text, 'confirmed'::text, 'payroll_ready'::text, 'locked'::text]))),
    CONSTRAINT workforce_period_dates CHECK (((period_end >= period_start) AND (period_end < (period_start + '93 days'::interval))))
);


--
-- Name: workforce_rc16_transition_payroll(text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16_transition_payroll(p_period_id text, p_expected_status text, p_target_status text, p_actor_id text, p_reason text) RETURNS public.workforce_payroll_periods
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_action text;
begin
  if p_actor_id is null or not exists (
    select 1 from public.business_users where id=p_actor_id
  ) then raise exception 'WORKFORCE_ACTOR_UNKNOWN'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 2000 then
    raise exception 'WORKFORCE_TRANSITION_REASON_REQUIRED';
  end if;
  select * into v_period from public.workforce_payroll_periods
    where id=p_period_id for update;
  if not found or v_period.status <> p_expected_status then
    raise exception 'WORKFORCE_PAYROLL_STALE_PERIOD';
  end if;
  if (v_period.status,p_target_status) not in (
    ('draft','reviewed'), ('reviewed','confirmed'),
    ('confirmed','payroll_ready'), ('payroll_ready','locked')
  ) then raise exception 'WORKFORCE_PAYROLL_INVALID_TRANSITION'; end if;
  if p_target_status='reviewed' then
    -- The period cannot be edited after Review; prevent an irrecoverable empty
    -- Reviewed/Confirmed state that could never reach Payroll Ready.
    if not exists (select 1 from public.workforce_payroll_lines
      where period_id=p_period_id) then
      raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD';
    end if;
    if v_period.created_by=p_actor_id then
      raise exception 'WORKFORCE_PAYROLL_SELF_REVIEW';
    end if;
    v_action := 'review';
  elsif p_target_status='confirmed' then
    if v_period.reviewed_by=p_actor_id then
      raise exception 'WORKFORCE_PAYROLL_SELF_CONFIRM';
    end if;
    v_action := 'confirm';
  elsif p_target_status='payroll_ready' then
    if not exists (select 1 from public.workforce_payroll_lines where period_id=p_period_id) then
      raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD';
    end if;
    v_action := 'mark_ready';
  else
    if not exists (select 1 from public.workforce_payroll_lines where period_id=p_period_id) then
      raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD';
    end if;
    v_action := 'lock';
  end if;
  perform set_config('workforce.rc16_transition_call','1',true);
  update public.workforce_payroll_periods
    set status=p_target_status,
      reviewed_by=case when p_target_status='reviewed' then p_actor_id else reviewed_by end,
      confirmed_by=case when p_target_status='confirmed' then p_actor_id else confirmed_by end,
      locked_by=case when p_target_status='locked' then p_actor_id else locked_by end,
      locked_at=case when p_target_status='locked' then statement_timestamp() else locked_at end,
      updated_at=statement_timestamp()
    where id=p_period_id returning * into v_period;
  insert into public.workforce_payroll_audit(
    period_id,action,from_status,to_status,actor_id,reason)
    values(p_period_id,v_action,p_expected_status,p_target_status,p_actor_id,p_reason);
  return v_period;
end $$;


--
-- Name: workforce_rc16b_correct_payroll_line(text, text, integer, uuid, text, text, text, integer, integer, bigint, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16b_correct_payroll_line(p_period_id text, p_line_id text, p_expected_version integer, p_request_id uuid, p_action text, p_actor_id text, p_reason text, p_payable_minutes integer DEFAULT NULL::integer, p_overtime_minutes integer DEFAULT NULL::integer, p_adjustment_vnd bigint DEFAULT NULL::bigint, p_adjustment_reason text DEFAULT NULL::text, p_expected_gross_vnd bigint DEFAULT NULL::bigint) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_line public.workforce_payroll_lines%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_period public.workforce_payroll_periods%rowtype;
  v_previous jsonb;
  v_payload jsonb;
  v_gross bigint;
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1
    or p_expected_version >= 2147483647 or p_action is null
    or p_action not in ('correct_line','void_line')
    or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  v_payload := jsonb_build_object(
    'period_id',p_period_id,'line_id',p_line_id,'expected_version',p_expected_version,
    'action',p_action,'reason',p_reason,'payable_minutes',p_payable_minutes,
    'overtime_minutes',p_overtime_minutes,'adjustment_vnd',p_adjustment_vnd,
    'adjustment_reason',p_adjustment_reason,'expected_gross_vnd',p_expected_gross_vnd);
  -- Serialize the request key before period/line locks, including retries.
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text,0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('line',v_audit.updated_values,'audit',to_jsonb(v_audit),'replayed',true);
  end if;
  -- Same lock order as prepare_line and period transitions: period, then line.
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;
  select * into v_line from public.workforce_payroll_lines
    where id=p_line_id and period_id=p_period_id for update;
  if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
  if v_line.version <> p_expected_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
  if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;
  v_previous := to_jsonb(v_line);
  if p_action='correct_line' then
    if p_payable_minutes is null or p_payable_minutes not between 0 and v_line.actual_minutes
      or p_overtime_minutes is null or p_overtime_minutes not between 0 and p_payable_minutes
      or p_adjustment_vnd is null or p_adjustment_vnd not between -1000000000000 and 1000000000000
      or (p_adjustment_vnd=0 and p_adjustment_reason is not null)
      or (p_adjustment_vnd<>0 and char_length(trim(coalesce(p_adjustment_reason,''))) not between 8 and 1000)
    then raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID'; end if;
    v_gross := round(v_line.rate_vnd_per_hour::numeric *
      ((p_payable_minutes-p_overtime_minutes)::numeric
        + p_overtime_minutes::numeric*v_line.overtime_multiplier_basis_points/10000)/60)::bigint;
    if p_expected_gross_vnd is null or p_expected_gross_vnd <> v_gross then
      raise exception 'WORKFORCE_PAYROLL_GROSS_MISMATCH';
    end if;
    if v_gross+p_adjustment_vnd not between 0 and 1000000000000 then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;
  elsif p_payable_minutes is not null or p_overtime_minutes is not null
    or p_adjustment_vnd is not null or p_adjustment_reason is not null or p_expected_gross_vnd is not null then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  perform set_config('workforce.rc16b_line_call','1',true);
  if p_action='correct_line' then
    update public.workforce_payroll_lines set
      payable_minutes=p_payable_minutes,overtime_minutes=p_overtime_minutes,
      adjustment_vnd=p_adjustment_vnd,adjustment_reason=p_adjustment_reason,gross_vnd=v_gross,
      version=version+1,updated_at=statement_timestamp()
      where id=p_line_id returning * into v_line;
  else
    update public.workforce_payroll_lines set voided_at=statement_timestamp(),
      version=version+1,updated_at=statement_timestamp()
      where id=p_line_id returning * into v_line;
  end if;
  perform set_config('workforce.rc16b_line_call','',true);
  insert into public.workforce_payroll_audit(
    period_id,line_id,line_version,action,from_status,to_status,actor_id,reason,
    request_id,request_payload,previous_values,updated_values
  ) values (
    p_period_id,p_line_id,v_line.version,p_action,'draft','draft',p_actor_id,p_reason,
    p_request_id,v_payload,v_previous,to_jsonb(v_line)
  ) returning * into v_audit;
  return jsonb_build_object('line',to_jsonb(v_line),'audit',to_jsonb(v_audit),'replayed',false);
end $$;


--
-- Name: workforce_rc16b_line_change_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16b_line_change_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if tg_op='DELETE' then raise exception 'WORKFORCE_PAYROLL_LINE_DELETE_BLOCKED'; end if;
  if tg_op='INSERT' then
    if new.version <> 1 or new.voided_at is not null then
      raise exception 'WORKFORCE_PAYROLL_LINE_MUST_START_ACTIVE';
    end if;
    if exists (
      select 1 from public.workforce_rate_cards selected
      join public.workforce_actual_segments a on a.id=new.segment_id
      join public.shifts s on s.id=a.shift_id
      join public.workforce_rate_cards specific on specific.staff_id=new.staff_id
        and specific.operational_role=new.operational_role
        and specific.effective_from<=s.date
        and (specific.effective_through is null or specific.effective_through>=s.date)
      where selected.id=new.rate_card_id and selected.staff_id is null
    ) then raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED'; end if;
    return new;
  end if;

  if coalesce(current_setting('workforce.rc16b_line_call',true),'') <> '1'
    and coalesce(current_setting('workforce.rc17b_recalc_call',true),'') <> '1' then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC';
  end if;

  if old.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;
  if new.version <> old.version+1 then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;

  -- In recalculation mode, rate card and amounts can change, but segment and staff identity cannot
  if coalesce(current_setting('workforce.rc17b_recalc_call',true),'') = '1' then
    if (new.id, new.period_id, new.segment_id, new.staff_id, new.operational_role, new.actual_minutes, new.created_at)
      is distinct from
       (old.id, old.period_id, old.segment_id, old.staff_id, old.operational_role, old.actual_minutes, old.created_at) then
      raise exception 'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE';
    end if;
    return new;
  end if;

  -- Default rc16b correct_line mode: rate card and identity are strictly immutable
  if (new.id,new.period_id,new.segment_id,new.rate_card_id,new.staff_id,
      new.operational_role,new.actual_minutes,new.rate_vnd_per_hour,
      new.overtime_multiplier_basis_points,new.calculation_version,new.created_at)
    is distinct from
     (old.id,old.period_id,old.segment_id,old.rate_card_id,old.staff_id,
      old.operational_role,old.actual_minutes,old.rate_vnd_per_hour,
      old.overtime_multiplier_basis_points,old.calculation_version,old.created_at) then
    raise exception 'WORKFORCE_PAYROLL_LINE_IDENTITY_IMMUTABLE';
  end if;
  if new.voided_at is not null and
    (new.payable_minutes,new.overtime_minutes,new.gross_vnd,new.adjustment_vnd,new.adjustment_reason)
      is distinct from
    (old.payable_minutes,old.overtime_minutes,old.gross_vnd,old.adjustment_vnd,old.adjustment_reason) then
    raise exception 'WORKFORCE_PAYROLL_VOID_MUST_PRESERVE_EVIDENCE';
  end if;
  return new;
end $$;


--
-- Name: workforce_rc16b_period_review_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc16b_period_review_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
  if new.status is distinct from old.status then
    if new.status in ('reviewed','payroll_ready','locked') and not exists (
      select 1 from public.workforce_payroll_lines where period_id=old.id and voided_at is null
    ) then raise exception 'WORKFORCE_PAYROLL_EMPTY_PERIOD'; end if;

    if new.status='reviewed' and (
      new.reviewed_by = old.created_by
      or exists (
        select 1 from public.workforce_payroll_audit where period_id=old.id
          and action in ('correct_line','void_line','recalculate_line','recalculate_batch','auto_calculate_batch')
          and actor_id=new.reviewed_by
      )
    ) then raise exception 'WORKFORCE_PAYROLL_SELF_REVIEW'; end if;

    -- Block review/lock if approved worked segments in this period have no line (active or void)
    if new.status in ('reviewed','confirmed') and exists (
      select 1 from public.workforce_actual_segments a
      join public.shifts s on s.id=a.shift_id
      where s.deleted_at is null
        and s.date >= old.period_start and s.date <= old.period_end
        and a.event_kind = 'worked' and a.review_status = 'approved'
        and not exists (
          select 1 from public.workforce_payroll_lines l where l.segment_id = a.id
        )
    ) then
      raise exception 'WORKFORCE_PAYROLL_UNRECONCILED_SEGMENTS_REMAIN';
    end if;
  end if;
  return new;
end $$;


--
-- Name: workforce_rc17b_auto_calculate_draft_batch(text, uuid, text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc17b_auto_calculate_draft_batch(p_period_id text, p_request_id uuid, p_actor_id text, p_reason text DEFAULT NULL::text, p_insert_lines jsonb DEFAULT '[]'::jsonb, p_recalc_items jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_new_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_payload jsonb;
  v_previous_lines jsonb := '[]'::jsonb;
  v_inserted_lines jsonb := '[]'::jsonb;
  v_recalculated_lines jsonb := '[]'::jsonb;
  v_updated_result jsonb;
  v_ins jsonb;
  v_item jsonb;
  v_item_line_id text;
  v_item_version integer;
  v_item_rate_id text;
  v_segment_id text;
  v_shift_date date;
  v_new_gross bigint;
  v_new_net bigint;
  v_seen_segments text[] := '{}';
  v_seen_lines text[] := '{}';
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;

  if p_request_id is null then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;
  if p_reason is not null and char_length(trim(p_reason)) not between 8 and 2000 then
    raise exception 'WORKFORCE_CORRECTION_REASON_REQUIRED';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id,
    'action', 'auto_calculate_batch',
    'reason', p_reason,
    'insert_lines', coalesce(p_insert_lines, '[]'::jsonb),
    'recalc_items', coalesce(p_recalc_items, '[]'::jsonb)
  );

  -- Serialize request idempotency per actor+request_id
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));

  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'inserted_lines', coalesce(v_audit.updated_values->'inserted_lines', '[]'::jsonb),
      'recalculated_lines', coalesce(v_audit.updated_values->'recalculated_lines', '[]'::jsonb),
      'audit', to_jsonb(v_audit),
      'replayed', true
    );
  end if;

  -- Lock period for update and ensure it is still draft
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- 1. Insert new lines
  if p_insert_lines is not null and jsonb_typeof(p_insert_lines) = 'array' then
    for v_ins in select * from jsonb_array_elements(p_insert_lines) loop
      v_segment_id := v_ins->>'segment_id';
      if v_segment_id is null then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      if v_segment_id = any(v_seen_segments) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_SEGMENT';
      end if;
      v_seen_segments := array_append(v_seen_segments, v_segment_id);

      if exists (select 1 from public.workforce_payroll_lines where segment_id = v_segment_id) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_SEGMENT';
      end if;

      insert into public.workforce_payroll_lines (
        period_id, segment_id, rate_card_id, staff_id, operational_role,
        actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
        overtime_multiplier_basis_points, gross_vnd, adjustment_vnd,
        adjustment_reason, calculation_version
      ) values (
        p_period_id,
        v_segment_id,
        v_ins->>'rate_card_id',
        v_ins->>'staff_id',
        v_ins->>'operational_role',
        (v_ins->>'actual_minutes')::integer,
        (v_ins->>'payable_minutes')::integer,
        (v_ins->>'overtime_minutes')::integer,
        (v_ins->>'rate_vnd_per_hour')::integer,
        (v_ins->>'overtime_multiplier_basis_points')::integer,
        (v_ins->>'gross_vnd')::bigint,
        coalesce((v_ins->>'adjustment_vnd')::bigint, 0),
        v_ins->>'adjustment_reason',
        coalesce(v_ins->>'calculation_version', 'rc17b-v1')
      ) returning * into v_new_line;

      v_inserted_lines := v_inserted_lines || jsonb_build_array(to_jsonb(v_new_line));
    end loop;
  end if;

  -- 2. Recalculate existing lines
  if p_recalc_items is not null and jsonb_typeof(p_recalc_items) = 'array' and jsonb_array_length(p_recalc_items) > 0 then
    perform set_config('workforce.rc17b_recalc_call', '1', true);

    for v_item in select * from jsonb_array_elements(p_recalc_items) loop
      v_item_line_id := v_item->>'line_id';
      v_item_version := (v_item->>'expected_version')::integer;
      v_item_rate_id := v_item->>'new_rate_card_id';

      if v_item_line_id is null or v_item_version is null or v_item_version < 1 or v_item_rate_id is null then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      if v_item_line_id = any(v_seen_lines) then
        raise exception 'WORKFORCE_PAYROLL_DUPLICATE_LINE_IN_BATCH';
      end if;
      v_seen_lines := array_append(v_seen_lines, v_item_line_id);

      select * into v_line from public.workforce_payroll_lines
        where id=v_item_line_id and period_id=p_period_id for update;
      if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
      if v_line.version <> v_item_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
      if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

      select s.date into v_shift_date from public.workforce_actual_segments a
        join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

      select * into v_rate from public.workforce_rate_cards where id=v_item_rate_id;
      if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
        or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
        or v_rate.effective_from > v_shift_date
        or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
        raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
      end if;

      if v_rate.staff_id is null and exists (
        select 1 from public.workforce_rate_cards specific
        where specific.staff_id = v_line.staff_id
          and specific.operational_role = v_line.operational_role
          and specific.approved_by is not null
          and specific.effective_from <= v_shift_date
          and (specific.effective_through is null or specific.effective_through >= v_shift_date)
      ) then
        raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
      end if;

      v_previous_lines := v_previous_lines || jsonb_build_array(to_jsonb(v_line));

      v_new_gross := round(v_rate.vnd_per_hour::numeric *
        ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
          + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

      v_new_net := v_new_gross + v_line.adjustment_vnd;
      if v_new_net < 0 or v_new_net > 1000000000000 then
        raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
      end if;

      update public.workforce_payroll_lines
        set rate_card_id = v_rate.id,
            rate_vnd_per_hour = v_rate.vnd_per_hour,
            overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
            gross_vnd = v_new_gross,
            version = v_line.version + 1,
            updated_at = statement_timestamp()
        where id = v_line.id
        returning * into v_line;

      v_recalculated_lines := v_recalculated_lines || jsonb_build_array(to_jsonb(v_line));
    end loop;
  end if;

  v_updated_result := jsonb_build_object(
    'inserted_lines', v_inserted_lines,
    'recalculated_lines', v_recalculated_lines
  );

  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, null, null, 'auto_calculate_batch', p_actor_id, coalesce(p_reason, 'Auto-calculate payroll draft batch'),
    p_request_id, v_payload, v_previous_lines, v_updated_result
  ) returning * into v_audit;

  return jsonb_build_object(
    'inserted_lines', v_inserted_lines,
    'recalculated_lines', v_recalculated_lines,
    'audit', to_jsonb(v_audit),
    'replayed', false
  );
end $$;


--
-- Name: workforce_rc17b_recalculate_draft_batch(text, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc17b_recalculate_draft_batch(p_period_id text, p_request_id uuid, p_actor_id text, p_reason text, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_item jsonb;
  v_item_line_id text;
  v_item_version integer;
  v_item_rate_id text;
  v_payload jsonb;
  v_previous_lines jsonb := '[]'::jsonb;
  v_updated_lines jsonb := '[]'::jsonb;
  v_shift_date date;
  v_new_gross bigint;
  v_new_net bigint;
  v_seen_lines text[] := array[]::text[];
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000
    or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id,
    'action', 'recalculate_batch',
    'reason', p_reason,
    'items', p_items
  );

  -- Serialize request idempotency per actor + request_id
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('lines', v_audit.updated_values, 'audit', to_jsonb(v_audit), 'replayed', true);
  end if;

  -- Lock period for update and ensure it is still draft
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- Set recalculation config for line_change_guard
  perform set_config('workforce.rc17b_recalc_call', '1', true);

  -- Iterate through items and update each line atomically
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_item_line_id := v_item->>'line_id';
    v_item_version := (v_item->>'expected_version')::integer;
    v_item_rate_id := v_item->>'new_rate_card_id';

    if v_item_line_id is null or v_item_version is null or v_item_version < 1 or v_item_rate_id is null then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;

    -- Duplicate line in same batch check
    if v_item_line_id = any(v_seen_lines) then
      raise exception 'WORKFORCE_PAYROLL_DUPLICATE_LINE_IN_BATCH';
    end if;
    v_seen_lines := array_append(v_seen_lines, v_item_line_id);

    -- Lock and verify line
    select * into v_line from public.workforce_payroll_lines
      where id=v_item_line_id and period_id=p_period_id for update;
    if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
    if v_line.version <> v_item_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
    if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

    -- Get shift date
    select s.date into v_shift_date from public.workforce_actual_segments a
      join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

    -- Verify new rate card exists and is valid for this staff/role/date
    select * into v_rate from public.workforce_rate_cards where id=v_item_rate_id;
    if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
      or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
      or v_rate.effective_from > v_shift_date
      or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
      raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
    end if;

    -- Staff-specific precedence: cannot use role-default if a valid staff-specific rate exists
    if v_rate.staff_id is null and exists (
      select 1 from public.workforce_rate_cards specific
      where specific.staff_id = v_line.staff_id
        and specific.operational_role = v_line.operational_role
        and specific.approved_by is not null
        and specific.effective_from <= v_shift_date
        and (specific.effective_through is null or specific.effective_through >= v_shift_date)
    ) then
      raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
    end if;

    v_previous_lines := v_previous_lines || jsonb_build_array(to_jsonb(v_line));

    -- Calculate new gross
    v_new_gross := round(v_rate.vnd_per_hour::numeric *
      ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
        + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

    -- Preserve existing adjustment_vnd exactly
    v_new_net := v_new_gross + v_line.adjustment_vnd;
    if v_new_net < 0 or v_new_net > 1000000000000 then
      raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
    end if;

    update public.workforce_payroll_lines
      set rate_card_id = v_rate.id,
          rate_vnd_per_hour = v_rate.vnd_per_hour,
          overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
          gross_vnd = v_new_gross,
          version = v_line.version + 1,
          updated_at = statement_timestamp()
      where id = v_line.id
      returning * into v_line;

    v_updated_lines := v_updated_lines || jsonb_build_array(to_jsonb(v_line));
  end loop;

  -- Record batch audit
  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, null, null, 'recalculate_batch', p_actor_id, p_reason,
    p_request_id, v_payload, v_previous_lines, v_updated_lines
  ) returning * into v_audit;

  return jsonb_build_object('lines', v_updated_lines, 'audit', to_jsonb(v_audit), 'replayed', false);
end $$;


--
-- Name: workforce_rc17b_recalculate_draft_line(text, text, integer, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc17b_recalculate_draft_line(p_period_id text, p_line_id text, p_expected_version integer, p_request_id uuid, p_actor_id text, p_reason text, p_new_rate_card_id text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_period public.workforce_payroll_periods%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_audit public.workforce_payroll_audit%rowtype;
  v_previous jsonb;
  v_payload jsonb;
  v_new_gross bigint;
  v_new_net bigint;
  v_shift_date date;
begin
  if not exists (select 1 from public.business_users where id=p_actor_id
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1
    or char_length(trim(coalesce(p_reason,''))) not between 8 and 2000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  v_payload := jsonb_build_object(
    'period_id', p_period_id, 'line_id', p_line_id, 'expected_version', p_expected_version,
    'action', 'recalculate_line', 'reason', p_reason, 'new_rate_card_id', p_new_rate_card_id
  );

  -- Serialize request idempotency
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id||':'||p_request_id::text, 0));
  select * into v_audit from public.workforce_payroll_audit
    where actor_id=p_actor_id and request_id=p_request_id;
  if found then
    if v_audit.request_payload is distinct from v_payload then
      raise exception 'WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('line', v_audit.updated_values, 'audit', to_jsonb(v_audit), 'replayed', true);
  end if;

  -- Lock period and verify draft status
  select * into v_period from public.workforce_payroll_periods where id=p_period_id for update;
  if not found or v_period.status <> 'draft' then
    raise exception 'WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT';
  end if;

  -- Lock line
  select * into v_line from public.workforce_payroll_lines
    where id=p_line_id and period_id=p_period_id for update;
  if not found then raise exception 'WORKFORCE_PAYROLL_LINE_NOT_FOUND'; end if;
  if v_line.version <> p_expected_version then raise exception 'WORKFORCE_PAYROLL_STALE_LINE'; end if;
  if v_line.voided_at is not null then raise exception 'WORKFORCE_PAYROLL_LINE_VOIDED'; end if;

  -- Get shift date
  select s.date into v_shift_date from public.workforce_actual_segments a
    join public.shifts s on s.id=a.shift_id where a.id=v_line.segment_id;

  -- Verify new rate card exists and is valid for this staff/role/date
  select * into v_rate from public.workforce_rate_cards where id=p_new_rate_card_id;
  if not found or v_rate.approved_by is null or v_rate.operational_role <> v_line.operational_role
    or (v_rate.staff_id is not null and v_rate.staff_id <> v_line.staff_id)
    or v_rate.effective_from > v_shift_date
    or (v_rate.effective_through is not null and v_rate.effective_through < v_shift_date) then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;

  -- Staff-specific precedence: cannot use role-default if a valid staff-specific rate exists
  if v_rate.staff_id is null and exists (
    select 1 from public.workforce_rate_cards specific
    where specific.staff_id = v_line.staff_id
      and specific.operational_role = v_line.operational_role
      and specific.approved_by is not null
      and specific.effective_from <= v_shift_date
      and (specific.effective_through is null or specific.effective_through >= v_shift_date)
  ) then
    raise exception 'WORKFORCE_PAYROLL_RATE_UNVERIFIED';
  end if;

  v_previous := to_jsonb(v_line);

  -- Calculate new gross
  v_new_gross := round(v_rate.vnd_per_hour::numeric *
    ((v_line.payable_minutes - v_line.overtime_minutes)::numeric
      + v_line.overtime_minutes::numeric * v_rate.overtime_multiplier_basis_points / 10000) / 60)::bigint;

  -- Preserve existing adjustment_vnd exactly
  v_new_net := v_new_gross + v_line.adjustment_vnd;
  if v_new_net < 0 or v_new_net > 1000000000000 then
    raise exception 'WORKFORCE_PAYROLL_CORRECTION_INVALID';
  end if;

  -- Perform line update under rc17b setting
  perform set_config('workforce.rc17b_recalc_call', '1', true);
  update public.workforce_payroll_lines
    set rate_card_id = v_rate.id,
        rate_vnd_per_hour = v_rate.vnd_per_hour,
        overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
        gross_vnd = v_new_gross,
        version = v_line.version + 1,
        updated_at = statement_timestamp()
    where id = v_line.id
    returning * into v_line;

  insert into public.workforce_payroll_audit(
    period_id, line_id, line_version, action, actor_id, reason,
    request_id, request_payload, previous_values, updated_values
  ) values (
    p_period_id, v_line.id, v_line.version, 'recalculate_line', p_actor_id, p_reason,
    p_request_id, v_payload, v_previous, to_jsonb(v_line)
  ) returning * into v_audit;

  return jsonb_build_object('line', to_jsonb(v_line), 'audit', to_jsonb(v_audit), 'replayed', false);
end $$;


--
-- Name: workforce_rc17b_register_rate_card(text, text, date, date, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.workforce_rc17b_register_rate_card(p_staff_id text, p_operational_role text, p_effective_from date, p_effective_through date, p_vnd_per_hour integer, p_overtime_multiplier_basis_points integer, p_approved_by text, p_approval_note text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
declare
  v_old_rate public.workforce_rate_cards%rowtype;
  v_new_rate public.workforce_rate_cards%rowtype;
  v_superseded_id text := null;
begin
  if not exists (select 1 from public.business_users where id=p_approved_by
    and system_permission='admin' and status='active' and account_status='active'
    and deleted_at is null) then
    raise exception 'WORKFORCE_RATE_ACTOR_FORBIDDEN' using errcode='42501';
  end if;
  if p_staff_id is not null and p_staff_id = p_approved_by then
    raise exception 'WORKFORCE_RATE_SELF_APPROVAL_BLOCKED';
  end if;
  if p_effective_through is not null and p_effective_through < p_effective_from then
    raise exception 'WORKFORCE_RATE_DATES_INVALID';
  end if;
  if p_vnd_per_hour < 0 or p_vnd_per_hour > 100000000
    or p_overtime_multiplier_basis_points < 10000 or p_overtime_multiplier_basis_points > 50000
    or char_length(trim(coalesce(p_approval_note,''))) not between 8 and 1000 then
    raise exception 'WORKFORCE_RATE_INVALID';
  end if;

  -- Lock scope to serialize concurrent rate creations
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(p_staff_id,'__ROLE_DEFAULT__')||':'||p_operational_role, 0));

  -- Check if an active rate card starts before p_effective_from and extends into/past p_effective_from
  for v_old_rate in
    select * from public.workforce_rate_cards r
    where r.operational_role = p_operational_role
      and r.staff_id is not distinct from p_staff_id
      and r.effective_from < p_effective_from
      and (r.effective_through is null or r.effective_through >= p_effective_from)
    for update
  loop
    -- Guard: cannot retroactively alter a rate used by a LOCKED period ending >= p_effective_from
    if exists (
      select 1 from public.workforce_payroll_lines l
      join public.workforce_payroll_periods p on p.id = l.period_id
      where l.rate_card_id = v_old_rate.id
        and p.status = 'locked'
        and p.period_end >= p_effective_from
    ) then
      raise exception 'WORKFORCE_RATE_RETROACTIVE_LOCKED_PERIOD';
    end if;

    -- Close out the old rate card to the day before the new rate begins
    perform set_config('workforce.rc17b_supersede_call', '1', true);
    update public.workforce_rate_cards
      set effective_through = (p_effective_from - interval '1 day')::date
      where id = v_old_rate.id;

    v_superseded_id := v_old_rate.id;

    -- Record audit of supersession
    insert into public.workforce_payroll_audit(
      period_id, line_id, rate_card_id, action, actor_id, reason, previous_values, updated_values
    ) values (
      null, null, v_old_rate.id, 'supersede_rate_card', p_approved_by,
      'Khung lương cũ được tự động giới hạn hiệu lực trước đơn giá mới bắt đầu ngày ' || p_effective_from::text,
      jsonb_build_object('rate_card_id', v_old_rate.id, 'effective_from', v_old_rate.effective_from, 'effective_through', v_old_rate.effective_through),
      jsonb_build_object('rate_card_id', v_old_rate.id, 'effective_from', v_old_rate.effective_from, 'effective_through', (p_effective_from - interval '1 day')::date)
    );
  end loop;

  -- Insert new rate card
  insert into public.workforce_rate_cards(
    staff_id, operational_role, effective_from, effective_through,
    vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
  ) values (
    p_staff_id, p_operational_role, p_effective_from, p_effective_through,
    p_vnd_per_hour, p_overtime_multiplier_basis_points, p_approved_by, statement_timestamp(), p_approval_note
  ) returning * into v_new_rate;

  return jsonb_build_object(
    'rate', to_jsonb(v_new_rate),
    'superseded_rate_id', v_superseded_id
  );
end $$;


--
-- Name: identities; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.identities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider_id text,
    identity_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider text NOT NULL,
    last_sign_in_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: auth; Owner: -
--

CREATE TABLE auth.users (
    id uuid NOT NULL,
    email text,
    email_confirmed_at timestamp with time zone,
    raw_app_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_user_meta_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: job; Type: TABLE; Schema: cron; Owner: -
--

CREATE TABLE cron.job (
    jobid bigint NOT NULL,
    schedule text NOT NULL,
    command text NOT NULL,
    nodename text DEFAULT 'localhost'::text NOT NULL,
    nodeport integer DEFAULT 5432 NOT NULL,
    database text DEFAULT current_database() NOT NULL,
    username text DEFAULT CURRENT_USER NOT NULL,
    active boolean DEFAULT true NOT NULL,
    jobname text
);


--
-- Name: job_jobid_seq; Type: SEQUENCE; Schema: cron; Owner: -
--

ALTER TABLE cron.job ALTER COLUMN jobid ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME cron.job_jobid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: account_request_rate_limits; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.account_request_rate_limits (
    request_key text NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT account_request_rate_limits_count_nonnegative CHECK ((request_count >= 0)),
    CONSTRAINT account_request_rate_limits_key_not_blank CHECK ((btrim(request_key) <> ''::text))
);


--
-- Name: TABLE account_request_rate_limits; Type: COMMENT; Schema: private; Owner: -
--

COMMENT ON TABLE private.account_request_rate_limits IS 'Hashed request-key counters for public Account Request submission; no raw IP is persisted.';


--
-- Name: rbac01_role_default_events; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.rbac01_role_default_events (
    id bigint NOT NULL,
    version_id bigint NOT NULL,
    role text NOT NULL,
    event_type text NOT NULL,
    actor_business_user_id text NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    effective_at timestamp with time zone,
    resulting_version_id bigint,
    reason text NOT NULL,
    before_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    after_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT rbac01_role_default_events_check CHECK (((event_type = ANY (ARRAY['activation'::text, 'revocation'::text, 'rollback'::text])) = (effective_at IS NOT NULL))),
    CONSTRAINT rbac01_role_default_events_check1 CHECK (((event_type <> 'activation'::text) OR (resulting_version_id IS NOT NULL))),
    CONSTRAINT rbac01_role_default_events_check2 CHECK (((event_type <> 'revocation'::text) OR (resulting_version_id IS NULL))),
    CONSTRAINT rbac01_role_default_events_event_type_check CHECK ((event_type = ANY (ARRAY['proposal'::text, 'approval'::text, 'activation'::text, 'revocation'::text, 'rollback'::text]))),
    CONSTRAINT rbac01_role_default_events_reason_check CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 500))),
    CONSTRAINT rbac01_role_default_events_role_check CHECK ((role = ANY (ARRAY['member'::text, 'leader'::text, 'admin'::text])))
);

ALTER TABLE ONLY private.rbac01_role_default_events FORCE ROW LEVEL SECURITY;


--
-- Name: rbac01_role_default_events_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.rbac01_role_default_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.rbac01_role_default_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rbac01_role_default_versions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.rbac01_role_default_versions (
    id bigint NOT NULL,
    role text NOT NULL,
    version integer NOT NULL,
    expected_active_version integer NOT NULL,
    expected_active_version_id bigint,
    decisions jsonb NOT NULL,
    proposed_by text NOT NULL,
    proposed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    reason text NOT NULL,
    CONSTRAINT rbac01_role_default_versions_decisions_check CHECK ((jsonb_typeof(decisions) = 'object'::text)),
    CONSTRAINT rbac01_role_default_versions_expected_active_version_check CHECK ((expected_active_version >= 0)),
    CONSTRAINT rbac01_role_default_versions_reason_check CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 500))),
    CONSTRAINT rbac01_role_default_versions_role_check CHECK ((role = ANY (ARRAY['member'::text, 'leader'::text, 'admin'::text]))),
    CONSTRAINT rbac01_role_default_versions_version_check CHECK ((version > 0))
);

ALTER TABLE ONLY private.rbac01_role_default_versions FORCE ROW LEVEL SECURITY;


--
-- Name: rbac01_role_default_versions_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.rbac01_role_default_versions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.rbac01_role_default_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rbac02_account_permission_versions; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.rbac02_account_permission_versions (
    id bigint NOT NULL,
    target_business_user_id text NOT NULL,
    permission text NOT NULL,
    version integer NOT NULL,
    expected_version integer NOT NULL,
    decision text NOT NULL,
    actor_business_user_id text NOT NULL,
    reason text NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT rbac02_account_permission_versions_check CHECK (((decision = ANY (ARRAY['allow'::text, 'deny'::text])) OR (expires_at IS NULL))),
    CONSTRAINT rbac02_account_permission_versions_decision_check CHECK ((decision = ANY (ARRAY['allow'::text, 'deny'::text, 'reset'::text, 'revoke'::text]))),
    CONSTRAINT rbac02_account_permission_versions_expected_version_check CHECK ((expected_version >= 0)),
    CONSTRAINT rbac02_account_permission_versions_reason_check CHECK (((length(btrim(reason)) >= 5) AND (length(btrim(reason)) <= 500))),
    CONSTRAINT rbac02_account_permission_versions_version_check CHECK ((version > 0))
);

ALTER TABLE ONLY private.rbac02_account_permission_versions FORCE ROW LEVEL SECURITY;


--
-- Name: rbac02_account_permission_versions_id_seq; Type: SEQUENCE; Schema: private; Owner: -
--

ALTER TABLE private.rbac02_account_permission_versions ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME private.rbac02_account_permission_versions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rbac_permission_catalog; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.rbac_permission_catalog (
    permission text NOT NULL,
    legacy_defaults jsonb NOT NULL,
    hard_restricted boolean DEFAULT false NOT NULL,
    role_override_roles text[] DEFAULT '{}'::text[] NOT NULL,
    account_override_roles text[] DEFAULT '{}'::text[] NOT NULL,
    account_allow_roles text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT rbac_permission_catalog_account_allow_roles_check CHECK ((account_allow_roles <@ ARRAY['member'::text, 'leader'::text, 'admin'::text])),
    CONSTRAINT rbac_permission_catalog_account_override_roles_check CHECK ((account_override_roles <@ ARRAY['member'::text, 'leader'::text, 'admin'::text])),
    CONSTRAINT rbac_permission_catalog_check CHECK ((account_allow_roles <@ account_override_roles)),
    CONSTRAINT rbac_permission_catalog_check1 CHECK (((NOT hard_restricted) OR ((cardinality(role_override_roles) = 0) AND (cardinality(account_override_roles) = 0) AND (cardinality(account_allow_roles) = 0)))),
    CONSTRAINT rbac_permission_catalog_legacy_defaults_check CHECK ((jsonb_typeof(legacy_defaults) = 'object'::text)),
    CONSTRAINT rbac_permission_catalog_role_override_roles_check CHECK ((role_override_roles <@ ARRAY['member'::text, 'leader'::text, 'admin'::text]))
);

ALTER TABLE ONLY private.rbac_permission_catalog FORCE ROW LEVEL SECURITY;


--
-- Name: rbac_runtime_gate; Type: TABLE; Schema: private; Owner: -
--

CREATE TABLE private.rbac_runtime_gate (
    id boolean DEFAULT true NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    changed_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT rbac_runtime_gate_id_check CHECK (id)
);

ALTER TABLE ONLY private.rbac_runtime_gate FORCE ROW LEVEL SECURITY;


--
-- Name: attendance_photo_drive_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_photo_drive_folders (
    shift_id text NOT NULL,
    event_kind text NOT NULL,
    operational_role text NOT NULL,
    provider text NOT NULL,
    folder_id text NOT NULL,
    parent_folder_id text NOT NULL,
    logical_path text NOT NULL,
    last_materialized_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_verified_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_photo_drive_folders_event_kind_check CHECK ((event_kind = ANY (ARRAY['check_in'::text, 'check_out'::text]))),
    CONSTRAINT attendance_photo_drive_folders_folder_id_check CHECK ((btrim(folder_id) <> ''::text)),
    CONSTRAINT attendance_photo_drive_folders_logical_path_check CHECK ((btrim(logical_path) <> ''::text)),
    CONSTRAINT attendance_photo_drive_folders_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT attendance_photo_drive_folders_parent_folder_id_check CHECK ((btrim(parent_folder_id) <> ''::text)),
    CONSTRAINT attendance_photo_drive_folders_provider_check CHECK ((provider = 'google_drive'::text))
);


--
-- Name: TABLE attendance_photo_drive_folders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.attendance_photo_drive_folders IS 'Persisted Google Drive folder IDs for a confirmed Shift and role/event destination; server-role access only.';


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    actor_auth_user_id uuid,
    actor_business_user_id text,
    actor_name text,
    actor_role text,
    module text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    entity_name text NOT NULL,
    before_data jsonb,
    after_data jsonb,
    changed_fields text[] DEFAULT '{}'::text[] NOT NULL,
    reason text,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'success'::text NOT NULL,
    error_code text,
    correlation_id text DEFAULT (gen_random_uuid())::text NOT NULL,
    related_records jsonb,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    entity_exists boolean DEFAULT true NOT NULL,
    CONSTRAINT audit_logs_entity_id_not_blank CHECK ((btrim(entity_id) <> ''::text)),
    CONSTRAINT audit_logs_entity_type_not_blank CHECK ((btrim(entity_type) <> ''::text)),
    CONSTRAINT audit_logs_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT audit_logs_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'excel_import'::text, 'google_sheets'::text, 'system'::text, 'ocr'::text, 'upload'::text]))),
    CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);


--
-- Name: TABLE audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_logs IS 'Core V1 immutable, database-owned operational audit events.';


--
-- Name: brand01_campaign_product_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_campaign_product_skus (
    campaign_id text NOT NULL,
    sku_id text NOT NULL,
    owner_id text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL
);


--
-- Name: brand01_catalog_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_catalog_audit_events (
    id bigint NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    action text NOT NULL,
    actor_id text,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_catalog_audit_events_action_check CHECK ((action = ANY (ARRAY['insert'::text, 'update'::text])))
);


--
-- Name: brand01_catalog_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.brand01_catalog_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.brand01_catalog_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: brand01_knowledge_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_knowledge_reviews (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    knowledge_version_id text NOT NULL,
    decision text NOT NULL,
    reviewer_id text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_knowledge_reviews_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'changes_requested'::text])))
);


--
-- Name: brand01_product_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_product_brands (
    product_id text NOT NULL,
    brand_id text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by text NOT NULL,
    updated_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL
);


--
-- Name: brand01_product_resource_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand01_product_resource_links (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    resource_id text NOT NULL,
    product_id text,
    sku_id text,
    campaign_id text,
    relation_type text NOT NULL,
    owner_id text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT brand01_product_resource_links_relation_type_check CHECK ((relation_type = ANY (ARRAY['image'::text, 'kv'::text, 'guideline'::text, 'script'::text, 'training'::text, 'faq'::text, 'scheme'::text, 'marketing_data'::text, 'document'::text, 'other'::text]))),
    CONSTRAINT brand01_resource_one_target CHECK ((num_nonnulls(product_id, sku_id, campaign_id) = 1))
);


--
-- Name: TABLE brand01_product_resource_links; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.brand01_product_resource_links IS 'Links existing STO-02 metadata only. Link scope does not grant registry or provider visibility.';


--
-- Name: brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brands (
    id text NOT NULL,
    name text NOT NULL,
    logo_url text,
    color text,
    description text,
    category text,
    status text DEFAULT 'active'::text NOT NULL,
    contact_person text,
    contact_email text,
    contact_phone text,
    brand_guideline text,
    tone_of_voice text,
    key_products text[] DEFAULT '{}'::text[] NOT NULL,
    mandatory_claims text[] DEFAULT '{}'::text[] NOT NULL,
    restricted_claims text[] DEFAULT '{}'::text[] NOT NULL,
    dos text[] DEFAULT '{}'::text[] NOT NULL,
    donts text[] DEFAULT '{}'::text[] NOT NULL,
    asset_links text[] DEFAULT '{}'::text[] NOT NULL,
    notes text,
    updated_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    storage_profile text,
    storage_profile_reviewed_by text,
    storage_profile_reviewed_at timestamp with time zone,
    CONSTRAINT brands_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT brands_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT brands_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text]))),
    CONSTRAINT brands_storage_profile_check CHECK ((storage_profile = ANY (ARRAY['LEGACY_CATEGORY_PERIOD'::text, 'LEGACY_PLATFORM_CATEGORY_PERIOD'::text, 'LEGACY_PERIOD_CATEGORY'::text, 'LEGACY_SUBBRAND_PERIOD_CATEGORY'::text, 'LEGACY_SUBBRAND_CATEGORY_PERIOD'::text, 'CANONICAL_V1'::text, 'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'::text])))
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id text NOT NULL,
    name text NOT NULL,
    brand_id text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    type text,
    notes text,
    campaign_url text,
    website_url text,
    website_title text,
    website_preview_image text,
    website_embed_enabled boolean DEFAULT false NOT NULL,
    platform_source text,
    platform_ids text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    owner_id text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    CONSTRAINT campaigns_date_order_check CHECK ((end_date >= start_date)),
    CONSTRAINT campaigns_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT campaigns_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: COLUMN campaigns.platform_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaigns.platform_ids IS 'P1 compatibility array. Referential validation is performed by the migration and future adapter.';


--
-- Name: media_stream_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_stream_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    brand_id text NOT NULL,
    platform_id text NOT NULL,
    studio text NOT NULL,
    active_shift_id text NOT NULL,
    media_path text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_stream_routes_media_path_check CHECK ((media_path ~ '^[a-z][a-z0-9_]{0,63}$'::text)),
    CONSTRAINT media_stream_routes_studio_check CHECK (((length(studio) >= 1) AND (length(studio) <= 128) AND (studio = btrim(studio))))
);


--
-- Name: TABLE media_stream_routes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.media_stream_routes IS 'Media PoC metadata only. Exact brand/platform/studio/active shift -> HLS path. Operator provisioned only, no video.';


--
-- Name: media_viewer_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_viewer_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid NOT NULL,
    shift_id text NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT media_viewer_grants_check CHECK ((valid_until > valid_from))
);


--
-- Name: TABLE media_viewer_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.media_viewer_grants IS 'Explicit user + shift viewer ACL. Default denied, no implicit leader/admin access, no media bytes.';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    type text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    recipient_id text,
    notification_type text,
    severity text,
    related_entity_type text,
    related_entity_id text,
    action_url text,
    event_key text,
    read_at timestamp with time zone
);


--
-- Name: COLUMN notifications.recipient_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.recipient_id IS 'Canonical business_users recipient. Legacy user_id remains unchanged for compatibility.';


--
-- Name: COLUMN notifications.notification_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.notification_type IS 'Canonical application notification type. Legacy type remains unchanged for compatibility.';


--
-- Name: COLUMN notifications.event_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.event_key IS 'Deterministic business-transition recipient deduplication key.';


--
-- Name: COLUMN notifications.read_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.read_at IS 'Canonical persistent read timestamp. Legacy read remains for compatibility.';


--
-- Name: operational_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_files (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    scope_key text NOT NULL,
    category text NOT NULL,
    brand_id text NOT NULL,
    platform_id text NOT NULL,
    shift_id text,
    campaign_id text,
    period_date date NOT NULL,
    execution_source text NOT NULL,
    provider text NOT NULL,
    external_file_id text NOT NULL,
    external_parent_id text NOT NULL,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    folder_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 text,
    integrity_status text DEFAULT 'sha256_verified'::text NOT NULL,
    artifact_key text NOT NULL,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT operational_files_category_check CHECK ((category = ANY (ARRAY['schedule_source'::text, 'schedule_export'::text, 'live_snapshot'::text, 'video_recording'::text, 'video_livecut'::text, 'production_asset'::text, 'content_script'::text, 'content_brief'::text, 'campaign_document'::text, 'staffing_document'::text, 'acceptance_document'::text, 'payment_document'::text, 'ai_output'::text, 'system_export'::text, 'sop_document'::text]))),
    CONSTRAINT operational_files_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT operational_files_execution_source_check CHECK ((execution_source = ANY (ARRAY['internal'::text, 'agency'::text]))),
    CONSTRAINT operational_files_integrity_contract CHECK ((((integrity_status = 'sha256_verified'::text) AND (checksum_sha256 IS NOT NULL) AND (size_bytes > 0)) OR ((integrity_status = 'provider_reference'::text) AND (checksum_sha256 IS NULL)))),
    CONSTRAINT operational_files_integrity_status_check CHECK ((integrity_status = ANY (ARRAY['sha256_verified'::text, 'provider_reference'::text]))),
    CONSTRAINT operational_files_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]))),
    CONSTRAINT operational_files_scope_key_check CHECK ((length(btrim(scope_key)) > 0)),
    CONSTRAINT operational_files_size_bytes_check CHECK ((size_bytes >= 0))
);


--
-- Name: TABLE operational_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_files IS 'Metadata-only index of external operational files. No binary or base64 data.';


--
-- Name: operational_schedule_source_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_schedule_source_files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id text NOT NULL,
    provider text DEFAULT 'google_drive'::text NOT NULL,
    external_file_id text,
    external_parent_id text,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    folder_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    reconciliation_status text DEFAULT 'pending'::text NOT NULL,
    uploaded_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT operational_schedule_source_files_batch_id_check CHECK ((batch_id ~ '^[A-Za-z0-9_-]{1,120}$'::text)),
    CONSTRAINT operational_schedule_source_files_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[a-f0-9]{64}$'::text)),
    CONSTRAINT operational_schedule_source_files_file_name_check CHECK ((btrim(file_name) <> ''::text)),
    CONSTRAINT operational_schedule_source_files_folder_path_check CHECK ((btrim(folder_path) <> ''::text)),
    CONSTRAINT operational_schedule_source_files_provider_check CHECK ((provider = 'google_drive'::text)),
    CONSTRAINT operational_schedule_source_files_provider_reference_check CHECK ((((external_file_id IS NULL) AND (external_parent_id IS NULL)) OR ((NULLIF(btrim(external_file_id), ''::text) IS NOT NULL) AND (NULLIF(btrim(external_parent_id), ''::text) IS NOT NULL)))),
    CONSTRAINT operational_schedule_source_files_reconciliation_status_check CHECK ((reconciliation_status = ANY (ARRAY['pending'::text, 'provider_verified'::text, 'failed_cleaned'::text, 'reconciliation_required'::text]))),
    CONSTRAINT operational_schedule_source_files_size_bytes_check CHECK ((size_bytes > 0)),
    CONSTRAINT operational_schedule_source_files_uploaded_by_check CHECK ((btrim(uploaded_by) <> ''::text)),
    CONSTRAINT operational_schedule_source_files_verified_reference_check CHECK (((reconciliation_status <> 'provider_verified'::text) OR ((NULLIF(btrim(external_file_id), ''::text) IS NOT NULL) AND (NULLIF(btrim(external_parent_id), ''::text) IS NOT NULL))))
);


--
-- Name: TABLE operational_schedule_source_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_schedule_source_files IS 'Metadata-only receipt for original schedule files, independent of any shift or execution_source.';


--
-- Name: operational_storage_domain_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_storage_domain_folders (
    folder_path text NOT NULL,
    folder_id text NOT NULL,
    parent_folder_id text NOT NULL,
    access_classification text NOT NULL,
    active boolean DEFAULT false NOT NULL,
    verified_created boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT operational_storage_domain_folders_access_classification_check CHECK ((access_classification = ANY (ARRAY['shared'::text, 'pending_restriction_no_sensitive_upload'::text, 'shared_schema_template_only'::text, 'restricted_pending_app_acl_verification'::text, 'restricted_verified'::text]))),
    CONSTRAINT operational_storage_domain_folders_folder_id_check CHECK ((btrim(folder_id) <> ''::text)),
    CONSTRAINT operational_storage_domain_folders_folder_path_check CHECK ((btrim(folder_path) <> ''::text)),
    CONSTRAINT operational_storage_domain_folders_parent_folder_id_check CHECK ((btrim(parent_folder_id) <> ''::text))
);


--
-- Name: TABLE operational_storage_domain_folders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_storage_domain_folders IS 'Metadata-only allowlist for exact verified ADA Ops Drive folders. Sensitive routes require restricted_verified classification.';


--
-- Name: operational_storage_drive_probe_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_storage_drive_probe_rate_limits (
    actor_auth_user_id text NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    request_count integer NOT NULL,
    CONSTRAINT operational_storage_drive_probe_rate_l_actor_auth_user_id_check CHECK ((btrim(actor_auth_user_id) <> ''::text)),
    CONSTRAINT operational_storage_drive_probe_rate_limits_request_count_check CHECK ((request_count > 0))
);


--
-- Name: operational_storage_drive_probe_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_storage_drive_probe_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_auth_user_id text NOT NULL,
    actor_business_user_id text,
    actor_role text NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'started'::text NOT NULL,
    folder_id text NOT NULL,
    expected_parent_id text NOT NULL,
    provider_file_id text,
    provider_parent_id text,
    checksum_sha256 text,
    folder_can_add_children boolean,
    readback_verified boolean DEFAULT false NOT NULL,
    cleanup_status text DEFAULT 'not_started'::text NOT NULL,
    error_code text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT operational_storage_drive_probe_parent_check CHECK (((provider_parent_id IS NULL) OR (btrim(provider_parent_id) <> ''::text))),
    CONSTRAINT operational_storage_drive_probe_runs_actor_auth_user_id_check CHECK ((btrim(actor_auth_user_id) <> ''::text)),
    CONSTRAINT operational_storage_drive_probe_runs_actor_role_check CHECK ((actor_role = 'admin'::text)),
    CONSTRAINT operational_storage_drive_probe_runs_checksum_sha256_check CHECK (((checksum_sha256 IS NULL) OR (checksum_sha256 ~ '^[a-f0-9]{64}$'::text))),
    CONSTRAINT operational_storage_drive_probe_runs_cleanup_status_check CHECK ((cleanup_status = ANY (ARRAY['not_started'::text, 'not_applicable'::text, 'trashed'::text, 'pending_reconciliation'::text, 'failed'::text]))),
    CONSTRAINT operational_storage_drive_probe_runs_expected_parent_id_check CHECK ((expected_parent_id = '177g-GBHRY06rHx9ID8rpQOqR-uve9-kj'::text)),
    CONSTRAINT operational_storage_drive_probe_runs_folder_id_check CHECK ((folder_id = '1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P'::text)),
    CONSTRAINT operational_storage_drive_probe_runs_mode_check CHECK ((mode = ANY (ARRAY['metadata'::text, 'upload_readback'::text]))),
    CONSTRAINT operational_storage_drive_probe_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'passed'::text, 'failed'::text])))
);


--
-- Name: TABLE operational_storage_drive_probe_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_storage_drive_probe_runs IS 'Admin-only controlled synthetic Drive probe audit; stores identifiers and checksums, never file bytes or credentials.';


--
-- Name: operational_storage_folder_locks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_storage_folder_locks (
    lock_key text NOT NULL,
    lock_owner uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    CONSTRAINT operational_storage_folder_locks_lock_key_check CHECK ((lock_key ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: operational_storage_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operational_storage_routes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    provider text NOT NULL,
    execution_source text NOT NULL,
    brand_id text NOT NULL,
    platform_id text,
    subbrand_key text,
    storage_profile text NOT NULL,
    root_folder_id text NOT NULL,
    base_folder_id text NOT NULL,
    folder_labels jsonb DEFAULT '{}'::jsonb NOT NULL,
    period_naming_style text NOT NULL,
    period_label_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    period_date_ranges jsonb DEFAULT '[]'::jsonb NOT NULL,
    folder_label_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    approved_by text,
    approved_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT operational_storage_routes_base_folder_id_check CHECK ((btrim(base_folder_id) <> ''::text)),
    CONSTRAINT operational_storage_routes_execution_source_check CHECK ((execution_source = ANY (ARRAY['internal'::text, 'agency'::text]))),
    CONSTRAINT operational_storage_routes_folder_label_overrides_check CHECK ((jsonb_typeof(folder_label_overrides) = 'object'::text)),
    CONSTRAINT operational_storage_routes_folder_labels_check CHECK ((jsonb_typeof(folder_labels) = 'object'::text)),
    CONSTRAINT operational_storage_routes_period_date_ranges_check CHECK ((jsonb_typeof(period_date_ranges) = 'array'::text)),
    CONSTRAINT operational_storage_routes_period_label_overrides_check CHECK ((jsonb_typeof(period_label_overrides) = 'object'::text)),
    CONSTRAINT operational_storage_routes_period_naming_style_check CHECK ((btrim(period_naming_style) <> ''::text)),
    CONSTRAINT operational_storage_routes_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]))),
    CONSTRAINT operational_storage_routes_root_folder_id_check CHECK ((btrim(root_folder_id) <> ''::text)),
    CONSTRAINT operational_storage_routes_storage_profile_check CHECK ((storage_profile = ANY (ARRAY['LEGACY_CATEGORY_PERIOD'::text, 'LEGACY_PLATFORM_CATEGORY_PERIOD'::text, 'LEGACY_PERIOD_CATEGORY'::text, 'LEGACY_SUBBRAND_PERIOD_CATEGORY'::text, 'LEGACY_SUBBRAND_CATEGORY_PERIOD'::text, 'CANONICAL_V1'::text, 'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'::text]))),
    CONSTRAINT operational_storage_routes_subbrand_key_check CHECK (((subbrand_key IS NULL) OR (btrim(subbrand_key) <> ''::text))),
    CONSTRAINT operational_storage_routes_subbrand_profile_check CHECK (((storage_profile = ANY (ARRAY['LEGACY_SUBBRAND_PERIOD_CATEGORY'::text, 'LEGACY_SUBBRAND_CATEGORY_PERIOD'::text])) = (subbrand_key IS NOT NULL)))
);


--
-- Name: TABLE operational_storage_routes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.operational_storage_routes IS 'Privileged provider routes. No default route seed. Route placement requires operator-approved exact keys.';


--
-- Name: platforms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platforms (
    id text NOT NULL,
    name text NOT NULL,
    icon text,
    logo_url text,
    platform_type text,
    platform_url text,
    status text DEFAULT 'active'::text NOT NULL,
    account_information text,
    policy_notes text,
    livestream_rules text[] DEFAULT '{}'::text[] NOT NULL,
    content_restrictions text[] DEFAULT '{}'::text[] NOT NULL,
    technical_requirements text[] DEFAULT '{}'::text[] NOT NULL,
    report_requirements text[] DEFAULT '{}'::text[] NOT NULL,
    external_links text[] DEFAULT '{}'::text[] NOT NULL,
    updated_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by text,
    archived_at timestamp with time zone,
    archived_by text,
    deletion_reason text,
    CONSTRAINT platforms_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT platforms_name_not_blank CHECK ((btrim(name) <> ''::text)),
    CONSTRAINT platforms_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text])))
);


--
-- Name: COLUMN platforms.account_information; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platforms.account_information IS 'Operational account description only. Credentials are prohibited.';


--
-- Name: rc19_leader_brand_scope_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rc19_leader_brand_scope_events (
    id bigint NOT NULL,
    scope_id bigint NOT NULL,
    leader_business_user_id text NOT NULL,
    brand_id text NOT NULL,
    scope_key text NOT NULL,
    event_type text NOT NULL,
    prior_status text,
    new_status text NOT NULL,
    version integer NOT NULL,
    actor_business_user_id text,
    reason text NOT NULL,
    occurred_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT rc19_leader_brand_scope_events_event_type_check CHECK ((event_type = ANY (ARRAY['grant'::text, 'update'::text, 'revoke'::text, 'automatic_revoke'::text]))),
    CONSTRAINT rc19_leader_brand_scope_events_new_status_check CHECK ((new_status = ANY (ARRAY['active'::text, 'revoked'::text]))),
    CONSTRAINT rc19_leader_brand_scope_events_prior_status_check CHECK (((prior_status IS NULL) OR (prior_status = ANY (ARRAY['active'::text, 'revoked'::text])))),
    CONSTRAINT rc19_leader_brand_scope_events_version_check CHECK ((version > 0))
);


--
-- Name: TABLE rc19_leader_brand_scope_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rc19_leader_brand_scope_events IS 'Append-only audit trail for Leader-to-Brand scope grants, updates, revocations and conflicts.';


--
-- Name: rc19_leader_brand_scope_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rc19_leader_brand_scope_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rc19_leader_brand_scope_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rc19_leader_brand_scopes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rc19_leader_brand_scopes ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.rc19_leader_brand_scopes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rc19_report_artifact_deletion_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rc19_report_artifact_deletion_events (
    id bigint NOT NULL,
    operation_id uuid NOT NULL,
    status text NOT NULL,
    fencing_version integer NOT NULL,
    actor_business_user_id text,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);


--
-- Name: rc19_report_artifact_deletion_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rc19_report_artifact_deletion_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rc19_report_artifact_deletion_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rc19_report_artifact_deletions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rc19_report_artifact_deletions (
    operation_id uuid DEFAULT gen_random_uuid() NOT NULL,
    stored_file_id text NOT NULL,
    report_id text NOT NULL,
    provider text NOT NULL,
    external_file_id text NOT NULL,
    external_parent_id text,
    requested_by text NOT NULL,
    lease_actor text NOT NULL,
    status text NOT NULL,
    fencing_version integer DEFAULT 1 NOT NULL,
    lease_owner uuid NOT NULL,
    lease_expires_at timestamp with time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    last_error_code text,
    created_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT rc19_report_artifact_deletions_attempt_count_check CHECK ((attempt_count >= 0)),
    CONSTRAINT rc19_report_artifact_deletions_check CHECK (((external_parent_id IS NOT NULL) OR (status = 'manual_review'::text))),
    CONSTRAINT rc19_report_artifact_deletions_external_file_id_check CHECK ((btrim(external_file_id) <> ''::text)),
    CONSTRAINT rc19_report_artifact_deletions_external_parent_id_check CHECK (((external_parent_id IS NULL) OR (btrim(external_parent_id) <> ''::text))),
    CONSTRAINT rc19_report_artifact_deletions_fencing_version_check CHECK ((fencing_version > 0)),
    CONSTRAINT rc19_report_artifact_deletions_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]))),
    CONSTRAINT rc19_report_artifact_deletions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'provider_deleting'::text, 'provider_deleted'::text, 'completed'::text, 'retryable_failure'::text, 'manual_review'::text])))
);


--
-- Name: rc19_report_export_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rc19_report_export_audit (
    id bigint NOT NULL,
    actor_business_user_id text NOT NULL,
    report_count integer NOT NULL,
    export_kind text NOT NULL,
    occurred_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
    CONSTRAINT rc19_report_export_audit_export_kind_check CHECK ((export_kind = ANY (ARRAY['reports'::text, 'report'::text, 'images'::text]))),
    CONSTRAINT rc19_report_export_audit_report_count_check CHECK (((report_count >= 1) AND (report_count <= 500)))
);


--
-- Name: rc19_report_export_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rc19_report_export_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rc19_report_export_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: report_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_revisions (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    report_id text NOT NULL,
    version integer NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    status text NOT NULL,
    reason text,
    event text NOT NULL,
    metrics jsonb,
    ocr_review jsonb,
    final_recap jsonb,
    image_references text[],
    CONSTRAINT report_revisions_event_check CHECK ((event = ANY (ARRAY['create'::text, 'save'::text, 'ocr_run'::text, 'ocr_rerun'::text, 'confirm'::text, 'reopen'::text, 'upload_image'::text, 'remove_image'::text, 'archive'::text]))),
    CONSTRAINT report_revisions_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT report_revisions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'confirmed'::text, 'reopened'::text, 'archived'::text])))
);


--
-- Name: TABLE report_revisions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report_revisions IS 'P3 audit revision history for reports.';


--
-- Name: schedule_import_batch_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_import_batch_rows (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    batch_id text NOT NULL,
    row_number integer NOT NULL,
    outcome text DEFAULT 'pending'::text NOT NULL,
    shift_id text,
    source_row jsonb NOT NULL,
    failure_code text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT schedule_import_batch_rows_failure_code_check CHECK ((((outcome = 'retryable'::text) AND (failure_code IS NOT NULL)) OR ((outcome <> 'retryable'::text) AND (failure_code IS NULL)))),
    CONSTRAINT schedule_import_batch_rows_failure_code_length_check CHECK (((failure_code IS NULL) OR (length(failure_code) <= 200))),
    CONSTRAINT schedule_import_batch_rows_id_not_blank CHECK ((btrim(id) <> ''::text)),
    CONSTRAINT schedule_import_batch_rows_outcome_check CHECK ((outcome = ANY (ARRAY['pending'::text, 'imported'::text, 'validation_failed'::text, 'duplicate_skipped'::text, 'warning'::text, 'retryable'::text]))),
    CONSTRAINT schedule_import_batch_rows_row_number_check CHECK ((row_number >= 1)),
    CONSTRAINT schedule_import_batch_rows_shift_link_check CHECK ((((outcome = ANY (ARRAY['imported'::text, 'warning'::text])) AND (shift_id IS NOT NULL)) OR ((outcome <> ALL (ARRAY['imported'::text, 'warning'::text])) AND (shift_id IS NULL))))
);


--
-- Name: TABLE schedule_import_batch_rows; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.schedule_import_batch_rows IS 'Per-source-row import outcomes. Pending during preview; finalized at confirm.';


--
-- Name: COLUMN schedule_import_batch_rows.shift_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedule_import_batch_rows.shift_id IS 'Resulting shift for imported/warning rows; future rollback and restore anchor.';


--
-- Name: COLUMN schedule_import_batch_rows.source_row; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.schedule_import_batch_rows.source_row IS 'Canonical preview row snapshot kept for retry and duplicate reconciliation.';


--
-- Name: self_attendance_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.self_attendance_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    shift_id text NOT NULL,
    staff_id text NOT NULL,
    operational_role text NOT NULL,
    event_kind text NOT NULL,
    recorded_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    verification_status text DEFAULT 'pending_verification'::text NOT NULL,
    evidence_note text,
    CONSTRAINT self_attendance_events_event_kind_check CHECK ((event_kind = ANY (ARRAY['check_in'::text, 'check_out'::text]))),
    CONSTRAINT self_attendance_events_evidence_note_check CHECK ((char_length(evidence_note) <= 2000)),
    CONSTRAINT self_attendance_events_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT self_attendance_events_verification_status_check CHECK ((verification_status = 'pending_verification'::text))
);


--
-- Name: self_attendance_photo_evidence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.self_attendance_photo_evidence (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    shift_id text NOT NULL,
    staff_id text NOT NULL,
    operational_role text NOT NULL,
    provider text DEFAULT 'google_drive'::text NOT NULL,
    external_file_id text NOT NULL,
    external_parent_id text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    checksum_sha256 text NOT NULL,
    shift_context jsonb NOT NULL,
    capture_source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    event_kind text DEFAULT 'check_in'::text NOT NULL,
    CONSTRAINT self_attendance_photo_evidence_capture_source_check CHECK ((capture_source = ANY (ARRAY['camera'::text, 'file_picker'::text]))),
    CONSTRAINT self_attendance_photo_evidence_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT self_attendance_photo_evidence_event_kind_check CHECK ((event_kind = ANY (ARRAY['check_in'::text, 'check_out'::text]))),
    CONSTRAINT self_attendance_photo_evidence_external_file_id_check CHECK (((char_length(external_file_id) >= 8) AND (char_length(external_file_id) <= 512))),
    CONSTRAINT self_attendance_photo_evidence_external_parent_id_check CHECK (((char_length(external_parent_id) >= 8) AND (char_length(external_parent_id) <= 512))),
    CONSTRAINT self_attendance_photo_evidence_file_name_check CHECK (((char_length(file_name) >= 16) AND (char_length(file_name) <= 255))),
    CONSTRAINT self_attendance_photo_evidence_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text]))),
    CONSTRAINT self_attendance_photo_evidence_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT self_attendance_photo_evidence_provider_check CHECK ((provider = 'google_drive'::text)),
    CONSTRAINT self_attendance_photo_evidence_shift_context_check CHECK ((jsonb_typeof(shift_context) = 'object'::text)),
    CONSTRAINT self_attendance_photo_evidence_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 4194304)))
);


--
-- Name: storage_resource_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_resource_audit_events (
    id bigint NOT NULL,
    resource_id text NOT NULL,
    action text NOT NULL,
    actor_id text,
    before_data jsonb,
    after_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_resource_audit_events_action_check CHECK ((action = ANY (ARRAY['resource_insert'::text, 'resource_update'::text, 'resource_delete'::text, 'scope_insert'::text, 'scope_update'::text, 'scope_delete'::text, 'grant_insert'::text, 'grant_update'::text, 'grant_delete'::text, 'edit_grant_insert'::text, 'edit_grant_update'::text, 'edit_grant_delete'::text])))
);


--
-- Name: storage_resource_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.storage_resource_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.storage_resource_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: storage_resource_edit_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_resource_edit_grants (
    resource_id text NOT NULL,
    user_id text NOT NULL,
    decision text NOT NULL,
    granted_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT storage_resource_edit_grants_decision_check CHECK ((decision = ANY (ARRAY['allow'::text, 'deny'::text])))
);


--
-- Name: TABLE storage_resource_edit_grants; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.storage_resource_edit_grants IS 'Account-level in-app edit decisions for one resource; does not change external Drive ACLs or public viewing.';


--
-- Name: storage_resource_scopes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_resource_scopes (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    resource_id text NOT NULL,
    brand_id text,
    campaign_id text,
    platform_id text,
    shift_id text,
    staff_id text,
    client_group_key text,
    sku_key text,
    year integer,
    month integer,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT storage_resource_scopes_month_check CHECK (((month IS NULL) OR ((month >= 1) AND (month <= 12)))),
    CONSTRAINT storage_resource_scopes_month_needs_year CHECK (((month IS NULL) OR (year IS NOT NULL))),
    CONSTRAINT storage_resource_scopes_year_check CHECK (((year IS NULL) OR ((year >= 2000) AND (year <= 2200))))
);


--
-- Name: TABLE storage_resource_scopes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.storage_resource_scopes IS 'Descriptive resource associations only; these links do not grant registry or provider access.';


--
-- Name: storage_resource_user_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.storage_resource_user_grants (
    resource_id text NOT NULL,
    user_id text NOT NULL,
    granted_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: stored_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stored_files (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    provider text NOT NULL,
    external_file_id text NOT NULL,
    external_parent_id text,
    provider_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    logical_category text NOT NULL,
    folder_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    checksum_sha256 text NOT NULL,
    artifact_key text NOT NULL,
    report_id text NOT NULL,
    shift_id text NOT NULL,
    report_version integer,
    uploaded_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT stored_files_checksum_sha256_check CHECK ((checksum_sha256 ~ '^[A-Fa-f0-9]{64}$'::text)),
    CONSTRAINT stored_files_logical_category_check CHECK ((logical_category = ANY (ARRAY['data_report'::text, 'data_source'::text]))),
    CONSTRAINT stored_files_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'onedrive'::text]))),
    CONSTRAINT stored_files_size_bytes_check CHECK ((size_bytes > 0))
);


--
-- Name: TABLE stored_files; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stored_files IS 'Metadata-only index for externally stored report data artifacts. Binary content must remain in the configured file provider.';


--
-- Name: workforce_actual_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_actual_segments (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    shift_id text NOT NULL,
    staff_id text NOT NULL,
    operational_role text NOT NULL,
    event_kind text NOT NULL,
    coverage_kind text DEFAULT 'planned'::text NOT NULL,
    actual_start_at timestamp with time zone,
    actual_end_at timestamp with time zone,
    review_status text DEFAULT 'draft'::text NOT NULL,
    evidence_note text NOT NULL,
    review_note text,
    created_by text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT actual_event_time_consistency CHECK ((((event_kind = 'no_show'::text) AND (actual_start_at IS NULL) AND (actual_end_at IS NULL)) OR ((event_kind = 'worked'::text) AND (actual_start_at IS NOT NULL) AND (actual_end_at IS NOT NULL) AND (actual_end_at > actual_start_at) AND (actual_end_at <= (actual_start_at + '24:00:00'::interval))))),
    CONSTRAINT reviewed_actor_consistency CHECK ((((review_status = 'draft'::text) AND (reviewed_at IS NULL) AND (reviewed_by IS NULL) AND (review_note IS NULL)) OR ((review_status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (reviewed_by IS NOT NULL) AND (reviewed_at IS NOT NULL) AND (reviewed_by <> created_by) AND (review_note IS NOT NULL)))),
    CONSTRAINT workforce_actual_segments_coverage_kind_check CHECK ((coverage_kind = ANY (ARRAY['planned'::text, 'cover'::text, 'replacement'::text, 'extra'::text]))),
    CONSTRAINT workforce_actual_segments_event_kind_check CHECK ((event_kind = ANY (ARRAY['worked'::text, 'no_show'::text]))),
    CONSTRAINT workforce_actual_segments_evidence_note_check CHECK (((char_length(TRIM(BOTH FROM evidence_note)) >= 8) AND (char_length(TRIM(BOTH FROM evidence_note)) <= 2000))),
    CONSTRAINT workforce_actual_segments_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT workforce_actual_segments_review_note_check CHECK (((review_note IS NULL) OR ((char_length(TRIM(BOTH FROM review_note)) >= 8) AND (char_length(TRIM(BOTH FROM review_note)) <= 2000)))),
    CONSTRAINT workforce_actual_segments_review_status_check CHECK ((review_status = ANY (ARRAY['draft'::text, 'approved'::text, 'rejected'::text]))),
    CONSTRAINT workforce_actual_segments_version_check CHECK ((version >= 1))
);


--
-- Name: workforce_attendance_import_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_attendance_import_batches (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    source_type text NOT NULL,
    source_name text NOT NULL,
    source_fingerprint text NOT NULL,
    brand_id text,
    timezone text DEFAULT 'Asia/Ho_Chi_Minh'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    matched_rows integer DEFAULT 0 NOT NULL,
    exception_rows integer DEFAULT 0 NOT NULL,
    drafted_segments integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT workforce_attendance_import_batches_drafted_segments_check CHECK ((drafted_segments >= 0)),
    CONSTRAINT workforce_attendance_import_batches_exception_rows_check CHECK ((exception_rows >= 0)),
    CONSTRAINT workforce_attendance_import_batches_matched_rows_check CHECK ((matched_rows >= 0)),
    CONSTRAINT workforce_attendance_import_batches_source_type_check CHECK ((source_type = ANY (ARRAY['google_sheets'::text, 'excel_upload'::text, 'csv_upload'::text, 'shift_manager_control'::text]))),
    CONSTRAINT workforce_attendance_import_batches_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'staged'::text, 'confirmed'::text, 'failed'::text, 'cancelled'::text]))),
    CONSTRAINT workforce_attendance_import_batches_total_rows_check CHECK ((total_rows >= 0)),
    CONSTRAINT workforce_attendance_import_batches_version_check CHECK ((version >= 1))
);


--
-- Name: workforce_attendance_import_rows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_attendance_import_rows (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    batch_id text NOT NULL,
    source_row_number integer NOT NULL,
    raw_payload jsonb NOT NULL,
    parsed_date date,
    parsed_start_time text,
    parsed_end_time text,
    parsed_start_at timestamp with time zone,
    parsed_end_at timestamp with time zone,
    raw_staff_name text,
    raw_role text,
    raw_notes text,
    matched_shift_id text,
    matched_staff_id text,
    operational_role text,
    coverage_kind text DEFAULT 'planned'::text NOT NULL,
    evidence_kind text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    exception_code text,
    exception_detail text,
    resulting_segment_id text,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT workforce_attendance_import_rows_coverage_kind_check CHECK ((coverage_kind = ANY (ARRAY['planned'::text, 'cover'::text, 'replacement'::text, 'extra'::text]))),
    CONSTRAINT workforce_attendance_import_rows_evidence_kind_check CHECK ((evidence_kind = ANY (ARRAY['actual_punch'::text, 'supervisor_verified'::text, 'missing_evidence'::text]))),
    CONSTRAINT workforce_attendance_import_rows_exception_code_check CHECK ((exception_code = ANY (ARRAY['SHIFT_NOT_FOUND'::text, 'STAFF_NOT_FOUND'::text, 'ROLE_AMBIGUOUS'::text, 'MISSING_EVIDENCE'::text, 'SHIFT_NOT_COMPLETED'::text, 'TIME_RANGE_INVALID'::text, 'OVERLAP_CONFLICT'::text, 'UNRESOLVED_PASS'::text, 'AMBIGUOUS_DATE_ORDER'::text, 'WEEKDAY_MISMATCH'::text, 'INVALID_CONTROL_STRUCTURE'::text]))),
    CONSTRAINT workforce_attendance_import_rows_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT workforce_attendance_import_rows_source_row_number_check CHECK ((source_row_number > 0)),
    CONSTRAINT workforce_attendance_import_rows_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'matched'::text, 'exception'::text, 'drafted'::text, 'rejected'::text])))
);


--
-- Name: workforce_payroll_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_payroll_audit (
    id bigint NOT NULL,
    period_id text,
    action text NOT NULL,
    from_status text,
    to_status text,
    actor_id text NOT NULL,
    reason text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    line_id text,
    line_version integer,
    request_id uuid,
    request_payload jsonb,
    previous_values jsonb,
    updated_values jsonb,
    rate_card_id text,
    CONSTRAINT workforce_line_audit_fields CHECK (((action <> ALL (ARRAY['correct_line'::text, 'void_line'::text, 'recalculate_line'::text])) OR ((line_id IS NOT NULL) AND (line_version IS NOT NULL) AND (line_version >= 2) AND (request_id IS NOT NULL) AND (request_payload IS NOT NULL) AND (previous_values IS NOT NULL) AND (updated_values IS NOT NULL)))),
    CONSTRAINT workforce_payroll_audit_action_check CHECK ((action = ANY (ARRAY['review'::text, 'confirm'::text, 'mark_ready'::text, 'lock'::text, 'reopen'::text, 'adjustment'::text, 'correct_line'::text, 'void_line'::text, 'supersede_rate_card'::text, 'recalculate_line'::text, 'recalculate_batch'::text, 'auto_calculate_batch'::text]))),
    CONSTRAINT workforce_payroll_audit_reason_check CHECK (((char_length(TRIM(BOTH FROM reason)) >= 8) AND (char_length(TRIM(BOTH FROM reason)) <= 2000)))
);


--
-- Name: workforce_payroll_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.workforce_payroll_audit ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.workforce_payroll_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workforce_payroll_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_payroll_lines (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    period_id text NOT NULL,
    segment_id text NOT NULL,
    rate_card_id text NOT NULL,
    staff_id text NOT NULL,
    operational_role text NOT NULL,
    actual_minutes integer NOT NULL,
    payable_minutes integer NOT NULL,
    overtime_minutes integer NOT NULL,
    rate_vnd_per_hour integer NOT NULL,
    overtime_multiplier_basis_points integer NOT NULL,
    gross_vnd bigint NOT NULL,
    adjustment_vnd bigint DEFAULT 0 NOT NULL,
    net_vnd bigint GENERATED ALWAYS AS ((gross_vnd + adjustment_vnd)) STORED,
    adjustment_reason text,
    calculation_version text DEFAULT 'rc16-v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    voided_at timestamp with time zone,
    CONSTRAINT workforce_adjustment_reason CHECK ((((adjustment_vnd = 0) AND (adjustment_reason IS NULL)) OR ((adjustment_vnd <> 0) AND ((char_length(TRIM(BOTH FROM COALESCE(adjustment_reason, ''::text))) >= 8) AND (char_length(TRIM(BOTH FROM COALESCE(adjustment_reason, ''::text))) <= 1000))))),
    CONSTRAINT workforce_payroll_lines_actual_minutes_check CHECK (((actual_minutes >= 0) AND (actual_minutes <= 1440))),
    CONSTRAINT workforce_payroll_lines_check CHECK (((overtime_minutes >= 0) AND (overtime_minutes <= payable_minutes))),
    CONSTRAINT workforce_payroll_lines_gross_vnd_check CHECK ((gross_vnd >= 0)),
    CONSTRAINT workforce_payroll_lines_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT workforce_payroll_lines_overtime_multiplier_basis_points_check CHECK (((overtime_multiplier_basis_points >= 10000) AND (overtime_multiplier_basis_points <= 50000))),
    CONSTRAINT workforce_payroll_lines_payable_minutes_check CHECK (((payable_minutes >= 0) AND (payable_minutes <= 1440))),
    CONSTRAINT workforce_payroll_lines_rate_vnd_per_hour_check CHECK ((rate_vnd_per_hour >= 0)),
    CONSTRAINT workforce_payroll_lines_version_check CHECK ((version >= 1)),
    CONSTRAINT workforce_payroll_money_bounds CHECK (((adjustment_vnd >= '-1000000000000'::bigint) AND (adjustment_vnd <= '1000000000000'::bigint) AND (net_vnd <= '1000000000000'::bigint))),
    CONSTRAINT workforce_payroll_nonnegative CHECK (((gross_vnd + adjustment_vnd) >= 0))
);


--
-- Name: workforce_rate_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_rate_cards (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    staff_id text,
    operational_role text NOT NULL,
    effective_from date NOT NULL,
    effective_through date,
    vnd_per_hour integer NOT NULL,
    overtime_multiplier_basis_points integer NOT NULL,
    approved_by text NOT NULL,
    approved_at timestamp with time zone NOT NULL,
    approval_note text NOT NULL,
    created_at timestamp with time zone DEFAULT statement_timestamp() NOT NULL,
    CONSTRAINT workforce_rate_cards_approval_note_check CHECK (((char_length(TRIM(BOTH FROM approval_note)) >= 8) AND (char_length(TRIM(BOTH FROM approval_note)) <= 1000))),
    CONSTRAINT workforce_rate_cards_operational_role_check CHECK ((operational_role = ANY (ARRAY['host'::text, 'support'::text, 'technical'::text]))),
    CONSTRAINT workforce_rate_cards_overtime_multiplier_basis_points_check CHECK (((overtime_multiplier_basis_points >= 10000) AND (overtime_multiplier_basis_points <= 50000))),
    CONSTRAINT workforce_rate_cards_vnd_per_hour_check CHECK (((vnd_per_hour >= 0) AND (vnd_per_hour <= 100000000))),
    CONSTRAINT workforce_rate_date_order CHECK (((effective_through IS NULL) OR (effective_through >= effective_from)))
);


--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    public boolean DEFAULT false NOT NULL,
    file_size_limit bigint,
    allowed_mime_types text[]
);


--
-- Name: objects; Type: TABLE; Schema: storage; Owner: -
--

CREATE TABLE storage.objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket_id text NOT NULL,
    name text NOT NULL,
    owner_id text,
    owner uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: supabase_migrations; Owner: -
--

CREATE TABLE supabase_migrations.schema_migrations (
    version text NOT NULL,
    statements text[],
    name text,
    created_by text,
    idempotency_key text,
    rollback text[]
);


--
-- Name: identities identities_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: job job_jobname_key; Type: CONSTRAINT; Schema: cron; Owner: -
--

ALTER TABLE ONLY cron.job
    ADD CONSTRAINT job_jobname_key UNIQUE (jobname);


--
-- Name: job job_pkey; Type: CONSTRAINT; Schema: cron; Owner: -
--

ALTER TABLE ONLY cron.job
    ADD CONSTRAINT job_pkey PRIMARY KEY (jobid);


--
-- Name: account_request_rate_limits account_request_rate_limits_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.account_request_rate_limits
    ADD CONSTRAINT account_request_rate_limits_pkey PRIMARY KEY (request_key);


--
-- Name: rbac01_role_default_events rbac01_role_default_events_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_events
    ADD CONSTRAINT rbac01_role_default_events_pkey PRIMARY KEY (id);


--
-- Name: rbac01_role_default_versions rbac01_role_default_versions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_versions
    ADD CONSTRAINT rbac01_role_default_versions_pkey PRIMARY KEY (id);


--
-- Name: rbac01_role_default_versions rbac01_role_default_versions_role_version_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_versions
    ADD CONSTRAINT rbac01_role_default_versions_role_version_key UNIQUE (role, version);


--
-- Name: rbac02_account_permission_versions rbac02_account_permission_ver_target_business_user_id_permi_key; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac02_account_permission_versions
    ADD CONSTRAINT rbac02_account_permission_ver_target_business_user_id_permi_key UNIQUE (target_business_user_id, permission, version);


--
-- Name: rbac02_account_permission_versions rbac02_account_permission_versions_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac02_account_permission_versions
    ADD CONSTRAINT rbac02_account_permission_versions_pkey PRIMARY KEY (id);


--
-- Name: rbac_permission_catalog rbac_permission_catalog_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac_permission_catalog
    ADD CONSTRAINT rbac_permission_catalog_pkey PRIMARY KEY (permission);


--
-- Name: rbac_runtime_gate rbac_runtime_gate_pkey; Type: CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac_runtime_gate
    ADD CONSTRAINT rbac_runtime_gate_pkey PRIMARY KEY (id);


--
-- Name: account_requests account_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_requests
    ADD CONSTRAINT account_requests_pkey PRIMARY KEY (id);


--
-- Name: workforce_attendance_import_rows attendance_import_row_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT attendance_import_row_unique UNIQUE (batch_id, source_row_number);


--
-- Name: attendance_photo_drive_folders attendance_photo_drive_folders_folder_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_photo_drive_folders
    ADD CONSTRAINT attendance_photo_drive_folders_folder_id_key UNIQUE (folder_id);


--
-- Name: attendance_photo_drive_folders attendance_photo_drive_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_photo_drive_folders
    ADD CONSTRAINT attendance_photo_drive_folders_pkey PRIMARY KEY (shift_id, event_kind, operational_role);


--
-- Name: audit_log_reviews audit_log_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_reviews
    ADD CONSTRAINT audit_log_reviews_pkey PRIMARY KEY (audit_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: brand01_campaign_product_skus brand01_campaign_product_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_product_skus
    ADD CONSTRAINT brand01_campaign_product_skus_pkey PRIMARY KEY (campaign_id, sku_id);


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_pkey PRIMARY KEY (id);


--
-- Name: brand01_catalog_audit_events brand01_catalog_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_catalog_audit_events
    ADD CONSTRAINT brand01_catalog_audit_events_pkey PRIMARY KEY (id);


--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_knowledge_version_id_reviewer_id__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_knowledge_reviews
    ADD CONSTRAINT brand01_knowledge_reviews_knowledge_version_id_reviewer_id__key UNIQUE (knowledge_version_id, reviewer_id, created_at);


--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_knowledge_reviews
    ADD CONSTRAINT brand01_knowledge_reviews_pkey PRIMARY KEY (id);


--
-- Name: brand01_product_brands brand01_product_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_brands
    ADD CONSTRAINT brand01_product_brands_pkey PRIMARY KEY (product_id, brand_id);


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_ver_product_id_sku_id_knowledge_t_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_ver_product_id_sku_id_knowledge_t_key UNIQUE (product_id, sku_id, knowledge_type, version);


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_pkey PRIMARY KEY (id);


--
-- Name: brand01_product_platform_skus brand01_product_platform_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_platform_skus
    ADD CONSTRAINT brand01_product_platform_skus_pkey PRIMARY KEY (sku_id, platform_id);


--
-- Name: brand01_product_resource_links brand01_product_resource_link_resource_id_product_id_sku_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_link_resource_id_product_id_sku_id_key UNIQUE NULLS NOT DISTINCT (resource_id, product_id, sku_id, campaign_id, relation_type);


--
-- Name: brand01_product_resource_links brand01_product_resource_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_pkey PRIMARY KEY (id);


--
-- Name: brand01_product_skus brand01_product_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_pkey PRIMARY KEY (id);


--
-- Name: brand01_product_skus brand01_product_skus_product_id_sku_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_product_id_sku_code_key UNIQUE (product_id, sku_code);


--
-- Name: brand01_products brand01_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_pkey PRIMARY KEY (id);


--
-- Name: brand01_products brand01_products_product_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_product_code_key UNIQUE (product_code);


--
-- Name: brand01_user_brand_access brand01_user_brand_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_user_brand_access
    ADD CONSTRAINT brand01_user_brand_access_pkey PRIMARY KEY (grant_id);


--
-- Name: brands brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_pkey PRIMARY KEY (id);


--
-- Name: business_users business_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: dashboard_updates dashboard_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_updates
    ADD CONSTRAINT dashboard_updates_pkey PRIMARY KEY (id);


--
-- Name: live_report_images live_report_images_dedupe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_report_images
    ADD CONSTRAINT live_report_images_dedupe_key UNIQUE (report_id, file_url);


--
-- Name: live_report_images live_report_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_report_images
    ADD CONSTRAINT live_report_images_pkey PRIMARY KEY (id);


--
-- Name: media_stream_routes media_stream_routes_active_shift_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_active_shift_id_key UNIQUE (active_shift_id);


--
-- Name: media_stream_routes media_stream_routes_brand_id_platform_id_studio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_brand_id_platform_id_studio_key UNIQUE (brand_id, platform_id, studio);


--
-- Name: media_stream_routes media_stream_routes_media_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_media_path_key UNIQUE (media_path);


--
-- Name: media_stream_routes media_stream_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_pkey PRIMARY KEY (id);


--
-- Name: media_viewer_grants media_viewer_grants_auth_user_id_shift_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_viewer_grants
    ADD CONSTRAINT media_viewer_grants_auth_user_id_shift_id_key UNIQUE (auth_user_id, shift_id);


--
-- Name: media_viewer_grants media_viewer_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_viewer_grants
    ADD CONSTRAINT media_viewer_grants_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operational_files operational_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_pkey PRIMARY KEY (id);


--
-- Name: operational_schedule_source_files operational_schedule_source_files_batch_checksum_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_schedule_source_files
    ADD CONSTRAINT operational_schedule_source_files_batch_checksum_key UNIQUE (batch_id, checksum_sha256);


--
-- Name: operational_schedule_source_files operational_schedule_source_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_schedule_source_files
    ADD CONSTRAINT operational_schedule_source_files_pkey PRIMARY KEY (id);


--
-- Name: operational_storage_domain_folders operational_storage_domain_folders_folder_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_domain_folders
    ADD CONSTRAINT operational_storage_domain_folders_folder_id_key UNIQUE (folder_id);


--
-- Name: operational_storage_domain_folders operational_storage_domain_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_domain_folders
    ADD CONSTRAINT operational_storage_domain_folders_pkey PRIMARY KEY (folder_path);


--
-- Name: operational_storage_drive_probe_rate_limits operational_storage_drive_probe_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_drive_probe_rate_limits
    ADD CONSTRAINT operational_storage_drive_probe_rate_limits_pkey PRIMARY KEY (actor_auth_user_id);


--
-- Name: operational_storage_drive_probe_runs operational_storage_drive_probe_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_drive_probe_runs
    ADD CONSTRAINT operational_storage_drive_probe_runs_pkey PRIMARY KEY (id);


--
-- Name: operational_storage_folder_locks operational_storage_folder_locks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_folder_locks
    ADD CONSTRAINT operational_storage_folder_locks_pkey PRIMARY KEY (lock_key);


--
-- Name: operational_storage_routes operational_storage_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_routes
    ADD CONSTRAINT operational_storage_routes_pkey PRIMARY KEY (id);


--
-- Name: platforms platforms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_pkey PRIMARY KEY (id);


--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scope_events
    ADD CONSTRAINT rc19_leader_brand_scope_events_pkey PRIMARY KEY (id);


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scope_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scope_identity_key UNIQUE (leader_business_user_id, brand_id, scope_key);


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scopes_pkey PRIMARY KEY (id);


--
-- Name: rc19_report_artifact_deletion_events rc19_report_artifact_deletion_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletion_events
    ADD CONSTRAINT rc19_report_artifact_deletion_events_pkey PRIMARY KEY (id);


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_pkey PRIMARY KEY (operation_id);


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_stored_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_stored_file_id_key UNIQUE (stored_file_id);


--
-- Name: rc19_report_export_audit rc19_report_export_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_export_audit
    ADD CONSTRAINT rc19_report_export_audit_pkey PRIMARY KEY (id);


--
-- Name: report_images report_images_dedupe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_images
    ADD CONSTRAINT report_images_dedupe_key UNIQUE (report_id, storage_path);


--
-- Name: report_images report_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_images
    ADD CONSTRAINT report_images_pkey PRIMARY KEY (id);


--
-- Name: report_revisions report_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_revisions
    ADD CONSTRAINT report_revisions_pkey PRIMARY KEY (id);


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);


--
-- Name: schedule_import_batch_rows schedule_import_batch_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batch_rows
    ADD CONSTRAINT schedule_import_batch_rows_pkey PRIMARY KEY (id);


--
-- Name: schedule_import_batches schedule_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batches
    ADD CONSTRAINT schedule_import_batches_pkey PRIMARY KEY (id);


--
-- Name: self_attendance_events self_attendance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_events
    ADD CONSTRAINT self_attendance_events_pkey PRIMARY KEY (id);


--
-- Name: self_attendance_events self_attendance_events_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_events
    ADD CONSTRAINT self_attendance_events_request_id_key UNIQUE (request_id);


--
-- Name: self_attendance_events self_attendance_events_shift_id_staff_id_operational_role_e_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_events
    ADD CONSTRAINT self_attendance_events_shift_id_staff_id_operational_role_e_key UNIQUE (shift_id, staff_id, operational_role, event_kind);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_external_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_external_file_id_key UNIQUE (external_file_id);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_pkey PRIMARY KEY (id);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_request_id_key UNIQUE (request_id);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_shift_staff_role_event_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_shift_staff_role_event_key UNIQUE (shift_id, staff_id, operational_role, event_kind);


--
-- Name: shift_operational_notes shift_operational_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_operational_notes
    ADD CONSTRAINT shift_operational_notes_pkey PRIMARY KEY (id);


--
-- Name: shift_registrations shift_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_registrations
    ADD CONSTRAINT shift_registrations_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_timezone_check; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.shifts
    ADD CONSTRAINT shifts_timezone_check CHECK ((btrim(timezone) <> ''::text)) NOT VALID;


--
-- Name: storage_resource_audit_events storage_resource_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_audit_events
    ADD CONSTRAINT storage_resource_audit_events_pkey PRIMARY KEY (id);


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_edit_grants
    ADD CONSTRAINT storage_resource_edit_grants_pkey PRIMARY KEY (resource_id, user_id);


--
-- Name: storage_resource_scopes storage_resource_scopes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_pkey PRIMARY KEY (id);


--
-- Name: storage_resource_scopes storage_resource_scopes_resource_id_brand_id_campaign_id_pl_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_resource_id_brand_id_campaign_id_pl_key UNIQUE NULLS NOT DISTINCT (resource_id, brand_id, campaign_id, platform_id, shift_id, staff_id, client_group_key, sku_key, year, month);


--
-- Name: storage_resource_user_grants storage_resource_user_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_user_grants
    ADD CONSTRAINT storage_resource_user_grants_pkey PRIMARY KEY (resource_id, user_id);


--
-- Name: storage_resources storage_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_pkey PRIMARY KEY (id);


--
-- Name: storage_resources storage_resources_provider_canonical_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_provider_canonical_id_key UNIQUE (provider, canonical_id);


--
-- Name: storage_resources storage_resources_provider_canonical_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_provider_canonical_url_key UNIQUE (provider, canonical_url);


--
-- Name: stored_files stored_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stored_files
    ADD CONSTRAINT stored_files_pkey PRIMARY KEY (id);


--
-- Name: swap_requests swap_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: workforce_actual_segments workforce_actual_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_actual_segments
    ADD CONSTRAINT workforce_actual_segments_pkey PRIMARY KEY (id);


--
-- Name: workforce_attendance_import_batches workforce_attendance_import_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_batches
    ADD CONSTRAINT workforce_attendance_import_batches_pkey PRIMARY KEY (id);


--
-- Name: workforce_attendance_import_rows workforce_attendance_import_rows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT workforce_attendance_import_rows_pkey PRIMARY KEY (id);


--
-- Name: workforce_payroll_audit workforce_payroll_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_audit
    ADD CONSTRAINT workforce_payroll_audit_pkey PRIMARY KEY (id);


--
-- Name: workforce_payroll_lines workforce_payroll_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_lines_pkey PRIMARY KEY (id);


--
-- Name: workforce_payroll_lines workforce_payroll_one_line_per_segment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_one_line_per_segment UNIQUE (period_id, segment_id);


--
-- Name: workforce_payroll_periods workforce_payroll_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_payroll_periods_pkey PRIMARY KEY (id);


--
-- Name: workforce_payroll_periods workforce_period_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_period_unique UNIQUE (period_start, period_end, revision);


--
-- Name: workforce_rate_cards workforce_rate_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_rate_cards
    ADD CONSTRAINT workforce_rate_cards_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: objects objects_bucket_id_name_key; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_bucket_id_name_key UNIQUE (bucket_id, name);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: supabase_migrations; Owner: -
--

ALTER TABLE ONLY supabase_migrations.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: account_requests_normalized_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_requests_normalized_email_idx ON public.account_requests USING btree (lower(btrim(email)));


--
-- Name: account_requests_pending_email_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_requests_pending_email_uidx ON public.account_requests USING btree (lower(btrim(email))) WHERE (status = 'pending'::text);


--
-- Name: account_requests_status_submitted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_requests_status_submitted_at_idx ON public.account_requests USING btree (status, submitted_at DESC);


--
-- Name: attendance_photo_drive_folders_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX attendance_photo_drive_folders_shift_idx ON public.attendance_photo_drive_folders USING btree (shift_id);


--
-- Name: audit_log_reviews_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_reviews_updated_at_idx ON public.audit_log_reviews USING btree (updated_at DESC);


--
-- Name: audit_logs_actor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_actor_idx ON public.audit_logs USING btree (actor_business_user_id, created_at DESC);


--
-- Name: audit_logs_correlation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_correlation_idx ON public.audit_logs USING btree (correlation_id);


--
-- Name: audit_logs_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);


--
-- Name: audit_logs_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_entity_idx ON public.audit_logs USING btree (entity_type, entity_id, created_at DESC);


--
-- Name: audit_logs_module_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_logs_module_action_idx ON public.audit_logs USING btree (module, action, created_at DESC);


--
-- Name: brand01_audit_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_audit_record_idx ON public.brand01_catalog_audit_events USING btree (table_name, record_id, created_at DESC);


--
-- Name: brand01_campaign_skus_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_campaign_skus_campaign_idx ON public.brand01_campaign_product_skus USING btree (campaign_id, sku_id);


--
-- Name: brand01_knowledge_product_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_knowledge_product_status_idx ON public.brand01_product_knowledge_versions USING btree (product_id, status, effective_from DESC);


--
-- Name: brand01_knowledge_reviews_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_knowledge_reviews_latest_idx ON public.brand01_knowledge_reviews USING btree (knowledge_version_id, created_at DESC);


--
-- Name: brand01_knowledge_version_natural_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brand01_knowledge_version_natural_uidx ON public.brand01_product_knowledge_versions USING btree (product_id, COALESCE(sku_id, ''::text), knowledge_type, version);


--
-- Name: brand01_platform_sku_external_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brand01_platform_sku_external_lower_uidx ON public.brand01_product_platform_skus USING btree (platform_id, lower(external_sku_id));


--
-- Name: brand01_platform_skus_platform_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_platform_skus_platform_idx ON public.brand01_product_platform_skus USING btree (platform_id, sku_id);


--
-- Name: brand01_product_brands_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_product_brands_brand_idx ON public.brand01_product_brands USING btree (brand_id, product_id);


--
-- Name: brand01_product_skus_code_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brand01_product_skus_code_lower_uidx ON public.brand01_product_skus USING btree (product_id, lower(sku_code));


--
-- Name: brand01_product_skus_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_product_skus_product_idx ON public.brand01_product_skus USING btree (product_id, lifecycle_status);


--
-- Name: brand01_products_code_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brand01_products_code_lower_uidx ON public.brand01_products USING btree (lower(product_code));


--
-- Name: brand01_products_status_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_products_status_name_idx ON public.brand01_products USING btree (lifecycle_status, name) WHERE (archived_at IS NULL);


--
-- Name: brand01_resource_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_resource_campaign_idx ON public.brand01_product_resource_links USING btree (campaign_id, created_at DESC) WHERE (campaign_id IS NOT NULL);


--
-- Name: brand01_resource_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_resource_product_idx ON public.brand01_product_resource_links USING btree (product_id, created_at DESC) WHERE (product_id IS NOT NULL);


--
-- Name: brand01_resource_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_resource_sku_idx ON public.brand01_product_resource_links USING btree (sku_id, created_at DESC) WHERE (sku_id IS NOT NULL);


--
-- Name: brand01_schemes_campaign_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_schemes_campaign_dates_idx ON public.brand01_campaign_schemes USING btree (campaign_id, valid_from, valid_to, status);


--
-- Name: brand01_user_brand_access_active_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX brand01_user_brand_access_active_uidx ON public.brand01_user_brand_access USING btree (user_id, brand_id) WHERE (revoked_at IS NULL);


--
-- Name: brand01_user_brand_access_brand_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_user_brand_access_brand_idx ON public.brand01_user_brand_access USING btree (brand_id, user_id) WHERE (revoked_at IS NULL);


--
-- Name: brand01_user_brand_access_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brand01_user_brand_access_expiry_idx ON public.brand01_user_brand_access USING btree (user_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: brands_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_active_name_idx ON public.brands USING btree (name) WHERE ((archived_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: brands_archived_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_archived_by_idx ON public.brands USING btree (archived_by);


--
-- Name: brands_deleted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_deleted_by_idx ON public.brands USING btree (deleted_by);


--
-- Name: brands_updated_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX brands_updated_by_idx ON public.brands USING btree (updated_by);


--
-- Name: business_users_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_users_active_idx ON public.business_users USING btree (system_permission, full_name) WHERE ((status = 'active'::text) AND (account_status = 'active'::text) AND (archived_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: business_users_archived_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_users_archived_by_idx ON public.business_users USING btree (archived_by);


--
-- Name: business_users_auth_user_id_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_users_auth_user_id_uidx ON public.business_users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: business_users_deleted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_users_deleted_by_idx ON public.business_users USING btree (deleted_by);


--
-- Name: business_users_email_lower_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX business_users_email_lower_uidx ON public.business_users USING btree (lower(email));


--
-- Name: business_users_operational_roles_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX business_users_operational_roles_gin_idx ON public.business_users USING gin (operational_roles);


--
-- Name: campaigns_archived_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_archived_by_idx ON public.campaigns USING btree (archived_by);


--
-- Name: campaigns_brand_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_brand_id_idx ON public.campaigns USING btree (brand_id);


--
-- Name: campaigns_deleted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_deleted_by_idx ON public.campaigns USING btree (deleted_by);


--
-- Name: campaigns_owner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_owner_id_idx ON public.campaigns USING btree (owner_id);


--
-- Name: campaigns_platform_ids_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_platform_ids_gin_idx ON public.campaigns USING gin (platform_ids);


--
-- Name: campaigns_status_dates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaigns_status_dates_idx ON public.campaigns USING btree (status, start_date, end_date) WHERE ((archived_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: dashboard_updates_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dashboard_updates_created_by_idx ON public.dashboard_updates USING btree (created_by);


--
-- Name: dashboard_updates_screenshot_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dashboard_updates_screenshot_file_idx ON public.dashboard_updates USING btree (screenshot_file_id) WHERE (screenshot_file_id IS NOT NULL);


--
-- Name: dashboard_updates_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dashboard_updates_shift_idx ON public.dashboard_updates USING btree (shift_id, "time" DESC);


--
-- Name: idx_attendance_import_batches_fingerprint; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_import_batches_fingerprint ON public.workforce_attendance_import_batches USING btree (source_fingerprint);


--
-- Name: idx_attendance_import_rows_batch_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_import_rows_batch_status ON public.workforce_attendance_import_rows USING btree (batch_id, status);


--
-- Name: idx_attendance_import_rows_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_import_rows_shift ON public.workforce_attendance_import_rows USING btree (matched_shift_id);


--
-- Name: idx_attendance_import_rows_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_import_rows_staff ON public.workforce_attendance_import_rows USING btree (matched_staff_id);


--
-- Name: live_report_images_cover_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_report_images_cover_idx ON public.live_report_images USING btree (report_id) WHERE (is_cover AND (report_id IS NOT NULL));


--
-- Name: live_report_images_report_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_report_images_report_id_idx ON public.live_report_images USING btree (report_id);


--
-- Name: live_report_images_sort_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX live_report_images_sort_order_idx ON public.live_report_images USING btree (report_id, sort_order) WHERE (report_id IS NOT NULL);


--
-- Name: live_report_images_storage_idempotency_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX live_report_images_storage_idempotency_key ON public.live_report_images USING btree (report_id, storage_idempotency_key) WHERE (storage_idempotency_key IS NOT NULL);


--
-- Name: media_grants_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX media_grants_subject_idx ON public.media_viewer_grants USING btree (auth_user_id, shift_id) WHERE active;


--
-- Name: notifications_event_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX notifications_event_key_uidx ON public.notifications USING btree (event_key) WHERE (event_key IS NOT NULL);


--
-- Name: notifications_recipient_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_created_at_idx ON public.notifications USING btree (recipient_id, created_at DESC);


--
-- Name: notifications_recipient_read_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_recipient_read_at_idx ON public.notifications USING btree (recipient_id, read_at);


--
-- Name: operational_files_active_provider_object; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operational_files_active_provider_object ON public.operational_files USING btree (provider, external_file_id) WHERE (deleted_at IS NULL);


--
-- Name: operational_files_active_scope_checksum; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operational_files_active_scope_checksum ON public.operational_files USING btree (scope_key, category, artifact_key) WHERE (deleted_at IS NULL);


--
-- Name: operational_files_brand_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_files_brand_month ON public.operational_files USING btree (brand_id, platform_id, period_date, category) WHERE (deleted_at IS NULL);


--
-- Name: operational_files_campaign_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_files_campaign_created ON public.operational_files USING btree (campaign_id, created_at DESC) WHERE ((campaign_id IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: operational_files_scope_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_files_scope_created ON public.operational_files USING btree (scope_key, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: operational_storage_drive_probe_runs_actor_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX operational_storage_drive_probe_runs_actor_created_idx ON public.operational_storage_drive_probe_runs USING btree (actor_auth_user_id, created_at DESC);


--
-- Name: operational_storage_routes_active_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX operational_storage_routes_active_key_uidx ON public.operational_storage_routes USING btree (provider, execution_source, brand_id, platform_id, subbrand_key) NULLS NOT DISTINCT WHERE active;


--
-- Name: platforms_active_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platforms_active_name_idx ON public.platforms USING btree (name) WHERE ((archived_at IS NULL) AND (deleted_at IS NULL));


--
-- Name: platforms_archived_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platforms_archived_by_idx ON public.platforms USING btree (archived_by);


--
-- Name: platforms_deleted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platforms_deleted_by_idx ON public.platforms USING btree (deleted_by);


--
-- Name: platforms_updated_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX platforms_updated_by_idx ON public.platforms USING btree (updated_by);


--
-- Name: rc19_leader_brand_scope_effective_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rc19_leader_brand_scope_effective_idx ON public.rc19_leader_brand_scopes USING btree (leader_business_user_id, scope_key, brand_id) WHERE (status = 'active'::text);


--
-- Name: rc19_leader_brand_scope_events_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rc19_leader_brand_scope_events_subject_idx ON public.rc19_leader_brand_scope_events USING btree (leader_business_user_id, occurred_at DESC);


--
-- Name: report_images_report_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_images_report_id_idx ON public.report_images USING btree (report_id);


--
-- Name: report_images_uploaded_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_images_uploaded_by_idx ON public.report_images USING btree (uploaded_by);


--
-- Name: report_revisions_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_revisions_created_at_idx ON public.report_revisions USING btree (created_at DESC);


--
-- Name: report_revisions_report_version_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX report_revisions_report_version_uidx ON public.report_revisions USING btree (report_id, version);


--
-- Name: reports_active_shift_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX reports_active_shift_uidx ON public.reports USING btree (shift_id) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL));


--
-- Name: reports_confirmed_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_confirmed_idx ON public.reports USING btree (confirmed_at) WHERE (metrics_confirmed AND (deleted_at IS NULL) AND (archived_at IS NULL));


--
-- Name: reports_shift_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_shift_id_idx ON public.reports USING btree (shift_id);


--
-- Name: reports_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_status_idx ON public.reports USING btree (status) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL));


--
-- Name: reports_submitted_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reports_submitted_by_idx ON public.reports USING btree (submitted_by);


--
-- Name: schedule_import_batch_rows_batch_row_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX schedule_import_batch_rows_batch_row_uidx ON public.schedule_import_batch_rows USING btree (batch_id, row_number);


--
-- Name: schedule_import_batch_rows_shift_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_import_batch_rows_shift_id_idx ON public.schedule_import_batch_rows USING btree (shift_id) WHERE (shift_id IS NOT NULL);


--
-- Name: schedule_import_batches_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX schedule_import_batches_created_at_idx ON public.schedule_import_batches USING btree (created_at DESC);


--
-- Name: self_attendance_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX self_attendance_owner_idx ON public.self_attendance_events USING btree (staff_id, shift_id, recorded_at);


--
-- Name: self_attendance_photo_event_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX self_attendance_photo_event_kind_idx ON public.self_attendance_photo_evidence USING btree (staff_id, shift_id, event_kind, created_at);


--
-- Name: self_attendance_photo_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX self_attendance_photo_owner_idx ON public.self_attendance_photo_evidence USING btree (staff_id, shift_id, created_at);


--
-- Name: shift_operational_notes_date_cat_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_operational_notes_date_cat_idx ON public.shift_operational_notes USING btree (business_date, category);


--
-- Name: shift_operational_notes_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_operational_notes_shift_idx ON public.shift_operational_notes USING btree (shift_id, created_at DESC);


--
-- Name: shift_registrations_active_role_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shift_registrations_active_role_uidx ON public.shift_registrations USING btree (shift_id, user_id, operational_role) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text, 'manually_assigned'::text]));


--
-- Name: shift_registrations_capacity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_registrations_capacity_idx ON public.shift_registrations USING btree (shift_id, operational_role, status);


--
-- Name: shift_registrations_reviewed_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_registrations_reviewed_by_idx ON public.shift_registrations USING btree (reviewed_by) WHERE (reviewed_by IS NOT NULL);


--
-- Name: shift_registrations_user_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shift_registrations_user_schedule_idx ON public.shift_registrations USING btree (user_id, status, shift_id);


--
-- Name: shifts_active_identity_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX shifts_active_identity_uidx ON public.shifts USING btree (brand_id, platform_id, date, start_time, end_time, public.normalize_shift_qualifier(studio), public.normalize_shift_qualifier(campaign_id)) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL));


--
-- Name: INDEX shifts_active_identity_uidx; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.shifts_active_identity_uidx IS 'RC19 Batch 01.3.1: Canonical active shift identity index. Supports parallel sessions in distinct studios/campaigns while strictly preventing duplicate shifts.';


--
-- Name: shifts_brand_platform_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_brand_platform_idx ON public.shifts USING btree (brand_id, platform_id);


--
-- Name: shifts_calendar_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_calendar_idx ON public.shifts USING btree (date, start_time) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL));


--
-- Name: shifts_campaign_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_campaign_id_idx ON public.shifts USING btree (campaign_id);


--
-- Name: shifts_host_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_host_id_idx ON public.shifts USING btree (host_id) WHERE (host_id IS NOT NULL);


--
-- Name: shifts_import_batch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_import_batch_id_idx ON public.shifts USING btree (import_batch_id) WHERE (import_batch_id IS NOT NULL);


--
-- Name: shifts_open_registration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_open_registration_idx ON public.shifts USING btree (end_at, registration_cutoff_at) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL) AND (status = 'scheduled'::text) AND (registration_locked = false));


--
-- Name: shifts_support_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_support_id_idx ON public.shifts USING btree (support_id) WHERE (support_id IS NOT NULL);


--
-- Name: shifts_technical_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_technical_id_idx ON public.shifts USING btree (technical_id) WHERE (technical_id IS NOT NULL);


--
-- Name: shifts_time_range_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shifts_time_range_idx ON public.shifts USING btree (start_at, end_at) WHERE ((deleted_at IS NULL) AND (archived_at IS NULL) AND (status <> 'cancelled'::text));


--
-- Name: storage_resource_audit_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_resource_audit_resource_idx ON public.storage_resource_audit_events USING btree (resource_id, created_at DESC);


--
-- Name: storage_resource_edit_grants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_resource_edit_grants_user_idx ON public.storage_resource_edit_grants USING btree (user_id, resource_id, decision) WHERE (revoked_at IS NULL);


--
-- Name: storage_resource_grants_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_resource_grants_user_idx ON public.storage_resource_user_grants USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: storage_resource_scopes_brand_campaign_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_resource_scopes_brand_campaign_idx ON public.storage_resource_scopes USING btree (brand_id, campaign_id);


--
-- Name: storage_resource_scopes_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX storage_resource_scopes_resource_idx ON public.storage_resource_scopes USING btree (resource_id);


--
-- Name: stored_files_active_artifact_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stored_files_active_artifact_key_idx ON public.stored_files USING btree (report_id, logical_category, artifact_key) WHERE (deleted_at IS NULL);


--
-- Name: stored_files_active_provider_object_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX stored_files_active_provider_object_idx ON public.stored_files USING btree (provider, external_file_id) WHERE (deleted_at IS NULL);


--
-- Name: stored_files_report_category_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stored_files_report_category_created_idx ON public.stored_files USING btree (report_id, logical_category, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: swap_requests_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX swap_requests_active_unique ON public.swap_requests USING btree (source_registration_id) WHERE (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text]));


--
-- Name: swap_requests_counterpart_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX swap_requests_counterpart_active_unique ON public.swap_requests USING btree (counterpart_registration_id) WHERE ((counterpart_registration_id IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'approved'::text])));


--
-- Name: swap_requests_counterpart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swap_requests_counterpart_idx ON public.swap_requests USING btree (counterpart_id) WHERE (counterpart_id IS NOT NULL);


--
-- Name: swap_requests_requester_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swap_requests_requester_idx ON public.swap_requests USING btree (requester_id);


--
-- Name: swap_requests_source_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swap_requests_source_shift_idx ON public.swap_requests USING btree (source_shift_id);


--
-- Name: swap_requests_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swap_requests_status_idx ON public.swap_requests USING btree (status);


--
-- Name: swap_requests_target_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX swap_requests_target_shift_idx ON public.swap_requests USING btree (target_shift_id);


--
-- Name: system_settings_single_row_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX system_settings_single_row_idx ON public.system_settings USING btree ((true));


--
-- Name: workforce_actual_by_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_actual_by_shift ON public.workforce_actual_segments USING btree (shift_id, operational_role);


--
-- Name: workforce_actual_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_actual_by_staff ON public.workforce_actual_segments USING btree (staff_id, actual_start_at);


--
-- Name: workforce_actual_staff_active_overlap; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_actual_staff_active_overlap ON public.workforce_actual_segments USING btree (staff_id, actual_start_at, actual_end_at) WHERE ((event_kind = 'worked'::text) AND (review_status = 'approved'::text));


--
-- Name: workforce_line_audit_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_line_audit_request ON public.workforce_payroll_audit USING btree (actor_id, request_id) WHERE (request_id IS NOT NULL);


--
-- Name: workforce_line_audit_version; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_line_audit_version ON public.workforce_payroll_audit USING btree (line_id, line_version) WHERE (line_id IS NOT NULL);


--
-- Name: workforce_one_no_show_per_shift_staff_role; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_one_no_show_per_shift_staff_role ON public.workforce_actual_segments USING btree (shift_id, staff_id, operational_role) WHERE ((event_kind = 'no_show'::text) AND (review_status <> 'rejected'::text));


--
-- Name: workforce_payroll_audit_by_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_payroll_audit_by_period ON public.workforce_payroll_audit USING btree (period_id, created_at);


--
-- Name: workforce_payroll_lines_by_staff; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_payroll_lines_by_staff ON public.workforce_payroll_lines USING btree (period_id, staff_id);


--
-- Name: workforce_payroll_one_period_per_segment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX workforce_payroll_one_period_per_segment ON public.workforce_payroll_lines USING btree (segment_id);


--
-- Name: workforce_rates_by_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_rates_by_scope ON public.workforce_rate_cards USING btree (staff_id, operational_role, effective_from, effective_through);


--
-- Name: rbac01_role_default_events rbac01_events_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER rbac01_events_immutable BEFORE DELETE OR UPDATE ON private.rbac01_role_default_events FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();


--
-- Name: rbac01_role_default_versions rbac01_versions_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER rbac01_versions_immutable BEFORE DELETE OR UPDATE ON private.rbac01_role_default_versions FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();


--
-- Name: rbac02_account_permission_versions rbac02_versions_immutable; Type: TRIGGER; Schema: private; Owner: -
--

CREATE TRIGGER rbac02_versions_immutable BEFORE DELETE OR UPDATE ON private.rbac02_account_permission_versions FOR EACH ROW EXECUTE FUNCTION private.rbac_reject_immutable_change();


--
-- Name: account_requests account_requests_notification_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_requests_notification_events AFTER INSERT ON public.account_requests FOR EACH ROW EXECUTE FUNCTION private.emit_account_request_notification();


--
-- Name: account_requests account_requests_rate_limit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_requests_rate_limit BEFORE INSERT ON public.account_requests FOR EACH ROW EXECUTE FUNCTION private.enforce_account_request_rate_limit();


--
-- Name: account_requests account_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER account_requests_set_updated_at BEFORE UPDATE ON public.account_requests FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: account_requests audit_account_requests_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_account_requests_change AFTER INSERT OR DELETE OR UPDATE ON public.account_requests FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: brands audit_brands_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_brands_change AFTER INSERT OR DELETE OR UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: business_users audit_business_users_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_business_users_change AFTER INSERT OR DELETE OR UPDATE ON public.business_users FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: campaigns audit_campaigns_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_campaigns_change AFTER INSERT OR DELETE OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: live_report_images audit_live_report_images_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_live_report_images_change AFTER INSERT OR DELETE OR UPDATE ON public.live_report_images FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: platforms audit_platforms_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_platforms_change AFTER INSERT OR DELETE OR UPDATE ON public.platforms FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: report_images audit_report_images_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_report_images_change AFTER INSERT OR DELETE OR UPDATE ON public.report_images FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: report_revisions audit_report_revisions_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_report_revisions_change AFTER INSERT OR DELETE OR UPDATE ON public.report_revisions FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: reports audit_reports_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_reports_change AFTER INSERT OR DELETE OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: schedule_import_batch_rows audit_schedule_import_batch_rows_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_schedule_import_batch_rows_change AFTER INSERT OR DELETE OR UPDATE ON public.schedule_import_batch_rows FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: schedule_import_batches audit_schedule_import_batches_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_schedule_import_batches_change AFTER INSERT OR DELETE OR UPDATE ON public.schedule_import_batches FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: shift_registrations audit_shift_registrations_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_shift_registrations_change AFTER INSERT OR DELETE OR UPDATE ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: shifts audit_shifts_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_shifts_change AFTER INSERT OR DELETE OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: swap_requests audit_swap_requests_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_swap_requests_change AFTER INSERT OR DELETE OR UPDATE ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.capture_audit_row_change();


--
-- Name: workforce_actual_segments audit_workforce_actual_segments_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_workforce_actual_segments_change AFTER INSERT OR DELETE OR UPDATE ON public.workforce_actual_segments FOR EACH ROW EXECUTE FUNCTION private.capture_workforce_actual_audit();


--
-- Name: TRIGGER audit_workforce_actual_segments_change ON workforce_actual_segments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER audit_workforce_actual_segments_change ON public.workforce_actual_segments IS 'RC1.7A: Audits all Actual Staffing segment lifecycle events (draft submission, review approval/rejection) into public.audit_logs under module calendar';


--
-- Name: brand01_user_brand_access brand01_access_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_access_audit AFTER INSERT OR UPDATE ON public.brand01_user_brand_access FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_user_brand_access brand01_access_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_access_guard BEFORE INSERT OR DELETE OR UPDATE ON public.brand01_user_brand_access FOR EACH ROW EXECUTE FUNCTION private.brand01_user_brand_access_guard();


--
-- Name: brand01_campaign_schemes brand01_campaign_scheme_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_campaign_scheme_audit AFTER INSERT OR UPDATE ON public.brand01_campaign_schemes FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_campaign_schemes brand01_campaign_scheme_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_campaign_scheme_guard BEFORE INSERT OR UPDATE ON public.brand01_campaign_schemes FOR EACH ROW EXECUTE FUNCTION private.brand01_scheme_guard();


--
-- Name: brand01_campaign_product_skus brand01_campaign_sku_brand; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_campaign_sku_brand BEFORE INSERT OR UPDATE ON public.brand01_campaign_product_skus FOR EACH ROW EXECUTE FUNCTION private.brand01_campaign_sku_brand_guard();


--
-- Name: brand01_campaign_product_skus brand01_campaign_skus_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_campaign_skus_audit AFTER INSERT OR UPDATE ON public.brand01_campaign_product_skus FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_product_knowledge_versions brand01_knowledge_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_knowledge_append_only BEFORE INSERT OR DELETE OR UPDATE ON public.brand01_product_knowledge_versions FOR EACH ROW EXECUTE FUNCTION private.brand01_knowledge_guard();


--
-- Name: brand01_product_knowledge_versions brand01_knowledge_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_knowledge_audit AFTER INSERT ON public.brand01_product_knowledge_versions FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_knowledge_reviews brand01_knowledge_review_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_knowledge_review_audit AFTER INSERT ON public.brand01_knowledge_reviews FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_knowledge_reviews brand01_knowledge_review_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_knowledge_review_guard BEFORE INSERT OR DELETE OR UPDATE ON public.brand01_knowledge_reviews FOR EACH ROW EXECUTE FUNCTION private.brand01_review_guard();


--
-- Name: brand01_product_platform_skus brand01_platform_skus_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_platform_skus_audit AFTER INSERT OR UPDATE ON public.brand01_product_platform_skus FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_product_brands brand01_product_brands_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_product_brands_audit AFTER INSERT OR UPDATE ON public.brand01_product_brands FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_products brand01_products_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_products_audit AFTER INSERT OR UPDATE ON public.brand01_products FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_product_resource_links brand01_resource_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_resource_active BEFORE INSERT OR UPDATE ON public.brand01_product_resource_links FOR EACH ROW EXECUTE FUNCTION private.brand01_resource_guard();


--
-- Name: brand01_product_resource_links brand01_resource_links_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_resource_links_audit AFTER INSERT ON public.brand01_product_resource_links FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brand01_product_skus brand01_skus_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brand01_skus_audit AFTER INSERT OR UPDATE ON public.brand01_product_skus FOR EACH ROW EXECUTE FUNCTION private.brand01_catalog_audit();


--
-- Name: brands brands_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER brands_set_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: business_users business_users_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER business_users_set_updated_at BEFORE UPDATE ON public.business_users FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: campaigns campaigns_leader_update_scope; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_leader_update_scope BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION private.enforce_campaign_leader_update_scope();


--
-- Name: campaigns campaigns_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_set_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: campaigns campaigns_validate_platform_ids; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER campaigns_validate_platform_ids BEFORE INSERT OR UPDATE OF platform_ids ON public.campaigns FOR EACH ROW EXECUTE FUNCTION private.validate_campaign_platform_ids();


--
-- Name: live_report_images live_image_storage_category; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER live_image_storage_category BEFORE UPDATE OF category ON public.live_report_images FOR EACH ROW EXECUTE FUNCTION private.sync_live_image_storage_category();


--
-- Name: live_report_images live_report_images_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER live_report_images_set_updated_at BEFORE UPDATE ON public.live_report_images FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: operational_schedule_source_files operational_schedule_source_files_guard_mutation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER operational_schedule_source_files_guard_mutation BEFORE INSERT OR DELETE OR UPDATE ON public.operational_schedule_source_files FOR EACH ROW EXECUTE FUNCTION private.guard_excel_source_receipt_mutation();


--
-- Name: platforms platforms_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER platforms_set_updated_at BEFORE UPDATE ON public.platforms FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: live_report_images rc19_live_report_image_scope_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rc19_live_report_image_scope_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.live_report_images FOR EACH ROW EXECUTE FUNCTION private.rc19_guard_report_child_write();


--
-- Name: report_images rc19_report_image_scope_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rc19_report_image_scope_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.report_images FOR EACH ROW EXECUTE FUNCTION private.rc19_guard_report_child_write();


--
-- Name: reports rc19_report_scope_write_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rc19_report_scope_write_guard BEFORE INSERT OR DELETE OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.rc19_guard_report_write();


--
-- Name: business_users rc19_revoke_leader_brand_scopes_on_role_loss; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rc19_revoke_leader_brand_scopes_on_role_loss AFTER UPDATE OF system_permission, status, account_status, archived_at, deleted_at ON public.business_users FOR EACH ROW EXECUTE FUNCTION private.rc19_revoke_leader_brand_scopes_on_role_loss();


--
-- Name: report_images report_images_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER report_images_set_updated_at BEFORE UPDATE ON public.report_images FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: reports reports_notification_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reports_notification_events AFTER INSERT OR UPDATE OF status ON public.reports FOR EACH ROW EXECUTE FUNCTION private.emit_report_notification();


--
-- Name: reports reports_require_complete_metrics_on_confirmation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reports_require_complete_metrics_on_confirmation BEFORE INSERT OR UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.enforce_report_required_metrics();


--
-- Name: reports reports_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reports_set_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: schedule_import_batch_rows schedule_import_batch_rows_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_import_batch_rows_set_updated_at BEFORE UPDATE ON public.schedule_import_batch_rows FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: schedule_import_batches schedule_import_batches_notification_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_import_batches_notification_events AFTER INSERT OR UPDATE OF status ON public.schedule_import_batches FOR EACH ROW EXECUTE FUNCTION private.emit_import_notification();


--
-- Name: schedule_import_batches schedule_import_batches_require_excel_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_import_batches_require_excel_source BEFORE INSERT OR UPDATE OF id, source, status ON public.schedule_import_batches FOR EACH ROW EXECUTE FUNCTION private.require_excel_source_before_batch_confirmation();


--
-- Name: schedule_import_batches schedule_import_batches_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER schedule_import_batches_set_updated_at BEFORE UPDATE ON public.schedule_import_batches FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: self_attendance_events self_attendance_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER self_attendance_immutable BEFORE DELETE OR UPDATE ON public.self_attendance_events FOR EACH ROW EXECUTE FUNCTION private.reject_self_attendance_mutation();


--
-- Name: self_attendance_photo_evidence self_attendance_photo_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER self_attendance_photo_immutable BEFORE DELETE OR UPDATE ON public.self_attendance_photo_evidence FOR EACH ROW EXECUTE FUNCTION private.reject_self_attendance_mutation();


--
-- Name: self_attendance_events self_attendance_photo_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER self_attendance_photo_required BEFORE INSERT ON public.self_attendance_events FOR EACH ROW EXECUTE FUNCTION private.require_self_attendance_photo();


--
-- Name: shifts set_shift_status_mode_before_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_shift_status_mode_before_update BEFORE UPDATE OF status ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.set_shift_status_mode();


--
-- Name: shift_registrations shift_registrations_bump_concurrency_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shift_registrations_bump_concurrency_version BEFORE UPDATE ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.bump_concurrency_version();


--
-- Name: shift_registrations shift_registrations_notification_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shift_registrations_notification_events AFTER INSERT OR UPDATE OF status ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.emit_shift_registration_notification();


--
-- Name: shift_registrations shift_registrations_rbac_staffing_permission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shift_registrations_rbac_staffing_permission BEFORE INSERT OR UPDATE OF status ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.enforce_rbac_staffing_permission();


--
-- Name: shift_registrations shift_registrations_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shift_registrations_set_updated_at BEFORE UPDATE ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: shift_registrations shift_registrations_sync_projection; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shift_registrations_sync_projection AFTER INSERT OR DELETE OR UPDATE ON public.shift_registrations FOR EACH ROW EXECUTE FUNCTION private.sync_shift_staffing_projection_trigger();


--
-- Name: shifts shifts_bump_concurrency_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shifts_bump_concurrency_version BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.bump_concurrency_version();


--
-- Name: shifts shifts_derive_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shifts_derive_fields BEFORE INSERT OR UPDATE OF date, start_time, end_time, timezone, registration_cutoff_at ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.set_shift_derived_fields();


--
-- Name: shifts shifts_require_excel_schedule_source_receipt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shifts_require_excel_schedule_source_receipt BEFORE INSERT OR UPDATE OF import_batch_id ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.require_excel_schedule_source_receipt();


--
-- Name: shifts shifts_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER shifts_set_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resource_edit_grants_audit AFTER INSERT OR DELETE OR UPDATE ON public.storage_resource_edit_grants FOR EACH ROW EXECUTE FUNCTION private.audit_storage_resource_change();


--
-- Name: storage_resource_user_grants storage_resource_grants_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resource_grants_audit AFTER INSERT OR DELETE OR UPDATE ON public.storage_resource_user_grants FOR EACH ROW EXECUTE FUNCTION private.audit_storage_resource_change();


--
-- Name: storage_resource_user_grants storage_resource_grants_target_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resource_grants_target_guard BEFORE INSERT OR UPDATE ON public.storage_resource_user_grants FOR EACH ROW EXECUTE FUNCTION private.guard_storage_resource_grant();


--
-- Name: storage_resource_scopes storage_resource_scopes_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resource_scopes_audit AFTER INSERT OR DELETE OR UPDATE ON public.storage_resource_scopes FOR EACH ROW EXECUTE FUNCTION private.audit_storage_resource_change();


--
-- Name: storage_resource_scopes storage_resource_scopes_private_attendance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resource_scopes_private_attendance BEFORE INSERT OR UPDATE ON public.storage_resource_scopes FOR EACH ROW EXECUTE FUNCTION private.guard_storage_resource_scope();


--
-- Name: storage_resources storage_resources_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resources_audit AFTER INSERT OR DELETE OR UPDATE ON public.storage_resources FOR EACH ROW EXECUTE FUNCTION private.audit_storage_resource_change();


--
-- Name: storage_resources storage_resources_private_attendance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER storage_resources_private_attendance BEFORE UPDATE OF resource_type, visibility ON public.storage_resources FOR EACH ROW EXECUTE FUNCTION private.guard_storage_resource_attendance();


--
-- Name: swap_requests swap_requests_bump_concurrency_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER swap_requests_bump_concurrency_version BEFORE UPDATE ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.bump_concurrency_version();


--
-- Name: swap_requests swap_requests_enforce_transition; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER swap_requests_enforce_transition BEFORE UPDATE ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.enforce_swap_request_transition();


--
-- Name: swap_requests swap_requests_notification_events; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER swap_requests_notification_events AFTER INSERT OR UPDATE OF status ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.emit_swap_notification();


--
-- Name: swap_requests swap_requests_rbac_permission; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER swap_requests_rbac_permission BEFORE INSERT OR UPDATE OF status ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.enforce_rbac_swap_permission();


--
-- Name: swap_requests swap_requests_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER swap_requests_set_updated_at BEFORE UPDATE ON public.swap_requests FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();


--
-- Name: workforce_actual_segments workforce_actual_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_actual_guard BEFORE INSERT OR DELETE OR UPDATE ON public.workforce_actual_segments FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16_immutable_approved_segment();


--
-- Name: workforce_payroll_lines workforce_line_change_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_line_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.workforce_payroll_lines FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16b_line_change_guard();


--
-- Name: workforce_payroll_lines workforce_line_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_line_guard BEFORE INSERT OR UPDATE ON public.workforce_payroll_lines FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16_line_guard();


--
-- Name: workforce_payroll_audit workforce_payroll_audit_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_payroll_audit_immutable BEFORE DELETE OR UPDATE ON public.workforce_payroll_audit FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16_immutable_payroll_audit();


--
-- Name: workforce_payroll_periods workforce_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_period_guard BEFORE INSERT OR DELETE OR UPDATE ON public.workforce_payroll_periods FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16_period_guard();


--
-- Name: workforce_payroll_periods workforce_period_review_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_period_review_guard BEFORE UPDATE ON public.workforce_payroll_periods FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16b_period_review_guard();


--
-- Name: workforce_rate_cards workforce_rate_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER workforce_rate_guard BEFORE INSERT OR DELETE OR UPDATE ON public.workforce_rate_cards FOR EACH ROW EXECUTE FUNCTION public.workforce_rc16_rate_guard();


--
-- Name: identities identities_user_id_fkey; Type: FK CONSTRAINT; Schema: auth; Owner: -
--

ALTER TABLE ONLY auth.identities
    ADD CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: rbac01_role_default_events rbac01_role_default_events_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_events
    ADD CONSTRAINT rbac01_role_default_events_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id);


--
-- Name: rbac01_role_default_events rbac01_role_default_events_resulting_version_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_events
    ADD CONSTRAINT rbac01_role_default_events_resulting_version_id_fkey FOREIGN KEY (resulting_version_id) REFERENCES private.rbac01_role_default_versions(id);


--
-- Name: rbac01_role_default_events rbac01_role_default_events_version_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_events
    ADD CONSTRAINT rbac01_role_default_events_version_id_fkey FOREIGN KEY (version_id) REFERENCES private.rbac01_role_default_versions(id);


--
-- Name: rbac01_role_default_versions rbac01_role_default_versions_expected_active_version_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_versions
    ADD CONSTRAINT rbac01_role_default_versions_expected_active_version_id_fkey FOREIGN KEY (expected_active_version_id) REFERENCES private.rbac01_role_default_versions(id);


--
-- Name: rbac01_role_default_versions rbac01_role_default_versions_proposed_by_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac01_role_default_versions
    ADD CONSTRAINT rbac01_role_default_versions_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.business_users(id);


--
-- Name: rbac02_account_permission_versions rbac02_account_permission_versions_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac02_account_permission_versions
    ADD CONSTRAINT rbac02_account_permission_versions_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id);


--
-- Name: rbac02_account_permission_versions rbac02_account_permission_versions_permission_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac02_account_permission_versions
    ADD CONSTRAINT rbac02_account_permission_versions_permission_fkey FOREIGN KEY (permission) REFERENCES private.rbac_permission_catalog(permission);


--
-- Name: rbac02_account_permission_versions rbac02_account_permission_versions_target_business_user_id_fkey; Type: FK CONSTRAINT; Schema: private; Owner: -
--

ALTER TABLE ONLY private.rbac02_account_permission_versions
    ADD CONSTRAINT rbac02_account_permission_versions_target_business_user_id_fkey FOREIGN KEY (target_business_user_id) REFERENCES public.business_users(id);


--
-- Name: account_requests account_requests_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_requests
    ADD CONSTRAINT account_requests_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: account_requests account_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_requests
    ADD CONSTRAINT account_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: account_requests account_requests_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_requests
    ADD CONSTRAINT account_requests_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: attendance_photo_drive_folders attendance_photo_drive_folders_last_materialized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_photo_drive_folders
    ADD CONSTRAINT attendance_photo_drive_folders_last_materialized_by_fkey FOREIGN KEY (last_materialized_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: attendance_photo_drive_folders attendance_photo_drive_folders_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_photo_drive_folders
    ADD CONSTRAINT attendance_photo_drive_folders_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: audit_log_reviews audit_log_reviews_audit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_reviews
    ADD CONSTRAINT audit_log_reviews_audit_id_fkey FOREIGN KEY (audit_id) REFERENCES public.audit_logs(id) ON DELETE CASCADE;


--
-- Name: audit_log_reviews audit_log_reviews_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log_reviews
    ADD CONSTRAINT audit_log_reviews_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: brand01_campaign_product_skus brand01_campaign_product_skus_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_product_skus
    ADD CONSTRAINT brand01_campaign_product_skus_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_product_skus brand01_campaign_product_skus_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_product_skus
    ADD CONSTRAINT brand01_campaign_product_skus_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_product_skus brand01_campaign_product_skus_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_product_skus
    ADD CONSTRAINT brand01_campaign_product_skus_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_product_skus brand01_campaign_product_skus_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_product_skus
    ADD CONSTRAINT brand01_campaign_product_skus_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.brand01_product_skus(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.brand01_product_skus(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_source_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_source_resource_id_fkey FOREIGN KEY (source_resource_id) REFERENCES public.storage_resources(id) ON DELETE RESTRICT;


--
-- Name: brand01_campaign_schemes brand01_campaign_schemes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_campaign_schemes
    ADD CONSTRAINT brand01_campaign_schemes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_knowledge_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_knowledge_reviews
    ADD CONSTRAINT brand01_knowledge_reviews_knowledge_version_id_fkey FOREIGN KEY (knowledge_version_id) REFERENCES public.brand01_product_knowledge_versions(id) ON DELETE RESTRICT;


--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_knowledge_reviews
    ADD CONSTRAINT brand01_knowledge_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_brands brand01_product_brands_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_brands
    ADD CONSTRAINT brand01_product_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_brands brand01_product_brands_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_brands
    ADD CONSTRAINT brand01_product_brands_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_brands brand01_product_brands_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_brands
    ADD CONSTRAINT brand01_product_brands_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.brand01_products(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_brands brand01_product_brands_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_brands
    ADD CONSTRAINT brand01_product_brands_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.brand01_products(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.brand01_product_skus(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_knowledge_versions brand01_product_knowledge_versions_source_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_knowledge_versions
    ADD CONSTRAINT brand01_product_knowledge_versions_source_resource_id_fkey FOREIGN KEY (source_resource_id) REFERENCES public.storage_resources(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_platform_skus brand01_product_platform_skus_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_platform_skus
    ADD CONSTRAINT brand01_product_platform_skus_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_platform_skus brand01_product_platform_skus_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_platform_skus
    ADD CONSTRAINT brand01_product_platform_skus_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_platform_skus brand01_product_platform_skus_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_platform_skus
    ADD CONSTRAINT brand01_product_platform_skus_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.brand01_product_skus(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.brand01_products(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.storage_resources(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_resource_links brand01_product_resource_links_sku_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_resource_links
    ADD CONSTRAINT brand01_product_resource_links_sku_id_fkey FOREIGN KEY (sku_id) REFERENCES public.brand01_product_skus(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_skus brand01_product_skus_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_skus brand01_product_skus_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_skus brand01_product_skus_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.brand01_products(id) ON DELETE RESTRICT;


--
-- Name: brand01_product_skus brand01_product_skus_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_product_skus
    ADD CONSTRAINT brand01_product_skus_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_products brand01_products_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_products brand01_products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_products brand01_products_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_products brand01_products_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_products
    ADD CONSTRAINT brand01_products_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_user_brand_access brand01_user_brand_access_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_user_brand_access
    ADD CONSTRAINT brand01_user_brand_access_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: brand01_user_brand_access brand01_user_brand_access_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_user_brand_access
    ADD CONSTRAINT brand01_user_brand_access_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_user_brand_access brand01_user_brand_access_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_user_brand_access
    ADD CONSTRAINT brand01_user_brand_access_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brand01_user_brand_access brand01_user_brand_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand01_user_brand_access
    ADD CONSTRAINT brand01_user_brand_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: brands brands_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: brands brands_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: brands brands_storage_profile_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_storage_profile_reviewed_by_fkey FOREIGN KEY (storage_profile_reviewed_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: brands brands_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brands
    ADD CONSTRAINT brands_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: business_users business_users_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: business_users business_users_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_users business_users_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_users
    ADD CONSTRAINT business_users_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: campaigns campaigns_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: campaigns campaigns_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: dashboard_updates dashboard_updates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_updates
    ADD CONSTRAINT dashboard_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: dashboard_updates dashboard_updates_screenshot_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_updates
    ADD CONSTRAINT dashboard_updates_screenshot_file_id_fkey FOREIGN KEY (screenshot_file_id) REFERENCES public.operational_files(id) ON DELETE RESTRICT;


--
-- Name: dashboard_updates dashboard_updates_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_updates
    ADD CONSTRAINT dashboard_updates_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: live_report_images live_report_images_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_report_images
    ADD CONSTRAINT live_report_images_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: live_report_images live_report_images_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.live_report_images
    ADD CONSTRAINT live_report_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: media_stream_routes media_stream_routes_active_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_active_shift_id_fkey FOREIGN KEY (active_shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: media_stream_routes media_stream_routes_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: media_stream_routes media_stream_routes_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_stream_routes
    ADD CONSTRAINT media_stream_routes_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: media_viewer_grants media_viewer_grants_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_viewer_grants
    ADD CONSTRAINT media_viewer_grants_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: media_viewer_grants media_viewer_grants_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_viewer_grants
    ADD CONSTRAINT media_viewer_grants_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.business_users(id) ON DELETE CASCADE;


--
-- Name: operational_files operational_files_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: operational_files operational_files_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;


--
-- Name: operational_files operational_files_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: operational_files operational_files_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: operational_files operational_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_files
    ADD CONSTRAINT operational_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: operational_schedule_source_files operational_schedule_source_files_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_schedule_source_files
    ADD CONSTRAINT operational_schedule_source_files_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.schedule_import_batches(id) ON DELETE RESTRICT;


--
-- Name: operational_storage_routes operational_storage_routes_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_routes
    ADD CONSTRAINT operational_storage_routes_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: operational_storage_routes operational_storage_routes_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_routes
    ADD CONSTRAINT operational_storage_routes_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: operational_storage_routes operational_storage_routes_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operational_storage_routes
    ADD CONSTRAINT operational_storage_routes_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: platforms platforms_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: platforms platforms_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: platforms platforms_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platforms
    ADD CONSTRAINT platforms_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scope_events
    ADD CONSTRAINT rc19_leader_brand_scope_events_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scope_events
    ADD CONSTRAINT rc19_leader_brand_scope_events_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_leader_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scope_events
    ADD CONSTRAINT rc19_leader_brand_scope_events_leader_business_user_id_fkey FOREIGN KEY (leader_business_user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_scope_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scope_events
    ADD CONSTRAINT rc19_leader_brand_scope_events_scope_id_fkey FOREIGN KEY (scope_id) REFERENCES public.rc19_leader_brand_scopes(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scopes_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scopes_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_leader_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scopes_leader_business_user_id_fkey FOREIGN KEY (leader_business_user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_leader_brand_scopes
    ADD CONSTRAINT rc19_leader_brand_scopes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletion_events rc19_report_artifact_deletion_event_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletion_events
    ADD CONSTRAINT rc19_report_artifact_deletion_event_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletion_events rc19_report_artifact_deletion_events_operation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletion_events
    ADD CONSTRAINT rc19_report_artifact_deletion_events_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES public.rc19_report_artifact_deletions(operation_id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_lease_actor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_lease_actor_fkey FOREIGN KEY (lease_actor) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_artifact_deletions rc19_report_artifact_deletions_stored_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_artifact_deletions
    ADD CONSTRAINT rc19_report_artifact_deletions_stored_file_id_fkey FOREIGN KEY (stored_file_id) REFERENCES public.stored_files(id) ON DELETE RESTRICT;


--
-- Name: rc19_report_export_audit rc19_report_export_audit_actor_business_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rc19_report_export_audit
    ADD CONSTRAINT rc19_report_export_audit_actor_business_user_id_fkey FOREIGN KEY (actor_business_user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: report_images report_images_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_images
    ADD CONSTRAINT report_images_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: report_images report_images_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_images
    ADD CONSTRAINT report_images_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: report_revisions report_revisions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_revisions
    ADD CONSTRAINT report_revisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: report_revisions report_revisions_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_revisions
    ADD CONSTRAINT report_revisions_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: reports reports_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: reports reports_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: reports reports_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: reports reports_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: reports reports_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: reports reports_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: reports reports_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reports
    ADD CONSTRAINT reports_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: schedule_import_batch_rows schedule_import_batch_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batch_rows
    ADD CONSTRAINT schedule_import_batch_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.schedule_import_batches(id) ON DELETE RESTRICT;


--
-- Name: schedule_import_batch_rows schedule_import_batch_rows_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batch_rows
    ADD CONSTRAINT schedule_import_batch_rows_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: schedule_import_batches schedule_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batches
    ADD CONSTRAINT schedule_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: schedule_import_batches schedule_import_batches_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_import_batches
    ADD CONSTRAINT schedule_import_batches_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: self_attendance_events self_attendance_events_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_events
    ADD CONSTRAINT self_attendance_events_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: self_attendance_events self_attendance_events_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_events
    ADD CONSTRAINT self_attendance_events_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id);


--
-- Name: self_attendance_photo_evidence self_attendance_photo_evidence_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.self_attendance_photo_evidence
    ADD CONSTRAINT self_attendance_photo_evidence_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id);


--
-- Name: shift_operational_notes shift_operational_notes_affected_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_operational_notes
    ADD CONSTRAINT shift_operational_notes_affected_user_id_fkey FOREIGN KEY (affected_user_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shift_operational_notes shift_operational_notes_author_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_operational_notes
    ADD CONSTRAINT shift_operational_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: shift_operational_notes shift_operational_notes_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_operational_notes
    ADD CONSTRAINT shift_operational_notes_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: shift_registrations shift_registrations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_registrations
    ADD CONSTRAINT shift_registrations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shift_registrations shift_registrations_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_registrations
    ADD CONSTRAINT shift_registrations_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: shift_registrations shift_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shift_registrations
    ADD CONSTRAINT shift_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: shifts shifts_archived_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: shifts shifts_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT NOT VALID;


--
-- Name: shifts shifts_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_host_id_fkey FOREIGN KEY (host_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_import_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_import_batch_id_fkey FOREIGN KEY (import_batch_id) REFERENCES public.schedule_import_batches(id) ON DELETE SET NULL NOT VALID;


--
-- Name: shifts shifts_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: shifts shifts_support_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_support_id_fkey FOREIGN KEY (support_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_technical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_technical_id_fkey FOREIGN KEY (technical_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: shifts shifts_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_edit_grants
    ADD CONSTRAINT storage_resource_edit_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_edit_grants
    ADD CONSTRAINT storage_resource_edit_grants_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.storage_resources(id) ON DELETE CASCADE;


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_edit_grants
    ADD CONSTRAINT storage_resource_edit_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_platform_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES public.platforms(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.storage_resources(id) ON DELETE CASCADE;


--
-- Name: storage_resource_scopes storage_resource_scopes_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_scopes storage_resource_scopes_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_scopes
    ADD CONSTRAINT storage_resource_scopes_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_user_grants storage_resource_user_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_user_grants
    ADD CONSTRAINT storage_resource_user_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resource_user_grants storage_resource_user_grants_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_user_grants
    ADD CONSTRAINT storage_resource_user_grants_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.storage_resources(id) ON DELETE CASCADE;


--
-- Name: storage_resource_user_grants storage_resource_user_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resource_user_grants
    ADD CONSTRAINT storage_resource_user_grants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resources storage_resources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resources storage_resources_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: storage_resources storage_resources_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.storage_resources
    ADD CONSTRAINT storage_resources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: stored_files stored_files_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stored_files
    ADD CONSTRAINT stored_files_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;


--
-- Name: stored_files stored_files_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stored_files
    ADD CONSTRAINT stored_files_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE CASCADE;


--
-- Name: stored_files stored_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stored_files
    ADD CONSTRAINT stored_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.business_users(id);


--
-- Name: swap_requests swap_requests_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_counterpart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_counterpart_id_fkey FOREIGN KEY (counterpart_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_counterpart_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_counterpart_registration_id_fkey FOREIGN KEY (counterpart_registration_id) REFERENCES public.shift_registrations(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_new_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_new_host_id_fkey FOREIGN KEY (new_host_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_new_support_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_new_support_id_fkey FOREIGN KEY (new_support_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_new_technical_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_new_technical_id_fkey FOREIGN KEY (new_technical_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_original_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_original_staff_id_fkey FOREIGN KEY (original_staff_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_replacement_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_replacement_staff_id_fkey FOREIGN KEY (replacement_staff_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: swap_requests swap_requests_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_source_registration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_source_registration_id_fkey FOREIGN KEY (source_registration_id) REFERENCES public.shift_registrations(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_source_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_source_shift_id_fkey FOREIGN KEY (source_shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: swap_requests swap_requests_target_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.swap_requests
    ADD CONSTRAINT swap_requests_target_shift_id_fkey FOREIGN KEY (target_shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: workforce_actual_segments workforce_actual_segments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_actual_segments
    ADD CONSTRAINT workforce_actual_segments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id);


--
-- Name: workforce_actual_segments workforce_actual_segments_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_actual_segments
    ADD CONSTRAINT workforce_actual_segments_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id);


--
-- Name: workforce_actual_segments workforce_actual_segments_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_actual_segments
    ADD CONSTRAINT workforce_actual_segments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE RESTRICT;


--
-- Name: workforce_actual_segments workforce_actual_segments_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_actual_segments
    ADD CONSTRAINT workforce_actual_segments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: workforce_attendance_import_batches workforce_attendance_import_batches_brand_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_batches
    ADD CONSTRAINT workforce_attendance_import_batches_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES public.brands(id) ON DELETE RESTRICT;


--
-- Name: workforce_attendance_import_batches workforce_attendance_import_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_batches
    ADD CONSTRAINT workforce_attendance_import_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id);


--
-- Name: workforce_attendance_import_rows workforce_attendance_import_rows_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT workforce_attendance_import_rows_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.workforce_attendance_import_batches(id) ON DELETE CASCADE;


--
-- Name: workforce_attendance_import_rows workforce_attendance_import_rows_matched_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT workforce_attendance_import_rows_matched_shift_id_fkey FOREIGN KEY (matched_shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--
-- Name: workforce_attendance_import_rows workforce_attendance_import_rows_matched_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT workforce_attendance_import_rows_matched_staff_id_fkey FOREIGN KEY (matched_staff_id) REFERENCES public.business_users(id) ON DELETE SET NULL;


--
-- Name: workforce_attendance_import_rows workforce_attendance_import_rows_resulting_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_attendance_import_rows
    ADD CONSTRAINT workforce_attendance_import_rows_resulting_segment_id_fkey FOREIGN KEY (resulting_segment_id) REFERENCES public.workforce_actual_segments(id) ON DELETE SET NULL;


--
-- Name: workforce_payroll_audit workforce_payroll_audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_audit
    ADD CONSTRAINT workforce_payroll_audit_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.business_users(id);


--
-- Name: workforce_payroll_audit workforce_payroll_audit_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_audit
    ADD CONSTRAINT workforce_payroll_audit_line_id_fkey FOREIGN KEY (line_id) REFERENCES public.workforce_payroll_lines(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_audit workforce_payroll_audit_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_audit
    ADD CONSTRAINT workforce_payroll_audit_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.workforce_payroll_periods(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_audit workforce_payroll_audit_rate_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_audit
    ADD CONSTRAINT workforce_payroll_audit_rate_card_id_fkey FOREIGN KEY (rate_card_id) REFERENCES public.workforce_rate_cards(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_lines workforce_payroll_lines_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_lines_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.workforce_payroll_periods(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_lines workforce_payroll_lines_rate_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_lines_rate_card_id_fkey FOREIGN KEY (rate_card_id) REFERENCES public.workforce_rate_cards(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_lines workforce_payroll_lines_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_lines_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.workforce_actual_segments(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_lines workforce_payroll_lines_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_lines
    ADD CONSTRAINT workforce_payroll_lines_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: workforce_payroll_periods workforce_payroll_periods_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_payroll_periods_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.business_users(id);


--
-- Name: workforce_payroll_periods workforce_payroll_periods_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_payroll_periods_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.business_users(id);


--
-- Name: workforce_payroll_periods workforce_payroll_periods_locked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_payroll_periods_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES public.business_users(id);


--
-- Name: workforce_payroll_periods workforce_payroll_periods_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payroll_periods
    ADD CONSTRAINT workforce_payroll_periods_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.business_users(id);


--
-- Name: workforce_rate_cards workforce_rate_cards_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_rate_cards
    ADD CONSTRAINT workforce_rate_cards_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.business_users(id);


--
-- Name: workforce_rate_cards workforce_rate_cards_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_rate_cards
    ADD CONSTRAINT workforce_rate_cards_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.business_users(id) ON DELETE RESTRICT;


--
-- Name: objects objects_bucket_id_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: -
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: account_request_rate_limits; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.account_request_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac01_role_default_events; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.rbac01_role_default_events ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac01_role_default_versions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.rbac01_role_default_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac02_account_permission_versions; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.rbac02_account_permission_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac_permission_catalog; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.rbac_permission_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac_runtime_gate; Type: ROW SECURITY; Schema: private; Owner: -
--

ALTER TABLE private.rbac_runtime_gate ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings Settings are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Settings are readable by authenticated users" ON public.system_settings FOR SELECT TO authenticated USING (true);


--
-- Name: account_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_photo_drive_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_photo_drive_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log_reviews audit_log_reviews_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_log_reviews_read ON public.audit_log_reviews FOR SELECT TO authenticated USING ((( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT TO authenticated USING ((private.rbac_has_permission('audit.view'::text) OR (private.rbac_has_permission('audit.view_team'::text) AND (module = ANY (ARRAY['calendar'::text, 'live'::text, 'reports'::text, 'campaigns'::text, 'swaps'::text, 'imports'::text])))));


--
-- Name: brand01_user_brand_access brand01_access_own_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_access_own_read ON public.brand01_user_brand_access FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (user_id = private.current_business_user_id()) AND (revoked_at IS NULL) AND ((expires_at IS NULL) OR (expires_at > statement_timestamp()))));


--
-- Name: brand01_campaign_product_skus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_campaign_product_skus ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_campaign_schemes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_campaign_schemes ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_campaign_product_skus brand01_campaign_skus_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_campaign_skus_admin_insert ON public.brand01_campaign_product_skus FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id())));


--
-- Name: brand01_campaign_product_skus brand01_campaign_skus_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_campaign_skus_read ON public.brand01_campaign_product_skus FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (EXISTS ( SELECT 1
   FROM ((public.campaigns c
     JOIN public.brand01_product_skus s ON ((s.id = brand01_campaign_product_skus.sku_id)))
     JOIN public.brand01_products p ON ((p.id = s.product_id)))
  WHERE ((c.id = brand01_campaign_product_skus.campaign_id) AND (c.deleted_at IS NULL) AND (c.archived_at IS NULL) AND (c.brand_id IN ( SELECT pb.brand_id
           FROM public.brand01_product_brands pb
          WHERE ((pb.product_id = p.id) AND pb.is_active))) AND (private.is_admin() OR private.brand01_can_read_brand(c.brand_id)))))));


--
-- Name: brand01_catalog_audit_events brand01_catalog_audit_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_catalog_audit_admin_read ON public.brand01_catalog_audit_events FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: brand01_catalog_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_catalog_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_product_knowledge_versions brand01_knowledge_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_knowledge_admin_insert ON public.brand01_product_knowledge_versions FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id())));


--
-- Name: brand01_product_knowledge_versions brand01_knowledge_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_knowledge_read ON public.brand01_product_knowledge_versions FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (private.is_admin() OR private.brand01_has_current_knowledge_approval(id))));


--
-- Name: brand01_knowledge_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_knowledge_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_knowledge_reviews_admin_insert ON public.brand01_knowledge_reviews FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (reviewer_id = private.current_business_user_id())));


--
-- Name: brand01_knowledge_reviews brand01_knowledge_reviews_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_knowledge_reviews_admin_read ON public.brand01_knowledge_reviews FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: brand01_product_platform_skus brand01_platform_skus_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_platform_skus_admin_insert ON public.brand01_product_platform_skus FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id())));


--
-- Name: brand01_product_platform_skus brand01_platform_skus_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_platform_skus_admin_update ON public.brand01_product_platform_skus FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: brand01_product_platform_skus brand01_platform_skus_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_platform_skus_read ON public.brand01_product_platform_skus FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (EXISTS ( SELECT 1
   FROM ((public.brand01_product_skus s
     JOIN public.brand01_products p ON ((p.id = s.product_id)))
     JOIN public.brand01_product_brands pb ON ((pb.product_id = p.id)))
  WHERE ((s.id = brand01_product_platform_skus.sku_id) AND pb.is_active AND (private.is_admin() OR ((p.lifecycle_status = 'active'::text) AND private.brand01_can_read_brand(pb.brand_id))))))));


--
-- Name: brand01_product_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_product_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_product_brands brand01_product_brands_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_product_brands_admin_insert ON public.brand01_product_brands FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id()) AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_product_brands brand01_product_brands_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_product_brands_admin_update ON public.brand01_product_brands FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_product_brands brand01_product_brands_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_product_brands_read ON public.brand01_product_brands FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND is_active AND private.brand01_can_read_brand(brand_id)));


--
-- Name: brand01_product_knowledge_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_product_knowledge_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_product_platform_skus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_product_platform_skus ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_product_resource_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_product_resource_links ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_product_skus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_product_skus ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_products ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_products brand01_products_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_products_admin_insert ON public.brand01_products FOR INSERT TO authenticated WITH CHECK ((private.current_business_user_is_active() AND private.is_admin() AND (created_by = private.current_business_user_id()) AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_products brand01_products_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_products_admin_update ON public.brand01_products FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_products brand01_products_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_products_read ON public.brand01_products FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (private.is_admin() OR ((lifecycle_status = 'active'::text) AND (archived_at IS NULL) AND (EXISTS ( SELECT 1
   FROM public.brand01_product_brands pb
  WHERE ((pb.product_id = brand01_products.id) AND pb.is_active AND private.brand01_can_read_brand(pb.brand_id))))))));


--
-- Name: brand01_product_resource_links brand01_resource_link_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_resource_link_admin_insert ON public.brand01_product_resource_links FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id())));


--
-- Name: brand01_product_resource_links brand01_resource_link_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_resource_link_read ON public.brand01_product_resource_links FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (EXISTS ( SELECT 1
   FROM public.storage_resources r
  WHERE ((r.id = brand01_product_resource_links.resource_id) AND r.is_active AND (r.resource_type <> 'attendance_evidence'::text)))) AND (private.is_admin() OR ((product_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM (public.brand01_products p
     JOIN public.brand01_product_brands pb ON ((pb.product_id = p.id)))
  WHERE ((p.id = pb.product_id) AND (p.lifecycle_status = 'active'::text) AND (p.archived_at IS NULL) AND pb.is_active AND private.brand01_can_read_brand(pb.brand_id))))) OR ((sku_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM ((public.brand01_product_skus s
     JOIN public.brand01_products p ON ((p.id = s.product_id)))
     JOIN public.brand01_product_brands pb ON ((pb.product_id = p.id)))
  WHERE ((s.id = brand01_product_resource_links.sku_id) AND (s.lifecycle_status = 'active'::text) AND (p.lifecycle_status = 'active'::text) AND (p.archived_at IS NULL) AND pb.is_active AND private.brand01_can_read_brand(pb.brand_id))))) OR ((campaign_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = brand01_product_resource_links.campaign_id) AND (c.archived_at IS NULL) AND (c.deleted_at IS NULL) AND private.brand01_can_read_brand(c.brand_id))))))));


--
-- Name: brand01_campaign_schemes brand01_schemes_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_schemes_admin_insert ON public.brand01_campaign_schemes FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id()) AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_campaign_schemes brand01_schemes_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_schemes_admin_update ON public.brand01_campaign_schemes FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_campaign_schemes brand01_schemes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_schemes_read ON public.brand01_campaign_schemes FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (private.is_admin() OR ((status = 'approved'::text) AND (valid_from <= statement_timestamp()) AND (valid_to > statement_timestamp()) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE ((c.id = brand01_campaign_schemes.campaign_id) AND private.brand01_can_read_brand(c.brand_id))))))));


--
-- Name: brand01_product_skus brand01_skus_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_skus_admin_insert ON public.brand01_product_skus FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id()) AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_product_skus brand01_skus_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_skus_admin_update ON public.brand01_product_skus FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (updated_by = private.current_business_user_id())));


--
-- Name: brand01_product_skus brand01_skus_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_skus_read ON public.brand01_product_skus FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (private.is_admin() OR ((lifecycle_status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM public.brand01_products p
  WHERE ((p.id = brand01_product_skus.product_id) AND (p.lifecycle_status = 'active'::text) AND (p.archived_at IS NULL) AND (EXISTS ( SELECT 1
           FROM public.brand01_product_brands pb
          WHERE ((pb.product_id = p.id) AND pb.is_active AND private.brand01_can_read_brand(pb.brand_id)))))))))));


--
-- Name: brand01_user_brand_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand01_user_brand_access ENABLE ROW LEVEL SECURITY;

--
-- Name: brand01_user_brand_access brand01_user_brand_access_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_user_brand_access_admin_insert ON public.brand01_user_brand_access FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (granted_by = private.current_business_user_id())));


--
-- Name: brand01_user_brand_access brand01_user_brand_access_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_user_brand_access_admin_read ON public.brand01_user_brand_access FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: brand01_user_brand_access brand01_user_brand_access_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brand01_user_brand_access_admin_update ON public.brand01_user_brand_access FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (revoked_by = private.current_business_user_id())));


--
-- Name: brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

--
-- Name: brands brands_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_admin_insert ON public.brands FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: brands brands_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_admin_select ON public.brands FOR SELECT TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: brands brands_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_admin_update ON public.brands FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: brands brands_shared_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY brands_shared_select ON public.brands FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (archived_at IS NULL) AND (deleted_at IS NULL)));


--
-- Name: business_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_users ENABLE ROW LEVEL SECURITY;

--
-- Name: business_users business_users_active_directory_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_users_active_directory_select ON public.business_users FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (status = 'active'::text) AND (account_status = 'active'::text) AND (archived_at IS NULL) AND (deleted_at IS NULL) AND ((private.current_system_permission() = 'admin'::text) OR (id = private.current_business_user_id()) OR ((private.current_system_permission() = 'leader'::text) AND (EXISTS ( SELECT 1
   FROM public.shifts shift
  WHERE ((shift.deleted_at IS NULL) AND (shift.archived_at IS NULL) AND private.rc19_has_any_leader_brand_scope(shift.brand_id, ARRAY['shifts.read'::text, 'shifts.manage'::text, 'staff.read'::text, 'staff.manage'::text, 'workforce.read'::text]) AND ((((business_users.id = shift.host_id) OR (business_users.id = shift.support_id)) OR (business_users.id = shift.technical_id)) OR (EXISTS ( SELECT 1
           FROM public.shift_registrations registration
          WHERE ((registration.shift_id = shift.id) AND (registration.user_id = business_users.id) AND (registration.status = ANY (ARRAY['pending'::text, 'approved'::text, 'manually_assigned'::text])))))))))))));


--
-- Name: business_users business_users_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY business_users_admin_all ON public.business_users TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_admin_insert ON public.campaigns FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaigns campaigns_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_admin_select ON public.campaigns FOR SELECT TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaigns campaigns_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_admin_update ON public.campaigns FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: campaigns campaigns_leader_operational_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_leader_operational_update ON public.campaigns FOR UPDATE TO authenticated USING (((( SELECT private.current_system_permission() AS current_system_permission) = 'leader'::text) AND (archived_at IS NULL) AND (deleted_at IS NULL))) WITH CHECK (((( SELECT private.current_system_permission() AS current_system_permission) = 'leader'::text) AND (archived_at IS NULL) AND (deleted_at IS NULL)));


--
-- Name: campaigns campaigns_shared_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_shared_select ON public.campaigns FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (archived_at IS NULL) AND (deleted_at IS NULL)));


--
-- Name: dashboard_updates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_updates ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_updates dashboard_updates_scoped_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dashboard_updates_scoped_read ON public.dashboard_updates FOR SELECT TO authenticated USING (( SELECT private.can_read_shift(dashboard_updates.shift_id) AS can_read_shift));


--
-- Name: live_report_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.live_report_images ENABLE ROW LEVEL SECURITY;

--
-- Name: live_report_images live_report_images_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY live_report_images_read ON public.live_report_images FOR SELECT TO authenticated USING (((report_id IS NOT NULL) AND private.can_read_report(report_id)));


--
-- Name: media_viewer_grants media_grant_select_exact_subject; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_grant_select_exact_subject ON public.media_viewer_grants FOR SELECT TO authenticated USING (((auth_user_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ( SELECT private.can_read_shift(media_viewer_grants.shift_id) AS can_read_shift)));


--
-- Name: media_stream_routes media_route_select_granted_shift; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY media_route_select_granted_shift ON public.media_stream_routes FOR SELECT TO authenticated USING ((active AND ( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (EXISTS ( SELECT 1
   FROM (public.media_viewer_grants g
     JOIN public.shifts s ON ((s.id = g.shift_id)))
  WHERE ((g.auth_user_id = ( SELECT auth.uid() AS uid)) AND g.active AND (statement_timestamp() >= g.valid_from) AND (statement_timestamp() < g.valid_until) AND (s.id = media_stream_routes.active_shift_id) AND (s.brand_id = media_stream_routes.brand_id) AND (s.platform_id = media_stream_routes.platform_id) AND (s.studio = media_stream_routes.studio) AND (s.status = 'live'::text) AND (s.deleted_at IS NULL) AND (s.archived_at IS NULL) AND (statement_timestamp() >= (s.start_at - '00:15:00'::interval)) AND (statement_timestamp() <= (s.end_at + '00:15:00'::interval)) AND ( SELECT private.can_read_shift(s.id) AS can_read_shift))))));


--
-- Name: media_stream_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_stream_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: media_viewer_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.media_viewer_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((recipient_id = ( SELECT private.current_business_user_id() AS current_business_user_id)) OR (user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: operational_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_files ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_schedule_source_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_schedule_source_files ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_storage_domain_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_storage_domain_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_storage_drive_probe_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_storage_drive_probe_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_storage_drive_probe_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_storage_drive_probe_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_storage_folder_locks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_storage_folder_locks ENABLE ROW LEVEL SECURITY;

--
-- Name: operational_storage_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operational_storage_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: platforms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;

--
-- Name: platforms platforms_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platforms_admin_insert ON public.platforms FOR INSERT TO authenticated WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: platforms platforms_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platforms_admin_select ON public.platforms FOR SELECT TO authenticated USING (( SELECT private.is_admin() AS is_admin));


--
-- Name: platforms platforms_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platforms_admin_update ON public.platforms FOR UPDATE TO authenticated USING (( SELECT private.is_admin() AS is_admin)) WITH CHECK (( SELECT private.is_admin() AS is_admin));


--
-- Name: platforms platforms_shared_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY platforms_shared_select ON public.platforms FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (archived_at IS NULL) AND (deleted_at IS NULL)));


--
-- Name: rc19_leader_brand_scope_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rc19_leader_brand_scope_events ENABLE ROW LEVEL SECURITY;

--
-- Name: rc19_leader_brand_scope_events rc19_leader_brand_scope_events_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc19_leader_brand_scope_events_admin_read ON public.rc19_leader_brand_scope_events FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text)));


--
-- Name: rc19_leader_brand_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rc19_leader_brand_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: rc19_leader_brand_scopes rc19_leader_brand_scopes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rc19_leader_brand_scopes_read ON public.rc19_leader_brand_scopes FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text) OR (leader_business_user_id = ( SELECT private.current_business_user_id() AS current_business_user_id)))));


--
-- Name: rc19_report_artifact_deletion_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rc19_report_artifact_deletion_events ENABLE ROW LEVEL SECURITY;

--
-- Name: rc19_report_artifact_deletions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rc19_report_artifact_deletions ENABLE ROW LEVEL SECURITY;

--
-- Name: rc19_report_export_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rc19_report_export_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: report_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_images ENABLE ROW LEVEL SECURITY;

--
-- Name: report_images report_images_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_images_read ON public.report_images FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND private.can_read_report(report_id)));


--
-- Name: report_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: report_revisions report_revisions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_revisions_read ON public.report_revisions FOR SELECT TO authenticated USING (private.can_read_report(report_id));


--
-- Name: reports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

--
-- Name: reports reports_active_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_active_select ON public.reports FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND (deleted_at IS NULL) AND (archived_at IS NULL) AND private.can_read_report(id)));


--
-- Name: reports reports_archived_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reports_archived_select ON public.reports FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((deleted_at IS NOT NULL) OR (archived_at IS NOT NULL)) AND (( SELECT private.current_system_permission() AS current_system_permission) = 'admin'::text) AND private.can_read_report(id)));


--
-- Name: schedule_import_batch_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_import_batch_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_import_batch_rows schedule_import_batch_rows_leader_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_import_batch_rows_leader_select ON public.schedule_import_batch_rows FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ( SELECT private.is_leader_or_admin() AS is_leader_or_admin)));


--
-- Name: schedule_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.schedule_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: schedule_import_batches schedule_import_batches_leader_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY schedule_import_batches_leader_select ON public.schedule_import_batches FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ( SELECT private.is_leader_or_admin() AS is_leader_or_admin)));


--
-- Name: self_attendance_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.self_attendance_events ENABLE ROW LEVEL SECURITY;

--
-- Name: self_attendance_photo_evidence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.self_attendance_photo_evidence ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_operational_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_operational_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_operational_notes shift_operational_notes_select_policy; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_operational_notes_select_policy ON public.shift_operational_notes FOR SELECT TO authenticated USING (((deleted_at IS NULL) AND private.can_read_shift_operational_notes(shift_id)));


--
-- Name: shift_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shift_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: shift_registrations shift_registrations_scoped_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shift_registrations_scoped_select ON public.shift_registrations FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ( SELECT private.can_read_shift(shift_registrations.shift_id) AS can_read_shift) AND (( SELECT private.is_leader_or_admin() AS is_leader_or_admin) OR (user_id = ( SELECT private.current_business_user_id() AS current_business_user_id)))));


--
-- Name: shifts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

--
-- Name: shifts shifts_scoped_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shifts_scoped_select ON public.shifts FOR SELECT TO authenticated USING (( SELECT private.can_read_shift(shifts.id) AS can_read_shift));


--
-- Name: storage_resource_audit_events storage_resource_audit_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_audit_admin_read ON public.storage_resource_audit_events FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: storage_resource_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_resource_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_resource_edit_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_resource_edit_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_edit_grants_admin_insert ON public.storage_resource_edit_grants FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (granted_by = private.current_business_user_id())));


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_edit_grants_admin_read ON public.storage_resource_edit_grants FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: storage_resource_edit_grants storage_resource_edit_grants_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_edit_grants_admin_update ON public.storage_resource_edit_grants FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: storage_resource_user_grants storage_resource_grants_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_grants_admin_insert ON public.storage_resource_user_grants FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (granted_by = private.current_business_user_id())));


--
-- Name: storage_resource_user_grants storage_resource_grants_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_grants_admin_read ON public.storage_resource_user_grants FOR SELECT TO authenticated USING (private.is_admin());


--
-- Name: storage_resource_user_grants storage_resource_grants_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_grants_admin_update ON public.storage_resource_user_grants FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: storage_resource_scopes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_resource_scopes ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_resource_scopes storage_resource_scopes_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_scopes_admin_insert ON public.storage_resource_scopes FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id())));


--
-- Name: storage_resource_scopes storage_resource_scopes_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_scopes_admin_update ON public.storage_resource_scopes FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK (private.is_admin());


--
-- Name: storage_resource_scopes storage_resource_scopes_read_allowed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resource_scopes_read_allowed ON public.storage_resource_scopes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.storage_resources r
  WHERE (r.id = storage_resource_scopes.resource_id))));


--
-- Name: storage_resource_user_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_resource_user_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_resources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.storage_resources ENABLE ROW LEVEL SECURITY;

--
-- Name: storage_resources storage_resources_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resources_admin_insert ON public.storage_resources FOR INSERT TO authenticated WITH CHECK ((private.is_admin() AND (created_by = private.current_business_user_id()) AND (updated_by = private.current_business_user_id())));


--
-- Name: storage_resources storage_resources_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resources_admin_update ON public.storage_resources FOR UPDATE TO authenticated USING (private.is_admin()) WITH CHECK ((private.is_admin() AND (updated_by = private.current_business_user_id())));


--
-- Name: storage_resources storage_resources_read_allowed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY storage_resources_read_allowed ON public.storage_resources FOR SELECT TO authenticated USING ((private.current_business_user_is_active() AND (private.is_admin() OR (is_active AND (visibility = 'public'::text)) OR (is_active AND (visibility = ANY (ARRAY['owner_only'::text, 'granted_users'::text])) AND (owner_id = private.current_business_user_id())) OR (is_active AND (visibility = 'granted_users'::text) AND private.current_user_has_storage_resource_grant(id)))));


--
-- Name: stored_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stored_files ENABLE ROW LEVEL SECURITY;

--
-- Name: swap_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.swap_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: swap_requests swap_requests_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY swap_requests_select ON public.swap_requests FOR SELECT TO authenticated USING ((( SELECT private.current_business_user_is_active() AS current_business_user_is_active) AND ((requester_id = ( SELECT private.current_business_user_id() AS current_business_user_id)) OR (counterpart_id = ( SELECT private.current_business_user_id() AS current_business_user_id)) OR (replacement_staff_id = ( SELECT private.current_business_user_id() AS current_business_user_id)) OR ( SELECT private.is_leader_or_admin() AS is_leader_or_admin))));


--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_actual_segments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_actual_segments ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_attendance_import_batches workforce_attendance_batches_admin_leader; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workforce_attendance_batches_admin_leader ON public.workforce_attendance_import_batches TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.business_users bu
  WHERE ((bu.auth_user_id = auth.uid()) AND (bu.system_permission = ANY (ARRAY['admin'::text, 'leader'::text])) AND (bu.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.business_users bu
  WHERE ((bu.auth_user_id = auth.uid()) AND (bu.system_permission = ANY (ARRAY['admin'::text, 'leader'::text])) AND (bu.status = 'active'::text)))));


--
-- Name: workforce_attendance_import_batches workforce_attendance_batches_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workforce_attendance_batches_service_role ON public.workforce_attendance_import_batches TO service_role USING (true) WITH CHECK (true);


--
-- Name: workforce_attendance_import_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_attendance_import_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_attendance_import_rows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_attendance_import_rows ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_attendance_import_rows workforce_attendance_rows_admin_leader; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workforce_attendance_rows_admin_leader ON public.workforce_attendance_import_rows TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.business_users bu
  WHERE ((bu.auth_user_id = auth.uid()) AND (bu.system_permission = ANY (ARRAY['admin'::text, 'leader'::text])) AND (bu.status = 'active'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.business_users bu
  WHERE ((bu.auth_user_id = auth.uid()) AND (bu.system_permission = ANY (ARRAY['admin'::text, 'leader'::text])) AND (bu.status = 'active'::text)))));


--
-- Name: workforce_attendance_import_rows workforce_attendance_rows_service_role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workforce_attendance_rows_service_role ON public.workforce_attendance_import_rows TO service_role USING (true) WITH CHECK (true);


--
-- Name: workforce_payroll_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_payroll_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_payroll_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_payroll_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_payroll_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_payroll_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: workforce_rate_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workforce_rate_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: buckets; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

--
-- Name: objects live dashboard image delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "live dashboard image delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'live-dashboard-images'::text) AND (( SELECT private.is_leader_or_admin() AS is_leader_or_admin) OR (EXISTS ( SELECT 1
   FROM public.dashboard_updates update_row
  WHERE ((update_row.screenshot_storage_path = objects.name) AND (update_row.created_by = ( SELECT private.current_business_user_id() AS current_business_user_id))))))));


--
-- Name: objects live dashboard image public read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "live dashboard image public read" ON storage.objects FOR SELECT USING ((bucket_id = 'live-dashboard-images'::text));


--
-- Name: objects live dashboard image scoped read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "live dashboard image scoped read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'live-dashboard-images'::text) AND (EXISTS ( SELECT 1
   FROM public.dashboard_updates update_row
  WHERE ((update_row.screenshot_storage_path = objects.name) AND (update_row.deleted_at IS NULL) AND ( SELECT private.can_read_shift(update_row.shift_id) AS can_read_shift))))));


--
-- Name: objects live dashboard image upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "live dashboard image upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'live-dashboard-images'::text) AND (split_part(name, '/'::text, 1) = 'dashboard'::text) AND (EXISTS ( SELECT 1
   FROM public.shifts shift
  WHERE ((shift.id = split_part(objects.name, '/'::text, 2)) AND (shift.status = ANY (ARRAY['preparing'::text, 'live'::text, 'paused'::text])) AND (shift.deleted_at IS NULL) AND (shift.archived_at IS NULL)))) AND ( SELECT private.can_read_shift(split_part(objects.name, '/'::text, 2)) AS can_read_shift)));


--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: -
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: objects profile avatars delete own; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "profile avatars delete own" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'profile-avatars'::text) AND (split_part(name, '/'::text, 1) = 'profiles'::text) AND (EXISTS ( SELECT 1
   FROM public.business_users business_user
  WHERE ((business_user.id = split_part(objects.name, '/'::text, 2)) AND (business_user.auth_user_id = ( SELECT auth.uid() AS uid)) AND (business_user.status = 'active'::text) AND (business_user.account_status = 'active'::text) AND (business_user.archived_at IS NULL) AND (business_user.deleted_at IS NULL))))));


--
-- Name: objects profile avatars public read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "profile avatars public read" ON storage.objects FOR SELECT USING ((bucket_id = 'profile-avatars'::text));


--
-- Name: objects profile avatars replace own; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "profile avatars replace own" ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'profile-avatars'::text) AND (split_part(name, '/'::text, 1) = 'profiles'::text) AND (EXISTS ( SELECT 1
   FROM public.business_users business_user
  WHERE ((business_user.id = split_part(objects.name, '/'::text, 2)) AND (business_user.auth_user_id = ( SELECT auth.uid() AS uid)) AND (business_user.status = 'active'::text) AND (business_user.account_status = 'active'::text) AND (business_user.archived_at IS NULL) AND (business_user.deleted_at IS NULL)))))) WITH CHECK (((bucket_id = 'profile-avatars'::text) AND (split_part(name, '/'::text, 1) = 'profiles'::text) AND (split_part(name, '/'::text, 3) = 'avatar'::text)));


--
-- Name: objects profile avatars upload own; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "profile avatars upload own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'profile-avatars'::text) AND (split_part(name, '/'::text, 1) = 'profiles'::text) AND (EXISTS ( SELECT 1
   FROM public.business_users business_user
  WHERE ((business_user.id = split_part(objects.name, '/'::text, 2)) AND (business_user.auth_user_id = ( SELECT auth.uid() AS uid)) AND (business_user.status = 'active'::text) AND (business_user.account_status = 'active'::text) AND (business_user.archived_at IS NULL) AND (business_user.deleted_at IS NULL)))) AND (split_part(name, '/'::text, 3) = 'avatar'::text)));


--
-- Name: objects report-images-authenticated-read; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "report-images-authenticated-read" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'report-images'::text) AND (split_part(name, '/'::text, 1) = ANY (ARRAY['reports'::text, 'live'::text])) AND private.can_read_report(split_part(name, '/'::text, 2))));


--
-- Name: objects report-images-delete; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "report-images-delete" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'report-images'::text) AND ((owner_id = (( SELECT auth.uid() AS uid))::text) OR ( SELECT private.is_leader_or_admin() AS is_leader_or_admin))));


--
-- Name: objects report-images-upload; Type: POLICY; Schema: storage; Owner: -
--

CREATE POLICY "report-images-upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'report-images'::text) AND (( SELECT private.current_business_user_id() AS current_business_user_id) IS NOT NULL) AND (((split_part(name, '/'::text, 1) = 'reports'::text) AND (EXISTS ( SELECT 1
   FROM public.reports report
  WHERE ((report.id = split_part(objects.name, '/'::text, 2)) AND (report.deleted_at IS NULL) AND (report.archived_at IS NULL) AND (( SELECT private.is_leader_or_admin() AS is_leader_or_admin) OR (report.submitted_by = ( SELECT private.current_business_user_id() AS current_business_user_id))))))) OR ((split_part(name, '/'::text, 1) = 'live'::text) AND (EXISTS ( SELECT 1
   FROM public.reports report
  WHERE ((report.id = split_part(objects.name, '/'::text, 2)) AND (report.deleted_at IS NULL) AND (report.archived_at IS NULL) AND (( SELECT private.is_leader_or_admin() AS is_leader_or_admin) OR (report.submitted_by = ( SELECT private.current_business_user_id() AS current_business_user_id))))))))));


--
-- PostgreSQL database dump complete
--

\unrestrict pK9EeTlgjww1zADtOjtbQEiwi929xZrJIFNZa7SuyGNKDfRDOkafISWFRI9fAJL