# C5.3 PG17.6 fixture setup — final8 correction

- Target: local disposable PostgreSQL 17.6 database `rc19_c5_3_final8_20261109`; not Production or Staging.
- The guarded database clone and exact Production table/routine grant restoration passed.
- Baseline preparation reached the Storage owner ACL assertion and stopped before any forward migration because the fixture had not recorded the explicit grant-option ACL for `supabase_storage_admin` on `storage.objects` and `storage.buckets`.
- A transaction-only probe transferred both table owners and applied the explicit owner grants; the catalog returned the expected owner and all eight PostgreSQL 17 privileges with grant option. The probe was rolled back.
- The baseline setup script now runs as one transaction and uses a savepoint for the anonymous read/denial check, so setup assertions cannot leave partial fixture DDL or synthetic rows. No forward migration ran and no Production write occurred.
- The next setup execution passed the owner ACL assertion but the policy assertion failed because its SQL alias `expected` collided with a PL/pgSQL record variable; the enclosing transaction rolled back. The alias is now `policy_expected`.
