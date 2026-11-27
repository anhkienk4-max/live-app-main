# RC19 W4 D3 Workforce Monthly API v2

Status: backend source contract; authenticated runtime acceptance pending.

## Endpoint

`GET /api/workforce/incidents/monthly`

The server calls `public.rc19_workforce_incident_monthly_v2`. The original RPC remains available for existing clients; the API v2 response includes whole-scope totals independent of detail pagination.

## Query

| Parameter | Type | Meaning |
|---|---|---|
| `month` | `YYYY-MM` | Asia/Ho_Chi_Minh business month |
| `staff_id` | string, optional | Staff filter; Member may request only their own identity |
| `brand_id` | string, optional | Brand filter and Leader scope check |
| `role` | `host \| support \| technical`, optional | Operational role filter |
| `agency_id` | UUID, optional | Canonical Agency filter and Leader membership check |
| `platform_id` | string, optional | Shift platform filter |
| `status` | `pending \| confirmed \| rejected \| corrected`, optional | Review-state filter |
| `incident_type` | `skip \| absent \| authorized_absence \| late \| early_leave \| approved_pass \| approved_swap \| planned_reassignment \| other`, optional | Incident type filter |
| `limit` | integer 1–100, default 50 | Detail page size |
| `offset` | integer 0–100000, default 0 | Detail offset |

All filters are applied in the authorized `scoped` dataset before aggregate computation and pagination.

## Response additions

```ts
type WorkforceIncidentMonthlyResponse = {
  month: string
  timezone: 'Asia/Ho_Chi_Minh'
  pageLimit: number
  pageOffset: number
  totalIncidents: number
  totalDistinctShifts: number // COUNT(DISTINCT shift_id) over filtered scope
  totalDistinctStaff: number // COUNT(DISTINCT staff_id) over filtered scope
  staff: WorkforceIncidentMonthlyStaffSummary[]
}
```

`totalDistinctShifts` is not calculated by summing each staff member's distinct shift count. Both totals are computed over the complete filtered scope before `LIMIT/OFFSET`, so page 1 and page 2 have identical totals for identical filters. Per-staff aggregates continue to cover the full filtered scope; each staff member's `items` contains only rows from the requested page.

## Authorization / privacy

- Admin requires effective `workforce.read`.
- Leader rows require both active `workforce.read` Brand scope and active canonical Agency membership for the shift's authoritative Agency; unresolved Agency rows are excluded.
- Member scope is self-only.
- The projection excludes incident reasons, evidence references, and internal personnel details.
- Pending, rejected, corrected, confirmed and approved PASS/SWAP remain distinct. Verified late minutes and unknown late duration are not conflated.

## Stable query errors

`400 WORKFORCE_MONTH_QUERY_INVALID`, `403 WORKFORCE_ACTOR_NOT_AUTHORIZED`, `403 WORKFORCE_SELF_SCOPE_REQUIRED`, `403 WORKFORCE_BRAND_SCOPE_REQUIRED`, `403 WORKFORCE_AGENCY_SCOPE_REQUIRED`, `503 WORKFORCE_INCIDENT_SUMMARY_UNAVAILABLE`, `502 WORKFORCE_INCIDENT_SUMMARY_INVALID`.

Frontend clients should consume `totalDistinctShifts` and `totalDistinctStaff` directly and must not derive whole-result counts from paginated `staff[].items`.
