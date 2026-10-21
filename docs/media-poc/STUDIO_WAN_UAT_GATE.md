# ADA — studio LAN and remote 4G physical UAT gate

Status: NOT RUN. No VPS has been purchased, no Media Gateway DNS/TLS provisioned, and no Studio OBS settings changed. This is an operator checklist, not an authorization to deploy.

## Prerequisites: require business and technical signoff

- Select exactly one approved pilot studio, brand/platform and LIVE shift. Identify accountable operator and rollback owner.
- Approve isolated Media Gateway host, cost and monthly traffic cap before provisioning. The proposed media domain is not evidence that it is configured.
- Public HTTPS 443 only via Nginx verifier. Allow RTMPS 1936 from approved studio address or VPN. HLS 8888 and verifier 9191 must remain host-loopback and unreachable from all external networks.
- Install proper HTTPS certs. Load JWKS and server-side P-256 signing key only in the approved staging environment. No secrets in public NEXT_PUBLIC vars, GitHub logs, user screenshots or OBS links.
- Stage exact active_shift_id and brand/platform/studio media route. Stage short-lived media_viewer_grants only for authorized test users. Both tables currently have zero real rows; never seed grants silently. Verify active business account RLS and test expiry.
- Deploy isolated staging ADA build with the two separately approved media feature flags. Keep Production OFF.
- On studio machine do NOT disturb OBS Virtual Camera -> TikTok LIVE Studio -> TikTok LIVE. If the second OBS streaming output is not operator-approved, use synthetic FFmpeg only.

## Test sequence and required evidence

1. Negative control: anonymous, expired, wrong-path and publisher-only tokens must fail on public HTTPS playlist AND every init/media segment. Confirm 8888/9191 cannot be accessed through public IP.
2. LAN viewer: Microsoft Edge or Chrome at the studio must authenticate to staging ADA, select approved LIVE shift and click Xem nguồn OBS. Check H.264 video frames advancing, AAC track audio/sync and manual mute/unmute.
3. Remote viewer: independently connect a second permitted user/device using cellular 4G/5G hotspot with Wi-Fi disconnected. Open the same shift at the same time. Record both viewers active concurrently with actual time and network identifiers (do not publish credentials).
4. Inspect browser Network panel: verify Bearer on each playlist/init/part/segment, cookieCheck session handshake (if MediaMTX uses it), no JWT in URL query strings, and origin restriction. Use separate session/context to test wrong account denied.
5. Confirm video frame rate, first-frame time, live delay, stalls, audio synchronization, end-to-end load and upload bandwidth/CPU/GPU from measurements. Test 1, 5, 10 viewers only within approved cost/traffic limits.
6. Revoke a viewer grant while video is live. Browser should stop at next authorization refresh (about 20 seconds max under healthy polling); record exact measured delay. Already signed bearer may still validate until its 90-second expiration at gateway. Immediate universal revocation is NOT guaranteed.
7. Switch to a different shift, close the modal, stop playback, go offline briefly and restore network. Confirm old requests cease, unauthorized reconnect fails closed and legitimate operator can recover without duplicate active playback.
8. Ensure official TikTok/Shopee links and local tab-capture fallback still function and that the main TikTok LIVE Studio broadcast never drops or loses audio.
9. Roll back by disabling staging media feature flags, stopping only the test publisher, revoking temporary grants and closing studio ingress; verify public endpoint no longer exposes media. Do not touch Production.

## PASS/FAIL release rule

PASS requires signed evidence from BOTH actual studio LAN and a different mobile carrier network, at least one approved LIVE shift, a real HTTPS MediaMTX gateway, actual audio/video, and all negative security controls. Two Playwright contexts on the same GitHub Actions runner are NOT two networks. CI SHA, tested client/browser versions and observed metrics must be recorded. Never claim Production GO based only on synthetic CI.
