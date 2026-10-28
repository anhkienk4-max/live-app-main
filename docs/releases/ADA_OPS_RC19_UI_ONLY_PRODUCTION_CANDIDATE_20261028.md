# ADA OPS RC19 | UI-only Production Candidate | 2026-10-28

## Purpose

Approved mobile visual reference: `feat/ada-ops-pwa-v1` @ `5eb673cb092dd585248fd60fe5b62e44a4043be9`.
Suspected active Production source baseline: `1b96f38a17768e96b92f23056efba4b61cc76f84` (`feat/ops-full-app-upgrade-rc19`).

**NOT the GitHub main baseline**: `main` @ `9b5f3889b243f9ee795e4466a18f24cd896c162f` is inconsistent with the live CLI deployment.

The active `ops5729.top` Production deployment `dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ` was created via Vercel CLI on 2026-10-26 18:54:24 UTC, four minutes after the latest candidate RC19 commit. Seven source files or source prefixes inspected from the live deployment align with that RC19 Git reference, including ProductionAppShell, Header, Sidebar, NavigationDrawer, AccountMenu, next.config and project-memory/current-state.json. However, Vercel reports `source=cli` and provides **no Git SHA**. Prefix comparisons do **not prove complete source equivalence**.

## Changed scope

Responsive visual tokens, card and control sizes, Calendar/Reports/Staff/Workforce layouts, role-specific mobile dashboard presentation, header and login branding, PWA icon/manifest assets and offline browser visual tests.

### Untouched technical boundaries
- No changes to `supabase/`, migrations, RLS, `lib/services/`, data contracts, `app/api/` (except **new UI icon and splash asset routes** under `app/icon*` and `app/pwa-splash`), payroll calculation implementation, authorization middleware or stored business data.
- Existing Staff/Reports/Payroll/Workforce service call names and login authentication entrypoints are retained. This is a static safety check; equivalence of every runtime action is not asserted.
- No feature-flag change and no Production data write.

## Release gates

1. **Static scope guard + TypeScript + ESLint + production build + browser mobile/desktop mock regressions** must PASS on this candidate SHA.
2. Reconstruct/attest exact deployed CLI source snapshot. Where a source mismatch exists, carry changes forward from the **actual Production snapshot**, not from an inferred RC19 commit.
3. Verify Staging roles Admin, Leader, Member, including critical read and write actions in isolated test fixtures, and check role-specific data authorization.
4. Stage a production-targeted Vercel build without assigning `ops5729.top`. Smoke test real login and navigation, keep rollback candidate, and promote the **exact tested build**.
5. Merge to the canonical production source branch only once provenance is complete. `main` should not be moved from this candidate without an explicit repository convergence plan.

## Status

**DRAFT / NO-GO PRODUCTION** until complete source parity and real-auth regression are demonstrated. A green mock CI is not sufficient. Avoid restoring or modifying DB schema or Production environment variables.
