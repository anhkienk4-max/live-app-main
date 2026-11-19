# RC19 report storage: agency-aware new-write namespace

Status: **CODE CANDIDATE / PRODUCTION NO-GO**. This changes the planned `domain_first` report route, **not** the Google Drive folders, database migration, Production deployment, credentials or effective ACL.

## Verified existing Drive layout

- Historical root: `LIVESTREAM REPORT`, ID `1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm`.
- **New write root:** `LIVESTREAM REPORT/00_ADA_OPS_PLATFORM`, ID `1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh`.
- **New report parent:** `00_ADA_OPS_PLATFORM/03_LIVE_REPORTS`, ID `19t3RguHpduM9GXBFquCRvUKU4MXmXgtA`.
- Historical `agency snap` remains read-only for existing files. Do **not** create a second historical root, move historical contents, or use the SNAP base ID for AI.
- Folder ACL verification on 2026-11-03: the historical root and `agency snap` expose `anyone:writer`. The new app root also exposed `anyone:reader`. Neither a folder ID nor the metadata registry is sufficient proof of safe runtime writes.

## Proposed new report paths (under verified report root)

The Shift database row is the authority for `agency_code` and `execution_source`:

| Shift agency_code | execution_source | Relative path prefix | Business meaning |
| --- | --- | --- | --- |
| `ada` | `internal` | *(none)* | ADA Internal, preserve established route |
| `snap` | `agency` | `EXTERNAL/SNAP/` | External SNAP |
| `live_ai` | `agency` | `EXTERNAL/AI/` | External AI |
| null/other/mismatched | any | **REJECT** | Never guess a storage destination |

For each destination, append:

`<brand_id>/<platform_id>/<YYYY>/<MM>/SHIFT_<YYYYMMDD>__<shift_uuid>/<artifact_group>`

The exact nine artifact groups remain:
1. `01_KV_BEFORE_LIVE`
2. `02_KV_AFTER_LIVE`
3. `03_DASHBOARD_SUMMARY`
4. `04_DASHBOARD_30MIN`
5. `05_LIVE_SESSION_PHOTOS`
6. `06_OTHER_EVIDENCE`
7. `07_FINAL_REPORT_AND_INSIGHTS`
8. `08_METRICS_DATA_SNAPSHOTS`
9. `09_FILE_MANIFEST_CHECKSUMS`

`00_SHIFT_FOLDER_TEMPLATE` is a schema-only template, **never an upload target**.

## Implementation and test boundary

- `lib/files/operationalAgencyStorage.ts` implements fail-closed normalization from **trusted Shift fields**, not user-entered Brand/Studio labels.
- `lib/server/operationalStorageRouteRepository.ts` prefixes the route. `lib/server/reportArtifactRouteHandler.ts` passes the persisted Shift values to the domain resolver. Unit/integration fixtures assert same Brand+Platform+Shift still produces disjoint SNAP and AI paths, while Internal path is unchanged.
- Existing `canWriteOperationalStoragePlacement` still denies sensitive report artifacts without a verified restricted ACL. This patch does **not** set classifications to `restricted_verified`, activate routes, materialize Drive folders or upload files.

## Follow-up before any actual Drive write

1. **Gate ACL:** verify app runtime identity and effective ancestor/child permissions; remove broad public access only through approved access-change plan (not part of this patch). Keep restricted paths inactive.
2. **Gate real file:** non-sensitive authorized upload → provider ID, exact parent ID, bytes/checksum, durable receipt → logout/re-login → backend readback/checksum and cross-agency denial → audit cleanup.
3. **Gate source ingestion:** `schedule_source` raw Excel may contain mixed ADA/SNAP/AI rows. **Do not assign one Agency to an entire mixed batch based on its first row.** Design source-by-batch authorization and an explicit mixed-agency policy before creating external raw-data routes.
4. **Gate other domain categories:** `04_MEDIA_ASSETS`, `06_ECOMMERCE_INGESTION` and `07_ANALYTICS_BI` currently have shared domain-first routes; extend their server-authorized scopes separately with tenant/Agency checks. This report change is not a claim that every category is isolated.
5. **Gate DB:** update/create forward-only migrations for `ADA/internal` (old CHECK/RPC reject it), then PG17 and Admin/Leader/Member UAT. Avoid silently backfilling historical records.
6. **Gate release:** Codex integrates scoped files into Draft PR #172 and runs exact-SHA CI, configured Preview, restore/rollback rehearsal; Production remains NO-GO.

No UI changes, Google Drive writes, Production SQL or deployments are performed by this branch.
