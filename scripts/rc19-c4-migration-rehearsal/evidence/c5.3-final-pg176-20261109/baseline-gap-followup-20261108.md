# Sanitized baseline follow-up — Storage managed metadata

Read-only Production catalog captures identified additional omissions from the schema-only replay baseline:

- Local replay baseline: `storage` schema and `storage.buckets`/`storage.objects` owned by `postgres`; `storage.buckets` RLS was disabled and `storage.objects` RLS enabled.
- Production: `storage` schema owner is `supabase_admin`; both core relations are owned by `supabase_storage_admin`; RLS is enabled on both and forced on neither.
- Production has `supabase_admin`, `supabase_storage_admin`, and `dashboard_user` infrastructure roles plus `authenticator` membership in `supabase_storage_admin`. These roles were absent from the local replay baseline. Local role login is deliberately disabled because no credentials are required for ownership/RLS assertions.
- Production and the replay baseline have the same ten `storage.objects` policies by name, command, role set, and MD5 of `qual`/`with_check`; the public dashboard image read policy is present in both. No policy source text or object data was copied.
- Production metadata comes from read-only catalog queries in `production-schema-acl-snapshot-20261108.json`; local comparison is catalog-only.
- The final disposable fixture now creates guarded NOLOGIN infrastructure roles, restores the core owners/ACLs/RLS state, and asserts all ten existing policy hashes before the 20-migration replay. It does not edit any migration or Production object.
