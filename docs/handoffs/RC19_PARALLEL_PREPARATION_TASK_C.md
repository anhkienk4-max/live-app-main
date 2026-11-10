# RC19 PARALLEL PREPARATION — ISSUES #164, #74, #168, #76

**Document Type:** Technical Implementation Plan, Acceptance Test Specifications & Dependency Map  
**Author:** Antigravity Parallel Workstream  
**Date:** 2026-11-10 (Revised per Owner Feedback)  
**Target Baseline:** C5.14 (`fbf1a93f442e4818ff6f529f9bd942a67b00cea5`)  
**Parallel Branch:** `feat/antigravity-rc19-parallel-workstream`  
**Isolation Status:** Strict READ-ONLY preparation for Task C. Zero source code modifications made to Payroll, Attendance, Actual Segments, Payroll Holds, or Compensation during Codex C5.15 execution.

---

## 1. EXECUTIVE CONTEXT & WORKSTREAM SEPARATION

While Codex executes **C5.15 Payroll Final Business Rules** on the release branch, this document establishes the full architecture, test criteria, and dependency mapping for the remaining operational issues:
- **Issue #164:** Stream Reports & Evidence Management (6 Groups & Ordering Rules)
- **Issue #74:** Attendance Technical & Camera Photo Check-in/Check-out
- **Issue #168:** Long Streams Segmented Staffing & Cancellation Semantics
- **Issue #76:** Final Worked Hours Approval Barrier Before Payroll Calculation (2-Tier Gate)

### File Conflict Boundary with Codex C5.15:
| Module / Area | Codex C5.15 Active Scope | Antigravity Action in Task C | Merge Risk |
| :--- | :--- | :--- | :--- |
| `lib/workforce/payrollCalculation.ts` | ACTIVE EDIT (second-precision, rules) | **FROZEN / READ-ONLY** | CRITICAL (do not edit) |
| `lib/server/workforcePayrollHandler.ts` | ACTIVE EDIT (payroll routes) | **FROZEN / READ-ONLY** | CRITICAL (do not edit) |
| `lib/server/myPayslipHandler.ts` | ACTIVE EDIT (payslip queries) | **FROZEN / READ-ONLY** | HIGH (do not edit) |
| `components/features/payroll/*` | ACTIVE EDIT (MyPayslip, Drafts, Overview) | **FROZEN / READ-ONLY** | HIGH (do not edit) |
| `tests/rc16-workforce-payroll.test.ts` | ACTIVE EDIT (test suites) | **FROZEN / READ-ONLY** | HIGH (do not edit) |
| `lib/utils/swapValidation.ts` | Untouched by Codex | Implemented & Verified in Task A | ZERO |
| `lib/utils/brandKnowledgeProvenance.ts`| Untouched by Codex | Implemented & Verified in Task B | ZERO |
| `components/features/swaps/*` | Untouched by Codex | Updated & Verified in Task A | ZERO |
| `components/features/brand-catalog/*` | Untouched by Codex | Updated & Verified in Task B | ZERO |

---

## 2. ISSUE #164 — STREAM REPORTS & EVIDENCE MANAGEMENT (REVISED)

### 2.1 Problem Statement & Owner Decisions
Live stream post-shift reports require photographic and analytic evidence structured into **six evidence groups** with exact chronological display order and strict conditional rules:
1. **Visibility / KV (Key Visual) là minh chứng bắt buộc khi áp dụng** cho brand/chiến dịch đó.
2. **Dashboard trong phiên trực tiếp chỉ đóng vai trò nhắc nhở (advisory / reminder)**, không được coi là điều kiện chặn cứng làm fail báo cáo nếu hệ thống nền tảng gặp độ trễ.
3. **Ảnh sự cố trong live là có điều kiện (conditional)**: Chỉ bắt buộc khi ca có ghi nhận phát sinh sự cố (kỹ thuật, âm thanh, mạng, sản phẩm). Nếu ca diễn ra bình thường, nhóm này được phép để trống.
4. **Báo cáo ảnh kỹ thuật background (hậu trường kỹ thuật) hiện chưa bắt buộc.**

