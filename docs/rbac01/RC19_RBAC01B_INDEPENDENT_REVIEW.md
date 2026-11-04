# RBAC-01B independent security review | #103 | Draft PR #124

Parent PR #122. Source baseline 2e6e287c8c11c9e0bc7fa4d440298b8f788966e8. Permission: audit.view_team ONLY.

| Finding | Severity | Problem | Mitigation |
|---|---|---|---|
| VERSION-01 | HIGH | Latest-approved-only reader dropped earlier DENY when newer unrelated delta omitted this permission | Iterate approved deltas newest-to-oldest; absent key carries forward older DENY until explicit independently approved INHERIT |
| VERSION-02 | HIGH | Malformed override, null and allow silently evaluated as access granted | Explicit values other than exact INHERIT are DENY; unknown values fail closed |
| VERSION-03 | HIGH | Approved entry without independent matching audit provenance was trusted | Require valid distinct proposer and approver, coherent timestamps, matching approved audit event for version/role/actor |
| RLS-01 | HIGH | Extra permissive SELECT policy could defeat one-policy DENY | SQL transaction aborts on any policy inventory mismatch; CI negative policy-injection test |
| RLS-02 | HIGH | Function owner might not bypass forced private RLS or use a privileged security definer | Verify private table owner, RLS/FORCE RLS and function owner privileges; fixed search_path; test grants |
| UI-01 | HIGH | Existing rows/details remained in client memory after 403 or capability 500 | Clear list, selected detail, actor directory, archived data on reload and failures |
| UI-02 | MEDIUM | Browser tab already showing data did not refresh authorization on return | Recheck on window focus, pageshow, visibilitychange with no-store signed capability; use latest request generation only |

## Version semantics

**Delta, not full snapshot.** Every independently approved version records only changed permissions. Traverse newest approved to oldest. Missing key carries earlier decision forward; explicit INHERIT restores default scope and DENY withdraws Leader team audit read. Invalid approval provenance, unexpected JSON types or values, including ALLOW and null, never grant. No approved version means exact RC19 legacy behavior. A failed validity check denies, rather than looking through forged data. No browser, API or SQL auto-approval; parent RBAC01_ENFORCEMENT_NOT_ATTESTED endpoint remains blocked.

## Threat boundaries

Member retains zero audit read; Admin retains original all-audit read. Leader remains scoped to calendar/live/reports/campaigns/swaps/imports. The single authorized permission is not an identity, brand or row-scope override. Supabase direct SELECT/REST and actor-page RPC must independently enforce the current role and delta. A privileged database owner could forge a signed-looking audit event, so provenance is not cryptographic; owner DBA and migration approvals remain independent security requirements.

The browser is **not a security boundary**. A request after revocation checks the current version and RLS. An already opened tab rechecks on focus/visibility/page return; **immediate push invalidation while a tab remains continuously visible is not implemented**. Already downloaded data cannot be recalled. SQL policy drift after installation could invalidate the security proof and requires separately approved migration access and monitoring.

## Scope and verification

Source CI tests TypeScript, ESLint, authenticated server-handler simulations, PostgreSQL 17 direct SELECT/RPC with negative cases, browser mock at 390/768/1440 and full regression/build. Isolated synthetic approved versions are seeded only in disposable PostgreSQL; never on Production. Browser mock is NOT signed Production UAT.

Only audit.view_team has the reviewed slice. The other 31 permission catalog entries, Finance/Payroll/provider/private Storage and RBAC-02 are BLOCKED or out of scope. No Production migration, flags, merge, deploy or data modifications. Parent #122 and child #124 stay Draft pending owner review, deployed SHA verification, backup/rollback and signed-session UAT.
