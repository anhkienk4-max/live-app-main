# ADA OPS PWA Mobile Consistency Audit (2026-10-28)

Branch: `feat/ada-ops-pwa-v1`. Scope is visual and responsive presentation only. Main and Production are not changed.

## Established shared design system

- Applies shared mobile workspace scale to all non-auth `PageShell` routes and opt-in Analytics, Storage, Notifications, Profile.
- Mobile headers approximately 18–22px, touch targets minimum 44px, inputs 16px to avoid iOS focus zoom, cards radius 14px, long text wraps without widening the page.
- Calendar tabs remain single-row horizontally scrollable; ReportsList active route has 2×2 KPI cards, readable values and adaptive filters. Staff is a separate mobile card list, existing desktop data table is preserved.
- Desktop 900px and mock mobile viewports 390px and 620px are covered in local CI; Staff also covers 412px.

## Verified vs unresolved

| Module | Mock responsive check | Real Staging role UAT |
| --- | --- | --- |
| Dashboard | Browser QA PASS (Admin mock only) | Pending Admin, Leader, Member |
| Staff | Card and desktop browser QA PASS (mock) | Pending real roles |
| Calendar | Layout and single-row tab check PASS (mock) | Pending workflows |
| Reports | Actual ReportsList KPI/filter browser QA PASS (mock) | Pending real data |
| Profile | Form layout browser QA PASS (mock) | Pending save/roles |
| Shifts, Settings, Analytics, Storage, Notifications | Shell/layout browser QA PASS (mock) | Pending module-specific UAT |
| Payroll, Workforce | **BLOCKED**: mock identity returns session-expired/capability error | **REQUIRED**: staging authenticated UAT per role |

Mock browser QA is not proof of business-data integrity, authorization correctness or all module workflows. Explicit skips for Payroll/Workforce prevent false-green screenshots of unauthorized/error states.

## Remaining before Production

1. Credentialed Staging Admin/Leader/Member checks on the same Preview SHA, with feature flags and role capabilities explicitly recorded.
2. Compare actual iPhone/Android screen captures at 390px and 412px against the approved reference, especially dense Payroll/Workforce reports.
3. Fix module-specific overflow/table behavior without hiding columns, changing calculations, altering permission gates or changing backend.
4. Re-run full gate, review by owner, then decide on release separately. Do not auto-merge or auto-promote Production.
