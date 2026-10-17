# ADA OPS P0.3 — Actual Staging Finance / Payroll SQL UAT (rollback only)

**Target:** existing free Supabase Staging `amagnzebmmuqiptmrjmc`.
**Date:** 2026-10-18 (Asia/Ho_Chi_Minh).
**Status:** **PASS for direct PostgreSQL transactional business rules**, NOT full
Next.js/HTTP/JWT/browser UAT, and **not Production approval**.

## Evidence and reproducible SQL

Test file: `tests/uat/ops-p03-staging-rollback-only-payroll.sql`.

The harness is intended for **this exact Staging database only**. It starts
with `BEGIN`, Staging-specific row-count/schema preflight guards and a
transaction-level advisory lock, creates *fake* synthetic test records with
`@example.invalid` email addresses, exercises the original audited DB
triggers/functions, and ends with `ROLLBACK`. No existing people/shift rows
are edited. It does not create Supabase Auth users, external Drive objects,
OAuth tokens, documents, or real pay obligations.

Production is SELECT-only throughout the entire exercise.
This is **not** the independent CI fixture, which explicitly forbids using
its own minimal-table test suite against Supabase.

## Direct Staging assertions executed and passed

1. Create 3 fake `business_users` (two independent Admin/reviewers,
   one Host) and 1 fake, completed shift, using existing brand/platform
   IDs *only* as FK targets. No existing business user/shift row modified.
2. Record a worked, 90-minute host segment, approve using a **different**
   reviewer, and confirm segment review is `approved`.
3. Confirm an approved segment cannot be modified afterwards:
   `WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE`.
4. Register an explicit fake approved rate card (100,000 VND/hour,
   overtime multiplier 1.5x), create a fake period and a single payroll line.
5. Verify independently calculated gross/net are both 175,000 VND;
   direct mutation to salary row is rejected by **RC16B**
   `WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC`.
6. Correct the draft line through the canonical
   `workforce_rc16b_correct_payroll_line` RPC, with expected version 1.
   Assert updated gross=125,000, net=124,000, version=2 and one audit row.
7. Retry the exact same request UUID + payload; confirm idempotent
   `replayed:true` with no additional audit row.
8. Reuse same UUID with changed payload; reject with
   `WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT`.
9. Submit new UUID against stale version 1; reject with
   `WORKFORCE_PAYROLL_STALE_LINE`.
10. Transition period:
    Draft → Reviewed → Confirmed → Payroll Ready → Locked, with distinct
    Admin/reviewer participants, then assert precisely 5 audit entries
    (one correction + four state changes).
11. Confirm a Locked period cannot be silently returned to Draft:
    `WORKFORCE_PERIOD_LOCKED`.
12. `SET LOCAL ROLE service_role` and test **complete financial snapshot**
    via `get_payroll_period_snapshot`: one line, five audit entries, full
    lengths of both JSON arrays. Assert authenticated/anon cannot execute
    this RPC via grants inspection. No financial objects are returned to
    the chat or PR.

The SQL returned the synthetic aggregate verdict:
`PASS — transaction-rollback-only Staging synthetic UAT`, with
1 segment, 1 rate card, 1 period, 1 line, 5 audits,
temporarily 15 staff and 80 shifts **inside the open transaction**.

## Rollback independently confirmed

After the test was committed, an independent new SQL connection
verified the original data state:

| Object | Committed row count |
| --- | ---: |
| Existing shifts | 79 |
| Existing business users | 12 |
| Existing audit_logs | 1,398 |
| Existing storage routes | 2 |
| Operational file metadata | 0 |
| Actual segments | 0 |
| Rate cards | 0 |
| Payroll periods | 0 |
| Payroll lines | 0 |
| Payroll audit | 0 |

One initial run exposed a test assumption mismatch: after applying RC16B,
direct salary updates are rejected by
`WORKFORCE_PAYROLL_CORRECTION_REQUIRES_RPC` *before* the old RC16 gross
error. The harness was updated to assert the current canonical RC16B error,
not weaken the business invariant. A rerun passed. No failed transaction
left financial records behind.

**Limitations:** Test executes as database privileged connection (including
`SET LOCAL ROLE service_role` for snapshot). It does not validate
Supabase-issued JWT or the Next.js API, email/login flows, browser access,
actual CSV upload/export, external provider file upload, load p95,
or concurrent correction race. All real finance feature flags and web UAT
remain unverified.

## Next mandatory GO gates

- Check the exact Git commit / Vercel Preview deployment and
  **staging-only** environment variables without revealing secret values.
- Run browser/API UAT on a verified Staging Preview with fake Auth accounts
  for actual review, rate-card entry, period draft and corrections.
- Exercise Storage provider reference-only paths with sandbox accounts,
  not Production folders.
- Verify role revocation, negative scope and actual concurrent requests
  under independent credential sessions.
- Re-run CI / release-gate test matrix for this branch and record full
  results; a successful SQL transaction alone is insufficient for GO.
- Never promote Staging SQL reconciliation scripts as Production migrations.
