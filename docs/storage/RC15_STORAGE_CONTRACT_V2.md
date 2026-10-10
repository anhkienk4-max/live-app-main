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

## Confidential provider write hold (release safety)

Admin RBAC by itself does not secure the external Google Drive/OneDrive
destination. The Production `LIVESTREAM REPORT` root was observed to have
`anyone:writer` and the owner explicitly deferred permission changes.
Therefore **new** `payment_document` (Finance) and `system_export` writes
are now **blocked by default at the server** — including multipart upload,
existing-provider-ID attachment and on-demand System Export generation.
The gateway returns HTTP 423 with
`OPERATIONAL_FILE_CONFIDENTIAL_STORAGE_NOT_APPROVED` before uploading, linking
or retrieving sensitive export rows. Admin UI also disables the relevant
write actions and explains the hold. Existing records remain readable and
deletable by authorized roles, to preserve cleanup and migration options.

A separate operator-reviewed production release must assess actual destination
permissions and set `STORAGE_CONFIDENTIAL_UPLOAD_APPROVED=true` only after
the provider/root ACL meets the approved confidential-document policy.
This environment flag is an **approval assertion, not a technical ACL
verification** and must not be enabled simply to silence HTTP 423.
It does not alter ACLs, grants or provider files. General operational
file categories remain available under their separate role and route checks.
This flag covers only the two confidential categories above; other files may
still be sensitive depending on content and must be assessed before UAT.

## Admin scoped System Exports (code staged, NOT physical UAT)

The `/storage` Admin-only action `generate_system_export` builds a **daily, brand/platform/execution-source scoped JSON snapshot** from the canonical Supabase database. It contains full structured rows from `shifts`, `reports`, `dashboard_updates`, `report_images`, `live_report_images` and `stored_files` (metadata only, no media binaries), with per-table counts. It preserves all currently stored metric dictionaries and OCR fields in those rows. This is NOT a full Supabase SQL backup, is NOT a background scheduled backup, and is NOT a restore mechanism.

Fail-closed behavior: Admin role only; server resolves exact brand/platform/date; report/evidence rows must be linked to those shift IDs; per-table 1,000-row boundary and 4-MiB output boundary abort instead of claiming completeness. Repeated generation of identical data reuses checksum-scoped provider metadata and avoids duplicate uploads. Snapshot content is deterministic, so changed source data produces a new checksum rather than silently overwriting the previous file.

Provider destination: canonical `SYSTEM/EXPORTS` under configured Brand/Platform/Month; Supabase `operational_files` holds metadata with `integrity_status=sha256_verified`.

**Security hold:** the root Drive folder still has an openly writable ACL per owner's deferment. Do not treat system exports containing live revenue, OCR or private business evidence as cleared for unrestricted production deployment; gate this separately from code test PASS.

## Raw schedule workbook safety

Auto-archive writes only normalized per-brand/per-platform/month/execution-source JSON previews. **It never copies the raw Excel workbook to a brand folder**, even when preview rows resolve to a single brand. The original may contain hidden sheets, unrelated cells, or embedded objects from other brands. A dedicated Admin neutral vault plus full workbook security audit is needed before retaining mixed-brand originals.

## Large video evidence policy

The app currently supports direct provider upload plus exact-parent ID attachment for large video. It does **not** implement an app-hosted resumable/chunked video uploader. Linked files are tagged `integrity_status=provider_reference` because provider ownership/path and MIME/size are checked but bytes SHA-256 are not verified. Before release, perform actual large-file readback and permission test on the configured provider.

## Legacy storage coexistence (RC1.5 code staged)

Legacy Dashboard, Live Visual, DATA/SOURCE and DATA/REPORT continue to resolve
using their original approved legacy route profile, label mapping and period
naming. **Never migrate or rearrange existing folders merely to enable V2.**

For 15 *new* V2 file categories on existing legacy routes, placement is
deliberately rooted at the route's verified Google Drive root and uses a
non-overlapping, ID-isolated namespace:

