# ADA Media — STAGING gateway configuration preflight (NOT DEPLOYED)

Stage: **reference configuration generation only**. Do NOT buy a VPS, create DNS, change studio OBS, generate a Production signing key, deploy media, or create real user/shift grants based on this file. Current MediaMTX security CI is not a physical Internet security assessment.

## Verified existing infrastructure (2026-10-21)

- Supabase staging: **live-app-staging**, project ref \`amagnzebmmuqiptmrjmc\`, PostgreSQL 17. The ACL migration \`20261021064611_media_viewer_acl_exact_shift_v1\` is on staging, but tables \`media_stream_routes\` and \`media_viewer_grants\` contain 0 rows each. No approved view access is configured.
- Supabase Production: \`egdjnpmoasarrttvhgds\`. Must not be used by any Preview/UAT issuer. Existing \`lib/supabase/environmentIdentity.ts\` already rejects a non-production deployment pointing to this project.
- Vercel app: \`livestream-ops-demo\`, Production domain \`ops5729.top\`. Vercel Preview has READY deployments for **other** feature branches; no deployment found for the exact media player head \`439263a54a072e8ef7e31fcf0f1b6f6b9550eb57\`.
- The Vercel project has SSO deployment protection for previews (\`all_except_custom_domains\`). **Critical:** MediaMTX and the JWT verifier must download the staging \`/api/media/jwks\` public key from an endpoint reachable without an interactive Vercel login. Do NOT bypass SSO globally just to fix JWKS. Approve a purpose-specific JWKS public route or a separate verified public-key distribution endpoint; the private key must remain server-only.
- MediaMTX v1.20.0 and HTTPS Nginx + localhost JWT sidecar already passed synthetic segment-access tests; real studio LAN + 4G is NOT RUN.

## Generate a review bundle — offline, staging only

Supply approved, EXACT HTTPS origins. Example shell (hosts below are **placeholders**, not live DNS):

\`\`\`bash
export MEDIA_STAGING_TARGET=staging
export MEDIA_STAGING_EXPECTED_VERCEL_ENV=preview
export MEDIA_STAGING_SUPABASE_URL=https://amagnzebmmuqiptmrjmc.supabase.co
export MEDIA_STAGING_APP_ORIGIN=https://ada-staging.example.test
export MEDIA_STAGING_MEDIA_ORIGIN=https://media-staging.example.test
export MEDIA_STAGING_PATH=studio_poc_01
export MEDIA_STAGING_CONFIG_OUTPUT=/tmp/ada-media-staging-review-01
node scripts/render-media-staging-config.mjs --render-reviewed-files
\`\`\`

This writes, with owner-only permissions:
- \`nginx-hls.conf\` — HTTPS + exact ADA origin CORS (credentials for HLS cookie), \`auth_request\` on **every** playlist/init/fragment and loopback MediaMTX.
- \`mediamtx.yml\` — JWT issuer/JWKS derived from exact staging app origin, RTMPS cert paths from exact staging media hostname, no open HLS and no recording.
- \`compose.yaml\` — reference MediaMTX with HLS bound to loopback, **RTMPS 1936 still requires firewall allowlist**.
- \`review-manifest.json\` — explicitly marks \`authorized=false\`, \`deployed=false\`, \`external_uat=false\`.

The generator refuses Production Supabase ref/origins, wildcard/invalid origins, IP literals and ports, unsigned broad stream paths, failed exact-line template replacement and missing per-resource authorization. It **does not provision a host, request certificates, open ports, run Docker, mint JWT, seed ACL or deploy Next.js**.

## Do not proceed to real staging playback before all are true

1. Choose an independently approved Preview deployment of the **exact reviewed feature commit**, with a dedicated media issuer/signing key; verify Preview's Supabase project is the staging ref using the app's runtime environment validation. Never copy Production signing keys, secrets, routes or anonymous client sessions.
2. Approved HTTPS media gateway host/ingress, TLS certificate, safe MediaMTX startup and Nginx JWT verifier; public 443 only for viewers, studio-only RTMPS 1936, no public 8888 or 9191. Verify auth of init/media segment directly through public HTTPS; no CDN cache.
3. Confirm JWKS endpoint is publicly readable by MediaMTX and sidecar **without exposing the rest of the authenticated ADA app or private key**. Reject unauthenticated API viewer grants.
4. Explicitly approved exact \`auth_user_id\`, \`shift_id\`, \`brand_id\`, \`platform_id\`, \`studio\` and \`active_shift_id\` route seeded in staging only by privileged operator. Accounts must be active and shifts legitimately LIVE, no blanket leader/admin access.
5. Test the real production React \`AdaHlsPlayer\` against the **authenticated staging API**, not a Playwright HTTP mock; include cross-brand and token revocation tests.
6. Then test with real OBS output only if studio operator permits second output; existing Virtual Camera → TikTok LIVE Studio → TikTok LIVE must remain untouched. Use the separate LAN and cellular UAT gate \`docs/media-poc/STUDIO_WAN_UAT_GATE.md\` in PR #55.

**Release:** HOLD for all Production changes. An isolated CI success cannot establish deployed staging, Internet reachability, viewer entitlement or dual-network UAT.
