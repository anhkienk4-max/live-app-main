# ATT-01 #94 P0: concurrency review-only patch

**Separate branch** `fix/att01-concurrent-rpc-review-20261027` from selective backport `6a4d845aee881d2f7e6ef1986633f5dac02923ba`. **DO NOT MERGE / DO NOT APPLY SQL / DO NOT DEPLOY** without owner release approval.

## Findings on 2026-10-27 (read-only Production metadata, no staff rows read)

- Source `tests/fixtures/att01_rc17c_foundation.sql` and actual Production `pg_get_functiondef()` bodies for `stage_attendance_import_batch` and `confirm_attendance_import_batch` were normalized and compared: **both bodies equal**.
- Production ledger contains renamed historical RC17C `20261021101021` rather than original source migration filename.
- Import batch and row tables exist, RLS is enabled, and stage/confirm SECURITY DEFINER RPCs allow service_role EXECUTE, not anon/authenticated.
- Existing `source_fingerprint` index is **non-unique**. Concurrent first-time staging by the same fingerprint can escape `SELECT ... FOR UPDATE`, because no row yet exists to lock.
- Concurrent confirmation of separate batches for the same staff/time can escape each batch's row lock and read each other's not-yet-committed DRAFT insert.

## Surgical mitigation for separate review

`ATT01_LOCK_PATCH_REVIEW_ONLY.sql` **outside supabase/migrations** adds:
1. A unique index on source fingerprint as database-enforced no-duplicate backstop.
2. Transaction advisory lock on fingerprint before stage's existing FOR UPDATE selection.
3. Transaction advisory lock on staff before Confirm's existing overlap check and DRAFT insert.

All original validations, idempotent staged-batch behavior, status transitions, DRAFT semantics, RLS, actor guards and row provenance are unchanged.

### Deployment safety gate

Do not apply to a live database without first confirming no existing duplicate fingerprints using an operator-approved aggregate-only audit, reviewing CREATE INDEX locking impact, rehearsing on a licensed isolated clone, and owner review of all SECURITY DEFINER privileges/SQL diff. Existing duplicates must never be auto-deleted or overwritten. Any rollback must preserve confirmed and drafted historical records. This SQL is **not** included in PR #115 or an executable migration path.

## Reproducibility: REAL PostgreSQL 17, not mocks or PGlite

Workflow: `.github/workflows/att01-postgres17-concurrency-gate.yml`.

CI starts `postgres:17` in a disposable service container with trust authentication used only by the CI runner, creates fresh synthetic DBs and invokes the *real original* RPC fixture and the proposed SQL patch via separate concurrent psql connections.

Expected baseline results: **2 batches** from simultaneous first-import identical fingerprints; **2 DRAFT segments** from simultaneous confirmations of two distinct batch IDs with identical staff/time.

Expected patched results: **1 batch**, **1 DRAFT segment**; concurrent same-batch confirmation yields 1 success/1 replay rejection; forced failure of the second segment rolls back the entire Confirm transaction. Every result must be asserted against actual PostgreSQL state.

### Other release gates remain BLOCKED

Vercel connector can list team `livestream2` but cannot read `livestream-ops-demo` project (404) or Production deployments (403). Production domain `ops5729.top` mapping, deployment SHA, rollback ID and environment target are unverified. No authenticated Admin/Leader/Member UAT session is available. Both ATT-01 flags stay OFF. PR #115 stays Draft.
