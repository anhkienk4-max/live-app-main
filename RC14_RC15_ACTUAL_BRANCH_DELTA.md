# RC14 / RC15 ACTUAL BRANCH DELTA — TWO-WAY TECHNICAL AUDIT

**Repository:** `anhkienk4-max/live-app-main`  
**Common Merge-Base:** `31efea2d1a60583975e96773f68106d46ab7d8d9` (`origin/main`)  
**Branch A (RC14):** `integration/rc14-frontend14wave-convergence` (HEAD `306dc1242dcd7e8cfebd6afde01b23b438e9be68`, 76 commits ahead of base)  
**Branch B (RC15):** `fix/rc14-data-report-export-fidelity` (HEAD `e5879abeff7a1a4ffbf8222093047bb5882456dc`, 71 commits ahead of base)  
**Audit Date:** 2026-10-11  

---

## 1. Branch Topology & Divergence Analysis

RC14 and RC15 are **independent parallel branches** developed concurrently on top of `origin/main` (`31efea2`). Neither is a parent or superset of the other.

```
Total Files Changed Between RC14 and RC15: 225
├── Files Present ONLY in RC14 (Missing in RC15): 102
├── Files Present ONLY in RC15 (Missing in RC14): 28
└── Files Modified in Both: 95
```

---

## 2. Inventory: Commits Only in RC14

RC14 contains 76 commits focused on high-fidelity frontend convergence, dark operational app frame, shift registration & staffing workflows, and P0/P1 security/data patches.

| Scope | Commit Range / Key Hashes | Functional Capability |
| :--- | :--- | :--- |
| **P0 Security Patch** | `16410c1`, `bf0995c`, `8892f36` | Migration `20261008160638`: Restricted Member Registration & Directory access, RLS scoped selects, RPCs `get_staff_directory`, `get_shift_staffing_summary`, `get_swap_exchange_candidates`. |
| **P1 Report RPC Repair** | `75ea1a8`, `482dde0` | Migration `20261008160645`: Repaired `get_report_revisions` RPC with clean column references and permission check. |
| **Dark Operations Shell** | `b25b902`, `e2db192`, `66faaee`, `5537a61` | Persistent `ProductionAppShell`, dark operational frame (`#082743`), unified sidebar geometry, fixed header metrics, containerized dialogs. |
| **14-Wave Frontend Interiors** | `29a14ac`, `ef6210e`, `c6c8562`, `899a143`, `6b62bb9`, `0a906c8`, `c94b45f`, `a66323e`, `5592152`, `c29d741`, `2e5c023`, `9089242`, `1987a89`, `deb8ce4` | Complete production interior rewrites matching reference mocks for Reports, Analytics, Calendar, Shifts, Staffing, People, Swaps, Notifications, Import, Audit, Settings, Auth, Live Ops. |
| **Registration & Staffing Workspaces** | `3252051`, `09b14a7`, `69a5932`, `164886b` | Dedicated routes `/registration`, `/staffing`, `/shifts` with approval dialogs, candidate exchange drawers, and registration audits. |
| **Runtime Cache & Concurrency** | `c2ffba0`, `3a24254`, `0a455d9` | Cache TTL invalidation on staff mutations; CAS report draft version checking; resolved loading state timeouts. |

---

## 3. Inventory: Commits Only in RC15

RC15 contains 71 commits focused on Storage Center V2, operational file catalog, Google Drive parent ancestry verification, schedule source auto-archiving, campaign file vaults, and bounded system exports.