### 2.2 Six Evidence Groups & Validation Classification
| Nhóm | Tên Nhóm (VN) | Mã Kỹ Thuật | Tính Chất Bắt Buộc | Mô Tả & Quy Tắc Nghiệp Vụ |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Chuẩn bị | `setup` | **Bắt buộc** | Ảnh setup phòng live, ánh sáng, góc máy, âm thanh, mẫu sản phẩm trên bàn. |
| **2** | Trong phiên Live & KV | `studio_kv` | **Bắt buộc khi áp dụng KV** | Tương tác Host/Support, sản phẩm demo. **Visibility/KV là bắt buộc khi áp dụng cho Brand/Campaign.** |
| **3** | Kết thúc phiên | `teardown` | **Bắt buộc** | Dọn dẹp studio, kiểm đếm thiết bị, bàn giao hàng mẫu. |
| **4** | Dashboard trực tiếp (30p) | `dashboard_interval` | **Chỉ nhắc nhở (Advisory)** | Ảnh chụp doanh thu/chỉ số định kỳ mỗi 30 phút. **Chỉ mang tính chất nhắc nhở, không hard-block nộp báo cáo.** |
| **5** | Dashboard chung cuộc | `dashboard_final` | **Bắt buộc** | Doanh số tổng kết, tổng đơn, số người xem cao nhất (PCU), thời gian xem trung bình. |
| **6** | Bằng chứng sự cố | `incident` | **Có điều kiện (Conditional)** | **Chỉ bắt buộc khi ca có phát sinh sự cố.** Nếu ca vận hành suôn sẻ, nhóm này để trống. |

*(Lưu ý: Báo cáo ảnh kỹ thuật background hiện tại chưa bắt buộc).*

### 2.3 Technical Implementation Plan
1. **Data Model & Schema:**
   - Report artifact schema in `report_evidence_items` table:
     * `id`: string (UUID)
     * `report_id`: FK to `shift_reports.id`
     * `group_index`: integer (1 to 6)
     * `group_code`: `'setup' | 'studio_kv' | 'teardown' | 'dashboard_interval' | 'dashboard_final' | 'incident'`
     * `order_in_group`: integer (0-indexed sort)
     * `is_mandatory`: boolean (computed based on brand KV rules and incident flag)
     * `storage_resource_id`: string (FK to `storage_resources`)
     * `drive_file_id`: string (Google Drive file ID)
     * `checksum`: string (SHA-256)
     * `captured_at`: timestamptz
2. **Persistence Guarantee:**
   - Save handler (`saveReportEvidence`) serializes all groups preserving 1..6 array index.
   - Reopen handler (`loadReportEvidence`) queries with `ORDER BY group_index ASC, order_in_group ASC`.

### 2.4 Acceptance Test Specifications
- `TEST-164-01`: Report creation with 6 evidence groups preserves exact `group_index` (1..6) upon DB commit.
- `TEST-164-02`: When brand requires KV, saving report without Key Visual in Group 2 is rejected with `REPORT_KV_EVIDENCE_REQUIRED`.
- `TEST-164-03`: Report without 30-minute interval dashboard photos emits non-blocking reminder banner and permits submission.
- `TEST-164-04`: If `incident_reported = true`, Group 6 requires at least one incident photo receipt; if `false`, Group 6 is optional.
- `TEST-164-05`: Reopening report in modal renders tabs/accordions in exact order 1..6 with localized Vietnamese labels.

---

## 3. ISSUE #74 — ATTENDANCE TECHNICAL & PHOTO VERIFICATION

### 3.1 Problem Statement & Owner Decisions
Assigned operational personnel (Host, Support, Technical) must submit photographic check-in and check-out evidence using device camera directly in the browser. Unassigned personnel or managers cannot forge attendance for staff.

### 3.2 Key Business Rules
1. **Role Eligibility:** Only active operational staff assigned to the specific shift (`Host`, `Support`, `Technical`) can record self-attendance.
2. **Timing Windows:**
   - Check-in: Open from 30 minutes prior to `start_time` until `end_time`.
   - Check-out: Only available AFTER successful Check-in has been persisted; remains open until 2 hours after `end_time`.
