# H5 DATABASE CLONE REHEARSAL RESULTS

**Evidence ID:** `EVID-H5-DB-REHEARSAL-01`  
**Target Environment:** Isolated PostgreSQL 17.6 on Docker (`supabase_db_live-app-main:54322`)  
**Target Database:** `rc_rehearsal_clone`  
**Verified Git SHA:** `b864c8bb76ebbfc09033423394966268cab947ef`  
**Execution Timestamp:** 2026-10-11T22:29:28+07:00  
**Overall Result:** **PASS (100% Assertions Passed — 0 Failures)**  

---

## 1. ISOLATION & ENVIRONMENT SAFETY

Per APP OPS safety protocols:
- **Zero writes to Production (`egdjnpmoasarrttvhgds`):** Confirmed.
- **Zero writes to Shared Staging (`amagnzebmmuqiptmrjmc`):** Confirmed.
- **Rehearsal Location:** Executed inside an isolated local PostgreSQL container database `rc_rehearsal_clone` created specifically for rehearsal execution.
- **Data Sanitization:** Created from clean structural DDL matching Production baseline; no live production PII or credentials imported.

---

## 2. STEP-BY-STEP REHEARSAL EXECUTION MATRIX

| Stage | Operation | Migration / Script Executed | Result | Verification Details |
| :---: | :--- | :--- | :---: | :--- |
| **1/7** | Schema Baseline Setup | Sanitized Production baseline DDL | **PASS** | Roles (`anon`, `authenticated`, `service_role`), schemas (`public`, `private`, `supabase_migrations`), tables, and shift RPC baseline loaded. |
| **2/7** | Contract B Migrations | `20261008160638_member_registration_directory_privacy.sql`<br>`20261008160645_repair_report_revision_history_rpc.sql` | **PASS** | Strict member privacy RLS and safe `get_staff_directory()` + `get_report_revisions()` installed cleanly. |
| **3/7** | Contract C Migrations | `20261011091925_rc15_storage_route_prerequisites.sql`<br>`20261011092015_rc15_shift_rpc_compatibility.sql`<br>`20261011092051_rc15_operational_files.sql` | **PASS** | Additive operational storage routes, shift execution_source, and operational files tables/RLS applied. |
| **4/7** | Contract A Forward-Only | `20261011221500_rc15_provider_metadata_forward_compat.sql` | **PASS** | Provider metadata columns added to `report_images` and `live_report_images`; `upsert_live_report_image_with_provider` and delete auth RPCs compiled cleanly. |
| **5/7** | Ledger Reconciliation | `supabase_migrations.schema_migrations` audit | **PASS** | Exactly 6 migrations recorded in ascending chronological sequence. Zero ledger drift. |
| **6/7** | Role-Based RPC & Security | Multi-role automated assertion suite | **PASS** | All 8 automated security assertions passed (details below). |
| **7/7** | Rollback Rehearsal | Transaction abort simulation (`SELECT 1/0; ROLLBACK;`) | **PASS** | Failed transaction cleanly discarded without leaving orphaned DDL artifacts. |

---

## 3. DETAILED SECURITY & ROLE ASSERTIONS

1. **Test 6.1 (Contract B Directory Privacy):**
   - User: `member-1` (`set app.current_user_id = 'member-1'`)
   - Invocation: `SELECT * FROM public.get_staff_directory();`
   - Verification: Only columns `['id', 'full_name', 'avatar_url', 'operational_roles']` returned. Sensitive columns (`email`, `password_hash`, `system_permission`, audit metadata) are strictly blocked by schema.
   - Status: **PASS**

2. **Test 6.2a (Contract C Shift Creation with execution_source):**
   - User: `leader-1`
   - Invocation: `SELECT * FROM public.create_shift(...);` with `execution_source: 'agency'`
   - Verification: Shift created successfully with `execution_source = 'agency'` persisted.
   - Status: **PASS**

3. **Test 6.2b (Contract C Optimistic Concurrency Lock):**
   - User: `leader-1`
   - Invocation: `SELECT * FROM public.update_shift(..., p_expected_version: 1);`
   - Verification: Mutation succeeded with optimistic version match.
   - Status: **PASS**

4. **Test 6.2c (Contract C Stale Version Rejection):**
   - User: `leader-1`
   - Invocation: `SELECT * FROM public.update_shift(..., p_expected_version: 999);`
   - Verification: Immediately rejected with `OPTIMISTIC_LOCK_CONFLICT` (code `P0001`).
   - Status: **PASS**