`<Drive root>/ADA_STORAGE_V2/<brand_id>/<platform_id>/<INTERNAL|AGENCY>/<legacy period label>/<V2 category path>/...`

This is logical storage separation by verified database IDs, **not security
isolation by Drive ACL**. It does not justify putting sensitive Finance/System
Export files on a root with `anyone:writer`. Never claim V2 Production release
secure before access controls are reviewed.

Admin `/storage/setup` can now register exact root, base folder, period
naming and category labels after physically reviewing **three legacy profiles
without subbrands**:
- `LEGACY_CATEGORY_PERIOD`
- `LEGACY_PLATFORM_CATEGORY_PERIOD`
- `LEGACY_PERIOD_CATEGORY`

The read-only Production Drive inspection found historical month labels that
vary even inside a single existing brand group. The route table now stores
`period_label_overrides` and `folder_label_overrides` as JSONB, and the route
repository selects both. Admin setup accepts exact monthly exceptions as
`YYYY-MM=Historical folder name` rows. **Before submitting a legacy route**, the
UI calls `preview_legacy_route` for a selected sample date: the server checks
verified root and base folder ancestry and computes expected Dashboard, Visual,
DATA/SOURCE, DATA/REPORT and V2 paths without creating folders or modifying DB.
The UI invalidates a previously approved preview if any route input changes.
This preview does **not** prove that every historical category/month folder
physically exists. The operator must inspect the actual provider tree for each
required month. No invented route seed should be committed.

The sampled metadata audit is in
`docs/storage/RC15_PRODUCTION_DRIVE_TOPOLOGY_READONLY.md`. It intentionally
omits raw provider IDs to avoid exposing broad-access Drive locations in
version-controlled release documentation.

For historical P-period folders spanning different months (e.g.
`P5 | 20/04 - 16/05`), a `YYYY-MM` period-name override is insufficient.
The staged route metadata now also supports **`period_date_ranges`**, an array
of explicitly verified inclusive `start_date`/`end_date`, the exact legacy
folder `label`, and a required logical `category` (Dashboard, Visual,
DATA/REPORT or DATA/SOURCE). Date ranges for the **same category** must not
overlap; invalid calendar dates, unknown categories and traversal labels are
rejected. A date-range match takes precedence over monthly label overrides,
but applies **only to that category**; every other category retains its own
verified month label. This allows a Dashboard P5 folder without silently moving
DATA/SOURCE from its month-based location. The Admin route preview verifies
the chosen date's planned paths; it does not assert that every historic folder
physically exists. No P-period label or dates are seeded by AI.

A read-only inspection of the current Supabase schema found no authoritative
subbrand/product-line table or column. Accordingly, the two subbrand legacy
profiles remain unsupported in the operational file upload path, and must not
fall back to an arbitrary brand-level or NULL-subbrand route.

The two subbrand-based legacy profiles remain **unsupported by the Admin
registration path**: the current file scope does not carry a verified
`subbrand_key`, and guessing it could mix different brands' evidence.
They are fail-closed pending an explicit subbrand association model and physical
mapping review. All legacy categories require precise label strings; the
existing base folder must be verified under the configured root by following
provider parent IDs, with cycles, missing parents and unrelated folders denied.

## Locked dependencies — fixed in CI

The workspace security setting `minimumReleaseAge: 1440` was not honored
by the old pinned pnpm 9.15.9 in this PR's CI gate (unsupported feature).
`allowBuilds` likewise requires a newer pnpm.
CI is now pinned to **pnpm 10.26.0** with `pnpm install --frozen-lockfile`;
the application `packageManager` field is set to the same version.
Do not weaken `minimumReleaseAge`, `allowBuilds`, or freeze checks for release.
The 81 overrides in workspace and lockfile were independently compared and
found to match; no gratuitous full-lockfile re-resolution was necessary.

## Admin operator-controlled configuration gateway (code staged, no Production writes)

Admin-only `/storage/setup` and `/api/operational-storage-setup` have been staged to close
the route/source preparation workflow **after** migrations are reviewed and applied:

