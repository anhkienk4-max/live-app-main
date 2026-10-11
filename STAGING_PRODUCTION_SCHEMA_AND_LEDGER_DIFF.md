# STAGING & PRODUCTION SCHEMA AND LEDGER DIFF

**Project:** OPS Livestream Platform — APP OPS  
**Evaluation:** Phase H.2 Architectural Audit (READ-ONLY)  
**Staging Project Ref:** `amagnzebmmuqiptmrjmc`  
**Production Project Ref:** `egdjnpmoasarrttvhgds`  
**Date:** 2026-10-11  

---

## 1. Executive Summary & Production State Verification

A thorough, read-only reconciliation was performed comparing the live database state, migration ledgers, table schemas, constraints, and RPC definitions across **Supabase STAGING** (`amagnzebmmuqiptmrjmc`) and **Supabase PRODUCTION** (`egdjnpmoasarrttvhgds`).

### Key Production Verification Findings:
1. **RC15 is ALREADY APPLIED on Production:**
   On 2026-10-11 morning, the Production database executed the three RC15 migrations:
   - `20261011091925_rc15_storage_route_prerequisites` (Applied)
   - `20261011092015_rc15_shift_rpc_compatibility` (Applied)
   - `20261011092051_rc15_operational_files` (Applied)
2. **Production Database Has Modern Storage V2 Foundation:**
   - Table `public.operational_storage_routes` exists with full period override and review attribution columns.
   - Table `public.operational_files` exists with SHA-256 and provider reference integrity checks.
   - Column `shifts.execution_source` exists with `check (execution_source in ('internal', 'agency'))`.
   - Column `brands.storage_profile` exists with 7 approved profiles and **NO default value**.
   - Review tracking columns `brands.storage_profile_reviewed_by` and `brands.storage_profile_reviewed_at` exist.
   - Core shift RPCs `create_shift` and `update_shift` accept `execution_source`.
3. **What Production is TRULY Missing:**
   Production is missing **ONLY TWO** migrations from RC14:
   - `20261008160638_member_registration_directory_privacy.sql` (P0 Member Privacy RLS & Directory Projections)
   - `20261008160645_repair_report_revision_history_rpc.sql` (P1 Report Revision History RPC repair)
4. **Replay Rule (NON-NEGOTIABLE):**
   **NEVER replay legacy RC13A (`20260924000000`) on Production.** Doing so would overwrite RC15 table definitions, restore invalid profile defaults (`'CANONICAL_V1'`), break the 7-profile constraint, and downgrade the MD5-guarded shift RPCs.

---

## 2. Migration Ledger Reconciliation Matrix

| Migration Version | Description | Status on STAGING (`amagnzeb...`) | Status on PRODUCTION (`egdjnp...`) | Notes & Compatibility Status |
| :--- | :--- | :---: | :---: | :--- |
| `20260916090000` | `report_expected_version_cas` | Applied | Applied | Common baseline. |
| `20260919074349` | `rc12_report_file_provider` | Applied | Superseded by RC14/RC15 | Do NOT replay on PROD; PROD already has provider columns. |
| `20260924000000` | `rc13a_execution_source_storage_routes` | Applied | **SUPERSEDED by RC15** | **DO NOT REPLAY ON PROD.** Replaced by `20261011091925` & `20261011092015`. |
| `20261006160000` | `rc14_live_image_storage_contract` | Applied (Phase 3) | Applied | Contains `upsert_live_report_image_with_provider` idempotency guard. |
| `20261007183831` | `rc14_report_data_artifacts` | Applied (Phase 3) | Applied | Creates `stored_files` metadata table. |
| `20261008160638` | `member_registration_directory_privacy` | Applied (Phase 3) | ❌ **MISSING (P0)** | Scoped RLS on registrations/users; safe staff directory projections. |
| `20261008160645` | `repair_report_revision_history_rpc` | Applied (Phase 3) | ❌ **MISSING (P1)** | Repaired `get_report_revisions` RPC. |
| `20261011091925` | `rc15_storage_route_prerequisites` | ⚠️ Needs Alignment | ✅ **APPLIED** | Drops brand profile default, adds 7 profiles, creates `operational_storage_routes`. |
| `20261011092015` | `rc15_shift_rpc_compatibility` | ⚠️ Needs Alignment | ✅ **APPLIED** | Guards current shift RPCs with MD5 check; adds `execution_source`. |
| `20261011092051` | `rc15_operational_files` | ❌ **MISSING** | ✅ **APPLIED** | Creates `operational_files` metadata index. |

