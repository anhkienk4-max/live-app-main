# INTEGRATION MIGRATION COMPATIBILITY REPORT

**Project:** OPS Livestream Platform — APP OPS  
**Staging Reference:** `amagnzebmmuqiptmrjmc`  
**Production Reference:** `egdjnpmoasarrttvhgds`  
**Branch:** `integration/rc14-frontend14wave-convergence`  
**Integration Verified HEAD:** `6d2ab1fc441a7add078d379960282bd0c6a8eec7`  
**Date:** 2026-10-10  

---

## 1. Schema Drift & Environment Realities

Based on verified database state inspection across Supabase Staging and Production:

| Object / Migration | STAGING (`amagnzeb...`) | PRODUCTION (`egdjnp...`) | Compatibility Assessment |
| :--- | :---: | :---: | :--- |
| `20260919074349_rc12_report_file_provider` | **APPLIED** | **MISSING** | Production lacks file provider columns (`google_drive`, `onedrive`) on report tables. |
| `20260924000000_rc13a_execution_source` | **APPLIED** | **MISSING** | Production lacks `shifts.execution_source` and `operational_storage_routes`. |
| `20260925000000_p0_swap_lock_hardening` | **APPLIED** | **MISSING** | Production lacks atomic participant lock set hardening. |
| `20260928000000_p1_report_revision_history` | **APPLIED** | **MISSING** | Production lacks immutable report audit snapshot triggers. |
| `20261006160000_rc14_live_image_storage_contract` | **PENDING PREFLIGHT** | **APPLIED** | Production already has additive storage columns (`storage_file_name`, `storage_idempotency_key`). |
| `20261007183831_rc14_report_data_artifacts` | **PENDING PREFLIGHT** | **MISSING** | Staging and Production both lack the `stored_files` metadata index table. |
| Function: `upsert_live_report_image_with_provider` | **EXISTS** | **DOES NOT EXIST** | Production only has `upsert_live_report_image(jsonb)`. |

---

## 2. Gate D Preflight Audit: Missing Staging Migrations

STAGING (`amagnzebmmuqiptmrjmc`) is missing two RC14 migrations currently checked into the integration branch:
1. `20261006160000_rc14_live_image_storage_contract.sql`
2. `20261007183831_rc14_report_data_artifacts.sql`

### Migration 1: `20261006160000_rc14_live_image_storage_contract.sql`
- **Objects Affected:**
  - Table: `public.live_report_images`
  - Columns Added: `storage_file_name text`, `storage_idempotency_key text` (both nullable)
  - Index: `live_report_images_storage_idempotency_key` (partial unique index on `(report_id, storage_idempotency_key)` where `storage_idempotency_key is not null`)
  - Constraint: `live_report_images_storage_metadata_check` (validates category prefix format `^(key_visual|live_session|other):[a-f0-9]{64}$`)
  - Trigger & Function: `private.sync_live_image_storage_category()` before update of category
  - RPC: `public.upsert_live_report_image(p_data jsonb)` (security definer, grants execute to `authenticated`)
  - Conditional Wrapper: `public.upsert_live_report_image_with_provider(p_data jsonb)` (dynamically updated only if the procedure exists)
- **Data Preservation Assessment:**
  - Fully backward compatible: existing rows retain `NULL` for storage metadata without constraint failure.
  - Safe transactional boundaries (`begin; ... commit;`).
  - No dropped columns or tables; no lock escalation risks.

### Migration 2: `20261007183831_rc14_report_data_artifacts.sql`
- **Objects Affected:**
  - New Table: `public.stored_files`
  - Columns: `id text primary key`, `provider text`, `external_file_id text`, `logical_category text check (logical_category in ('data_report', 'data_source'))`, `folder_path`, `file_name`, `mime_type`, `size_bytes`, `checksum_sha256`, `artifact_key`, `report_id references reports(id) on delete cascade`, `shift_id references shifts(id) on delete cascade`, `created_at`, `updated_at`, `deleted_at`.
  - Indices:
    - `stored_files_active_artifact_key_idx` (`report_id`, `logical_category`, `artifact_key` where `deleted_at is null`)
    - `stored_files_active_provider_object_idx` (`provider`, `external_file_id` where `deleted_at is null`)
    - `stored_files_report_category_created_idx` (`report_id`, `logical_category`, `created_at desc` where `deleted_at is null`)
  - Security / RLS:
    - `alter table public.stored_files enable row level security;`
    - `revoke all on table public.stored_files from anon;`
    - `revoke all on table public.stored_files from authenticated;`
- **Data Preservation Assessment:**
  - Table creation uses `create table if not exists`.
  - Zero existing tables altered.
  - Strictly metadata index; binaries remain in provider storage.
  - Grants revoked by default to prevent client direct access; backend service role / security definer RPC only.

---

## 3. Operational Deployment Recommendation & Hold Status

### **CURRENT STATUS: PREFLIGHT PASS / HELD AWAITING OPERATIONAL APPROVAL**

Per strict operational instructions:
- **Neither migration has been applied to STAGING or PRODUCTION.**
- All code, triggers, constraints, dependencies, and rollback mechanisms have been audited and verified ready.

### Pre-requisites Before Executing Staging Apply:
1. Obtain explicit operator authorization to connect to Staging Supabase CLI (`amagnzebmmuqiptmrjmc`).
2. Run database snapshot / table dump of `live_report_images`, `reports`, and `shifts`.
3. Apply in exact chronological sequence:
   - Step 1: `20261006160000_rc14_live_image_storage_contract.sql`
   - Step 2: `20261007183831_rc14_report_data_artifacts.sql`
4. Verify Staging RPC introspection and idempotency constraints.
5. Re-run integration regression suite against Staging.
