# ADA per-shift protected HLS player — Draft PR #55

Status: implementation and isolated CI in progress. NOT DEPLOYED. No VPS purchase, real OBS configuration change, TikTok pipeline change, or Production/DB mutation. This PR is stacked on Draft #53 (90s ES256 media viewer API and STAGING RLS); MediaMTX/Nginx proxy remains Draft PR #52.

## Controls
1. Browser widget is OFF unless NEXT_PUBLIC_MEDIA_PLAYER_UI_ENABLED=true at build time; feature rollout must be approved separately.
2. Set NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN to the exact public HTTPS gateway origin, without slash, path or query. This variable is NOT a secret.
3. Backend media issuer remains independently OFF unless MEDIA_VIEWER_ENABLED=true, server-only P-256 signer configured, and approved media_stream_routes + media_viewer_grants provisioned in STAGING.
4. The user must click Xem nguồn OBS for a selected LIVE shift. Browser only submits shiftId to the same-origin viewer-grant API, never media path, studio or URL.
5. API enforces authenticated user, RLS entitlements, shift status, exact brand/platform/studio/active_shift_id, and returns the authorized media path with a 90-second ES256 read-only JWT.
6. hls.js validates HTTPS origin and path before attaching Authorization: Bearer to every playlist, init, segment and part. It never forwards bearer to arbitrary resource URLs and never writes JWT into React state, local/session storage, URL parameters, or logs. TLS reverse proxy independently invokes auth_request for every HLS fetch; NEVER expose raw MediaMTX port 8888.
7. Player checks entitlement every <=20 seconds. Any refresh rejection, changed media URL, expiry, terminal HLS 401/403 or unhandled fatal source error stops video, destroys the HLS instance and clears the token. Existing JWT can remain valid at gateway up to its expiry (<=90s) after entitlement revocation. Immediate server-side revocation is not yet guaranteed.
8. Starts muted; optional unmute and manual stop. No recording, screenshotting or upload.
9. Edge/Chrome desktop only for first UAT. Safari/iOS native HLS must NOT play protected video because it cannot guarantee Authorization on each subresource; no native fallback is offered.
10. Official TikTok/Shopee links, open side-window and local tab capture retain their old functionality independent of OBS gateway.

## Dependency
Pinned hls.js 1.7.3, resolution SHA-512 obtained from pnpm 10.26.0 in GitHub Actions run 39559844849. Frozen-lock install and Next16 build must PASS before claiming code readiness.

## Release gates
- Exact candidate CI: frozen dependency install, HLS policy tests, API SSR authorization tests, TypeScript, lint and Next build.
- Staging gateway (Nginx auth sidecar + real MediaMTX) with configured public TLS, correct signed JWT issuer and active studio/brand/shift entitlement, no localhost bypass.
- Browser E2E: video/audio, first play & unmute, turn LIVE off, denied/revoked grant, browser reconnect, fragment 401/403, switch ca, network loss and memory cleanup.
- UAT with studio LAN and independent remote network connected simultaneously; measure end-to-end delay and CPU/GPU overhead without changing OBS Virtual Camera -> TikTok LIVE Studio -> TikTok LIVE.
- Security review of short bearer lifetime, origin redirects, 20s authorization recheck versus <=90s credential lifetime, key rotation and CSP/CORS.
- Only then explicit Production approval.

Even if GitHub CI passes, Production stays on main until security and UAT signoff. A failed/limited Vercel preview build is not deployment proof.
