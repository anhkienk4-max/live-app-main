# OPS P0 — Existing Clean Staging / RC16K Read-RPC bridge UAT

## Status — 2026-10-18

**APPLIED AND VERIFIED ON EXISTING FREE STAGING ONLY.**
Database project `amagnzebmmuqiptmrjmc` (PostgreSQL 17).
Production project `egdjnpmoasarrttvhgds` was NOT modified.
No branch/project was purchased or created. Existing staging was NOT reset.

Tracked source:
`supabase/reconciliation/ops-p0-staging/rc16k_list_bridge.sql`.
Apply name: `ops_p0_staging_rc16k_four_read_rpc_bridge`.
Rollback source:
`supabase/reconciliation/ops-p0-staging/rollback_rc16k_list_bridge.sql`.

The migration is a **narrow bridge**, NOT a replay of full RC16K,
NOT a full staging/production schema sync, and not a Production migration.
It installs only four unmodified function bodies sourced from
`supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql`:

- `private.filtered_shift_ids(text,jsonb)`
- `public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean)`
- `public.get_report_list_page(integer,integer,jsonb,boolean)`
- `public.get_swap_list_page(integer,integer,jsonb)`

Before applying, two complete dry runs executed inside `BEGIN`/`ROLLBACK`
with Staging database-backed `auth.uid()` claim context.
Admin, Leader and Member read-path smoke tests passed.
An independent post-rollback SELECT proved the four functions remained absent.

The staging-only migration was then applied with a constrained
preflight guard (no `operational_files` or `workforce_payroll_lines`,
expected existing `can_read_shift` / `get_shift_staffing_summary` hashes,
four RPCs absent). Supabase reported `success: true`.

## Post-apply fingerprint and ACL evidence

| Function | Production-definition MD5 | Staging actual MD5 | SECURITY INVOKER | Authenticated EXECUTE | Anon EXECUTE | Service role EXECUTE |
| --- | --- | --- | --- | --- | --- | --- |
| `private.filtered_shift_ids` | `bdb629b93dfa26cc9d6c234a1e875581` | MATCH | Yes | Yes | No | No |
| `get_shift_list_page` | `a87046c601b7591d584fd494b8d84913` | MATCH | Yes | Yes | No | No |
| `get_report_list_page` | `297bca1d0c7faad09cf298b59b42127b` | MATCH | Yes | Yes | No | No |
| `get_swap_list_page` | `b0db928a367c71ed1da736d8b1b4273d` | MATCH | Yes | Yes | No | No |

Only read-RPC functions were created. No business data rows were inserted,
updated or deleted.

## Staging data-preservation check

| Entity | Before | After |
| --- | ---: | ---: |
| shifts | 79 | 79 |
| shift_registrations | 43 | 43 |
| reports | 9 | 9 |
| business_users | 12 | 12 |
| operational_storage_routes | 2 | 2 |
| report_images | 3 | 3 |
| live_report_images | 1 | 1 |
| swap_requests | 6 | 6 |
| audit_logs | 1,398 | 1,398 |

Post-apply database size displayed `30 MB`; one successful migration
history entry exists under the bridge name.

## Read-only caller-role smoke test (Staging rows, session-claim simulation)

**Not actual Supabase-issued JWT sessions.**
The SQL transaction selected one already-linked ACTIVE staging account per
role, set `request.jwt.claim.sub`, then `SET LOCAL ROLE authenticated`.
No identifier, JWT token, business names or report details were extracted.

| Role | Visible shift total | Mine | Visible reports | Visible swaps | Page <= 10 |
| --- | ---: | ---: | ---: | ---: | --- |
| Admin | 70 | 0 | 5 | 6 | PASS |
| Leader | 70 | 6 | 5 | 6 | PASS |
| Member | 17 | 8 | 2 | 4 | PASS |

One more Member test confirmed the first 50-row page had bounded results,
every row had an ID, and no returned registration belonged to another
business user (all checks true).

These are smoke tests only; 70/17 counts reflect existing scoped RLS,
archived/deleted rows and selected example roles, not total table counts.

## Remaining release blockers

1. Staging has NOT been upgraded to full RC15/RC16 schema parity. It is
   missing `operational_files`, payroll tables and other RC16K RPCs.
2. RC13A was applied on Staging historically while Production took a
   different forward-compatible RC15 migration path. **Do not replay both
   histories or mark absent versions applied without reviewing dependencies.**
3. Before deploying Calendar code to staging, ensure its `get_staff_workload`
   and other referenced RPCs exist or are separately reconciled.
4. Run real HTTP/PostgREST/JWT integration, fail-closed negative tests,
   web-role UAT, and storage/payroll workflows on an approved staging build.
5. Load testing with thousands of synthetic rows should remain on isolated
   PostgreSQL (no data pollution or workload spikes on shared Staging).
6. The experimental Admin/Leader RLS shortcut from Performance PR #35 was
   **NOT** installed on Staging.
7. Production deploy/merge is still **NO-GO**, even though this Staging bridge
   was successfully applied.

## Rollback

If a regression is confirmed, first stop all staging readers of the four
RPCs. Verify four function fingerprints exactly match this bridge and that
no follow-up migration depends on them. Then execute the guarded rollback
SQL on **Staging only**. Supabase migration-history bookkeeping must be
reconciled separately; do not directly edit the migration ledger.

Rollback does not modify tables, file metadata, Auth users or shifts.
