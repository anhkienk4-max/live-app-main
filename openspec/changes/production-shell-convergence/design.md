# Production shell convergence (owner-authorized presentation change)

One client shell wraps unchanged server-authenticated dashboard children. Existing Sidebar, Header and BottomNav retain canonical role navigation, authenticated user, search, realtime notifications, language control and signout. No reference mock runtime imports.

## Reference mapping

- Calendar, Shift list/create, People, Staffing/Registration, Reports/Analytics, Swaps/Notifications: navy Ops, 248px sidebar and 56px topbar.
- Import tab/action, Audit and Settings: light Admin Center, 248px and 56px.
- Live: compact navy, 230px and 44px desktop topbar.
- Nested Shift detail/edit paths: light detail. Current production exposes dialogs under /shifts; no route or workflow is invented.

At tablet width use existing canonical navigation menu; at mobile use canonical bottom destinations/overflow. No desktop minimum-width constraint. Active selection prefers matching query destinations then nested path boundaries.

Analytics axis margins/compact ticks are presentation-only; tooltips/calculations unchanged. Leader System tab is visible but locked; mutation authority stays Admin-only. Canonical UAT contract follows this requirement, with missing swap fixtures explicitly skipped.

## Acceptance

Typecheck/lint/build/diff and focused tests must pass. Commit only scoped source/test files, preserving unrelated working changes. Deploy new immutable RC to Preview; require fourteen real-route screenshots with shell/interior verdicts before full QC. Any visual failure stops comprehensive QC. Remove the exact temporary protection exception after testing.
