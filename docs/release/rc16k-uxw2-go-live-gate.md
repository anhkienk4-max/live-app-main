# RC1.6K + UX-W2 Milestone A evidence and migration gate

Decision: **NO-GO pending final CI, authenticated UAT and approved migration execution**. No Production writes were performed.

## Git and Production baseline

- Handover integration head: `136cab4d4e77916dca50b35ede660593e45c9fbd`.
- Live fetched main: `4f03c0b881bcc77547e72a2d5c655b07690746d6`; previous local `origin/main=662f3007` was stale.
- Merge-base: `a074a7d5fe80735c60fdbc7fc5381f9a5cb2ac15`. Main-only commit is the PR #27 merge. `git diff HEAD...origin/main` was empty before reconciliation; no new security/RBAC/Storage/pagination source delta.
- Main reconciled into integration by history-preserving merge `029bcdea3f915289555012116b86311e109c2c67`, without conflicts. PR #30 remains Draft/open; no merge into main.
- Vercel CLI verified Production READY for main SHA above at `livestream-ops-demo-fk179b0d8-livestream2.vercel.app`; deployment API confirmed the Production aliases and exact Git SHA; inspection of `ops5729.top` resolves deployment `dpl_9RY5JjwLZhsdzqqSKM3awBk3A7ce`. Handover Preview READY for `136cab4d` at `livestream-ops-demo-72r7k4c9c-livestream2.vercel.app`. Deployment metadata is not authenticated runtime UAT.
- Vercel connector lacked project access; existing CLI credentials supplied the read-only evidence.

## Existing Workforce CI failure

Run https://github.com/anhkienk4-max/live-app-main/actions/runs/38614599022 at `136cab4d`: PG16/Node22 and PG17/Node24 both **FAIL** at canonical project-memory validation. All preceding SQL, typecheck, full ESLint, full release manifest, browser, Storage dependency and production build steps passed. Logs identify stale repository.head, repository.branch and repository.origin_main in `project-memory/current-state.json`. No browser failure caused this result. Artifacts: `11919509611` (Node22), `11921277273` (Node24).

Canonical memory must be synchronized after the implementation commit and committed separately so the recorded implementation SHA remains an ancestor with only memory changes afterward. This preserves the existing validator rather than weakening it.

Final-candidate run `38679044302` at `0ed20b9` exposed a separate real picker race in PG16/Node22: the new filter regression opened the old Confirmed target after search changed. Artifact `11948726168` includes the exact trace and screenshot. Search hid the old list before deferred-search effect cleanup invalidated the parent staffing request. Cancellation now runs synchronously in search/date/page events. The strengthened regression dispatches input and resolves staffing in the same browser task; it reproduced the failure locally before this fix, then passed five repeated runs after the fix. All eleven Reports browser regressions, focused lint and typecheck subsequently passed. Assertions and timeouts remain unchanged. CI for the subsequent source SHA is required; earlier green workflows do not cover this fix.

## Production SQL and ledger reconciliation

Read-only snapshot: `rc16k-uxw2-production-schema-snapshot.json`, project `egdjnpmoasarrttvhgds`. It records actual `pg_get_functiondef`, regprocedure signatures, ACLs, security modes, search_path, table RLS/policies and indexes.

- Ledger `20261014173408` is named `20261012171503_rc16k_bounded_shift_lists`, with joined-statements MD5 `5b72cf4d6aea5c63e0bc143d99c5da7a`. The filename version is not the applied version.
- The full applied ledger SQL (one 47,750-character statement) was fetched read-only and compared with source. The only substantive difference is the source hunk adding direct assignment/report-submitter to `mine`; the other difference is final whitespace. The applied SQL contains the registration-only predicate.
- Actual `get_report_list_page(integer,integer,jsonb,boolean)` lacks whole-filter `summary` and shift-title search.
- Actual `private.filtered_shift_ids(text,jsonb)` lacks direct assignment and report-submitter Reports candidates.
- Actual `private.can_read_shift(text)` lacks submitter-only shift access; changing only the picker predicate cannot bypass caller RLS.
- `20261014233900` Reports summary and newly generated CLI version `20261014190429` were both absent from the Production ledger at verification.
- Existing list/metric/analytics RPCs are SECURITY INVOKER, with empty search_path and only postgres/authenticated EXECUTE. Existing `can_read_shift` is SECURITY DEFINER with the same ACL/search_path boundary. Tables have RLS and authenticated SELECT only.
- Reports active-table policy permits active-user report reads; the paged RPC intersects these with shift RLS. This migration does not broaden the underlying Reports table policy.

