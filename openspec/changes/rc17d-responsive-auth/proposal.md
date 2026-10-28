## Why

Mobile workflows are constrained by desktop calendar grids, flat navigation and oversized auth branding. RC1.7D makes the existing workflows usable at phone widths while retaining approval and permission boundaries.

## What Changes

- Audit and repair all protected and auth routes across nine viewport widths and three roles.
- Present a compact mobile month selector with full agenda cards and a filter drawer; preserve desktop month details and URL state.
- Group the existing authorized navigation catalogue for Sidebar and mobile/tablet drawers; prioritize Overview, Calendar, Shifts and Live when present.
- Use a light shared auth layout and a real Google OAuth flow gated by provider availability; preserve request-access approval.
- Deliver actual browser captures, geometry/focus/action checks and explicit Production verification blockers.

## Capabilities

### New Capabilities

- responsive-operations: Responsive route workflows, grouped navigation and mobile calendar.
- approved-oauth-entry: Provider-aware Google entry with safe callback and existing account approval.

### Modified Capabilities

None.

## Impact

CalendarView/MonthView/DayView/ListView, role-ux catalogue, Sidebar/BottomNav/Header, shared dialog/table/page primitives, AuthLayout/login/callback, and regression/Playwright evidence. No new dependency, schema migration, provider mutation or Production deployment.
