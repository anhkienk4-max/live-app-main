# ADA OPS PWA V1.0

Scope: installable mobile web app for iOS Safari and Android Chrome. No APK/IPA, offline data cache, new backend, Supabase migration or production deployment.

## Source of truth and future deploys

The PWA is a thin metadata/icon layer on top of the **same** https://ops5729.top website. It does not pin a version of the business application. Future Vercel production deployments update the underlying web routes for both browser and standalone PWA (after a refresh/reopen, subject to normal browser caching). Icon and manifest changes can require device/browser refresh or reinstall.

PWA integration files on this branch are intentionally isolated for cherry-picking / merging onto the latest **verified** production code at release time. This branch was created from GitHub main `9b5f3889b243f9ee795e4466a18f24cd896c162f`. The latest CLI deployment may include changes not on main. Never overwrite production with an unverified snapshot.

## Implementation

- `app/manifest.ts`: same-origin scope/start_url; standalone mode; icons at `/icon1`, `/icon2`, `/icon3`.
- `app/icon1.tsx`: 192x192 png.
- `app/icon2.tsx`: 512x512 png.
- `app/icon3.tsx`: 512x512 maskable png.
- `app/apple-icon.tsx`: 180x180 iOS icon.
- `lib/pwa/AdaOpsIcon.tsx`: deterministic code-generated icon asset.
- `app/layout.tsx`: app name, manifest link, iOS standalone metadata, theme color.

The current wordmark is an ADA OPS representation for initial PWA integration; replace it with the **approved official ADA Global vector brand asset** before external/official use. Icon generation does not rely on a third-party image host.

There is no service worker or offline cache in this version. Authenticated API requests, sessions, payroll, reports and other sensitive data are always handled by the existing web app.

## Install

- iOS: Safari > open https://ops5729.top > Share > Add to Home Screen > Add. Open as Web App if offered.
- Android: Chrome > open https://ops5729.top > menu > Install app or Add to Home screen (depends on browser/version).

## Release gates

1. Verify source equivalence with the *current* production CLI release before integration/release.
2. Run `pnpm exec tsc --noEmit --incremental false`, `pnpm exec eslint app/layout.tsx app/manifest.ts app/icon1.tsx app/icon2.tsx app/icon3.tsx app/apple-icon.tsx lib/pwa/AdaOpsIcon.tsx`, and `pnpm build`.
3. Request `/manifest.webmanifest` and all four icon endpoints from a deploy preview; verify HTTP 200 + PNG image dimensions.
4. Test installation and standalone navigation on physical iOS Safari and Android Chrome devices.
5. Verify Supabase auth session, role restrictions and upload/download, without production data mutations.
6. Owner review before merge or prod deploy. Do not migrate database.

## Proxy compatibility verification

The auth proxy matcher MUST bypass `/manifest.webmanifest`, `/icon1`, `/icon2`, `/icon3`, and `/apple-icon`, while keeping operational routes behind auth. This prevents manifest/icon requests from being redirected to login.

Run the independent route contract test: `node --test tests/pwa-route-matcher.test.mjs`.

Preview infrastructure note (October 27, 2026): the Vercel project `live-app-full-upgrade` shows ERROR deployments across unrelated branches; avoid attributing the PWA preview failure to the PWA implementation without reading actual build logs. This does not authorize modifying Vercel production settings.

## PWA icon routes (compatibility fix)
The generated icon metadata convention supports `app/icon.tsx` and `app/apple-icon.tsx`.
The numbered dynamic files `app/icon1.tsx` etc. were replaced by explicit
`app/icon1/route.ts`, `app/icon2/route.ts`, and `app/icon3/route.ts`
serving valid PNG responses, while keeping manifest URLs stable.
PWA checks run independently of Vercel deployment via
`.github/workflows/ada-ops-pwa-verify.yml` on this branch.

## Visual reference implementation W1

The uploaded ADA Global style board is the visual target (concept, not pixel-perfect screenshot replica).
Reference palette: #2563EB blue, #7C3AED violet, #06B6D4 cyan, #F8FAFF neutral,
#10B981 success, #F59E0B warning, #EF4444 danger, #EC4899 live.

