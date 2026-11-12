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
- **Confirmed P0 KAO import corruption (2026-11-12):** [#184](https://github.com/anhkienk4-max/live-app-main/issues/184) (C6/C3/C2 ↔ G3/G2, wrong date, 0 staffing segments despite Import success).
- **Owner attendance/check-in-out/payroll addendum (2026-11-12):** [#183](https://github.com/anhkienk4-max/live-app-main/issues/183) (C5/G5 + C11/G11; 2-hour photo window, T−15/T−30, exact approved pay).
- **Prior release master:** [#80](https://github.com/anhkienk4-max/live-app-main/issues/80) (preserve historical requirements and evidence)

## Governance / shared delivery contract

- **Codex lane C:** backend, data architecture, API, RPC, caching, runtime fault isolation, auth/RBAC, persistence, migration review, contract tests, CI, independent E2E evidence. Publish data/API contracts before Gemini integrates changed functionality.
- **Gemini lane G:** UI/UX, navigation, modal behavior, responsive layout, state restoration, presentation, charting, integration with Codex-approved contracts. Preserve functional APIs and do not perform unreviewed DB changes.
- **No overlapping files:** agents publish a file-ownership list and interfaces; if a shared file is unavoidable, Codex commits API/server contract first and Gemini integrates against that exact commit. Integrator selects commits into an RC19 candidate, never blindly merges/diverges active worktrees.
- **Wave gates:** W0 runtime + PASS/Swap/Staffing blocks → W1 shift/attendance → W2 Overview/Live/Reports/Payroll → W3 catalog/storage/analytics/data quality → W4 full role-based UAT and release.
- **Release gate:** authenticated Admin/Leader/Member UI + API + DB readback + audit + integration + negative/edge cases + evidence. MODULE = FULL PASS only if **every mandatory acceptance scenario** has been verified. Otherwise report PARTIAL/FAIL/BLOCKED/NOT TESTED, including denominator.
- **Production safety:** Staging is currently reported to SQL-timeout despite project health. Validate real Staging URL, DB ref, isolation and OAuth provider before destructive/write tests. Preview/staged Production may point to Production DB; prove binding before writes. Use only approved synthetic fixtures with cleanup ledger. Never edit real shifts/reports/attendance/payroll to force PASS. Preserve audit, evidence and concurrency checks.
- **PASS/Swap Production baseline update (2026-11-12):** migration 117 \`20261111200000_rc19_issue93_pass_swap_audit_repair\` is applied and \`private.log_shift_audit\` exists. **Do not re-create the obsolete missing-function hotfix**. Focus C4 on genuine UI/manual-assignment/consent defects and independent tests. Do not consider a module PASS based on HTTP 200/source test.
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
| **C3** | W1 P1 | Canonical parent shift + multi-segment staffing model, host/support/technical assignments across different time windows, versions, remove assignment, all editable shift fields; preserve shift identity. **P0 import integration #184:** map one imported KAO parent to three actual `shift_staffing_segments` records, preserve K01–K03 times, H/T/KT capacity, planned display-only staff names and stable parent ID. See #168. | G3, C5, C6 | Import→DB 1 parent+3 child, multiple hosts, midnight, reassign/concurrency, edit/detail/readback; no phantom child or duplicated report/payroll |
| **C4** | W0 P0 | Staffing assignment and PASS/Swap: fix disabled Assign despite selected shift, missing rows / ordering; review both broken SQL RPC overloads for missing \`private.log_shift_audit\`; audit trigger, approval, notifications, conflict guards. See #73. | G4, C3 | Member PASS and SWAP → recipient → Leader approve/reject → shift/staff/calendar/notification/audit readback; unauthorized and concurrent negative cases |
| **C5** | W1 P1 | Attendance: distinctly persisted \`check_in\` / \`check_out\` events, each supporting camera AND gallery upload with trusted timestamps, immutable evidence, server event-kind validation, approved role/month Drive routing; enforce reviewed T−120m/End+120m submission windows and separate T−15 Host / T−30 Support presence checks. Evidence review, audit, correction, multi-segment role/roster and payroll handoff. **Owner addendum #183**, existing #74, #130, #163, #76. | G5, C11 | 12 source×event×role paths, correct folders/filenames/readback, ±2h boundaries, Admin/Leader reviews, no client-timestamp spoof or unapproved payroll/fines; cross-midnight + PG17 + actor E2E |
| **C6** | W1 **P0 for #184**, otherwise P1 | **Confirmed KAO import date corruption + child segment loss #184**: date parsing of sheet `11/1/2026` was converted to `2026-01-11` despite code `KAO-20261101-1000-1800`; source P `Khung nhân sự` LF K01/K02/K03 and Q=3 are in preview `custom_fields` but not persisted as child records. Fix Sheets typed-date/locale + code/weekday validation, multiline segment parser and transactional parent+segments commit, warnings and readback. Also canonical notes/legacy Agency/source mapping, import/export. See #161/#168. | C3, C2, G3, G2, G6 | Import confirmed 1/1 must imply correct date and 3 persisted segments (H1/H2/H1, T1, KT0), 0 false successes, previews show corrections, calendar reflects correct November date, idempotent reimport preserving history |
| **C7** | W2 P1 | Reports + Live data contract: report state, KPI, artifact sections, dashboard/metrics upload, live viewer URL validation (TikTok Shop URL fallback to public viewer URL), report summaries/status for month-week-day/card/list. See #164, #165. | G7, C8 | Draft→submit→review + metrics/insights + Drive readback, report status persisted across view changes, live URL opens safely |
| **C8** | W3 P1 | Real Google Drive/OneDrive resource-bound tree, choose existing folder/link with explicit confirmation, verify provider ID/parent/path/ACL, lazy creation, readback; no virtual folder impersonating real Drive. See #97, #98. | G8, C7, C9 | Physical folder navigation matches selected provider link, no phantom file paths, idempotent upload/download/retention |
| **C9** | W3 P2 | Brand/Product/SKU/catalog domain and media relations, variant images, visual slot registry, storage association and rights; move brand-access/audit data to admin domain (not product page). See #166. | G9, C8 | Multi-SKU product and gallery persist, visual slots render mapped assets, correct authorized edits and fallback images |
| **C10** | W3 P2 | TikTok/Shopee metric inventory and formula parity for charts (including near-20 indicators if sources support), chart endpoints, Data Quality search/filter/export/pagination. No fabricated data. | G10, C7 | Every metric has source/definition/unit, chart filters and exports tie back to authorized reports |
| **C11** | W2 P1 | Reconcile per-person **approved actual worked intervals at exact-second precision** with assigned segments, effective rate cards and OT approvals. Early compliant Check-in (Host T−15, Support T−30) is presence evidence, **not extra payable time**; a server-stamped photo can support, not automatically determine, worked start/end. Separate reviewed possible late/early-exit cases from pay; no automatic wage fines. Admin-confirmed approval chain per #76 P-13/P-14/P-15 and **#183**. | G11, C5, C4 | E.g. 07:00–09:00 approved work = 7200s despite 06:43 check-in; late/OT exact seconds, review/audit, Member own payslip only, locked payroll and historical data preserved |
| **C12** | W0+W4 P0 | Audit History query timeout root cause, indexed scoped/cursor pagination, no unbounded audit rows; security and Full Functional QA harness, role/environment matrix, exact SHA/deployment attestation, UAT fixture accounting and CI. | G12, all | Audit loads scoped pages, all role/error/idle scenarios evidenced; clean release artifacts; Staging ≠ Preview ≠ Production recorded, no undocumented data writes |

### Lane G: Gemini (UI / UX / frontend integration)

| ID | Wave | Scope and deliverable | Needs Codex | FULL PASS acceptance |
|---|---|---|---|---|
| **G1** | W0 P0 | ADA boot splash remains only while essential Overview is not ready; no flash back to splash on tab route; per-region skeleton; Overview **5** important shortcuts and “Xem tất cả”; upcoming shifts show Host/Support name/avatar and vacancy. | C1, C5 | First stable Overview shows 5, expansion works, card identity matches real shift assignments |
| **G2** | W0 P0 | Calendar responsive week/day/month/list modes **within Calendar**, <=3 overlapping columns, localized groups, distinct 12/11 event, popup for overflow/week details, keep scroll/filter after edit. | C2 | No massive single 35/37 tile, overnight correct, all shifts inspectable and click/drag/resize actions governed by rights |
| **G3** | W1 P1 | Full Shift Detail/Edit modal for all fields: dynamic “Thêm khung giờ” by Host/Trợ/Technical and overlaps, remove assignment; notes included; **KAO import #184 must show all three persisted K01–K03 segments within one parent**, capacity, planned names and return-to-calendar context. | C3, C6 | Show persisted segments without inventing missing rows; editing, save/version/readback and return; if DB segments absent, show actionable import-data error rather than phantom empty form |
| **G4** | W0 P0 | Staffing list defaults upcoming/newest-first relative to now, controls for missing shifts, selected row enables valid Assign, cancel/unassign, full PASS/Swap status and actor flows. | C4 | Assign actually persists, revoke/replace and alerts/approval visible, no false enabled/disabled state |
| **G5** | W1 P1 | In Shift Detail / My Shift, show two **independent Check-in and Check-out panels**; **each has distinct “Chụp ảnh” and “Tải/Chọn ảnh” actions**, own preview, submit, timestamp, file, upload result, status/retry; role-specific T−15/T−30 presence indicators and ±2h window/exception reason. Preserve separate Admin/Leader review and stable tabs. **Owner addendum #183**. | C5 | Never misfile Check-out as Check-in or vice versa; transparent before/after time limits and evidence status; action-click, role and responsive UAT for both photo sources |
| **G6** | W1 P1 | Unified role-aware navigation: remove duplicate “Quản lý tài khoản” from sidebar, product does not contain brand permissions/audit; internal view switches never redirect to global Calendar; shift notes not a parallel list of shifts. | C1, C6, C9 | Correct deep links/back-button/tab scope and role-specific availability |
| **G7** | W2 P1 | Live link editor and public-viewer fallback; report month/week/day/card/list status visibility and popup expansion without route jumps; move group image picker directly below “Tải ảnh dashboard và minh chứng”; retain report status filters. | C7 | Live URL saved/opens; report info never disappears on view switch; image section order follows Owner |
| **G8** | W3 P1 | File Manager provider-authentic folder browser with choose folder/link → preview path → explicit Confirm/Cancel, metadata/retry/error/empty states; no fake Brand/File tree. | C8 | Tree corresponds to real Drive ID, verified links and correct contextual breadcrumbs |
| **G9** | W3 P2 | Shopee-like Product Detail: hero, gallery, video, multiple related products/variants, SKU/media, editable sections; App Visual Manager for logo, avatar, KV, thumbnail, banner slots across modules; move permissions/audit to admin. | C9, C8 | Real product media and slots, preview/replace/fallback, no endless grant/audit list inside catalog |
| **G10** | W3 P2 | Analytics flexible charts under **each** metric cluster, not just Orders/Viewers/CTR/CVR; expanded chart types and filters; Data Quality search, export, view modes, pagination (10/20/50/100). | C10 | All available metrics chartable and labeled, data source cited, exports match selected filter |
| **G11** | W2 P1 | Workforce Bảng/Thẻ as view modes; Member own Payroll subpage with **approved planned-vs-actual second-precise time**, accepted photo event times as distinct evidence, payable seconds, authorized adjustments and approval status. Potential T−15/T−30 violations shown as reviewable cases, not automatic penalties; paged case list with shift/person/rule and dispute history. **#183, #76**. | C11 | Full payslip time reconciliation and role-scope, early compliant arrival not paid as extra work, no automatic deductions, cross-midnight and locked-period behavior |
| **G12** | W0+W4 P0 | Audit History screen loading/error/filter/pagination; broad responsive/modal overlays, safe focus, small-screen navigation and regression snapshots; provide UI interaction evidence per feature. | C12 | No SQL error raw-only dead page, retry works, accessible modal, visible controls and no unexplained remount |

## Owner attendance / Payroll addendum (2026-11-12) — Source of truth [#183](https://github.com/anhkienk4-max/live-app-main/issues/183)

**Screenshot observed:** in Shift Detail, the Host `Check-in / Check-out` tab shows `Ảnh check-in bắt buộc`, `Chụp ảnh`, `Chọn ảnh`, `Tải ảnh và check-in`; Owner requests clearly separate camera/upload workflows for **both** event kinds. Screenshot does **not** prove Check-out is absent in code. Existing #74 code audit notes both event types and both capture sources are present but may be unclear/incorrectly integrated. Audit implementation first; do not duplicate features unnecessarily.

### C5 ↔ G5 — Four separate action paths + trusted Drive destination

- A staff member legitimately assigned to a shift/segment chooses **Check-in → Chụp ảnh** or **Check-in → Tải ảnh**, and separately **Check-out → Chụp ảnh** or **Check-out → Tải ảnh**. Each action must have clear label, preview, context (shift/role/segment), independent confirmation/receipt/state, errors, retries and file readback. Applies to **Host, Trợ, Kỹ thuật** and authorized Admin/Leader who are also assigned as staff.
- Model `event_kind` as authoritative `check_in | check_out` on backend, not derived from camera/gallery source or filename. Distinct accepted server timestamps, immutable evidence IDs/request UUIDs, no overwriting one event with the other, idempotent replay, no spoofed `staff_id`, event type, segment or provider path. Verify event-kind uniqueness constraints and independent review/resubmission chains on isolated PostgreSQL 17.
- Honor the **existing approved Google Drive** attendance folder tree: `CHECK IN/OUT/{HOST|TRỢ|KỸ THUẬT}/THÁNG M - YYYY/` (see #74). Server-derived filenames or metadata must explicitly include `CHECKIN` vs `CHECKOUT`, correct shift/role/staff/segment and unique receipt. Both **camera and gallery** go to the *same correct role/month provider parent*, with distinct event-labeled files. Validate real Drive parent IDs, ACL, checksum/readback, folder ownership and authorized viewer. Do not invent `CHECKIN`/`CHECKOUT` subfolders or redirect to generic reports/Storage; if the actual provider tree has event-specific folders, reconcile and seek explicit approval before restructuring.
- Evidence review `pending → approved/rejected/correction requested` stays distinct from independently **Admin-confirmed actual worked time**. Never equate a photo, its EXIF, or an uploaded gallery filename with actual paid work. Review and corrections are auditable, scoped and free of self-approval.

### Attendance window and rulebook precedence

- **Owner requested review of ±2h window:** Proposed Check-in earliest allowed at *assigned actual segment start − 120 minutes*, Check-out latest allowed at *assigned segment end + 120 minutes*. Verify canonical rulebook and server/client behavior for late Check-in, early Check-out and out-of-window exception; no silently altered timestamps, no blanket automatic approval. This window limits *evidence submission*, **not** scheduled work, payable OT or approved presence.
- Preserve **mandatory presence cutoff** from existing #76 / ADA room-rule references: **Host present by T−15m; Trợ/Support by T−30m** relative to each person's required start. Kỹ thuật/special campaign variations require verified rulebook source, **never infer 15m/30m without evidence**. Late photo gives potential non-compliance for authorized review, not an automatic monetary fine.
- Use immutable UTC server accepted event timestamp rendered in `Asia/Ho_Chi_Minh`; gallery photo `file_picker` uses accepted **server upload** timestamp, **not EXIF/photo original time/browser clock** (#76 P-14). Retry accepted event retains original timestamp. Support half-open boundaries, overnight and month crossing, cross-role/multi-segment shifts and approved staffing changes.

### C11 ↔ G11 — Payroll must reconcile actual approved work, not timestamps alone

- Honor Owner payroll decisions **#76 P-13/P-14/P-15**: pay per-person **approved actual work** using exact start/end instants and seconds, approved rate/OT, no rounding *time*, no automatic pay for mandatory T−15/T−30 preparation. Do not interpret "on-time Check-in" as automatic full-shift approval: if worked time is shorter, late, replaced, unverified, or disputed, use reviewed actual segment(s) and proper holds/corrections.
- Example: Host scheduled `07:00–09:00`, approved worked time `07:00–09:00`, accepted Check-in photo `06:43`, Check-out `09:05`: payable **7200 seconds**, not 02:22. A Trợ with the same 07:00 work start and Check-in at 06:43 missed a T−30m presence cutoff; review a possible rule incident separately, **without automatic salary deduction**.
- When photo time differs from true worked time, show photo-event timestamp and approved actual segment timestamp separately. Photo may support a late/corrected actual time but is **not a self-executing pay clock**. Leader preliminary review requires Admin confirmation to become payroll-eligible, while authorized Admin may directly confirm (#76 P-15). Reconciled payable seconds and any case/exception must be auditable in payslip/export; preserve locked/historical payroll.
- Any incident, penalty or adjustment needs **rulebook, role/contract/legal applicability, evidence, review and approval**; never auto-fine/deduct wages merely from photo timing. Incomplete evidence means `pending/PAYROLL_HOLD`, not zero salary.

### Emergency staff change / Admin proxy attendance and editable effective times (Owner update 2026-11-12)

**Owner request:** In a sudden staffing change, similar to an authorized unassign/replace action, Admin may upload separate Check-in and Check-out photos **on behalf of an affected assigned staff member** and **edit the effective Check-in and Check-out attendance times**. This must be an audited correction, never rewriting the original evidence time.

- **C4/G4 + C5/G5:** Admin can unassign/replace staff with effective from/to instants, reason and version checks on the actual staffing segment. Keep historical assignment, PASS/Swap and old evidence; never delete proof to simplify scheduling. For retrospective replacement, first authorize and audit the staffing correction, then attach the attendance evidence to the correct person and segment. Deny uploads to unrelated/unassigned/wrong-Brand people.
- **G5 Admin UX:** Separate actions `Admin bổ sung ảnh Check-in` and `Admin bổ sung ảnh Check-out`; in each event support `Chụp ảnh` and `Tải/Chọn ảnh`, own preview, submit, receipt and state. Admin selects authorized shift/segment/person/role and sees original server event time (if any), editable **effective Check-in / Check-out**, timezone, required reason, supporting evidence and a before/after review. Label this explicitly `Admin tải ảnh thay / Điều chỉnh giờ chấm công`, not a staff self-check-in. Member and unrelated Leader must never receive Admin override controls.
- **C5 immutable provenance:** Preserve original event kind, server-accepted timestamp (including gallery-upload acceptance), original evidence, uploader actor, source method, Drive parent/provider receipt/checksum and request UUID. Record each Admin-adjusted effective attendance time separately as a versioned correction with original→corrected value, reason, target staff/shift/segment, actor, server correction time and reviewer/decision. Do not mutate original accepted upload time, EXIF or impersonate the employee. A manually entered time cannot prove that person was present.
- **Google Drive:** Reuse the verified role/month `CHECK IN/OUT/{HOST|TRỢ|KỸ THUẬT}/THÁNG M - YYYY/` tree. The separate CHECKIN/CHECKOUT files retain their event-specific names, correct staff/shift/segment, private ACL and exact provider parent IDs. Record admin-proxy provenance in metadata and naming as approved, not by inventing new folders or exposing links.
- **Time exception:** Normal self-service Check-in starts no earlier than assigned segment start minus 120 minutes; Check-out evidence closes no later than assigned segment end plus 120 minutes, subject to rulebook verification in #183. Admin proxy uploads outside that ordinary window must use an explicit **exception workflow** for sudden replacement, outage, missing photo or approved correction, with reason/review/audit, not a silent widening of normal user permissions. Check Host T−15 and Trợ T−30 presence cutoffs against effective staffing segments; technical/special rules require verified policy.
- **C11 payroll:** Admin-adjusted Check-in/Check-out times are **supporting corrected attendance data**, not automatically payable start/end. Payroll still consumes independently Admin-confirmed actual worked intervals, **exactly to seconds**, approved rates/OT, and audited exceptions under #76 P-13/P-14/P-15. Early presence does not create automatic extra pay; a late/missing checkin does not automatically trigger deductions. For emergency replacements, split actual hours accurately among staff without double-paying the same person's overlap. Any draft recalculation shows before/after; locked periods need formal correction, never silent rewriting.
- **Reviewer and security:** Only authenticated Admin with correct business capability and Brand/Agency scope may perform proxy upload/correction; enforce server-side subject lookup, optimistic version and idempotency. Admin can directly confirm per #76 P-15 when authorized and independent-review rules are met, but must not approve their own evidence or bypass an obligatory separate reviewer. Keep distinct evidence-review and actual-work approval, and full change history for appeal.
- **Example:** A was assigned 07:00–09:00, B replaces A from 08:00. Admin records assignment A until 08:00 and B from 08:00, uploads B's CHECKIN and CHECKOUT photos later (original server upload timestamps remain unchanged) and requests corrected effective times with explanation. Payroll pays A 07:00–08:00 and B 08:00–09:00 only if independently approved as actual worked segments. Do not pay the full two hours to both or assume upload time equals working time.
- **QA:** Host/Trợ/Technical × Check-in/Check-out × camera/gallery for Admin proxy, emergency unassign/reassign, same/different staff, overnight/cross-month, before/after ±2h, T−15/T−30, expired/locked payroll, wrong-brand/not assigned denial, original receipt immutability, version conflicts/retries, two-stage review, actual seconds, provider readback and audit. Isolated PostgreSQL 17 + authenticated Admin/Leader/Member E2E and Drive sandbox are required for FULL PASS.

**Status:** New requirements only. No Production DML/DDL, upload, payroll mutation, Drive permission change, merge or deployment.

### Mandatory verification and gate

- **12 foundations:** 3 operational roles × 2 kinds × 2 photo sources, plus incorrect event routing, dual submissions, missing permission, duplicate/retry, self-review, pending/approved/rejected, provider tree mismatch and Drive readback hash.
- **Time boundaries:** T−121, T−120, T−30, T−15, T, assigned end, end+120 and end+121 minutes; early Checkout/late Check-in, short work segments, cross-midnight/month and camera vs gallery server timestamps.
- **Payroll:** compliant early arrival paid approved shift/work interval only; actual late/short work second-accurate, approved OT independent from +2h evidence window, no auto fine; reviewer and admin roles, exceptions and locked records.
- **FULL PASS requires** C5+G5+C11+G11 integration, UI/API/PostgreSQL 17/Drive readback, authenticated Admin/Leader/Member negative + happy paths, exact deployed SHA and screenshot evidence. This issue is **requirements added**, not code implemented. Do not migrate/upload/change Drive ACL/deploy from roadmap update.

## Confirmed Owner Production import defect (2026-11-12) — P0 [#184](https://github.com/anhkienk4-max/live-app-main/issues/184)

The Owner screenshot showed Google Sheets tab with a **single KAO parent live shift**, `11/1/2026` (Sunday = November 1), external code `KAO-20261101-1000-1800`, parent 10:00–18:00, **three** LF-separated staffing frames `K01 10–11 H1 T1 KT0`, `K02 11–16 H2 T1 KT0`, `K03 16–18 H1 T1 KT0`. The app Import History shows 11:38, November 12, “Đã import”, but the shift is not visible on Calendar.

**Independent read-only Production SQL verified actual persistence errors**, not only a suspected missing Shift Detail format:

| Evidence | Actual Production observation |
| --- | --- |
| Import batch | `f66388d8-6473-434f-ac4b-da7bf2594b29`, `status=confirmed`, `1/1 valid/imported`, 0 warnings/errors, 11:38 on Nov 12 VN |
| Shift | `6eee2fd7-83cf-4541-b1dc-3b575edd573e`, title `KAO-20261101-1000-1800`, 10:00–18:00 |
| **Wrong day** | Imported `source_row.date` **already = `2026-01-11` at preview stage**, and `shifts.date` + `start_at` saved as January 11 instead of November 1 |
| **Missing staffing slots** | `source_row.custom_fields['Khung nhân sự']` has all 3 lines with actual LF; `Số khung=3`; **0 rows** in `shift_staffing_segments` for that shift |
| **Other mapping risks** | Parent `required_technical_count=1` contradicts every slot's `KT0`; K02 H2 not represented in default parent capacity; multi-person planned Host names lose slot attachment. Confirm sheet `Status Done` to shift `completed` behavior on Calendar filters |

### Mandatory P0 fix and QA (C6 → C3 → C2; paired G3/G2)

1. **C6 typed date/locale parser**: Do not trust implicit `new Date('11/1/2026')` semantics. Read Google Sheets serial/typed date and sheet locale; validate weekday `Chủ Nhật` and `KAO-20261101...` against computed date. If ambiguous, block preview/confirm with a row-specific validation message rather than silently storing another month. Date is wrong *before DB write*, so a Shift Detail UI patch alone will not fix the root cause.
2. **C6 + C3 segments**: Parse `Khung nhân sự` LF multiline into three child `shift_staffing_segments` (K01–K03; starts/ends, H/T/KT required counts, planned names). Validate `Số khung=3`, segments contained in parent, no contradictory capacities or auto-assignment from planned names. Persist **one parent + three child records atomically**, with stable import lineage and no duplicated GMV/report/payroll.
3. **Preview/confirmation truthfulness**: Confirming a one-row source with required three segments must **not** say full success when children were silently omitted. Return field-level error with row+column, counts for parents/segments and precise write readback; fail the whole row transaction when contractual child persistence is unavailable. Reimport idempotently with approved review, not a mass overwrite.
4. **Calendar + Shift Detail**: Once DB corrected, Calendar on **November 1** (not current week 8–14 Nov) must show one parent shift 10:00–18:00, with child segments inside Detail/Staffing. Ensure `completed` status visibility according to authorized filters. Provide `Xem ca vừa import` deep link to imported date/shift with a visible `Ngày lưu: 01/11/2026` and no unexplained staying on the current week.
5. **Regression:** Source fixture KAO + US/VN date strings and spreadsheet serial, weekday/code mismatch, different Brand/tab headers, M/N planned multiline names, Q count, H2 and KT0, cross-midnight, duplicate imports, API/DB parent+child readback, role permissions and Calendar/G3 UI. PG17 isolated, authenticated actor E2E, evidence and exact SHA are mandatory before FULL PASS.
6. **Production reconciliation separately approved:** Preserve the original batch/shift, record before/after audit, and propose narrowly scoped repair for batch `f66388d8...` and shift `6eee2fd7...` only after validated code and user authorization. No blind edits/reimport/deploy from this document.

**Status:** Confirmed Production data-integrity defect, implementation **NOT STARTED** under this issue; C6 P0, C3 P0 integration, C2/G2 and G3 UI readback pending. The current G2 Draft PR #180 cannot correct an event whose `start_at` was incorrectly stored as January.

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
15. **12/11 KAO live import confirmed corrupted:** imported parent code Nov 01 saved January 11; 3 K01/K02/K03 source frames persisted as 0 segments; see P0 #184. Missing Shift Detail format is not the sole root cause.
14. **12/11 Owner attendance screenshot:** Check-in photo capture/upload is visible but Check-out separation is not obvious; requires explicit 4 photo paths, correct Drive event labeling, ±2h server-controlled submission policy, existing T−15/T−30 presence checks and approved exact-second actual payroll. See #183.

## Existing issue cross-links / non-duplication

- RC19 main release tracking: #80 (older instruction of 1 Gemini-only lane is now superseded for this backlog).
- Calendar/shift/segments: #168, #163. **Confirmed import/Calendar missing-shift bug: #184, #161**. Staffing and shifts: #73, #74, #76, #128. Attendance/payroll addendum: #183, evidence review #130.
- Reports/Drive: #164, #165, #97, #98.
- Product catalog: #166.
- Login/UX: #79, #92, #167.
- Deployment integration boundary: Draft PR #172. **Do not treat this documentation branch as a replacement or merge authorization.**

## Hand-off / freeze

- Codex publishes endpoint/RPC/query/DB contract and focused tests before Gemini takes dependent UI task.
- Gemini publishes state diagrams, screenshot diffs and interaction tests against committed contract.
- Each wave consolidated through an integration owner into one exact-SHA QA candidate; no direct pushing to Production for isolated C/G tasks.
- Release note must distinguish verified deploy SHA from inferred SHA. When a release-critical module is FAIL/BLOCKED, full RC19 acceptance remains NO-GO.
