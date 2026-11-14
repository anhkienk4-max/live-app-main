# C12 Audit History PostgreSQL 17 evidence

Environment: isolated WSL PostgreSQL 17.11, local loopback only, database `c12_audit_rehearsal`, database marker `CODEX_DISPOSABLE_C12_AUDIT_PG17`. The fixture is synthetic and contains 45,000 audit rows with a simplified test-only permission function. It is not a copy of Production data or a Production query plan.

Migration under test: `supabase/migrations/20261112120000_rc19_audit_history_keyset.sql`, SHA-256 `45270D6304A0A4030FB87248B71B1D3879165B1A99279B6CD25281E072829EF7`.

## Plan comparison

The same legacy PostgREST-shaped page plus exact-count query was explained before and after the policy change inside a transaction; the original policy was restored by rollback. Before C12, the plan performed an RLS-filtered sequential scan of 45,002 rows and took 96.798 ms on the synthetic database. With the semantics-preserving scalar-subquery policy, PostgreSQL emitted permission checks as `InitPlan`s, scanned the same 45,002 rows for exact count, and took 13.747 ms. This verifies the policy helper is initialized once per statement in this fixture; exact count still scales with the visible relation and remains removed from the new API.

The bounded 20-row RPC benchmark ran 20 samples on the same database. The legacy exact-count query measured p50 3.413 ms, p95 5.314 ms, max 7.489 ms; the bounded RPC including JSON page construction measured p50 0.838 ms, p95 2.202 ms, max 2.599 ms. These are warm local synthetic measurements, not Production latency guarantees.

The default planner used the existing `audit_logs_created_at_idx` plus incremental sort for the small synthetic timestamp tie groups; the full-row page plan took 0.106 ms. With incremental sort disabled only as a plan diagnostic, the full-row bounded query used `audit_logs_cursor_created_at_id_idx` and took 0.067 ms. The setting was not applied to the database or migration. The composite index provides a matching stable-order access path but was not selected by the default planner for this fixture.

## Production evidence and limits

Read-only Production logs recorded two Audit History HTTP 500 / SQLSTATE `57014` failures on 2026-11-11 at 16:31:24.530 UTC and 16:32:26.816 UTC. Both statements used PostgREST `count=exact`, `LIMIT 20 OFFSET 0`, and a full visible-row count. Production had approximately 45,870 live audit tuples. The existing `private.rbac_has_permission` is `STABLE SECURITY DEFINER` with an empty search path and reads effective permission state; inline RLS invoked it in the per-row predicate. The new scalar-subquery form preserves the permission expression and encourages per-statement evaluation. No Production query was altered or executed by this change.

Checks on isolated PostgreSQL: migration applies; Admin 45,000-row keyset traversal has no duplicates or losses; a new event committed after page one is excluded from the original snapshot; Brand ID filtering returns only events whose before/after metadata matches; Leader sees only allowed modules without total-count leakage; Member receives no rows; anonymous EXECUTE is denied; malformed date/filter input is rejected. Evidence log: `test_reports/c12-pg17-acceptance.log` (local ignored test artifact).

## Release limit

The Gemini-owned Audit History UI still calls the legacy offset/count path until G12 integrates `auditService.getAuditHistoryPage`. The timeout is therefore not considered closed for users until an exact integrated SHA is authenticated-tested as Admin and Leader. Production migration execution and authenticated Production/staging UAT were not performed.
