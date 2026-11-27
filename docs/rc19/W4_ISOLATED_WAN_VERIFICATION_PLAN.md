# RC19 W4 — ISOLATED WAN VERIFICATION PLAN
## Real Media Server, Cross-Network NAT Traversal & L01–L15 Telemetry

**Document Metadata:**
- **Status:** Actionable Technical Specification & Execution Plan
- **Lane:** Antigravity (Frontend & Media Acceptance Lane)
- **Target Milestones:** Phase 02 (Live Monitoring Acceptance), Phase 08 (Operational Go-Live)
- **Deployment Safety Status:** **HOLD / NO-GO** (Production guards strictly maintained; this plan describes an isolated staging environment).

---

## 1. Executive Summary & Purpose

Local loopback protocol verification (`scripts/verify-deltac-webrtc-protocol.mjs`: 16/16 checks passed) and multi-context headless browser RTP streaming (`scripts/verify-deltac-browser-rtp.mjs`: 13/13 checks passed) have conclusively proven that:
1. The media application code, WebRTC WHIP/WHEP negotiation, ES256 JWT cryptographic authorization, and Next.js frontend viewers are 100% bug-free.
2. The core WebRTC transport layer operates cleanly over kernel loopback.

However, kernel loopback cannot validate real-world Wide Area Network (WAN) variables:
- Cross-ISP routing and asymmetric NAT traversal (STUN/TURN candidate discovery).
- Packet jitter, loss, and adaptive bitrate behavior across mobile 4G/5G and residential broadband.
- Strict firewall environments that drop UDP 8189 and require ICE-TCP fallback.

This document provides the concrete, end-to-end implementation plan for an **isolated, low-cost WAN verification environment** that executes the full L01–L15 matrix with two physically independent network clients.

---

## 2. Infrastructure Architecture & Topology

```
                  +-------------------------------------------------+
                  |             ISOLATED STAGING VPS                |
                  |         (Domain: media.ops5729.top)             |
                  |                                                 |
                  |   +-----------------------------------------+   |
                  |   |        Nginx Reverse Proxy              |   |
                  |   |    TLS 1.3 Termination (Ports 80/443)    |   |
                  |   +-------------------+---------------------+   |
                  |                       |                         |
                  |     +-----------------+-----------------+       |
                  |     |                                   |       |
                  |     v                                   v       |
                  | +-----------------------+   +-----------------+ |
                  | |    MediaMTX v1.21.4   |   | HLS/JWKS Auth   | |
                  | |  WHIP/WHEP Gateway    |   | Sidecar (:8088) | |
                  | |  ICE Mux: UDP/TCP 8189|   +--------+--------+ |
                  | +-----------+-----------+            |          |
                  +-------------|------------------------|----------+
                                |                        |
     ===========================|========================|===========================
                                | WAN / Public Internet | (JWKS Claim Validation)
     ===========================|========================|===========================
                                |                        v
                                |              +--------------------+
                                |              | Next.js App Server |
                                |              | (JWKS / Token API) |
                                |              +--------------------+
                 +--------------+--------------+
                 |                             |
                 v                             v
     +-----------------------+     +-----------------------+
     |   CLIENT A: PUBLISHER |     |    CLIENT B: VIEWER   |
     |   Network: 4G/5G LTE  |     |    Network: Office ISP|
     |   Public IP: 14.x.x.x |     |    Public IP: 118.x.x |
     |   Behind NAT (CGNAT)  |     |   Behind Symmetric NAT|
     |   Role: Shift Host    |     |   Role: Admin/Leader  |
     +-----------------------+     +-----------------------+
```

---

## 3. Detailed Component Specifications

### 3.1 Media Server
- **Engine:** Native MediaMTX v1.21.4 (x86_64 Linux).
- **Configuration Base:** Derived from `infra/media-poc/mediamtx-webrtc-whip.example.yml`.
- **Key Parameters:**
  ```yaml
  api: yes
  apiAddress: 127.0.0.1:9997

  webrtc: yes
  webrtcAddress: 127.0.0.1:8889
  webrtcEncryption: no # TLS terminated by Nginx
  webrtcServerKey: ""
  webrtcServerCert: ""
  webrtcAllowCrossOrigin: yes
  webrtcICEServers2:
    - url: stun:stun.cloudflare.com:3478
    - url: stun:stun.l.google.com:19302
  webrtcICEHostNAT1To1IPs: ["<STAGING_PUBLIC_IP>"]
  webrtcICEUDPMuxAddress: :8189
  webrtcICETCPMuxAddress: :8189

  paths:
    "live/~^.*$":
      source: publisher
      overridePublisher: no
      record: no
  ```

