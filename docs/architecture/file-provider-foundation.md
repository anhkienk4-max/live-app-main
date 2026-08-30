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
FILE-2 Google Drive adapter supports an explicit system OAuth refresh-token
mode (preferred for personal My Drive) and a service-account mode for Shared
Drives, while OneDrive remains unimplemented. A configured but unavailable provider fails
with `FILE_PROVIDER_NOT_IMPLEMENTED`; no fake upload succeeds. Development/test
may use the deterministic mock provider. Production fails closed for missing,
unsupported, or mock configuration. Credentials are server-only and must never
use `NEXT_PUBLIC_*` variables.

## Google Drive adapter (FILE-2)

The recommended system account is a dedicated normal Google account in My
Drive, authenticated with an OAuth refresh token. Configure these server-only
variables:

- `GOOGLE_DRIVE_AUTH_MODE=oauth_refresh_token` (the default; set explicitly in production)
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

Run `node --import ./tests/typescript-alias-loader.mjs scripts/google-drive-oauth-bootstrap.ts`
locally to obtain the refresh token. The script uses offline access and
consent, prints an authorization URL, accepts the returned code, and prints
the token once for secure server/Vercel storage. Never commit or expose it in
browser code or logs.

For Google Workspace Shared Drives, an explicit service-account mode remains
available with these server-only variables:

- `GOOGLE_DRIVE_AUTH_MODE=service_account`
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_DRIVE_PRIVATE_KEY` (PEM; escaped `\\n` is accepted)
- `GOOGLE_DRIVE_ROOT_FOLDER_ID`

Service-account mode is not a personal My Drive storage model; its configured
root must be a Shared Drive folder (or an equivalent Workspace deployment).
The adapter health check rejects a service-account root without a Drive ID.

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

### Custom Drive destinations (FILE-2.2)

Uploads may provide the neutral `FileDestination` extension on
`FileUploadInput`:

- `provider: 'google_drive'`
- either `external_folder_id` or a supported `folder_url` (not both)

Supported links are `/drive/folders/<id>`, `/drive/u/0/folders/<id>`, and
`/open?id=<id>` on `drive.google.com`. A custom folder is validated with the
system account before upload: it must be an active folder with
`capabilities.canAddChildren=true`. Invalid URLs, missing folders, non-folders,
trashed folders, and read-only folders fail with deterministic Drive errors and
never fall back to the managed root. A missing destination keeps the existing
logical-path-under-root behavior.

Drive requests include `supportsAllDrives=true` (and list requests include
`includeItemsFromAllDrives=true`) so My Drive, shared-with-me folders, and
Shared Drive folders use the same adapter contract. Pasting a URL grants no
permission and never changes ACLs or creates public sharing.

`SavedFileDestination` is a provider-neutral persistence contract for later
UI/storage work; FILE-2.2 adds no database tables or migrations.

## Current legacy storage inventory

`CURRENT_SUPABASE_STORAGE_USAGE`:

- `lib/services/supabaseReportService.ts` uploads report evidence and live
  report gallery images to the existing Supabase Storage bucket and reads
  public URLs.
- P3 report persistence migrations and UI continue to use those paths.

This task does not migrate or change that behavior. Future work should migrate
those call sites deliberately:

1. FILE-3: migrate report images
2. FILE-4: implement the OneDrive adapter
3. FILE-5: scheduled database backup to a configured provider
