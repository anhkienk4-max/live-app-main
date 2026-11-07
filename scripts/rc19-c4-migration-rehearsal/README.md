# RC19 C4.1 migration reconciliation rehearsal

All database execution in this folder is restricted to the isolated PostgreSQL 17.6 cluster and databases marked `CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY`. No Production SQL or migration was executed. The frozen application source remains `240a0d51b49863167be252d94545ea7c5ab2ac9a`; only this worktree's C2 migration and rehearsal artifacts are changed.

## Results

- C2 Storage reconciliation: **PASS** in the focused and full ledger-derived replays. The incompatible-column negative test aborts at the fingerprint preflight without partial C2 DDL. The original migration is archived with its original SHA. The effective C2 migration validates existing Storage columns, constraints, indexes, RLS policies, triggers, function bodies/owners/search paths/ACLs, table ACLs, and existing values before changing anything. It preserves existing rows and audit history, only creates proven-missing tables, widens the visibility check without changing any row to `public`, and commits transactionally.
- Ledger replay: **PASS** for the captured 89 Production migration entries followed by the 17 effective C4 source migrations on PostgreSQL 17.6. All 17 per-migration catalog deltas and receipts passed. C2 RLS and injected transaction rollback checks passed; a synthetic backup/restore rehearsal passed.
- Current Production schema parity: **BLOCKED**. The captured Production catalog has nine relations absent from the 89-entry replay schema. The sanitized snapshot does not contain their full column/default/trigger definitions, and its baseline schema dump omits ACLs. Do not describe the ledger replay as a complete Production-shaped clone or apply the 17-file chain directly to Production.
- Production release: **NO-GO**. `executable_allowlist` is empty. Production backup/PITR and independent restore, old-runtime compatibility, Drive runtime identity/ACL, and authenticated role UAT are not verified.

Use `evidence/production-snapshot-comparison.json` for the exact catalog counts and differences, `evidence/effective-migration-manifest.json` for the original-to-effective migration mapping and hashes, and `evidence/production-execution-plan.json` for stop conditions and the reviewed execution proposal.

## Reproduce local checks

The scripts validate the source SHA, migration hashes, database marker, PostgreSQL 17 version, history head, and expected starting state before execution. They never connect to Supabase. The full run evidence is in `evidence/prodshape-pg17-20261107T101849Z/`; the canonical-LF C2 SHA was rechecked in `evidence/c2-focused-pg17-20261107T112434Z/`. Earlier focused runs are retained as historical evidence. The updated synthetic restore assertions were rerun against the already-restored disposable databases; results are in the full run evidence folder. The full 89+17 ledger replay predates only C2 line-ending normalization; the SQL tokens are unchanged, and the final C2 bytes have a separate exact-SHA PG17 focused run.

Do not use `supabase db push` or treat a migration-ledger receipt as evidence for operations not executed. Any future Production run requires a complete current schema snapshot for all pre-existing unledgered relations, target-environment migration history/hash review, a verified independent backup/restore, old/new-runtime compatibility, and explicit Owner approval of the exact effective sequence.
