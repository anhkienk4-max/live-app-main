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

The local browser matrix passed 14/14 after running outside the Windows process sandbox. The same performance probe passed 12/12 on each side (three mock roles, four widths, six views), with 72 screenshots and 72 standalone JSON measurements per side retained in the delivery package and produced by CI artifacts.

| View | Before DOM-ready median ms | After DOM-ready median ms |
|---|---:|---:|
| Month (cold navigation) | 3190.0 | 2862.0 |
| Week | 137.0 | 135.5 |
| Day | 286.0 | 195.5 |
| List | 412.5 | 289.0 |
| Open | 597.0 | 405.5 |
| Mine | 583.0 | 399.0 |

These are single-run development fixture samples; compilation, host noise and warmup affect timings. DOM-ready includes navigation/loading assertions/network completion, not React commit duration. Month recorded 36 capability requests / 4212 bytes / 24 duplicate calls across 12 cases in both phases. Other modes recorded no API requests because mock reads are in memory. This does not demonstrate authenticated Supabase request improvements. The source changes remove duplicated reference reads, defer reports and abort obsolete operational reads; authenticated waterfall, duration, payload, duplicate calls and React profiling remain NOT_VERIFIED until staging UAT. Earlier sandbox failures remain in evidence/playwright.txt as historical evidence.
