# Verification record

Baseline main: `7f5efbfec23db84ad1d74024b08a591523aa4217`. Candidate sources are the RC1.7D PR commits. All local commands execute in the isolated feature worktree; no Production credentials or writes are used by the test servers.

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript | PASS, exit 0 | `corepack pnpm run type-check`; `test-results/rc17d-typecheck-final.log` |
| Full ESLint | PASS, 0 errors, 24 existing warnings | `corepack pnpm run lint`; `test-results/rc17d-lint-final.log` |
| Focused navigation/auth/calendar/shell tests | 75 PASS, 0 FAIL, 0 SKIP | Exact file set in `.github/workflows/rc17d-responsive-gate.yml`; `test-results/rc17d-focused-final.log` |
| Full release manifest | 1705 PASS, 0 FAIL, 3 explicitly opt-in staging SKIP | `node scripts/run-final-regression.mjs`; `test-results/rc17d-regression-final.log` |
| RC1.7D responsive/interactions | 12/12 Playwright tests PASS | `RC17D_SUITE=verified pnpm exec playwright test --config playwright.rc17d.config.ts`; `test-results/rc17d-after-verified/playwright.json` |
| Public Supabase-mode auth | 2/2 Playwright tests PASS, 36 width measurements | `RC17D_AUTH=1 RC17D_SUITE=auth pnpm exec playwright test --config playwright.rc17d.config.ts`; `test-results/rc17d-after-auth/playwright.json` |
| Dense agenda/filter screenshot supplement | 1/1 Playwright test PASS | Same dense workflow on existing local mock server; `test-results/rc17d-supplemental.log` |
| Existing workflow/hydration browser suite | PENDING | `pnpm exec playwright test --config playwright.rc16.config.ts --output test-results/rc17d-existing-workflows` |
| Existing Calendar browser suite | PENDING | `pnpm exec playwright test --config playwright.rc16l.config.ts --output test-results/rc17d-existing-calendar --reporter list` |
| Credential-free production build | PENDING | `CI=true NEXT_PUBLIC_USE_MOCK_DATA=false OPERATIONAL_STORAGE_ROUTING_MODE=database pnpm run build`; all Supabase config empty |
| OpenSpec strict validation | PASS | `pnpm exec openspec validate rc17d-responsive-auth --strict` |
| Final whitespace / scoped diff review | PENDING | `git diff --check` |
| Canonical memory sync/validation | PENDING | Run after source commit; no business rule records changed |
| Exact-head GitHub CI | PENDING PR | See PR checks and linked workflow runs; do not substitute local results |

## Browser interpretation

Before: 630 route/role/width measurements, 156 failing geometry or touch rows. After: 720/720 passing measured states, including separate enabled and public non-mock scenarios. These counts are **not 720 independent business transactions**. Route guards and feature-off states are included and labeled in the CSV. Internal table scrolling is intentional and focusable; page-level horizontal overflow is not allowed.

Phone touch checks measure 44px targets (native checkboxes may use their associated label). Viewport containment, drawer focus trapping/Escape/Back/close-on-navigation, dense/overnight cards, URL history, filter multi-select/reset, export/detail dialogs and a Member detail CTA are exercised. Chromium viewport simulation does not establish physical-device usability, all possible data states or authenticated RLS/Production correctness.

## Production read-only evidence and blockers

- https://ops5729.top public Login/Register/Forgot/Reset reads returned HTTP 200; 12 actual captures at 375, 768 and 1440.
- Supabase public Auth settings returned HTTP 200: Google false, email true, disable_signup true. No provider settings changed; no secrets are stored in this report.
- Google Console credentials, Site URL, redirect allowlist, Before User Created hook runtime binding, approved/unapproved Google round trip, real login/logout/session expiration/recovery completion and Admin/Leader/Member Production workflows: **NOT_VERIFIED**.
- Browser integration discovery returned no available browser. No credentials were entered or sessions copied.
- Served Production SHA and authoritative Vercel logs are unverified. Baseline live-app-clean status is failure ([deployment context](https://vercel.com/livestream2/live-app-clean/A15bPcCeCdTZcL91cwNJnnUDucxH)); the separate demo success is not evidence for ops5729.top.

**Decision: NO-GO for Production.** Review the draft PR, exact-head CI, authorized provider setup and real role UAT before a separate release decision. No merge/deploy/migration/provider mutation was performed.
