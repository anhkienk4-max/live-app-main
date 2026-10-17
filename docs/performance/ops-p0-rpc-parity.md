# OPS P0.2 — Shift RPC / RLS performance parity gate

**Status: HOLD — Staging is not schema-equivalent to Production.**

Read-only audit date: 2026-10-17. Source baseline: `main` at `28f904a40f361ff6863f827309c136a0c98329b0`.

## Verified targets

| | Production | Staging |
| --- | --- | --- |
| Supabase project ref | `egdjnpmoasarrttvhgds` | `amagnzebmmuqiptmrjmc` |
| `private.can_read_shift(text)` | MATCH | MATCH |
| `private.filtered_shift_ids(text,jsonb)` | MATCH | **MISSING** |
| `public.get_shift_list_page(...)` | MATCH | **MISSING** |
| `public.get_shift_staffing_summary(text[])` | MATCH | MATCH |
| `public.get_swap_list_page(...)` | MATCH | **MISSING** |
| `public.get_report_list_page(...)` | MATCH | **MISSING** |

Matched/missing verified by `scripts/performance/ops-p0-shift-rpc-parity.sql`.
A `MISSING` status is an exact signature absence, not a statement about unrelated overloads.

Staging's latest recorded migration in `supabase_migrations.schema_migrations` is
`20261008160645` (`repair_report_revision_history_rpc`).
Production's latest recorded migration is version `20261014173408`, named
`20261012171503_rc16k_bounded_shift_lists`. The repository file is
`supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql`.
**Migration name and recorded version differ in Production**; verify the
deployment provenance and version mapping. Do not mark a new version as applied
or replay SQL blindly. Production also contains other newer RC15/RC16 migrations
that are absent from Staging. Conversely, Staging records two earlier\nmigrations, `20260919074349_rc12_report_file_provider` and\n`20260924000000_rc13a_execution_source_storage_routes`, that do **not** appear\nin Production migration history. RC15 Production includes storage prerequisites\nthat may cover some of this schema without the same version lineage. This is a\n**bidirectional migration-history divergence**, not a simple missing last patch.\nRun a complete schema and dependency comparison on a disposable clone before\nproposing any reconciliation migration; never copy Production history rows.\n\n## Production performance baseline (cumulative, not p95)

Recorded by `scripts/performance/ops-p0-shift-rpc-stats.sql`.
`pg_stat_statements_info.stats_reset`: 2026-10-05T14:21:28Z.

| Operation | Calls | Weighted SQL mean (ms) | Max SQL (ms) |
| --- | ---: | ---: | ---: |
| `get_shift_list_page` | 405 | 1,020.77 | 7,891.32 |
| `get_shift_staffing_summary` | 1,800 | 48.08 | 311.30 |
| `get_swap_list_page` | 46 | 827.09 | 3,172.03 |
| `get_report_list_page` | 32 | 598.92 | 1,603.93 |
| `update_report` | 9 | 1,336.65 | 2,400.30 |

Do not compare with Staging as a speed A/B test: it currently lacks the same
code paths, carries different data distribution and has a different statistics
reset horizon.

## Critical path and hypotheses

`components/features/calendar/CalendarView.tsx`
→ `lib/services/calendarWindow.ts`
→ `GET /api/operations/collection?entity=shifts`
→ `lib/server/operationsCollectionHandler.ts`
→ `public.get_shift_list_page`
→ `private.filtered_shift_ids` → `public.shifts` (RLS
`private.can_read_shift(shifts.id)`)
→ `public.get_shift_staffing_summary`
→ response.

Candidates to measure, **not confirmed root causes**:

1. Correlated registration conflict check per selected shift.
2. Per-row RLS function and nested indexed lookups.
3. Filter validation, sorting, total count and aggregate subqueries.
4. Secondary staffing RPC, especially over repeated windows.
5. Sequential request chains, plus effect of P0.1 two-request concurrency
   under many logged-in users.

The Calendar date index `shifts_calendar_idx` already exists and was selected
by the planner for a simple October range filter; blindly adding indexes is
not an adequate response.

## Safe remediation plan

1. Reconcile schema and migration provenance **without writing to Production**.
   Prefer a disposable clone or carefully reviewed Staging reconciliation,
   preserving Staging data and auth. Do **not** delete or replace Staging.
2. Confirm six-function fingerprint parity for the test baseline. Note that
   a legitimate new optimized definition will deliberately show `DIFFERENT`;
   in that case re-baseline after reviewing the exact changes.
3. Build representative sanitized workload: 0/50/117/1,000/10,000 shifts,
   multiple staffing registrations per shift, Member/Leader/Admin JWT
   identities and realistic brand/date filters.
4. Measure `EXPLAIN (ANALYZE, BUFFERS)` **only against isolated/test data**,
   with real authenticated RLS context, and record plan/rows/loops.
   Production remains **read-only EXPLAIN without ANALYZE** unless a separately
   reviewed low-risk procedure explicitly authorizes execution.
5. Compare candidate SQL/index changes using `p50/p95`, DB CPU, active
   connections, RLS privacy matrix, and logical correctness, with 1/10/50/100
   concurrent users; prefer measurable improvements with no error increase.
6. Commit SQL changes in a *separate migration PR* after tests; do not modify
   `public` SECURITY DEFINER privileges or turn off RLS to improve speed.

**Release gate:** No Production deploy/merge based on this audit. Existing
`PR #34` is a bounded client-side Calendar improvement whose CI passing
alone does not prove live staging behavior or load capacity.

## Executing the read-only diagnostics

Run the two SQL files with an authenticated database read-only operator or
the connected Supabase SQL executor on each target. The output contains
aggregate performance metrics, definitions' hashes and migration metadata;
no personal records should be retrieved. Do not put service keys or database
passwords into files, terminal history, or issue comments.
