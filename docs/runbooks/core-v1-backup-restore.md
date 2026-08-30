# Core V1 backup and restore drill

## Scope

This runbook proves database recovery for the Core V1 operational schema. It is a disposable recovery drill, not a production restore procedure and not a replacement for provider-managed backups or PITR.

The source for this drill is the staging Supabase project (`amagnzebmmuqiptmrjmc`). Production (`egdjnpmoasarrttvhgds`) is never a restore target.

## Recovery layers

- **Application emergency export:** user-facing operational export; useful for manual recovery, but not a database restore proof.
- **Database logical backup (this drill):** PostgreSQL schema/data dump restored to a fresh isolated database.
- **Provider backup/PITR:** Supabase-managed capability; availability and retention must be checked in the dashboard for the actual plan.

## Preconditions and source safety

1. Confirm the intended source project/ref and record the current migration version, table counts, RLS count, trigger count, and representative non-sensitive fingerprints.
2. Confirm the restore destination is a new disposable local database/container. Never use staging or production as the destination.
3. Keep credentials in environment variables or the CLI credential store. Never put passwords, keys, tokens, or connection strings in this repository.

## Backup command pattern

Use a temporary directory outside the repository and replace placeholders locally:

```text
npx supabase@latest db dump --project-ref <STAGING_REF> --schema public,private,storage --file <TEMP>/core-v1-schema.sql
npx supabase@latest db dump --project-ref <STAGING_REF> --schema public,private,storage --data-only --use-copy --file <TEMP>/core-v1-data.sql
```

Record command exit codes, byte sizes, SHA-256 checksums, and elapsed times. Do not print dump contents. Delete the temporary dumps after validation unless the incident owner explicitly retains them.

The normal dump excludes Supabase-managed internal schemas such as `auth`; this is expected and must be recorded as a separate recovery dependency.

## Isolated restore

Start a fresh local PostgreSQL/Supabase-compatible target with a unique project/database name and port. Restore schema first, then data. For a disposable local target only, temporarily disabling triggers while loading a transactionally consistent data dump can avoid circular foreign-key ordering; restore normal trigger behavior before validation. Classify harmless provider-owned extension/role/owner differences separately from material relation, function, policy, trigger, constraint, or data errors.

Validate:

- all Core V1 tables, primary/foreign keys, constraints, indexes, functions/RPCs and triggers;
- RLS enabled and policies/grants present for protected tables, audit, and notifications;
- `shifts_active_slot_uidx`, P1-B version guards, P1-C import constraints/functions, timezone derivation, account lifecycle, and audit trigger coverage;
- safe table counts and non-sensitive ID/fingerprint parity at the backup snapshot.

## Local smoke checks

On the isolated target only:

- insert a valid shift and verify canonical timezone projections;
- attempt the same active natural-key slot and expect a unique violation;
- update a shift and verify the version increment;
- verify a true overnight shift and invalid timezone rejection;
- verify an audit trigger event, then remove all smoke fixtures and their local audit rows.

Auth-dependent RPC behavior is classified `RESTORED_SCHEMA_VERIFIED_AUTH_RUNTIME_NOT_EMULATED` unless a safe local Auth emulator is available. Never weaken production functions to make a local drill pass.

## Current drill evidence

The staging snapshot used for the Core V1 drill had migration count 26 (latest `20260830113000`), 16 RLS-enabled public tables, 39 non-internal triggers, and these counts: business_users 8, brands 3, platforms 6, campaigns 1, shifts 53, shift_registrations 19, swap_requests 1, reports 1, notifications 26, schedule_import_batches 10, schedule_import_batch_rows 582, audit_logs 40, audit_log_reviews 0. The isolated restore matched all listed counts and non-sensitive fingerprints.

The earlier full data drill therefore covers the schema/data snapshot through `20260830113000`. After the later `20260830114000_core_v1_persistent_audit_read_permission` change, a targeted schema-only recovery delta check was run from staging into a fresh disposable local PostgreSQL target. It restored `audit_logs_read` as Admin OR Leader scoped to `calendar`, `live`, `reports`, `campaigns`, `swaps`, or `imports`, with no Member own-event clause; `audit_log_reviews_read` remained Admin-only. The disposable target and temporary dump were destroyed after validation.

## Limitations and provider checks

- Auth users/configuration and password hashes are not part of the normal `public,private,storage` dump: `AUTH_RECOVERY_DEPENDENCY=PROVIDER_MANAGED / SEPARATE PROCEDURE`.
- Storage metadata can be restored, but Supabase Storage binary objects are not contained in this PostgreSQL dump. Core report-image recovery therefore requires a separate storage backup/restore procedure: `STORAGE_CRITICAL_FOR_CORE_V1=YES` for image payloads.
- Edge Functions, external files, provider secrets, environment variables, and Vercel configuration are outside this drill.
- Check managed backup schedule, retention, and PITR visibility manually in the Supabase dashboard. If not visible to the operator, report `PROVIDER_BACKUP_STATUS=MANUAL_DASHBOARD_CHECK_REQUIRED` and `RPO=UNVERIFIED_PROVIDER_SETTING`; do not infer RPO/RTO.

Observed local drill timings are evidence for this run only, not an official production RTO. Record backup, restore, validation, and total durations with each run.

## Abort and release rules

Abort on a wrong project ref, any production target, unexpected migration/schema drift, material restore error, constraint/data-load failure, or parity mismatch. Do not run migration repair, reset, or destructive cleanup against staging/production.

A production restore requires a separate incident approval, a verified provider recovery plan, and an explicit change window. This drill does not authorize production restore or migration application.