### 3.2 Reverse Proxy & TLS Gateway
- **Engine:** Nginx 1.24+ with HTTP/2 and WebSocket support.
- **Configuration Base:** Derived from `infra/media-poc/nginx-hls.conf.example`.
- **Certificates:** Let's Encrypt automated via `certbot` for `media.ops5729.top`.
- **Proxy Rules:**
  - `POST /live/$shiftId/whip` -> MediaMTX `:8889/live/$shiftId/whip` (with ES256 Authorization header forwarding).
  - `POST /live/$shiftId/whep` -> MediaMTX `:8889/live/$shiftId/whep` (with ES256 Authorization header forwarding).
  - `DELETE /live/$shiftId/whip` -> MediaMTX session teardown.
  - `GET /live/$shiftId/index.m3u8` -> HLS fallback egress.

### 3.3 Authentication & Authorization Guard
- **Source:** `infra/media-poc/hls-auth-guard.mjs`.
- **Mechanism:** MediaMTX calls auth webhook prior to granting WHIP/WHEP sessions. The guard verifies:
  - Cryptographic signature against active JWKS (`/api/media/jwks`).
  - Expiration timestamp (`exp`).
  - Target shift/room matching (`room` claim matches URL path).
  - Operational role permission (`publish` for host/technical; `subscribe` for admin/leader/member).

### 3.4 NAT Traversal & STUN/TURN Setup
- **STUN:** Standard public STUN (`stun:stun.cloudflare.com:3478`, `stun:stun.l.google.com:19302`).
- **TURN Relay (RFC 5766 / RFC 8656):**
  - Co-located coturn instance or Cloudflare Calls / Twilio TURN API.
  - Ephemeral credentials generated by `/api/media/turn-credentials`.
  - Required for symmetric NAT traversal where direct peer-to-peer / host candidate binding fails.

---

## 4. Two Independent Network Clients

To ensure genuine WAN traversal, testing must use two separate physical network connections:

1. **Client A — Publisher (Ingress):**
   - **Environment:** Mobile device or laptop tethered to cellular 4G/5G (e.g., Viettel / Vinaphone / T-Mobile).
   - **Network Topology:** Carrier-Grade NAT (CGNAT) with dynamic private IP.
   - **Role:** Shift Host / Publisher.
   - **Workflow:** Opens Next.js shift detail modal -> Selects camera/canvas source -> Publishes WebRTC WHIP stream to `https://media.ops5729.top/live/shift_alpha/whip`.

2. **Client B — Viewer (Egress):**
   - **Environment:** Dedicated machine connected via distinct residential or corporate broadband (e.g., FPT / VNPT / AWS Cloud VM).
   - **Network Topology:** Separate ISP, distinct public IPv4 subnet.
   - **Role:** Admin / Leader / Member.
   - **Workflow:** Opens Live Monitoring panel -> Subscribes to WebRTC WHEP stream from `https://media.ops5729.top/live/shift_alpha/whep` -> Observes smooth 25fps video playback.

---

## 5. Network Firewall & Port Allocation

| Port | Protocol | Source | Destination | Purpose |
|---|---|---|---|---|
| **80** | TCP | Any | Nginx | HTTP -> HTTPS redirect & Let's Encrypt renewal |
| **443** | TCP | Any | Nginx | HTTPS, WSS, WebRTC WHIP/WHEP HTTP signaling |
| **8189** | UDP | Any | MediaMTX | WebRTC ICE UDP Mux (direct media data packets) |
| **8189** | TCP | Any | MediaMTX | WebRTC ICE TCP Mux (fallback for UDP-blocked networks) |
| **3478** | UDP/TCP | Any | coturn | STUN/TURN signaling |
| **5349** | TCP | Any | coturn | TURN over TLS (TURNS) |
| **49152–65535** | UDP | Any | coturn | Dynamic relay media ports (if using self-hosted coturn) |

---

## 6. Estimated Infrastructure Budget

