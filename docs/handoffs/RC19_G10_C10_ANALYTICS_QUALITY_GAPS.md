# RC19 G10 / C10 Analytics and Data Quality handoff

Status: **PARTIAL**. Authenticated integration has not been verified.

## Existing behavior

Analytics uses the scoped analytics snapshot for totals, trend, dimensions and previous-period comparison. The BI catalog supplies metric/chart compatibility and keeps unsupported fields unavailable. Brand, Platform, Campaign and date filters, report pagination, drill-down and a permission-gated export already exist. Snapshot results must remain distinct from the current report page.

Data Quality derives diagnostics from complete scoped source reads, failing with `QUALITY_READ_INCOMPLETE` when its 10,000-row per-source bound or completeness checks fail. Its server supports severity and source filters, and the shared pagination contract supports 10/20/50 rows. Total and severity counts represent the whole authorized scope; the page total represents the filtered result. The page already has loading, error, retry and contextual recovery actions.

## G10 changes

Data Quality now reports missing totals metadata as an error instead of presenting zero. The UI labels the filtered total separately from the scope-wide counts and supports List/Card layouts. Search, export and a 100-row page are identified as unavailable under the present contract. No Analytics KPI formula or backend authorization was changed.

## C10 needs

- A scoped search contract covering issue code, entity and description with matching total and pagination semantics.
- Server-authorized export of the same filtered result, with identity and consistency checks; add 100-row pages only if the server supports them.
- Snapshot provenance, freshness and source availability for each metric and comparison period; preserve missing values distinctly from zero.
- A reconciled, versioned Data Quality read model with complete scope, stable pagination and explicit filtered versus scope-wide counts, including behavior above the current scan cap.
- Authenticated role/foreign-Brand denial, session transition, stale response and export acceptance across Analytics and Data Quality.

## Local evidence

- Focused Analytics/Data Quality tests: 20 passed. Selected G5/G8/G9/G11 regressions: 29 passed.
- Mock Playwright: 5 passed (BI at 390/1440 in Vietnamese and English; Data Quality at 320/390/768/1440). Screenshots are retained under `output/playwright/g10-data-quality-*.png`.
- TypeScript and full ESLint passed; ESLint reported 36 warnings. The credential-free production build passed through the existing environment guard. `memory:validate` failed on the pre-existing stale canonical repository HEAD; log retained under `output/playwright/g10-memory-validate.txt`.
- Authenticated API, DB, export and provider behavior remain unverified. A mock browser pass is not a full functional pass.
