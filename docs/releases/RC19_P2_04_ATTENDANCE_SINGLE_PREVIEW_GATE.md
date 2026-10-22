# RC19 P2-04 | Member check-in / reviewer evidence | release gate

**Scope:** Ops source branch `integration/rc19-one-preview-release-20261023`, not yet Production-approved.

## What is already implemented
- PostgreSQL immutable event journal `public.self_attendance_events` and authenticated-only RPCs `self_attendance_record`, `get_my_self_attendance`.
- Canonical staging migration `20261022185140_rc19_p2_04_member_attendance_event_journal.sql` (migration ledger version `20261022185140`).
- Self-attendance panel in Shift Detail, visible only with `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE=true` AND a staffed registration for the current actor.
- Existing Workforce GET for Admin/Leader may read this **independent, unapproved** journal only with server-side flag `FEATURE_SELF_ATTENDANCE_REVIEW=true`. This flag defaults **OFF** to keep existing Production GET functioning before the new database migration.
- Attendance review evidence in `PayrollAttendanceLink` shown only if response `attendance_review_enabled===true`; false does not imply zero employee check-ins.

## Unchangeable separation
`check_in/check_out` → **pending verification raw events**; not a direct `workforce_actual_segments` write, not an approved Actual Segment, not an auto deduction, not a Payroll line. Approved Actual Segments and reviewed rate cards remain Payroll sources of truth. The manager must separately verify evidence and record/review an actual segment using existing authenticated Admin/Leader workflow; the same user must not approve their own segment.

## Staging QA already completed
- Member-assigned user: check-out-before-check-in DENIED; check-in created; identical request UUID idempotently replayed; new UUID duplicate rejected; check-out created.
- Mutation of journal row denied by trigger; different actor cannot replay another actor's request or view another actor's raw history.
- All test writes to shifts/events **inside a transaction rolled back**; independently verified journal count 0 afterward.
- Database RLS on, anon/authenticated direct-table SELECT off; RPC EXECUTE only authenticated.
- Security Advisor intentionally reports RLS-without-policy and externally callable SEC-DEF RPC. Mandatory manual security sign-off required; do not waive solely because the staging SQL tests passed.

## Combined Preview UAT, before Production migration/release
1. Obtain a single approved combined Preview of the final candidate SHA. No per-module Preview. Confirm staging project/URL, secret boundaries, flags and source SHA.
2. Turn on `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE=true`, `FEATURE_SELF_ATTENDANCE_REVIEW=true`, and existing `FEATURE_ACTUAL_STAFFING=true` **only in the staging-backed combined Preview**. Never send `service_role`/server secrets to `NEXT_PUBLIC_*`.
3. Browser UAT with authenticated Member Host, Member Support/Tech, Leader and Admin: ownership checks, SSO/session identity changes, hard reload/replay, invalid/locked/overnight shift, assignments surrendered via swap, duplicate submissions and errors.
4. Leader view: confirm raw app timestamp differs from operations-group check-in evidence and reviewed Actual Segment. Validate missing evidence states; false flag must hide entire raw panel, never display a fabricated `0 check-ins` claim.
5. Exercise manual reconciliation: separate reviewer, expected-version on Actual Segment, proper audit and no automatic Payroll line/penalty; verify locked Payroll cannot be silently recalculated.
6. Before Production: verify real R0 Member Identity #71, approval scope and screenshot regressions; run migrations in audited order, verify grants and role-bound RPCs; gate release on full CI and authenticated UAT sign-off.

## Rollback
- Disable `FEATURE_SELF_ATTENDANCE_REVIEW` to immediately stop extra Workforce journal queries; keep existing Workforce API behavior.
- Disable `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE` and rebuild/redeploy only through authorized Production release control to hide Member attendance UI.
- Never remove/modify immutable events as a rollback. Do not delete audit trails or reverse Payroll adjustments without separate reviewed procedure.
- Capture release SHA, domain alias, Vercel deployment ID, schema version and incident note.
