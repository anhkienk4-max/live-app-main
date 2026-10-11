# RELEASE CANDIDATE TEST RESULTS

**Target Branch:** `rc/convergence-rc14-rc15`  
**Candidate Commit:** `dfa41407df7422f281898da8bb20bc695b27a3c3`  
**Execution Environment:** Node.js v24.18.0, Windows, Next.js 16.2.10, TypeScript 5.9  
**Execution Date:** 2026-10-11T20:39:30+07:00  

---

## 1. QUALITY GATE EXECUTION SUMMARY

| Gate | Command | Result | Duration | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Type Check** | `npm run type-check` | **PASS (0 errors)** | 58s | Full TypeScript compiler validation without incremental cache |
| **Linting** | `npm run lint` | **PASS (0 errors)** | 42s | Strict ESLint check; React 19 hooks and imports verified |
| **Build** | `npx next build --webpack` | **PASS (0 errors)** | 132s | 35 static & dynamic routes generated; 0 build errors |
| **Storage Test Suites** | `node --import ./tests/typescript-alias-loader.mjs --test <11 suites>` | **119 / 119 PASS** | 12.0s | RC12, RC13, RC14, and RC15 storage test suites |
| **Core App Test Suites** | `node --import ./tests/typescript-alias-loader.mjs --test <13 suites>` | **105 / 105 PASS** | 10.5s | Shift lifecycle, report CAS, security, and shell test suites |
| **TOTAL AUTOMATED TESTS** | | **224 / 224 PASS** | | **0 FAILING TESTS** |

---

## 2. STORAGE CENTER V2 TEST SUITE RESULTS (119 TESTS PASS)

| Test File | Tests Passed | Status | Key Assertions Covered |
| :--- | :---: | :---: | :--- |
| `tests/rc12-report-file-provider.test.ts` | 12 / 12 | **PASS** | RC1.2 report/live upload provider integration, cleanup on failure, folder ambiguity guard, image MIME type validation |
| `tests/rc13a-execution-source-routes.test.ts` | 6 / 6 | **PASS** | Shift `execution_source` assignment, repository propagation, NULL preservation, active route uniqueness |
| `tests/rc13b2b-report-storage-cutover.test.ts` | 18 / 18 | **PASS** | Shift date folder materialization, Agency dashboard placement, image deduplication, live session symmetry |
| `tests/rc13c-compat-routing.test.ts` | 24 / 24 | **PASS** | Static route validation, Female AI canonical routing, ambiguity detection, compat mode backward compatibility |
| `tests/rc14-all-brand-storage.test.ts` | 18 / 18 | **PASS** | 20 brand/source & 28 platform coverage, ASTROMAN/CUREL/OPELLA/Mars placement, category overrides |
| `tests/rc14-report-artifact-storage.test.ts` | 6 / 6 | **PASS** | DATA/SOURCE and DATA/REPORT artifact upload, idempotent deduplication, confirmation guard, soft delete |
| `tests/rc14-data-report-export-fidelity.test.ts` | 3 / 3 | **PASS** | 4-sheet Excel export (Summary, Metrics, Timeline, Evidence), Shopee projection preservation, TikTok click metrics |
| `tests/rc15-operational-file-storage.test.ts` | 14 / 14 | **PASS** | Subbrand fallback prohibition, 15 V2 categories, Drive parent ancestry, campaign key isolation, large MP4 streaming |
| `tests/rc15-schedule-import-archive.test.ts` | 5 / 5 | **PASS** | Multi-brand schedule partitioning, raw file archiving, distinct monthly scopes, retry safety |
| `tests/rc15-storage-setup.test.ts` | 10 / 10 | **PASS** | Admin RBAC guard, brand storage profile review, shift source classification RPC, verified ancestor checking |
| `tests/rc15-system-export.test.ts` | 6 / 6 | **PASS** | Admin snapshot generator, cross-scope fail-closed checks, truncated result rejection, max bytes limit |

---

