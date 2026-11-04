# Changed files

Only the isolated RC1.7D branch is changed. Original checkout work is preserved. Generated Next type references are excluded; no migration, provider configuration or dependency changes.

## Application

- [app/(dashboard)/notifications/page.tsx](../../app/(dashboard)/notifications/page.tsx)
- [app/api/auth/callback/route.ts](../../app/api/auth/callback/route.ts)
- [app/api/auth/providers/route.ts](../../app/api/auth/providers/route.ts)
- [app/forgot-password/page.tsx](../../app/forgot-password/page.tsx)
- [app/globals.css](../../app/globals.css)
- [app/login/page.tsx](../../app/login/page.tsx)
- [app/register/page.tsx](../../app/register/page.tsx)
- [app/reset-password/page.tsx](../../app/reset-password/page.tsx)
- [components/features/calendar/CalendarView.tsx](../../components/features/calendar/CalendarView.tsx)
- [components/features/calendar/DayView.tsx](../../components/features/calendar/DayView.tsx)
- [components/features/calendar/ListView.tsx](../../components/features/calendar/ListView.tsx)
- [components/features/calendar/WeekView.tsx](../../components/features/calendar/WeekView.tsx)
- [components/features/dashboard/DashboardOverview.tsx](../../components/features/dashboard/DashboardOverview.tsx)
- [components/features/dashboard/presentation/admin/AdminDashboardView.tsx](../../components/features/dashboard/presentation/admin/AdminDashboardView.tsx)
- [components/features/dashboard/presentation/leader/LeaderDashboardView.tsx](../../components/features/dashboard/presentation/leader/LeaderDashboardView.tsx)
- [components/features/dashboard/presentation/member/MemberDashboardView.tsx](../../components/features/dashboard/presentation/member/MemberDashboardView.tsx)
- [components/features/data-quality/DataQualityPanel.tsx](../../components/features/data-quality/DataQualityPanel.tsx)
- [components/features/live/LiveOperationsConsole.tsx](../../components/features/live/LiveOperationsConsole.tsx)
- [components/features/payroll/PayrollDraftWorkspace.tsx](../../components/features/payroll/PayrollDraftWorkspace.tsx)
- [components/features/payroll/PayrollOverview.tsx](../../components/features/payroll/PayrollOverview.tsx)
- [components/features/payroll/PayrollPeriodManager.tsx](../../components/features/payroll/PayrollPeriodManager.tsx)
- [components/features/payroll/PayrollRateManager.tsx](../../components/features/payroll/PayrollRateManager.tsx)
- [components/features/registration/RegistrationReviewWorkspace.tsx](../../components/features/registration/RegistrationReviewWorkspace.tsx)
- [components/features/shifts/ShiftCard.tsx](../../components/features/shifts/ShiftCard.tsx)
- [components/features/storage/OperationalFileWorkspace.tsx](../../components/features/storage/OperationalFileWorkspace.tsx)
- [components/features/storage/OperationalStorageSetupWorkspace.tsx](../../components/features/storage/OperationalStorageSetupWorkspace.tsx)
- [components/features/workforce/WorkforceLeaderboard.tsx](../../components/features/workforce/WorkforceLeaderboard.tsx)
- [components/features/workforce/WorkforceTeamOverview.tsx](../../components/features/workforce/WorkforceTeamOverview.tsx)
- [components/layout/BottomNav.tsx](../../components/layout/BottomNav.tsx)
- [components/layout/Header.tsx](../../components/layout/Header.tsx)
- [components/layout/NavigationDrawer.tsx](../../components/layout/NavigationDrawer.tsx)
- [components/layout/Sidebar.tsx](../../components/layout/Sidebar.tsx)
- [components/layouts/AuthLayout.tsx](../../components/layouts/AuthLayout.tsx)
- [components/ui/archetypes.tsx](../../components/ui/archetypes.tsx)
- [components/ui/checkbox.tsx](../../components/ui/checkbox.tsx)
- [components/ui/dialog.tsx](../../components/ui/dialog.tsx)
- [components/ui/table.tsx](../../components/ui/table.tsx)
- [lib/auth/authMode.ts](../../lib/auth/authMode.ts)
- [lib/auth/googleOAuth.ts](../../lib/auth/googleOAuth.ts)
- [lib/auth/oauthCallback.ts](../../lib/auth/oauthCallback.ts)
- [lib/i18n.tsx](../../lib/i18n.tsx)
- [lib/ui/role-ux.ts](../../lib/ui/role-ux.ts)

## Tests and CI

- [.github/workflows/rc17d-responsive-gate.yml](../../.github/workflows/rc17d-responsive-gate.yml)
- [e2e/rc17d-auth.spec.ts](../../e2e/rc17d-auth.spec.ts)
- [e2e/rc17d-responsive.spec.ts](../../e2e/rc17d-responsive.spec.ts)
- [e2e/rc17d-workflows.spec.ts](../../e2e/rc17d-workflows.spec.ts)
- [playwright.rc17d.config.ts](../../playwright.rc17d.config.ts)
- [tests/e1-role-ux.test.ts](../../tests/e1-role-ux.test.ts)
- [tests/final-release-test-manifest.json](../../tests/final-release-test-manifest.json)
- [tests/rc17d-responsive-auth.test.ts](../../tests/rc17d-responsive-auth.test.ts)

## Design and evidence

- [docs/rc17d/FILES.md](../../docs/rc17d/FILES.md)
- [docs/rc17d/PRODUCTION_AUTH_STATUS.json](../../docs/rc17d/PRODUCTION_AUTH_STATUS.json)
- [docs/rc17d/README.md](../../docs/rc17d/README.md)
- [docs/rc17d/RESPONSIVE_MATRIX.csv](../../docs/rc17d/RESPONSIVE_MATRIX.csv)
- [docs/rc17d/ROUTE_MATRIX.md](../../docs/rc17d/ROUTE_MATRIX.md)
- [docs/rc17d/SCREENSHOTS.md](../../docs/rc17d/SCREENSHOTS.md)
- [docs/rc17d/VERIFICATION.md](../../docs/rc17d/VERIFICATION.md)
- [openspec/changes/rc17d-responsive-auth/.openspec.yaml](../../openspec/changes/rc17d-responsive-auth/.openspec.yaml)
- [openspec/changes/rc17d-responsive-auth/design.md](../../openspec/changes/rc17d-responsive-auth/design.md)
- [openspec/changes/rc17d-responsive-auth/proposal.md](../../openspec/changes/rc17d-responsive-auth/proposal.md)
- [openspec/changes/rc17d-responsive-auth/specs/approved-oauth-entry/spec.md](../../openspec/changes/rc17d-responsive-auth/specs/approved-oauth-entry/spec.md)
- [openspec/changes/rc17d-responsive-auth/specs/responsive-operations/spec.md](../../openspec/changes/rc17d-responsive-auth/specs/responsive-operations/spec.md)
- [openspec/changes/rc17d-responsive-auth/tasks.md](../../openspec/changes/rc17d-responsive-auth/tasks.md)
- [openspec/config.yaml](../../openspec/config.yaml)

## Generated repository memory

- [project-memory/current-state.json](../../project-memory/current-state.json)
- [project-memory/generated/project-memory.md](../../project-memory/generated/project-memory.md)

## Screenshots

64 unchanged PNG files captured by Playwright in [screenshots/](screenshots/); all individual links and environment labels are in [SCREENSHOTS.md](SCREENSHOTS.md).
