# RC19 C4.2 Production baseline reconciliation and migration rehearsal

## Corrected relation classification

Read-only Production catalog query at 2026-11-07T12:05:08.822152Z confirmed project egdjnpmoasarrttvhgds, PostgreSQL 17.6, 89 migration receipts, head 20261101073742. A second read-only check captured the same 19 target relations. Ten exist in Production; the nine named below are absent.

Root cause: the 2026-11-06 snapshot correctly included 19 queried target names and set exists=false for the nine absent names. The comparison treated the 19-row target list length as the count of present relations. It compared that with the 10 present relations in the 89-ledger replay and incorrectly called the nine absent relations Production-only. No nine-table schema drift exists.

The corrected three-state comparison is in production-baseline-comparison-c42.json:

- Actual Production before C4: 10 existing targeted relations; all nine expected-new relations absent.
- Disposable PG17.6 after 89 replay receipts: same 10 targeted relations; all nine absent.
- Disposable PG17.6 after the 17 effective C4 migrations: all nine new relation definitions are present in the final schema dump, each mapped to its creating migration with a PASS receipt.
- Classification: 10 BASELINE_MATCH, 9 EXPECTED_NEW_OBJECT, 0 EXISTING_INCOMPATIBLE_OBJECT, 0 UNVERIFIED for the 19 targeted relations.

The nine expected-new relations are operational_schedule_source_files, operational_storage_domain_folders, operational_storage_drive_probe_rate_limits, operational_storage_drive_probe_runs, rc19_leader_brand_scope_events, rc19_leader_brand_scopes, rc19_report_artifact_deletion_events, rc19_report_artifact_deletions, and rc19_report_export_audit.

## Production baseline parity

Exact comparisons against the 89-replay baseline match for:

- 172/172 captured columns, including type/default/nullability/position.
- 98/98 constraints.
- 29/29 indexes.
- 15/15 policies.
- Ten existing targeted relation-presence/RLS records.
- Metadata for 142 common captured public/private routines: owner, schema, return type, language, configuration/search path and SECURITY DEFINER flag. The replay included Production-only ledger receipts STO02 version 20261101073720 and Brand01 version 20261101073742.

Production has one routine absent from the replay snapshot: public.rls_auto_enable(). Its live body and ensure_rls event-trigger dependency were subsequently captured; see live-production-event-triggers-20261107.json. It is a Production platform object not emitted by the 89 project-migration replay.

Full schema parity remains PARTIAL_UNVERIFIED: the baseline schema-only dump used --no-privileges, the broad Production snapshot omitted trigger definitions and routine bodies, and the available exact function metadata does not close those gaps. Do not treat matching selected catalogs as complete schema equivalence.

A live catalog query also captured Production event triggers. The Production-only ensure_rls event trigger uses public.rls_auto_enable(), body MD5 99be20677b456ea8d3be47bdd44fb369, search_path pg_catalog, and a postgres-only ACL. The PG17.6 replay does not simulate platform event triggers; however, all 12 new public tables created by the C4 chain have explicit ENABLE ROW LEVEL SECURITY statements in the final replay dump. This resolves the final RLS state for those tables, not whole-schema trigger/grant parity.

## C2 Storage reconciliation

A read-only query reproduced C2's exact existing-table preflight fingerprints against live Production. Columns, constraints, indexes, policies, triggers, the seven protected function bodies/owners/search paths/ACLs, and four table ACLs matched. The storage_resources.visibility check is the expected old three-value constraint; C2 explicitly replaces it transactionally with the four-value constraint and validates it. Aggregated compatibility checks found no existing public visibility rows or unsupported audit actions. All C2-created target objects were absent.

C2 uses CREATE TABLE IF NOT EXISTS only after fail-closed fingerprints; it does not replace the existing storage tables. Its PG17.6 synthetic run separately verified row/audit preservation, atomic rollback and Admin/Leader/Member RLS with anonymous denial. This proves compatibility predicates and synthetic preservation, not Production data preservation by execution; no Production DDL/DML ran.

## PG17.6 migration rehearsal

Existing exact-hash evidence was reused, not rerun: prodshape-pg17-20261107T114021Z/result.txt reports PASS, PostgreSQL 170006 (17.6), 89 replay receipts and 17 candidate migrations. compare-production-baseline.py verified every effective migration SHA-256 against the local source and each PASS receipt. C2 uses effective SHA-256 d9956e62f4f26480caa742ecdca1e37b6ebcefa5ae8035f0f63b5074af1914b5; the archived original is preserved.

The dashboard-image migration reported UPDATE 1 on the replayed public bucket row; current Production remains public=true with the public-read policy. Migration 01 SQL is identical to the frozen C4 source after CRLF normalization. The 17.6 statement executed and set the selected row to public=false; the final run did not retain an explicit post-migration SELECT, so the persisted state readback is not captured. Previous-runtime read/rollback compatibility with the private bucket is unverified.

Migration 07's old/new index transition is present in the PG17.6 catalog diff. A fresh read-only Production aggregate found zero groups conflicting with the canonical identity and zero active old-slot duplicate groups. The route registry has zero total rows and zero active routes, so no Drive route was activated. Compatibility with rollback to the previous application runtime remains unverified.

The exact ordered effective 17-file manifest and SHA-256 values remain in effective-migration-manifest.json; the corrected conditional release plan is production-execution-plan-c42.json. The Production execution allowlist remains empty.

## Separate release gates

- Synthetic backup/restore on disposable PostgreSQL 17.6 passed; no Production backup/PITR artifact or independent Production restore was evidenced.
- Owner's Admin browser access was previously demonstrated, but independent Admin/Leader/Member authenticated UAT is incomplete.
- Google Drive runtime principal, effective ACL isolation, upload/readback/checksum are unverified.
- Effective Production feature-flag state is unverified.
- UX hotfix remains on its separate branch/worktree and was not integrated or visually validated here.

No Production DDL/DML, migration ledger change, Drive write/ACL change, deployment, promotion, or main merge occurred.
