# INTEGRATION MIGRATION COMPATIBILITY REPORT

**Project:** OPS Livestream Platform — APP OPS  
**Staging Reference:** `amagnzebmmuqiptmrjmc`  
**Production Reference:** `egdjnpmoasarrttvhgds`  
**Branch:** `integration/rc14-frontend14wave-convergence`  
**Integration Verified HEAD:** `13b3a71c874b9e1cb2769a2ec809cf7f20adb792`  
**Date:** 2026-10-11  

---

## 1. Schema Drift & Environment Realities

Based on verified database state inspection across Supabase Staging and Production:

| Object / Migration | STAGING (`amagnzeb...`) | PRODUCTION (`egdjnp...`) | Compatibility Assessment |
| :--- | :---: | :---: | :--- |
| `20260919074349_rc12_report_file_provider` | **APPLIED** | **MISSING** | Production lacks file provider columns (`google_drive`, `onedrive`) on report tables. |
| `20260924000000_rc13a_execution_source` | **APPLIED** | **MISSING** | Production lacks `shifts.execution_source` and `operational_storage_routes`. |
| `20260925000000_p0_swap_lock_hardening` | **APPLIED** | **MISSING** | Production lacks atomic participant lock set hardening. |
| `20260928000000_p1_report_revision_history` | **APPLIED** | **MISSING** | Production lacks immutable report audit snapshot triggers. |
| `20261006160000_rc14_live_image_storage_contract` | **APPLIED (Phase 3)** | **APPLIED** | Both Staging and Production now possess additive storage columns (`storage_file_name`, `storage_idempotency_key`). |
| `20261007183831_rc14_report_data_artifacts` | **APPLIED (Phase 3)** | **MISSING** | Staging has `stored_files` metadata index table; Production still lacks this table. |
| Function: `upsert_live_report_image_with_provider` | **EXISTS (Wrapped)** | **DOES NOT EXIST** | Production only has `upsert_live_report_image(jsonb)`. |

---

## 2. Phase 3 Migration Execution & Verification (STAGING)

### A. Pre-Migration Backups & Rollback Artifacts
Executed under operator authorization. All backups preserved safely outside the repository:
- **Directory:** `C:\Users\KienNguyen\.gemini\antigravity-ide\brain\880f22af-577e-49c1-85de-b9f809e7099f\staging_backups\`
- **Data Backup:** `live_report_images_data_backup.json` (728 bytes, 1 existing row preserved)
- **Functions Backup:** `baseline_functions_backup.json` (baseline definitions of `upsert_live_report_image` and `upsert_live_report_image_with_provider`)
- **Rollback Script:** `staging_rollback_rc14.sql` (5,109 bytes, complete automated rollback script)

### B. Applied Migrations
Executed via CLI against Staging:
```bash
npx supabase db push --include-all --project-ref amagnzebmmuqiptmrjmc
```
- `20261006160000_rc14_live_image_storage_contract.sql`: **APPLIED**
- `20261007183831_rc14_report_data_artifacts.sql`: **APPLIED**
- Exit Code: **0**

### C. Post-Migration Verification Results
1. `public.live_report_images`:
   - Columns (20 total): `storage_file_name` and `storage_idempotency_key` successfully added.
   - Index: `live_report_images_storage_idempotency_key` partial unique index verified.
   - Constraint: `live_report_images_storage_metadata_check` verified.
   - Trigger: `live_image_storage_category` executing `private.sync_live_image_storage_category()` verified.
   - Data Preservation: 1 existing image row 100% preserved.
2. `public.stored_files`:
   - Table created with 19 columns including `artifact_key`, `checksum_sha256`, `folder_path`.
   - Foreign keys: Cascade on delete to `reports` and `shifts`.
   - Security / RLS: RLS enabled (`relrowsecurity = true`). Privileges revoked from `anon` and `authenticated`; access restricted to `postgres` and `service_role`.
3. Database Advisors:
   - Security / Performance advisories run via `supabase db advisors --linked --project-ref amagnzebmmuqiptmrjmc`.
   - 0 errors reported.

---

## 3. Production Cutover Readiness Note

When the integration branch is eventually approved for Production cutover:
1. Production must apply `20260919074349_rc12`, `20260924000000_rc13a`, `20260925000000_p0`, `20260928000000_p1`, and `20261007183831_rc14_report_data_artifacts.sql`.
2. `20261006160000_rc14_live_image_storage_contract.sql` is already applied on Production and will be skipped cleanly by `supabase db push`.
3. Staging is now fully up to date and serves as the verified live testing ground for the convergent integration candidate.