Forward delta: `supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql`. It replaces only three existing signatures: `can_read_shift`, `filtered_shift_ids`, `get_report_list_page`. It guards required baseline functions, preserves existing owners/grants/security modes, performs no row writes, and changes no Storage or Workforce objects. Historical migrations are unchanged. Pinned new-delta SHA256: `40572a4684f7315c26e25def3db1c971eef1f4bf49de8851df5dbe393e040cbc`.

**Do not run a blind `supabase db push`:** the original `20261012171503` version is missing even though its SQL is already applied under `20261014173408`; replay would hit existing functions. An approved operator must pin the new delta/hash and target and apply that exact forward migration once, after backup/restore and schema preflight. No ledger editing or historical replay is part of this plan. The new delta includes the missing summary body, so the older summary file need not be separately replayed on Production.

Rollback: before commit, abort the transaction. After commit, restore the three captured pre-change definitions through a separately approved compensating migration; do not edit/delete migration history. No data restoration is needed for this function-only delta. Rehearsal tests rollback to a savepoint and repeat application, checking ACLs and policies before/after.

## Implementation and validation boundaries

Reports modal context now loads target registrations instead of current-page registrations; exact shifts, reports and existing user directory feed the modal. Manual assignments and the authoritative privacy-safe staffing summary contribute to the form role display. A separate target request version invalidates stale identity/filter/page/selection and close responses. Finalized targets also reject unrelated Members in the shared target resolver.

New evidence comprises actual PostgreSQL RPC/RLS checks, runtime collection handler tests for all three roles and mounted `/reports` browser tests at 390/768/1440/1920 with deferred staffing responses. Browser fixtures do not represent signed-in Supabase or physical provider UAT.

Local PG17 and PG16 broad rehearsals each passed 90 assertions. Focused Reports rehearsal passed 21 assertions. Eleven mounted browser cases passed: four widths, delayed account/close/filter responses, privacy-safe staffing, a Support Member's picker, an owner's draft review boundary and latest-selection wins. The filter-race regression first reproduced stale selection opening a modal after the picker search changed; picker invalidation now cancels the container's target request too. An earlier local PG16 broad run timed out in the pre-existing 1000-row baseline loop; limits were not raised. Fixture ANALYZE supplies real planner statistics, and the report shift/submitter indexes mirror the captured Production definitions. A sequential broad PG16 run subsequently passed without changing timeout limits; final GitHub matrix remains required. Performance figures from isolated authenticated-Member fixture EXPLAIN are not Production-load evidence.

Full local release manifest with checked-in Shopee/TikTok screenshot environment variables: **1628 PASS, 0 FAIL, 3 SKIP**; only the three named opt-in staging checks were skipped, as allowed by the unchanged gate. Full ESLint: 0 errors, 24 warnings. TypeScript, secret-free CI build and canonical memory validation passed. The historical GL-03 gate fields stay pinned by the existing validator; current Git baseline is recorded in `repository.origin_main` and this evidence, without changing policy rules.

## Remaining gates

- P0: final-head convergence/Storage/Workforce CI conclusions; approved exact-delta migration application and postconditions; authenticated Reports create/draft/edit/review/confirm/deep-link and denied-member UAT.
- P1: physical Drive/OneDrive upload/read/delete evidence using approved routes; responsive authenticated UAT; all-filter export on multi-page authorized data; full schema-clone/backup/restore rehearsal (function snapshots plus repository DDL are not a complete Production clone).
- P2: Storage provider/name filters remain page-local per existing approved UI disclosure; no server-search contract was added.

The user identified the available database target as PRODUCTION and plans to connect permitted role sessions. Browser connections remain unavailable at this checkpoint. Production verification is read-only under the current authorization. Reports create/draft/edit/review/confirm and provider upload/delete remain BLOCKED until an explicitly authorized non-Production environment, migrated schema, role sessions, multi-page test dataset and approved provider test routes are available. Do not send passwords/tokens in chat.
