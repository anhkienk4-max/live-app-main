# RC1.8A operations workflow scope

Baseline: `origin/main` at `b96dcb6e1842e59f43170a1a8b15da712ee8a8e0`.
This matrix is based on source inspection; screenshots dated 2026-10-20 were not
present in the supplied request attachment or this worktree.

| Area | Status | Source evidence | RC1.8A action / boundary |
| --- | --- | --- | --- |
| Shift status state machine | PARTIAL | `status_mode`, version checks, automatic refresh RPC and manual/automatic UI already exist. | Keep database status authoritative; make cross-screen refresh consistent. Auto-completion still follows the existing `status_mode='auto'` policy and has no separate evidence gate. |
| Cross-module status freshness | SOURCE IMPLEMENTED / RUNTIME UAT PENDING | A shared authenticated Realtime bridge subscribes to shift INSERT/UPDATE events, debounces invalidation, reconnects with bounded backoff and polls while online/visible. Screens invalidate their existing scoped queries. | Event payloads are ignored; hard DELETE is excluded because Realtime cannot RLS-filter it. Soft-delete is an UPDATE. Two-session browser validation and remote publication availability remain unverified. |
| Shifts recency and filters | SOURCE IMPLEMENTED / UAT PENDING | Server pagination supports date, brand, platform, studio, staff, role, staffing, registration and status filters. | Default is newest-first across the most recent 30 business-local dates, with Upcoming and All presets; existing filters and export scope remain server-side. |
| Staffing workflow | PARTIAL | Capacity summaries, direct assignments, registration review and actual staffing approval exist. | Recheck freshness and consistency after approvals; avoid recreating assignment workflows. |
| Registration workflow | PARTIAL | Pending/approved/rejected/cancelled states and permission-checked review exist. | Reconcile cross-screen refresh and verify bulk actions per row; no changes to existing authorization contract. |
| Shift swaps | EXISTING / NEEDS RC1.8A REGRESSION | Existing request/accept/review and assignment conflict guards exist. | Regression-check source/target roster and Calendar/Staffing refresh after approved swaps. |
| Actual Staffing evidence | PARTIAL | `workforce_actual_segments` has draft/review states, overlap checks, independent review and immutable approved records; API is Admin/Leader-only. | Preserve Payroll's approved-evidence-only contract. |
| Self check-in / check-out | MISSING | No self-service attendance event/API or configured location/geofence contract exists. | Backend contract required: voluntary one-time GPS consent, ephemeral coordinates, configured location/radius, PIN hashing/expiry/rate limit, assignment check and audit. Unconfigured locations must fail closed to an approved manual workflow. |
| Actual-time correction | MISSING | Approved actual segments are immutable; no correction request/version record exists. | Add a versioned correction proposal with independent review and immutable history before surfacing a write UI. Payroll must consume only the approved current evidence. |
| Workforce grace | SOURCE IMPLEMENTED / REGRESSION PASS | A shared fixed 10-minute policy now feeds Actual Staffing, Workforce Performance and Overview. | Payable minutes and overtime calculations remain independent. |
| Payroll | EXISTING / NOT RC1.8A FEATURE WORK | RC1.7B calculations, approvals and immutable payroll evidence exist. | Regression only; no rates, payroll periods or activation changes in RC1.8A. |
| Live, Reports, Analytics, Storage providers, global UX | OUT OF RC1.8A IMPLEMENTATION | Broad requirements exist, but these are subsequent release tracks; no full audit is claimed here. | Preserve current behavior; schedule separate RC1.8B+ acceptance after RC1.8A. |

## Test boundary

Unit/API and isolated PostgreSQL evidence are not authenticated Production UAT.
Two-session browser validation, configured geofence locations, consent/retention
approval, and real mobile GPS behavior remain separate acceptance gates.
