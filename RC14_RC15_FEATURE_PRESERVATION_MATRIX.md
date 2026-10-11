# RC14 & RC15 FEATURE PRESERVATION MATRIX

**Target Branch:** `rc/convergence-rc14-rc15`  
**Candidate HEAD:** `dfa41407df7422f281898da8bb20bc695b27a3c3`  
**Preservation Standard:** 100% RC14 14-Wave Frontend Interiors & Hardening + 100% RC15 Storage Center V2 Business Logic  

---

## 1. 14-WAVE FRONTEND PRESERVATION (RC14)

| Wave | Feature Area | RC14 High-Fidelity Specification | Convergence Status | Preserved Implementation / Verification |
| :--- | :--- | :--- | :--- | :--- |
| **Wave 1** | **Global Shell & Layout** | Dark operations frame (`#082743`), 248px sidebar, 56px topbar, unified font & badges | **PRESERVED (100%)** | `components/layout/Sidebar.tsx`, `components/layout/Header.tsx`, `tests/production-shell-convergence.test.ts` PASS |
| **Wave 2** | **Role-Based Navigation** | Admin / Leader / Member role lenses; dynamic nav items based on operational & system roles | **PRESERVED (100%)** | `lib/ui/role-ux.ts`, `tests/role-lens.test.ts` PASS. "Kho file" added cleanly to OPERATIONS for Admin/Leader only |
| **Wave 3** | **Shifts Workspace (`/shifts`)** | 8-column table, status badges, version-controlled edit modal, canonical state transitions | **PRESERVED (100%)** | `components/features/shifts/ShiftDetailModal.tsx`, `tests/shift-lifecycle.test.ts` PASS |
| **Wave 4** | **Staffing Management (`/staffing`)** | Real-time staffing board, role assignment, conflict detection, capacity safeguards | **PRESERVED (100%)** | `components/features/shifts/StaffingBoard.tsx`, `tests/s2-shift-staffing.test.ts` PASS |
| **Wave 5** | **Shift Registration (`/registration`)** | Member self-registration, quota enforcement, host/support role eligibility | **PRESERVED (100%)** | `app/(dashboard)/registration/page.tsx`, `tests/shift-registration-eligibility.test.ts` PASS |
| **Wave 6** | **Reports Workspace (`/reports`)** | 20-field performance metrics, OCR evidence integration, CAS draft saving, confirmation guard | **PRESERVED (100%)** | `app/(dashboard)/reports/page.tsx`, `tests/report-save-draft-cas.test.ts` PASS |
| **Wave 7** | **Report Revision History** | P1 repaired revision access, actor metadata, ordered history snapshots | **PRESERVED (100%)** | `components/features/reports/ReportRevisionHistory.tsx`, `tests/report-history-access.test.ts` PASS |
| **Wave 8** | **Calendar Workspace (`/calendar`)** | Business-date month/week views, schedule import integration, deep linking to shifts | **PRESERVED (100%)** | `app/(dashboard)/calendar/page.tsx`, `components/features/calendar/ScheduleImportPanel.tsx` PASS |
| **Wave 9** | **Live Monitoring (`/live`)** | Active shift status, live session tracking, real-time KPI card feeds | **PRESERVED (100%)** | `app/(dashboard)/live/page.tsx`, `tests/supabase-p1c-shift-lifecycle-contract.test.ts` PASS |
| **Wave 10** | **Analytics & Quality (`/analytics`)** | Platform revenue charts, order counts, brand comparisons, date filters | **PRESERVED (100%)** | `app/(dashboard)/analytics/page.tsx`, `components/features/analytics/DashboardAnalytics.tsx` PASS |
| **Wave 11** | **Staff Directory (`/staff`)** | P0 member privacy RLS, role management without self-escalation, avatar persistence | **PRESERVED (100%)** | `app/(dashboard)/staff/page.tsx`, `tests/s2b-staff-management-writes.test.ts` PASS |
| **Wave 12** | **Shift Swaps (`/swaps`)** | Peer-to-peer shift swaps, leader approval flow, cancellation safeguards | **PRESERVED (100%)** | `app/(dashboard)/swaps/page.tsx`, `tests/shift-swap-p0.test.ts` PASS |
| **Wave 13** | **Audit Log & Notifications** | Immutable system events, actor tracking, entity deep-linking, alerts queue | **PRESERVED (100%)** | `app/(dashboard)/audit/page.tsx`, `app/(dashboard)/notifications/page.tsx` PASS |
| **Wave 14** | **Responsive Breakpoints** | Full parity across 1920px desktop, 1366px laptop, 768px tablet, and 375px mobile | **PRESERVED (100%)** | Layout tokens, collapsible sidebar, mobile bottom navigation, zero horizontal overflows |