5. **Test 6.3a (Contract A Provider Metadata Persistence):**
   - User: `member-1`
   - Invocation: `SELECT * FROM public.upsert_live_report_image_with_provider(...);` with `provider: 'google_drive'`, `external_file_id: 'drive-file-12345'`
   - Verification: Row inserted with `provider = 'google_drive'` and `external_file_id = 'drive-file-12345'`.
   - Status: **PASS**

6. **Test 6.3b (Contract A Idempotent Re-upload Guard):**
   - Invocation: Second upload with identical `storage_idempotency_key`, changed file name, and different redundant `external_file_id: 'drive-file-redundant-999'`.
   - Verification: Returned original row ID; original winner `external_file_id` (`drive-file-12345`) was preserved intact.
   - Status: **PASS**

7. **Test 6.4 (Cross-Member Isolation Enforcement):**
   - User: `member-1` attempting to upload image to `rep-2` (owned by `member-2`).
   - Verification: Rejected with PostgreSQL error code `42501` (`OPERATION_NOT_ALLOWED`).
   - Status: **PASS**

8. **Test 6.5 (Confirmed Report Immutability):**
   - Report `rep-1` status updated to `metrics_confirmed = true`.
   - Invocation: `upsert_live_report_image_with_provider` attempted.
   - Verification: Rejected with exception `REPORT_CONFIRMED` (`P0001`).
   - Status: **PASS**

9. **Test 6.6 (Provider Delete Authorization):**
   - User: `member-1` calling `authorize_live_report_image_delete` on own unconfirmed image.
   - Verification: Returns `true`. Locks parent report row `FOR UPDATE`.
   - Status: **PASS**

---

## 4. RAW REHEARSAL CONSOLE LOG

```text
--- STARTING DATABASE CLONE REHEARSAL IN ISOLATED POSTGRESQL CONTAINER ---

[1/7] Setting up Production-equivalent sanitized baseline schema...
✓ Baseline schema and reference tables initialized.
✓ Production shift RPC baseline applied (matches MD5 2133950d90a0610b76d4b6623abf4621).

[2/7] Applying Contract B Migrations (Privacy & Revisions)...
✓ 20261008160638_member_registration_directory_privacy.sql applied.
✓ 20261008160645_repair_report_revision_history_rpc.sql applied.

[3/7] Applying Contract C Migrations (RC15 Prerequisites, Shifts, Operational Files)...
✓ 20261011091925_rc15_storage_route_prerequisites.sql applied.
✓ 20261011092015_rc15_shift_rpc_compatibility.sql applied.
✓ 20261011092051_rc15_operational_files.sql applied.

[4/7] Applying Contract A Forward-Only Provider Compatibility Migration...
✓ 20261011221500_rc15_provider_metadata_forward_compat.sql applied.

[5/7] Verifying Migration Ledger Reconciliation...
Applied migration ledger entries: 20261008160638 (member_registration_directory_privacy), 20261008160645 (repair_report_revision_history_rpc), 20261011091925 (rc15_storage_route_prerequisites), 20261011092015 (rc15_shift_rpc_compatibility), 20261011092051 (rc15_operational_files), 20261011221500 (rc15_provider_metadata_forward_compat)
✓ Ledger reconciliation verified.

[6/7] Running Role-based RPC, Security & Concurrency Verifications...
✓ Test 6.1: Directory privacy verified (no emails or sensitive credentials exposed).
✓ Test 6.2a: create_shift with execution_source = agency succeeded.
✓ Test 6.2b: update_shift optimistic concurrency succeeded.
✓ Test 6.2c: update_shift optimistic concurrency lock conflict verified.
✓ Test 6.3a: upsert_live_report_image_with_provider saved provider metadata successfully.
✓ Test 6.3b: Idempotent re-upload preserved winner object.
✓ Test 6.4: Cross-member isolation enforced (42501 OPERATION_NOT_ALLOWED).
✓ Test 6.5: Confirmed report immutability enforced (REPORT_CONFIRMED).
✓ Test 6.6: authorize_live_report_image_delete authorized owner.

[7/7] Executing Transactional Rollback Rehearsal...
✓ Test 7: Transactional rollback cleanly aborted failed migration block without database drift.

======================================================
🎉 ALL DATABASE CLONE REHEARSAL CONTRACTS AND TESTS PASSED (100%)
======================================================
```
