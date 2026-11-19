# C5.3 PG17.6 runner failure — final9

- Source SHA: `eec9db9c269d66bb3c6adb6f07dbda32065253b0`.
- Target: disposable PostgreSQL 17.6 database `rc19_c5_3_final9_20261109`.
- All 20 effective migration files passed; the runner then completed its C2 Storage RLS assertions, Admin/Leader/Member role assertions, and image compatibility assertions without error.
- The run exited during the private-image contract negative case. PostgreSQL correctly raised `DASHBOARD_IMAGE_PRIVATE_CONTRACT_NOT_ATTESTED`, but `psql -v ON_ERROR_STOP=1 -f` returned exit code 3 while the harness expected 1. The error text matched the required denial, but the harness stopped before checking rollback and attested-positive behavior.
- The runner now expects psql's documented script-error exit code 3. Final9 and all 20 migration receipts are preserved; the next exact-SHA run uses a fresh final10 database. No Production write occurred.
