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
