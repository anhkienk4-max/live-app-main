## Why

Teams need to associate several existing Drive or OneDrive roots and resources with the same Brand or Campaign without changing the approved upload routes or moving provider data.

## What Changes

- Add a metadata-only registry for canonical Google Drive and OneDrive resources, multiple scope links, explicit user grants, verification state, and audit events.
- Add an Admin-managed Storage Resources workspace for adding links, editing display metadata, granting registry visibility, disabling/restoring records, and finding duplicates or unverified resources.
- Keep registry visibility separate from provider ACLs and operational upload placement. Registry verification checks metadata through the configured provider integration and does not prove viewer access.
- Treat attendance evidence as owner-only private metadata with no Brand scope.

## Impact

This is additive. `operational_storage_routes`, `operational_files`, existing files, and provider ACLs are not changed. The SQL proposal lives outside Supabase migration discovery and must not be applied to any environment before Owner approval and a separate release decision.
