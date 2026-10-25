# ADA OPS RC19 — U08 STORAGE / FILE MANAGEMENT HANDOFF (REFINED)

**Module**: U08 Storage & File Management  
**Route**: `/storage`  
**Worktree**: `live-app-full-upgrade`  
**Branch**: `feat/ops-full-app-upgrade-rc19`  
**Author**: Gemini Agent  
**Status**: **GO** (U08 Storage Refined & Verified; External Provider UAT on HOLD pending live credentials)

---

## 1. Executive Summary & Refinement Details

Following Task 1 (U08 Storage Data Integrity Fixes), the Enterprise Storage Explorer in `components/features/storage/OperationalFileWorkspace.tsx` was refined with strict data integrity:

### 1.1 Directory Tree & Breadcrumbs Data Integrity
- **Dynamic Date & Period Resolution**: Folder period names are dynamically extracted from selected `periodDate` (YYYY-MM).
- **No Hardcoded Defaults**: Eliminated hardcoded year "2026", month "10", or forced "P10" period labels for Mars/Opella. If no date is selected, tree displays `(Chưa chọn ngày)`.
- **Three-Tier Folder Verification Status**:
  1. `Thư mục đã xác minh từ metadata`: Displayed when matching files/artifacts have been retrieved from backend metadata.
  2. `Thư mục đã chuẩn bị`: Displayed when provider folder was prepared via provider action.
  3. `Cấu trúc logic (Chưa xác minh provider)`: Clearly labelled fallback when folder is planned logically without confirmed provider existence.
- **Fail-Closed Legacy & Clean Paths**: Preserves existing legacy structures (such as Mars dash fallback and Opella period structures) without injecting invented canonical folders.

### 1.2 Provider Connection Status Integrity
- **Removed Hardcoded Green Badges**: Eliminated fake green pulsing dots for Google Drive and OneDrive.
- **Honest Runtime Status**: Displays neutral `Chưa xác minh` indicator with descriptive tooltip explaining that no backend health check API exists and mock/static writes are not used for ping testing.
- **Differentiated Route Count**: Clearly separates provider connectivity status from database Storage Route counts (`Storage Routes: N route(s) CSDL`).

### 1.3 Scope Validation & Fail-Closed Guards
- **Strict Scope Guard**: Actions requiring scope (Upload, Attach) are strictly disabled when `brand_id`, `platform_id`, or `period_date` (or `shift_id`) are missing.
- **Clear Guidance**: Warning alert guides the operator to complete the scope before attempting file operations.
- **Stale Scope Clearing**: Changing Brand, Platform, or Period immediately purges current file list, inspect panel, error states, and loaded keys to prevent cross-scope data bleeding.

### 1.4 Granular RBAC Permissions
- **Separation of Concerns**: Granular checks for `canView`, `canWrite`, `canExport`, and `canDeleteFile(category)`.
- **Member Access Denied**: Members (role: staff, system_permission: member) are denied access to `/storage` entirely with an alert banner.
- **Confidential Delete Restriction**: Regular Leaders cannot delete confidential Finance files; only Admins can delete confidential artifacts.
- **Safe Access URLs**: Download and view links strictly validate that URLs use safe protocols (`http:` or `https:`) before opening.
- **Dynamic File Limit**: Upload limit dynamically reads from catalog `max_single_upload_bytes` rather than hardcoding 4MB.

---

## 2. Verification Evidence

### 2.1 Unit Tests (Node Test Runner)
- Focused storage suites: **55/55 PASS**
- All 18 storage test suites: **247/247 PASS**
- Full release regression: **1989/1989 PASS** (3 optional staging skipped)

### 2.2 Playwright E2E Tests
Config: `playwright.rc19-storage.config.ts`
Spec: `e2e/rc19-storage-explorer.spec.ts`
- **Test 1**: Storage Explorer interactive features at 390px (vi) — **PASS**
- **Test 2**: Storage Explorer interactive features at 1440px (en) — **PASS**
- **Test 3**: Storage RBAC: Member user (id: 3) denied access with alert — **PASS**

### 2.3 Visual Artifacts
- `docs/handoffs/evidence/rc19-u08-storage-after-1440-en.png`
- `docs/handoffs/evidence/rc19-u08-storage-after-390-vi.png`

---

## 3. Module Status: GO / UAT HOLD
- **Code & Security Gates**: **GO** (0 type errors, 0 ESLint errors, 100% test pass).
- **Provider Live Credentials**: **UAT HOLD** (Real Google Drive & OneDrive OAuth token exchange requires production cloud credentials).
