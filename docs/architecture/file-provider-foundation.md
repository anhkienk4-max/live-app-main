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

Google Drive and OneDrive adapter boundaries were defined in FILE-0/1. The
FILE-2 Google Drive adapter uses a server-owned service account, while
OneDrive remains unimplemented. A configured but unavailable provider fails
with `FILE_PROVIDER_NOT_IMPLEMENTED`; no fake upload succeeds. Development/test
may use the deterministic mock provider. Production fails closed for missing,
unsupported, or mock configuration. Credentials are server-only and must never
use `NEXT_PUBLIC_*` variables.

## Google Drive adapter (FILE-2)

The system account is authenticated with a Google service account. Configure
these server-only variables:

- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY` (PEM; escaped `\\n` is accepted)
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

The adapter resolves each sanitized `logical_path` segment as a folder below
the configured root and caches successful folder IDs in-process. Existing
same-name folders are selected deterministically; missing folders are created
under the configured parent. Files remain private to the service account: no
`anyone` or link-sharing permission is created. View URLs are Drive links that
require Drive authorization, and download URLs use the authenticated Drive
media endpoint; a future application proxy can consume these IDs server-side.

`delete` means moving the Drive file to trash, not permanent deletion.
Health checks read the configured root, verify it is an accessible folder, and
never mutate it. The adapter retries only transient 429/5xx responses with a
bounded backoff; configuration, authentication, and not-found failures are not
blindly retried. No user-facing Google OAuth or provider selection is exposed.

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