---

## 3. Schema Objects Deep Audit: Production vs. Staging

### 3.1. `shifts.execution_source`
- **PRODUCTION:**
  - Data Type: `text` (nullable).
  - Default: `NULL`.
  - Constraint: `shifts_execution_source_check CHECK (execution_source in ('internal', 'agency'))`.
  - Historical Data: 771 historical shifts currently have `execution_source IS NULL`.
  - Strict Invariant: **NO automated bulk backfill**. Must remain NULL until explicit human Operator review.
- **STAGING:**
  - Added via RC13A with identical check constraint.

### 3.2. `brands.storage_profile` & Review Tracking
- **PRODUCTION:**
  - `storage_profile text null`
  - Constraint: `brands_storage_profile_check CHECK (storage_profile in ('LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD', 'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1', 'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'))` (7 profiles).
  - Column Default: **NONE** (`alter column storage_profile drop default;`).
  - `storage_profile_reviewed_by text references public.business_users(id) on delete set null`
  - `storage_profile_reviewed_at timestamptz`
- **STAGING:**
  - Currently has RC13A constraint (6 profiles, missing `'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'`).
  - Has default `'CANONICAL_V1'` (needs to be dropped to match Production).
  - Missing `storage_profile_reviewed_by` and `storage_profile_reviewed_at`.

### 3.3. `operational_storage_routes` Table
- **PRODUCTION:**
  - Exists. Created by `20261011091925_rc15_storage_route_prerequisites.sql`.
  - Primary Key: `id text default gen_random_uuid()::text`.
  - Foreign Keys: `brand_id REFERENCES brands(id) RESTRICT`, `platform_id REFERENCES platforms(id) RESTRICT`, `approved_by REFERENCES business_users(id) SET NULL`.
  - Additional Columns:
    - `period_naming_style text not null`
    - `period_label_overrides jsonb not null default '{}'::jsonb`
    - `period_date_ranges jsonb not null default '[]'::jsonb`
    - `folder_label_overrides jsonb not null default '{}'::jsonb`
    - `approved_at timestamptz not null default statement_timestamp()`
  - Unique Index: `operational_storage_routes_active_key_uidx UNIQUE (provider, execution_source, brand_id, platform_id, subbrand_key) NULLS NOT DISTINCT WHERE active`.
  - Security: RLS enabled. `REVOKE ALL ON operational_storage_routes FROM public, anon, authenticated;`.
  - Active Routes: Currently **0 active routes** (Fail-closed).
- **STAGING:**
  - Contains older RC13A version. Missing `period_label_overrides`, `period_date_ranges`, `folder_label_overrides`, `approved_by`, `approved_at`, and `NULLS NOT DISTINCT`.

### 3.4. `operational_files` Table
- **PRODUCTION:**
  - Exists. Created by `20261011092051_rc15_operational_files.sql`.
  - Supported Categories: 15 categories (`schedule_source`, `schedule_export`, `live_snapshot`, `video_recording`, `video_livecut`, `production_asset`, `content_script`, `content_brief`, `campaign_document`, `staffing_document`, `acceptance_document`, `payment_document`, `ai_output`, `system_export`, `sop_document`).
  - Integrity Contract:
    ```sql
    CONSTRAINT operational_files_integrity_contract CHECK (
      (integrity_status = 'sha256_verified' AND checksum_sha256 IS NOT NULL AND size_bytes > 0)
      OR (integrity_status = 'provider_reference' AND checksum_sha256 IS NULL)
    )
    ```
  - Indexes:
    - `operational_files_active_scope_checksum UNIQUE (scope_key, category, artifact_key) WHERE deleted_at IS NULL`
    - `operational_files_active_provider_object UNIQUE (provider, external_file_id) WHERE deleted_at IS NULL`
  - Security: RLS enabled. `REVOKE ALL ON operational_files FROM public, anon, authenticated;`.
- **STAGING:**
  - Missing. Needs application of `20261011092051` to achieve parity with Production.

