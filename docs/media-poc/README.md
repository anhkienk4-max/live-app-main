# Issue #51 — one-studio OBS → MediaMTX → ADA OPS PoC

**Status: SCAFFOLD / NOT DEPLOYED / NOT UAT.** Separate from PR #49, issues #41/#44, DB migrations and current TikTok LIVE Studio publishing. Checked against MediaMTX 1.20.0 documentation (2026-10-21).

## Confirmed workflow

OBS Studio **Start Virtual Camera** → TikTok LIVE Studio → TikTok LIVE continues unchanged. If OBS native **Start Streaming** is free, it publishes a second OBS program output via authenticated **RTMPS TCP 1936** to dedicated MediaMTX. MediaMTX fans out **HLS** (HTTP 8888 only on host loopback) through nginx **HTTPS 443** to both studio LAN browsers and remote browsers, all signed into ADA. Source video may differ from TikTok's final output: TikTok LIVE Studio overlays and audio are not automatically in the OBS feed.

The same public media hostname serves LAN and remote. Studio-to-gateway upload and gateway-to-LAN viewer Internet still must work: **LAN viewing does not survive an uplink outage in this design**. No serverless video proxy via Vercel, no TikTok stream key, no default recording to Drive/Supabase.

## Files
- `infra/media-poc/mediamtx.yml`: deny-by-default JWT auth; RTMPS ingest, HLS-only playback, one fixed path, recording disabled.
- `infra/media-poc/compose.yaml`: pinned MediaMTX 1.20.0, restricted HLS loopback, certificate mount.
- `infra/media-poc/nginx-hls.conf.example`: external TLS/HLS proxy reference, **not deployed**.
- `docs/media-poc/SECURITY_CONTRACT.md`: issuer, viewer RBAC, route mapping and limitations.
- `docs/media-poc/UAT_MATRIX.md`: per-role, per-network and A/V test gates.

## Blocking dependencies before first startup

1. Owner-selected **noncritical** studio; consent to internal restream; inspect OBS **version**, whether **Start Streaming** is unused, OBS Audio Mixer / streaming Track 1, encoding hardware and headroom. NEVER change active live settings.
2. Approved media VPS/host and monthly egress cap; DNS `media.ops5729.top` is a **proposal** only, not an existing hostname. Acquire a trusted TLS certificate through approved ACME procedure, mount it read-only; automate renewal and controlled MediaMTX reload/restart for RTMPS cert rollover.
3. ADA backend endpoint `GET /api/media/jwks` **does not exist in this scaffold**. Implement asymmetric signature key management, publish/read short-lived token issuer and exact shift/brand/studio authorization. Until this is present this config is intentionally **NON-RUNNABLE for authorized playback/publishing**.
4. Bind `studio_poc_01` to an **owner-verified unique studio/feed** and exactly one allowed shift or explicit feed identity. Never infer from display-text `shifts.studio`, URL `live_link`, or client-provided brand_id; reject overlapping/ambiguous schedules.
5. External nginx must use a valid certificate and forward `Authorization` **unchanged** to MediaMTX. Browser `hls.js` fetches playlists, parts AND segments with Bearer header; verify real negative tests on each kind. Do not expose 8888 or enable a caching CDN that bypasses auth.
6. Firewall: public TCP 443 and TCP 1936 only (prefer studio IP allowlist); SSH from admin IP/VPN only; restrict Docker/host firewalls (published ports can bypass ufw depending on Docker). No public 1935/8888/9997/9998/8889/8189.
7. The `/api/media/*` web API must never relay video bytes via Vercel. Do not serve, store, or log raw JWT or publisher credentials. Secrets remain off-repo.
8. Video player: `hls.js` in ADA Edge/Chrome uses `xhrSetup` or `fetchSetup` Authorization on **every request**. Native iOS Safari HLS cannot reliably attach that header; treat mobile Safari as unsupported until authenticated signed-cookie reverse-proxy design passes segment-level checks.

## Proposed OBS configuration after all preflight gates

