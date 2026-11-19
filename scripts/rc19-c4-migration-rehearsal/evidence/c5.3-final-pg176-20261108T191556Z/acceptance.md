# RC19 C5.3 final PG17.6 rehearsal

## Exact run

- Rehearsal source SHA: `17ee41a185612f1d77449a6bc970e72e8364bab8`.
- Declared frozen C4 application reference in the manifest: `240a0d51b49863167be252d94545ea7c5ab2ac9a`. The rehearsal ran against the later C4.4/C5.3 source checkout; it did not launch or exercise the application.
- Server: PostgreSQL 17.6 (Ubuntu 17.6-2.pgdg24.04+1), local WSL socket only.
- Database: `rc19_c5_3_final10_20261109`, marker `CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY`.
- Baseline source: sanitized schema-only clone after replay of the 89 Production receipts. The final clone did not fabricate/replay historical receipt rows; it recorded only the 20 forward migrations actually applied.
- Result: **PASS, 20/20**; forward head `20261108135226`. Per-file versions, hashes, transaction mode, and schema fingerprints are in `progress.tsv`; the manifest input hash and final schema hash are in `result.json`.
- C2 Storage data-preservation fingerprint, Admin/Leader/Member report and shift assertions, C2 Storage RLS, image-policy checks, and private-contract negative/positive checks completed without runner errors.

## Verified behavior

- The 20 migration hashes match the frozen effective manifest. No historical migration was modified.
- The C2 existing resource ACLs and seven routine ACLs matched the read-only Production captures. Storage role ownership, schema/table grants, RLS flags, and all ten existing Storage policies were asserted before replay.
- Shift Identity allowed parallel synthetic shifts in distinct studios and rejected a duplicate canonical identity. Legacy shift date/time fields remained readable; Open Shifts selection, staffing scope, and operational-note role checks passed.
- The 20-migration expand sequence kept `live-dashboard-images` public and retained its public-read policy. An anonymous synthetic metadata read passed and anonymous Storage write was denied. Only synthetic object metadata was used; provider bytes were not read.
- The separate private-image contract migration was denied without runtime/rollback attestation and left the bucket/policy unchanged. With the explicit test-only attestation, a separate disposable clone became private and the public policy was removed. This is migration-gate evidence, not proof that a deployed application or rollback target can read private image bytes.

## Release status

- PostgreSQL migration rehearsal: **PASS** on the exact source SHA above.
- Expand-stage database compatibility: **PASS** for the tested sanitized baseline and synthetic contracts.
- Live application compatibility / rollback: **NOT VERIFIED**. No application was deployed or launched against this database. The last previously recorded read-only observation for deployment `dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS` was HTTP 404 for `/api/dashboard-screenshots`; its source SHA was not attested, and that observation was not refreshed in this run.
- Production exact schema parity, backup/restore, authenticated role UAT, Drive principal/ACL, and provider-byte readback remain outside this rehearsal or unverified. Backup/PITR remains excluded by Owner instruction.
- No Production SQL, deployment, flag change, alias change, or Drive write occurred. The manifest `executable_allowlist` remains empty.
