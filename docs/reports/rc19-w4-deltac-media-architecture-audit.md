# RC19 W4 Delta C — Live Monitoring Media Architecture & Infrastructure Boundary Audit

- **Candidate Baseline:** `8fab7eacfaab38e7b5e798db7900f12a9b7b17f9` (`integration/rc19-w4-final-integration`)
- **Feature Branch / Worktree:** `fix/rc19-w4-live-monitoring-sharing` (`rc19-w4-live-monitoring-sharing`)
- **Related Issues:** `#189` (RC19 W4 Delta C), `#51` (OBS + MediaMTX Protected Stream PoC)
- **Authoritative Scope Rule:** Analysis + isolated prototype only; **zero** Production VPS purchases, third-party SaaS signups, or Production infra deployment.

---

## 1. Existing `#51` / Phase 2B Assets Audited & Reused

| Existing Asset | Current Behavior | Reused in Delta C? | Delta C Boundary / Extension |
| :--- | :--- | :--- | :--- |
| `infra/media-poc/mediamtx.yml` | RTMPS (`:1936`, OBS push) + internal HLS (`127.0.0.1:8888`) + ES256 JWKS JWT (`aud: ada-media-monitor`, `record: false`). | **Preserved untouched** (for `#51` OBS contract compatibility). | Companion reference `infra/media-poc/mediamtx-webrtc-whip.example.yml` documents WebRTC WHIP/WHEP + ICE/TLS for browser-tab publishing. |
| `infra/media-poc/hls-auth-guard.mjs` + `nginx-hls.conf.example` | Nginx `auth_request /__ada_media_auth` strips query tokens and forwards `Authorization: Bearer <jwt>` to port `9191`, verifying ES256 signature and `mediamtx_permissions`. | **Concept & policy reused**. | Extended pattern to separate `action: 'publish'` vs `action: 'read'` permissions in `scripts/live-media-gateway-sidecar.mjs` for isolated local/CI testing. |
| `lib/server/mediaViewerKey.ts` | Loads ES256 P-256 keypair, emits `/.well-known` (`GET /api/media/jwks`), signs 90s read grants (`mediamtx_permissions: [{ action: 'read', path }]`). | **Directly extended**. | Adds `signMediaPublishGrant` (`action: 'publish'`) and local loopback dev-only `loadLiveSessionMediaSettings` (blocked in Staging/Preview/Production). |
| `public.media_stream_routes` & `public.media_viewer_grants` (`20261021064611`) | Default-deny RLS exact `(brand, platform, studio, active_shift_id, media_path)` and time-bounded explicit viewer grants. | **Preserved + supplemented**. | Additive `public.media_publish_sessions` + RPCs (`start_shift_media_publish_session`, `stop_shift_media_publish_session`, `authorize_shift_media_viewer`) allow dynamic multi-room browser sharing across `'scheduled' | 'preparing' | 'live' | 'paused'` without colliding with OBS `studio_poc_01`. |
| `components/features/live/AdaHlsPlayer.tsx` | Lazily loads `hls.js@1.7.3` when `NEXT_PUBLIC_MEDIA_PLAYER_UI_ENABLED === 'true'`, holds JWT only in volatile ref, signs `xhrSetup`. | **Preserved untouched**. | Sibling `LiveSharedStreamViewer.tsx` consumes browser-tab shared streams on the same volatile-ref JWT security model. |
| `components/features/live/LiveTabCapture.tsx` | Local-only `getDisplayMedia` preview that previously destroyed `MediaStream` on unmount (shift switch / route change). | **Refactored safely**. | Delegates persistent `MediaStream` + publish transport to shell-level `LiveTabPublisherProvider` (`app/(dashboard)/layout.tsx`). |

---

## 2. Production WebRTC WHIP → MediaMTX → WHEP / HLS Infrastructure Boundary

