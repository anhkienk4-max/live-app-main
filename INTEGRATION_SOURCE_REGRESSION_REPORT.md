# INTEGRATION SOURCE REGRESSION REPORT

**Project:** OPS Livestream Platform — APP OPS  
**Repository:** `anhkienk4-max/live-app-main`  
**Integration Branch:** `integration/rc14-frontend14wave-convergence`  
**Integration Verified HEAD:** `6d2ab1fc441a7add078d379960282bd0c6a8eec7`  
**Base Commit (main):** `31efea2d1a60583975e96773f68106d46ab7d8d9`  
**Candidate Commit (frontend):** `eb9d70ab3d11ccba7e36e885be5043455ba3405d`  
**Execution Timestamp:** 2026-10-10 23:25 ICT  

---

## 1. Quality & Compilation Verifications

| Check | Command | Result | Details |
| :--- | :--- | :---: | :--- |
| **Git Conflict Check** | `git diff --check` | **PASS** | 0 conflict markers, 0 whitespace errors |
| **TypeScript Typecheck** | `tsc --project tsconfig.json --noEmit` | **PASS** | 0 compile errors across full repository (including strict `RuntimeMode` in `scripts/check-runtime-environment.ts`) |
| **Security Headers Elimination** | Static audit of `app/(dashboard)/layout.tsx` & `proxy.ts` | **PASS** | `x-visual-qa-*` stripped at proxy; bypass gated strictly to `NODE_ENV === 'development' && !VERCEL_ENV` |
| **Commit Lineage** | `git log -2 --oneline` | **PASS** | `6d2ab1f` (security/env fixes) layered directly onto convergence HEAD `164886b` |

---

## 2. Automated Regression Suites Execution & Reconciliation

### Reconciled Metrics:
In the initial convergence report, the sum was mistakenly transcribed as 205. Direct calculation from the raw test runner logs across all 20 regression files shows **213 tests**.
With the addition of the new negative security suite `tests/security-qa-header-trust.test.ts` (6 tests), the grand total is **219 tests executed, 219 passed, 0 skipped, 0 failed, 0 duplicated (100% PASS)**:

| Test Suite File | Domain Covered | Tests | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| `tests/rc13c-compat-routing.test.ts` | Storage routing, Execution Source, Folder materialization, Cloud refs | 24 | **PASS** | 10.3s |
| `tests/report-null-semantics-consumers.test.ts` | Null metric resilience, Analytics confirmed-only | 4 | **PASS** | 1.6s |
| `tests/f6-import.test.ts` | XLSX import, Preview vs persistence, Row states | 15 | **PASS** | 3.1s |
| `tests/calendar-all-time-completeness.test.ts` | All-time shift paging, Shift status RPC + Staffing enrichment | 8 | **PASS** | 1.8s |
| `tests/supabase-shift-runtime.test.ts` | Shift CRUD, Registration locking, Soft-delete/restore, Role permissions | 19 | **PASS** | 2.6s |
| `tests/supabase-p3-report-runtime.test.ts` | Report lifecycle, Draft CAS, Image upload/cover, OCR review | 26 | **PASS** | 2.7s |
| `tests/rc14-report-artifact-storage.test.ts` | Canonical DATA/SOURCE & DATA/REPORT storage, Idempotency | 6 | **PASS** | 5.0s |
| `tests/rc13a-execution-source-routes.test.ts` | Internal vs Agency execution sources, Route configuration | 7 | **PASS** | 2.2s |
| `tests/core-v1-permission-rls-final.test.ts` | RLS grant-only security hardening, Public/anon revocation | 3 | **PASS** | 0.6s |
| `tests/dual-file-provider.test.ts` | Google Drive & OneDrive dual provider dispatch, Fallback prohibition | 5 | **PASS** | 3.2s |
| `tests/report-save-draft-cas.test.ts` | CAS versioning on save draft and review | 2 | **PASS** | 0.5s |
| `tests/shift-lifecycle.test.ts` | Complete shift lifecycle transitions (scheduled → live → completed/cancelled) | 18 | **PASS** | 2.8s |
| `tests/core-v1-3role-matrix.test.ts` | 3-Role matrix permissions (Admin, Leader, Member), Route access gates | 29 | **PASS** | 1.8s |
| `tests/shift-swap-two-flow.test.ts` | Swap replacement & exchange workflows, Anti-MOVE validation | 6 | **PASS** | 2.3s |
| `tests/shift-swap-p0.test.ts` | Swap atomic locks, Counterpart reuse prevention, Audit link | 8 | **PASS** | 0.7s |
| `tests/s2-shift-staffing.test.ts` | Staffing read-only edit mode, Create initial staffing payload | 4 | **PASS** | 3.6s |
| `tests/f11-recursive-audit-sanitizer.test.ts` | Sensitive field redaction in audit snapshots, Non-destructive trigger | 6 | **PASS** | 0.5s |
| `tests/account-management-core-v1.test.ts` | Auth identity reconciliation, SSR password recovery & invite routes | 7 | **PASS** | 0.8s |
| `tests/rc12-report-file-provider.test.ts` | Report file provider metadata, Immutable references, Cloud cleanup | 12 | **PASS** | 3.4s |
| `tests/rc14-live-image-migration.test.ts` | Live report image idempotency keys, Category constraints | 4 | **PASS** | 0.5s |
| `tests/security-qa-header-trust.test.ts` | Negative security tests: QA header stripping, Anonymous rejection, Privilege elevation prevention, Auth mode production guards | 6 | **PASS** | 0.9s |
| **TOTAL** | **Full Converged Regression Matrix (21 Suites)** | **219** | **PASS (100%)** | **~52s** |

