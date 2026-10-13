# RC1.6K route collection audit (source inventory)

This inventory follows the 22 routes in `e2e/rc16k-route-audit.spec.ts`. It records the collection read used by each route. The browser route matrix is local synthetic presentation evidence; it does not prove Supabase runtime bounds or role permissions.

| Route | Primary collection | Bounded read or scoped behavior |
| --- | --- | --- |
| `/` | Dashboard widgets | Date-range snapshot; see contextual exceptions below. |
| `/calendar` | Calendar cells and list | Date range for cells, server page for All Time list; Export All is explicit. |
| `/registration` | Redirect | Redirects to `/staffing?tab=registration`. |
| `/shifts` | Shift table | `get_shift_list_page`; page-scoped related registrations. |
| `/staffing` | Staffing and review queue | Staffing uses shift pages; Registration Review uses `get_registration_review_page`, server filters and counts, plus a selected applicant's seven-day context capped at 500 records. |
| `/swaps` | Swap list | `get_swap_list_page`; Export All is explicit. |
| `/live` | Live shifts and updates | Shift page and `get_live_update_page`. |
| `/reports` | Report list | `get_report_list_page`; Export All is explicit. |
| `/storage` | Operational files | Paged API query. |
| `/storage/setup` | Configuration | Form with bounded sample, no history collection. |
| `/analytics` | Confirmed report detail | `get_report_list_page` with server filters and stable order; charts use `get_analytics_snapshot` aggregate; Export All is explicit. |
| `/data-quality` | Quality issues | Server page. |
| `/workforce` | Period overview | API aggregate, no route-level history list. |
| `/payroll` | Period/detail workflow | API snapshot, no route-level history list. |
| `/staff` | Staff table | Server page; related directory/options below. |
| `/brands` | Brand table | Server page; related directory/options below. |
| `/platforms` | Platform table | Server page; related directory/options below. |
| `/campaigns` | Campaign table | Server page; related directory/options below. |
| `/audit` | Audit history | Server page and actor page. |
| `/notifications` | Notification feed | Server page. |
| `/settings` | Settings | Form/detail, no collection list. |
| `/profile` | Profile | Detail, no collection list. |

## Contextual reads and exceptions found during the source audit

- Filter and form option catalogs still use `getAll()` on brands, platforms, campaigns, and sometimes staff across Calendar, Staffing, Reports, Shifts, Swaps, and Analytics. These supply complete selectors rather than visible list rows. They are not count bounded and need a separate selector/search contract if catalog size becomes material.
- The dashboard loads a user-selected date range of Shifts, Reports, and Swaps to calculate cross-module widgets. This is range scoped but not count bounded. The Calendar and Reports export actions intentionally retrieve complete authorized filtered data.
- Global Search in the shared header preloads full Shifts, Staff, Brands, Campaigns, and Reports when opened (`components/features/search/GlobalSearch.tsx`). This is an additional unbounded collection outside the two RC1.6K route lists and remains a performance/RBAC audit item.
- Calendar's import panel reads all existing Shifts for duplicate reconciliation (`components/features/calendar/ScheduleImportPanel.tsx`). Shift and Swap form dialogs also read existing Shifts for conflict/candidate context. These are operation context reads, not visible lists, and remain count-unbounded.
- `ReportsContainer.tsx` still contains full reads but is not the route component; `/reports` renders `LazyReportsList`.

The inventory is source evidence. PostgreSQL fixture results and local browser results must be reported separately; no Production or Staging runtime claim follows from this matrix.
