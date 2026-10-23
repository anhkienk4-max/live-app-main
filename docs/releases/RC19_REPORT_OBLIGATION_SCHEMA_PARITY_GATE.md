# RC19 | Report Obligation RPC schema parity gate | 2026-10-23

**Release verdict: HOLD for one consolidated Preview / Production.** This document does not mutate any database or provider folder.

## Read-only cross-environment observations
| Signal | Staging `amagnzebmmuqiptmrjmc` | Production `egdjnpmoasarrttvhgds` |
|---|---|---|
| `public.get_report_obligation_page` exists | **NO** | **YES** |
| `supabase_migrations.schema_migrations` contains version `20261021120000` | **NO** | **NO** |
| `public.self_attendance_record` exists | **YES** | **NO** |
| `public.operational_storage_routes` table exists | **YES** | **YES** |
| Active Storage Routes | **2**, Drive, one brand | **0** |
| `public.operational_files` metadata rows | **0** | **0** |

**Read-only function comparison completed after initial audit**: `pg_get_functiondef` for Production `public.get_report_obligation_page(integer,integer,jsonb)` has the same full PL/pgSQL body as the canonical GitHub SQL **after normalizing whitespace**, including the actor/permission guards, filter validation, RLS-scoped query and page envelope. Production has `SECURITY INVOKER` (`prosecdef=false`), `authenticated EXECUTE=true`, `anon EXECUTE=false`. This confirms the reviewed *function body and examined access signals*, not complete migration provenance. The version `20261021120000` is still absent in both ledgers, so migration ordering remains a blocker. Do not promote the staging-only self-attendance migration to Production without the proper release gate and rollback.

## Source and transient test evidence
- Canonical source: `supabase/migrations/20261021120000_global_report_obligation_page.sql`.
- The canonical SQL was compiled in **staging inside BEGIN/ROLLBACK** with an authenticated Leader and separately with a Member. JSON response shape, pagination, date range and invalid filter rejection passed. **The transaction was rolled back; staging RPC remains absent.**
- Production database was only read, never altered.
- UI call site in `lib/services/dataService.ts`: `getReportObligationPage`; Reports #77 cannot complete authenticated staging UAT until the RPC is present.

## Approval-gated, version-safe reconciliation
1. Read `pg_get_functiondef` and `pg_get_function_identity_arguments` for the Production RPC. Compare *body, permissions, security invoker/definer, search_path and grants* to exact tracked SQL, not just function name.
2. Diff complete migration ledger and approved release manifest across both projects. Inspect for an equivalent migration installed under a different version or manual hotfix.
3. Decide whether the canonical migration should be backfilled at original version, superseded with a new **documented** version, or treated as an existing untracked Production hotfix. Obtain operator approval and preserve migration history.
4. Apply schema changes to **staging only** through the reviewed migration mechanism; ensure the migration ledger and tracked repo manifest agree. Never insert ledger rows to hide DDL drift.
5. Read-back `public.get_report_obligation_page` signature/security/grants and run real authenticated Member/Leader/Admin negative/positive checks, including cross-brand visibility and limit/offset.
6. Only after one combined Preview UAT: run the Production migration preflight and release approval. Staging service secrets and provider folder IDs must not be copied into Production.

## Minimal read-only probe
```sql
SELECT
 EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261021120000') AS ledger_has_original_version,
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='get_report_obligation_page') AS report_rpc_present,
 EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='self_attendance_record') AS self_attendance_rpc_present;
```

**Blocking constraints**: zero automatic Vercel Preview, no Production writes, no inferred Drive file deletion from empty app metadata tables, one intentional consolidated Preview only after role UAT and gates.
