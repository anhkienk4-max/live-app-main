# H5.1 PRODUCTION SCHEMA REHEARSAL & FIDELITY ASSESSMENT

**Project:** APP OPS LIVESTREAM PLATFORM  
**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Evidence ID:** `EVID-H51-SCHEMA-REHEARSAL-01`  
**Date:** 2026-10-11T23:30:00+07:00  

---

## 1. REHEARSAL FIDELITY AUDIT & HONEST CATEGORIZATION

In Phase H.5, `scripts/rehearse_db_clone.mjs` executed inside an isolated container. A critical evaluation shows:
1. **Runner Characteristics:**
   - Used handcrafted structural table DDL.
   - Mocked `private.current_business_user_id()` to return `current_setting('app.current_user_id', true)`.
   - Executed queries as database owner, bypassing RLS.
   - Omitted the `shifts_bump_concurrency_version` trigger, leaving shift `version` increment unverified.
2. **Proper Gate Classification:**
   - This runner is strictly an **`ISOLATED_SYNTHETIC_DB_TEST_PASS`** (unit/integration schema validation).
   - It is **NOT** a `PRODUCTION_EQUIVALENT_DB_REHEARSAL_PASS`.
   - Claiming a true production-clone pass without an authentic clone is prohibited under APP OPS integrity guidelines.

---

## 2. PRODUCTION SCHEMA BASELINE & MISSING MIGRATION LEDGER

From `STAGING_PRODUCTION_SCHEMA_AND_LEDGER_DIFF.md` and `docs/storage/rc15-release-baseline/PROD_SCHEMA_METADATA_BEFORE_RC15.json`:

### 2.1. Already Applied on Production (DO NOT REPLAY)
The following RC15 migrations were executed on Production on 2026-10-11 morning:
- `20261011091925_rc15_storage_route_prerequisites.sql` (Operational storage routes, brand profiles)
- `20261011092015_rc15_shift_rpc_compatibility.sql` (MD5-guarded shift RPCs, execution_source)
- `20261011092051_rc15_operational_files.sql` (Operational files metadata index)

### 2.2. Genuinely Missing on Production
Production currently lacks ONLY:
1. **Contract B Migrations (from RC14):**
   - `20261008160638_member_registration_directory_privacy.sql` (P0 Member Privacy RLS)
   - `20261008160645_repair_report_revision_history_rpc.sql` (P1 Report Revision History RPC)
2. **Contract A Forward-Only Migration:**
   - `20261011221500_rc15_provider_metadata_forward_compat.sql` (Provider metadata on report images + upload/delete wrappers with P0 constraint fix)

---

## 3. HARNESS REPAIRS & ENHANCEMENTS

`scripts/rehearse_db_clone.mjs` was hardened:
1. **Restored Shift Version Bump Trigger:**
   ```sql
   create or replace function private.bump_concurrency_version()
   returns trigger language plpgsql security invoker set search_path = '' as $$
   begin
     new.version := coalesce(old.version, 1) + 1;
     new.updated_at := statement_timestamp();
     return new;
   end;
   $$;
   create trigger shifts_bump_concurrency_version
   before update on public.shifts
   for each row execute function private.bump_concurrency_version();
   ```
2. **Restored Concurrency Assertion:**
   ```javascript
   assert.equal(updateShiftRes.version, createShiftRes.version + 1, 'Version must increment on update');
   ```
3. **Added Negative Role & Security Tests:**
   - Unauthenticated caller rejection (`42501 AUTHENTICATION_REQUIRED`).
   - NULL `uploaded_by` rejection for member (`42501 OPERATION_NOT_ALLOWED`).
   - Cross-member deletion rejection (`42501 OPERATION_NOT_ALLOWED`).
   - Confirmed report mutation rejection (`REPORT_CONFIRMED`).
4. **Honest Gate Banner:**
   Output explicitly declares `ISOLATED_SYNTHETIC_DB_TEST_PASS`.
