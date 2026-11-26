# RC19 W4 PASS / Swap segment-aware handoff

Status: source contract proposal from Codex backend WIP; not authenticated acceptance. Frontend worktree remains frozen and unchanged.

## Canonical selection identity

- Source selection is the exact active `shift_registrations.id`. The role is read from that row; a UI must not select `assigned.find(role)` when one person has multiple registrations of that role in a parent shift.
- For a segmented assignment, `staffing_segment_id` is required and must belong to the selected parent shift. Display that segment's persisted `start_at`/`end_at`; do not display the parent shift time as the assignment interval.
- Exchange counterpart selection is the exact counterpart `shift_registrations.id`. The target segment and role are read from that registration. Persisted registration IDs remain canonical; no client-supplied segment/time becomes authorization evidence.
- A legacy registration with `staffing_segment_id IS NULL` remains usable only when its shift has no staffing segments. If the parent has segments, missing segment identity fails closed with `SWAP_SEGMENT_SELECTION_REQUIRED`.

## Existing API/RPC surface

The forward migration keeps existing names and request payloads:

- `check_shift_swap_conflict(p_source_registration_id, p_mode, p_replacement_staff_id, p_target_shift_id, p_counterpart_registration_id)`
- `get_swap_exchange_candidates_v2(p_shift_id, p_role)` returns each exact candidate registration with `operational_role`, `staffing_segment_id`, `segment_index`, `effective_start_at`, `effective_end_at`, Brand and authoritative Agency. The old three-field candidate RPC remains available for existing clients. Its row shape is typed in `lib/types/segmentAwarePassSwap.ts`.
- `create_shift_swap_request(p_source_registration_id, p_mode, p_reason, p_target_shift_id, p_replacement_staff_id, p_counterpart_registration_id, p_notes)`
- Authenticated approval remains the version-fenced `approve_shift_swap_request(p_request_id, p_notes, p_expected_version)`. The two-argument approval core remains revoked from authenticated callers.

PASS replaces only the source registration's persisted segment. Exchange replaces exactly the source and counterpart registrations, preserving each destination `staffing_segment_id`. The backend now permits same-parent Exchange, including different segments, subject to interval/capacity checks. The historical assignments are cancelled, not rewritten.

## Server checks

- Effective conflict intervals use half-open `[start_at,end_at)` segment ranges; unsegmented legacy assignments use the parent range.
- Candidate overlap checks run across assignments, including overnight ranges represented by persisted timestamps. Non-overlapping same-role segments in one parent shift do not conflict. Cross-parent overlapping assignments remain conflicts.
- Capacity is checked for the exact role/segment. Legacy capacity is checked against parent-role capacity only for shifts with no segments.
- Role eligibility, active account, existing Brand read scope, and canonical active Agency membership are checked again on create/approval. Missing authoritative Agency or membership fails closed.
- Existing Daily PASS two-hour lead time, Campaign PASS 24-hour approval lead time, and no approval at/after live start are retained. This migration does not change timing policy.
- Registration locks, shift locks, user advisory locks, unique active-request constraints, expected-version approval, and segment-capacity triggers remain authoritative.

## Error/UI mapping

| Error/result | UI treatment |
|---|---|
| `VERIFIED_CLEAR` | Allow review/submit for the current selection only |
| `CONFLICT` | Keep disabled; explain assignment overlap/capacity without exposing another person's schedule |
| `SWAP_SEGMENT_SELECTION_REQUIRED` / `SWAP_SEGMENT_SHIFT_MISMATCH` | Require a valid segment registration; do not fallback to parent hours |
| `ROLE_NOT_QUALIFIED`, `REPLACEMENT_INACTIVE`, `COUNTERPART_INACTIVE` | Show eligibility denial and refresh candidates |
| `RC19_AGENCY_SCOPE_UNRESOLVED`, `RC19_AGENCY_MEMBERSHIP_REQUIRED` | Fail closed and request authorized scope resolution |
| `SOURCE_STALE`, `COUNTERPART_STALE`, `SOURCE_NOT_ACTIVE` | Refresh the roster and reconfirm; do not resubmit against stale IDs |
| `SHIFT_FULL`, `STAFFING_CAPACITY_EXCEEDED`, `SHIFT_CONFLICT`, `MULTI_ROLE_NOT_ALLOWED` | Show conflict and refresh availability |
| `DAILY_PASS_DEADLINE_EXCEEDED`, `CAMPAIGN_PASS_DEADLINE_EXCEEDED`, `PASS_DURING_LIVE_NOT_ALLOWED`, `EXCHANGE_DURING_LIVE_NOT_ALLOWED` | Keep current policy denial; do not offer an ordinary PASS/SWAP override |
| `STALE_WRITE` / version conflict | Refresh request and require explicit reconfirmation |
| `DUPLICATE_ACTIVE_SWAP`, `DUPLICATE_COUNTERPART_SWAP` | Reconcile existing request before permitting a new mutation |

The current database has active-request uniqueness, not actor-scoped payload idempotency/replay. An uncertain create response must query the current request by source registration before retrying; the UI must not mint a second request. A future idempotency key needs a separately versioned contract and migration.

## Frontend interaction requirements

1. Source picker lists registrations, not unique parent shifts; same-role registrations on K01/K02 must remain separately selectable.
2. Show source and counterpart segment index, exact interval, role, Brand and business date.
3. Switch the counterpart picker to `get_swap_exchange_candidates_v2`; preserve its exact registration ID and display the supplied segment index/interval.
4. Preserve exact source/counterpart registration IDs through preflight, create, accept, and version-fenced approval.
5. Same-parent target segments may be selected when they are a different concrete active registration; do not filter only on `target_shift_id !== source_shift_id`.
6. Keep preflight status attached to the complete selection identity (actor, source registration, mode, replacement or counterpart registration). Any change invalidates prior verification.
7. Approval preview must show the exact before/after registration and segment; success requires persisted roster readback.
8. Calendar, Staffing, Attendance and Actual Work should read the new active registration while preserving cancelled source registration/history. Payroll consumes approved actual-work by assignment; PASS/SWAP is not a violation or automatic deduction.

## Acceptance status

Source-level contract and SQL tests are local evidence only. Real PostgreSQL 17 migration replay, authenticated GoTrue role/Agency tests, create/respond/approve flows, concurrency, and persisted downstream readback remain required before PASS. Owner-policy-dependent cases remain blocked and are not changed here.