| Scope | Commit Range / Key Hashes | Functional Capability |
| :--- | :--- | :--- |
| **RC15 Database Migrations** | `df5f7bc`, `da94d97`, `492bd28`, `243a9cb` | Migrations `20261011091925` (route prerequisites, brand profile drop default), `20261011092015` (shift RPC compatibility with MD5 checks), `20261011092051` (operational_files table with SHA-256 integrity). |
| **Operational Storage Workspace** | `3223a07`, `885d090`, `522524b`, `3e2cbf8` | New route `/storage` ("Kho file" in nav), 15 operational categories, upload/download/soft-delete lifecycle, category filter chips. |
| **Admin Route Setup & Classification** | `23214f8`, `454931d`, `3a0c9db`, `90166ed`, `dd4fcd7` | New route `/storage/setup` for Admin-only brand profile assignment, Drive parent ancestry validation, and single-shift CAS classification. |
| **Historical Shift Review** | `dee69cc`, `cecb854`, `f6fbc86`, `fa38d32` | Paginated review API and UI for 771 unclassified shifts (`execution_source IS NULL`); strict enforcement of NO bulk backfill. |
| **Drive Ancestry & Placement** | `8a3935c`, `27c9c6a`, `1dd0e47`, `3c5f604` | Scoped Drive placement resolver, exact folder ancestry validation (`LIVESTREAM REPORT → Brand → 2026 → THÁNG 09.2026 → SHOPEE_LIVE`). |
| **Schedule Source Auto-Archive** | `65beb8e`, `6855c16`, `22508ff`, `98b0749`, `ef0c6f9` | Auto-archives reviewed schedule sources into brand-isolated Drive folders with hidden-sheet leak protection (`d5a420a`, `0ae317f`). |
| **Campaign File Vault** | `0bd72c1`, `91dcef8`, `64b5987`, `de36fc5` | Contextual Content/Production file vault bound to verified brand, platform, date, and campaign ID. |
| **4-Sheet Report Export** | `bbeee27`, `f1b8062`, `a4ba5ad` | Preserves metric semantics and generates 4-sheet detail workbook (Summary, Shifts, Timeline, Evidence Metadata). |
| **Admin System Export** | `963f6f5`, `ef02528`, `99488eb`, `4af3abc` | Bounded daily snapshot of shifts/reports/KPIs directly to provider with idempotent index. |

---

## 4. UI & API Routes Comparison

### UI Routes (`app/**/page.tsx`)

| Route Path | Present in RC14 | Present in RC15 | Release Impact / Action Needed |
| :--- | :---: | :---: | :--- |
| `app/(dashboard)/storage/page.tsx` | ❌ **MISSING** | ✅ **PRESENT** | Storage Center Workspace ("Kho file"). **Must be integrated into RC14 shell.** |
| `app/(dashboard)/storage/setup/page.tsx` | ❌ **MISSING** | ✅ **PRESENT** | Admin Storage Setup & Route Planning. **Must be integrated into RC14 shell.** |
| `app/(dashboard)/registration/page.tsx` | ✅ **PRESENT** | ❌ **MISSING** | Shift Registration Review Workspace. **Must NOT be lost in convergence.** |
| `app/(dashboard)/shifts/page.tsx` | ✅ **PRESENT** | ❌ **MISSING** | Shifts Operational Management Workspace. **Must NOT be lost in convergence.** |
| `app/(dashboard)/staffing/page.tsx` | ✅ **PRESENT** | ❌ **MISSING** | Staffing Capacity Workspace. **Must NOT be lost in convergence.** |
| `app/visual-qa/page.tsx` | ✅ **PRESENT** | ❌ **MISSING** | Internal visual QA harness (can remain internal or conditional). |

### API Routes (`app/api/**/route.ts`)

| API Route | Present in RC14 | Present in RC15 | Release Impact / Action Needed |
| :--- | :---: | :---: | :--- |
| `app/api/operational-files/route.ts` | ❌ **MISSING** | ✅ **PRESENT** | Authenticated upload, download, list, soft-delete for operational files. **Must be adopted.** |
| `app/api/operational-storage-setup/route.ts` | ❌ **MISSING** | ✅ **PRESENT** | Admin route approval, brand profile update, unclassified shift review. **Must be adopted.** |
| All other 14 API routes | ✅ **PRESENT** | ✅ **PRESENT** | Fully aligned across both branches. |

---

## 5. Database Migrations Comparison

