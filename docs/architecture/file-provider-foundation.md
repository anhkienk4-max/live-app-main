# Provider-neutral file storage foundation

Core V1 keeps Supabase as the system of record for structured operational data
and file metadata/reference. Binary files are delegated to one system-level
provider selected by the server (`FILE_PROVIDER=google_drive` or
`FILE_PROVIDER=onedrive`); users never choose a provider in the UI.

Business modules call the neutral `fileStorageService` gateway and use
`FileAsset` metadata. Logical placement is provider-independent (for example,
`LiveStreamOps/reports/YYYY/MM/<report-id>` and
`LiveStreamOps/imports/YYYY/MM/<batch-id>`); adapters translate it to provider
objects and folders. Names are sanitized and uploads are centrally validated.

Google Drive and OneDrive adapters are explicit boundaries only in FILE-0/1.
Until implemented, configured external providers fail with
`FILE_PROVIDER_NOT_IMPLEMENTED`; no fake upload succeeds. Development/test may
use the deterministic mock provider. Production fails closed for missing,
unsupported, or mock configuration. Credentials are server-only and must never
use `NEXT_PUBLIC_*` variables.

## Current legacy storage inventory

`CURRENT_SUPABASE_STORAGE_USAGE`:

- `lib/services/supabaseReportService.ts` uploads report evidence and live
  report gallery images to the existing Supabase Storage bucket and reads
  public URLs.
- P3 report persistence migrations and UI continue to use those paths.

This task does not migrate or change that behavior. Future work should migrate
those call sites deliberately:

1. FILE-2: implement the Google Drive adapter
2. FILE-3: migrate report images
3. FILE-4: implement the OneDrive adapter
4. FILE-5: scheduled database backup to a configured provider
