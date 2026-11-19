# Design

## Route model

The current `operational_storage_routes` table requires Brand, execution source, and Platform and therefore cannot represent global domain roots. Add `operational_storage_domain_folders` keyed by normalized Drive path with exact folder ID, parent ID, access classification, sensitivity, and an inactive-by-default flag. Enable RLS and revoke all access from `public`, `anon`, and `authenticated`; only server-side privileged code may read or seed it.

The checked-in Drive route map and 93-folder registry remain the source for category-to-path, report-group names, and verified parent relationships. The runtime resolves an exact active folder row and requires its folder ID to match the manifest. Missing, inactive, mismatched, or sensitive/shared routes fail closed. Existing route lookup remains available for legacy paths.

## Placement

The 15 existing file categories use their mapped domain folder IDs. Report artifacts use the report root and create the real `brand/platform/year/month/human-code__shift-id/group` path beneath the actual shift. The physical shift-folder template is never an upload target. Report groups are an explicit allowlist of the nine Blueprint names.

The source Excel workbook is uploaded to the raw-schedule domain independently of normalized previews and shift writes. Its database record is metadata and a provider reference only. No workbook bytes or binary payloads enter Supabase.

## UAT and security

A narrowly scoped Admin-only route accepts only a small synthetic probe, uses the configured fixed UAT folder ID, uploads through the Production app's configured Google Drive provider, reads Drive metadata and bytes back, checks parent ID and SHA-256, and returns no credential material. Anonymous and non-Admin writes are denied before provider I/O.

The root's shared/anyone-writer ACL prevents use for real HR, Payroll, contracts, payment records, staff photos, or other confidential files. The route resolver blocks sensitive-category writes until a private destination is verified. Synthetic UAT is allowed in the separate test folder.

## Migration and rollback

Seed the 93 folder rows idempotently with `active=false`. A conflict with an existing path or ID must fail rather than overwrite an Owner-managed mapping. Route activation is a separate exact-ID operation and is not part of this migration. Existing data is untouched; rollback is an application rollback plus forward-only database remediation, never a destructive down migration.
