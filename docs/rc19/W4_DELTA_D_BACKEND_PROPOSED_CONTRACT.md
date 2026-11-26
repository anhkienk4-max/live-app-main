# RC19 W4 Delta D: proposed backend contract

Status: V1 architecture disposition accepted in issue #190 comment 7152348591; typed interface still requires Antigravity confirmation. No API, schema or UI acceptance is implied. Baseline: `0b7b6185c43540b7bd53455b136eb8dc0ac5a8f4`. Issue #190 acceptance D01–D11 remains open.

The local PG17 catalog confirms the existing replacement RPC uses text IDs and returns jsonb. Its `registration` response field, actor-scoped idempotency receipt and existing signature remain unchanged. A distinct versioned facade must call the same replacement core in one transaction; do not add an ambiguous PostgREST overload. Preserve existing SQLSTATE/messages and explicitly map new facade errors. Authenticate and authorize before replaying a receipt; reject a key reused with different inputs. A client must reconcile authoritative readback before displaying confirmed success.

Reuse the existing note `affected_user_id`, `affected_role`, `actual_event_time` and `version` fields. Resolve member self-history through the business identity mapping, not `auth.uid()` comparison. The event taxonomy is `skip`, `absent`, `authorized_absence`, `late`, `early_leave`, `approved_pass`, `approved_swap`, `planned_reassignment`, and `other`. Unknown late minutes remain null. Do not require raw check-in as a lower bound for replacement time. Preserve C4 time/segment guards and keep unresolved legacy parent assignments fail-closed.

Codex owns backend/RLS/types and PG tests; Antigravity owns UI after confirming the typed contract. D01–D11 remain pending. Report snapshots are selected and created server-side inside the report revision transaction; external-safe projections are separate from internal personnel evidence.

## Replacement and incident

Extend the existing atomic `replace_shift_assignment` transaction and its receipt. The request supplies the original registration, replacement staff, shift, optional segment, role, effective time, reason, incident classification, optional evidence reference, current versions and idempotency key. The server derives the actor and validates the original and replacement identities, agency and Brand scope, role, segment, eligibility, time, capacity, overlap, versions and existing emergency authority. The response returns the replacement receipt, original and new registration IDs and canonical incident ID/version/status. Retry with the same key and payload returns the same receipt; key reuse with different payload fails. Roster transition, incident, receipt and audit are committed or rolled back together.

The canonical incident records original and replacement staff/registrations, shift/segment/role, business date and timezone, observed/effective interval, type, factual reason, evidence reference, author, review state, timestamps and version. Pending, confirmed, rejected and corrected states require explicit authorized transitions and audit. Approved PASS, planned reassignment and authorized absence are not automatic violations. Missing photos or check-in do not imply absence or skip. Standalone incidents use the same canonical incident identity through authorized shift-note workflow. Existing attendance, evidence, actual work and locked Payroll references remain immutable; no automatic wage or score deduction.

## Persisted notes and reporting

Extend `shift_operational_notes` and its existing service: draft save, submit, review and correction use server-side authorization, shift/segment/subject checks, idempotency and expected-version CAS. A draft returns its stable ID, version and persisted timestamp; a stale version returns a conflict without overwriting the current note. Preserve prior revisions and represent a linked incident by canonical ID instead of copying mutable incident facts. Existing note history remains readable.

Report draft reads authorized report-eligible note IDs and versions and displays pending reviews. Submission records explicit note/incident IDs, source versions and an audience-safe snapshot in the report revision transaction. Retry is idempotent; a later source correction does not mutate a finalized revision or manual recap. Personnel reasons and evidence remain internal unless an authorized visibility rule explicitly permits an external summary.

## Workforce read model

Use canonical incident IDs to deduplicate per-person monthly aggregates by Asia/Ho_Chi_Minh business date, including overnight shifts. Expose confirmed, pending, rejected and corrected states separately; confirmed skip, absent/no-show, late and early-leave counts, plus approved PASS/swap separately. Provide incident and distinct-shift counts explicitly. Verified late minutes require the applicable role-specific personal segment deadline and verified arrival; unknown remains unknown and contributes to an unknown count. Preserve employee and Brand/agency scope and member self-only access. Source ID, version and scoped drilldown are returned with each item.

## Integration gates

Backend implementation must demonstrate D01–D11 on disposable PG17 and authenticated sessions, including transaction rollback, concurrency, retry, stale version, cross-agency denial, report revision immutability and locked-history preservation. Contract names and schema are subject to implementation review; this document does not grant authorization to alter Payroll policy or deploy.
