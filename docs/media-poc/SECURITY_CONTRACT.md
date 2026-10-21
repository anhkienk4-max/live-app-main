# ADA OBS Media PoC — Security contract / proposed

**NOT IMPLEMENTED OR SECURITY-VERIFIED.** No gateway, new API, JWKS, player, storage schema or DNS provisioned by these docs.

## Trust boundaries
- Studio PC holds its own publish credential. **Never** ship it to frontend, network logs, Google Drive, Issue/PR or Vercel environment with `NEXT_PUBLIC_`.
- Browser authenticates to ADA using existing account session. ADA **server** must resolve an authorized `shift_id`, allowed brand, studio/feed binding, and active shift temporal constraints through the existing permission/RLS model. No unconditional admin bypass or UI-only check.
- ADA signs a short-lived JWT for path-exact `read` only. MediaMTX verifies signature through JWKS with pinning of `iss`/`aud`; no anonymous `read`/ `publish` users.
- The publisher receives a different `publish`-only credential for that path. Scope to studio/feed, rotate on personnel or PC changes. A path name alone is not authorization.
- Private media HLS never passes through Vercel Functions, Supabase Storage, Drive or public CDN. No default recording.
- CORS prevents unintended script reads, **not** direct URL access. Bearer permission is necessary even if CORS is configured.
- Single active shift can be shown for a studio/feed at a time unless explicit multiplexing. Deny unknown, ambiguous, expired, cross-brand or cross-studio mapping. Do not derive binding from `shifts.live_link`.
- HLS playlist, init segments, media segments and parts MUST all fail for missing/wrong/expired viewer JWT; verify at HTTP level in UAT. If upstream does not enforce one of them, block public exposure until reverse proxy enforces it.
- Prevent leakage: cache-control `no-store` and redacted media token in logs, no query tokens for browser HLS, no debug tracing of Authorization headers.
- Preview and Production signing trust/config must be isolated. Never let a Preview token grant access to a Production media path.
- Use two test roles from distinct brands and networks; verify denied access for every other brand/shift. 401 vs 403 may vary by auth layer; both denial codes are acceptable if no media bytes leak.

## Important implementation limitation
Native Safari HLS cannot reliably set arbitrary Authorization headers for each segment from a JavaScript player. Pilot Edge/Chrome using hls.js first. For Safari/iOS, design a dedicated same-site, short-lived HttpOnly/Secure cookie at authenticated media reverse proxy or independently signed per-request URLs; verify cookie/path/CSRF boundaries, expiry, revocation, segment protections, SameSite policy, and cross-site vs same-site behavior before claiming support.

## Next code PR, **not** part of this scaffold
- Backend route for JWKS; keys managed off-repository and rotated.
- Backend viewer grant route, including authenticated principal, DB-backed role/brand/studio/shift mapping, active-shift validation, rate limits and audit metadata.
- Viewer UI with HLS.js, typed states Connecting/Live/Offline/Reconnecting/Error, manual mute, recover/refresh, fallback official LIVE link and local tab capture. Do not accept stream URL from client.
- Optional secure status endpoint from gateway, no public control API/metrics.
- Tests: SSR auth, session expiry, negative cross-tenant, replay/revocation, direct playlist/segment negative tests, 2-network UAT, no data writes.
