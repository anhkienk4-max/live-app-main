# RC19 Lane 2 | Preview / authenticated UAT / Storage readiness

**Status: PREPARATION ONLY. NO DEPLOY, NO DATABASE WRITE, NO CLOUD FILE WRITE.**
**Source baseline:** Master PR #155, `86ddfcd0278a68e6868022592bfdb6d20a06c3b3`.
**Lane ownership:** Lane 2 prepares candidate UAT and Storage evidence. Lane 1 owns Auth export/recovery, recovery-key custody, Production migrations and Production release.

## Non-negotiable boundaries

- **Owner decision:** retain `anyone:writer` on the existing `LIVESTREAM REPORT` operational Drive root as `OWNER_ACCEPTED_RISK`. Do **not** change ACLs, existing folders or mappings. This is not evidence of private-data security.
- No Production SQL, route seed, feature flag, Preview or Production deployment as part of this Lane 2 change.
- No Production Auth account creation, Provider OAuth token extraction, Storage upload or mutation.
- Keep Attendance evidence, HR, Payroll and other private files outside the broad-access operational root.
- Preserve the 201 historical shifts; separately tracked as safe-to-defer data quality debt.

## 1. Candidate Preview preflight, not execution

The current Production deployment serves older source `e8ac8dc30d4d177437ca97315bda84b163fbc4db`. **Admin login on Production does not certify RC19.**

Before anyone authorizes **a separate future Preview deployment**, the release owner must verify and retain private evidence for:

| Gate | Required evidence | Without it |
| --- | --- | --- |
| Exact candidate | Immutable RC19 deployment URL, deployment ID, served full SHA, GitHub PR #155 integration | NOT RUN |
| Isolation | Protected access, no Production alias; effective client AND privileged Supabase target resolve to Staging project `amagnzebmmuqiptmrjmc` | NO-GO |
| Credentials | Verified ownership of Staging-only secrets via approved control plane; **never** log or copy secret values | NO-GO |
| OAuth | Approved callback/redirect for immutable Preview; authorized staging Admin/Leader/Member test identities | NOT RUN |
| Drive | Separate synthetic provider account/destination or a demonstrably read-only disabled provider; no path to Production files | NO-GO for provider writes |
| Flags | Attendance, Agency, Payroll and dependent features OFF by default until their own gates PASS | Feature stays OFF |
| Schema | Applied *Staging* prerequisites documented; compare ledger and RLS before test mutations | NOT RUN |
| UAT safety | `playwright.preview-uat.config.ts` must accept the immutable HTTPS Vercel deployment URL; no localhost/Production alias | NOT RUN |

**Do not infer environment parity from variable *names* or a public browser bundle.** Server-side privileged target must be independently checked without revealing keys. No deployment has been performed by Lane 2.

Existing `.github/workflows/rc19-one-preview-release-gate.yml` is **NO DEPLOY** CI. It is not a Preview deployment or authenticated UAT result.

## 2. Existing UAT harness: actual scope and guard

Reuse `e2e/preview-authenticated-uat.spec.ts` and `playwright.preview-uat.config.ts`. The present browser harness performs manual sign-in for Admin/Leader/Member and detailed **Reports** read-only checks. It does **not** yet certify every module or satisfy the separate 20-reload/20-navigation Member Identity #71 protocol.

This Lane 2 change adds `lib/uat/rc19PreviewHostPolicy.ts` and a fail-closed browser route guard:

- Denies **every HTTP method**, including GET, to `ops5729.top` and its subdomains.
- Denies requests to other `*.vercel.app` deployments outside the approved immutable Preview origin.
- Preserves the existing prohibition against non-Staging `*.supabase.co` endpoints and non-allowlisted writes.
- Records only sanitized reason/path and marks authenticated UAT **FAIL** if an external application host was contacted.
- Does not certify that runtime server-side code is isolated. That requires the separate Preview preflight above.

Safe local test:

```sh
node --experimental-strip-types --test tests/rc19-preview-host-policy.test.ts
node --experimental-strip-types --test tests/preview-auth-uat-contract.test.ts
```

These are **offline source tests**, not signed-in role UAT.

## 3. Authenticated Admin/Leader/Member UAT matrix

After a protected RC19 Preview with verified Staging identity exists, test using **authorized real accounts**. Preserve evidence with role, expected vs actual, HTTP code, candidate SHA, timestamp, sanitized screenshot and defect status. Never export cookies, tokens, employee rows or passwords.

