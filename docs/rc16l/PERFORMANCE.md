# RC1.6L performance evidence

Baseline: remote main 4f03c0b881bcc77547e72a2d5c655b07690746d6. Before/after use the same local synthetic fixture: 80 same-time shifts, React SSR, five warmed samples, median measured with performance.now(). This does not establish browser render/commit time or authenticated Supabase network performance.

| View | Before SSR ms | After SSR ms | Elements | HTML bytes |
|---|---:|---:|---|---|
| week | 262.1 | 16.7 | 542 → 146 | 117617 → 17080 |
| day | 544.2 | 249.5 | 3656 → 642 | 405524 → 105003 |

Raw measurements: evidence/render-before.json and evidence/render-after.json. They are local measurements, not an estimate of Production latency.

Request-path audit (source evidence):

| Mode | Baseline | Candidate |
|---|---|---|
| Month/Week/Day | Range read + staffing summary; waits for reference promises; then registrations and reports | Bounded pages of 50 within visible authority range, registrations from page projection; references run independently; reports load when day details open |
| List | Server 10/20/50 page followed by report read; whole Calendar loading replacement | Server page retains bounds; no background report read; toolbar survives regional skeleton |
| Open/Mine | Bounded pages and debounce already present; previously visited tabs stay mounted; separate reference loads | Inactive tabs unmount; shared references for one identity/permission with 60s TTL; URL state retained |
| Search/navigation | Calendar loads can complete after navigation; search changes retrigger reads | Abort previous requests and invalidate sequence; Calendar search settles at 250ms; grid search remains client-side without repeat operational fetch |

Browser waterfall, durations, response payload sizes, duplicate-call counts and React browser render timing for Month/Week/Day/List/Open/Mine: NOT_VERIFIED. Playwright cannot spawn locally (evidence/playwright.txt). The new fixture matrix captures screenshots and DOM-ready/network metadata in CI; authenticated staging UAT remains separate. No before/after screenshots have been fabricated.