3. **Photo Evidence Mandatory:** Attendance record must be bound to a verified photo capture.
4. **Camera Hardware Requirement:** Uses `navigator.mediaDevices.getUserMedia` with rear/front camera toggle; file upload fallback permitted only if camera hardware is unavailable, subject to Leader review flag.
5. **Private Drive ACL:** Photo stored in secure private Drive root with restricted permissions.
6. **No Admin Impersonation:** Admin/Leader cannot record self-attendance on behalf of staff; Manager actions are limited to "Leader Override / Manual Rectification" with mandatory audit logging.

### 3.3 Acceptance Test Specifications
- `TEST-74-01`: Eligible assigned Host can trigger camera capture, preview image, and submit Check-in.
- `TEST-74-02`: Check-out is disabled before Check-in is recorded.
- `TEST-74-03`: Unassigned Admin receives 403 when attempting to submit self-attendance for another member.
- `TEST-74-04`: Check-in submitted outside the allowable window (-30m before start to end) fails closed with `CHECKIN_WINDOW_CLOSED`.

---

## 4. ISSUE #168 — LONG STREAMS SEGMENTED STAFFING & CANCELLATION SEMANTICS

### 4.1 Problem Statement & Owner Decisions
Livestream sessions often span 8 to 16 hours, manned by multiple sequential shifts or segments (e.g., Host A 09:00–13:00, Host B 13:00–17:00). Staffing cancellations must differentiate between **full shift cancellation** and **single segment cancellation**.

### 4.2 Segmented Staffing & Cancellation Rules
1. **Segment-Level Cancellation:** A staff member assigned to segment 1 (09:00–13:00) cancels or is cancelled. Only segment 1 is marked `cancelled` and enters the Open Shifts replacement pool. Segments 2 and 3 remain `approved` and unaffected.
2. **Parent Shift Cancellation:** If the brand cancels the live stream event, the parent shift status transitions to `cancelled`, cascading cancellation to all child segments with reason `'PARENT_STREAM_CANCELLED'`.
3. **Compensation & Cancellation Policy:**
   - Cancellation > 24 hours in advance: Unpaid.
   - Cancellation < 2 hours before segment start due to client fault: Standby allowance credited per contract rules.
   - Staff absence / no-show: Status `no_show`, 0 hours credited, disciplinary flag logged.

### 4.3 Acceptance Test Specifications
- `TEST-168-01`: Single row import with 3 segments creates 1 parent shift and 3 discrete staffing segment rows.
- `TEST-168-02`: Cancelling Segment 1 leaves Segments 2 and 3 in `scheduled` state with intact user assignments.
- `TEST-168-03`: Parent shift cancellation cascades status `cancelled` across all child segments.

---

## 5. ISSUE #76 — FINAL HOURS APPROVAL BARRIER BEFORE PAYROLL (2-TIER WORKFLOW)

### 5.1 Problem Statement & Owner Decisions
Raw clock-in/out stamps and unreviewed attendance records must **never leak directly into Payroll calculations**.
Per Owner explicit instruction:
1. **Leader approval KHÔNG ĐỦ đưa ca vào Payroll.**
2. **Admin confirmation là BẮT BUỘC sau Leader.**
3. **Admin có thể xác nhận trực tiếp (Admin direct confirmation)** mà không cần qua bước Leader nếu Admin là người thực hiện thẩm định.
4. **Không tự tạo các yêu cầu HOLD mới ngoài Owner specification.**

### 5.2 Strict 2-Tier Approval Lifecycle
```
[Raw Camera Clock-in/out]
         │
         ▼
[Attendance Record (recorded)] ──(System timing validation)
         │
         ▼
[Submitted for Review (pending_approval)]
         │
         ├────────────────────────────────────────┐
         │ (Standard Path)                        │ (Fast-Track Path)
         ▼                                        │
[Leader Review & Approval] (Level 1)              │
  (approved_by_leader_at)                         │
         │                                        │
         ▼                                        ▼
[Admin Confirmation Gate] (Level 2 - MANDATORY) ──┘
  (confirmed_by_admin_at, admin_id)
         │
         ▼
[Confirmed Worked Hours (admin_confirmed)]
  (Eligible for Source Scan with Second Precision)
         │
         ▼
[Payroll Draft Calculation Engine (Codex C5.15)]
  (Frozen lines, locked export, second-precision payout)
```

