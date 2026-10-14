# RC1.6I Post-main delta matrix

Main baseline: `d166bd74eb77692a7609cc6c9f3e510053da5edf`.
Dirty worktree HEAD: `5ea8298a116267a2f463cc3c86761c04d92ccde9`, MERGE_HEAD `7dddb168e82dbd49cf3b91d7cfc3ac451ed25478`. Không abort/reset/clean/switch dirty worktree.

Backup local: `.worktrees/rc16i-backup-2026-10-12T08-13-56-319Z`; ba binary patches, inventory, complete comparison và 35 untracked file copies đã hash-verify.

| Patch | SHA256 |
|---|---|
| staged.patch | ca23fabd4b4f3ef005aa8fe67be58ed2b673daa8a7a23f755c342f61a81e0779 |
| unstaged.patch | 94e24720ac5ff7e4c57b124f666ab85bcff0b1b2b49d42a3c526b2ca9c9dab1d |
| complete-vs-main.patch | d211dd2bf720a8cdfa501b9fec4ebbf34e7a1f81f5c2be6529da26cb66473987 |

Complete comparison gồm 1.077 ALREADY_IN_MAIN, 40 DIFFERENT, 21 RC16I_ONLY và 11 MAIN_ONLY. Nội dung text được so LF/CRLF-normalized; SHA256 raw giữ trong local comparison.json. ALREADY_IN_MAIN bị loại khỏi port. Historical registered worktrees không truy cập được được ghi UNAVAILABLE, không prune/alter.

