# RC19 Batch 05A.3: Domain-first Drive routing

## Why

The Storage release branch is based on a pre-Gemini source and its current route schema is keyed by Brand, execution source, and Platform. The approved ADA Ops Drive tree is domain-first, contains 93 verified folders, and has no active Production routes. The app needs an exact, fail-closed mapping before new assets can use that tree.

## What changes

- Add a metadata-only registry for the verified Drive folder hierarchy and a server-side resolver for the 15 file categories and nine report artifact groups.
- Preserve existing Brand-first routes for legacy reads and compatibility; do not create another Brand-first tree for new files.
- Store the original Excel workbook independently in the raw schedule folder, keyed to its import batch and not dependent on shift creation or historical execution-source classification.
- Add an admin-only synthetic UAT upload/readback path that uses the fixed test folder and verifies Drive parent, provider ID, bytes, and SHA-256.
- Keep sensitive categories fail-closed while their Drive destination inherits shared/anyone-writer access.

## Impact

Additive database objects and nullable source metadata only. The migration seeds verified folders inactive and does not update existing routes, files, shifts, or provider objects. Production migration, route activation, environment updates, deployment, and authenticated UAT remain release gates.
