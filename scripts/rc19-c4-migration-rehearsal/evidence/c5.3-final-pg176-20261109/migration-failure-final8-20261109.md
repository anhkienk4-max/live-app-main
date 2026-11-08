# C5.3 PG17.6 migration attempt — final8

- Source SHA: `ea4f1c4d53fbedfbb220d3fcf6c179caa9c19609`.
- Target: disposable PostgreSQL 17.6 database `rc19_c5_3_final8_20261109`, marker `CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY`.
- Forward migrations 1–8 passed. Migration 9 (`20261103195519_rc19_c2_resource_public_and_app_edit.sql`) failed at `C2_RECONCILIATION_GRANTS_MISMATCH`; its transaction rolled back and no receipt was recorded.
- The fixture had not restored the four pre-existing C2 relation grants. Read-only `production-catalog-snapshot.json` records authenticated and service-role grants; a transaction-only grant probe reproduced the exact relation ACL strings required by the unchanged migration precondition, then rolled back.
- The final8 database and its first eight receipts are preserved. The corrected full sequence targets a fresh `rc19_c5_3_final9_20261109`. No Production write occurred.
