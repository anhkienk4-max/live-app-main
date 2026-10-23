# RC19 #84 · Staging Reports signed-JWT HTTP gate

This is an intentionally **read-only Staging UAT** and does **not** authorize RC19 Production release.

## Provenance

- Target: `https://amagnzebmmuqiptmrjmc.supabase.co` **only**. The runner rejects any other origin (including Production).
- Script: `scripts/uat/rc19-reports-signed-jwt.mjs`
- Offline mock/unit checks: `node --test scripts/uat/rc19-reports-signed-jwt.test.mjs`
- Legacy SQL simulation: `scripts/uat/rc19-reports-rls-role-simulation.sql`. Its simulated role/JWT context is **not** a signed-JWT HTTP session.
- Current CI step runs **offline mocks only**; it does not access Staging or require JWT secrets.

## Real signed-token prerequisites

Use fresh signed **Staging** access tokens for independent authenticated accounts with `app_metadata.system_permission` exactly `member`, `leader`, `admin`. Never use a `service_role` / secret key or Production credentials. Provision accounts through the existing approved Staging onboarding/authentication workflow, not this script. Do not commit, paste into chat, screenshot, or log a JWT.

Environment variables:

| Variable | Purpose |
| --- | --- |
| `RC19_STAGING_URL` | Optional: must exactly equal the pinned Staging origin |
| `RC19_STAGING_PUBLISHABLE_KEY` | Staging publishable/legacy anon public API key (never a service secret) |
| `RC19_ADMIN_JWT` | Fresh Admin signed-in access token |
| `RC19_LEADER_JWT` | Fresh Leader signed-in access token |
| `RC19_MEMBER_JWT` | Fresh Member signed-in token for minimum smoke |
| `RC19_MEMBER_JWT_1` ... `RC19_MEMBER_JWT_5` | Preferred five distinct Member accounts; supersede single-token variable |
| `RC19_REQUIRE_FIVE_MEMBERS=true` | Require all five Member JWTs for sign-off |

For Windows PowerShell, enter sensitive values interactively without putting them into command history:

```powershell
function Read-SecretEnv([string]$Name) {
  $secret = Read-Host $Name -AsSecureString
  $envValue = [System.Net.NetworkCredential]::new('', $secret).Password
  [Environment]::SetEnvironmentVariable($Name, $envValue, 'Process')
}
$env:RC19_STAGING_URL = 'https://amagnzebmmuqiptmrjmc.supabase.co'
Read-SecretEnv 'RC19_STAGING_PUBLISHABLE_KEY'
Read-SecretEnv 'RC19_ADMIN_JWT'
Read-SecretEnv 'RC19_LEADER_JWT'
Read-SecretEnv 'RC19_MEMBER_JWT_1'
# Repeat for RC19_MEMBER_JWT_2 through _5 when available.
node scripts/uat/rc19-reports-signed-jwt.mjs
# Clear all tokens and public key from this terminal immediately afterward:
'RC19_ADMIN_JWT','RC19_LEADER_JWT','RC19_MEMBER_JWT',
'RC19_MEMBER_JWT_1','RC19_MEMBER_JWT_2','RC19_MEMBER_JWT_3',
'RC19_MEMBER_JWT_4','RC19_MEMBER_JWT_5',
'RC19_STAGING_PUBLISHABLE_KEY' | ForEach-Object {
  [Environment]::SetEnvironmentVariable($_, $null, 'Process')
}
```

To certify the **5-Member** matrix, set `RC19_REQUIRE_FIVE_MEMBERS=true` and supply five different Staging Member tokens (the example above shows only one).

The runner uses `GET` only for reports, images, revisions and `/auth/v1/user`, plus a read-only `POST` to `get_report_revisions`. It checks Admin active/archive visibility, Leader non-archive visibility, signed-in Member ownership, four foreign-report table denials, a foreign revision RPC denial, an authorized revision RPC, anonymous denial and distinct identities. It emits only PASS counts/error codes, **never report IDs, users, tokens, headers or response bodies**.

A fail/timeout is **NO-GO**, not an instruction to loosen RLS. Require a separately reviewed Production migration with rollback plan and explicit owner approval. This runner never writes data or deploys.

## Remaining release gates

- 5-Member, Leader, Admin **real JWT HTTP** UAT must PASS against exactly the integrated candidate/Staging schema.
- #71 Member stable-session browser route/reload matrix (20 repetitions), not included in this test.
- Latest source SHA full TypeScript, ESLint, canonical regression, responsive browser suites, production-equivalent build.
- One single integrated Preview QC, with Production migration review, backup and rollback approval. Analytics remains HOLD.
