# C5.3 PG17.6 attempt — role fixture ACL gap

- Harness source SHA: `367c9553aca4628f4f721f23f04f2b47714981ff`.
- Database: `rc19_c5_3_final5_20261109` (`CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY`).
- PostgreSQL: 17.6; all 20 forward migration files and receipts passed.
- Role assertions then failed when `private.filtered_shift_ids('open', '{}')` read `public.brands` as `authenticated` and PostgreSQL returned `permission denied for table brands`.
- Cause: the schema-only fixture omitted API-role table ACLs. The fixture restored report/shift/Storage-route grants but not the Production grants for `brands`, `campaigns`, `platforms`, `shift_registrations`, `shifts`, `system_settings`, and `business_users`.
- Read-only Production ACL evidence was queried from project `egdjnpmoasarrttvhgds` on 2026-11-08. The exact returned owner/privilege sets are recorded in `production-schema-acl-snapshot-20261108.json`.
- Correction: restore only those captured API-role ACLs on a new disposable clone (`rc19_c5_3_final6_20261109`) and verify exact privileges, including the absence of `anon` grants, before replaying migrations.
- The failed `final5` database and raw local logs are retained; no database was dropped or modified after the failed assertion.