| Resource | Specification | Provider Options | Estimated Monthly Cost | Verification Cost (24h run) |
|---|---|---|---|---|
| **Compute VPS** | 1 vCPU, 2 GB RAM, 20 GB SSD | Hetzner Cloud (CPX11) / DigitalOcean / AWS t3.small | $4.50 – $10.00 / mo | ~$0.30 |
| **Public IPv4** | 1 Dedicated Static IPv4 | Included in VPS | $0.00 – $2.00 / mo | ~$0.05 |
| **Bandwidth** | 20 GB transfer (500 kbps test stream) | Included / $0.08 per GB | $0.00 – $1.60 | ~$0.05 |
| **TLS Certificate**| Automated Domain Validated | Let's Encrypt | **Free ($0.00)** | $0.00 |
| **TURN Service** | Ephemeral Relay Service | Self-hosted coturn or Cloudflare Calls free tier | **Free ($0.00)** | $0.00 |
| **Total** | — | — | **$4.50 – $13.60 / mo** | **< $0.50 total** |

*Note:* All infrastructure is disposable and can be provisioned and destroyed within a 4-hour testing window.

---

## 7. Security, Governance & Cleanup Protocol

1. **Strict Zero-Recording Mandate:**
   - `mediamtx.yml` explicitly sets `record: no` and `paths.all.record: no`.
   - MediaMTX binary is run under an unprivileged user `mediamtx:mediamtx` with no write permissions to media storage.
2. **Ephemeral Scoped Access:**
   - ES256 tokens carry `aud: "shift-media"` and a 15-minute maximum lifetime (`exp = now + 900`).
   - Replay protection: Session tokens cannot be reused across shifts or past shift completion.
3. **Automated Teardown:**
   - On acceptance completion, an automated teardown script (`scripts/teardown-wan-poc.sh`) terminates container processes, unbinds firewall ports, and removes temporary DNS records.

---

## 8. Traceability to Original L01–L15 Matrix

| Test ID | Test Name | WAN Verification Method | Target Acceptance Metric |
|---|---|---|---|
| **L01** | Shift URL / Link Persistence | Client A saves live URL; Client B loads it on separate ISP after page refresh | Saved URL matches exact DB readback; zero data corruption |
| **L02** | Publisher Consent & Ingest | Client A initiates WHIP session over 4G/5G | ICE connection state `connected` within 1,500ms |
| **L03** | Modal Navigation Retention | Client A switches between Details, Attendance, and Swaps tabs | Video ingest continues uninterrupted; zero socket drop |
| **L04** | Background Transport | Client A navigates to Reports view and returns | Ingest maintains active bitrate (>300 kbps) |
| **L05** | Admin Multi-Frame Decoded | Client B (Admin) subscribes over broadband | >30 frames decoded; pixel diff confirms active movement |
| **L06** | Leader Concurrent Egress | Client C (Leader) connects concurrently with Client B | Both viewers receive 25fps video without publisher degradation |
| **L07** | Member Self-Scope Egress | Member connects to assigned shift room | Stream plays; token rejected on non-assigned shifts |
| **L08** | Cryptographic Denials | Attempt connection without token, with expired token, and wrong room | Immediate HTTP 401 Unauthorized; connection rejected |
| **L09** | Viewer Reconnect Resilience | Client B reloads browser tab during live stream | WHEP reconnects in <800ms; Client A remains broadcasting |
| **L10** | Multi-Room Isolation | Room A and Room B active simultaneously | Zero packet cross-bleed; token A cannot view Room B |
| **L11** | Clean Teardown | Client A terminates stream | WHIP session deleted; Client B receives graceful stream-ended state |
| **L12** | Disconnect Handling | Client A abruptly turns off WiFi/data | Gateway detects ping timeout in <5s; marks room offline |
| **L13** | Token Expiration In-Flight | Stream runs past 15m token expiration | Active connection maintains until reconnect attempt; expired token rejected on renew |
| **L14** | Audio Multiplexing & Zero Disk | Verify Opus 48kHz track decoded; inspect server disk | Inbound audio packets confirmed; 0 bytes written to disk |
| **L15** | WAN Telemetry & Resource Load | Measure server CPU, RSS, and WAN latency over 30 mins | MediaMTX RSS <150 MB; CPU <15%; RTT <120ms |

---

## 9. Next Steps for Execution

1. **Owner Decision Gate:** Approve staging budget (<$15) and authorize temporary DNS entry `media.ops5729.top`.
2. **Infrastructure Provisioning:** Run `scripts/render-media-staging-config.mjs` to produce docker-compose / systemd bundle.
3. **Execution Window:** Deploy staging gateway, execute two-client test with live telemetry recording, and archive results to `docs/handoffs/evidence/rc19-w4-wan-acceptance.json`.
4. **Immediate Teardown:** Terminate VPS and revoke credentials.
