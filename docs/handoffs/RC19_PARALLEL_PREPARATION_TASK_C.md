# RC19 PARALLEL PREPARATION — ISSUES #164, #74, #168, #76

**Document Type:** Technical Implementation Plan, Acceptance Test Specifications & Dependency Map  
**Author:** Antigravity Parallel Workstream  
**Date:** 2026-11-10  
**Target Baseline:** C5.14 (`fbf1a93f442e4818ff6f529f9bd942a67b00cea5`)  
**Parallel Branch:** `feat/antigravity-rc19-parallel-workstream`  
**Isolation Status:** Strict READ-ONLY preparation for Task C. Zero source code modifications made to Payroll, Attendance, Actual Segments, Payroll Holds, or Compensation during Codex C5.15 execution.

---

## 1. EXECUTIVE CONTEXT & WORKSTREAM SEPARATION

While Codex executes **C5.15 Payroll Final Business Rules** on the release branch, this document establishes the full architecture, test criteria, and dependency mapping for the remaining operational issues:
- **Issue #164:** Stream Reports & 6-Group Evidence Management
- **Issue #74:** Attendance Technical & Camera Photo Check-in/Check-out
- **Issue #168:** Long Streams Segmented Staffing & Cancellation Semantics
- **Issue #76:** Final Worked Hours Approval Barrier Before Payroll Calculation

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

## 2. ISSUE #164 — STREAM REPORTS & 6-GROUP EVIDENCE ORDERING

### 2.1 Problem Statement & Owner Decisions
Live stream post-shift reports require photographic and analytic evidence structured into **six mandatory groups** in an immutable chronological display order. Historical bugs allowed group ordering to scramble upon save/reopen, dropped Dashboard 30-minute metric screenshots, and lost evidence metadata.

### 2.2 Six Mandatory Evidence Groups (Fixed Display Order)
1. **Group 1: Chuẩn bị (Setup / Pre-live)** — Camera framing, lighting, sound check, sample staging, background setup.
2. **Group 2: Trong phiên Live (Studio / During Live)** — Host & Support interaction, product demos, studio atmosphere, pinned vouchers.
3. **Group 3: Kết thúc phiên (Teardown / Post-live)** — Studio pack-up, inventory count handover, device sign-off.
4. **Group 4: Dashboard 30 phút (Dashboard 30-Minute Intervals)** — Sequential screenshots of platform backend analytics captured every 30 minutes (GMV, viewers, click-through rate).
5. **Group 5: Dashboard chung cuộc (Final Dashboard Summary)** — Total revenue, total orders, peak concurrent viewers (PCU), average watch time.
6. **Group 6: Bằng chứng khác / Sự cố (Incidents & Misc)** — Technical glitch proof, network drop logs, platform warning receipts, physical damages.

### 2.3 Technical Implementation Plan
1. **Data Model & Schema:**
   - Report artifact schema in `report_evidence_items` table:
     * `id`: string (UUID)
     * `report_id`: FK to `shift_reports.id`
     * `group_index`: integer (1 to 6)
     * `group_code`: `'setup' | 'studio' | 'teardown' | 'dashboard_interval' | 'dashboard_final' | 'incident'`
     * `order_in_group`: integer (0-indexed sort)
     * `caption`: string
     * `storage_resource_id`: string (FK to `storage_resources`)
     * `drive_file_id`: string (Google Drive file ID)
     * `file_size_bytes`: number
     * `checksum`: string (SHA-256)
     * `captured_at`: timestamptz
2. **Persistence Guarantee:**
   - Save handler (`saveReportEvidence`) must serialize all six groups in array order.
   - Reopen handler (`loadReportEvidence`) must query with `ORDER BY group_index ASC, order_in_group ASC`.
   - Prevent JSON key reshuffling by using explicit typed arrays rather than an unordered key-value dictionary.
3. **Google Drive Integration:**
   - Target folder: `Brand / Year / Month / Shift_ID / Reports / Group_{1..6}`.
   - Provider readback verification: Fetch byte stream or checksum from Google Drive before returning 200 OK to the client.

### 2.4 Acceptance Test Specifications
- `TEST-164-01`: Report creation with all 6 evidence groups preserves exact `group_index` (1..6) upon DB commit.
- `TEST-164-02`: Dashboard 30-minute interval captures accept multiple ordered images with timestamp labels (`14:30`, `15:00`, `15:30`).
- `TEST-164-03`: Editing report text or adding new image to Group 6 preserves original image order in Groups 1..5 without reordering.
- `TEST-164-04`: Reloading report in modal renders tabs/accordions in exact order 1..6 with localized Vietnamese labels.
- `TEST-164-05`: Drive upload fail-closed: If Drive storage API returns 500 or file ID cannot be read back, report save fails and alerts user.

---

## 3. ISSUE #74 — ATTENDANCE TECHNICAL & SELF-ATTENDANCE PHOTO VERIFICATION

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

