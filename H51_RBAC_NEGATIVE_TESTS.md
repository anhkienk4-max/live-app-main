# H5.1 RBAC & RPC NEGATIVE SECURITY TEST RESULTS

**Project:** APP OPS LIVESTREAM PLATFORM  
**Repository:** `anhkienk4-max/live-app-main`  
**Branch:** `rc/convergence-rc14-rc15`  
**Test Suite:** `tests/h51-rbac-negative-security.test.ts`  
**Evidence ID:** `EVID-H51-RBAC-SECURITY-01`  
**Date:** 2026-10-11T23:30:00+07:00  
**Overall Result:** **PASS (7/7 Assertions Passed ?" 0 Failures)**  

---

## 1. IDENTITY & CALLER CONTEXT SEMANTICS

In Supabase / PostgREST architecture, caller identity is derived from `auth.uid()` (the JWT `sub` claim).
The true function `private.current_business_user_id()` resolves:
```sql
select business_user.id
from public.business_users as business_user
where business_user.auth_user_id = (select auth.uid())
  and business_user.status = 'active'
  and business_user.account_status = 'active'
  and business_user.archived_at is null
  and business_user.deleted_at is null
limit 1;
```

---

## 2. AUTOMATED ASSERTION MATRIX

| Test Case | Scenario / Caller | Action / RPC Invoked | Expected Outcome | Actual Outcome | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **3.1** | Unauthenticated (`auth.uid() = NULL`) | `authorize_report_image_delete('img-1')` | `42501 AUTHENTICATION_REQUIRED` | Rejected fail-closed | **PASS** |
| **3.2a** | Suspended Account (`status = 'suspended'`) | `authorize_report_image_delete('img-1')` | `42501 AUTHENTICATION_REQUIRED` | Rejected fail-closed | **PASS** |
| **3.2b** | Archived Account (`archived_at IS NOT NULL`) | `authorize_report_image_delete('img-1')` | `42501 AUTHENTICATION_REQUIRED` | Rejected fail-closed | **PASS** |
| **3.3** | Member on image with `uploaded_by = NULL` | `authorize_report_image_delete('img-null')` | `42501 OPERATION_NOT_ALLOWED` | Rejected (P0 Guard) | **PASS** |
| **3.4** | Member 2 on Member 1 Image | `authorize_report_image_delete('img-member1')` | `42501 OPERATION_NOT_ALLOWED` | Cross-member blocked | **PASS** |
| **3.5** | Admin / Leader on Member 1 Image | `authorize_report_image_delete('img-member1')` | Allowed (`true`) | Privileged delete allowed | **PASS** |
| **3.6** | Any role on Confirmed Report Image | `authorize_report_image_delete('img-confirmed')` | `P0001 REPORT_CONFIRMED` | Immutability preserved | **PASS** |
| **3.7** | Shift Expected Version Increment & CAS | `update_shift(..., p_expected_version: 1)` | `version` bumped 1 -> 2; stale retry rejected | Version bumped & stale rejected | **PASS** |

---

## 3. SECURITY INVARIANTS CONFIRMED

1. **Fail-Closed on Anonymous Calls:** No caller without valid JWT can invoke provider-backed mutations or deletions.
2. **Account Lifecycle Enforcement:** Suspended or archived accounts cannot perform operational actions even if they retain a valid JWT.
3. **No Member Elevation via NULL uploader:** If `uploaded_by` is NULL, regular members cannot claim ownership or delete the file.
4. **Confirmed Data Immutability:** Once `metrics_confirmed = true`, report images cannot be deleted by Admin, Leader, or Member without formal administrative revision unlocking.
5. **Optimistic Concurrency Protection:** Concurrent shift edits must match the current CAS version; stale updates are rejected with `OPTIMISTIC_LOCK_CONFLICT`.
