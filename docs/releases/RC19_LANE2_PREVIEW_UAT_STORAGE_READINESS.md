# RC19 Lane 2 Preview, UAT, and Storage Readiness

Updated: 2026-10-31

## Source and environment

| Item | Verified state |
|---|---|
| Master base | `integration/rc19-master-calendar-20261030` at `86ddfcd0278a68e6868022592bfdb6d20a06c3b3` |
| Lane 2 worktree | `feat/rc19-lane2-preview-uat-readiness`; isolated from the Master worktree |
| Vercel project | `livestream2/livestream-ops`; project ID `prj_YSrsxfYK7skM17D3KtiXUGeim2kr`; repository root; Preview protection `all_except_custom_domains` |
| Staging Supabase | `amagnzebmmuqiptmrjmc`, healthy PostgreSQL 17; existing data present, not a disposable database |
| Production changes | None; no deployment, migration, route activation, file write, or permission change |

The Staging project is populated (79 shifts, 21 registrations, 9 reports, and 0 operational storage routes at inspection). Do not use it for destructive schema setup or route-seed rehearsal.

## Preview gate

**Status: NOT DEPLOYED.** The Lane 2 branch currently has no branch-specific Preview variables. The Vercel project has 122 general Preview variables, including Google Drive/OneDrive and file-provider settings. Values were not copied or recorded. Deployment protection is configured, but safe Staging/provider isolation for this branch has not been established.

Before deploying this branch, configure exact-branch Preview values for both Supabase URLs and use the Staging project only; provide its publishable/anon key and server-only secret through Vercel's protected environment-variable UI. Set `NEXT_PUBLIC_USE_MOCK_DATA=false`, keep all unapproved feature flags and `FILE_STORAGE_ENABLED` off, and ensure no Production provider credentials can be inherited. Do not place server secrets in `NEXT_PUBLIC_*` variables. The Admin-only diagnostic added in this branch reports project references, target match, Preview/Staging readiness, key-presence booleans, and fixed validation error codes; it never returns raw URLs or key values.

## UAT ledger

| Feature | Role | Expected | Actual | Result | Environment / evidence | Defect / retest |
|---|---|---|---|---|---|---|
| Runtime target diagnostic | Admin | Exact Preview public and server targets both resolve to Staging; secrets are not returned | Contract tests verify matching Staging and Production-target rejection | PASS (unit/contract only) | Local Node tests at Lane 2 source; no Preview deployment | None |
| Runtime target diagnostic | Leader | Admin-only endpoint denies access | Handler test verifies HTTP 403 with no target details | PASS (unit/contract only) | Mocked actor | None |
| Runtime target diagnostic | Member | Admin-only endpoint denies access | No member actor or live session was exercised in the focused contract run | NOT RUN | Authenticated UAT not run | Preview plus authorized member session required |
| Admin authenticated Preview workflows | Admin | Approved read-only and controlled workflows | No safe Preview candidate deployed | NOT RUN | Preview configuration gate open | Staging-scoped Preview config required |
| Leader authenticated Preview workflows | Leader | Team/brand permissions and denials | No safe Preview candidate deployed | NOT RUN | No Leader Preview session used | Staging-scoped Preview config and authorized session required |
| Member authenticated Preview workflows | Member | Own data and cross-user denials | No safe Preview candidate deployed | NOT RUN | No Member Preview session used | Staging-scoped Preview config and authorized session required |
| Reports/Payroll/Storage cross-scope API checks | All | Server-side authorization and RLS deny out-of-scope reads | Existing automated tests only; live candidate unavailable | NOT RUN (authenticated UAT) | No real Preview requests | Preview plus approved test identities required |

## Storage and Attendance

- Existing automated PostgreSQL/PGlite seed-preflight suite verified exactly 13 internal routes, 0 Agency routes, idempotency, approval checks, and rollback. The 13-route seed ran only inside PGlite; no Staging or Production rows were written.
- Actual PostgreSQL 17 server tests were not available locally: 10 STO-01 PostgreSQL server cases and 1 STO-02 PostgreSQL server case were skipped because no disposable local server was listening. Do not count these as PASS.
- The Staging `operational_storage_routes` table had 0 rows. Physical route IDs are intentionally not supplied in the source runbook. No route seed was run.
- Runtime Google Drive/OneDrive identity and provider capability were not verified on the RC19 Preview. No synthetic upload/readback was attempted because the branch has no dedicated isolated provider identity/root.
- The three previously verified Storage binary backups/restores are prior evidence and were not repeated here.
- Attendance evidence remains OFF and must use its separate private root. No employee image was uploaded and no ACL was changed.
- The Owner-accepted `anyone:writer` permission on `LIVESTREAM REPORT` was left unchanged; no confidential Attendance, HR, or Payroll evidence was placed there.

## Local source checks

The diagnostics contract and UAT harness tests are separate from real authenticated UAT. Record exact-SHA CI after a safely suppressed or safely configured push. Production authenticated UAT remains NOT RUN and belongs to the release integrator.
