# ADA OPS | Selective PWA UI-only candidate for GitHub main (28 Oct 2026)

## Scope
Approved PWA reference: feat/ada-ops-pwa-v1 @ 5eb673cb092dd585248fd60fe5b62e44a4043be9.
GitHub main baseline: 9b5f3889b243f9ee795e4466a18f24cd896c162f.

This candidate ports ONLY selected visual presentation:
- Shared mobile typography, touch targets (44 px), card density and metric grids
- Existing BottomNav route/role logic retained; icon and label sizes changed
- Staff list uses mobile cards and the same userService mutation methods/permission checks
- No API route, service implementation, DB migration, Supabase flag or authentication code changed

**This is only an initial UI slice, not full PWA visual parity.**
New PWA Dashboard role-template and unrelated RC19 features are NOT included because they require behavioral composition changes.

## Production SOURCE PARITY BLOCKER
The active ops5729.top deployment is Vercel CLI artifact dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ (READY, target=production). Its Vercel metadata has no Git commit SHA. Read-only inspection of its deployed source shows BottomNav imports getSharedNavigation/mobilePrimaryNavigation, while GitHub main imports getNavigationForRole/filterNav. Therefore the GitHub main tree is NOT PROVEN to equal the active production source.

**NO-GO for direct merge/deploy to ops5729.top from this branch.**

## Required release gates
1. Reconstruct the *exact* deployed source baseline and record a reproducible commit/SHA, with dependencies, runtime environment and feature flags.
2. Rebase/cherry-pick only approved visual changes onto that verified baseline. No replacements of auth/backend logic.
3. Run source-only scope check, TypeScript, ESLint, build, desktop/mobile visual QA and authenticated Admin/Leader/Member regression against a staged production-equivalent build.
4. Only when verified, stage a production build without assigning aliases; smoke-test and explicitly promote that exact build, with rollback ready.

Do not consider CI PASS on this main-based candidate sufficient for Production GO.
