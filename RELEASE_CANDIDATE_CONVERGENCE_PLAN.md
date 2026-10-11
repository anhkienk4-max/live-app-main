# RELEASE CANDIDATE CONVERGENCE PLAN — RC14 + RC15

**Project:** OPS Livestream Platform — APP OPS  
**Target Candidate Branch:** `rc/convergence-rc14-rc15`  
**Source Branches:**
- RC14: `integration/rc14-frontend14wave-convergence` (`306dc12`)
- RC15: `fix/rc14-data-report-export-fidelity` (`e5879ab`)  
**Date:** 2026-10-11  

---

## 1. Convergence Objective & Strategy

The objective of this plan is to unite the complete **14-Wave High-Fidelity Frontend** (from RC14) with the enterprise **Storage Center V2 & Operational Files Workspace** (from RC15) into a single, cohesive, rock-solid release candidate.

### Core Convergence Invariants:
1. **Zero Loss of 14-Wave Frontend:** Retain all approved high-fidelity designs, dark operations frame (`#082743`), persistent `ProductionAppShell`, and responsive drawer/dialog geometries.
2. **Zero Loss of Storage Center V2:** Retain the full `/storage` and `/storage/setup` workspaces, 15 operational categories, provider ancestry validation, 4-sheet report export, and schedule auto-archiving.
3. **Zero Loss of Shift Registration & Staffing:** Retain dedicated routes `/registration`, `/shifts`, `/staffing`, approval modals, candidate exchange drawers, and privacy projections.
4. **Zero Compromise on Security:** Retain P0 Member Privacy (`20261008160638`), P1 Revision History Repair (`20261008160645`), CAS optimistic locking, and provider fail-closed access guards.

---

## 2. Preservation Proof: Capabilities Retained from RC14

The following assets and contracts from RC14 are strictly preserved in the convergence candidate:

| Area | Retained Component / Asset | Preservation Guarantee |
| :--- | :--- | :--- |
| **Dark Operations Shell** | `components/layout/ProductionAppShell.tsx`, `Sidebar.tsx`, `Header.tsx` | Keeps `#082743` navy frame, profile card, persistent geometry, and active link resolution across all routes. |
| **14-Wave Interiors** | `components/features/*` (all 14 waves) | Reports, Analytics, Calendar, Shifts, Staffing, People, Swaps, Notifications, Import, Audit, Settings, Auth, Live Ops maintain pixel-level design fidelity. |
| **Operational Routes** | `app/(dashboard)/registration/page.tsx`<br>`app/(dashboard)/shifts/page.tsx`<br>`app/(dashboard)/staffing/page.tsx` | Dedicated shift management and registration review workspaces remain accessible in navbar and router. |
| **Member Privacy Service** | `lib/services/supabaseStaffingReadService.ts` | `withShiftStaffingSummary(client, ...)` ensures regular members only see authorized capacity counts and approved names. |
| **Privacy & Revision Migrations** | `supabase/migrations/20261008160638...`<br>`supabase/migrations/20261008160645...` | P0 RLS isolation on `shift_registrations`/`business_users` and P1 `get_report_revisions` RPC repair remain staged for Production cutover. |
| **Mutation Cache TTL** | `lib/services/supabaseMasterDataService.ts` | Mutation-triggered cache invalidation preventing stale staff lists. |
| **CAS Report Drafts** | `app/api/report-artifacts/route.ts` | Version-checked report update contract enforcing CAS concurrency. |

---

## 3. Integration Proof: Capabilities Grafted from RC15

The following assets and contracts from RC15 are surgically integrated into the convergence candidate:

| Feature Area | Grafted Files / Contracts | Functional Value |
| :--- | :--- | :--- |
| **Storage Center UI** | `app/(dashboard)/storage/page.tsx`<br>`components/features/storage/OperationalFileWorkspace.tsx` | Adds "Kho file" operational workspace supporting 15 file categories, lifecycle actions, and MIME validation. |
| **Admin Route Setup UI** | `app/(dashboard)/storage/setup/page.tsx`<br>`components/features/storage/OperationalStorageSetupWorkspace.tsx` | Admin-only route planning, brand profile review attribution, and paginated unclassified shift review. |
| **Storage APIs** | `app/api/operational-files/route.ts`<br>`app/api/operational-storage-setup/route.ts` | Authenticated file upload, download, list, soft-delete, and route management endpoints. |
| **Storage Libraries** | `lib/files/operationalFileCatalog.ts`<br>`lib/files/operationalFilePlacement.ts`<br>`lib/files/operationalStoragePlacementResolver.ts`<br>`lib/server/operationalFileRouteHandler.ts`<br>`lib/server/operationalStorageSetupHandler.ts`<br>`lib/server/operationalSystemExport.ts` | Full V2 placement resolver, Google Drive parent ancestry verification, fail-closed pathing, and system export. |
| **Schedule Auto-Archive** | `lib/utils/scheduleImportArchive.ts`<br>Integration in `ScheduleImportPanel.tsx` | Automatically archives reviewed schedule workbooks to brand-isolated Drive folders with hidden-sheet leak protection. |
| **4-Sheet Report Export** | `lib/utils/excelUtils.ts` (189 added lines) | Exports comprehensive 4-sheet workbook: Summary, Shifts, Timeline, and Evidence Metadata. |
| **RC15 Database Migrations** | `supabase/migrations/20261011091925...`<br>`supabase/migrations/20261011092015...`<br>`supabase/migrations/20261011092051...` | Staged migration files matching live Production schema. |

---

