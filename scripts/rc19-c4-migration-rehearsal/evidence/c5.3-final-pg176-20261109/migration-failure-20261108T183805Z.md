# C5.3 PG17.6 attempt — C2 routine ACL absent from schema-only clone

- Rehearsal source SHA: `c9d0253a3d02e4cac5102c0ab7ccf4865db3cf43`.
- Database: `rc19_c5_3_final6_20261109` (`CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY`), PostgreSQL 17.6.
- Migrations 1–8 passed. Migration 9 (`20261103195519`) stopped at its unchanged C2 reconciliation guard for `private.guard_storage_resource_scope()`; no receipt was added for migration 9 and its transaction rolled back.
- The normalized function body MD5, owner, `SECURITY DEFINER`, and empty `search_path` match the Production C2 precondition. The cloned baseline had `proacl = NULL` (`default`) because its schema-only dump used `--no-privileges`; current Production has the explicit ACL `{postgres=X/postgres}`.
- A read-only Production query of all seven C2 routines confirmed the migration's expected owners, body hashes, security-definer flags, search paths and ACLs. The query result is captured in `production-schema-acl-snapshot-20261108.json` (2026-11-08T18:40:25Z).
- Correction: restore and assert the exact seven Production routine ACLs before replay in a fresh disposable clone, `rc19_c5_3_final7_20261109`. No migration SQL was changed.
- The `final6` database and failed migration log are preserved; no Production writes occurred.
