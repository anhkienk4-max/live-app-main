# H5.1 PROVIDER INTEGRITY & CHECK CONSTRAINT FIX (P0)

**Project:** APP OPS LIVESTREAM PLATFORM  
**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Target Migration:** `supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql`  
**Severity:** P0 Database Integrity Defect  
**Status:** **RESOLVED & VERIFIED**  
**Evidence ID:** `EVID-H51-CONSTRAINT-FIX-01`  
**Date:** 2026-10-11T23:30:00+07:00  

---

## 1. DEFECT ROOT CAUSE & POSTGRESQL 3-VALUED LOGIC VULNERABILITY

### 1.1. The Vulnerability
In commit `b864c8b`, the provider metadata check constraint was introduced as:
```sql
check (
  (provider is null and external_file_id is null)
  or (provider in ('google_drive', 'onedrive') and btrim(external_file_id) <> '')
)
```

In PostgreSQL, a `CHECK` constraint is satisfied if the evaluated expression is **NOT FALSE** (i.e. evaluates to `TRUE` or `NULL` / `UNKNOWN`).
When `provider = 'google_drive'` and `external_file_id = NULL`:
- `provider in ('google_drive', 'onedrive')` evaluates to `TRUE`.
- `btrim(NULL) <> ''` evaluates to `NULL` (`UNKNOWN`).
- `TRUE AND NULL` evaluates to `NULL`.
- `FALSE OR NULL` evaluates to `NULL`.
- Because the expression evaluates to `NULL` rather than `FALSE`, **PostgreSQL accepted the invalid row**, completely defeating the provider pairing contract!

Furthermore, when `provider = NULL` and `external_file_id = 'file-123'`:
- `provider in ('google_drive', 'onedrive')` evaluates to `NULL` in SQL three-valued logic.
- `NULL AND TRUE` evaluates to `NULL`.
- `FALSE OR NULL` evaluates to `NULL`.
- The row was also erroneously accepted!

### 1.2. The Airtight Fix
The constraint was updated on both `public.report_images` and `public.live_report_images` with explicit `IS NOT NULL` guards:
```sql
check (
  (provider is null and external_file_id is null)
  or (
    provider is not null
    and provider in ('google_drive', 'onedrive')
    and external_file_id is not null
    and btrim(external_file_id) <> ''
  )
)
```

With these explicit guards, any invalid or partial pairing evaluates strictly to `FALSE` (`FALSE AND ... = FALSE`), guaranteeing 100% rejection.

---

## 2. 10-STATE TRUTH TABLE VERIFICATION MATRIX

Tested and verified via automated test suite `tests/h51-provider-metadata-constraint.test.ts`:

| State # | `provider` | `external_file_id` | Expected Result | SQL Expression Result | Postgres CHECK Behavior | Status |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **1** | `NULL` | `NULL` | ALLOW | `TRUE` | Accepted (Legacy file) | **PASS** |
| **2** | `'google_drive'` | `'drive-123'` | ALLOW | `TRUE` | Accepted (Valid pair) | **PASS** |
| **3** | `'onedrive'` | `'od-456'` | ALLOW | `TRUE` | Accepted (Valid pair) | **PASS** |
| **4** | `'google_drive'` | `NULL` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS (Fixed)** |
| **5** | `'onedrive'` | `NULL` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS (Fixed)** |
| **6** | `'google_drive'` | `''` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS** |
| **7** | `'google_drive'` | `'   '` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS** |
| **8** | `NULL` | `'file-123'` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS (Fixed)** |
| **9** | `'dropbox'` | `'file-123'` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS** |
| **10** | `'dropbox'` | `NULL` | **REJECT** | `FALSE` | **Rejected with check_violation** | **PASS** |

---

## 3. EXISTING DATABASE DATA AUDIT (EVIDENCE)

Before applying the constraint, live data in Staging (`amagnzebmmuqiptmrjmc`) was verified read-only:
```sql
select 'report_images' as tbl, count(*) as violation_count from public.report_images
where not (
  (provider is null and external_file_id is null)
  or (provider is not null and provider in ('google_drive', 'onedrive') and external_file_id is not null and btrim(external_file_id) <> '')
)
union all
select 'live_report_images' as tbl, count(*) as violation_count from public.live_report_images
where not (
  (provider is null and external_file_id is null)
  or (provider is not null and provider in ('google_drive', 'onedrive') and external_file_id is not null and btrim(external_file_id) <> '')
);
```

**Result:**
- `report_images` violations: **0**
- `live_report_images` violations: **0**
- Zero existing rows violate the strict pairing invariant. The constraint is safe to apply without data corruption or backfill.

---

## 4. MIGRATION POLICY & PROVENANCE TRANSPARENCY

1. **Candidate Migration Policy:**
   - Migration `20261011221500_rc15_provider_metadata_forward_compat.sql` is an unreleased Release Candidate migration on branch `rc/convergence-rc14-rc15`.
   - It has **NEVER been applied to shared Staging or Production**.
   - Direct repair of this candidate migration before publication preserves ledger provenance while preventing defective DDL from ever landing on shared environments.
2. **Immutable Historical Migrations Preserved:**
   - `20260919074349_rc12_report_file_provider.sql` on Staging was NOT edited in place.
   - Production has NOT received RC12.
3. **Forward-Only Staging Corrective Migration Design:**
   - For shared Staging (which ran the older RC12 migration in September), the standalone corrective migration `supabase/migrations/20261012093000_staging_corrective_provider_pair_constraint.sql` is prepared for dispatch upon Operator approval.
4. **Additional Security Guards in Candidate Migration:**
   - `authorize_report_image_delete` and `authorize_live_report_image_delete` now explicitly guard against `NULL uploaded_by` and `NULL submitted_by` for member roles:
     ```sql
     if actor_permission = 'member' and (target_image.uploaded_by is null or target_image.uploaded_by <> actor_id) then
       raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
     end if;
     ```
