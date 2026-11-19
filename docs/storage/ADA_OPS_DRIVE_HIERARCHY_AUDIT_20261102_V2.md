# RC19 Physical Drive Hierarchy Audit — 2026-11-02

Status: **PARTIAL / Production NO-GO**. This is an inventory of physical folders, not evidence that application upload routing or restricted access is functional.

## Verified physical inventory

- Canonical new-data root: `00_ADA_OPS_PLATFORM` (`1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh`).
- Historical `LIVESTREAM REPORT` root (`1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm`) is **legacy read-only** for new app assets. Do not move/delete historic folders.
- Original registry: **93/93** folder IDs verified under expected parents.
- Additional **55** folders created in user chat on 2026-11-02: 31 HR child classifications, 8 `2026` Payroll year folders and 16 October/November period folders (8 categories x 2 months). Physical total in reconciled registry: **148**.
- Follow-up audit checked all **78 original registry leaf folders**: 70 had no children/files, 6 HR leaves had newly created child classification folders, and 2 System Operations leaves had items (route documents and test-only UAT folder). This count refers to **original registry leaves**, not the expanded 148-folder graph.
- Updated physical ID index: [ADA_OPS_FOLDER_REGISTRY_20261102.json](./ADA_OPS_FOLDER_REGISTRY_20261102.json).
- The added 55 records use `restricted_pending_app_acl_verification`; this is not a claim of verified confidentiality. Direct HR metadata reads showed owner-only permissions on checked folders but inherited/effective app-OAuth access is not E2E verified. Do not upload real check-in photos, salaries, payroll, contracts, PII before the approved authorization gate.

## Thirteen domain hierarchy gates

| Domain | Existing fixed classification folders | Still missing / not verified |
|---|---|---|
| 01 SCHEDULE_IMPORT_EXPORT | 6 | brand, year/month, import batch, source/normalized/export version |
| 02 SHIFT_STAFFING | 5 | brand, platform, year/month, parent shift, staffing segment |
| 03 LIVE_REPORTS | 5 + 9 evidence template subfolders | real `brand_id/platform_id/YYYY/MM/<code>__<shift_uuid>/9 evidence categories` per live shift; template must remain empty |
| 04 MEDIA_ASSETS | 8 | brand, platform, campaign, period, asset/version |
| 05 BRAND_CATALOG | 5 | brand/product/SKU/version |
| 06 ECOMMERCE_INGESTION | 5 | platform, brand, period, batch and checksums |
| 07 ANALYTICS_BI | 5 | brand/platform/period/metric/report snapshot |
| 08 HR_RESTRICTED_PENDING_ACCESS | 6 + 55 additional nested folders | checkin/checkout by real shift/staff, actual-hours final review, per-user pay slips, full period lifecycle; ACL must be verified |
| 09 SYSTEM_OPERATIONS | 8; registry files and test-only folder | environment/release/run/recovery hierarchy |
| 10 AI_AUTOMATION_KNOWLEDGE | 6 | project/agent/task/version |
| 11 CONTRACTS_FINANCE_RESTRICTED | 4 | authorized vendor/year/contract/SOW/acceptance/payment instances with restricted access |
| 12 ARCHIVE_IMPORT_LEGACY | 3 | legacy source/period/migration-batch mappings |
| 13 OPERATIONS_SUPPORT | 4 | team/process/version |

Some dimensions are category-dependent. Do NOT build a duplicate global Brand-first tree under the app root. Folder creation must use **domain-first category routes** and dynamically create only branches justified by actual business objects.

## Production evidence — READ-ONLY on 2026-11-02

- `public.operational_storage_routes`: **0 rows**.
- `public.operational_files`: **0 rows**.
- Therefore: no verified active application-level routing, file persistence, authenticated real-upload/download readback, provider parent-ID and SHA-256 verification, or restored-access UAT. Do not close #97/#98/#165 or mark Storage PASS based on Drive folder count.
- Use existing separate Google Drive test-only folder for admin-only, authenticated, rate-limited synthetic content after backup/security gates. This document makes **no DB changes, deployment, raw uploads, or folder moves**.

## Dynamic provisioning acceptance

1. Input: authorized category + `brand_id` + `platform_id` + actual `parent_shift_id` and date/period + subtype (`staff_id`, `campaign_id`, batch, vendor when applicable).
2. Resolve canonical domain folder by verified ID; create/get child only via exact `parent_id` + normalized validated name; use stable UUID/business key; no overlapping duplicate tree and no guessed backfill.
3. For a real live session: `03_LIVE_REPORTS/<brand_id>/<platform_id>/<YYYY>/<MM>/<human_code>__<shift_uuid>/<one of nine categories>`; one parent shift shared across report, KPI, attachments; staffing segments are children in the business model, not duplicate live shifts.
4. Persist provider `file_id`, `folder_id`, checksum, effective access classification and object link in Supabase metadata only. File bytes remain on Drive.
5. Verify app OAuth can upload/read back/delete only a non-sensitive synthetic test asset; check SHA256, actual parent ID and unauthorized denial. Support large-file resumable upload and orphan reconciliation.
6. Keep attendance evidence, staff personal records, pay statements and finance strictly gated by effective ACL, app RBAC/ABAC, reviewer separation and restore tests; no public Drive URLs for sensitive user access.
7. Validate against authenticated Production-safe tests before enabling route writes.