| Migration File | In RC14 | In RC15 | Status on PRODUCTION | Status on STAGING | Release Action |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `20261008160638_member_registration_directory_privacy.sql` | ✅ | ❌ | ❌ **MISSING** | ✅ **APPLIED** | **P0: Forward-apply on PROD.** |
| `20261008160645_repair_report_revision_history_rpc.sql` | ✅ | ❌ | ❌ **MISSING** | ✅ **APPLIED** | **P1: Forward-apply on PROD.** |
| `20261011091925_rc15_storage_route_prerequisites.sql` | ❌ | ✅ | ✅ **APPLIED** | ⚠️ Partial (has RC13A) | **Adopt file in repo. Align Staging.** |
| `20261011092015_rc15_shift_rpc_compatibility.sql` | ❌ | ✅ | ✅ **APPLIED** | ⚠️ Partial (has RC13A) | **Adopt file in repo. Align Staging.** |
| `20261011092051_rc15_operational_files.sql` | ❌ | ✅ | ✅ **APPLIED** | ❌ **MISSING** | **Adopt file in repo. Apply to Staging.** |

---

## 6. Service & Storage Contracts Comparison

| Component / Service | RC14 Contract | RC15 Contract | Convergence Resolution |
| :--- | :--- | :--- | :--- |
| `lib/files/operationalStoragePlacementResolver.ts` | Standard brand/platform path resolution. | Adds 15 operational file categories, Google Drive ancestry verification, and fail-closed V2 path logic. | **Adopt RC15 version.** RC15 preserves all legacy V1 paths while hardening V2. |
| `lib/services/supabaseShiftService.ts` | Injects `withShiftStaffingSummary(client, ...)` to protect member privacy. | Passes `execution_source` in `create_shift` and `update_shift` payloads. | **Unify:** Include `withShiftStaffingSummary` AND pass `execution_source`. |
| `lib/types/database.types.ts` | Defines `UserDirectoryEntry`, `ShiftStaffingSummary`, `SwapExchangeCandidate`. | Defines `ExecutionSource`, `OperationalFile`, `OperationalStorageRoute`. | **Unify:** Include both type definitions. |
| `lib/ui/role-ux.ts` | 14-Wave grouped navigation (`APP OPS`, `OPERATIONS`, `MANAGEMENT`, `SYSTEM`). | Adds `storage: { name: 'Kho file', href: '/storage', icon: FolderArchive }`. | **Unify:** Add `storage` ("Kho file") to RC14's grouped navigation under `OPERATIONS`. |
| `lib/utils/excelUtils.ts` | Standard workbook export. | Comprehensive 4-sheet detail workbook (Summary, Shifts, Timeline, Evidence Metadata). | **Adopt RC15 version.** |
| `components/layout/Sidebar.tsx` | Dark operational theme (`#082743`), profile card, query-aware active link resolution. | Light theme (`bg-sidebar`), basic active route resolution. | **Retain RC14 dark theme**, add `Kho file` link. |

---

## 7. Regression Risk Assessment

1. **Risk 1: Overwriting RC15 on Production with Old RC13A (CRITICAL):**
   - Attempting to run `20260924000000_rc13a_execution_source_storage_routes.sql` on Production would corrupt `brands.storage_profile` constraints, set unauthorized default `'CANONICAL_V1'`, and wipe out MD5-guarded shift RPCs.
   - **Mitigation:** Permanently quarantine RC13A from Production deployment pipelines.
2. **Risk 2: Dropping 14-Wave Frontend During RC15 Merge (HIGH):**
   - If RC15 is merged without preserving RC14's `components/features/*` interiors, the approved high-fidelity designs will be lost.
   - **Mitigation:** Use RC14 as the base for frontend presentation; surgically graft RC15's storage components and routes.
3. **Risk 3: Member Data Leak if P0 Migration is Omitted (HIGH):**
   - If `20261008160638` is omitted from Production, applicant phone numbers and notes remain exposed to members via REST.
   - **Mitigation:** Include P0 in the forward-only Production reconciliation sequence.
4. **Risk 4: Shift Creation/Update Payload Validation Failure (HIGH):**
   - If shift forms send un-whitelisted fields or non-conforming `execution_source` values, RPCs will throw `22023: SHIFT_FIELD_NOT_ALLOWED`.
   - **Mitigation:** Ensure shift form payloads conform strictly to the RC15 allowlist.