### 2.1 Why Vercel Serverless & Supabase Realtime Cannot Relay Live Video
1. **Vercel Function Limits:** Serverless functions enforce short execution timeouts, lack persistent stateful UDP/ICE sockets or long-lived media fan-out state, and bill egress per GB at significantly higher rates than dedicated media origin compute.
2. **Supabase Database / Realtime Limits:** Realtime Broadcast / Postgres Changes enforce strict message size caps, per-second rate limits, and connection quotas; relaying video frames through Supabase violates architectural boundaries and starves operational shift/attendance traffic.

### 2.2 MediaMTX Browser-Tab Protocol & Codec Compatibility Analysis

| Path | Ingest Protocol | Egress Protocol | Codec Constraint | Native Browser Support | CPU Impact per Stream |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OBS Studio (`#51`)** | RTMPS (`:1936`) | fMP4 HLS (`hls.js`) | H.264 + AAC | All browsers via `hls.js` | < 3% CPU (remux only, zero transcoding) |
| **Browser Tab Video-Only → WHEP** | WebRTC **WHIP** (`POST /<path>/whip`) | WebRTC **WHEP** (`POST /<path>/whep`) | VP8 or H.264 (`audio: false`) | Chrome/Edge/Firefox/Safari | **< 2% CPU** (pure RTP forwarding SFU, zero transcoding) |
| **Browser Tab Video-Only → LL-HLS** | WebRTC **WHIP** | fMP4 LL-HLS (`index.m3u8`) | H.264 baseline/main required (browser must negotiate H.264 via SDP) | Chrome/Edge/Safari via `hls.js` | < 4% CPU (RTP→fMP4 remux only when `video/H264` negotiated) |
| **Browser Tab w/ Audio → HLS** | WebRTC **WHIP** | fMP4 HLS | WebRTC mandates **Opus** audio; HLS requires **AAC** | Breaks HLS without audio transcoding | **15–30% CPU** per stream (FFmpeg/GStreamer Opus→AAC transcode required) |

**Key Architectural Finding:**  
Because `LiveTabCapture` captures TikTok/Shopee LIVE tabs on an operator workstation, restricting ingest to **WebRTC WHIP video-only (`H.264` SDP preference)** or using **MediaMTX WebRTC WHEP** fan-out avoids costly audio transcoding altogether while preserving optional local mute/unmute audio playback for the publisher.

### 2.3 Bandwidth, Latency, CPU & Cost Estimates (1 Concurrent Broadcast Room, 720p30 @ 2.0 Mbps)
- **Publisher Uplink (Support/Operator PC):** `~1.8–2.5 Mbps` steady upload for 720p30 H.264 (`~0.9–1.1 GB/hour`).
- **Gateway Fan-out Egress (per concurrent room with $N$ viewers):**
  - 5 authorized viewers (Ops Leader, Brand Owner, backup Support, QA, Admin): `5 × 2.0 Mbps = 10 Mbps` egress (`~4.5 GB/hour`).
  - 3 concurrent rooms (`N = 5` each): `~30 Mbps` peak egress (`~13.5 GB/hour`).
- **End-to-End Latency:**
  - **WHIP → WHEP (WebRTC SFU):** `300 ms – 800 ms` (ideal for real-time monitor sync).
  - **WHIP → LL-HLS (`hls.js`):** `3 s – 6 s`.
  - **HTTP frame gateway sidecar (Delta C local/CI prototype):** `100 ms – 350 ms` at `10 fps` annotated frame packets (`~250 KB/s` per stream on loopback).
- **Missing Production Infrastructure Components (Explicitly Out-of-Scope to Provision Now):**
  1. Dedicated single Linux VPS/VM (e.g., 2 vCPU / 4 GB RAM, Docker Compose with MediaMTX v1.20+ + Nginx TLS + `coturn` TURN/STUN server on `media.ops5729.top`).
  2. UDP/TCP firewall rules (`443/tcp` HTTPS/WSS + Nginx, `8889/tcp` internal WebRTC WHEP/WHIP proxy, `8189/udp` WebRTC ICE/mux + TURN TLS `5349/tcp/udp` for strict corporate NATs).
  3. Production ES256 signing key (`MEDIA_JWT_ES256_PRIVATE_KEY_PEM`) and `MEDIA_APP_ORIGIN=https://ops5729.top`, `MEDIA_PUBLIC_HLS_ORIGIN=https://media.ops5729.top`.

