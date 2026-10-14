# RC1.6L UAT checklist

Status: authenticated Admin/Leader/Member UAT NOT_VERIFIED. Use a separately approved staging environment with synthetic shifts. Do not write real shift data or change Production flags. Payroll stays OFF; actual staffing must stay OFF on Production until independent RBAC/UAT approval.

Record candidate SHA, staging URL/environment identity, tested account/role, date, viewport, screenshot and request trace for each case. Do not put credentials in evidence.

| Flow | Required cases | Expected result |
|---|---|---|
| Calendar views | Month/Week/Day/List/Open/Mine; 1366/1536/1920/390; Admin/Leader/Member | No overflow, stable toolbar, localized dates, keyboard navigation and regional skeletons |
| Filtering/paging | Search rapidly, combined filters, 10/20/50, final page, Back/Forward/reload | Requests debounce; URL restores context; refresh preserves scroll and changing page/filter resets it appropriately |
| Identity | Switch/logout during pending reads and exports, downgrade role | Prior account rows/dialogs disappear; late responses are ignored; unauthorized data never downloads |
| Dense schedules | 0 shifts, 80 overlaps, short adjacent shifts, overnight 23:30–02:30 | Compact cards, correct group count/paged details, continuation on following Day/Week |
| Actual staffing | Host split hours, separate Support/Technical periods, more than 200 segments | Multiple independent segments; bounded complete reads; planned shifts unchanged |
| Actual edit | Draft/approved amendment, before/after, actor, CAS, network retry with same UUID, 409 | Original evidence immutable; amendment stays draft until independent review; one audit per retry; 409 refetches and requires reopening |
| Actual review | Creator/original creator attempts review, inactive staff, overlapping approved hours, no-show/worked conflict | Server/DB reject invalid cases; no UI-only security boundary |
| Payroll boundary | Amendment of payroll-referenced segment; disabled Payroll routes | Correction rejected without partial rows/audit; no salary feature enabled |
| Export scopes | One shift, selected shifts, all filtered; Open/Mine scopes; 0/1/117/1001+ shifts | Exact verified shift count; filtered export includes every matching page; missing/changed scopes reject |
| Export fields | All authorized/select; XLSX multi-sheet; CSV schedule only; Vietnamese/date/time | Stable ordered labels and text cells; no silently omitted rows; formula prefixes neutralized |
| Export RBAC | Member, Leader requesting audit/salary/PII, revoked session mid-export | Denied before sensitive reads; salary/PII never registered; full audit is Admin-only |

Approval requires passing PostgreSQL 16/17 integration, exact-SHA CI/typecheck/lint/build, all role/width screenshots and measured authenticated request waterfall/duration/payload/duplicate/render evidence. Local SSR and mocked API/browser fixtures do not close authenticated UAT.
