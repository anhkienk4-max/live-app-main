# Verification record

Baseline main: `7f5efbfec23db84ad1d74024b08a591523aa4217`. Browser and full regression evidence was collected after integrating main `371426bc53b6fac2fcef97433c02b45c3c6b4e9e`. Main `b96dcb6e1842e59f43170a1a8b15da712ee8a8e0` was then merged and checked with the focused tests and build below. All local commands execute in the isolated feature worktree; no Production credentials or writes are used by the test servers.

| Check | Actual result | Evidence |
|---|---|---|
| TypeScript after `b96dcb6` merge | PASS, exit 0 | `corepack pnpm run type-check` after regenerating Next route types |
| Scoped ESLint after `b96dcb6` merge | PASS, exit 0 | `corepack pnpm exec eslint` on Header and merged Live/Shift source files |
| Full ESLint before `b96dcb6` merge | PASS, 0 errors, 24 warnings | `corepack pnpm run lint`; `test-results/rc17d-lint-final.log` |
| Focused navigation/auth/calendar/shell/Live tests after `b96dcb6` merge | 79 PASS, 0 FAIL, 0 SKIP | RC1.7D CI focused set plus `tests/phase2b-live-stream-link.test.ts` |
| Full release manifest before `b96dcb6` merge | 1709 PASS, 0 FAIL, 3 opt-in staging SKIP | `test-results/rc17d-regression-integrated-final.log`, on main `371426b` |
| RC1.7D responsive/interactions | 12/12 Playwright tests PASS | `RC17D_SUITE=verified pnpm exec playwright test --config playwright.rc17d.config.ts`; `test-results/rc17d-after-verified/playwright.json` |
| Public Supabase-mode auth | 2/2 Playwright tests PASS, 36 width measurements | `RC17D_AUTH=1 RC17D_SUITE=auth pnpm exec playwright test --config playwright.rc17d.config.ts`; `test-results/rc17d-after-auth/playwright.json` |
| Dense agenda/filter screenshot supplement | 1/1 Playwright test PASS | Same dense workflow on existing local mock server; `test-results/rc17d-supplemental.log` |
| Existing workflow/hydration browser suite before `b96dcb6` merge | 46 PASS | `test-results/rc17d-existing-workflows.log` |
| Existing Calendar browser suite before `b96dcb6` merge | 14 PASS | `test-results/rc17d-existing-calendar.log` |
| Credential-free production build after `b96dcb6` merge | PASS, exit 0 | `CI=true NEXT_PUBLIC_USE_MOCK_DATA=false OPERATIONAL_STORAGE_ROUTING_MODE=database pnpm run build`; all Supabase config empty |
| OpenSpec strict validation | PASS | `pnpm exec openspec validate rc17d-responsive-auth --strict` |
| Final whitespace / scoped diff review | PASS | `git diff --check` |
| Canonical memory sync/validation | PASS | `npm run memory:sync`; `npm run memory:validate`; no business rule records changed |
| Exact-head GitHub CI | PENDING PR | See PR checks and linked workflow runs; do not substitute local results |

## Browser interpretation

Before: 630 route/role/width measurements, 156 failing geometry or touch rows. After on the `371426b` candidate: 720/720 passing measured states, including separate enabled and public non-mock scenarios. These counts are **not 720 independent business transactions** and were not remeasured after the Live-only `b96dcb6` merge. Route guards and feature-off states are included and labeled in the CSV. Internal table scrolling is intentional and focusable; page-level horizontal overflow is not allowed.

Phone touch checks measure 44px targets (native checkboxes may use their associated label). Viewport containment, drawer focus trapping/Escape/Back/close-on-navigation, dense/overnight cards, URL history, filter multi-select/reset, export/detail dialogs and a Member detail CTA are exercised. Chromium viewport simulation does not establish physical-device usability, all possible data states or authenticated RLS/Production correctness.

## Production read-only evidence and blockers

- https://ops5729.top public Login/Register/Forgot/Reset reads returned HTTP 200; 12 actual captures at 375, 768 and 1440.
- Supabase public Auth settings returned HTTP 200: Google false, email true, disable_signup true. No provider settings changed; no secrets are stored in this report.
- Google Console credentials, Site URL, redirect allowlist, Before User Created hook runtime binding, approved/unapproved Google round trip, real login/logout/session expiration/recovery completion and Admin/Leader/Member Production workflows: **NOT_VERIFIED**.
- Browser integration discovery returned no available browser. No credentials were entered or sessions copied.
- Served Production SHA and authoritative Vercel logs are unverified. Baseline live-app-clean status is failure ([deployment context](https://vercel.com/livestream2/live-app-clean/A15bPcCeCdTZcL91cwNJnnUDucxH)); the separate demo success is not evidence for ops5729.top.

**Decision: NO-GO for Production.** Review the draft PR, exact-head CI, authorized provider setup and real role UAT before a separate release decision. No merge/deploy/migration/provider mutation was performed.