### 2.4 Publisher vs Viewer Security & Session Lifecycle Contract
1. **Live Link (`shifts.live_link`) Write Authorization (`C1`):**
   - Admin, in-scope Leader (`shifts.manage` on shift `brand_id`), OR assigned active Member on that shift (`support_id` / `host_id` / `technical_id` or `approved`/`manually_assigned` `shift_registrations`) when shift status is `scheduled | preparing | live | paused`.
   - Unassigned Members, foreign Leaders, and completed/cancelled shifts are strictly denied (`42501 OPERATION_NOT_ALLOWED`).
   - Verified readback (`getById(shiftId)`) confirms `live_link` persistence after `update_shift_live_link`.
2. **Publisher Lock & Room Isolation (`C3`):**
   - Only one active publisher session (`media_publish_sessions` partial unique index `(shift_id) WHERE status = 'active'`) may broadcast to a shift's isolated `media_path` (`shift_<sanitized_shift_id>`).
   - Duplicate publish attempts by another account fail with `409 Conflict` (`DUPLICATE_ACTIVE_PUBLISHER`) unless explicit handover is invoked by a manager (`p_force_handover = true`).
   - Publisher token has `mediamtx_permissions: [{ action: 'publish', path: mediaPath }]` (never wildcard `*` or `all_others`).
3. **Viewer Authorization & Revocation:**
   - Viewer token has `mediamtx_permissions: [{ action: 'read', path: mediaPath }]`, 90s max expiry, held strictly in a React `useRef` (never in `localStorage`, `sessionStorage`, `cookies`, or query strings).
   - Publishing/viewing immediately halts when Stop is clicked, the browser stops screen sharing (`track.onended`), the user logs out, or the shift completes/cancels.

---

## 3. Section 5 Operational Handoffs & Environment Notes

### 3.1 KAO Issue `#184` Read-Only Production Evidence Block (Status Check)
- Read-only inspection against `egdjnpmoasarrttvhgds.supabase.co` remains **BLOCKED (`401 Invalid API key`)** using the expired credential in `scratch/.env.production.local`.
- Per Owner instructions: no secret keys requested in chat, and **Delta C work proceeds independently** without waiting for KAO remediation.

### 3.2 Native WSL GoTrue Auth Bootstrap Proposal (For Codex Validation — Proposal Only)
> [!NOTE]
> The procedure below is a **proposed method** for Codex's PostgreSQL 17.11 Auth runtime harness. It has **not** yet been executed against an isolated disposable DB in this worktree and **must not** be treated as verified proof until Codex validates it cleanly from scratch. Never hand-edit managed `auth` schema objects or manually insert fake migration rows into `supabase_migrations` / `auth.schema_migrations`.

1. Compile or run official Supabase GoTrue (`v2.x`) natively inside WSL Ubuntu-24.04 against a **fresh disposable database** on a dedicated non-conflicting port (not `55439` or `55476`):
   - Set `GOTRUE_DB_DRIVER=postgres`
   - Set `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:<pw>@127.0.0.1:<port>/<db>?sslmode=disable`
   - Allow GoTrue's own startup binary migration runner (`./gotrue migrate`) to apply official upstream `auth.*` migrations cleanly without hand-editing SQL.
2. Start GoTrue HTTP listener (`GOTRUE_API_PORT=15548`, `GOTRUE_JWT_SECRET=<test-secret>`) and PostgREST (`PGRST_DB_URI`, `PGRST_JWT_SECRET`, `PGRST_SERVER_PORT=15549`) bound strictly to `127.0.0.1`.
3. Apply `supabase/migrations/*.sql` sequentially on top of the GoTrue-migrated database and verify `auth.users` / `auth.uid()` parity before promoting any CI workflow.