## 3. CORE APPLICATION & SECURITY SUITE RESULTS (105 TESTS PASS)

| Test File | Tests Passed | Status | Key Assertions Covered |
| :--- | :---: | :---: | :--- |
| `tests/shift-lifecycle.test.ts` | 18 / 18 | **PASS** | Canonical state machine (scheduled → preparing → live → paused → completed), version concurrency (STALE_WRITE), auto-completion bounds |
| `tests/report-save-draft-cas.test.ts` | 2 / 2 | **PASS** | Complete CAS event emission on draft save and review save, failure handling |
| `tests/report-history-access.test.ts` | 11 / 11 | **PASS** | Historical report target resolution, deep linking, unassigned staff protection, inaccessible shift isolation |
| `tests/report-required-metrics.test.ts` | 6 / 6 | **PASS** | Platform required metrics (Shopee / TikTok), zero value vs null distinction, confirmation guard |
| `tests/security-qa-header-trust.test.ts` | 6 / 6 | **PASS** | Proxy header stripping, privilege elevation rejection, production mock mode lockout, role consistency |
| `tests/role-lens.test.ts` | 4 / 4 | **PASS** | Role configuration for Admin, Leader, and Member; fallback behavior on unauthenticated/loading state |
| `tests/report-storage-security.test.ts` | 29 / 29 | **PASS** | Private report bucket RLS, signed URL usage, metadata-only persistence, concurrent upload race handling |
| `tests/production-shell-convergence.test.ts` | 1 / 1 | **PASS** | Shell frame, dark operations theme, navigation convergence |
| `tests/profile-avatar-storage.test.ts` | 3 / 3 | **PASS** | User profile avatar upload, path isolation, cross-user delete prevention |
| `tests/s2-shift-staffing.test.ts` | 4 / 4 | **PASS** | Staffing field separation from shift updates, read-only editing in Supabase mode |
| `tests/s2b-staff-management-writes.test.ts` | 6 / 6 | **PASS** | Admin policy enforcement, no self-escalation, RPC repository routing |
| `tests/supabase-p1c-shift-lifecycle-contract.test.ts` | 2 / 2 | **PASS** | `soft_delete_shift` and `restore_shift` Admin security definer RPCs |
| `tests/supabase-p1c-shift-migration-contract.test.ts` | 7 / 7 | **PASS** | P1C shift tables, Vietnam timezone wall-clock semantics, registration triggers, writer serialization |

---

## 4. ROUTE ACCESSIBILITY & RBAC VERIFICATION

All 35 application routes compile cleanly without runtime errors:

| Route Path | Type | Access Level | Verified Status |
| :--- | :--- | :--- | :--- |
| `/` | Dynamic | All Authenticated | **200 OK** |
| `/shifts` | Dynamic | All Authenticated | **200 OK** |
| `/staffing` | Dynamic | Admin, Leader | **200 OK** |
| `/registration` | Dynamic | Member | **200 OK** |
| `/reports` | Dynamic | All Authenticated | **200 OK** |
| `/calendar` | Dynamic | All Authenticated | **200 OK** |
| `/live` | Dynamic | All Authenticated | **200 OK** |
| `/analytics` | Dynamic | Admin, Leader | **200 OK** |
| `/staff` | Dynamic | All Authenticated (Admin write) | **200 OK** |
| `/swaps` | Dynamic | All Authenticated | **200 OK** |
| `/notifications` | Dynamic | All Authenticated | **200 OK** |
| `/audit` | Dynamic | Admin | **200 OK** |
| `/settings` | Dynamic | Admin | **200 OK** |
| `/storage` | Dynamic | Admin, Leader | **200 OK (NEW RC15)** |
| `/storage/setup` | Dynamic | Admin Only | **200 OK (NEW RC15)** |
| `/api/operational-files` | API | Admin, Leader | **200 OK (NEW RC15)** |
| `/api/operational-storage-setup` | API | Admin Only | **200 OK (NEW RC15)** |
