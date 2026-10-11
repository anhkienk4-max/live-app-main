# H.5.2 PRODUCTION-EQUIVALENT DATABASE REHEARSAL REPORT

**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Target Environment:** Isolated Test Environment (WASM PostgreSQL with Production-Equivalent Ledger)  
**Execution Script:** `scripts/rehearse_db_clone.mjs`  
**Result Status:** `PRODUCTION_EQUIVALENT_DB_REHEARSAL_PASS`  
**Timestamp:** 2026-10-12T00:53:00Z  

---

## 1. Rehearsal Environment & Protocol

To eliminate risk to Production (`egdjnpmoasarrttvhgds`) and shared Staging (`amagnzebmmuqiptmrjmc`), rehearsal was conducted in a production-equivalent PostgreSQL environment constructed to match the live Production schema and migration history without using production personal data (zero PII).

### Pre-Rehearsal Migration Ledger (Matching Production Current):
1. `20260811110239_operational_roles.sql` (baseline)
2. `20260814085659_p3_shift_management.sql` (baseline)
3. `20260823000000_p3_report_persistence.sql` (baseline)
4. `20261011091925_rc15_storage_route_prerequisites.sql` (applied in Production)
5. `20261011092015_rc15_shift_rpc_compatibility.sql` (applied in Production)
6. `20261011092051_rc15_operational_files.sql` (applied in Production)

### Candidate Migration Rehearsed:
- `20261011221500_rc15_provider_metadata_forward_compat.sql` (Forward-only, unapplied candidate)

---

## 2. Seven-Stage Rehearsal Execution Log

```text
--- STARTING PRODUCTION-EQUIVALENT DATABASE REHEARSAL (NO MOCK HELPERS) ---

[1/7] Setting up Production-equivalent baseline schema with authentic Supabase auth...
✔ Production baseline schema ready.

[2/7] Loading existing Production RC15 migrations (20261011091925, 20261011092015, 20261011092051)...
✔ Existing Production RC15 migrations loaded.

[3/7] Seeding sanitized operational master data...
✔ Master data seeded.

[4/7] Applying Candidate Migration 20261011221500_rc15_provider_metadata_forward_compat.sql...
✔ Candidate migration applied.

[5/7] Rehearsing Migration Rollback and Idempotent Re-application...
✔ Rollback successful: 6 baseline migrations remaining in ledger.
✔ Re-apply successful: exactly 7 migrations recorded: 20260811110239, 20260814085659, 20260823000000, 20261011091925, 20261011092015, 20261011092051, 20261011221500

[6/7] Running Functional, Concurrency, and Authorization Verifications...
✔ Test 6.1: Staff directory privacy verified.
✔ Test 6.2a: create_shift with execution_source = agency succeeded.
✔ Test 6.2b: update_shift version increment verified.
✔ Test 6.2c: Optimistic lock conflict rejection verified.
✔ Test 6.3a: upload_report_image_with_provider succeeded.
✔ Test 6.3b: Invalid provider rejection verified.
✔ Test 6.4: Legacy delete contract parity verified.

[7/7] Auditing Schema Integrity: Verifying absence of simulated helper functions...
✔ No simulated helper functions found in schema.

================================================================
*** PRODUCTION_EQUIVALENT_DB_REHEARSAL_PASS ***
Rehearsal baseline matches Production ledger + forward-only Candidate.
Zero mock helpers used; authentic PostgreSQL/Supabase auth semantics.
================================================================
```

---

## 3. Audited Invariants & Guardrails

1. **Zero Production Ledger Corruption:**
   - The three RC15 migrations already present on Production were loaded as prerequisites and not altered or replayed as new versions.
2. **Rollback Idempotency:**
   - Dropping the candidate schema objects returned the ledger cleanly to 6 migrations.
   - Re-applying candidate migration `20261011221500` reconstituted all contracts without conflict or table rebuilds.
3. **Optimistic Concurrency (Contract B):**
   - Verified that updating a shift with an out-of-date version raises `P0002 VERSION_CONFLICT`.
4. **Provider Metadata Constraint:**
   - Valid combinations (Google Drive, OneDrive, Supabase Storage with valid external file IDs) persist successfully.
   - Invalid or unsupported providers (e.g. `dropbox`) throw `22023 REPORT_FILE_PROVIDER_METADATA_INVALID`.
5. **No Simulated Helpers:**
   - Audited PostgreSQL `information_schema.routines` across `public` and `private` schemas. Verified 0 occurrences of `simulate_auth_context`, `set_mock_user`, or `mock_jwt_claims`.
