# RC19 C5.3 dashboard image visibility transition

## Summary

Replace the first C4 storage migration in the active chain with a versioned expand migration that preserves existing public image reads. Keep private bucket activation in a separately versioned contract migration outside the automatic Supabase migration directory.

## Motivation

The live Production deployment `dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS` was created before the candidate screenshot proxy source commit and returns 404 for `/api/dashboard-screenshots`. Applying the original first migration would privatize `live-dashboard-images` before that runtime can read through the authenticated proxy.

## Scope

- Preserve the original `20261102110000` SQL byte-for-byte under the rehearsal archive.
- Replace its active-chain entry with `20261102110001`, retaining schema additions and the scoped authenticated read policy while deferring bucket privatization and removal of the public-read policy.
- Add a future versioned contract migration with explicit proxy and rollback-target attestations; keep it outside `supabase/migrations` until release approval.
- Keep existing `screenshot_url` values unchanged during expand. The bridge application derives an authenticated proxy URL from persisted storage metadata.

## Rollback contract

Before private activation, the legacy Production app remains a valid rollback target because the bucket and stored public URLs remain available. After private activation, rollback is limited to an application release that contains the authenticated screenshot proxy; rollback to the pre-proxy deployment is unsupported.

## Non-goals

- No Production SQL, deployment, alias, flag, bucket visibility, or data change.
- No change to approved original SQL bytes or historical hashes.
- No public access after the deferred contract migration is deliberately applied.
