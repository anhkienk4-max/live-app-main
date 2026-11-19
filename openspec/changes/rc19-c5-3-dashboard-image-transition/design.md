# Design

## Migration phases

1. **Expand:** execute version `20261102110001` in place of superseded original version `20261102110000`. It adds the existing storage schema/API contract but leaves the bucket public, preserves the public-read policy, and does not rewrite historical screenshot URLs.
2. **Bridge runtime:** deploy the candidate application containing `/api/dashboard-screenshots`. It reads legacy `screenshot_storage_path` objects through authenticated, shift-scoped Storage access and Drive-backed file references through the authenticated provider path.
3. **Contract:** after authenticated readback and the rollback window, deliberately execute the separately versioned `20261108135227` contract migration with explicit session attestations. The migration checks the expected public expand state and scoped read policy before privatizing the bucket and removing the public-read policy.

The contract migration is stored under `scripts/rc19-c4-migration-rehearsal/proposed-migrations/`, not `supabase/migrations/`; normal `db push` therefore cannot activate private visibility during the initial release.

## Rollback boundary

Before phase 3, rollback to the currently deployed legacy application is compatible. After phase 3, rollback is supported only to a proxy-capable application release. If the release process requires rollback to the current pre-proxy deployment after phase 3, do not run the contract migration.

## Source and evidence boundaries

- Original migration SQL is archived byte-for-byte and remains hash-verifiable.
- The active migration directory contains one replacement version and the remaining 19 existing files.
- No screenshot URL data is rewritten by the expand migration or the future contract migration.
- All PostgreSQL rehearsal writes use a database marked disposable; no Production connection is used.
