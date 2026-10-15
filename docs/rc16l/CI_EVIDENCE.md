# RC1.6L CI evidence

Draft PR: https://github.com/anhkienk4-max/live-app-main/pull/31. The PR head and checks, rather than this document, identify the final reviewed SHA. No merge or Production release is approved.

Initial candidate `711c1e228ccb98030debaac0066b56c90d25d994`:

| Workflow | Observed evidence |
|---|---|
| [RC16 foundation 38625086482](https://github.com/anhkienk4-max/live-app-main/actions/runs/38625086482) | PostgreSQL 16/17 amendment integration, full isolated Node inventory (1633 PASS, 0 FAIL, 3 SKIP), TypeScript, full lint and existing browser suites passed. New Calendar matrix 13/14 passed on both nodes. Dense fixture import assertion expected the clean-import message, while overnight warning correctly changed the success message. Later steps were skipped. |
| [Convergence 38625086535](https://github.com/anhkienk4-max/live-app-main/actions/runs/38625086535) | SUCCESS, including full regression, TypeScript, lint, build, existing desktop/mobile browser workflows and provenance. |
| [Storage 38625086459](https://github.com/anhkienk4-max/live-app-main/actions/runs/38625086459) | SUCCESS, including PostgreSQL 16, typecheck, storage tests, build and diff check. |

The foundation run retains screenshots and traces in artifacts `rc16i-postmain-node-22.23.3` (11926476579) and `rc16i-postmain-node-24.18.0` (11926173951). These are isolated mock identities, not authenticated staging UAT.

Follow-up source fixes align grid search with the bounded server's title/Studio search, preserve same-query content on refresh, use the actual main scroll container, validate custom dates, wrap the mobile date title, and correct the fixture. Local dense browser test passed with seven overlaps, overnight continuation and Back restoring the tab scroll position. All workflows must pass again on the final PR head. Authenticated Supabase waterfall and independent role UAT remain NOT_VERIFIED.
