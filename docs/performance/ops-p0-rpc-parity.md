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

## Schema-shape comparison — additional evidence

Executed the read-only `scripts/performance/ops-p0-schema-shape.sql` against
both databases (eight critical tables). Shape hashes cover column order, names,
data types and nullability; index hashes compare the text of index definitions.
They are a **subset catalog inventory**, not proof of full schema equality.

| Table | Production | Staging |
| --- | --- | --- |
| `shifts` | 42 columns, 11 indexes | 42 columns, 11 indexes; hashes MATCH |
| `shift_registrations` | 16 columns, 5 indexes | 16 columns, 5 indexes; hashes MATCH |
| `reports` | 44 columns, 6 indexes | 44 columns, 6 indexes; hashes MATCH |
| `swap_requests` | 30 columns, 8 indexes | 30 columns, 8 indexes; hashes MATCH |
| `business_users` | 23 columns, 7 indexes | 23 columns, 7 indexes; hashes MATCH |
| `operational_storage_routes` | 19 columns | **14 columns**, hash DIFFERENT |
| `operational_files` | 24 columns | **MISSING** |
| `workforce_payroll_lines` | 20 columns | **MISSING** |

This establishes that the parity gap extends beyond four list RPCs. Staging
does not reproduce the RC15 operational-file or RC16 payroll data path and
cannot be a reliable **full-app UAT** target until reconciled. Do not
treat the matching column/index hashes of five tables as sufficient to
claim their triggers, grants, RLS policy text, constraint semantics, function
dependencies, or row distributions are identical.

## Isolated performance probe

`tests/rc16k-pagination-postgres.integration.mjs` now extends the existing
rollback-only PostgreSQL 16/17 fixture from 1,001 to 5,001 synthetic shifts,
asserts the Leader's filtered shift-list count, and prints
`EXPLAIN (ANALYZE, BUFFERS)` for a bounded SQL read and list RPC.
The fixture is deliberately synthetic and must remain isolated; results
must not be interpreted as Production p95 or concurrency capacity.
All inserts and ANALYZE statements occur in the fixture transaction,
which ends with `ROLLBACK`. This CI probe is **pending verification**
until the new workflow run completes.

## Confirmed isolated role test result — PG16/17

The focused isolated GitHub Actions run
[`39048073311`](https://github.com/anhkienk4-max/live-app-main/actions/runs/39048073311)
**PASSED** both Node/PostgreSQL pairs after raising the harness child-process
timeout to 600 seconds. Both ran **81** regression/authorization assertions
with rolled-back test data. Important: no real Supabase Auth JWT was used.

| Isolated fixture | Baseline date-range SELECT | Baseline shift-list RPC | Candidate RLS shift-list RPC |
| --- | ---: | ---: | ---: |
| PostgreSQL 16 / Node 22 | 1,826.755 ms | 4,186.173 ms | 173.817 ms |
| PostgreSQL 17 / Node 24 | 787.759 ms | 1,566.010 ms | 78.936 ms |

All values are **one-run SQL EXPLAIN execution times**, not average, p95,
production timings, apples-to-apples steady-state measurements, or a guarantee
of any speedup. The candidate is always measured after baseline, so warmer
buffers may bias the difference. The synthetic actor helper is not an end-to-end
Supabase Auth test. Do **not** state that Production has been made 20x faster.

Security and rollout gate remains **HOLD** until real JWT/disabled-account
parity, representative staging schema, replicated load test (1, 10, 50, 100
concurrent viewers), repeated interleaved A/B measurements, no grants/RLS
regressions, and security approval. Candidate stays outside migrations.

## RLS optimization candidate — NOT released

The repository now contains
`scripts/performance/candidates/shift-rls-fast-path-EXPERIMENT.sql`.
It rewrites **only the RLS policy expression** in an isolated transaction:
active Admin and Leader users can take the constant-role fast path;
Member and unknown-role users continue using the existing row-scoped
`private.can_read_shift(id)`. This is an **experiment**, not a migration
and not a deployed fix.

The isolated PG16/17 test captures the complete visible shift-ID sets for
Admin, Leader, Member and unknown actor before applying the candidate policy,
compares them after policy modification, and checks archived/completed
inaccessibility for the Member fixture. All fixture operations are rolled
back. Successful fixture parity still does **not** establish equivalence
for real JWT claims, disabled accounts, privilege grants, payroll exposure
or production load; these require further staging UAT and security review.

Measure the original and candidate `get_shift_list_page` after seeding the
same synthetic 5k shifts. Keep the candidate **out of**
`supabase/migrations` until the isolated role matrix, staging parity,
query plans and concurrent-user benchmarks all pass.

## CI / deployment blockers discovered

For `PR #34`, the RC16 workforce/payroll matrix failed **only** the final
`npm run memory:validate` step (both Node/PostgreSQL variants). Typecheck,
lint, full Node manifest, browser suites and builds completed successfully
in the workflow. The failed validator reports the canonical snapshot:
- `current-state.repository.head` is not an ancestor of the tested branch;
- `current-state.repository.branch` differs from the CI branch;
- `current-state.repository.origin_main` differs from live `origin/main`.

The checked-in `project-memory/current-state.json` describes the historical
`release/rc16l-calendar-export` worktree, NOT the current
`perf/ops-p0-calendar-read-path` branch. This is a **memory provenance
release-gate failure**, not a proven payroll regression. Do not disable or
silently bypass the validator; prepare a separate reviewed memory snapshot
reconciliation, including the generated projection and inventory.

GitHub's `Vercel – live-app-clean` status on `PR #34` is FAILURE,
while `Vercel – livestream-ops-demo` is SUCCESS. Direct build logs are
currently unavailable due to Vercel connection authorization errors, so the
cause cannot be stated. This is an independent Production NO-GO blocker.

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