## Sensitivity, Drive ACL and app permission gates

These are separate checks. A route is writable only when the file category permits it, every registered ancestor has an approved ACL classification, the exact Drive destination reports `capabilities.canAddChildren=true`, and the caller is allowed to perform the requested operation within the verified application resource scope. `restricted_pending_app_acl_verification` records an unresolved review state and never grants access. The source-upload API marks a receipt `provider_verified` only after it re-reads the Drive object and validates its parent, byte count and SHA-256; the database status by itself is not provider evidence.

| Data | Route and sensitivity disposition | App access disposition |
|---|---|---|
| Schedule source Excel | `schedule_source` is explicitly `sensitive=true`; shared and pending ACL routes reject it. The API ties the source to an Excel batch owned by the actor and requires Drive readback before confirmation. | Import permission plus batch ownership; source read is restricted to the batch creator. |
| Raw TikTok/Shopee reports | Physical IDs are recorded in the route map, but no standard category route currently provisions them. No upload route is active. | Remains unavailable until an approved category, ACL and scope policy are defined. |
| Dashboard images and report evidence | `live_snapshot` and all nine report artifact groups are sensitive and require `restricted_verified` across registered ancestors. | Operational-file downloads stream through the authenticated API. |
| Attendance photographs | Existing self-attendance workflow uses its own shift/staff verification and feature gates. The 55 new HR folders remain inactive pending ACL review. | Existing photo workflow is not activated against the new HR registry by this change. |
| Payroll statements and rate cards | The additional HR/Payroll registry entries are `restricted_pending_app_acl_verification`, `active=false`; no payroll statement category route is mapped. | No upload route is enabled for these folders. |
| Contracts and payments | `acceptance_document` and `payment_document` are sensitive. Payment writes also require Admin permission and the confidential-write approval flag. | Scope checks remain in the existing file API. |
| System backups and exports | `system_export` is sensitive and targets the System Operations domain; the new storage gate rejects it until every ancestor is restricted and verified. | Admin-only operation plus the confidential-write approval flag. |

Application reads of operational files use `/api/operational-files?file_id=...` and return bytes from the server after actor and scope checks, provider-parent validation, and checksum verification. Large/native Drive files return an error until authenticated streaming/export is implemented. The API does not return a Drive URL for private reads. Members and Leaders need an approved/manual assignment to the exact shift. Brand/period-only scope is denied for non-Admins; Leader Brand/team authorization remains blocked on the missing authoritative mapping from Issue #104. Admin permissions do not change the mandatory Drive ACL gate.

The route map's verified Drive write capability is checked on the exact target folder, and upload flows read the stored bytes back. Effective read ACLs for the runtime OAuth identity, including inherited ancestor permissions, have not been verified by authenticated app E2E in this batch. Keep sensitive destinations blocked until Owner ACL review and a real runtime readback test are recorded.

## Related Gemini Batch 01.2 import integrity finding — separate blocker

Batch 05A.4.2 fetched `origin/gemini/rc19-batch01.2-integrity-gate` and resolved it to `6b82dae4e08976ad59c87f7fafda2a0188f919d4`, one commit after `4326833c72f16fdae525a27db3040a202bfbc24f`. The earlier full SHA recorded above (`6b82dae42ca4cb396c21e646aa57eb01c23f2f53`) does not match the fetched ref and must not be used as provenance. The commit changes the parser, recovery, Supabase shift service, agency migration, and acceptance test. It merged cleanly in the local Batch 05A.4.2 integration worktree; the integrated gates remain subject to current test results.

**Critical schema gate from the read-only audit:** Production was reported to have a unique index on `(brand_id, platform_id, date, start_time, end_time)` excluding archived/deleted, without `studio/campaign/title/shift code`. Gemini's parser distinguishes parallel shifts by those qualifiers, but the database may reject the second shift; the new `20261102190000_rc19_batch01_1_agency_code.sql` migration does not alter this index. This was not re-queried against Production during Batch 05A.4.2, so it remains a documented blocker to verify before release. Do not claim scenarios 7/8 as Production PASS without database-compatible identity/index strategy, data-integrity migration safety, and PostgreSQL acceptance tests.

The old proposed cleanup SQL referencing nonexistent `shifts.admin_notes`/`schedule_import_batches.notes` is withdrawn. Do not run destructive cleanup; preserve the 52-audit-rows/2-distinct-shift inconsistency for reviewed reconciliation.

## Ownership and release

- Storage runtime: Codex Batch 05A.4.2 local integration branch `codex/rc19-batch05a42-storage-integration`, integrating Gemini Batch 01.2. Draft PR #171 remains unchanged at its original `e8cc213b` head; this local integration has not been pushed or opened as a PR. PR #169 remains unchanged. No Production migration is authorized by this documentation.
- Legacy folder retention and restricted data security remain mandatory.