| Feature and security boundary | Admin | Leader | Member |
| --- | --- | --- | --- |
| Login, refresh, logout, role switch, identity cache | Authorized session and mapping | Authorized session and mapping | Own session only |
| Calendar, shifts, registration | Manage approved scope | Team/brand scope | Personal/allowed shifts |
| Staffing, approvals | Authorized approval | Only explicitly delegated approval | Must reject privileged mutations |
| PASS/SWAP | Authorized review | Delegated review | Own request only |
| Brand/Product/SKU and Admin workspace | Admin-only mutation | Scoped read, denied Admin mutation | Denied Admin mutation |
| Reports and export | Authorized scope | Scoped access/export per policy | Own authorized data; denied restricted export |
| Payroll and Workforce | Salary and reviewer-independence rules | Limited approved scope | No other-user salary/actual segments |
| Storage and private Attendance | Correct authenticated provider + private reviewer | Authorized evidence review | Own evidence only |
| RLS/direct API denial | No accidental bypass | No cross-team/brand access | 401/403 on foreign IDs and privileged endpoints |
| Responsive and accessibility | 320/390/768/1440 | 320/390/768/1440 | 320/390/768/1440 |

Run signed-session API checks; hidden UI controls alone are not authorization evidence. For Member Identity #71, follow `scripts/uat/RC19_MEMBER_IDENTITY_UAT.md`: 20 hard reloads and 20 navigation cycles for each role. Record zero unexpected identity changes and no cross-user rows. No new UAT was executed in this Lane 2 change.

## 4. Drive runtime and STO-01 13-route readiness

Source entrypoints:
- `lib/server/googleDriveAuth.ts` (OAuth refresh token by default, or service account)
- `lib/server/fileProviderDiagnosticsRouteHandler.ts` (Admin-only, returns configuration presence and root capabilities; **not** the runtime principal)
- `lib/server/googleDriveFileProvider.ts`
- `lib/server/attendanceDriveAcl.ts`

Existing Admin diagnostics indicate OAuth mode and root readable/writable, but runtime principal, exact provider file placement and real app-adapter readback remain **unverified**. A personal Drive connector session does not substitute for the deployed app principal. Do not expose refresh tokens or build public diagnostics.

STO-01 source contract is defined in `docs/storage/RC19_STO01_PRIVATE_ROOT_ACTIVATION_RUNBOOK.md` and `scripts/storage/seed-v1-production-routes.sql`: **exactly 13 Internal Google Drive routes, zero Agency routes**. Preserve the existing mapped folder IDs, Brand/Platform/Period layout and isolated private Attendance root. Production currently has zero active routes.

Pre-activation proof needed from the future authorized runtime:
1. Secret-safe principal determination and existing root/bases ancestry.
2. Read and write capability through the actual app adapter, not a human Drive session.
3. Approved synthetic non-sensitive destination and exact readback SHA-256.
4. Parent inheritance/private root isolation for Attendance, including anonymous denial.
5. Exact 13-route mapping, database snapshot, approved approver, idempotent seed and selective rollback.
6. Source test results and a distinct real-provider UAT result.

Existing isolated STO tests:
- `tests/rc19-sto01-storage-seed-preflight.test.ts` (PGlite, not Production)
- `tests/rc19-sto01-storage-seed-postgres17.test.ts` (requires a specifically confirmed disposable local PG17 database)

Do **not** execute the latter against an unknown or non-disposable database. No route SQL is applied by this handoff. The public-writer exception remains unchanged and cannot satisfy private Attendance security.

## 5. Lane 1 release handoff

| Workstream | Lane 2 evidence in this change | Still needed before RC19 GO |
| --- | --- | --- |
| Source | New offline Preview host isolation guard + tests | Integrate only after review and exact-SHA CI |
| Protected Preview | Preflight documented; not deployed | Confirm protected immutable candidate, Staging server/client credential provenance |
| Three-role UAT | Matrix prepared; existing Reports harness retained | Real signed-in Admin/Leader/Member runs across critical modules |
| Operational Drive | Runtime check plan prepared | Actual provider identity + synthetic upload/readback |
| 13 internal routes | Existing runbook/test references retained | Isolated approved rehearsal, then separately authorized Production activation |
| Private Attendance | Separate gate documented | Real parent-chain/private ACL, evidence and role checks |
| Recovery | Lane 1 remains responsible | Auth export/restore and independent recovery key |

**Never mark Preview deployment, signed-in UAT, provider writes, route activation or Production release as PASS solely from this source PR.**