---

## 3. Dedicated Security Suite Details (`tests/security-qa-header-trust.test.ts`)

| Test Case | Security Invariant Tested | Result | Duration |
| :--- | :--- | :---: | :---: |
| `1. Anonymous request rejection` | Anonymous request with `x-visual-qa-bypass: true` visiting `/calendar` is redirected to `/login` (307) without granting mock session. | **PASS** | 11.3ms |
| `2. Proxy header stripping` | `proxy.ts` strips `x-visual-qa-bypass` and `x-visual-qa-role` from incoming requests before dispatching to application routes while preserving standard headers. | **PASS** | 1.5ms |
| `3. Member privilege escalation rejection` | Member session attempting to supply `x-visual-qa-role: admin` cannot acquire `staff.manage` or `settings.admin`. | **PASS** | 0.3ms |
| `4. Leader privilege escalation rejection` | Leader session attempting to supply `x-visual-qa-role: admin` retains team permissions only; denied system admin permissions. | **PASS** | 0.2ms |
| `5. resolveAuthMode environment enforcement` | `resolveAuthMode` unconditionally resolves to `supabase` whenever `NODE_ENV === 'production'` or `VERCEL_ENV` is set, ignoring `useMockData: true`. | **PASS** | 0.3ms |
| `6. Role permission matrix hierarchy` | Strict permission hierarchy verified: Member ⊂ Leader ⊂ Admin. Admin-only permissions (`staff.manage`, `settings.admin`, `permissions.manage`) inaccessible to non-admins. | **PASS** | 0.3ms |

---

## 4. Cross-Domain Interaction & Non-Regression Findings

### A. Environment Guard Runtime Enforcement
- `scripts/check-runtime-environment.ts` blocks any Vercel Preview build that lacks `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Any Preview configuration pointing at `egdjnpmoasarrttvhgds` (Production) causes immediate build termination (exit code 1).
- Deployed Vercel build log verified: `[ENV GUARD] Preview deployment target verified: STAGING OK (amagnzebmmuqiptmrjmc)`.

### B. Storage Routing & File Providers (RC12–RC14)
- Both Google Drive and OneDrive providers function with exact-parent folder hierarchy.
- Idempotent retries detect existing storage idempotency keys and return the winning record without duplicate creation.
- Missing routes safely trigger localized Vietnamese user notifications without uncaught application crashes.

### C. Report Optimistic Locking (CAS) & Revision History
- All report save draft and review mutations pass explicit `expectedVersion`.
- Concurrent edits by multiple leaders or members are rejected with deterministic conflict status instead of silent overwrites.
- Initial report creation in both mock and Supabase modes initializes `version_number: 0` cleanly.

### D. Shift Staffing & Execution Source
- Shift forms and import panels cleanly support `execution_source` (`internal` vs `agency`).
- Legacy shifts with `execution_source = null` are preserved without forced schema modification.
- Staffing summary RPC batches work seamlessly alongside all-time calendar pagination.
- Defensive guards in `ShiftFormDialog` prevent any `TypeError` when mounting without registration fixtures.