### 3.5. `stored_files` Table
- **PRODUCTION:** Exists. Created by `20261007183831_rc14_report_data_artifacts.sql`.
- **STAGING:** Exists. Applied in Phase 3.

### 3.6. `report_images` & `live_report_images` Tables
- **PRODUCTION:**
  - Columns `provider` and `external_file_id` present.
  - Columns `storage_file_name` and `storage_idempotency_key` present (from `20261006160000`).
  - Triggers: Category sync trigger and idempotency triggers active.
- **STAGING:** Identical state (aligned during Phase 3).

---

## 4. RPC Signature & Permissions Audit

| Function Signature | PRODUCTION Definition | STAGING Definition | Risk & Parity Analysis |
| :--- | :--- | :--- | :--- |
| `create_shift(p_data jsonb)` | RC15 version: Accepts `execution_source` in allowlist; validates `internal`/`agency`; sets `registration_locked = false`. Granted to `authenticated`. | RC13A version. | Functionally compatible for basic creation, but PROD has strict MD5 verification history. |
| `update_shift(text, jsonb, boolean)` (3-param) | **REVOKED ALL from authenticated.** Pure legacy internal helper. | RC13A: unrevoked or legacy. | **PROD is more secure.** The 3-param overload lacks concurrency controls and is rightly disabled. |
| `update_shift(text, jsonb, boolean, integer)` (4-param) | RC15 version: Accepts `execution_source`; enforces `assert_expected_version`; `FOR UPDATE` row lock; granted to `authenticated`. | RC13A version. | **Aligned.** Both enforce optimistic concurrency. PROD has RC15 allowlist. |
| `upsert_live_report_image_with_provider(jsonb)` | RC14 version: Contains idempotency guard `if created_image.external_file_id is not null then return created_image; end if;`. | RC14 version (re-applied in Phase 3). | **CRITICAL:** Do NOT replay RC12 on PROD. That would wipe out this idempotency guard. |
| `get_staff_directory()` | ❌ **MISSING on PROD** | ✅ Present on STAGING | **P0 GAP:** Needs forward-only application of `20261008160638` on PROD. |
| `get_shift_staffing_summary(text[])` | ❌ **MISSING on PROD** | ✅ Present on STAGING | **P0 GAP:** Needs forward-only application of `20261008160638` on PROD. |
| `get_swap_exchange_candidates(text, text)` | ❌ **MISSING on PROD** | ✅ Present on STAGING | **P0 GAP:** Needs forward-only application of `20261008160638` on PROD. |
| `get_report_revisions(text)` | ❌ **Defective on PROD** (missing repair) | ✅ Repaired on STAGING | **P1 GAP:** Needs forward-only application of `20261008160645` on PROD. |

---

## 5. RLS Policies Audit

### Production Missing Policies (P0 Gaps):
1. `shift_registrations_scoped_select`:
   - Production currently allows any active user to select all `shift_registrations` rows, exposing applicant details.
   - Forward migration will restrict visibility to Leaders, Admins, or the applicant's own record.
2. `business_users_active_directory_select`:
   - Production currently allows members to read entire `business_users` records including private contact data.
   - Forward migration will restrict full record visibility to Leaders and Admins, directing regular members to use `get_staff_directory()`.

---

## 6. Synthesis: Exact Production Delta & Reconciliation Mandate

```
Production Current Baseline:
├── RC14 Data Artifacts (20261006160000, 20261007183831) [ALREADY APPLIED]
└── RC15 Storage Foundations (20261011091925, 20261011092015, 20261011092051) [ALREADY APPLIED]

Production Missing Scope (FORWARD-ONLY):
├── P0 Security: 20261008160638_member_registration_directory_privacy.sql
└── P1 Fix:      20261008160645_repair_report_revision_history_rpc.sql

STRICT FORBIDDEN ACTIONS ON PRODUCTION:
❌ DO NOT replay 20260919074349_rc12_report_file_provider.sql
❌ DO NOT replay 20260924000000_rc13a_execution_source_storage_routes.sql
❌ DO NOT re-add columns or re-create tables already existing from RC15
❌ DO NOT bulk update 771 unclassified shifts
❌ DO NOT set default 'CANONICAL_V1' on brands.storage_profile
❌ DO NOT auto-seed storage routes
```
