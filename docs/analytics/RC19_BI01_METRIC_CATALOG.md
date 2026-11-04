# RC19 BI-01 #102 Metric Catalog and Compatibility

## Source contract

This catalog is based on the exact Reports candidate base `79c2410bad5545b3dfe7d646f3e4f5395c84668b`. Analytics reads the authenticated `get_analytics_snapshot(p_filters)` RPC through `/api/operations/analytics-snapshot`. The SQL function is `SECURITY INVOKER`, checks the mapped business actor, applies `private.filtered_shift_ids`, and selects only reports with `status = confirmed`, `metrics_confirmed = true`, and no deletion/archive timestamp. The client keeps the existing permission-scoped report export and paginated confirmed-report list. No new endpoint, SQL, RLS, or Payroll access is introduced.

## Metric catalog

| Metric | Status | Source / formula | Grain and limits |
|---|---|---|---|
| Revenue | SUPPORTED | Sum report revenue via normalized metric, platform revenue/sales, then report revenue field | Confirmed reports; report-level source can vary by platform |
| GMV | SUPPORTED | Sum normalized GMV, platform GMV, then report GMV | Kept separate from Revenue; no Revenue substitution |
| Orders | SUPPORTED | Sum normalized/platform/report orders | Never used as Revenue |
| Viewers | SUPPORTED | Sum engaged viewers, then report viewers/average_viewer | Present observations only |
| Product clicks | SUPPORTED | Sum product clicks | Present observations only |
| CTR | SUPPORTED | Average observed report CTR values | Unweighted report average; no impression-weighted denominator |
| CVR | SUPPORTED | Average observed report conversion-rate values | Unweighted report average; no click/order-weighted denominator |
| Average order value | DERIVED_WITH_VERIFIED_FORMULA | Sum paired revenue divided by sum of orders on the same rows | Null if no paired observations or paired orders total is zero |
| Livestream hours | DERIVED_WITH_VERIFIED_FORMULA | RPC sums reported duration in minutes; UI divides by 60 | Reported live duration, not scheduled shift time |
| Confirmed report count | SUPPORTED | Count confirmed, metrics-confirmed report rows | Not a distinct shift count |
| Staffing role workload | SUPPORTED (existing summary only) | Existing RPC workload CTE counts staffed shifts by Host/Support/Technical role | Operational workload, not an individual performance score; not exposed as a new metric selector |
| Distinct shift count | NOT_SUPPORTED | Snapshot does not return a distinct-shift aggregate | Do not rename report count as shifts |
| Support/Technical performance | NOT_SUPPORTED | Snapshot returns role workload counts, not report-attributed performance | Workload is not performance |
| GMV per hour, ROI, estimated GMV, funnel conversion steps | NOT_SUPPORTED | No confirmed API field/formula/grain in this snapshot contract | Keep unavailable until a reviewed source exists |

Brand, Platform, Campaign and time aggregates exist in the RPC. Host breakdown exists for confirmed Revenue only. The RPC does not return row-level paired observations, multi-dimension grids, hierarchical categories, funnel steps, target thresholds, or ordered contribution balances.

## Chart compatibility

| Chart | Status | Reason |
|---|---|---|
| Bar | SUPPORTED | One compatible measure against the returned time or categorical grain |
| Line / Area | SUPPORTED | Time-series grain only |
| Pie / Donut | SUPPORTED | Categorical dimension plus additive, non-ratio measure; negative values are blocked |
| Stacked Bar | NOT_SUPPORTED | Current snapshot returns one selected measure and no compatible multi-series contract |
| Combo | NOT_SUPPORTED | No aligned multi-measure series with verified axis semantics |
| Scatter | NOT_SUPPORTED | No paired row-level observations |
| Heatmap | NOT_SUPPORTED | No two-dimension grid |
| Treemap | NOT_SUPPORTED | No parent-child hierarchy |
| Funnel | NOT_SUPPORTED | No ordered steps/events |
| Waterfall | NOT_SUPPORTED | No ordered contributions/balance |
| Gauge | NOT_SUPPORTED | No target/threshold contract |
| Pivot Table | NOT_SUPPORTED | No cross-tab aggregate grain |

Unsupported choices stay disabled and show their source limitation. All views/filters continue to call the existing authenticated RPC and current scoped APIs. Personal saved views are stored locally under the current business actor key and contain configuration/filter IDs only; data is re-fetched through existing authorization on load.
