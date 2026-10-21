# Route / viewport / role results

All widths: **320, 360, 375×811, 390, 430, 768, 1024, 1280, 1440** (other heights 1000). PASS below means measured geometry/touch containment in local Chromium, with intentional labeled internal table scrolling allowed. Denied and disabled states are identified separately. It is not authenticated Production UAT.

| Route | Admin | Leader | Member |
|---|---|---|---|
| / | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /calendar?tab=calendar&calendar_view=month&calendar_date=2026-10-14 | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /live | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /shifts | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /staffing | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /registration | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /swaps | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /storage | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — DENIED |
| /storage/setup | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — DENIED | 9/9 PASS — DENIED |
| /reports | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /workforce | 9/9 PASS — CAPABILITY_OFF | 9/9 PASS — CAPABILITY_OFF | 9/9 PASS — CAPABILITY_OFF |
| /analytics | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /payroll | 9/9 PASS — CAPABILITY_OFF | 9/9 PASS — DENIED | 9/9 PASS — DENIED |
| /brands | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /platforms | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /campaigns | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /staff | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — DENIED |
| /audit | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — DENIED |
| /settings | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /notifications | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /profile | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |
| /data-quality | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE | 9/9 PASS — LOCAL_ROUTE |

- 594/594 protected-route/state measurements PASS across 22 routes × 3 roles × 9 widths.
- 36/36 public mock-auth width checks PASS; a separate 36/36 no-credential Supabase-mode public-auth checks PASS.
- 54/54 enabled Workforce/Payroll fixture measurements PASS; Leader/Member Payroll explicitly asserts 403.
- Total after: **720/720** measured route/role/width states. Before: 630 measurements; 156 geometry/touch failures.
- Browser interaction suite: role drawer Back/Escape/focus/navigation/persistence; dense eight-shift Vietnamese/overnight agenda/date history/filter reset/export/details; enabled Payroll details/rate modal; Member next-shift detail CTA.
- Registration/PASS/assignment mutations, actual password recovery completion, OAuth provider round trip and real authenticated role sessions: **NOT_VERIFIED in Production**. Existing service regression results are documented separately.
