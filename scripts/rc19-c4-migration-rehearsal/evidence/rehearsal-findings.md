# RC19 C4 migration rehearsal and Production compatibility

Candidate source: `240a0d51b49863167be252d94545ea7c5ab2ac9a`.
Production project: `egdjnpmoasarrttvhgds`.

## C4.1 reconciliation update — 2026-11-07

- Effective C2 source SHA-256 is `d9956e62f4f26480caa742ecdca1e37b6ebcefa5ae8035f0f63b5074af1914b5` (canonical LF bytes). The original migration SHA-256 `1b16c0add91917c8188195d913e589d7618d8f27233f350dc55819c2b66be9dc` is preserved byte-for-byte at `../archive/20261103195519_rc19_c2_resource_public_and_app_edit.original.sql`; the manifest maps both hashes.
- The final focused run `c2-focused-pg17-20261107T112434Z` PASSes incompatible-column fail-closed rejection (`C2_RECONCILIATION_COLUMNS_MISMATCH:storage_resources`), confirms no partial C2 tables/receipt in the altered clone, then passes normal C2 application, atomic rollback injection, synthetic row/audit preservation, role RLS and anon denial using the canonical LF SHA.
- The full run replayed all 89 captured ledger entries and then all 17 effective candidate migrations on PostgreSQL 17.6 before C2 line-ending normalization. The C2 SQL tokens are unchanged; the final canonical LF bytes were rerun through the complete focused C2 authority/recovery suite. The full replay’s per-migration catalog diffs, C2 atomic rollback injection, synthetic row/audit preservation, Admin/Leader/Member RLS, and anonymous denial passed. See `prodshape-pg17-20261107T101849Z/result.txt`, `c2-focused-pg17-20261107T112434Z/result.txt`, and the retained prior focused runs.
- Catalog comparison against the captured 2026-11-06 Production snapshot: 172/172 selected columns, 98/98 selected constraints, 29/29 indexes, and 15/15 policies match the 89-entry ledger baseline. However, Production has nine relations absent from that replay baseline: `operational_schedule_source_files`, `operational_storage_domain_folders`, `operational_storage_drive_probe_rate_limits`, `operational_storage_drive_probe_runs`, `rc19_leader_brand_scope_events`, `rc19_leader_brand_scopes`, `rc19_report_artifact_deletion_events`, `rc19_report_artifact_deletions`, and `rc19_report_export_audit`.
- The schema-only baseline dump used `--no-privileges`, so it cannot prove table-grant parity. The Production snapshot does not include triggers or function bodies. It records 143 public routines while the replay dump contains 142; the additional Production routine is `public.rls_auto_enable()`. Exact C2 runtime preflight checks body, owner, search path, ACL, trigger fingerprints, and table ACLs and aborts on mismatch, but this preflight has not been run against Production.
- Therefore the 89+17 replay is **PASS as a ledger-derived replay**, while the **complete Production-shaped rehearsal is BLOCKED** until the nine pre-existing unledgered relation definitions and ACLs are captured and represented in the disposable baseline. `production-execution-plan.json` keeps the Production allowlist empty.
- Synthetic backup/restore verification PASS: custom-format dump restored to an isolated PostgreSQL 17.6 database; normalized data and catalog fingerprints match; Admin/Leader/Member read contracts pass and anon SELECT is denied. This is not a Production backup rehearsal. The Supabase organization is Free; automatic backups/PITR and a Production restore artifact were not evidenced. [Supabase backup and PITR availability](https://supabase.com/docs/guides/platform/backups).
- C2 widening permits `visibility='public'` for registry metadata seen by active authenticated ADA Ops users only. No existing resource row is changed to public, anon does not gain access, and no Google Drive ACL changes. Existing routes remain inactive; Drive OAuth identity/effective ACL and real upload/readback are unverified.
- The live dashboard image bucket is public today; migration `20261102110000` makes it private. Previous-runtime URL compatibility is unverified. The shift uniqueness migration removes the old active-slot index; rollback may conflict with new-contract data. Production recovery and old-runtime rollback are not proven.

## Sanitized read-only Production snapshot

Captured 2026-11-06 08:40 UTC through catalog-only Supabase SQL SELECTs. No business rows, credentials, or user data were included. Artifacts:

- `production-catalog-snapshot.json` — 19 relation presence/RLS flags, 15 public-schema policies, 74 table grants, 98 constraints, 29 indexes, selected RPC metadata.
- `production-schema-rpc-snapshot.json` — 172 relevant columns and 143 public/private authority routine signatures with owner, security, search path, and ACL metadata; candidate migration ledger range has 0 entries.
- `production-storage-policy-snapshot.json` — current `live-dashboard-images` bucket metadata and relevant Storage object policy predicates.
- `production-catalog-snapshot.sql` — repeatable catalog-only query.
- `migration-manifest.json` — exact 17 source migration names, order, and SHA-256 values, bound to candidate SHA.

Production is PostgreSQL 17.6 with 89 ledger rows, latest `20261101073742` / `20261101073646_rc19_brand01_catalog`. Two Production-only entries precede the C4 manifest: `20261101073720` / `20261101073643_rc19_sto02_resource_registry` and `20261101073742` / `20261101073646_rc19_brand01_catalog`.

The existing `storage_resources`, `storage_resource_scopes`, `storage_resource_user_grants`, `storage_resource_audit_events`, `operational_storage_routes`, shifts, reports, revisions, and images have RLS enabled. Direct `anon` SELECT was absent on inspected objects; authenticated report/shift/storage reads are narrowed by RLS. The Production snapshot also shows unledgered Leader-scope, artifact-deletion, report-export-audit, source-file, domain-folder, and Drive-probe relations. Their versioned candidate migration entries are absent from the 89-row ledger; their complete column/default/trigger/grant definitions were not captured. The `operational_storage_routes` registry has no rows and no active routes.

Production's existing `storage_resources.visibility` check allows `admin_only`, `owner_only`, and `granted_users`; source C2 adds `public`. This is a definition mismatch, in addition to the table overlap. Production's `live-dashboard-images` bucket is currently `public=true` and has the public-read policy. Source migration `20261102110000` sets it private and replaces public read with authenticated shift-scoped read. The C4 source has an authenticated `/api/dashboard-screenshots` read path, but the old live runtime's compatibility with the private bucket has not been attested. Do not infer app rollback safety from the additive columns alone.

Historical shift check: the Production canonical identity duplicate query returned zero active duplicate groups. Migration `20261102200000` creates the normalized Studio/Campaign unique index and drops `shifts_active_slot_uidx`; it changes the uniqueness contract. Preserve the old runtime only after the new/old write and read behavior is demonstrated against a Production-shaped clone.

## Storage activation and side effects

`20261102135047` creates a separate domain-folder table, seeds the Owner's Drive IDs with `active=false`, and uses a transaction with a seed-integrity check. It does not write to Drive. `20261102150000` changes the classification constraint, marks four paths `pending_restriction_no_sensitive_upload`, then activates every `verified_created=true` folder. The app resolver separately requires `active` and `verified_created`; `canWriteOperationalStoragePlacement` permits the pending classification only for non-sensitive categories. This is an application gate, not proof of effective Drive ACL. Runtime OAuth principal and Drive ACL remain unverified. Do not activate routes or upload until the principal, ACL, and sensitive-category decisions are verified.

## PostgreSQL 17 rehearsal

The disposable PostgreSQL 17.11 fixture is `rc19_c4_synthetic_storage_conflict`, database marker `CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY`. It contains synthetic `business_users` and `storage_resources` tables only. Exact evidence is `../../../evidence/pg17-c2-storage-collision-20261106T075309Z.log` relative to this folder.

The initial collision reproduced the archived original migration bytes (SHA-256 `1b16c0add91917c8188195d913e589d7618d8f27233f350dc55819c2b66be9dc`): line 37 attempted `CREATE TABLE public.storage_resources` and PostgreSQL returned `relation "storage_resources" already exists` with psql exit code 3. That original file lacked an encompassing transaction and used unconditional table creation; this is a historical failure record, not a description of the effective C2 migration now in the worktree. The effective migration adds an exact preflight, a single transaction, and a negative incompatible-schema test; see the 2026-11-07 update above.

**Initial 2026-11-06 rehearsal:** blocked at the C2 collision described above. **Updated 2026-11-07 rehearsal:** the C2 reconciliation and all 17 candidate files passed against a disposable 89-entry ledger-derived PostgreSQL 17.6 database. This does not constitute a complete Production-shaped pass because the captured Production schema contains nine unledgered relations absent from the replay baseline, and the sanitized dump omits grants.

## Manifest decision, stop conditions, and recovery

The ordered 17-file list and SHA-256 values in `migration-manifest.json` and `production-execution-plan.json` are the source review baseline only. **Current Production execution allowlist: empty.** Do not bulk `supabase db push`, alter the migration ledger, or replay either Production-only STO02/Brand01 migration.

Required before Production execution or a complete current-schema rehearsal:

1. Capture complete sanitized definitions and effective ACLs for the nine unledgered Production relations, plus trigger/function bodies needed by the C2 fingerprint guard; record their ownership and whether they came from prior out-of-ledger execution.
2. Build a disposable PostgreSQL 17.6 baseline from that complete snapshot, retaining grants and adding synthetic fixtures only. Replay every approved effective migration in order and compare each per-migration schema/permission delta.
3. Verify each intended migration version/hash in every target environment. Keep the original C2 hash archived; use only the explicitly mapped effective hash if its version ownership is approved.
4. Decide the public dashboard-image URL transition and prove previous-runtime compatibility with the private bucket; rehearse old/new shift identity behavior before removing the legacy uniqueness index.
5. Capture a secured offsite backup and independently restore it to isolated PostgreSQL 17. The current plan/organization has no evidenced automatic backup/PITR or Production restore artifact.
6. Verify the Drive runtime principal and effective ACL, authenticated Admin/Leader/Member UAT, and inactive feature flags before any write or activation.

Stop on any hash mismatch, unexpected pre-existing object/definition, historical duplicate, grant/RLS drift, lock timeout, nonzero migration exit, unexpected Storage activation, or failed old-runtime compatibility. On a disposable migration failure, preserve the failed DB and logs, inspect exact partial state, then use a fresh marked DB after correction; never automatically retry or drop objects. For any future Production release, apply only an Owner-approved exact manifest after verified recovery; keep unfinished feature flags off, validate read/RLS contracts, and retain the old application only if compatibility tests pass. No down-migration or restore is currently proven.