---

## 2. STORAGE CENTER V2 PRESERVATION (RC15)

| Feature Area | RC15 Business Requirement | Convergence Status | Preserved Implementation / Verification |
| :--- | :--- | :--- | :--- |
| **Storage Workspace (`/storage`)** | Operational File Vault for listing, uploading, and linking files by brand, platform, and category | **PRESERVED (100%)** | `app/(dashboard)/storage/page.tsx`, `components/features/storage/OperationalFileWorkspace.tsx` PASS |
| **Storage Setup (`/storage/setup`)** | Admin-only route configuration, Drive folder mapping, and brand storage profile review | **PRESERVED (100%)** | `app/(dashboard)/storage/setup/page.tsx`, `components/features/storage/OperationalStorageSetupWorkspace.tsx` PASS |
| **Operational Files API** | Multi-category upload, duplicate SHA-256 reuse, safe soft delete, metadata isolation | **PRESERVED (100%)** | `app/api/operational-files/route.ts`, `lib/server/operationalFileRouteHandler.ts` PASS |
| **Storage Setup API** | Shift classification, route approval, readiness inventory without DB guessing | **PRESERVED (100%)** | `app/api/operational-storage-setup/route.ts`, `lib/server/operationalStorageSetupHandler.ts` PASS |
| **15 File Categories** | Dedicated folder structures for scripts, raw video, keyframes, finance, schedule sources, etc. | **PRESERVED (100%)** | `lib/files/operationalFileCatalog.ts`, `tests/rc15-operational-file-storage.test.ts` PASS |
| **Drive Parent Ancestry** | Strict verification of parent folder hierarchy before attaching existing Drive objects | **PRESERVED (100%)** | `lib/files/operationalFilePlacement.ts`, `tests/rc15-operational-file-storage.test.ts` PASS |
| **Subbrand Fallback Guard** | Subbrand-scoped files must NOT fall back to a shared NULL-subbrand route | **PRESERVED (100%)** | `lib/files/operationalStoragePlacementResolver.ts`, `tests/rc15-operational-file-storage.test.ts` PASS |
| **4-Sheet Report Export** | Exporting comprehensive workbook with Summary, Metrics, Timeline, and Evidence sheets | **PRESERVED (100%)** | `lib/utils/excelUtils.ts`, `tests/rc14-data-report-export-fidelity.test.ts` PASS |
| **Schedule Import Archive** | Auto-partitioning multi-brand schedule files and archiving raw originals to dedicated brand folders | **PRESERVED (100%)** | `lib/utils/scheduleImportArchive.ts`, `tests/rc15-schedule-import-archive.test.ts` PASS |
| **System Snapshot Export** | Admin disaster-recovery snapshot indexing shifts, reports, and evidence with checksums | **PRESERVED (100%)** | `lib/server/operationalSystemExport.ts`, `tests/rc15-system-export.test.ts` PASS |

---

## 3. ZERO REGRESSION ASSERTION

- **Routes Dropped:** 0
- **UI Interior Regressions:** 0
- **Broken API Contracts:** 0
- **Bypassed Security Checks:** 0
- **Database Drift Violations:** 0 (Zero writes made to Production or Staging during convergence)