### 5.3 Business Rules for Payroll Eligibility
1. **Status Barrier:** A shift attendance record enters Payroll draft calculation IF AND ONLY IF:
   - `attendance.admin_confirmed = true` AND `attendance.admin_confirmed_at IS NOT NULL`
   - *OR* `attendance.status = 'admin_confirmed'`
   - A record that is only `status = 'leader_approved'` or `status = 'recorded'` is **strictly excluded** from payable hours.
2. **Admin Direct Confirmation:** Admin has full operational authority to execute Level 2 Confirmation directly on `pending_approval` or `recorded` records, setting both `reviewed_by` and `admin_confirmed_by` atomically.
3. **Strict Policy on Payroll Hold:**
   - **Do NOT invent arbitrary HOLD criteria.**
   - Payroll Hold is applied **strictly per Owner specification**:
     * Explicit Admin Dispute Flag (`admin_payroll_hold = true` set manually by Admin during an active dispute).
     * System Hold applied strictly when identity proof / mandatory photo check-in is physically missing and unverified.
   - Any line with active Hold is rendered with badge `TẠM GIỮ (ON_HOLD)` with zero payable amount until released by Admin.

### 5.4 Acceptance Test Specifications
- `TEST-76-01`: Shifts with only Leader approval (`leader_approved`) contribute 0 payable hours to draft payroll.
- `TEST-76-02`: Admin confirmation following Leader approval transitions status to `admin_confirmed` and enables inclusion in payroll draft.
- `TEST-76-03`: Admin direct confirmation on a pending attendance record bypasses Leader step and enables payroll inclusion immediately.
- `TEST-76-04`: Shifts with explicit `admin_payroll_hold = true` generate a payslip line with status `HELD` and 0 net pay until lifted.

---

## 6. CODEX C5.15 MERGE RISK REGISTER & INTEGRATION PLAYBOOK

### 6.1 Codex Active File Register (DO NOT MODIFY UNTIL C5.15 SHIPS)
1. `components/features/payroll/MyPayslipPanel.tsx`
2. `components/features/payroll/PayrollDraftWorkspace.tsx`
3. `components/features/payroll/PayrollOverview.tsx`
4. `components/features/shifts/ActualStaffingPanel.tsx`
5. `lib/server/myPayslipHandler.ts`
6. `lib/server/workforceActualHandler.ts`
7. `lib/server/workforcePayrollHandler.ts`
8. `lib/services/workforceService.ts`
9. `lib/workforce/payrollCalculation.ts`
10. `tests/payroll-scope-completeness.test.ts`
11. `tests/rc16-workforce-payroll.test.ts`
12. `tests/rc19-my-payslip.test.ts`
13. `supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql`
14. `supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql`
15. `supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql`

### 6.2 Antigravity Parallel Workstream Changed Files (Disjoint Set)
1. `lib/utils/swapValidation.ts`
2. `lib/utils/brandKnowledgeProvenance.ts`
3. `lib/services/dataService.ts` (swapRequestService section only)
4. `lib/server/brandCatalogHandler.ts` (`knowledge.confirm_resolution` action)
5. `components/features/swaps/SwapRequestDialog.tsx`
6. `components/features/swaps/SwapRequestFormModal.tsx`
7. `components/features/brand-catalog/BrandCatalogWorkspace.tsx`
8. `components/features/brand-catalog/BrandKnowledgeProvenanceCard.tsx`
9. `supabase/migrations/20261110123000_rc19_issue93_pass_swap_lead_times.sql`
10. `tests/rc19-issue93-pass-swap.test.ts`
11. `tests/rc19-issue99-brand-knowledge.test.ts`
12. `docs/handoffs/RC19_PARALLEL_PREPARATION_TASK_C.md`

### 6.3 Post-C5.15 Safe Merge Sequence
1. Confirm Codex commits C5.15 on `release/rc19-c5.4-candidate` and tests PASS.
2. Sequence Antigravity migration cleanly after Codex migrations (e.g. `20261110150000_rc19_issue93_pass_swap_lead_times.sql`).
3. Rebase `feat/antigravity-rc19-parallel-workstream` onto updated release branch.
4. Execute full combined regression test suite.
