# Storage Contract V2 — code-first rollout, one consolidated UAT

Status: **DRAFT / NOT DEPLOYED**. Applies to PR #24 branch `fix/rc14-data-report-export-fidelity`.

## Invariants
1. **Supabase** stores structured operational metrics, foreign keys, artifact metadata, checksum/reference, status. **Drive/OneDrive** stores all binary file content.
2. Never write file binary, base64 or unsigned arbitrary folders to Supabase. Do not reapply RC1.4 migration.
3. Match the configured brand/platform/date/execution-source route exactly. V2 categories derive from the existing `data_source` canonical route only for `CANONICAL_V1` / `TEMP_AGENCY_BRAND_PERIOD_CATEGORY`. Legacy profiles fail closed unless explicitly designed/configured.
4. Uploaded bytes: SHA-256, checksum-scoped idempotency, exact parent folder and soft-delete. Provider-linked external objects: verify exact parent, provider file metadata and ID; `integrity_status=provider_reference` and no claimed SHA-256.
5. Server checks auth/role on **all** list/read/attach/upload/delete endpoints. Only Admin accesses Finance and System Export. No anonymous or raw client access to the database table.
6. Provider delete moves objects to provider Trash where supported; metadata soft-delete comes afterward. Failure midway requires reconciliation.
7. Avoid changing real report metrics, current UAT report, migrations, Drive ACL or sharing configuration before the consolidated test window.

## File groups

Existing operational writers (RC1.4): `DASHBOARD`, `VISIBILITY` (`key_visual`, `live_session`, `other`), `DATA/SOURCE`, `DATA/REPORT`.

V2 canonical relative folders under `Brand/Platform/THÁNG MM.YYYY/`:

| Category | Relative folder | Entry mode |
|---|---|---|
| schedule_source | OPS/SCHEDULE/SOURCE | Workspace upload / provider link |
| schedule_export | OPS/SCHEDULE/EXPORT | Workspace upload / provider link |
| live_snapshot | DATA/SNAPSHOTS | Workspace upload / provider link |
| video_recording | VIDEO/RECORDING | Small upload / large provider link |
| video_livecut | VIDEO/LIVECUT | Small upload / large provider link |
| production_asset | PRODUCTION/ASSETS | Workspace upload / provider link |
| content_script | CONTENT/SCRIPT | Workspace upload / native Docs link |
| content_brief | CONTENT/BRIEF | Workspace upload / native Docs link |
| campaign_document | CAMPAIGN/DOCUMENTS | Workspace upload / native Docs/Sheets link |
| staffing_document | OPS/STAFFING | Workspace upload / native Sheets link |
| acceptance_document | DELIVERABLES/ACCEPTANCE | Workspace upload / provider link |
| payment_document | INTERNAL/FINANCE | **Admin-only** workspace upload/link |
| ai_output | AI/OUTPUTS | Workspace upload / provider link |
| system_export | SYSTEM/EXPORTS | **Admin-only** workspace upload/link |
| sop_document | DOCUMENTS/SOP | Workspace upload / native Docs link |

**Schedule Import integration (staged in this PR):** after a batch reaches confirmed or retryable completion, the app attempts to archive the reviewed preview as JSON files partitioned by exact brand/platform/month/execution-source. The original Excel is additionally archived only if **all parsed rows** resolve to one scope and the upload fits 4 MiB. In mixed-brand files, the original shared workbook is **not** copied into any brand folder. If some rows lack valid scope, the app explicitly reports them as not archived. Storage failure never reverses/import-fails previously created shifts and the completion surface offers an idempotent retry. This is not yet verified on physical Drive. Remaining risks: non-schedule/hidden workbook content cannot be proven to belong to the parsed brand from preview rows alone; the original-Excel single-scope path needs stronger all-sheet inspection before full release.\n\n**Not automatic yet:** source uploads from remaining Production/Content workflows; app-native large-file resumable uploads; an Admin-only neutral vault for raw mixed-brand schedule files. The current large-file workflow is provider folder preparation and verified provider-ID attachment. The present large-file workflow is: app prepares provider folder → authorized operator uploads directly on provider → operator attaches provider file ID → server confirms the exact folder. The app never claims checksum integrity for these linked files.

**Upload limit:** 4 MiB per app multipart request, constrained by serverless request limits. This must not be advertised as a bulk video uploader. Google Workspace native Docs/Sheets/Slides can be indexed as provider links without pretending to have downloadable binary or known byte size.

## Campaign-Scoped Content and Production files (staged in PR #24)

The Campaign Details page now opens `/storage?campaignId=<id>&category=<category>` for
Campaign Brief, Script/Caption, Content Plan, Production Assets and Livecut.

- The API always resolves `campaign_id` against canonical `campaigns.brand_id`.
- The requested platform must match a declared campaign platform, if configured.
- The requested period date must lie within the campaign start/end range.
- The upload key and metadata include the campaign ID, so files for campaigns
  within the same brand, platform, month and provider remain logically separate.
- The UI is visible to Leader/Admin only; Finance and System Export stay Admin-only.
- This integration is **contextual upload/linking**, not automatic capture of every
  creative or content editor. The current application has no independent
  Content/Production asset editing workflow connected to a file picker.
