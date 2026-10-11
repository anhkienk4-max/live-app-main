## Why
The public-only build guard misses a Production SUPABASE_URL override and skips
local production builds. Direct server client creation bypasses the build guard.

## What Changes
- Share strict project/deployment validation between process and runtime guards.
- Load Next environment files before checking development/build/start configuration.
- Validate both effective URLs and deployment metadata before any server client.
- Use one configuration snapshot; keep credentials behind server-only boundaries.
- Keep an explicit credential-free local CI build exception with no runtime access.
- Add environment/auth regressions and CI path coverage; preserve Payroll/Storage.
- Disable Git auto-deployment only for the backend feature branch so authorized
  pushes run GitHub CI without deploying Preview; other branches retain defaults.

## Boundaries
No cloud configuration, credentials retrieval, migration, fixture write, deployment,
UI change or permission change. URL identity is not credential ownership proof.
C02 remains open until an approved immutable Preview has independent key/provider
isolation evidence. No custom Supabase domain is currently verified.
