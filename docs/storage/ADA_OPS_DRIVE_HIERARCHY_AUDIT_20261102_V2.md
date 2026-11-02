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

## Related Gemini Batch 01.2 import integrity finding — separate blocker

Gemini reported source branch `gemini/rc19-batch01.2-integrity-gate` and SHA `6b82dae42ca4cb396c21e646aa57eb01c23f2f53`, with 11/11 acceptance, 20/20 regression, typecheck and build PASS reported. The branch and the modified parser/recovery/RPC migration/test files are visible; the exact stated commit SHA was **not resolvable by the GitHub commit endpoint during this audit**, so verify branch HEAD before a release gate. The branch is reported one commit ahead of `gemini/rc19-batch01.1-integrity-fix`.

**Critical integration gap:** Production's actual `shifts_active_slot_uidx` is a **unique index on (brand_id, platform_id, date, start_time, end_time)** excluding archived/deleted. It **does not include studio/campaign/title/shift code**. Gemini's parser distinguishes parallel shifts by studio/campaign/title, but the DB may still reject the second shift; the new `20261102190000_rc19_batch01_1_agency_code.sql` migration does not alter this index. Thus scenario 7/8 cannot be deemed Production PASS without DB-compatible identity/index strategy, existing data integrity migration safety, and PostgreSQL acceptance tests.

The old proposed cleanup SQL referencing nonexistent `shifts.admin_notes`/`schedule_import_batches.notes` is withdrawn. Do not run destructive cleanup; preserve the 52-audit-rows/2-distinct-shift inconsistency for reviewed reconciliation.

## Ownership and release

- Storage runtime: Codex 05A.4.1 / Draft PR #169; import integrity: Gemini Batch 01.2, tracked by #80/#161/#168. Coordinate a single exact SHA integration. No merge/deploy/migration authorization is implied by this documentation PR.
- Legacy folder retention and restricted data security remain mandatory.
