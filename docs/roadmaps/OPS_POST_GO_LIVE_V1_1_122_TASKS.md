# OPS Livestream — Post-Go-Live Roadmap V1.1 (W0–W10; 122 traceable tasks)

> **OWNER RELEASE PRIORITY (2026-11-17):** Current task is **RC19 direct PRODUCTION Go-live**; no Staging. The **Drive-first full business-data architecture** is explicitly **DEFERRED TO POST-GO-LIVE**. Do not change RC19 FULL PASS behavior, split source-of-truth, or build DFS-01..08 before RC19 release. Future work is documented at [Drive-first target (DEFERRED)](OPS_DRIVE_FIRST_FULL_DATA_ARCHITECTURE_20261117.md).  
> **Not deferred:** pre-release Google Drive physical readback for *existing required files*, confidentiality/ACL gate and safe Production database migration & recovery. The 122 baseline PG task IDs remain unchanged; DFS work packages are future planning references, not 8 new implementation tasks today.  

> **V1.1 change note:** The original 112 PG tasks are preserved verbatim below. Ten additional tasks (PG-113…PG-122), the wave execution sequence and the 14-gap reconciliation are appended at the end. The first 112 IDs were **not renumbered**, and not all 122 imply coding work. See the V1.1 section for the canonical order.  
> **Repository research:** [11 GitHub references](OPS_LIVESTREAM_OPEN_SOURCE_REFERENCE_REPOS_20261117.md).



> **Status:** PLANNED — do not execute until RC19 Production Go-live passes.  
> **Canonical Notion page:** https://app.notion.com/p/41b5449511e68184a07ad66f248d8e81  
> **Source scope:** Notion Master Roadmap Phase 0–32 + Enterprise Phase 7 + RC19 C/G Owner UAT.  
> **Safety:** Documentation-only branch. No application source, database migration, production env, deployment, or existing FULL PASS contracts changed.  
> **Freeze rule:** Before working on any task, verify the latest released code. If FULL PASS, mark FROZEN_SKIP rather than implementing it again.

Trạng thái: **PLANNED / CHƯA THỰC THI**. Đây là kế hoạch sau khi RC19 Production được nghiệm thu, không phải lệnh sửa code/merge/deploy.