W1 changes only the auth layout, persistent desktop/sidebar/topbar/bottom navigation shell,
brand lockup and mobile dashboard responsive composition. Role menu filtering, routes,
authentication, server data, dashboards and reports business logic remain unchanged.

Follow-up W2 is a dedicated layout pass for Calendar, Report detail, Payroll, Profile and
verified empty/loading/success states. Never copy the board's mock names or figures as app data.
The generated ADA wordmark is a temporary visual rendition; use ADA Global's official asset
before branding signoff. No artificial animated splash intercept is installed.

## Reference styling W2
Styling wrappers now cover Calendar, Reports, Payroll and Profile without changing business data/API
or RBAC. The reference's member payroll view is NOT available to all staff in this
repository: the real /payroll page has an Admin-only security boundary. Do not remove
that boundary to match the picture. Bottom-nav overflow links include personal Profile,
Notifications and Settings, with each destination enforcing its existing permissions.
Icon rendition now includes the gradient A mark shown on the supplied board.

## W3 — Mobile member dashboard reference
Adds a task-first mobile member dashboard fed exclusively by the existing MemberDashboardViewModel
(nextShift, mySchedule, myActions, openShifts). Desktop original remains visible at md+.
No placeholder KPIs, no fake wages, no bypass of payroll or other RBAC. Links point to existing routes.

## Responsive Auth W4 (2026-10-28)
User screenshot exposed a 768-1023px tablet/desktop-width viewport rendered with the mobile
stacked layout, leaving an oversized blank region below the login form. AuthLayout now
switches to the existing desktop split layout at 768px, while keeping the stacked
gradient-hero and overlapping white card on narrow mobile devices. Visual-only changes:
no login code, auth state, environment variables, roles or Supabase queries changed.
Final screenshot-based QA on tablet and physical phones remains pending.

## Tablet menu regression W5
A user screenshot reported failure when pressing the expandable navigation at 768-1023px.
The topbar tablet dropdown menu is now a React-controlled, non-portal panel that uses
the same RBAC + workforce-capabilities filtered nav and standard Next Links.
Clicking any link or the backdrop closes the panel. No data APIs or auth code changed.
An Edge "This page couldn't load" surface may also indicate browser/webview failure;
runtime browser logs were unavailable, so the screenshot is not proof of a specific JS exception.
Dashboard progressive loading in another screenshot is still under investigation.

## Reference-fidelity mobile screens W6
The former member-only blue-gradient hero has been replaced by the screenshot's
white, compact next-shift card and four quick actions. Admin and Leader now use
a role-specific mobile operations home with genuine today/live/pending metrics,
schedule rows and actions sourced from their existing view-models. Large desktop
presentations remain at lg+; no fixture data is used. Payroll shortcut appears
only on Admin dashboard because the existing payroll route is Admin-only.
Login and five-tab navigation were rebuilt in the previous commit.
Full-size visual screenshot QA and detailed Calendar/Report/Payroll redesign
are still outstanding.

## Dashboard progressive-state presentation W7
While the authorized collection requests are in flight, phone/tablet clients see a
lightweight ADA mobile shell with actual early shift data (when available) instead of
desktop-sized grey skeletons. The data retrieval, cache and auth logic remain unchanged.
The new loader is not evidence that the slow fetch itself has been fixed.

## Reference screen 4 and 5
Calendar phone UI: seven-day strip and color-coded cards from the *real filtered shift dataset*;
all existing controls remain accessible using "Hiển thị công cụ lịch đầy đủ"; shift cards open the
existing preview drawer, and the registration link goes to the existing open-shift board.
Report detail: mobile key/value session summary with real brand/platform/host/date information,
reordered scrollable tabs, image and history actions. Permission-gated OCR and report mutations
remain exactly as before. Do not invent status or synthetic data.

## Reference screen 6 and 7
Payroll mobile summary is admin-only and derives net total and line details from existing
`PayrollPeriod` and non-voided `PayrollLine` records. It never imitates a member salary
statement that would violate present RBAC. The periods/rates/reconciliation controls remain
available below. Profile mobile menu uses the current user's real identity and navigates to
existing profile, notifications and settings. Language toggles the real i18n provider;
sign out uses the same clearLocalSession flow as the header; the edit form is retained.
