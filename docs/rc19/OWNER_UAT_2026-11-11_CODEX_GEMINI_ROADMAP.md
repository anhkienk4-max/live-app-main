# RC19 Owner Manual UAT 2026-11-11 | Two-lane closure roadmap (Codex C / Gemini G)

> **Status:** Owner-reported defects & change requests captured; **not an implementation or UAT PASS claim**. This document supersedes the older *single Gemini lane* scheduling instruction in #80 **for this new remediation backlog only**. Preserve existing RC19 history, Owner #80's canonical KAO import/segmented shift identity requirements, and existing WIP, no overwriting production sources.
>
> **Repository:** \`anhkienk4-max/live-app-main\` | **Production:** \`ops5729.top\` | **Evidence:** Owner screenshots/manual walkthrough on 2026-11-11; do not silently interpret visual observations as independently verified backend defects.
>
> **Policy:** Docs/issue creation is not permission to push application code, apply migrations, deploy, mutate Production, or mark any functionality FULL PASS.

## GitHub tracking

- **Owner master:** [#173](https://github.com/anhkienk4-max/live-app-main/issues/173)
- **Codex lane C1–C12:** [#174](https://github.com/anhkienk4-max/live-app-main/issues/174)
- **Gemini lane G1–G12:** [#175](https://github.com/anhkienk4-max/live-app-main/issues/175)
- **Documentation-only Draft PR:** [#176](https://github.com/anhkienk4-max/live-app-main/pull/176)
- **Prior release master:** [#80](https://github.com/anhkienk4-max/live-app-main/issues/80) (preserve historical requirements and evidence)

## Governance / shared delivery contract

- **Codex lane C:** backend, data architecture, API, RPC, caching, runtime fault isolation, auth/RBAC, persistence, migration review, contract tests, CI, independent E2E evidence. Publish data/API contracts before Gemini integrates changed functionality.
- **Gemini lane G:** UI/UX, navigation, modal behavior, responsive layout, state restoration, presentation, charting, integration with Codex-approved contracts. Preserve functional APIs and do not perform unreviewed DB changes.
- **No overlapping files:** agents publish a file-ownership list and interfaces; if a shared file is unavoidable, Codex commits API/server contract first and Gemini integrates against that exact commit. Integrator selects commits into an RC19 candidate, never blindly merges/diverges active worktrees.
- **Wave gates:** W0 runtime + PASS/Swap/Staffing blocks → W1 shift/attendance → W2 Overview/Live/Reports/Payroll → W3 catalog/storage/analytics/data quality → W4 full role-based UAT and release.
- **Release gate:** authenticated Admin/Leader/Member UI + API + DB readback + audit + integration + negative/edge cases + evidence. MODULE = FULL PASS only if **every mandatory acceptance scenario** has been verified. Otherwise report PARTIAL/FAIL/BLOCKED/NOT TESTED, including denominator.
- **Production safety:** Staging is currently reported to SQL-timeout despite project health. Validate real Staging URL, DB ref, isolation and OAuth provider before destructive/write tests. Preview/staged Production may point to Production DB; prove binding before writes. Use only approved synthetic fixtures with cleanup ledger. Never edit real shifts/reports/attendance/payroll to force PASS. Preserve audit, evidence and concurrency checks.
- **Known RC19 blocker:** both \`create_shift_swap_request(...)\` and the two-argument \`approve_shift_swap_request(...)\` reference missing \`private.log_shift_audit\`; inspect actual Production definitions and existing \`audit_swap_requests_change\` trigger. Fix with reviewed additive migration only after isolated tests. Do not consider a module PASS based on HTTP 200/source test.
- **Known cleanup:** 2026-11-11 UAT produced soft-deleted \`uat*\` shifts, retained report metadata and six synthetic attendance photo records; retention/Drive object status requires evidence-based classification, not bulk deletion.
- **Performance:** do not just enlarge 20-second timeout. Identify remount, auth refresh, polling, stale request, query and routing causes. Initial render should load critical data first; one-month default scope where sensible, pagination, bounded background prefetch, cache retention and targeted invalidation after mutations. No hiding error states.
- **Notes:** Shift note is a canonical shift property (with allowed edit/import/export) rather than duplicate navigation/page.
- **Calendar:** max 3 simultaneously visible lanes for overlapping events; group only local overlaps above capacity, maintain independent later time blocks and offer detail popup. Never compress all 35/37 daily shifts into one event.
- **Reports:** verify current data calculations and preserve status/metrics across view switches. Photo evidence upload area must appear beneath the exact heading “Tải ảnh dashboard và minh chứng”.
- **Security:** Owner defers creation of separate private Drive root. Do not imply this authorizes public sharing of personnel photos; retain app-level least privilege and block unsafe exposure.

## Workstream sequencing / acceptance matrix

| Wave | Codex contract first | Gemini integration next | Release gate |
|---|---|---|---|
| W0 · P0 | C1, C2, C4, C12 | G1, G2, G4, G12 | No stuck reload, Calendar stable; PASS/Swap & Staffing protected end-to-end; audit paginated |
| W1 · P0/P1 | C3, C5, C6 | G3, G5, G6 | Segments/shift edits persist; Attendance review/payroll basis; in-module navigation |
| W2 · P1 | C7, C11 | G7, G11 | Report/Live/Payroll full workflows; role-aware views |
| W3 · P1/P2 | C8, C9, C10 | G8, G9, G10 | Actual Drive paths, product media, metrics, Data Quality |
| W4 · P0 release | C12 cross-module E2E, regressions, evidence | G12 visual/accessibility interaction audit | 100% mandatory cases in each release-critical module; no unverified source provenance claims |

### Lane C: Codex (technical / backend / QA)

| ID | Wave | Scope and deliverable | Dependencies | FULL PASS acceptance |
|---|---|---|---|---|
| **C1** | W0 P0 | Runtime boot, auth/session, critical-first readiness, suspense/overlay, bounded prefetch, month-scoped queries, navigation cache and idle refresh investigation. Trace why splash returns “Trang đang tải lâu hơn dự kiến” or remounts. | G1, G6 | No inert splash/remount; visible modules hydrate then background widgets; route return preserves state, stale/race/retry/timeout verified |
| **C2** | W0 P0 | Calendar contract: scoped fetch, event/segment range/timezone, overnight 12/11 rendering, concurrency and data reconciliation for 35/37 shifts; stable minute/date indexing and API pagination. | G2, C3 | Correct events before/after reload and idle, all overlaps accessible, no missing shift/duplicate on range change |
| **C3** | W1 P1 | Canonical parent shift + multi-segment staffing model, host/support/technical assignments across different time windows, versions, remove assignment, all editable shift fields; preserve shift identity. See #168. | G3, C5, C6 | 3 segments, multiple hosts, midnight, reassignment, concurrency, import-export, payroll source consistency |
| **C4** | W0 P0 | Staffing assignment and PASS/Swap: fix disabled Assign despite selected shift, missing rows / ordering; review both broken SQL RPC overloads for missing \`private.log_shift_audit\`; audit trigger, approval, notifications, conflict guards. See #73. | G4, C3 | Member PASS and SWAP → recipient → Leader approve/reject → shift/staff/calendar/notification/audit readback; unauthorized and concurrent negative cases |
| **C5** | W1 P1 | Attendance time model: server checkin/checkout timestamps, approved edits, required photos and safe file naming, review, working-time derivation, roster and payroll integration; classify synthetic photo cleanup. See #74, #76, #130, #163. | G5, C11 | Real timestamp visible, photo provider readback, review approval, error/retry, overtime/late, payroll hours tie out; no unauthorized disclosure |
| **C6** | W1 P1 | Canonical shift note field, import/export mapping and full CRUD; execution source legacy/agency contract (do not auto-tag unknown as internal); retain all shift fields in edit. | G3, G6 | Shift note survives import/edit/export/reload, no duplicate note-list workflow, unclassified source behaves explicitly |
| **C7** | W2 P1 | Reports + Live data contract: report state, KPI, artifact sections, dashboard/metrics upload, live viewer URL validation (TikTok Shop URL fallback to public viewer URL), report summaries/status for month-week-day/card/list. See #164, #165. | G7, C8 | Draft→submit→review + metrics/insights + Drive readback, report status persisted across view changes, live URL opens safely |
| **C8** | W3 P1 | Real Google Drive/OneDrive resource-bound tree, choose existing folder/link with explicit confirmation, verify provider ID/parent/path/ACL, lazy creation, readback; no virtual folder impersonating real Drive. See #97, #98. | G8, C7, C9 | Physical folder navigation matches selected provider link, no phantom file paths, idempotent upload/download/retention |
| **C9** | W3 P2 | Brand/Product/SKU/catalog domain and media relations, variant images, visual slot registry, storage association and rights; move brand-access/audit data to admin domain (not product page). See #166. | G9, C8 | Multi-SKU product and gallery persist, visual slots render mapped assets, correct authorized edits and fallback images |
| **C10** | W3 P2 | TikTok/Shopee metric inventory and formula parity for charts (including near-20 indicators if sources support), chart endpoints, Data Quality search/filter/export/pagination. No fabricated data. | G10, C7 | Every metric has source/definition/unit, chart filters and exports tie back to authorized reports |
| **C11** | W2 P1 | Workforce performance aggregation, attendance/payroll hour validation, rates/OT/late penalties, violations/case-policy references, personal payslip RBAC/pagination; appropriate approval gates. | G11, C5, C4 | Independent manual payroll calc reconciles, violation rows link shift/staff/rule, Member sees only own payslip/cases, Admin review correct |
| **C12** | W0+W4 P0 | Audit History query timeout root cause, indexed scoped/cursor pagination, no unbounded audit rows; security and Full Functional QA harness, role/environment matrix, exact SHA/deployment attestation, UAT fixture accounting and CI. | G12, all | Audit loads scoped pages, all role/error/idle scenarios evidenced; clean release artifacts; Staging ≠ Preview ≠ Production recorded, no undocumented data writes |

### Lane G: Gemini (UI / UX / frontend integration)

| ID | Wave | Scope and deliverable | Needs Codex | FULL PASS acceptance |
|---|---|---|---|---|
| **G1** | W0 P0 | ADA boot splash remains only while essential Overview is not ready; no flash back to splash on tab route; per-region skeleton; Overview **5** important shortcuts and “Xem tất cả”; upcoming shifts show Host/Support name/avatar and vacancy. | C1, C5 | First stable Overview shows 5, expansion works, card identity matches real shift assignments |
| **G2** | W0 P0 | Calendar responsive week/day/month/list modes **within Calendar**, <=3 overlapping columns, localized groups, distinct 12/11 event, popup for overflow/week details, keep scroll/filter after edit. | C2 | No massive single 35/37 tile, overnight correct, all shifts inspectable and click/drag/resize actions governed by rights |
| **G3** | W1 P1 | Full Shift Detail/Edit modal for all fields: dynamic “Thêm khung giờ” by Host/Trợ/Technical and overlaps, remove assignment; notes included; Save/Cancel returns to same calendar/tab/scroll. | C3, C6 | Edit parent/segments, save version, read back, stay in same module, validated errors |
| **G4** | W0 P0 | Staffing list defaults upcoming/newest-first relative to now, controls for missing shifts, selected row enables valid Assign, cancel/unassign, full PASS/Swap status and actor flows. | C4 | Assign actually persists, revoke/replace and alerts/approval visible, no false enabled/disabled state |
| **G5** | W1 P1 | Merge Member “Ca của tôi” and attendance action surfaces without merging backend concepts; actual in/out time, photo upload/rename, approval/rejection timeline; Admin/Leader review remains separate. | C5 | Timestamp visible beside evidence, reviewed changes and payroll basis track, no duplicate competing user flows |
| **G6** | W1 P1 | Unified role-aware navigation: remove duplicate “Quản lý tài khoản” from sidebar, product does not contain brand permissions/audit; internal view switches never redirect to global Calendar; shift notes not a parallel list of shifts. | C1, C6, C9 | Correct deep links/back-button/tab scope and role-specific availability |
| **G7** | W2 P1 | Live link editor and public-viewer fallback; report month/week/day/card/list status visibility and popup expansion without route jumps; move group image picker directly below “Tải ảnh dashboard và minh chứng”; retain report status filters. | C7 | Live URL saved/opens; report info never disappears on view switch; image section order follows Owner |
| **G8** | W3 P1 | File Manager provider-authentic folder browser with choose folder/link → preview path → explicit Confirm/Cancel, metadata/retry/error/empty states; no fake Brand/File tree. | C8 | Tree corresponds to real Drive ID, verified links and correct contextual breadcrumbs |
| **G9** | W3 P2 | Shopee-like Product Detail: hero, gallery, video, multiple related products/variants, SKU/media, editable sections; App Visual Manager for logo, avatar, KV, thumbnail, banner slots across modules; move permissions/audit to admin. | C9, C8 | Real product media and slots, preview/replace/fallback, no endless grant/audit list inside catalog |
| **G10** | W3 P2 | Analytics flexible charts under **each** metric cluster, not just Orders/Viewers/CTR/CVR; expanded chart types and filters; Data Quality search, export, view modes, pagination (10/20/50/100). | C10 | All available metrics chartable and labeled, data source cited, exports match selected filter |
| **G11** | W2 P1 | Workforce Bảng/Thẻ as presentation modes, not top-level subfeatures; personal payslip as separate Payroll subpage; Member sees own payslip/violation rules, paged violation cases show shift/person/reason/policy. | C11 | Tables/cards preserve filter state, violation list scroll/page accurately, sensitive payroll RBAC respected |
| **G12** | W0+W4 P0 | Audit History screen loading/error/filter/pagination; broad responsive/modal overlays, safe focus, small-screen navigation and regression snapshots; provide UI interaction evidence per feature. | C12 | No SQL error raw-only dead page, retry works, accessible modal, visible controls and no unexplained remount |

## Full-pass and evidence format

Every task **C# / G#** must produce:
\`Task ID | linked issue/PR | owner | source SHA | environment/DB-ref | role | scenarios total/pass/fail/blocked | UI/API/DB/Drive evidence | business integration | regression | status\`.

Status is **NOT STARTED → IN PROGRESS → REVIEW → FULL PASS**; partial implementation is **PARTIAL**, not FULL PASS. A task completed by one lane does not by itself make the module FULL PASS. Module completion requires corresponding C and G plus full integrated E2E.

### Specific owner screenshot findings to preserve

1. Splash shows \`Trang đang tải lâu hơn dự kiến / Chưa xác nhận được dữ liệu\`, despite prior versions loading. Dashboard first displays excessively many shortcuts.
2. Calendar week 08–14/11 displays 35 and 37 shifts grouped into giant tiles on 10/11 and 11/11; event over 12/11 looks cut/collided; calendar intermittently disappears or refreshes after idle.
3. Shift edit modal has only single start/end, not multiple staffing segments; no visible removal/unassign; post-save unexpectedly navigates to Ca trực.
4. Ghi chú ca screen duplicates a list of open shifts. Shift note must be editable with full shift details, import/export.
5. Staffing shows oldest Aug shifts first, selected shift still cannot be assigned; missing shift rows and confusing disabled state.
6. Live Monitor lacks convenient link assignment; moving dashboard-photo group image section still undone.
7. Report month/week/day/list/card controls visually lose report status; expanding a time slot should show a modal, not switch global module.
8. File browser shows a seemingly constructed Brand/month/platform tree rather than selecting and verifying an actual provider folder/link.
9. Product catalog empty as shown; the Brand permissions and huge audit list are incorrectly embedded below product page and cause long scrolling; product creation needs rich product-page style.
10. Workforce Xếp hạng tab empty; table/card modes currently consume functional tabs; Data Quality shows 461 issues without requested filter/export/view controls.
11. Duplicate sidebar Quản lý tài khoản; own payslip should be within Payroll and Member-accessible alongside violation cases/policy.
12. Audit History screen displays \`canceling statement due to statement timeout\`.
13. User requires **full module acceptance**, never "HTTP 200 = PASS", across all roles and expected workflows.

## Existing issue cross-links / non-duplication

- RC19 main release tracking: #80 (older instruction of 1 Gemini-only lane is now superseded for this backlog).
- Calendar/shift/segments: #168, #163. Staffing and shifts: #73, #74, #76, #128.
- Reports/Drive: #164, #165, #97, #98.
- Product catalog: #166.
- Login/UX: #79, #92, #167.
- Deployment integration boundary: Draft PR #172. **Do not treat this documentation branch as a replacement or merge authorization.**

## Hand-off / freeze

- Codex publishes endpoint/RPC/query/DB contract and focused tests before Gemini takes dependent UI task.
- Gemini publishes state diagrams, screenshot diffs and interaction tests against committed contract.
- Each wave consolidated through an integration owner into one exact-SHA QA candidate; no direct pushing to Production for isolated C/G tasks.
- Release note must distinguish verified deploy SHA from inferred SHA. When a release-critical module is FAIL/BLOCKED, full RC19 acceptance remains NO-GO.
