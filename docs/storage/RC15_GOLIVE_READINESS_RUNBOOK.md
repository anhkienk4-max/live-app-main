# RC1.5 Storage V2 — Go-live Readiness & Rollback Runbook

**Status:** PRODUCTION SCHEMA MIGRATED / **NO-GO** for app deployment until physical UAT and release gates are approved.
**Date:** 2026-10-11 (Vietnam). **PR:** #24 (draft).
**Invariant:** LIVESTREAM REPORT is already the ADA root. **Never create another ADA folder.**
Do not move, rename, delete or backfill historical Drive objects. Keep `agency snap` in place.

## Source-of-truth scope observed (READ ONLY)

- Production web alias: `https://ops5729.top` (currently `main` SHA `31efea2d1a60583975e96773f68106d46ab7d8d9`).
- Supabase project `egdjnpmoasarrttvhgds`: RC1.5 prerequisites, 3 Shift RPC updates and the operational file registry were applied on 2026-10-11. On post-migration audit: 0 active routes, 0 file metadata rows, 0 classified shifts, 0 classified brands. Tables have RLS and deny direct anon/authenticated access.
- Existing Drive root: LIVESTREAM REPORT. Existing Opella/Mars/Marico/KAO/PepsiCo/Female AI and agency snap retain their Folder IDs.
- The previously created empty ADA duplicate tree was deleted. Do NOT recreate it.
- LAYS was placed within the existing PEPSICO - LS Report folder. LASHE standalone empty folder was deleted; the existing MARICO / FEMALE - LS Report branch is its reporting folder.
- ASM AI Livestream (database Brand `yhm0h5bog`) and Male AI Livestream (`pf241nq32`) both have Shopee Live (Platform `p2`) September 2026 shifts.
  Their **already-existing** Drive brand folders are direct children of LIVESTREAM REPORT, and their verified structure is:
  `<Brand Folder ID>/2026/THÁNG 09.2026/SHOPEE_LIVE/{DASHBOARD,VISIBILITY,DATA/{REPORT,SOURCE},...}`.
  Do NOT use canonical V1's wrong root/brand/platform/month order for them.

## Release schema sequence (executed 2026-10-11, all 3 SUCCESS)

**Preflight/read-only:** Run `scripts/storage/rc15-production-readiness.sql` and inspect RPC definition MD5 digests.
Record schema table/column existence and current count of `operational_files`. Capture branch HEAD and last Production deployment.
Back up current schema and current public Shift RPC definitions using approved DBA export; **never log secrets**.

1. Applied `20261011091925_rc15_storage_route_prerequisites.sql`. Additive nullable columns and protected route metadata, with **no auto brand profiles, no route seeds, no shift backfill**. The existing-brand route profile is allowed, but must be human approved.
2. Verified all original Production RPC MD5s; applied `20261011092015_rc15_shift_rpc_compatibility.sql`. Aborts on drift. Preserve current role and optimistic concurrency.
3. Applied `20261011092051_rc15_operational_files.sql` metadata-only registry.
4. Rerun read-only schema readiness. Verify RLS/GRANT scope, active routes initially empty and all historical Shift sources still NULL. **If mismatch: stop.**
5. Verify configured provider environment variables (do not print decrypted values), Drive OAuth access and **configured Drive root ID** matches LIVESTREAM REPORT. Do not silently switch to a static fallback.
6. Deploy a protected UAT/Preview with exact tested PR commit, **not straight to Production**; confirm role Admin and blocked unauthenticated routes.

## Explicit operator approval — NO automation

On `/storage/setup`, for ASM and Male only:
- Classify brand profile as `EXISTING_BRAND_YEAR_PERIOD_PLATFORM` after comparing provider IDs. Do not classify all 15 brands as canonical.
- `register_existing_brand_route` must verify real provider parent chains `LIVESTREAM REPORT → Brand → 2026 → THÁNG 09.2026 → SHOPEE_LIVE`.
  Root, brand, year, month, platform IDs must be copied from actual Drive; no folder will be created during route registration.
- Select appropriate `internal` vs `agency` only after confirming the source for each Shift; do not auto-classify all old shifts. Keep agency snap separate and unchanged.
- Register **one narrow test route**; no other active write routes until physical UAT passes.
- Legacy routes remain tied to their original Base Folder IDs and date/period labels. No bulk migration. Unverified subbrand remains fail-closed.

## One consolidated physical UAT (test-only artifacts, then cleanup)

Use a new synthetic/test-only Shift and benign file bytes, a single confirmed brand, Platform `p2`, September 2026, and a verified source. Record test Shift ID, provider parent ID, file ID and metadata row ID. Avoid customer data.
Check in one session:

1. Admin, Leader, Staff, unauthorized behavior / login.
2. Exact path and no new `ADA`, duplicate brand, or duplicate `THÁNG 09.2026` folder.
3. Dashboard, Visibility, DATA/SOURCE and DATA/REPORT reading/reopen/download, 15 Operational File categories with supported MIME; list after reload.
4. Provider file physical parent ID, checksum (when app uploads), metadata DB `operational_files` integrity, idempotent repeated upload and provider ID reuse; file provenance and retrieval after reconnect.
5. Existing large MP4 reference in **verified correct parent** uses native provider-view rather than buffering bytes; do not upload a huge MP4 through serverless.
6. Finance/System Export must return HTTP 423 unless a separate confidential-safe Drive destination and explicit authorization have been approved. **Do not turn on the override** with current broad root sharing.
7. Delete/Trash a unique disposable test file through app. Verify provider removal and database soft delete. Re-run counts and restore original test record states where applicable.
8. No changes to any historical file path, old Dashboard/Visibility folder, old agency snap, actual brand evidence, or business Shift.

Success requires API + browser + provider + DB recorded evidence with all checks PASS, **not** only unit tests.

## Release/rollback decision

**GO only if:** all CI checks green on the exact deployment commit, migration chain verified, provider root/profiles/route approved, no unintended folder creation, physical UAT PASS, role access checked and original business data untouched. Confidential Finance/System Export stay locked until a separate ACL review.

**On failure:** stop writes; roll back the Vercel deployment to the recorded prior Production `main` deployment; disable/delete ONLY new RC1.5 active test routes using an explicit, reviewed procedure; preserve metadata rows and externally stored evidence for forensic reconciliation. **Do NOT automatically drop tables/columns or delete Drive folders/files**—schema downgrade could lose data. Compare initial/final provider+DB counts and document any differences. Re-run Production read-only health checks. ACL permission changes are out of scope unless separately approved.

**Explicit unresolved items:** Production migration authorization, source classification for historical Shifts, dedicated ACL plan for Finance/System Export, staging environment verification, physical UAT and formal go-live acceptance.

## Applied Supabase migration ledger (verified)

| Production version | Supabase name | Status |
|---|---|---|
| 20261011091925 | rc15_storage_route_prerequisites | Applied |
| 20261011092015 | rc15_shift_rpc_compatibility | Applied |
| 20261011092051 | rc15_operational_files | Applied |

The repository file names have been aligned exactly to the Supabase ledger to avoid future CLI attempting reapplication. SQL bodies were byte-for-byte preserved. Original RPC source and schema metadata snapshots: `docs/storage/rc15-release-baseline/`. This is **not** a complete database backup.
