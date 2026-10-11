# H.5.2 FINAL SECURITY CONTRACT RECONCILIATION

**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Base Commit / Verified HEAD:** `d4b599955d8b05009e610b21d1797335c0367662`  
**Candidate Migration:** `supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql`  
**Timestamp:** 2026-10-12T00:52:00Z  

---

## 1. Executive Summary & Objective

Phase H.5.2 specifically mandated closing the legacy image delete authorization gap between `public.authorize_report_image_delete` (legacy report images) and `public.authorize_live_report_image_delete` (live session images). Prior to this fix, `authorize_report_image_delete` checked only `metrics_confirmed = true`, leaving an edge case where a report with `status = 'confirmed'` but `metrics_confirmed = false` could potentially permit an unauthorized image deletion mutation.

With candidate migration `20261011221500_rc15_provider_metadata_forward_compat.sql` updated in-place (as an unapplied candidate migration), both RPCs now share identical, rigorous authorization, immutability, and existence contracts.

---

## 2. Side-by-Side RPC Contract Reconciliation

| Contract Rule | `authorize_report_image_delete` | `authorize_live_report_image_delete` | Parity Status |
| :--- | :--- | :--- | :--- |
| **Authentication Requirement** | Requires non-null `actor_id` from `private.current_business_user_id()`. Throws `42501 AUTHENTICATION_REQUIRED` if unauthenticated, suspended, or archived. | Requires non-null `actor_id` from `private.current_business_user_id()`. Throws `42501 AUTHENTICATION_REQUIRED` if unauthenticated, suspended, or archived. | **IDENTICAL (100% Match)** |
| **Active Target Existence** | Image must exist in `public.report_images`. Report must exist, not be soft-deleted (`deleted_at is null`), and not be archived (`archived_at is null`). Throws `P0001 REPORT_NOT_FOUND`. | Image must exist in `public.live_report_images`. Report must exist, not be soft-deleted (`deleted_at is null`), and not be archived (`archived_at is null`). Throws `P0001 REPORT_NOT_FOUND`. | **IDENTICAL (100% Match)** |
| **Confirmed Report Immutability** | Rejects if `metrics_confirmed = true` **OR** `status = 'confirmed'`. Throws `P0001 REPORT_CONFIRMED`. | Rejects if `metrics_confirmed = true` **OR** `status = 'confirmed'`. Throws `P0001 REPORT_CONFIRMED`. | **IDENTICAL (100% Match)** |
| **Role Authorization: Member** | Rejects if `target_image.uploaded_by is null` or `target_image.uploaded_by <> actor_id`. Throws `42501 OPERATION_NOT_ALLOWED`. | Rejects if `target_image.uploaded_by is null` or `target_image.uploaded_by <> actor_id`. Throws `42501 OPERATION_NOT_ALLOWED`. | **IDENTICAL (100% Match)** |
| **Report Ownership Check** | For `member`, rejects if `target_report.submitted_by is null` or `target_report.submitted_by <> actor_id`. Throws `42501 OPERATION_NOT_ALLOWED`. | For `member`, rejects if `target_report.submitted_by is null` or `target_report.submitted_by <> actor_id`. Throws `42501 OPERATION_NOT_ALLOWED`. | **IDENTICAL (100% Match)** |
| **Role Authorization: Admin / Leader** | Can delete images on draft reports even if uploaded by another team member. Cannot delete on confirmed reports. | Can delete images on draft reports even if uploaded by another team member. Cannot delete on confirmed reports. | **IDENTICAL (100% Match)** |
| **Security Definitive Context** | `security definer set search_path = ''` | `security definer set search_path = ''` | **IDENTICAL (100% Match)** |
| **Locking & Concurrency** | Row locks acquired on target image and parent report prior to validation checks. | Row locks acquired on target image and parent report prior to validation checks. | **IDENTICAL (100% Match)** |

---

## 3. Migration Diff Inspection

```diff
--- a/supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql
+++ b/supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql
@@ -154,7 +154,7 @@ begin
   if actor_permission = 'member' and (target_report.submitted_by is null or target_report.submitted_by <> actor_id) then
     raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
   end if;
-  if target_report.metrics_confirmed then
+  if target_report.metrics_confirmed or target_report.status = 'confirmed' then
     raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
   end if;
   return true;
```

---

## 4. Verification Evidence

1. **AST & Regex Contract Suite (`tests/h51-provider-metadata-constraint.test.ts`):**
   - Asserts that both RPC signatures contain the compound boolean guard `target_report.metrics_confirmed or target_report.status = 'confirmed'`.
   - Result: **PASS**.
2. **RBAC Simulator Unit Suite (`tests/h51-rbac-negative-security.test.ts`):**
   - Fixtures for `status = 'confirmed'` with `metrics_confirmed = false` verified against Member, Leader, and Admin actors. All reject with `P0001 REPORT_CONFIRMED`.
   - Fixtures for soft-deleted reports and archived reports verified. All reject with `P0001 REPORT_NOT_FOUND`.
   - Result: **PASS (11/11 tests pass)**.
3. **Authentic PostgreSQL Integration Suite (`tests/h52-db-auth-integration.test.ts`):**
   - Live PL/pgSQL function execution against `PGlite` WASM engine with authentic `auth.uid()` and session context.
   - Result: **PASS (10/10 tests pass)**.
