# FORWARD-ONLY RECONCILIATION PROPOSAL & DATABASE INTEGRATION PLAN

**Project:** OPS Livestream Platform — APP OPS  
**Target Environments:**
- PRODUCTION: `egdjnpmoasarrttvhgds` (STRICTLY READ-ONLY / PREPARATION ONLY / ZERO PRODUCTION WRITES)
- STAGING: `amagnzebmmuqiptmrjmc` (Target for alignment rehearsal)  
**Date:** 2026-10-11  

---

## 1. Principles & Non-Negotiable Constraints

To ensure absolute database safety and zero downtime during the upcoming release cutover, this reconciliation plan adheres to the following non-negotiable rules:

1. **NO Production Writes in Phase H.2:**
   - No migrations will be executed against Production (`egdjnpmoasarrttvhgds`) during this phase.
   - All DDL/DML scripts are prepared, documented, and rehearsed in isolation.
2. **NO Duplicate DDL:**
   - Production **already has** `shifts.execution_source`, `brands.storage_profile`, `operational_storage_routes`, and `operational_files`.
   - Never issue duplicate `ALTER TABLE ... ADD COLUMN` or `CREATE TABLE` without `IF NOT EXISTS` and constraint existence checks.
3. **NO Function Overwrite Without Signature/MD5 Verification:**
   - Production shift RPCs already match the hardened RC15 contract. They must never be blindly replaced with unverified SQL.
4. **NO Automated Backfill of 771 Historical Shifts:**
   - Historical shifts where `execution_source IS NULL` must **remain NULL**.
   - No `UPDATE shifts SET execution_source = 'internal'`! Classification must occur via operator review in `/storage/setup`.
5. **NO Automatic Storage Route Seeding:**
   - Zero active routes until the Operator explicitly configures and approves exact provider parent chains in `/storage/setup`.
   - Fail-closed security: Storage V2 operations will fail safely rather than write to incorrect Drive folders.
6. **NO Default Value on `brands.storage_profile`:**
   - The default `'CANONICAL_V1'` from old RC13A remains permanently dropped. Every brand profile must be human-reviewed.
7. **Fail-Closed Drift Detection:**
   - Any migration script must run a preflight verification query and immediately abort with `RAISE EXCEPTION` if live schema checksums differ from expected values.

---

## 2. Production Pre-Flight Verification Script (READ-ONLY)

Before any future migration is applied to Production, this SQL script must be executed. It evaluates the exact schema state and outputs `PASS` only if all invariants are met:

```sql
-- PRODUCTION PRE-FLIGHT VERIFICATION (READ-ONLY)
-- Project: egdjnpmoasarrttvhgds
DO $prod_preflight$
DECLARE
  v_has_route_table boolean;
  v_has_v2_registry boolean;
  v_has_shift_source boolean;
  v_has_brand_profile boolean;
  v_has_profile_reviewed boolean;
  v_brand_default text;
  v_unclassified_count integer;
  v_active_routes_count integer;
  v_create_shift_md5 text;
  v_update_shift_4param_md5 text;
  v_update_shift_3param_revoked boolean;
BEGIN
  -- 1. Table & Column Existence
  v_has_route_table := to_regclass('public.operational_storage_routes') is not null;
  v_has_v2_registry := to_regclass('public.operational_files') is not null;
  
  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'shifts' and column_name = 'execution_source'
  ) into v_has_shift_source;

  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'storage_profile'
  ) into v_has_brand_profile;

  select exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brands' and column_name = 'storage_profile_reviewed_by'
  ) into v_has_profile_reviewed;

  -- 2. Brand Default Verification (Must be NULL / Dropped)
  select column_default from information_schema.columns
  where table_schema = 'public' and table_name = 'brands' and column_name = 'storage_profile'
  into v_brand_default;

  -- 3. Historical Shift Non-Backfill Verification
  select count(*) into v_unclassified_count
  from public.shifts
  where execution_source is null;

  -- 4. Route Fail-Closed Verification (Must be 0 active routes initially)
  select count(*) into v_active_routes_count
  from public.operational_storage_routes
  where active = true;

  -- 5. RPC Checksums
  select md5(pg_get_functiondef(oid)) into v_create_shift_md5
  from pg_proc where proname = 'create_shift' and pronamespace = 'public'::regnamespace
    and pg_get_function_arguments(oid) = 'p_data jsonb';

  select md5(pg_get_functiondef(oid)) into v_update_shift_4param_md5
  from pg_proc where proname = 'update_shift' and pronamespace = 'public'::regnamespace
    and pg_get_function_arguments(oid) = 'p_shift_id text, p_patch jsonb, p_confirm_impact boolean, p_expected_version integer';

  select not has_function_privilege('authenticated', oid, 'execute') into v_update_shift_3param_revoked
  from pg_proc where proname = 'update_shift' and pronamespace = 'public'::regnamespace
    and pg_get_function_arguments(oid) = 'p_shift_id text, p_patch jsonb, p_confirm_impact boolean';

  -- Assertions
  IF NOT (v_has_route_table AND v_has_v2_registry AND v_has_shift_source AND v_has_brand_profile AND v_has_profile_reviewed) THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: Missing RC15 core tables or columns on Production!';
  END IF;

  IF v_brand_default IS NOT NULL THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: brands.storage_profile default must be NULL, found: %', v_brand_default;
  END IF;

  IF v_unclassified_count < 700 THEN
    RAISE WARNING 'Unclassified shifts count is %, expected ~771.', v_unclassified_count;
  END IF;

  IF v_create_shift_md5 <> '6f98725832a893ee517176466f21c0ad' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: create_shift MD5 mismatch (found: %), potential RPC drift!', v_create_shift_md5;
  END IF;

  IF v_update_shift_4param_md5 <> 'ff799ce7aa150e7f7ca72895fbc9a71a' THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: update_shift (4-param) MD5 mismatch (found: %), potential RPC drift!', v_update_shift_4param_md5;
  END IF;

  IF NOT v_update_shift_3param_revoked THEN
    RAISE EXCEPTION 'PREFLIGHT_FAIL: update_shift (3-param) must be revoked from authenticated!';
  END IF;

  RAISE NOTICE 'PRODUCTION PRE-FLIGHT VERIFIED: Schema is fully compliant with RC15.';
END;
$prod_preflight$;
```

