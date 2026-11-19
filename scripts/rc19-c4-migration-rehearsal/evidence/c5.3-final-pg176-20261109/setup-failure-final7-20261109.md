# C5.3 PG17.6 fixture setup — final7

- Target: local disposable PostgreSQL 17.6 database `rc19_c5_3_final7_20261109`; not Production or Staging.
- Infrastructure role setup passed, the guarded clone was created, and the Production table/routine grant restoration passed.
- Baseline preparation stopped before any forward migration at `C5_3_STORAGE_SCHEMA_PRODUCTION_ACL_MISMATCH`: the fixture had not explicitly recorded the schema owner's `CREATE` and `USAGE` ACL entries, although the owner had implicit privileges.
- A transaction-only probe showed `GRANT CREATE, USAGE ON SCHEMA storage TO supabase_admin` yields the exact captured explicit owner entry; the probe was rolled back.
- `final7` and its partial setup are preserved. No forward migration ran and no Production write occurred. The corrected full rehearsal targets a new database, `rc19_c5_3_final8_20261109`.