### 3.3 Technical Implementation Plan
1. **Components to Reuse & Connect:**
   - `components/features/attendance/AttendanceCameraCapture.tsx`
   - `components/features/attendance/SelfAttendancePanel.tsx`
   - `components/features/shifts/ShiftDetailModal.tsx`
   - `lib/server/selfAttendancePhotoHandler.ts`
   - `lib/storage/attendancePhotoDrive.ts`
2. **Feature Flag Validation Matrix:**
   - `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE === 'true'`
   - `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO === 'true'`
   - `FILE_STORAGE_ENABLED === 'true'`
   - If any flag is disabled: UI renders an explicit explanatory banner rather than failing silently.
3. **Database Security & RLS:**
   - `public.record_self_attendance(p_shift_id text, p_action text, p_photo_resource_id text, p_client_time timestamptz)`
   - Server-side assertion: `auth.uid() == shift_registrations.user_id` and registration is `approved` or `manually_assigned`.

### 3.4 Acceptance Test Specifications
- `TEST-74-01`: Eligible assigned Host can trigger camera capture, preview image, and submit Check-in.
- `TEST-74-02`: Check-out is disabled before Check-in is recorded.
- `TEST-74-03`: Unassigned Admin receives 403 when attempting to submit self-attendance for another member.
- `TEST-74-04`: Check-in submitted outside the allowable window (-30m before start to end) fails closed with `CHECKIN_WINDOW_CLOSED`.
- `TEST-74-05`: Photo upload without valid Drive receipt returns 503 and rolls back attendance record.

---

## 4. ISSUE #168 — LONG STREAMS SEGMENTED STAFFING & CANCELLATION SEMANTICS

### 4.1 Problem Statement & Owner Decisions
Livestream sessions often span 8 to 16 hours, manned by multiple sequential shifts or segments (e.g., Host A 09:00–13:00, Host B 13:00–17:00, Host C 17:00–21:00). The schedule importer receives these as a single parent row. Staffing cancellations must differentiate between **full shift cancellation** and **single segment cancellation**.

### 4.2 Segmented Staffing & Cancellation Rules
1. **Parent-Child Hierarchy:**
   - Parent: `Shift` representing the complete live stream window (e.g. 09:00 to 21:00).
   - Children: `ShiftStaffingSegment` representing discrete time slots per operational role.
2. **Segment Cancellation Semantics:**
   - **Segment-Level Cancellation:** A staff member assigned to segment 1 (09:00–13:00) cancels or is cancelled. Only segment 1 is marked `cancelled` and enters the Open Shifts replacement pool. Segments 2 and 3 remain `approved` and unaffected.
   - **Parent Shift Cancellation:** If the brand cancels the live stream event, the parent shift status transitions to `cancelled`, cascading cancellation to all child segments with reason `'PARENT_STREAM_CANCELLED'`.
3. **Compensation & Cancellation Policy:**
   - Cancellation > 24 hours in advance: Unpaid.
   - Cancellation < 2 hours before segment start due to client fault: Standby allowance credited per contract rules.
   - Staff absence / no-show: Status `no_show`, 0 hours credited, disciplinary flag logged.

### 4.3 Technical Implementation Plan
1. **Schema Additions (Post-C5.15):**
   - Table `shift_staffing_segments`:
     * `id`: text (UUID)
     * `shift_id`: text (FK to `shifts.id`)
     * `operational_role`: `'host' | 'support' | 'technical'`
     * `segment_start_time`: time
     * `segment_end_time`: time
     * `assigned_user_id`: text (FK to `business_users.id`)
     * `status`: `'scheduled' | 'cancelled' | 'completed' | 'no_show'`
     * `cancellation_reason`?: text
     * `cancelled_by`?: text
     * `cancelled_at`?: timestamptz
2. **Cancellation RPC:**
   - `public.cancel_staffing_segment(p_segment_id text, p_reason text, p_actor_id text)`
   - Checks caller authority (Leader, Admin, or self if within allowable lead time).
   - Atomic rollback and audit event logging.

### 4.4 Acceptance Test Specifications
- `TEST-168-01`: Single row import with 3 segments creates 1 parent shift and 3 discrete staffing segment rows.
- `TEST-168-02`: Cancelling Segment 1 leaves Segments 2 and 3 in `scheduled` state with intact user assignments.
- `TEST-168-03`: Parent shift cancellation cascades status `cancelled` across all child segments.
- `TEST-168-04`: Cancelled segments are excluded from attendance verification and payroll hour accumulation.

---

## 5. ISSUE #76 — FINAL HOURS APPROVAL BARRIER BEFORE PAYROLL CALCULATION

### 5.1 Problem Statement & Owner Decisions
Raw clock-in/out stamps and unreviewed attendance records must **never leak directly into Payroll calculations**. Only hours that have passed explicit review and approval by a Leader or Admin can be ingested by the payroll calculation engine.

