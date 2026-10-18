# ADA OPS P0.4 — Workforce / Payroll API and UI acceptance

Target: existing Clean Staging amagnzebmmuqiptmrjmc.
Production egdjnpmoasarrttvhgds SELECT-only; no paid project created.

## Evidence hierarchy

**Tier 1 — actual Staging PostgreSQL: PASS.**
The transaction-rollback-only fake-data UAT recorded a verified Host segment,
independent reviewer, rate card, payroll period/line, correction RPC with
optimistic concurrency, idempotent retry, four approval/lock transitions,
5 audit entries and a complete service-role-only payroll snapshot.
No real user/shift records were modified. A fresh connection after
ROLLBACK found 79 shifts, 12 business users, zero persisted pay records.
See docs/performance/ops-p03-staging-finance-transaction-uat.md.

**Tier 2 — Next.js handler/API contract tests: added; head CI gate required.**
The new tests/rc16-p04-staging-api-contract.test.ts contains 6 cases for
anonymous/Member/Leader denial before privileged client access, completed
shift draft record, scheduled shift/inactive staff/no-show rejection,
independent approval preserving submitted evidence, self-review/stale/
version-race rejection and role-scoped capability flags.
Tests use **injected mock clients + user resolvers**; they are not actual
Preview HTTP or a Supabase-issued JWT. The tests were registered in
tests/final-release-test-manifest.json after a CI manifest-inventory
failure on the first commit; never bypass the inventory validator.

**Tier 3 — local browser: baseline CI PASS, but MOCKED.**
Release Candidate Convergence run 39074856544 PASSED at prior head:
typecheck, lint, full prior manifest, isolated PG, Next.js build and
desktop/390px Playwright. The Playwright RC16 config runs on
127.0.0.1:3101 using NEXT_PUBLIC_USE_MOCK_DATA=true.
It does not represent real Staging browser acceptance.

**Tier 4 — deployed Preview with real Supabase Auth: NOT DONE.**
Neither mock test nor SQL using a simulated request.jwt.claim.sub
is a substitute for a true signed Auth JWT and full HTTP workflow.

## Auth mapping readiness — counts only

Aggregate LEFT JOIN of Staging public.business_users to auth.users
without returning names, emails, Auth UUIDs or other identifiers:

| Role | Active users | Matched Auth rows | Disabled / unapproved |
| --- | ---: | ---: | ---: |
| Admin | 2 | 2 | 1 |
| Leader | 2 | 2 | 0 |
| Member | 7 | 5 | 0 |

Two active Member business users are **not linked** to an Auth identity.
Do not create or silently provision identities. No password, JWT,
credential or real user session was accessed.

## Role and feature acceptance matrix

| API / workflow | Admin | Leader | Member | Anonymous |
| --- | --- | --- | --- | --- |
| Actual Staffing record/review | allowed with independent review | allowed with independent review | 403 | 401 |
| Team Workforce overview | team read | team read | 403 | 401 |
| Individual Workforce performance | supervisor scope | supervisor scope | own scope only | 401 |
| Payroll GET rates/period/snapshot/CSV | allowed | 403 | 403 | 401 |
| Payroll POST rates/draft/correction/void | allowed with DB guards | 403 | 403 | 401 |
| Capabilities read | scoped flags | scoped flags | own performance flag only | 401 |

When a feature flag is OFF, otherwise authorized callers must get 503.
No service-role key may be sent to a browser. Existing app code defaults
FEATURE_PAYROLL and FEATURE_ACTUAL_STAFFING to false.

## Preview block and zero-spend policy

On earlier SHA 208074f, the Vercel status for livestream-ops-demo
reported failure with an upgradeToPro=build-rate-limit link.
live-app-clean failed independently. Connector team lookup works for
livestream2, but Vercel deployment list returned 403 and Preview env
metadata lookup returned 404. Therefore effective deployment SHA/env
bindings and code-level reason for live-app-clean failure are unknown.
Do not guess from Git status or a Vercel project name.

