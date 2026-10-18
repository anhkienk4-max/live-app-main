# OPS P0 — Existing Clean Staging / RC16K Read-RPC bridge UAT

## Status — 2026-10-18

**BOTH STAGING BRIDGES APPLIED AND VERIFIED — 13/14 RC16K FUNCTIONS.**
Database project `amagnzebmmuqiptmrjmc` (PostgreSQL 17).
Production project `egdjnpmoasarrttvhgds` was NOT modified.
No branch/project was purchased or created. Existing staging was NOT reset.

Tracked source:
`supabase/reconciliation/ops-p0-staging/rc16k_list_bridge.sql`.
Apply name: `ops_p0_staging_rc16k_four_read_rpc_bridge`.
Rollback source:
`supabase/reconciliation/ops-p0-staging/rollback_rc16k_list_bridge.sql`.

The first migration is a **narrow bridge**, NOT a replay of full RC16K,
NOT a full staging/production schema sync, and not a Production migration.
It installs four unmodified function bodies sourced from
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
3. Calendar/Staff/Review/History/Analytics READ RPCs were reconciled in
   the second migration. The full HTTP/Next.js staging route flow, JWT and
   Storage/Payroll dependencies must still be tested.
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


## Live read-only SQL timing observation

A single role-scoped `EXPLAIN (ANALYZE, BUFFERS)` on existing Staging,
using one active Leader's `auth.uid()` session-claim simulation, measured
`get_shift_list_page('all',1,50,'{}')` at **386.452 ms SQL execution**,
with **5,386 shared buffer hits**. This is **one call**, not a p95,
an isolated synthetic load benchmark, or a Production performance estimate.

## Supabase database advisors (post-apply)

Security/performance advisors were queried after applying the four-RPC
bridge. They continue to flag several existing schema areas, including
`private.audit_action_for_change` mutable `search_path`, an anonymously
callable `public.submit_account_request` security-definer function
(which may be intentionally public for signup), 72 authenticated
security-definer function notices, 30 potentially unindexed foreign keys,
and other informational advisories.

None of the four installed functions is `SECURITY DEFINER`; the verified
execute ACL for each is authenticated-only. The advisor output does not
establish that all other existing warnings are newly introduced or exploitable.
Review each against its intended authorization model before remediation.
Reference:
https://supabase.com/docs/guides/database/database-linter

## Second staging-only migration: nine additional read RPCs

After the first bridge passed runtime/role smoke tests, the same Staging
project received migration
`ops_p0_staging_rc16k_remaining_read_rpc_bridge`, sourced verbatim from
the canonical RC16K SQL:

- `public.get_staff_workload`
- `private.rc16k_report_metric`
- `public.get_analytics_snapshot`
- `public.get_registration_review_page`
- `public.get_registration_review_context`
- `public.get_schedule_change_page`
- `public.get_audit_actor_page`
- `public.get_live_update_page`
- `public.get_archived_entity_page`

Each uses **SECURITY INVOKER**, `anon` EXECUTE=false,
`authenticated` EXECUTE=true, and `service_role` EXECUTE=false.
All nine post-apply function-definition hashes were compared DIRECTLY
against Production and **matched**.

The second bridge underwent transactional `BEGIN`/`ROLLBACK` dry-run
on existing Staging before applying. Read-only Admin smoke before apply:

| Endpoint | Observed result |
| --- | ---: |
| Registration review | 36 |
| Schedule history | 0 |
| Audit actors | 4 |
| Archived entities | 13 |
| Analytics confirmed reports | 2 |
| Empty staff workload | 0 rows |
| Live-update history for visible shift | 0 |

After apply, Leader with a staging test claim also succeeded on
registration review (36), change history (0), audit actor list (4),
empty workload and analytics snapshot (2).

Member fail-closed regression (all four **PASS**, SQLSTATE 42501):
`get_staff_workload`, `get_registration_review_page`,
`get_schedule_change_page`, and `get_archived_entity_page`.
Tests were read-only and returned no personal records.

There are now **13 of 14** RC16K functions from the source migration on
existing Staging. Only `get_payroll_period_snapshot` remains omitted,
intentionally, because Staging still lacks the RC16 payroll tables and
the function is service-role-only and financially sensitive.

Verified unchanged row counts after second bridge:
79 shifts, 43 registrations, 9 reports, 12 business users and
1,398 audit rows. Exactly two staging bridge migration-history records
are present.

Second bridge source:
`supabase/reconciliation/ops-p0-staging/rc16k_remaining_read_rpc_bridge.sql`.

Rollback, if necessary, guarded by exact function-definition fingerprints:
`supabase/reconciliation/ops-p0-staging/rollback_rc16k_remaining_read_rpc_bridge.sql`.

**Both migration scripts are Staging-only reconciliation artifacts,
not repository `supabase/migrations` for Production deployment.
Never merge their SQL into a Production release migration automatically.**

## Remaining structural parity, catalog-verified after both bridges

App-owned relation inventory (`public` and `private`):
**Production 29**, **Staging 22** (no extra relations in Staging).
Exactly these seven are still missing:

1. `public.operational_files`
2. `public.workforce_actual_segments`
3. `public.workforce_payroll_audit`
4. `public.workforce_payroll_audit_id_seq`
5. `public.workforce_payroll_lines`
6. `public.workforce_payroll_periods`
7. `public.workforce_rate_cards`

In the same metadata scope, Staging functions increased from **154 to 167**
versus **178** on Production. RLS policy count/hash remains identical
at 30 policies. Staging still has 439 columns vs Production 544,
100 indexes vs 122, 45 triggers vs 51, 203 constraints vs 279.

This means missing schema is now concentrated heavily in **Operational
Files and Workforce/Payroll**. It is NOT safe to equate 13/14 RC16K RPC
parity with overall data-schema or functional app parity. Preserve both
existing Staging storage routes when preparing the next targeted
forward-compatible migration; avoid replaying the old RC13A
`create_shift`/`update_shift` bodies.
