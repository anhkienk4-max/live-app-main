# ADA viewer grant API — implementation PR, disabled by default

**Scope:** staging schema migration now applied and verified, viewer API remains feature-disabled. No Production migration, VPS, Studio PC/OBS changes or Production release. This PR is stacked on the green PR #49 hotfix; the video proxy deployment remains a separate draft PR #52.

## Existing contracts used
- SSR user identity: \`requireUser()\` → verifies Supabase Auth user; no mock or service-role fallback.
- \`shifts.id / brand_id / platform_id / studio / status / start_at / end_at\`, with a strict live-state, explicit studio and scheduled interval.
- New **STAGING-only** \`media_stream_routes\` maps exact brand+platform+studio+**active shift** to private path. This active_shift_id binding must be atomically updated when changing studio broadcast; do not infer live feed solely from status or label.
- New **STAGING-only** \`media_viewer_grants\` grants exact \`auth_user_id + shift_id\` inside a validity window. Neither leader nor admin is an implicit media viewer.
- Two strictly unique checks fail closed: grant row must be exactly one, route row must be exactly one. Missing/ambiguous/error → 403/503. All queries use session-owned Supabase client with RLS.

## API
- \`GET /api/media/jwks\` publishes only a public P-256 JWK when explicitly enabled and configured.
- \`POST /api/media/viewer-grant\`, same-origin and authenticated, strict JSON \`{"shiftId":"..."}\`, returns media URL + 90-second JWT with \`mediamtx_permissions=[{action:"read",path:"..."}]\`. Browser never selects media path, brand, or studio.
- \`MEDIA_VIEWER_ENABLED\` defaults OFF. Required **server-only** env: \`MEDIA_JWT_ES256_PRIVATE_KEY_PEM\`, \`MEDIA_JWT_KID\`, \`MEDIA_APP_ORIGIN\`, \`MEDIA_JWT_ISSUER\`, \`MEDIA_PUBLIC_HLS_ORIGIN\`. No \`NEXT_PUBLIC_\` secrets. Preview must use independent keys and issuer, never production key.
- The media-side Nginx verifier from Draft PR #52 must serve all HLS requests over HTTPS and require Bearer every time. Native Safari playback is not claimed. No media data is stored by Supabase/Vercel.
- Audit event, distributed rate limiting, key rotation, entitlement provisioning, revocation SLA, actual Web player and remote/studio physical UAT still need review.
- Migration \`20261021064611_media_viewer_acl_exact_shift_v1.sql\` was applied to project \`amagnzebmmuqiptmrjmc\` (STAGING only) via Supabase migration service. No route or grant seeds exist. Verified both RLS tables, anon denied, authenticated SELECT only, authenticated writes denied, authorized exact grant+route=1, unrelated user=0 in transaction-rollback fixture. All Production environments remain unchanged.

## Release gates
1. Unit tests and full CI green on exact SHA.
2. STAGING schema and first positive/negative RLS smoke are complete. Next test explicitly expired/revoked grants, incorrect shift/brand and real API SSR on staging; provision approved test routes/grants only when Media is ready. No direct Production migration.
3. Provision isolated signing key/JWKS, configure media reverse proxy and test expired/grant revocation.
4. Implement authorized HLS.js Edge/Chrome player with token refresh, no token persisted in browser storage. Original TikTok/Shopee fallback preserved.
5. Two-network physical UAT, OBS publishing independently to gateway while Virtual Camera → TikTok LIVE Studio unchanged.
6. Only then separate Production approval and deploy.
