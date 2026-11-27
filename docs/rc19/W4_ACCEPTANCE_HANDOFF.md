# RC19 W4 hosted acceptance handoff

Status: handoff contract for Codex 02. No hosted Auth, PG17 runtime, migration, browser, Production, or Staging execution is claimed here.

## Entry point review

`scripts/rc19-w4-application-acceptance.mjs` is a disposable Supabase Auth/PostgREST fixture runner, not an end-to-end application acceptance runner. It creates synthetic users and staffing rows, verifies identity/RLS/Brand behavior, and requires a local marked database. It currently stops at `AGENCY_FIXTURE_PROVISIONING_NOT_IMPLEMENTED` once the canonical Agency column exists, does not start Next.js, does not execute browser UAT, and does not run D01–D11, External Summary, Workforce totals, PASS/Swap receipts, or temporal Attendance/Payroll cases. Do not treat its existing aggregate `status: passed` field or `browser_uat.ran: false` as application acceptance. Keep Codex 02's workflow orchestration as the runner owner; have that workflow start `npm run dev -- --hostname 127.0.0.1 --port <reserved-port>` and wait for an HTTP-ready response before authenticated Playwright execution. Next.js 16.2.10's bundled CLI guide documents `next dev` and `--hostname`/`--port` under `node_modules/next/dist/docs/01-app/03-api-reference/06-cli/next.md`.

## Fixture and evidence requirements

- Use a fresh marked disposable PG17 runtime with GoTrue and PostgREST. Record database identity, marker, PostgreSQL version, migration ledger, extension versions, roles, grants/default grants, RLS, triggers, and event triggers before applying migrations.
- Create real Admin, scoped Leader, in-Agency Member, out-of-Agency Member, revoked Member, counterpart Member, unassigned Member, and wrong-Brand Leader identities. Record Auth UUID, canonical `business_users.id`/`auth_user_id`, role, active status, Brand scope, and Agency membership for each actor.
- Seed only synthetic rows with unique run IDs. Read back each shift, exact staffing segment, registration, incident, report/summary, receipt, Attendance/Payroll source row, and API response before reporting PASS.
- Start the candidate application on loopback explicitly. Do not accept a browser artifact unless it records the exact application SHA, disposable runtime marker, browser version, authenticated actor, requested case, expected result, actual result, and evidence path.
- Keep the fresh-runtime migration path separate from historical-upgrade rehearsal. Historical upgrade requires a verified Production-compatible schema/roles/ACL/default-ACL/trigger/RLS/ledger baseline; an empty database or CLI dry-run is insufficient.

## Attendance-photo Origin Guard owner handoff

`lib/server/selfAttendancePhotoHandler.ts` now imports the shared `hasExactOrigin()` from `lib/server/apiSecurity.ts`; the local matching-port URL-prefix bypass has been removed. The shared helper requires exact same-origin by default and only normalizes loopback aliases in explicitly disposable test/development with both runtime opt-ins. The integrated regression test covers early denial before actor resolution. Attendance/ACL owner review and runtime negative-matrix evidence are still pending; include production/preview/staging, missing opt-in, non-loopback host, cross-port, malformed or multi-value Origin, credentials, and malformed URL. The unit test is source-level evidence, not hosted runtime acceptance.

## Per-case result envelope

Codex 02 should emit one object per case with these fields: `case_id`, `actor`, `expected`, `actual`, `evidence_scope`, and `status` (`PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`). Overall acceptance must be `PASS` only when every required case passes; BLOCKED/NOT RUN must remain explicit.

The following is the current source-review handoff, not a hosted run report:

| Case | Actor | Expected | Actual | Evidence scope | Status |
|---|---|---|---|---|---|
| Auth and canonical business identity | Admin, Leader, Member | GoTrue session resolves to exactly one active canonical business user and matching role | Fixture logic exists; hosted session not run | Entry-point source review only | NOT RUN |
| Agency Membership | In-Agency, out-of-Agency, revoked Member | In-scope operation succeeds; absent/revoked membership fails closed | Fixture provisioning is explicitly incomplete | Entry-point source review | BLOCKED |
| External Summary | Admin, scoped Leader, Member | Authorization, CAS, idempotency replay, and persisted summary/readback match | Existing API contract and migration; no hosted case | Source contract only | NOT RUN |
| Workforce full-scope aggregates | Admin, scoped Leader, Member | Category/status/late-minute totals match full filtered scope before page slicing | Existing API contract and migration; no hosted readback | Source contract only | NOT RUN |
| PASS/Swap receipt lifecycle | Admin, Leader, requester, counterpart, revoked actor | Same key replays one persisted row; changed payload, revoked, cross-user, and cross-Agency replay deny; registration/segment identity remains exact | Focused PGlite regression 4/4 passes; authenticated PG17 not run | PGlite PostgreSQL-engine fixture; no GoTrue | BLOCKED |
| D01–D11 | Required role per Codex 02 case definition | Each case has exact expected and persisted actual result | Case-to-business-group mapping must be supplied by Codex 02; no run here | Handoff only | NOT RUN |
| Temporal Attendance/Payroll | Member, reviewer, payroll actor | Effective dates, source event times, payroll linkage and denied boundary cases match canonical rows | No hosted cases | Handoff only | NOT RUN |
| Persisted API/database readback | Each actor/action | Returned API data matches persisted DB rows and receipt | Workforce source and receipt PGlite fixture cover source behavior only | PGlite/source; no hosted API/Auth | BLOCKED |
| Actual authenticated browser | Admin, Leader, Member | Next app starts at the candidate SHA; browser logs in, performs scoped action, and sees persisted readback | Next startup/browser test not performed by this entrypoint | No browser evidence | NOT RUN |

Codex 02 must map the 15 business groups to named cases before claiming coverage. Keep each D01–D11 item separately reported; do not substitute aggregate `authorization: true` or `application_api: true` flags.

## Case dependencies

1. Apply and verify the Agency Membership migration before any Agency-scoped fixtures.
2. Apply Workforce scope totals and full-scope totals before aggregate readback.
3. Apply the segment-aware PASS/Swap migration before the receipt wrapper migration.
4. Apply the remaining D-series/Attendance/Payroll dependencies recorded in the workflow manifest before those cases.
5. Start the app from the exact reviewed SHA, run authenticated browser cases, then reconcile browser outputs with persisted database readback and the same disposable marker.
