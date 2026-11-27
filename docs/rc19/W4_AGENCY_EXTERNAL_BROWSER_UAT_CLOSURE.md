# RC19 W4 — AGENCY / EXTERNAL FRONTEND & BROWSER UAT CLOSURE

## 1. Executive Summary & Handoff Coordinates

- **Branch**: `feat/rc19-w4-antigravity-frontend`
- **Application Target**:
  1. Phase 04: Agency / External Frontend Workflow & Scope-Aware UI
  2. Phase 04: Authenticated Browser UAT Acceptance Contract & Fixture Hardening
  3. Master Issue #80: Progress updated towards 40/66
- **Assigned Partners**:
  - Codex 01: Backend business implementation & schema migration
  - Codex 02: Hosted runtime, Supabase Realtime, source integration (`integration/rc19-w4-codex02`)
- **Production Status**: **HOLD / NO-GO** (Deployment guards active in `vercel.json`)

---

## 2. Agency & Scope-Aware Frontend Implementation

### 2.1 Scope-Aware UI Banners
- **Components Updated**:
  - `components/features/reports/ReportsContainer.tsx`
  - `components/features/reports/ReportsList.tsx`
- **Role Enforcement**:
  - **Admin Scope** (`brands.manage`): Displays `reports-admin-scope-banner`, indicating full cross-brand and cross-agency governance.
  - **Leader Scope** (`reports.review`): Displays `reports-leader-scope-banner`, indicating management scope across assigned Brands and Agencies.
  - **Member Scope**: Displays `reports-member-scope-banner`, indicating personal shift and report submission scope.

### 2.2 Agency & Brand Filter Controls
- Added `agencyCodes: string[]` (`'ada' | 'snap' | 'live_ai'`) to `Filters` contract and `emptyFilters`.
- Integrated `filter-agency` MultiSelect dropdown alongside Brand, Platform, and Campaign filters.
- Two-way URL search parameter synchronization (`?agencyCodes=ada,snap`).
- Active filter chips with individual removal (`reports-applied-filter-chips`).
- Backend query encoding (`encodedFilters`, `encodedQueueFilters`).
- Mock/Local execution support via `normalizeAgencyCode` in `filterMockList` in `lib/services/dataService.ts` and `ListFilters` in `lib/services/operationsPageService.ts`.

---

## 3. External Summary Workflow & Revision Integrity

### 3.1 Workflow Lifecycle & Role Permissions
- **Service Integration**: Connected `components/features/reports/ReportOperationalNotesReview.tsx` to `reportExternalSummaryService`.
- **Workflow States**:
  - `draft`: Member or Leader/Admin drafts summary (`external-summary-input`, `save-external-summary-draft-btn`).
  - `submitted`: Member submits report (`submit-external-summary-btn`), transitioning state to review.
  - `approved`: Leader/Admin approves summary (`approve-external-summary-btn`), creating an immutable historical snapshot revision.
  - `correction_requested`: Leader/Admin requests revision (`request-correction-external-summary-btn`, `re-request-correction-btn`), initializing a new revision draft while leaving previous historical revision immutable.
  - `rejected`: Summary rejected with recorded review reason.
- **Unauthorized Denial**:
  - Members attempting to approve or review receive immediate UI feedback and backend rejection (`REPORT_EXTERNAL_SUMMARY_REVIEW_FORBIDDEN` / 403).
- **Stale State Handling**:
  - Version conflict (HTTP 409 / `VERSION_CONFLICT`) triggers warning banner (`external-summary-stale-warning`) prompting data refresh.

### 3.2 Audience Privacy & Snapshot Immutability
- **Audience Toggle**: `preview-audience-internal-btn` vs `preview-audience-external-btn`.
- **Privacy Enforcement**: In external audience mode, renders `report-approved-external-summary` or `external-safe-backend-pending` strictly withholding internal staff IDs (`usr_...`), allegations, and internal operational notes.
- **Revision History**: `report-revision-selector-bar` displays past versions with `immutable-revision-badge`.

---

## 4. Browser Acceptance & Test Verification Evidence

### 4.1 Unit & Contract Tests
- `tests/rc19-report-apply-filters.test.ts`: **4 / 4 PASS** (preserved draft filter contract, applied chips, URL sync, and pagination reset).
- `tests/report-external-summary-service.test.ts`: **8 / 8 PASS** (workflow RPC payloads, idempotency keys, fail-closed readback).
- `tests/report-external-summary-handler.test.ts`: **4 / 4 PASS** (origin validation, single RPC call, conflict handling).

### 4.2 Browser Acceptance Suite (`e2e/rc19-w4-browser-acceptance.spec.ts`)
- **Suite A (Smoke & Pure Invariants)**: **6 / 6 PASS (100%)**
  - `SWAP-02`: Overnight ICT time formatting strictly applies `Asia/Ho_Chi_Minh` (+07:00).
  - `L08-smoke`: Anonymous unauthenticated actor access denied to protected routes (`/calendar`, `/swaps`, `/workforce`, `/reports`).
  - `RESPONSIVE-LOGIN`: Zero horizontal scroll verified across 4 viewports:
    - `mobile-se` (320x568)
    - `mobile-standard` (390x844)
    - `tablet` (768x1024)
    - `desktop` (1440x900)
- **Suite B (Hosted Business Acceptance)**: 15 test cases ready for executed validation against hosted runtime, featuring:
  - `REP-AGENCY-01`: Reports scope banners and Agency filter dropdown verification.
  - `D07 & D09`: External Summary approval, revision immutability, and privacy withholding.
  - `SWAP-01..04`: Active registration binding, conflict invalidation, and reciprocal exchange preview.
  - `D03, D05, D06, D08`: Distinct incident totals, workforce scope banners, note draft persistence.
  - `L01, L02/L03, L08`: Live link readback, modal-switch stability, and media authorization denial.
  - `ATT-01, PAY-01, RESPONSIVE-OPERATIONAL`: Shift attendance, payslip calculation, operational workspace responsive layouts.

---

## 5. Next Steps for Candidate Integration

1. Publish development branch `feat/rc19-w4-antigravity-frontend`.
2. Codex 02 executes hosted acceptance with synthetic GoTrue identities on `integration/rc19-w4-codex02`.
3. Track overall progress on Master Issue #80 (advancing to Phase 04 / Phase 02 closure).
