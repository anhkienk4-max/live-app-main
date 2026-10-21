# Issue #51 PoC acceptance matrix — one studio / two networks

All results are **NOT RUN**. The CI builds or documentation review do not replace physical UAT.

| ID | Verification | Expected release gate | Evidence |
|---|---|---|---|
| P00 | Studio consent, OBS version, native Start Streaming free | Confirmed without changing active profile | Operator checklist |
| P01 | OBS Virtual Camera feeds TikTok LIVE Studio unchanged | Main broadcast unaffected | side-by-side observations |
| P02 | Sample signal via RTMPS TLS trusted and scoped publish token | Correct path accepted; other paths and bad tokens denied | sanitized server log |
| P03 | Test `index.m3u8`, init segment, .m4s/part without Bearer | ALL denied; no HLS payload leaks | HTTP status / response bytes |
| P04 | Cross-brand viewer JWT, expired, wrong path, altered signature | ALL rejected | automated HTTP assertions |
| P05 | Valid ADA viewer grant + refresh before TTL expiry | Player remains stable; only authorized shift | request/response metadata (no tokens) |
| P06 | Studio LAN and separate 4G/home network simultaneously | Both watch SAME program feed at the SAME time | timestamped screenshots |
| P07 | Video and audio: host speech, clap, graphics | Correct OBS program, audio, acceptable sync; TikTok final differences documented | audio/video log |
| P08 | OBS CPU/GPU, drops, TikTok LIVE Studio health | No material regression vs measured baseline | OBS Stats before/after |
| P09 | Cut publisher connection then reconnect | Offline/Reconnecting/Live transitions; recover without reload where possible | player event log |
| P10 | Authorized viewer concurrency 1/5/10 | Server egress/CPU/RAM and buffering within measured limits | bitrate and telemetry |
| P11 | 3 min playback, long playback, token expiry | No unauthorized replay; renewable grant works | HTTP traces without secrets |
| P12 | Safari/iOS (if required) | Must fail closed until supported protected segment authorization | separate Safari matrix |
| P13 | Recording disabled, no media files in Drive/Supabase | PASS | config + storage audit |
| P14 | Host/domain/TLS and CORS, mixed-content, no public 8888 | PASS | scanner + curl + network |
| P15 | Backup/rollback | Kill auxiliary OBS output without touching Virtual Camera; fallback works | operator demonstration |

Test dimensions: authenticated Staff/Leader/Admin and unauthorized user; correct brand vs cross-brand; active vs ended shift; studio LAN vs home/4G; viewer sizes 1/5/10; Edge desktop first. Observe actual latency p50/p95 and uplink/egress from measured signal, not invented thresholds.

**Decision rule:** Any missing authentication for a playlist or segment, interruption to TikTok primary LIVE, incorrect shift mapping, or user cross-brand access is an immediate **NO-GO**. Keep PR #49 independent; no Production merge until exact-SHA CI + correct Vercel project Preview + physical UAT + rollback.
