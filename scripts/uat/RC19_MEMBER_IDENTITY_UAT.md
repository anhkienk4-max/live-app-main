# RC19 #71: Member / Leader / Admin authenticated browser UAT

**Status:** prepared, **not executed**. The current single Preview is on an older SHA and must **not** be used to certify the new integrated code. The consolidated release Preview is created only after final source and CI gates. Do not merge to `main` or use Production as a testing target.

## Preconditions
- Confirm exact branch SHA, the single integration Preview SHA and the Staging Supabase project ref are the same candidate configuration.
- Use authorized **real test accounts** for Member, Leader, Admin, each with valid `auth.users` to active `business_users` mapping and system_permission.
- Never copy JWTs, `Cookie` headers, user IDs, `ownerKey`, email addresses, report data or screenshots containing PII into issue comments/logs. Screenshots should be redacted. No local mock / visual QA bypass is valid authentication evidence.
- Browser DevTools: Network → Preserve log, filter `/api/operations/collection`; Console filter `OPS_LIST_IDENTITY_DIAGNOSTIC`.

## Protocol (each role)
1. Authenticate normally to the **same authorized Preview**, hard refresh the dashboard 20 times. Confirm identity and role visible in UI.
2. Navigate 20 full cycles: `/`, `/notifications`, `/calendar?tab=mine`, `/calendar?tab=open`, `/shifts`, `/swaps`, `/live`. Open Reports too for permitted roles. For each route, capture API status, `entity`, whether collection owner validation passed and any sanitized diagnostic `stage`. Do **not** store the `ownerKey` value.
3. Stable actor must yield **zero** `LIST_IDENTITY_CHANGED` / diagnostic warnings. Legitimate 401 / 403 must show a permission state rather than an unbounded retry or empty fake success. Request/response owner must be from the current verified business user and role.
4. Test account switch and logout **only in controlled UAT sessions**: old in-flight response must be rejected and caches cleared; no previous account rows may appear under the next account.
5. Test a real role change only in a preapproved Staging fixture; in-flight old-role response must be rejected, and after re-login new role must pass. Do not mutate Production account permissions.
6. Check 390 / 768 / 1366 viewport widths on critical pages and both direct navigation + client navigation; no endless skeleton or false 200-empty state.

## Expected non-sensitive diagnostic

Console event `OPS_LIST_IDENTITY_DIAGNOSTIC` has only:
- `entity`: enumerated collection name, not URL/query.
- `stage`: `actor_changed_during_request`, `server_owner_missing` or `server_owner_mismatch`.
- `httpStatus`: integer.

No actual actor ID or `ownerKey` is logged. Record **counts by stage and entity**, not raw values. A stable-session warning is a P0 blocker. A deliberate account switch warning may be expected but **must never expose rows**.

## Required gate

A PASS requires **20 hard reloads and 20 navigation cycles for each Member, Leader and Admin**, 0 unexpected mismatch, correct authorized 200 and restricted 401/403, zero cross-user records, verified Next/Vercel SHA, plus full latest-HEAD TypeScript, ESLint, all regression/browser suites, and single consolidated Preview QC.

Repo tests `tests/rc18-browser-owner-contract.test.ts` include an isolated **mock 20-cycle x 3-role list contract** and negative switch/owner checks. It is **not** a substitute for the real authenticated browser UAT. Full CI for the new SHA must be observed independently.
