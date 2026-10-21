# RC1.7D — Responsive UX, navigation and approved authentication

## Release decision: NO-GO for Production

Implementation is isolated on `feat/rc17d-responsive-auth`, based on main `7f5efbfec23db84ad1d74024b08a591523aa4217`. Dashboard/Reports cache changes from `371426bc53b6fac2fcef97433c02b45c3c6b4e9e` were integrated before the browser captures and full regression. Main later advanced to `b96dcb6e1842e59f43170a1a8b15da712ee8a8e0`; its Live changes were merged with URL validation and RC1.7D touch targets preserved. Focused tests, typecheck, scoped lint and production build passed after that merge. Browser captures and full regression were not rerun on `b96dcb6`. The original dirty checkout was preserved. Main SHA is not proof of the version served by ops5729.top.

**Evidence boundary:** authenticated application captures and interactions use the repository's local mock identities and explicit API fixtures. These are real Chromium/Playwright captures, not generated screenshots. Public before auth captures are unauthenticated reads of https://ops5729.top. After auth captures run locally with mock authentication disabled and no Supabase credentials. None of these establishes authenticated Production UAT or database RLS behavior.

## Root causes and repairs

| Severity | Finding | Repair |
|---|---|---|
| P0 | Month calendar retains a 760px minimum wrapper and seven full-detail columns at phone width. | Desktop retains MonthView; below lg, a compact native date selector and complete day agenda reuse the existing shift/staffing/action logic. |
| P0 | Shared touch controls, fixed Dashboard grids, wide tables, queue headers and modal height constraints do not fit small screens. | 44px mobile controls, wrapping actions, stacked Dashboard panels, labeled keyboard-focusable internal table scroll regions, dynamic viewport modal limits, local queue/payroll/filter fixes. |
| P1 | Role group metadata is duplicated/unused; mobile selects first four items instead of operational priorities. | One catalogue/group schema, filtered role/capability selections, persisted Sidebar accordions, active-group opening and a shared grouped mobile/tablet drawer. |
| P1 | AuthLayout reserves half the screen for black branding. | Light white/navy/blue shared layout, compact product value panel and single-column mobile forms. |
| P0 | Google entry is mock-only; redirect inputs need stricter validation. | Provider-aware real Supabase OAuth entry, PKCE code exchange, verified identity + active canonical business-user approval, local-only redirect validation. No user creation or role grants. |
| P1 | Some Dashboard detail/actions were inert or linked to #. | Wire existing canonical shift details and existing destination routes; no new business mutations. |
| BLOCKER | Production Google Provider is disabled. | Disabled message, no fake active Google button. Provider settings are unchanged. |

## Behavior preserved

- Existing service, permission, capability and approval boundaries remain authoritative. Member Shifts appears because its existing assigned/open-shift permissions already allow it; no permissions were granted.
- Calendar `calendar_view` / `calendar_date`, Back navigation, dense/overnight dates, staffing resolution, export and detail surfaces remain on existing code paths.
- Mobile filters share the same fields/state with desktop, include active count and Reset. Base UI Dialog supplies trapping, Escape and focus return.
- Navigation BottomNav order is Overview, Calendar, Shifts, Live, More, after permission/capability filtering. Back closes More; navigation closes it without reopening on Back.
- Production registration still posts an account request to `/api/account-requests` for Admin approval. No public self-signup, schema change, migration, provider update or Production write.

## Evidence

- [Full route / viewport / role matrix](RESPONSIVE_MATRIX.csv): each measured combination, geometry and touch defects before/after, scoped state and headings. Geometry PASS on a denied/disabled page verifies that state, not the protected business workflow.
- [Route summary](ROUTE_MATRIX.md): nine widths for Admin, Leader and Member, plus public auth and enabled Workforce/Payroll fixtures.
- [Actual before / after screenshots](SCREENSHOTS.md): mobile, tablet and desktop; local fixtures explicitly labeled. Full captures and browser JSON are retained in local `test-results/rc17d-*` and the new CI artifact.
- [Production auth status](PRODUCTION_AUTH_STATUS.json): only read-only checks and explicit unknowns.
- [Changed files](FILES.md).

## Validation

See [verification record](VERIFICATION.md) for exact commands and outcomes. GitHub Actions links and final exact-head status are recorded in the PR. A green local run does not override a failed deployment check or missing authenticated UAT.

## Remaining release gates

1. Production Google is `false`, email is `true`, public signup is disabled. Authorized setup must verify Google credentials, Site URL, redirect allowlist and existing Before User Created hook runtime binding. This work did not change these settings.
2. Real approved/unapproved Google sign-in, login/logout/session expiry, recovery email completion, and role-based business workflows require connected authorized sessions. No browser was available; retain **NOT_VERIFIED**. Fixture/API-unit tests cover contracts, not an actual OAuth provider round trip.
3. Production served SHA and Vercel build logs are unverified: connected team lists no projects and the deployment lookup is inaccessible. Baseline `Vercel – live-app-clean` is red; the separate demo project is green. Do not substitute the demo result.
4. Registration/PASS/assignment mutations retain existing unit/regression coverage; the new mobile browser tests exercise their shared calendar surfaces, filter/date history, details and export dialog, not authenticated Production writes.
5. Review exact-head PR CI and all deployment contexts. No merge, promotion, migration, provider change or Production activation is authorized by this report.