| File | Comparison | Decision | Reason |
|---|---|---|---|
| `.gitattributes` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `.github/workflows/rc-convergence-gate.yml` | DIFFERENT | PARTIAL_PORT | Bổ sung trigger nhánh/PR main; giữ full inventory/OCR/PG17/build/browser của main. |
| `.github/workflows/rc16-workforce-payroll-gate.yml` | DIFFERENT | PARTIAL_PORT | Bổ sung path/trigger và UI regression Node22/24; giữ PG16/17 và security gates. |
| `.gitignore` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `app/(dashboard)/payroll/page.tsx` | DIFFERENT | PARTIAL_PORT | Giữ client page/gate main; latest-read, truyền audit, CSV authenticated. |
| `app/(dashboard)/workforce/page.tsx` | DIFFERENT | PARTIAL_PORT | Giữ gate/role scope main; bỏ response overview cũ khi filter đổi. |
| `components/features/calendar/ListView.tsx` | DIFFERENT | NO_PORT | Giữ main và staffing resolver đã tích hợp; không refactor Calendar. |
| `components/features/dashboard/DashboardOverview.tsx` | DIFFERENT | NO_PORT | Giữ Dashboard main, ngoài phạm vi hardening. |
| `components/features/payroll/ApprovedEvidencePicker.tsx` | RC16I_ONLY | NO_PORT | Không port feature discovery mới; giữ prepare contract main, không suy diễn attendance. |
| `components/features/payroll/PayrollAuditTimeline.tsx` | DIFFERENT | PARTIAL_PORT | Thêm detail đầy đủ snapshot/UUID/action/version, không sửa audit. |
| `components/features/payroll/PayrollDraftWorkspace.tsx` | DIFFERENT | PARTIAL_PORT | Port retry intent cố định, edited-retry rejection, 409 refetch, review-author restriction, labels; giữ canTransition Admin, dialog containment và integer step=1 của main. |
| `components/features/payroll/PayrollPageWorkspace.tsx` | RC16I_ONLY | NO_PORT | Không split/replace page main bằng workspace cũ. |
| `components/features/payroll/PayrollPeriodManager.tsx` | DIFFERENT | PARTIAL_PORT | Latest-read, clear stale rows, labels, CSV authenticated; giữ error states/pagination main. |
| `components/features/payroll/PayrollRateManager.tsx` | DIFFERENT | PARTIAL_PORT | Latest-read và labels; giữ approved inputs trống, integer/range checks và 4-decimal OT của main. |
| `components/features/shifts/ActualStaffingPanel.tsx` | DIFFERENT | PARTIAL_PORT | Latest-read, labels và UNKNOWN copy; giữ identity gate, null no-show, version/independent review và recovery main. |
| `components/features/shifts/ShiftCard.tsx` | DIFFERENT | NO_PORT | Main đã có staffing resolver/imported labels; không port lại. |
| `components/features/shifts/ShiftDetailModal.tsx` | DIFFERENT | PARTIAL_PORT | Gate actual tab/content theo capability; giữ layout và logic ca main. |
| `components/features/workforce/WorkforceIndividualView.tsx` | DIFFERENT | PARTIAL_PORT | Đọc đúng performance contract; latest-read và clear stale result. |
| `components/features/workforce/WorkforceModuleGate.tsx` | RC16I_ONLY | NO_PORT | Main đã gate pages và identity-keyed workspace; không tạo gate thứ hai. |
| `components/layout/BottomNav.tsx` | DIFFERENT | PARTIAL_PORT | Lọc capabilities sau RBAC; giữ layout mobile main. |
| `components/layout/Header.tsx` | DIFFERENT | PARTIAL_PORT | Lọc capabilities sau RBAC; giữ header main. |
| `components/layout/ProductionAppShell.tsx` | DIFFERENT | NO_PORT | Giữ shell main; không port provider/layout cũ. |
| `components/layout/Sidebar.tsx` | DIFFERENT | PARTIAL_PORT | Lọc capabilities sau RBAC; giữ sidebar main. |
| `components/providers/WorkforceCapabilitiesProvider.tsx` | RC16I_ONLY | NO_PORT | Không thay main hook bằng provider/source capabilities thứ hai. |
| `docs/workforce/RC16_UI_INTEGRATION.md` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `docs/workforce/rc16i/screenshots/payroll-audit-mobile.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/payroll-disabled-desktop.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/payroll-draft-desktop.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/payroll-terminal-void.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/shift-actual-timeline.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/workforce-individual-mobile.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `docs/workforce/rc16i/screenshots/workforce-team-desktop.png` | RC16I_ONLY | NO_PORT | Giữ ảnh cũ trong backup; evidence mới lấy từ lần Playwright final và CI artifacts. |
| `e2e/rc16-workflow.spec.ts` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `e2e/rc16i-workforce-payroll.spec.ts` | RC16I_ONLY | PARTIAL_PORT | Port tests vào rc16i-postmain.spec.ts, điều chỉnh đúng UI/messages main; thêm edited retry, 409, malformed caps và audit-author checks. |
| `lib/files/operationalStoragePlacementResolver.ts` | DIFFERENT | NO_PORT | Giữ exact route ambiguity fail-closed fix main. |
| `lib/hooks/useCurrentUser.ts` | DIFFERENT | NO_PORT | Main đã derive Supabase business identity hiện hành; không port implementation cũ. |
| `lib/hooks/useWorkforceCapabilities.ts` | MAIN_ONLY | PARTIAL_PORT | Giữ identity key/cancellation main; thêm invalidation abort và focus/visibility recheck. |
| `lib/server/reportImageRouteHandler.ts` | DIFFERENT | NO_PORT | Main đã có strict 7-MIME Production allowlist; không thêm validation trùng. |
| `lib/services/workforceService.ts` | DIFFERENT | PARTIAL_PORT | Strict capabilities, typed invalidation, authenticated CSV, performance response; giữ messages và endpoint contracts main. |
| `lib/ui/workforceNavigation.ts` | RC16I_ONLY | PARTIAL_PORT | Port helper lọc navigation; không tạo thêm RBAC source. |
| `lib/utils/calendarFilters.ts` | DIFFERENT | NO_PORT | Giữ filter contract main; old staffing context không cần cho patch. |
| `openspec/changes/rc16-ui-recovery/proposal.md` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `openspec/changes/rc16-ui-recovery/tasks.md` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `openspec/changes/rc16i-ui-integration/proposal.md` | RC16I_ONLY | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `package.json` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `playwright.rc16.config.ts` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `playwright.rc16i.config.ts` | RC16I_ONLY | PARTIAL_PORT | Config mới chạy cả main và post-main, loopback/synthetic only; cả hai flags server OFF. |
| `pnpm-lock.yaml` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `project-memory/current-state.json` | DIFFERENT | NO_PORT | Không copy checkpoint cũ; derive facts mới bằng memory:sync. |
| `project-memory/evidence/RC16UI-integration.md` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `project-memory/generated/project-memory.md` | DIFFERENT | NO_PORT | Không copy projection cũ; generate từ canonical current-state. |
| `scripts/rehearse_db_clone.mjs` | DIFFERENT | NO_PORT | Giữ portable PGlite rehearsal main; không port native adapter cũ. |
| `scripts/run-final-regression.mjs` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `scripts/workforce/rc16i-combined-manifest.mjs` | RC16I_ONLY | NO_PORT | Không port kế hoạch/schema snapshot/migration executor cũ: Operator xác nhận RC16 đã applied; không replay/reconcile cloud ledger. |
| `supabase/release/final-integration/manifest.json` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `supabase/release/rc16i/manifest.json` | RC16I_ONLY | NO_PORT | Không port kế hoạch/schema snapshot/migration executor cũ: Operator xác nhận RC16 đã applied; không replay/reconcile cloud ledger. |
| `tests/e1-role-ux.test.ts` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `tests/final-release-test-manifest.json` | MAIN_ONLY | PARTIAL_PORT | Giữ manifest main, thêm đúng test mới để full inventory không bỏ sót. |
| `tests/fixtures/rc16i_production_storage_catalog.json` | RC16I_ONLY | NO_PORT | Không port kế hoạch/schema snapshot/migration executor cũ: Operator xác nhận RC16 đã applied; không replay/reconcile cloud ledger. |
| `tests/h4-storage-route-security.test.ts` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `tests/h52-db-auth-integration.test.ts` | DIFFERENT | NO_PORT | Main đã dùng pinned PGlite package, không cần adapter SQL mới. |
| `tests/preview-loading-performance.test.tsx` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `tests/rc16-environment-security.test.ts` | DIFFERENT | PARTIAL_PORT | Giữ security cases main; cập nhật exact no-auto-deploy assertion gồm nhánh hardening. |
| `tests/rc16-payroll-postgres.integration.mjs` | DIFFERENT | NO_PORT | Giữ runner main nguyên vẹn, chạy lại trong container mới. |
| `tests/rc16-ui-session-contract.test.tsx` | MAIN_ONLY | KEEP_MAIN | Giữ nguyên source/test/docs main; không wholesale port nhánh cũ. |
| `tests/rc16h-production.integration.mjs` | DIFFERENT | NO_PORT | Giữ isolated rehearsal main; không gọi executor cloud. |
| `tests/rc16i-combined.integration.mjs` | RC16I_ONLY | NO_PORT | Không port kế hoạch/schema snapshot/migration executor cũ: Operator xác nhận RC16 đã applied; không replay/reconcile cloud ledger. |
| `tests/rc16i-postgres-session.mjs` | RC16I_ONLY | NO_PORT | Không port kế hoạch/schema snapshot/migration executor cũ: Operator xác nhận RC16 đã applied; không replay/reconcile cloud ledger. |
| `tests/rc16i-ui.test.tsx` | RC16I_ONLY | PARTIAL_PORT | Port 5 tests vào rc16i-postmain.test.tsx; thêm event invalidation test. |
| `tests/security-qa-header-trust.test.ts` | DIFFERENT | NO_PORT | Giữ source/test/config main; delta này không cần để sửa lỗi được xác minh. |
| `tests/staging-release-blockers.integration.test.ts` | DIFFERENT | NO_PORT | Main đã opt-in STAGING_RELEASE_BLOCKERS_RUN; không chạy cloud checks. |
| `vercel.json` | DIFFERENT | PARTIAL_PORT | Giữ defaults main; thêm false riêng nhánh hardening, không deploy/env change. |

New worktree nằm ở `.worktrees/rc16i-postmain`, branch `fix/rc16i-postmain-hardening`, tạo trực tiếp từ main baseline. Không wholesale cherry-pick. Mọi PARTIAL_PORT được sửa trực tiếp trên main, giữ main-specific validation/messages/role gates/layout. Additional post-main changes: existing main browser CSV test now exercises authenticated download, new OpenSpec/docs/evidence; no SQL/backend calculation/RLS/auth resolver edits.

Fresh preservation on 2026-10-12: `C:/Users/KienNguyen/Downloads/KIEN ADA code/OPS LIVESTREAM PLATFORM/live-app-rc16-payroll/.worktrees/rc16i-preservation-20261012-213247`. Original staged/unstaged/complete patch hashes match the earlier backup exactly; 35 original untracked files and 8 pre-existing post-main untracked files copied and SHA256-verified. All registered worktree statuses inventoried; unavailable historical worktrees left untouched. Reused the already-created post-main worktree at exact d166bd7, preserving its uncommitted patch before review.

Final additions: audit-loading mutation gate in payroll page; 28 passing final browser cases including delayed reads, both correction/void 409 branches, missing audit and exact CSV bytes; explicit Vietnamese test locale. next-env.d.ts is generated by Next and excluded from selective staging; production build restored it to main content. Canonical repository identity/inventory sync changes only objective facts, preserving every business/release decision.
