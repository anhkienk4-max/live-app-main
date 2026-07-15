---
name: LiveStream Ops architecture
description: Key layout and routing conventions for the livestream-ops React app
---

## DashboardLayout
- Defined inline in `src/App.tsx` as a local component (Sidebar + Header + BottomNav).
- Pages are plain components — they never import or wrap themselves in DashboardLayout.
- App.tsx wraps every route: `<DashboardLayout><SomePage /></DashboardLayout>`.

**Why:** DashboardLayout was never exported to a separate file; importing it from `@/components/layout/DashboardLayout` will fail.

**How to apply:** When creating a new page component, do NOT add a DashboardLayout import. Just return the page content directly.

## Lazy-loading pattern
- All feature components that are rendered by pages go through `src/lib/utils/lazyComponents.tsx`.
- Add a `const XLazy = lazy(() => import(...).then(mod => ({ default: mod.X })))` entry there and export a `LazyX = withSuspense(XLazy)`.
- Pages import `LazyX` from lazyComponents, not the component directly.

## Routes
- `/settings` → `SettingsPage`
- `/analytics` → `AnalyticsPage` (uses `LazyDashboardAnalytics`)
- `/swaps` → `SwapsPage` (uses `LazySwapRequestList`)
