# OPS P0 — Calendar read-path baseline and staged validation

Status: **DRAFT / STAGING-ONLY / NOT APPROVED FOR PRODUCTION**

Source base: `main` at `28f904a40f361ff6863f827309c136a0c98329b0` (17 Oct 2026).
Production Supabase reference observed read-only: `egdjnpmoasarrttvhgds`.

## Evidence from Production before changes

The figures below are cumulative `pg_stat_statements` aggregates since its last reset on
2026-10-05 14:21:28 UTC. They are **not user-perceived p95 latency** and may include UAT traffic.

| Path | Calls | Mean SQL execution | Maximum SQL execution |
| --- | ---: | ---: | ---: |
| `get_shift_list_page` | 405 | 1,020.77 ms | 7,891.32 ms |
| Direct `shifts` query signature (one observed variant) | 219 | 767.47 ms | 2,166.69 ms |
| `get_swap_list_page` | 46 | 827.09 ms | 3,172.03 ms |
| `get_report_list_page` | 32 | 598.92 ms | 1,603.93 ms |
| `get_shift_staffing_summary` | 1,800 | 48.08 ms | 311.30 ms |

Database size was approximately 92 MB. An ordinary October range filter is planned with
`shifts_calendar_idx` already in place. Further SQL/RLS tuning must use role-realistic
`EXPLAIN (ANALYZE, BUFFERS)` **in an isolated environment**, not Production.

## P0 change scope

- Calendar still fetches a bounded 50-row paginated API.
- After page 1 establishes the total count and authorization owner, remaining requests
  are issued in groups of **at most two in flight**. This is an intentional conservative
  cap; higher parallelism can overwhelm Production during concurrent use.
- Responses are reassembled by page number regardless of network completion order.
- Reject changed owner, changed total, wrong page, missing rows, duplicate IDs, or abort.
  Never silently render a partial Calendar.
- Shift collection responses expose `Server-Timing` phases:
  `auth`, `shift_rpc`, `staffing`, `total`.
  Timings contain no user IDs, brand IDs, authorization tokens or query parameters.
- **No** changes to RLS, business authorization, SQL migrations, payroll, storage,
  environment targeting, authentication or Production database.

## Required validation before merging

1. Run TypeScript, lint, all Node regression tests, and current browser suites.
2. With a staging database representative of Production, compare network waterfall
   and server phases for 0, 50, 51, 117, 200 and 1,000 visible shifts.
3. Validate with Admin, Leader and Member. Check that no unauthorized shift,
   registration, payroll, or personal data is rendered.
4. Exercise changes between page requests, aborted navigation, high-latency requests,
   failing page 2 and concurrent Calendar viewers.
5. Measure at 1, 10, 50 and 100 concurrent viewers; record p50/p95 API, `shift_rpc`
   time, database CPU, active connections, error rate and request amplification.
   **Do not deploy** if lower latency for one user increases DB queueing/errors
   under concurrent load.
6. Run production-equivalent UAT, verify the actual Vercel production commit/env,
   and obtain a reviewed PR. A passing unit suite alone is not a release approval.

## Next database-focused P0 iteration

- Capture authenticated plans for `get_shift_list_page`, its filtered ID selection,
  and `private.can_read_shift` using an isolated clone with scrubbed test identities.
- Investigate per-row RLS overhead, correlated conflict checks and pagination cost;
  preserve existing member privacy and fail-closed semantics.
- Test candidate indexes against observed query plans rather than applying all
  Supabase linter suggestions.
- Evaluate a single bounded calendar-window endpoint only after comparing database
  load and consistency with this conservative client change.

Rollback: revert the PR; no migration or data backfill is required.