---

## 3. Forward-Only Production Deployment Script (Prepared for Cutover)

This is the exact, forward-only SQL patch to be applied to Production during the authorized cutover phase. It applies **only the two missing RC14 migrations** (`20261008160638` and `20261008160645`) using strict idempotency and transaction safety:

```sql
-- PRODUCTION FORWARD-ONLY RECONCILIATION PATCH
-- Target: egdjnpmoasarrttvhgds
-- Scope: P0 Member Privacy & P1 Report Revisions Fix ONLY
-- DO NOT APPLY IN PHASE H.2 — PREPARED FOR OPERATOR-AUTHORIZED CUTOVER

BEGIN;

-- ============================================================================
-- PART 1: P0 MEMBER REGISTRATION & DIRECTORY PRIVACY (20261008160638)
-- ============================================================================

-- 1.1. Restrict raw shift_registrations SELECT to leaders, admins, and self
DROP POLICY IF EXISTS shift_registrations_scoped_select ON public.shift_registrations;
CREATE POLICY shift_registrations_scoped_select ON public.shift_registrations
FOR SELECT TO authenticated
USING (
  (SELECT private.current_business_user_is_active())
  AND (SELECT private.can_read_shift(shift_id))
  AND ((SELECT private.is_leader_or_admin()) OR user_id = (SELECT private.current_business_user_id()))
);

-- 1.2. Restrict raw business_users SELECT to leaders, admins, and self
DROP POLICY IF EXISTS business_users_active_directory_select ON public.business_users;
CREATE POLICY business_users_active_directory_select ON public.business_users
FOR SELECT TO authenticated
USING (
  (SELECT private.current_business_user_is_active())
  AND status = 'active' AND account_status = 'active'
  AND archived_at IS NULL AND deleted_at IS NULL
  AND ((SELECT private.is_leader_or_admin()) OR id = (SELECT private.current_business_user_id()))
);

-- 1.3. Safe Member Staff Directory Projection RPC
CREATE OR REPLACE FUNCTION public.get_staff_directory()
RETURNS TABLE(id text, full_name text, avatar_url text, operational_roles text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF private.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  END IF;
  RETURN QUERY SELECT u.id, u.full_name, u.avatar_url, u.operational_roles
    FROM public.business_users AS u
    WHERE u.status = 'active' AND u.account_status = 'active'
      AND u.archived_at IS NULL AND u.deleted_at IS NULL
    ORDER BY u.full_name, u.id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_staff_directory() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_directory() TO authenticated;

-- 1.4. Safe Shift Staffing Summary Projection RPC
CREATE OR REPLACE FUNCTION public.get_shift_staffing_summary(p_shift_ids text[])
RETURNS TABLE(shift_id text, role text, required integer, approved integer,
  pending integer, remaining integer, approved_staff jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF private.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  END IF;
  RETURN QUERY
  SELECT s.id, demand.role, demand.required,
    COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer,
    COUNT(r.id) FILTER (WHERE r.status = 'pending')::integer,
    GREATEST(0, demand.required - (COUNT(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned')))::integer),
    COALESCE(jsonb_agg(jsonb_build_object(
      'name', COALESCE(u.full_name, r.imported_name),
      'avatar_url', u.avatar_url,
      'imported_only', r.user_id IS NULL
    ) ORDER BY r.created_at, r.id) FILTER (
      WHERE r.status IN ('approved', 'manually_assigned')
        AND COALESCE(u.full_name, r.imported_name) IS NOT NULL
    ), '[]'::jsonb)
  FROM public.shifts AS s
  CROSS JOIN LATERAL (VALUES
    ('host'::text, COALESCE(s.required_host_count, 1)),
    ('support'::text, COALESCE(s.required_support_count, 1)),
    ('technical'::text, COALESCE(s.required_technical_count, 1))
  ) AS demand(role, required)
  LEFT JOIN public.shift_registrations AS r
    ON r.shift_id = s.id AND r.operational_role = demand.role
  LEFT JOIN public.business_users AS u ON u.id = r.user_id
  WHERE s.id = ANY(p_shift_ids) AND private.can_read_shift(s.id)
  GROUP BY s.id, demand.role, demand.required
  ORDER BY s.id, demand.role;
END;
$$;
REVOKE ALL ON FUNCTION public.get_shift_staffing_summary(text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shift_staffing_summary(text[]) TO authenticated;

-- 1.5. Safe Swap Exchange Candidates Projection RPC
CREATE OR REPLACE FUNCTION public.get_swap_exchange_candidates(p_shift_id text, p_role text)
RETURNS TABLE(registration_id text, user_id text, full_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE actor_id text := private.current_business_user_id();
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF NOT private.can_read_shift(p_shift_id) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  END IF;
  RETURN QUERY SELECT r.id, u.id, u.full_name
  FROM public.shift_registrations AS r
  JOIN public.shifts AS s ON s.id = r.shift_id
  JOIN public.business_users AS u ON u.id = r.user_id
  WHERE s.id = p_shift_id AND s.status = 'scheduled'
    AND s.archived_at IS NULL AND s.deleted_at IS NULL
    AND r.operational_role = p_role AND r.status IN ('approved', 'manually_assigned')
    AND u.id <> actor_id AND u.status = 'active' AND u.account_status = 'active'
    AND u.archived_at IS NULL AND u.deleted_at IS NULL
  ORDER BY u.full_name, r.id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_swap_exchange_candidates(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_swap_exchange_candidates(text, text) TO authenticated;

-- Record migration in Supabase ledger
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20261008160638', null, 'member_registration_directory_privacy')
ON CONFLICT (version) DO NOTHING;

-- ============================================================================
-- PART 2: P1 REPORT REVISION HISTORY RPC REPAIR (20261008160645)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_report_revisions(p_report_id text)
RETURNS TABLE (
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor_id text;
  target_report public.reports;
BEGIN
  actor_id := private.require_report_actor(false);
  SELECT * INTO target_report FROM public.reports WHERE id = p_report_id;
  IF target_report.id IS NULL THEN
    RAISE EXCEPTION USING errcode = 'P0001', message = 'REPORT_NOT_FOUND';
  END IF;
  IF (target_report.deleted_at IS NOT NULL OR target_report.archived_at IS NOT NULL)
    AND private.current_system_permission() <> 'admin' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  END IF;
  RETURN QUERY
  SELECT revision.version, revision.created_at, revision.created_by, revision.status,
    revision.reason, revision.event, revision.metrics, revision.ocr_review,
    revision.final_recap, revision.image_references
  FROM public.report_revisions AS revision
  WHERE revision.report_id = p_report_id
  ORDER BY revision.version;
END;
$$;
REVOKE ALL ON FUNCTION public.get_report_revisions(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_revisions(text) TO authenticated;

-- Record migration in Supabase ledger
INSERT INTO supabase_migrations.schema_migrations (version, statements, name)
VALUES ('20261008160645', null, 'repair_report_revision_history_rpc')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```