- Campaign bulk Excel imports can contain multiple brands; no raw bulk source
  is automatically written to a per-brand folder.

## Admin scoped System Exports (code staged, NOT physical UAT)

The `/storage` Admin-only action `generate_system_export` builds a **daily, brand/platform/execution-source scoped JSON snapshot** from the canonical Supabase database. It contains full structured rows from `shifts`, `reports`, `dashboard_updates`, `report_images`, `live_report_images` and `stored_files` (metadata only, no media binaries), with per-table counts. It preserves all currently stored metric dictionaries and OCR fields in those rows. This is NOT a full Supabase SQL backup, is NOT a background scheduled backup, and is NOT a restore mechanism.

Fail-closed behavior: Admin role only; server resolves exact brand/platform/date; report/evidence rows must be linked to those shift IDs; per-table 1,000-row boundary and 4-MiB output boundary abort instead of claiming completeness. Repeated generation of identical data reuses checksum-scoped provider metadata and avoids duplicate uploads. Snapshot content is deterministic, so changed source data produces a new checksum rather than silently overwriting the previous file.

Provider destination: canonical `SYSTEM/EXPORTS` under configured Brand/Platform/Month; Supabase `operational_files` holds metadata with `integrity_status=sha256_verified`.

**Security hold:** the root Drive folder still has an openly writable ACL per owner's deferment. Do not treat system exports containing live revenue, OCR or private business evidence as cleared for unrestricted production deployment; gate this separately from code test PASS.

## Raw schedule workbook safety

Auto-archive writes only normalized per-brand/per-platform/month/execution-source JSON previews. **It never copies the raw Excel workbook to a brand folder**, even when preview rows resolve to a single brand. The original may contain hidden sheets, unrelated cells, or embedded objects from other brands. A dedicated Admin neutral vault plus full workbook security audit is needed before retaining mixed-brand originals.

## Large video evidence policy

The app currently supports direct provider upload plus exact-parent ID attachment for large video. It does **not** implement an app-hosted resumable/chunked video uploader. Linked files are tagged `integrity_status=provider_reference` because provider ownership/path and MIME/size are checked but bytes SHA-256 are not verified. Before release, perform actual large-file readback and permission test on the configured provider.

## Database migration safety

The staged RC1.5 migration was found malformed during review and was repaired.
The CI code gate now runs this exact migration twice against an ephemeral PostgreSQL 16
instance with Supabase-style `anon` and `authenticated` roles, verifying the
`integrity_status` column and enabled RLS. This is not a Production migration
execution, and passing SQL validation does not replace an environment-specific
preflight for FK compatibility, configured routes and release safety.

## Consolidated gate (run once after coding is ready)
- Gate 0: GitHub PR, typecheck, focused RC1.4/RC1.5 tests, build, migration SQL review, diff-check. No migration execution until tests PASS.
- Gate 1: check production provider/OAuth, target domain/commit, root access and route configuration; record baseline metadata/provider objects.
- Gate 2: DATA/SOURCE CRUD and delete/Trash, DATA/REPORT Excel 4 sheets with Shopee/TikTok semantics, version-idempotency, download, cleanup.
- Gate 3: DASHBOARD + VISIBILITY three categories CRUD/read/idempotency/cleanup.
- Gate 4: Schedule Import auto-archive across single-brand, multi-brand, mixed-month and partial-invalid preview fixtures; verify raw Excel never lands in another brand folder, partial-failure alert, idempotent retry. Then each of 15 V2 categories: canonical path, MIME restrictions, upload/provider-link, metadata integrity status, same-file retry, download, delete, provider folder readback.
- Gate 5: auth: anonymous/member denied; leader/admin allowed operational categories; Finance/System Export admin-only; wrong-parent provider link rejected; wrong brand/platform/shift context rejected.
- Gate 6: native Docs/Sheets/Slides, ZIP system export, small video, large video via provider-link. Explicitly record unknowns if OneDrive is unconfigured.
- Gate 7: final cleanup and restore; no real report metrics or production records may be modified beyond controlled fixtures. Check orphan provider objects, DB soft-delete and trash consistency.

**Release closure** requires physical provider readback, exact folder, single active object per artifact key, consistent DB references, correct role boundaries, no binary metadata, zero leaked cross-brand evidence, no orphan uploads, and no corruption.

## Known deferred security item

The Google Drive root `LIVESTREAM REPORT` currently has an `anyone:writer` ACL. The owner requested to defer the permission change. Keep this as an explicit **security risk**, do not silently close a general-production release or upload confidential brand/finance material until the intended access policy is reviewed and corrected.

## Operational notes

- Production branch stays untouched until code review and validation pass.
- Production RC1.4 migration already applied; **never reapply**.
- V2 migration `20261009000000_rc15_operational_files.sql` exists in the branch, **not applied**.
- The `/storage` workspace is visible only for Leader/Admin and can also be opened in the context of a specific shift from the report editor.
- Use one consolidated evidence log per artifact type/brand/platform/provider during UAT, rather than many ad hoc tests and early PASS declarations.