- Read-only inventory detects missing prerequisite columns/table and shows confirmed routes, brands and paginated unclassified shifts with an exact count. It displays an explicit schema blocker rather than silently substituting a storage provider.
- Brand profile approval: only an unclassified `NULL` profile may be explicitly set to `CANONICAL_V1` after an operator has inspected Drive folder structure. Legacy profiles are never overwritten; no automated classification of historic brands. Approval is attributed with `storage_profile_reviewed_by` and timestamp.
- Route approval: exact Google Drive root folder ID must equal the server-configured root and must resolve to a provider folder; explicit Brand + Platform + execution_source, active exact-key conflict rejected. No guessed root, wildcard, folder creation or public-ACL mutation. `approved_by` and `approved_at` stored on the route.
- Existing Shift source approval: one selected shift only, explicitly verified `internal` or `agency`, optimistic version must match. Routed through the **authenticated user's** `update_shift` RPC to preserve actor attribution, lifecycle and CAS; never through direct service-role SQL UPDATE. The UI supports paginated review; does not attempt bulk backfill of 771 historic shifts.
- Every write requires a mapped Admin business-user identity plus a distinct human confirmation. Leader/staff users cannot view or call setup actions.
- Legacy folder layouts are deliberately **not** converted to the canonical V2 tree by this interface. Canonical file-vault route activation remains conditional on actual folder layout verification and explicit operator confirmation.

The gateway remains unexercised on physical Google Drive and Supabase Production.
**Do not infer that seeing the setup UI implies migration applied or storage ready.**

## Production schema reconciliation — mandatory release blocker (read-only audit 2026-10-11)

The actual Supabase project `egdjnpmoasarrttvhgds` has the RC1.4 migration recorded, **but not RC1.3A**. It lacks `operational_storage_routes`, `shifts.execution_source`, and `brands.storage_profile`. Current `create_shift` and both `update_shift` overloads also lack `execution_source`. Production currently has **771 shifts and 15 brands**; none of those historical shifts can safely be auto-classified from the existing schema. `operational_files` is also absent, as expected for the staged V2 release. Therefore Storage V2 **must not be deployed** solely on green TypeScript/CI tests.

Staged **forward-only migration order** (none applied on Production):

1. `20261008090000_rc15_storage_route_prerequisites.sql`: adds nullable `shifts.execution_source` and `brands.storage_profile`, creates restricted `operational_storage_routes` with exact-key uniqueness, **no route seed/backfill**. Does not touch existing RPC bodies.
2. `20261008093000_rc15_shift_rpc_compatibility.sql`: built from actual current Production `create_shift` and both `update_shift` definitions, with explicit MD5 guards. Only adds `execution_source` allowlist, validation and insert/update persistence. Retains existing status guards, audit actor and optimistic concurrency. Aborts on definition drift to avoid overwriting later changes.
3. `20261009000000_rc15_operational_files.sql`: metadata-only file registry, constrained category, provider, SHA-256/reference flags, indexes and RLS.

The isolated CI fixture `tests/fixtures/rc15_production_shift_rpc_baseline.sql` is a **copy of the function definitions only**, no customer data. CI validates the prerequisite twice, the guarded RPC patch once, and the metadata migration twice. This is **not a Production migration**.

**Operator approval is still necessary** to classify required existing shifts and assign route keys, brands' correct `storage_profile`, execution source, parent folder IDs and isolation. No code can safely infer those decisions. Do not seed `internal` indiscriminately or write folder IDs guessed from names. Review Drive `anyone:writer` access separately before uploading sensitive evidence.

The repeatable read-only readiness query is `scripts/storage/rc15-production-readiness.sql`. Current result: **BLOCKED_DO_NOT_DEPLOY_STORAGE_V2**. Route mappings and missing execution source must be reviewed after migrations and before the consolidated physical UAT.

## Upload race safety

When two simultaneous requests upload the same bytes and a provider returns an identical existing external ID, the failed metadata insert path must **not move the winner's file into Trash**. Only an object with a different ID from the metadata winner may be cleaned up. An explicit regression test exercises this path.

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