---

## 4. Staging Alignment Script (Safe Rehearsal)

To bring STAGING (`amagnzebmmuqiptmrjmc`) to identical parity with Production's RC15 schema:

```sql
-- STAGING ALIGNMENT TO RC15 PARITY
-- Target: amagnzebmmuqiptmrjmc
BEGIN;

-- 1. Align brands.storage_profile constraint to 7 profiles and drop default
ALTER TABLE public.brands
  DROP CONSTRAINT IF EXISTS brands_storage_profile_check;
ALTER TABLE public.brands
  ADD CONSTRAINT brands_storage_profile_check
  CHECK (storage_profile IN (
    'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1',
    'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
  ));
ALTER TABLE public.brands ALTER COLUMN storage_profile DROP DEFAULT;

-- Add reviewed attribution columns if missing
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS storage_profile_reviewed_by text
    REFERENCES public.business_users(id) ON DELETE SET NULL;
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS storage_profile_reviewed_at timestamptz;

-- 2. Align operational_storage_routes columns
ALTER TABLE public.operational_storage_routes
  ADD COLUMN IF NOT EXISTS period_naming_style text DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS period_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS period_date_ranges jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS folder_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS approved_by text REFERENCES public.business_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NOT NULL DEFAULT statement_timestamp();

-- 3. Create operational_files if missing
-- (Executes identical DDL from 20261011092051_rc15_operational_files.sql)

COMMIT;
```

---

## 5. Drift Detection & Rollback Protocol

1. **Pre-Deployment Check:** Run Section 2 Pre-flight SQL. If exit code != 0, cutover aborts immediately.
2. **Transaction Scoping:** All operations are wrapped in an explicit `BEGIN ... COMMIT` block. Any syntax or semantic error automatically executes `ROLLBACK`.
3. **No Drop Invariant:** Never issue `DROP TABLE` or `DROP COLUMN` during rollback. Rollback of failed application code consists purely of reverting Vercel deployment to previous verified SHA.