Owner prohibits new paid infrastructure: do not upgrade Pro, buy
build minutes, create Supabase Branching resources or deploy to Production
as a shortcut. Avoid unnecessary no-op commits and rebuild loops.

## Required real Staging Preview / JWT UAT

1. Verify immutable Preview deployment SHA, team/project identity and
   VERCEL_ENV=preview.
2. Verify both Supabase public/server refs equal amagnzebmmuqiptmrjmc,
   mocks false and protected feature flags true in Preview only. Report
   booleans, never secret values.
3. Test actual JWT sessions from approved staging-only credentials
   for Admin/Leader/Member/disabled/anonymous, including no-store
   and 401/403 responses.
4. Exercise real HTTP UI and API for attendance creation, independent
   review, rate-card approval, payroll draft, 409 stale correction,
   retry idempotency, audit timeline, CSV, and locked period.
5. Validate desktop and 390px protected navigation, dashboard refresh,
   no salary exposure to Member/Leader, and flag OFF failure.
6. Ensure fake records are fully isolated and cleaned, no provider
   notification/webhook or real Drive/OneDrive side effects.
7. Attach redacted evidence and obtain independent Finance/security
   reviewer sign-off before merge or Production deployment.

**Decision: database business UAT PASS, API contract testing under CI,
real cloud Preview and JWT E2E BLOCKED; Production NO-GO.**

## P0.5 — verified staging-negative-auth, CI and no-spend preview control

**READ-ONLY actual Staging regression PASS**, SQL source
`tests/uat/ops-p05-staging-negative-auth-readonly.sql`.
Under `SET LOCAL ROLE authenticated` and a *simulated* linked Member
Auth-sub claim, the database confirmed the Member role is active and has
a narrower visible-shift scope than the full 79 records, with **no
direct SELECT privilege** on Workforce pay rates, periods or lines,
and no `get_payroll_period_snapshot` execute grant.
Under an absent synthetic Auth sub (`00000000-...0000`), the
authorization helper returns inactive/no business permission and the
shift, report and swap list RPCs **all fail closed** with SQLSTATE 42501.
The test runs in a read-only transaction ending in ROLLBACK and returns
only one non-sensitive PASS/FAIL verdict. It **does not** exercise a
Supabase-signed JWT, real HTTP session or Vercel Preview.

**GitHub Release Candidate Convergence Gate at P0.4 head
`42239a2f`: SUCCESS** (workflow `39076459845`).
Includes TypeScript, lint, entire registered Node/TS test inventory,
isolated PostgreSQL checks, Next.js production-equivalent build and
mock-browser routes. The parallel Workforce/Payroll Foundation jobs
both passed substantive build/regression but **FAILED** at
`git diff --check` because
`supabase/reconciliation/ops-p0-staging/rc15_operational_files_staging.sql`
had a trailing blank line at EOF. The trailing blank was removed
without changing SQL semantics. Re-run on the amended head remains the
authoritative gate.

**No-spend Vercel policy implemented in source**: the exact UAT branch
`uat/ops-p0-staging-rc16k-list-bridge` was explicitly disabled from
automatic Git-triggered Preview builds in `vercel.json`; the
`tests/rc16-environment-security.test.ts` canonical config assertion
was updated accordingly. All other unspecified branches retain Vercel's
default behavior; Production `main` is not disabled. This stops
wasting scarce free-tier previews while both linked Vercel checks fail
with `upgradeToPro=build-rate-limit`. The project owner has
**forbidden a paid upgrade**. Re-enable this exact branch only after
free Preview capacity becomes available and staging-only environment
bindings are independently verified.

**Remaining NO-GO**: signed Auth JWT/HTTP and deployed browser testing,
zero-side-effect external file-provider UAT, finance and security review,
and Production release authorization. Neither this change nor the
SQL smoke suite makes Production deployable.