Nguồn: [App quản lý phòng live](https://app.notion.com/p/39f5449511e6802aa645c1cf49ed1d0f), [RC19 Owner UAT #173](https://github.com/anhkienk4-max/live-app-main/issues/173), [RC19 Owner #80](https://github.com/anhkienk4-max/live-app-main/issues/80).

## Non-negotiable preservation contract

- Chức năng đã FULL PASS: **FROZEN / SKIP**, giữ code/schema/API/behavior/fixtures đã nghiệm thu; không refactor không cần thiết.
- Chức năng PARTIAL: **PATCH GAP ONLY**, giữ mọi phần đã PASS.
- Chức năng MISSING: BUILD theo contract, RBAC, persistence, audit, rollback.
- Hạng mục release P0 của RC19 **không được chuyển sang hậu Go-live**; phải đóng trước khi bắt đầu W0.
- Không tự động sửa Production data, chạy migrations, merge, deploy; mỗi wave có approval và release gate.
- Các task có dependency phải làm tuần tự; task độc lập có thể nghiên cứu song song nhưng không để 2 agent ghi một file/worktree.
- Một task DONE khi có evidence UI/API/DB/provider readback + positive/negative role cases + exact SHA + regression PASS. Không dùng 'route 200' làm FULL PASS.

## Tracking schema

`ID | Wave | Title | Requirement | Status (PENDING_AUDIT / FROZEN_SKIP / PATCH / BUILD / IN_PROGRESS / VERIFIED / RELEASED / BLOCKED / DEFERRED) | Dependency | Priority | Owner | Source SHA | Test/UAT Evidence | Release SHA`

Mọi task mặc định `PENDING_AUDIT`, chưa được coi là `MISSING`. Kiểm tra kỹ trong worktree W4 mới nhất trước khi đổi trạng thái.

## Wave overview

| Wave | Mục tiêu | Cửa nghiệm thu |
| --- | --- | --- |
| W0 | Release Baseline & Freeze | Có release SHA, baseline PASS, ma trận coverage và scope lockdown rõ ràng. |
| W1 | Daily Ops Productivity | Admin/Leader/Member thao tác nhanh, lịch xuất được, thông báo đáng tin cậy, multi-user không bị sai dữ liệu. |
| W2 | Workforce, Staffing & Payroll Enhancement | Mọi thay đổi nhân sự/giờ thực tế có reason, audit, reviewer và lịch sử; không sửa kỳ lương đã khóa. |
| W3 | Live Operations & Monitoring | Live → Dashboard Updates → Incident/Report Obligation có thời điểm, người chịu trách nhiệm và readback. |
| W4 | Reports, OCR & File Quality | Report/OCR đúng theo dữ liệu gốc, sửa và truy vết được; lưu đọc file thật, không claim ảo. |
| W5 | Marketplace Data Ingestion & Reconciliation | Mỗi file nguồn có lineage, mỗi bản ghi được map chính xác theo ca, người xem biết missing/duplicate/conflict. |
| W6 | Analytics & Business Intelligence 20A–20J | KPI công khai công thức, timezone/grain, drilldown đến dữ liệu; exported figures = dashboard. |
| W7 | Governance, Reliability & Configurability | Security/restore/observability được diễn tập, cấu hình có version/audit, performance có metric. |
| W8 | Enterprise Expansion (11 official items) | Không phá dữ liệu và quyền của nhóm đang dùng; scale/permission/restore tests theo tính năng. |
| W9 | External Integrations (permission gated) | Credential scope, provider read/write receipts, retry/dedup, disconnect test, RBAC, audit, feature flag. |
| W10 | AI Assistant & Separate Livestream AI Ecosystem | AI output có nguồn, quyền, human review; không tự áp lương/ca/DB; ecosystem chạy pilot riêng. |

## W0 — Release Baseline & Freeze

**Mục tiêu:** Chỉ kích hoạt sau khi RC19 đã deploy, UAT/Production smoke PASS và dữ liệu/restore/Drive thật đã được nghiệm thu. Đây là wave kiểm kê, không phát triển tính năng.

**Exit gate:** Có release SHA, baseline PASS, ma trận coverage và scope lockdown rõ ràng.

- [ ] **PG-001 \| W0 \| Chốt Release RC19 và xác minh tất cả P0/pre-go-live gates**. SWAP E2E, Payslip, locked Payroll, RBAC, restore, Drive và import dữ liệu trọng yếu đã đạt trước khi gọi Post-Go-Live.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-002 \| W0 \| Lưu exact SHA Production, DB migration ledger và UAT evidence**. Không suy ra SHA từ local; so khớp deployment, release branch, migration receipts và smoke.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-003 \| W0 \| Tạo Freeze Registry cho từng chức năng FULL PASS**. Ghi file/API/schema/test/contract/baseline SHA; cấm sửa nếu không có regression evidence hoặc approved change.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-004 \| W0 \| Lập Feature-Gap Matrix từ Notion Phase 0–32 và RC19 C/G**. Theo mỗi mục: DONE/FULL PASS, PARTIAL, MISSING, DEFERRED, source SHA, owner, acceptance evidence.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-005 \| W0 \| Phân loại task: SKIP nếu FULL PASS, PATCH nếu PARTIAL, BUILD nếu MISSING**. Không duplicate work; liên kết issue/PR, đánh dấu prerequisite và ghi rõ task chỉ làm phần thiếu.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-006 \| W0 \| Định nghĩa wave release protocol và rollback**. One active writer per file/worktree; feature flag nếu cần, clean integration gates, staged pilot, rollback thật.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W1 — Daily Ops Productivity

**Mục tiêu:** Giảm thao tác thủ công, tăng hiệu quả lịch và điều phối ngay sau bản dùng cơ bản.

**Exit gate:** Admin/Leader/Member thao tác nhanh, lịch xuất được, thông báo đáng tin cậy, multi-user không bị sai dữ liệu.

- [ ] **PG-007 \| W1 \| Hoàn thiện Schedule Export có filter**. Excel/CSV theo tháng, Brand, Platform, batch và selected shifts; khớp DB và quyền.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-008 \| W1 \| Schedule Versioning và so sánh planned/current**. Before/after, lịch sử sửa, nguồn nhập, export version; không đổi identity ca.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-009 \| W1 \| Hoàn thiện Global Search & deep links**. Shift, Staff, Brand, Campaign, Platform, Report; quyền và filter nhất quán.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-010 \| W1 \| Global Quick Actions / Command Center**. Create Shift, Import, Assign, Approve, Retry, Resolve Conflict, Review Report, Notification.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-011 \| W1 \| Bulk Operations có kiểm toán**. Approve/reject/assign/cancel/retry theo lô; preview tác động, reason và partial failure.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-012 \| W1 \| Notification Center lifecycle**. Unread, read/mark-all, grouping, priority, expiry, deep links, notification preferences.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-013 \| W1 \| Notification event routing và deduplication**. Assignment, PASS/Swap, shift change, report due, deadline, missing KPI; idempotency/retry.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-014 \| W1 \| Realtime resilience**. Reconnect, connection state, stale data, last-updated, manual refresh, multi-user race recovery.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-015 \| W1 \| Dashboard theo vai trò bản cơ bản**. Admin/Leader/Member thấy KPI, việc cần xử lý và ca liên quan theo quyền.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-016 \| W1 \| Mobile operational UX cơ bản**. Lịch, đăng ký ca, đổi ca, notification, check-in/out; focus/responsive/empty/error.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-017 \| W1 \| Performance pass có đo đạc**. Theo dõi p50/p95, query/pagination, cache master data, không làm hỏng độ tươi dữ liệu.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W2 — Workforce, Staffing & Payroll Enhancement

**Mục tiêu:** Hoàn thiện ngoại lệ vận hành, không thay đổi đường tính lương đã FULL PASS.

**Exit gate:** Mọi thay đổi nhân sự/giờ thực tế có reason, audit, reviewer và lịch sử; không sửa kỳ lương đã khóa.

- [ ] **PG-018 \| W2 \| Hoàn thiện Staff Account Lifecycle**. Invite, approve/reject, activate/deactivate, archive/restore, recovery; account↔staff mapping.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-019 \| W2 \| Staff Identity & Alias Control**. Trùng tên, tên khác Excel, alias, unmatched/ambiguous/confirmed, chống sai người.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-020 \| W2 \| Role/Permission management enhancements**. System Permission tách Operational Role; least privilege và cross-brand denial.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-021 \| W2 \| Staffing Bulk Assign/Remove/Approve**. Nhiều ca và người, capacity, conflict, version check, audit + rollback xử lý từng mục.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-022 \| W2 \| Authorized force override**. Admin/Leader override capacity/conflict đúng capability, mandatory reason và approval path.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-023 \| W2 \| Shift lock/unlock, duplicate, recurring & templates**. Bảo vệ ca đã chạy/khóa lương; preview conflict và lịch sử version.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-024 \| W2 \| Conflict Resolution UI**. Giải thích conflict theo vai trò, thời gian, platform, capacity; đưa phương án hợp lệ.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-025 \| W2 \| Emergency Replacement & Proxy Attendance extension**. Bản core là pre-go-live; chỉ bổ sung UI/recovery đã thiếu theo receipt bất biến, reason/reviewer.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-026 \| W2 \| Live Staffing Variance cases**. Late, no-show, cover, replacement, role switch, overtime, extra staff; dữ liệu có nguồn.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-027 \| W2 \| Actual Staffing Timeline & approved interval visualization**. Từng đoạn theo người, role, start/end tới giây, replacement, verified changes.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-028 \| W2 \| Workforce Performance và ranking**. Attendance, punctuality, workload, shift completion, reliability; role-normalized, drilldown.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-029 \| W2 \| Payroll enhancement: export/appeal/adjustment**. Export, before/after correction, dispute, approved actual, Member own payslip; never rewrite locked.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-030 \| W2 \| Attendance policy extensions (conditional)**. Geo/PIN hoặc chính sách mới chỉ làm nếu được phê duyệt, minh bạch quyền riêng tư.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W3 — Live Operations & Monitoring

**Mục tiêu:** Dùng thực tế trong giờ live: trạng thái, chỉ số, cảnh báo, nhiệm vụ và incident.

**Exit gate:** Live → Dashboard Updates → Incident/Report Obligation có thời điểm, người chịu trách nhiệm và readback.

- [ ] **PG-031 \| W3 \| Live Session control**. Start/end, session state, room, platform, roster, notes, lịch sử và actor.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-032 \| W3 \| Live Monitoring session list & reliable viewer**. Xem ca đang live, đồng hồ, GMV/views/orders nếu nguồn hỗ trợ; link viewer hợp lệ.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-033 \| W3 \| Live Session Detail modal**. Mở ngay tại module, timeline, roster, KPI, ảnh và action không nhảy trang.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-034 \| W3 \| Dashboard Update workflow**. 30/60 phút hoặc quy tắc theo Brand, manual update, ảnh, record history và validation.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-035 \| W3 \| Late/Missing KPI reminders**. Nhắc Host/Support, escalations Leader, không spam và không tạo dữ liệu KPI giả.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-036 \| W3 \| Incident Tracking & correction**. Room outage, trễ live, sai host, thay ca, lỗi platform; severity, owner, resolution.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-037 \| W3 \| Report Obligation auto-creation**. End/completed shift phát sinh nghĩa vụ báo cáo idempotent và đúng người.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-038 \| W3 \| Recording/Screenshot/Live Evidence attachment UX**. Đưa file về provider đúng metadata/ACL, làm rõ trạng thái upload/retry.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-039 \| W3 \| Operations Command Dashboard**. Live Today, vacancy, active sessions, incidents, overdue reports, action priority.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W4 — Reports, OCR & File Quality

**Mục tiêu:** Giảm nhập tay nhưng vẫn có duyệt số liệu và lưu bản gốc.

**Exit gate:** Report/OCR đúng theo dữ liệu gốc, sửa và truy vết được; lưu đọc file thật, không claim ảo.

- [ ] **PG-040 \| W4 \| Report lifecycle refinement GAP ONLY**. Draft/Edit/Submit/Reviewed/Approved/Rejected/Revision/Locked còn thiếu nào thì vá đúng phần đó.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-041 \| W4 \| Report revision/version history**. Who/when/reason/before-after, reviewer, approve/reject, lock controls.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-042 \| W4 \| Data dictionary và metrics validation**. GMV, Orders, CTR, CVR, viewers, units, source, null semantics; không tự bịa số.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-043 \| W4 \| Report PDF/XLSX/CSV export**. Theo kỳ/Brand/Campaign/Host đúng quyền và current approved version.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-044 \| W4 \| OCR provider QA TikTok/Shopee**. Local OCR + Vision confidence/fallback, quality fixtures, no silent autofill.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-045 \| W4 \| OCR manual correction/review/retry**. Raw vs corrected, versioned human review, provenance, approval và accuracy error log.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-046 \| W4 \| Screenshot→OCR→Report metric automation**. Map chỉ số đúng ca/Brand/platform, review trước ghi chính thức.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-047 \| W4 \| File Manager provider-real folder UX**. Folder/link picker, confirmed provider ID/parent/path/ACL, readback; nền tảng Drive bắt buộc đã pass ở R0.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-048 \| W4 \| File lifecycle/retention/versioning**. Metadata, checksum, replace/move/download, orphan prevention, revoke, allowed retention.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-049 \| W4 \| Report reminders/scheduled export**. Định kỳ gửi việc thiếu và xuất report theo quyền, không ghi dữ liệu chưa confirm.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W5 — Marketplace Data Ingestion & Reconciliation

**Mục tiêu:** Bắt đầu từ upload Excel/CSV chính thức; tích hợp API/tự động chỉ khi được nền tảng cho phép.

**Exit gate:** Mỗi file nguồn có lineage, mỗi bản ghi được map chính xác theo ca, người xem biết missing/duplicate/conflict.

- [ ] **PG-050 \| W5 \| Platform Data Inventory & Contract**. Liệt kê mọi báo cáo TikTok/Shopee, metric, timezone, store, grain, download format.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-051 \| W5 \| Multi-store Raw File Ingestion**. Upload XLSX/CSV nhiều shop/Brand/platform, bảo tồn bản gốc và nguồn.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-052 \| W5 \| Source Lineage & Registry**. Provider/store/source hash/creator/time/import job/raw pointer/schema version.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-053 \| W5 \| Template & schema normalization**. Typed date/time, currency, unit, metric names, mapping preview theo platform.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-054 \| W5 \| Data Quality validation**. Missing, invalid, outlier, wrong unit, date mismatch, unsupported columns.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-055 \| W5 \| Deduplication & idempotency**. Replay same file safe, file/row hash, conflict log, no double-count.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-056 \| W5 \| Session Matching**. Match store, Brand, Platform, session time/shift ID; review ambiguous joins.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-057 \| W5 \| Reconciliation Center**. Raw→normalized→matched→verified, discrepancies, exception owner & history.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-058 \| W5 \| Retry/reprocess/correction control**. Row/batch retry, human correction, approvals, export error rows.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-059 \| W5 \| Authorized connector automation feasibility**. Ưu tiên official API/export; nếu không có quyền thì giữ manual import bán tự động, không lách platform.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W6 — Analytics & Business Intelligence 20A–20J

**Mục tiêu:** Chỉ xây BI trên số liệu có nguồn gốc, đã chuẩn hóa và ghép đúng phiên.

**Exit gate:** KPI công khai công thức, timezone/grain, drilldown đến dữ liệu; exported figures = dashboard.

- [ ] **PG-060 \| W6 \| Semantic model (20I) & fact/dimension schema**. Fact session/metrics/orders/actual workforce; dimensions Brand/Platform/Campaign/Staff/Date.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-061 \| W6 \| KPI Registry (20I) & formula governance**. Owner, formula, unit, source, grain, data freshness và kiểm tra parity.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-062 \| W6 \| Executive Overview 20A**. GMV, Orders, sessions, live hours, viewers, trend, target vs actual.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-063 \| W6 \| Commercial Performance 20B**. GMV/AOV/CVR/Revenue per Hour theo Brand/Platform/Campaign.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-064 \| W6 \| Traffic & Engagement 20C**. Views, unique viewers, CCV, CTR, product clicks, engagement by time.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-065 \| W6 \| Operations & Staffing 20D**. Coverage, on-time, late/no-show, planned vs actual, OT and replacement.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-066 \| W6 \| Host Performance 20E**. GMV/Hour, Orders/Hour, CVR, punctuality, workload; fair comparisons.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-067 \| W6 \| Brand/Campaign Deep Dive 20F**. Campaign target, platform split, comparison, session distribution.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-068 \| W6 \| Recommendations 20G**. Evidence, likely cause, action, impact×effort, owner, status; no unsupported certainty.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-069 \| W6 \| Key Takeaways / AI Insight 20H baseline**. Deterministic evidence-based summaries before generative AI option.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-070 \| W6 \| Configurable BI / Chart Builder 20J**. KPI selection, saved filters, line/bar/donut/table, drill-down, permissions.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-071 \| W6 \| Saved Views, Scheduled Reports & Export Builder**. CSV/XLSX/PDF, data freshness timestamp, share permission, metric tooltip.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W7 — Governance, Reliability & Configurability

**Mục tiêu:** Tăng khả năng vận hành lâu dài, giảm lỗi lặp và tránh mất dữ liệu.

**Exit gate:** Security/restore/observability được diễn tập, cấu hình có version/audit, performance có metric.

- [ ] **PG-072 \| W7 \| Operational Event Backbone GAP ONLY**. Event version, idempotency, correlation ID, retry/dead-letter nếu cần; không tạo microservices mới.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-073 \| W7 \| Audit Center enhancement**. Actor/action/entity/before/after/time, security events, query/export, pagination.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-074 \| W7 \| Configuration Registry & Settings**. Approval, shift rules, capacity, conflict, timezone, retention, OCR, notification, storage.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-075 \| W7 \| Role-aware preferences and dashboard personalization**. Saved user preferences, personalized widgets, accessibility, no secrets exposure.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-076 \| W7 \| Session Management & Security**. Session revoke/logout all, IDOR, least privilege, cross-user/Brand, escalation tests.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-077 \| W7 \| Sensitive action and file security**. Rate-limit, CSRF/input checks, signed URL expiry, upload validation, audit.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-078 \| W7 \| Observability with action-ready alerts**. p50/p95/p99, structured logs, RPC errors, owner action, incident runbooks.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-079 \| W7 \| Backup, Recovery & Retention rehearsal**. PG17 restore against isolated DB, storage receipts, rollback, RTO/RPO objectives.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-080 \| W7 \| Storage provider portability**. OneDrive/Google Drive provider migration, stable IDs, path reconciliation, no silent orphans.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-081 \| W7 \| Performance hardening**. Shared cache, indexes, N+1, server preload, payload optimization, observed budgets.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-082 \| W7 \| PWA, responsive, accessibility & regressions**. Critical mobile paths, keyboard focus, WCAG review, error/empty states; no full pass regressions.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W8 — Enterprise Expansion (11 official items)

**Mục tiêu:** Tùy nhu cầu nhiều team/thị trường; từng tính năng có business case, không mặc định bật trong V1.

**Exit gate:** Không phá dữ liệu và quyền của nhóm đang dùng; scale/permission/restore tests theo tính năng.

- [ ] **PG-083 \| W8 \| Enterprise 01 Multi-team**. Phân vùng nhiều team, leader, data scope, chuyển người/ca có audit.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-084 \| W8 \| Enterprise 02 Multi-market**. Quốc gia, timezone, currency, policy theo thị trường và dữ liệu.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-085 \| W8 \| Enterprise 03 Multi-language**. i18n, localized formatting, term dictionary.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-086 \| W8 \| Enterprise 04 SSO**. Business IdP/OIDC/SAML nếu có, lifecycle, provisioning và recovery.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-087 \| W8 \| Enterprise 05 Advanced Security**. Security policy, session risk, sensitive actions, permission attestation.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-088 \| W8 \| Enterprise 06 Approval Hierarchy**. Multi-level approval configurable có reviewer independence và audit.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-089 \| W8 \| Enterprise 07 Custom Dashboard**. User/team widget layout, permitted KPIs, versioned config.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-090 \| W8 \| Enterprise 08 SLA**. Deadlines, response time rules, escalation and breach reports.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-091 \| W8 \| Enterprise 09 Monitoring**. Multi-environment health, availability, performance, alerting.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-092 \| W8 \| Enterprise 10 Compliance**. Retention policies, access review, export/redaction/consent theo pháp lý.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-093 \| W8 \| Enterprise 11 Data Warehouse**. Warehouse ingestion/partition/ETL chỉ khi analytics volume và cost justification đủ.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W9 — External Integrations (permission gated)

**Mục tiêu:** Tích hợp có quyền chính thức, ưu tiên ít rủi ro; không tạo dependency hỏng core ops.

**Exit gate:** Credential scope, provider read/write receipts, retry/dedup, disconnect test, RBAC, audit, feature flag.

- [ ] **PG-094 \| W9 \| Google Calendar integration**. Optional approved sync lịch/ca với timezone và idempotency.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-095 \| W9 \| Gmail integration**. Optional notifications/report delivery, consent, templates, retries.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-096 \| W9 \| Slack integration**. Optional events/incident alerts với team scope.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-097 \| W9 \| Google Drive integration enhancements**. Mở rộng folder browser/linking/cross-provider, không thay core Drive đã FULL PASS.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-098 \| W9 \| TikTok official API integration**. Chỉ endpoints và quyền thực sự được cấp, fallback manual exports.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-099 \| W9 \| Shopee official API integration**. Chỉ partner API có quyền, fallback manual exports.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-100 \| W9 \| HR system integration**. Identity/staff/leave/payroll export reconciliation; don't duplicate HR source of truth.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## W10 — AI Assistant & Separate Livestream AI Ecosystem

**Mục tiêu:** AI Ops là optional; AI Livestream Center là hệ thống riêng, chỉ trao đổi dữ liệu có kiểm soát.

**Exit gate:** AI output có nguồn, quyền, human review; không tự áp lương/ca/DB; ecosystem chạy pilot riêng.

- [ ] **PG-101 \| W10 \| AI caption assistant**. Brand tone/claim constraints, draft with human review.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-102 \| W10 \| AI video/live script assistant**. Products/brief/CTA, reference citations, editable approval workflow.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-103 \| W10 \| AI FAQ and Q&A**. Knowledge Base SKU/FAQ/claims, retrieval permissions, answer confidence.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-104 \| W10 \| AI KPI analysis & report summary**. Only verified KPI, provenance and human validation.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-105 \| W10 \| AI suggested schedule optimization**. Constraints conflict, availability, fairness, approval before writes.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-106 \| W10 \| AI campaign/GMV forecast**. Historical data quality, uncertainty, calibration, no fabricated precision.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-107 \| W10 \| Ops→AI Livestream data contract**. Sync only SKU/Campaign/Script/Voucher/QA/Shift/roster/status under least privilege.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-108 \| W10 \| AI Livestream Center avatar/voice/LLM/RAG pilot**. Build in separate repo/service, not Ops core.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-109 \| W10 \| OBS/media/comment queue/moderation pilot**. Separate streaming infra, consent, safety and platform restrictions.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-110 \| W10 \| AI Host lip sync/camera/live assistant pilot**. Separate service and fallback, no direct unrestricted Ops writes.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-111 \| W10 \| AI Sales and incident/report feedback integration**. Receive controlled event/report results back to Ops with audit.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.
- [ ] **PG-112 \| W10 \| Final post-go-live roadmap acceptance & reprioritization**. Close completed waves, re-audit roadmap vs code, defer unused features; no artificial APP COMPLETE claim.  
**Status:** PENDING\_AUDIT; **Rule:** FROZEN\_SKIP nếu đã FULL PASS, còn thiếu mới PATCH/BUILD.

## Release discipline

1. R0: RC19 Production Go-live và baseline freeze; không kích hoạt W1 khi còn P0.
2. Mỗi wave: Audit existing code → shortlist actual gaps → task changes isolated → focused tests → regression baseline → stage & 3-role UAT → release with flags → monitor & rollback plan.
3. Sau wave, cập nhật task ID/status/evidence/commit and release SHA trên Notion/GitHub; không nâng status từ source-only.
4. Enterprise/AI/API tùy scope, ngân sách và quyền; luôn có thể DEFERRED, không ngăn V1 core hoạt động.
5. Không tạo microservice/event bus/workflow designer/phần mềm native chỉ vì có trong xu hướng; chức năng phải giảm công sức, rủi ro hoặc tăng giá trị đo được.


## V1.1 Change Control: 112 baseline + 10 new tasks = 122

> Accepted amendment from 2026-11-17 user approval. Existing PG-001 through PG-112 task IDs, task texts and FULL PASS contracts remain unchanged. This V1.1 document **adds** PG-113 through PG-122 with explicit dependencies; status is PENDING_AUDIT, not BUILT, DONE or GO-LIVE. Previous audit `REVIEW ONLY` was an earlier proposal; the gap integration below supersedes that decision boundary.
> The canonical execution order is **Wave + listed order**, not numeric PG-ID. Stable IDs are traceability keys and deliberately not renumbered.
> Source: [Audited GAP register](OPS_POST_GO_LIVE_ROADMAP_AUDIT_20261117.md) · [11 GitHub reference repositories](OPS_LIVESTREAM_OPEN_SOURCE_REFERENCE_REPOS_20261117.md).

### Explicit reconciliation of the 14 GAPs

| GAP | Resolution in V1.1 |
|---|---|
| GAP-01 | Pre-Go-live critical security, backup/restore, Drive ACL & incident monitoring stay in **RC19 R0**; strengthen PG-001/002/006 gate, do not defer to W7. |
| GAP-02 | Extend PG-003 freeze exception policy: verified security, business, compliance or production regression may reopen only with approved change control and regression evidence. |
| GAP-03 | New PG-114. |
| GAP-04 | New PG-115 and PG-116. |
| GAP-05 | New PG-117 and PG-118. |
| GAP-06 | New PG-120. |
| GAP-07 | Tighten existing PG-025/029/030/048/076/077/092, with attendance/locked-payroll core still pre-Go-live; privacy, immutable evidence, retention and appeals. |
| GAP-08 | New PG-113. |
| GAP-09 | New PG-121. |
| GAP-10 | New PG-122; baseline monitoring/budget awareness also in PG-017 and R0. |
| GAP-11 | New PG-119. |
| GAP-12 | Tighten existing PG-043/049/071: export/snapshot versions, authorized scope, sensitive-data reduction. |
| GAP-13 | Tighten PG-006 and all wave gates: UI, API, DB/provider, actor roles, negative/error/retry, audit, regression, exact SHA. |
| GAP-14 | Existing W8–W10 are optional; use PG-083–112 approval criteria and separate AI Live Center code/service. |

### 10 new explicitly numbered tasks

- [ ] **PG-113 \| W0 \| Operational Ownership, SOP & Incident/Fallback**
  - **Gap/priority:** GAP-08 · P0 post-release process.
  - **Depends on:** PG-001, PG-002, PG-006.
  - **Scope:** Chốt vai trò owner/người duyệt release, vận hành, rollback, bảo mật và hỗ trợ; SOP Host/Trợ/Leader/Admin, pilot onboarding, support queue và fallback khi Sheets/Drive/marketplace không khả dụng. Không tự gán tên người.
  - **Acceptance:** Owner và escalation được người dùng phê duyệt; checklist xử lý incident, fallback và recovery diễn tập; support channel, tài liệu và pilot acceptance có bằng chứng.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-114 \| W1 \| Google Sheets Source-of-Truth & Sync Contract**
  - **Gap/priority:** GAP-03 · P1.
  - **Depends on:** PG-004, PG-005; before PG-007/008 data sync.
  - **Scope:** Định nghĩa authority theo Brand/Agency/tab, mapping row/shift/segment keys, import snapshot, edit collisions, timestamp/version, duplicate, retry, rollback. Default = một chiều Sheet → Ops + export kiểm soát. Hai chiều chỉ khi có approval riêng.
  - **Acceptance:** Có sync specification theo Brand, test Sheet edit→preview→diff→import→DB→export, conflict/duplicate/no-op/retry/rollback; chưa được phép ghi ngược Sheet thì không ghi.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-115 \| W1 \| Room, Studio, Equipment & Channel Registry**
  - **Gap/priority:** GAP-04 · P1.
  - **Depends on:** PG-004, PG-005, PG-008.
  - **Scope:** Kiểm kê phòng live, địa điểm, setup, camera/mic/OBS, thiết bị, status maintenance, tài khoản shop/platform/kênh với Brand ownership riêng. Không trộn phòng vật lý với tài khoản TikTok/Shopee.
  - **Acceptance:** Danh mục có IDs ổn định, RBAC, CRUD chỉ cho phần thiếu, lifecycle/maintenance, business scope, readback và history; liên kết shift/session đúng ID.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-116 \| W1 \| Room/Channel Reservation, Conflict & Emergency Fallback**
  - **Gap/priority:** GAP-04 · P1.
  - **Depends on:** PG-115; PG-008.
  - **Scope:** Đặt phòng/kênh/thiết bị theo khung ca; chặn trùng physical room hoặc platform account không được chia sẻ; override có reason, lịch sử, phương án phòng dự phòng; bảo vệ phiên đã live.
  - **Acceptance:** Các test overlap, across midnight, assignment change, resource outage, concurrent reservation, override permissions và swap do not corrupt original shift staffing.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-117 \| W1 \| Brand–Shop–SKU–Campaign–Scheme Coverage Audit**
  - **Gap/priority:** GAP-05 · P1.
  - **Depends on:** PG-004, PG-005; preserve existing catalog and issue #166.
  - **Scope:** Đối chiếu catalog hiện có với Brand/client, store/channel, SKU/variant, campaign, deal/voucher, promotional scheme, product/creative assets, claim versions và ownership; liên kết Drive file/rights. Không giả định chưa có.
  - **Acceptance:** Coverage matrix FULL_PASS/PARTIAL/MISSING theo entity và từng action, schema/source/version/rights, acceptance evidence. Không phát triển lại entity đã PASS.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-118 \| W1 \| Commercial Master Data Gap Closure (PATCH only)**
  - **Gap/priority:** GAP-05 · P1.
  - **Depends on:** PG-117.
  - **Scope:** Chỉ triển khai thiếu sót đã được xác nhận của Product/SKU/variant, Campaign, voucher/scheme validity, asset rights và Brand/store/channel relations. Tập trung mapping cho đúng Live Session và Report; không thêm dữ liệu claim tưởng tượng.
  - **Acceptance:** Authorized CRUD + version history + SKU/campaign/discount date validation + session-to-store identity + Drive media readback + no regression of existing Brand Catalog.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-119 \| W3 \| Actual-Live State & KPI Provenance/Freshness Contract**
  - **Gap/priority:** GAP-11 · P1.
  - **Depends on:** PG-114, PG-115, PG-116, PG-118; before PG-031/032.
  - **Scope:** Phân biệt scheduled/ready/actually live/ended/error; verified player link vs manual link; nguồn KPI API/export/OCR/manual, last verified timestamp, stale/unavailable, retry và manual fallback; không suy ra đang live chỉ vì đến giờ.
  - **Acceptance:** Actor/DB readback chứng minh trạng thái thật; không phát KPI giả; source label/freshness visible, wrong-Brand/player denied, offline/stale/overnight cases tested.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-120 \| W5 \| Session GMV & Staff Attribution Policy**
  - **Gap/priority:** GAP-06 · P1.
  - **Depends on:** PG-027, PG-028, PG-056; before W6 PG-060/066.
  - **Scope:** Định nghĩa session-level GMV/orders là nguồn chuẩn; Host/Trợ/KT nhiều phân đoạn, thay người/overlap, allocation vs observation, denominator theo approved actual seconds; no double-counting; chưa có policy thì show session level only.
  - **Acceptance:** Tổng GMV/Orders across attributed staff không vượt session canon theo chính sách được duyệt; split/replacement 1-to-N, two-platform, overnight, locked historical snapshots test; không tự gán full GMV cho mỗi người.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-121 \| W5 \| Metric Formula Version, Snapshot & Period Close**
  - **Gap/priority:** GAP-09 · P1.
  - **Depends on:** PG-042, PG-052, PG-056, PG-057, PG-058, PG-059; before W6.
  - **Scope:** KPI source grain/timezone/units, formula definition version + effective date, import snapshot and approved closing period, drift/correction workflow; historical accepted reports immutable except approved revised snapshot.
  - **Acceptance:** Can reproduce report and export by snapshot/formula version; source hash and author/reviewer; new import or rule change leaves previous approved period unchanged unless explicitly revised.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

- [ ] **PG-122 \| W7 \| Capacity, Cost & Retention Budget Guardrails**
  - **Gap/priority:** GAP-10 · P2.
  - **Depends on:** PG-017, PG-051, PG-078, PG-079, PG-081.
  - **Scope:** Forecast DB rows, images/month, backup storage/restore time, provider egress, OCR/AI token bill, queued ingestion, request latency and load headroom; cost-aware retention limits without dropping protected evidence.
  - **Acceptance:** Measured usage baselines with approved budgets/alerts, stress/backpressure tests, retention exceptions, cost comparison of add-on infrastructure and sustainable capacity targets.
  - **State:** PENDING_AUDIT. FULL PASS → FROZEN_SKIP; partial → PATCH_GAP_ONLY; missing → BUILD. No implicit feature rewrites.

### Canonical execution order (unchanged waves, no ID renumbering)

| Wave | Execution order (within wave) |
|---|---|
| R0 | RC19 pre-go-live mandatory gates **before PG-001**: SWAP; Payroll & locked period; RBAC; Google Drive; PG17 restore; critical import correctness; security/monitoring baseline. |
| W0 | PG-001 → PG-002 → PG-003 → PG-004 → PG-005 → PG-006 → **PG-113** |
| W1 | **PG-114** → PG-007 → PG-008 → **PG-115 → PG-116 → PG-117 → PG-118** → PG-009 → PG-010 → PG-011 → PG-012 → PG-013 → PG-014 → PG-015 → PG-016 → PG-017 |
| W2 | PG-018 → PG-019 → PG-020 → PG-021 → PG-022 → PG-023 → PG-024 → PG-025 → PG-026 → PG-027 → PG-028 → PG-029 → PG-030 |
| W3 | **PG-119** → PG-031 → PG-032 → PG-033 → PG-034 → PG-035 → PG-036 → PG-037 → PG-038 → PG-039 |
| W4 | PG-040 → PG-041 → PG-042 → PG-043 → PG-044 → PG-045 → PG-046 → PG-047 → PG-048 → PG-049 |
| W5 | PG-050 → PG-051 → PG-052 → PG-053 → PG-054 → PG-055 → PG-056 → **PG-120** → PG-057 → PG-058 → PG-059 → **PG-121** |
| W6 | PG-060 → PG-061 → PG-062 → PG-063 → PG-064 → PG-065 → PG-066 → PG-067 → PG-068 → PG-069 → PG-070 → PG-071 |
| W7 | PG-072 → PG-073 → PG-074 → PG-075 → PG-076 → PG-077 → PG-078 → PG-079 → PG-080 → PG-081 → **PG-122** → PG-082 |
| W8 | PG-083 → PG-084 → PG-085 → PG-086 → PG-087 → PG-088 → PG-089 → PG-090 → PG-091 → PG-092 → PG-093 |
| W9 | PG-094 → PG-095 → PG-096 → PG-097 → PG-098 → PG-099 → PG-100 |
| W10 | PG-101 → PG-102 → PG-103 → PG-104 → PG-105 → PG-106 → PG-107 → PG-108 → PG-109 → PG-110 → PG-111 → PG-112 |

### Release/quality policy for V1.1

1. P0 requirements are not moved to after-Go-live by the presence of a similar task later in the sequence.
2. Task IDs are permanent and always tied to a wave and execution order. PG numbers above 112 are added later but executed at their designated wave position.
3. Research, audit, and code implementation are separate maturity states. `PENDING_AUDIT` ≠ MISSING; FULL_PASS on latest production SHA is the only basis for FROZEN_SKIP.
4. Changes to frozen code require verified bug/security/regulatory/business rule, approved scope, impact graph, exact before/after snapshots and focused+full regression.
5. Never sum session GMV per Host/Trợ without accepted attribution rules. Any inferred numbers must be visibly labeled and can be withheld.
6. The schedule authority contract is one-way read/import by default. No unapproved bidirectional writeback to the live brand Sheets.
7. Marketplace real-time API access or full viewer embedding is not guaranteed; manual/OCR/import fallback and data freshness status are required.
8. W8/W9/W10 are conditional and can be DEFERRED without preventing production V1 completion.
9. Each wave may have small controlled releases, but the task order/dependency and previously FULL PASS invariants remain.
10. Update GitHub and Notion status only on evidence: actor/UI/API/DB/provider, permission denies, retry/failure, audit, regression, exact release SHA.

### Reference catalogue and acceptance

- [11 repos: license, risk, task mapping](OPS_LIVESTREAM_OPEN_SOURCE_REFERENCE_REPOS_20261117.md)
- [Original 112-task baseline](OPS_POST_GO_LIVE_W0_W10_112_TASKS.md), immutable historical reference.
- [Audit findings (14 GAPs)](OPS_POST_GO_LIVE_ROADMAP_AUDIT_20261117.md).
- [Notion implementation page](https://app.notion.com/p/41b5449511e68184a07ad66f248d8e81).

**This is a docs-only planning amendment. No code, DB, secrets, release branch/main, or production changes have been made.**