### 5.2 Strict Lifecycle Boundary
```
[Raw Camera Clock-in/out]
         │
         ▼
[Attendance Record (recorded)] ──(System validation)
         │
         ▼
[Submitted for Review (pending_approval)]
         │
         ▼
[Leader / Admin Approval Gate] ──(Explicit approval RPC)
         │
         ▼
[Approved Worked Hours (approved)] ──(Source scan with second precision)
         │
         ▼
[Payroll Draft Engine (C5.15)] ──(Frozen lines, locked export)
```

### 5.3 Technical Implementation Plan
1. **Database Enforcement:**
   - Payroll query in `lib/server/workforcePayrollHandler.ts` and `public.get_payroll_draft_sources`:
     * Must contain clause: `WHERE attendance.status = 'approved' AND attendance.approved_at IS NOT NULL`.
     * Records with status `'recorded'`, `'pending'`, `'rejected'`, or `'flagged'` are strictly skipped.
2. **Payroll Hold Handling:**
   - If an attendance record has an active dispute or `payroll_hold = true`, calculation engine flags the line as `ON_HOLD` and excludes payable amount from the total net payout until the hold is lifted by an Admin.
3. **Idempotency & Re-calculation:**
   - Re-running payroll calculation on the same period produces deterministic, identical line items unless new approved hours are committed.

### 5.4 Acceptance Test Specifications
- `TEST-76-01`: Raw attendance records without Leader approval contribute 0 payable hours to draft payroll.
- `TEST-76-02`: Explicit approval RPC records `approved_by`, `approved_at`, and final `approved_duration_minutes`.
- `TEST-76-03`: A shift with `payroll_hold = true` generates a payslip line with status `HELD` and zero paid amount.
- `TEST-76-04`: Lifting a payroll hold allows subsequent payroll run to include previously held compensation with audit trail.

---

## 6. CODEX C5.15 MERGE RISK REGISTER & INTEGRATION PLAYBOOK

### 6.1 Codex Active File Register (DO NOT MODIFY UNTIL C5.15 SHIPS)
1. `components/features/payroll/MyPayslipPanel.tsx`
2. `components/features/payroll/PayrollDraftWorkspace.tsx`
3. `components/features/payroll/PayrollOverview.tsx`
4. `lib/server/myPayslipHandler.ts`
5. `lib/server/workforcePayrollHandler.ts`
6. `lib/services/workforceService.ts`
7. `lib/workforce/payrollCalculation.ts`
8. `tests/payroll-scope-completeness.test.ts`
9. `tests/rc16-workforce-payroll.test.ts`
10. `tests/rc19-my-payslip.test.ts`
11. `supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql`

### 6.2 Post-C5.15 Safe Merge Sequence
1. **Wait for Codex C5.15 Completion & SHA Attestation:**
   - Confirm Codex commits on release branch and passes targeted payroll test suites.
2. **Fetch and Rebase / Cherry-Pick:**
   - Antigravity branch `feat/antigravity-rc19-parallel-workstream` contains only:
     * Task A: `lib/utils/swapValidation.ts`, swap dialog/modal updates, `rc19-issue93-pass-swap.test.ts`, migration `20261110123000_rc19_issue93_pass_swap_lead_times.sql`.
     * Task B: `lib/utils/brandKnowledgeProvenance.ts`, `BrandKnowledgeProvenanceCard.tsx`, `BrandCatalogWorkspace.tsx` claims section, `rc19-issue99-brand-knowledge.test.ts`.
     * Task C: This planning document `docs/handoffs/RC19_PARALLEL_PREPARATION_TASK_C.md`.
   - Zero overlap with Codex's 11 active payroll files. Rebase will be fast-forward or trivial clean merge.
3. **Execute Full Integrated Verification Suite:**
   - Run combined test suites:
     ```bash
     node --import ./tests/typescript-alias-loader.mjs --test \
       tests/rc19-issue93-pass-swap.test.ts \
       tests/rc19-issue99-brand-knowledge.test.ts \
       tests/shift-swap-two-flow.test.ts \
       tests/swap-request-modes.test.ts \
       tests/brand-catalog-media-kpi.test.ts \
       tests/brand-catalog-schema-pending-ui.test.ts \
       tests/rc16-workforce-payroll.test.ts \
       tests/rc19-my-payslip.test.ts
     ```
   - Run typecheck and scoped linting:
     ```bash
     pnpm exec tsc --noEmit
     pnpm exec eslint components/features/swaps components/features/brand-catalog lib/utils/swapValidation.ts lib/utils/brandKnowledgeProvenance.ts
     ```
4. **Implementation of Tasks #164, #74, #168, #76:**
   - Only after Codex C5.15 is merged and verified will source modifications for Attendance and Reports be merged.
