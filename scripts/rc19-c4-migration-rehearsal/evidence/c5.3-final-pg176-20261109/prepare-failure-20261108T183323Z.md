# C5.3 PG17.6 preparation attempt — stale ACL snapshot

- Harness/source HEAD: `5ae3276b8b27bab4c8007603160878a722ad0197`.
- Database: `rc19_c5_3_final6_20261109`, disposable marker `CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY`.
- PostgreSQL: 17.6. No forward migrations had run in this database.
- The grant fixture transaction rolled back at `C5_3_PRODUCTION_SNAPSHOT_API_GRANTS_MISMATCH` for `public.shifts`/`service_role`.
- The old expected ACL omitted PostgreSQL 17 `MAINTAIN`; the current Production SELECT-only catalog result includes `MAINTAIN` on all eleven public relations used by C5.3 role assertions. The refreshed exact rows are in `production-schema-acl-snapshot-20261108.json`.
- No changes persisted from the failed grant transaction. The same untouched disposable clone can safely retry the corrected, guarded grant setup; Production was only queried with SELECT.