- OBS `Settings > Stream > Service: Custom`, server **RTMPS** `rtmps://media.ops5729.top:1936/studio_poc_01?token=<PUBLISH_JWT>`, **Stream Key empty** per MediaMTX URL-path pattern. Treat the entire RTMPS URL as a secret, don't take screenshots of it or paste into tickets.
- If OBS's URL parser/key field separates the URL, validate actual path and query in a dry run with a synthetic encoder first. The URL length of some RTMP clients is limited; mint compact short tokens.
- OBS `Start Virtual Camera` remains on for TikTok LIVE Studio. Only in a preapproved noncritical period use `Start Streaming` for ADA. If that button is already in use, STOP and design an auxiliary output separately.
- Pilot output: target `1280×720 30 fps`, H.264 + AAC, CBR 1.5–2.5 Mb/s, keyframe interval ~2s as an **initial test target**; OBS may share encoders/settings between outputs, verify per-profile capabilities and primary stream integrity. MediaMTX does not transcode. Do not promise that this output profile is independent of Virtual Camera.
- Audio gate: confirm OBS Audio Mixer sources and Stream Track 1 vs TikTok LIVE Studio input; test speech/clap sync, echo/no echo, overlay differences, and platform live unaffected.
- Prevent recording; check `record: false`, no `hlsDirectory` or forward targets.

## Planned viewer contract (not implemented)

ADA `/live` checks signed-in user + allowed shift and brand + canonical stream mapping; server issues **viewer-only JWT** (e.g. 120s), with claims `iss=https://ops5729.top`, `aud=ada-media-monitor`, `exp`, `nbf`, `jti`, `mediamtx_permissions=[{action:"read",path:"studio_poc_01"}]`. Signature verified via public JWKS. Token never grants publish, never persists in localStorage, and requires controlled refresh while watching. Publisher token similarly restricts **publish** to exact path; shorter-lived issuance/rotation procedure needs OBS operator runbook. Disable old JWTs through effective expiry, rotation and revocation strategy; server-side RBAC revocations are not instantaneous for already-issued tokens.

Expected HLS URL (not publicly readable): `https://media.ops5729.top/studio_poc_01/index.m3u8`.

`shifts.live_link` keeps official TikTok/Shopee URL. PR #49 supplies external fallback and local tab capture. It does NOT provide a remote OBS feed.

## Cost sizing & limitations

Initial sizing proposal: dedicated/isolated **2 vCPU, 2–4 GB RAM**, Ubuntu LTS, Singapore or Vietnam based on latency and routing; **no transcoding**. Confirm concurrent video bitrates, CPU, egress, connection limits, ingress resilience and provider billing. Approx decimal egress formula `GB ≈ bitrate_Mbps × 3600 × viewer_hours / 8000`, or binary `GiB ≈ bitrate_Mbps × 1,000,000 × 3600 × viewer_hours / (8 × 1024³)`; add audio/HTTP/TLS overhead. `viewer_hours` sums concurrent viewers' watched hours. A 2 Mbps video feed ≈ 0.9 GB per viewer-hour before overhead. 10 viewers × 8 h/day × 30 days ≈ **2.16 TB outbound/month** before overhead, not counting the single studio upload. Add headroom and alerts; do not scale by raw shift count alone.

DigitalOcean official regular Droplet example at research time: 1 vCPU/2GiB **$12/mo** (2,000 GiB transfer) or 2 vCPU/2GiB **$18/mo** (3,000 GiB transfer), excluding ancillary fees/overages. Region and final price must be verified before purchase. No VPS purchased by this change.

## Rollout

1. Synthetic signal with authorized publisher token on isolated staging gateway (no TikTok / no live studio change). Test 401/403-denial and protected HLS segments.
2. OBS noncritical studio approved pilot, measure video/audio/OBS stats, simultaneous LAN + 4G viewer.
3. ADA in-app player on **separate** branch from then-current main; mocks and browser UAT, no DB write unless specifically reviewed.
4. UAT MATRIX all mandatory checks; required CI and correct Production-project Preview; owner review; gated deploy and rollback plan. No automatic merge/deploy.

## Reference docs
- https://mediamtx.org/docs/references/configuration-file
- https://mediamtx.org/docs/features/authentication
- https://mediamtx.org/docs/publish/obs-studio
- https://mediamtx.org/docs/read/web-browsers
- https://www.digitalocean.com/pricing/droplets
