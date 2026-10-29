# RC19 Wave 2 Migration Release Checklist

Status: **REVIEW ONLY — NO PRODUCTION SQL APPLIED**

## Candidate migrations

Apply only after separate Owner approval, in timestamp order, as distinct migration files:

1. `20261028010000_rc19_reg02_multi_applicant_approval.sql` — Registration #128.
2. `20261029120000_rc19_staffing_role_scoped_gap_filter.sql` — Staffing #73.

Registration approval remains controlled by the existing `system_settings.require_registration_approval` policy. `false` preserves legacy auto-approval; the competitive queue requires the setting to be enabled by an authorized decision. This candidate does not change that setting.

## Before any Production migration

- [ ] Owner approves both migration files and the exact release SHA.
- [ ] Confirm the target project/ref is Production and record the operator and timestamp.
- [ ] Confirm a current, restorable database backup and a completed isolated restore rehearsal.
- [ ] Compare the live function signatures, definitions, grants, triggers, RLS, and migration history with the candidate preconditions.
- [ ] Review a post-commit compensation script for each replaced function. Transaction-failure tests prove atomic rollback before commit; they are not a substitute for a tested post-commit rollback plan.
- [ ] Capture the pre-migration definitions and ACLs for `private.filtered_shift_ids`, registration/approval/manual-assignment RPCs, and relevant triggers.
- [ ] Confirm no `require_registration_approval`, feature-flag, RLS, or unrelated data change is included.
- [ ] Schedule a maintenance window and assign a release operator and rollback decision owner.

## Execution and verification (not authorized by this document)

- [ ] Apply the Registration migration first; verify the migration record and expected function definitions.
- [ ] Apply the Staffing migration second; verify the helper signature, authenticated-only execute ACL, and caller RPC compatibility.
- [ ] Run signed-session Admin, Leader, and Member smoke checks for registration and role-scoped staffing reads.
- [ ] Verify legacy auto-approval remains unchanged when the existing policy is `false`; only the explicitly enabled competitive workflow uses pending review.
- [ ] Confirm no Production writes outside the approved migration were performed.
- [ ] Record the release SHA, migration versions, operator, results, and rollback target.

## Stop and rollback criteria

- Stop if any migration precondition, ACL, RLS, role scope, capacity result, or caller RPC differs from the reviewed contract.
- Stop if a migration fails or partially applies; inspect the transaction outcome before retrying.
- Do not automatically change approval policy or reject existing registrations to resolve a mismatch.
- Use only the separately reviewed compensation script or approved restore procedure. Do not improvise reverse SQL during an incident.

## Current evidence

- Isolated PostgreSQL 17 candidate suites: PASS on the Wave 2 integration source SHA recorded by GitHub Actions.
- Same-database sequential migration compatibility gate: pending CI on the updated candidate.
- Production backup/restore, signed-session UAT, post-commit compensation rehearsal, and Owner migration approval: **NOT VERIFIED / PENDING**.
- No Production migration, deployment, feature-flag change, or attendance-photo upload is authorized here.
