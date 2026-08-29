# Production Smoke Checklist — Core V1 3-role

> Deterministic, read-only, no mock fallback, no DB migration, no production writes.

## Command

```bash
# unauthenticated smoke (no creds required, validates redirects + no mock)
SMOKE_TARGET=production \
E2E_BASE_URL=https://your-production.example \
node --import tests/typescript-alias-loader.mjs scripts/production-smoke.ts

# optional: machine-readable JSON
SMOKE_JSON_OUT=./smoke-results.json SMOKE_TARGET=production E2E_BASE_URL=https://... node --import tests/typescript-alias-loader.mjs scripts/production-smoke.ts
```

Exit code `0` = all PASS, `1` = one or more FAIL, `2` = harness error. Output is `PASS/FAIL` per check.

## Pre-requisites

- `SMOKE_TARGET=production` — enforces `NEXT_PUBLIC_USE_MOCK_DATA !== "true"`; script aborts if mock fallback would hide a prod issue.
- No real passwords/tokens in code. Identities are env-driven only (see `Env` section).
- Never runs DB migrations, never POST/PUT/DELETE. GET-only.

## Checklist (maps to Core V1 bullets)

| # | Area | Check | Expected (unauthenticated) | Automated |
|---|------|-------|-----------------------------|-----------|
| 1 | authentication / protected routes | `GET /calendar`, `/swaps`, `/reports`, `/staff`, `/settings`, `/notifications` | 307/308 → `/login?reason=…&next=…` (or followed → `/login`) | `scripts/production-smoke.ts` |
| 2 | auth entry | `GET /login` | 200 (no redirect loop) | same |
| 3 | dashboard | `GET /` unauth | → `/login` | same |
| 4 | no mock | `NEXT_PUBLIC_USE_MOCK_DATA=true` with `SMOKE_TARGET=production` | script exits 2, BLOCKED | same |
| 5 | no writes | script never issues non-GET | PASS (contract) | same |
| 6 | no migration | no `supabase db push` | PASS (contract) | same |
| 7 | role access matrix | verified offline: `tests/core-v1-3role-matrix.test.ts` | 3-role counts + hierarchy frozen | `node --import tests/typescript-alias-loader.mjs --test tests/core-v1-3role-matrix.test.ts` |
| 8 | Calendar | authenticated UAT: `/calendar` visible for admin/leader/member + reload persists | 200 + `[data-testid="calendar-page"]` after reload | `e2e/core-v1-3role.uat.spec.ts` (cred-required) |
| 9 | My Shifts | same as Calendar (filtered view, no 5xx) | no `/login?reason=` after login | UAT |
| 10 | registration submit | member with `host` operational_role sees eligible CTA | deterministic unit in `core-v1-3role-matrix` + UAT reload | `resolveRegistrationCta` |
| 11 | staffing approval visibility | member hidden, leader/admin visible (`shifts.approve_registration`) | per-role UAT | |
| 12 | swaps visibility/actions | member can request, only leader/admin show `Approve` when `accepted` | per-role UAT | |
| 13 | notifications visibility | `/notifications` visible to all roles | per-role UAT | |
| 14 | Staff access | `/staff` visible; only `admin` has `staff.manage` (invite) | per-role UAT | |
| 15 | Reports access | all submit, only leader/admin review | per-role UAT | |
| 16 | Settings/Admin-only | personal=all, team=leader+, system/audit=admin | per-role UAT | |
| 17 | inactive/archive fail-closed | `mapAuthIdentityToBusinessUser` returns null for inactive/archived | deterministic unit | |
| 18 | refresh persistence | reload `/calendar` after login stays authenticated | UAT reload step | |

## Env — credential-required UAT (never committed)

```bash
# .env.local (not committed) — example shape only:
E2E_BASE_URL=http://127.0.0.1:3101
# or for prod staging smoke against preview/staging URL:
# E2E_BASE_URL=https://your-staging.example
E2E_ADMIN_EMAIL=
E2E_ADMIN_PASSWORD=
E2E_LEADER_EMAIL=
E2E_LEADER_PASSWORD=
E2E_MEMBER_EMAIL=
E2E_MEMBER_PASSWORD=
```

Run the browser UAT:

```bash
npx playwright test e2e/core-v1-3role.uat.spec.ts --project=chromium
# skipped automatically when no creds; deterministic unit tests still run:
node --import tests/typescript-alias-loader.mjs --test tests/core-v1-3role-matrix.test.ts
```

## Separation

- **Automated deterministic** (no creds, no network): `tests/core-v1-3role-matrix.test.ts` + `tests/harness/*` — executes in CI, frozen permission matrix, inactive/archive fail-closed, pure registration logic.
- **Credential-required browser UAT** (env creds, live app): `e2e/core-v1-3role.uat.spec.ts` (skips when no creds) — full 3-role validation via real login + role-gated affordances; no `catch`-swallowed assertions.
- **Production smoke** (unauthenticated, read-only, no mock, no writes, no migration): `scripts/production-smoke.ts` + this checklist — validates redirects/auth entry only. **Unauthenticated smoke does NOT equal full 3-role production validation**; role gating requires the credentialed UAT above.

## PASS/FAIL reporting

- Deterministic unit: `node:test` reporter — `ok` / `not ok`.
- Production smoke: `Production Smoke — X PASS / Y FAIL` + `PASS/FAIL [role] area :: label` per line; also `SMOKE_JSON_OUT`.
- UAT: Playwright reporter + `PASS/FAIL` summary via harness `formatSmokeResults` (when integrated).

## Safety notes

- Do not modify `lib/permissions`, `lib/auth/authIdentity`, or RLS to make tests pass.
- `scripts/production-smoke.ts` never falls back to mock and never writes.
- Rotate any leaked staging/prod passwords immediately; env vars are gitignored via `.env.local`.