## 4. Technical File Harmonization Specifications

### 1. `lib/types/database.types.ts`
Unify types from both branches:
- Retain from RC14: `UserDirectoryEntry`, `ShiftStaffingSummary`, `SwapExchangeCandidate`, `staffing_summary?: ShiftStaffingSummary[]`.
- Retain from RC15: `ExecutionSource`, `OperationalCategory`, `OperationalFile`, `OperationalStorageRoute`, `BrandStorageProfile`.

### 2. `lib/services/supabaseShiftService.ts`
Unify shift read and write paths:
- Read methods continue to wrap rows with `withShiftStaffingSummary(client, ...)`.
- Write methods (`create`, `update`) include `execution_source` in allowlists and payloads.
- `update` continues calling 4-parameter `update_shift` RPC with `p_expected_version`.

### 3. `lib/ui/role-ux.ts` and `components/layout/Sidebar.tsx`
- Add `storage: { name: 'Kho file', href: '/storage', icon: FolderArchive, requiredPermissions: ['reports.review'] }` to `navCatalogue`.
- Add `navCatalogue.storage` to `adminNav` and `leaderNav` under `OPERATIONS` group.
- In `Sidebar.tsx`, preserve RC14's dark `#082743` styling and ensure `resolveActiveNavigation` handles `/storage` and `/storage/setup` seamlessly.

### 4. `lib/utils/excelUtils.ts`
- Adopt RC15's 4-sheet report export workbook implementation while maintaining compatibility with RC14 calendar/shift export helpers.

---

## 5. Seven Quality Release Gates

Before the convergence candidate branch can be approved for production cutover, it must pass seven formal gates:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                  SEVEN QUALITY RELEASE CONVERGENCE GATES                     │
├───────────────┬───────────────────────────────┬──────────────────────────────┤
│ Gate 1        │ Typecheck Cleanliness         │ pnpm tsc --noEmit            │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 2        │ ESLint Compliance             │ pnpm next lint               │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 3        │ Unit & Integration Test Suite │ pnpm test (All RC14 + RC15)  │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 4        │ Production Build Verification │ pnpm build                   │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 5        │ Staging Migration Rehearsal   │ Dry-run P0/P1 on STAGING     │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 6        │ Backup & Restore Rehearsal    │ Staging backup & verify SQL  │
├───────────────┼───────────────────────────────┼──────────────────────────────┤
│ Gate 7        │ Provider E2E Verification     │ Upload/GET/Delete cycle test │
└───────────────┴───────────────────────────────┴──────────────────────────────┘
```

### Detailed Gate Specifications:

1. **Gate 1 (Typecheck):** Zero TypeScript compilation errors across all unified types.
2. **Gate 2 (Lint):** Zero ESLint errors or unhandled warnings under `eslint.config.mjs`.
3. **Gate 3 (Tests):**
   - RC14 suites: `f6-import.test.ts`, `persistent-audit.test.ts`, `shift-detail-foundation.test.tsx`, `supabase-shift-runtime.test.ts`.
   - RC15 suites: `rc15-operational-file-storage.test.ts`, `rc15-storage-setup.test.ts`, `rc15-schedule-import-archive.test.ts`, `rc15-system-export.test.ts`, `rc14-data-report-export-fidelity.test.ts`.
4. **Gate 4 (Build):** Next.js production build completes successfully with static export generation and no dynamic route bailout errors.
5. **Gate 5 (Staging Rehearsal):** Apply forward-only P0 (`20261008160638`) and P1 (`20261008160645`) scripts on Staging. Verify schema migrations table.
6. **Gate 6 (Backup Rehearsal):** Export schema dump and verify restore procedure in test container.
7. **Gate 7 (Provider E2E):** Execute non-confidential physical test on Storage V2 route:
   - Upload small benign test artifact (`.png` / `.pdf`).
   - Read back file metadata from `operational_files`.
   - Verify provider file link redirection.
   - Execute soft-delete and verify provider removal.

---

## 6. Execution Protocol: Creating the Convergence Branch

```bash
# 1. Start from RC14 integration worktree
cd "C:\Users\KienNguyen\Downloads\KIEN ADA code\OPS LIVESTREAM PLATFORM\live-app-integration-rc14"

# 2. Create convergence candidate branch
git checkout -b rc/convergence-rc14-rc15

# 3. Graft RC15 storage center and fidelity files (cherry-pick or selective checkout)
git checkout origin/fix/rc14-data-report-export-fidelity -- \
  app/(dashboard)/storage \
  app/api/operational-files \
  app/api/operational-storage-setup \
  components/features/storage \
  lib/files/operationalFileCatalog.ts \
  lib/files/operationalFilePlacement.ts \
  lib/files/operationalStoragePlacementResolver.ts \
  lib/server/operationalFileRouteHandler.ts \
  lib/server/operationalStorageSetupHandler.ts \
  lib/server/operationalSystemExport.ts \
  lib/utils/scheduleImportArchive.ts \
  supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql \
  supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql \
  supabase/migrations/20261011092051_rc15_operational_files.sql \
  tests/rc14-data-report-export-fidelity.test.ts \
  tests/rc15-operational-file-storage.test.ts \
  tests/rc15-schedule-import-archive.test.ts \
  tests/rc15-storage-setup.test.ts \
  tests/rc15-system-export.test.ts

# 4. Harmonize modified files (types, services, sidebar, role-ux, excelUtils)
# 5. Execute 7 Quality Gates
# 6. Push to origin/rc/convergence-rc14-rc15
```
