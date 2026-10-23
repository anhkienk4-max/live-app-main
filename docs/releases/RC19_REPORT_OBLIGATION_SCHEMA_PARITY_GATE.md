# RC19 | Report Obligation RPC schema parity gate | 2026-10-23

**Release verdict: HOLD for one consolidated Preview / Production.** This document does not mutate any database or provider folder.

## Post-migration addendum: 2026-10-23, verified after staging apply

**Updated result: the Staging Reports RPC is now installed.** The older "Read-only cross-environment observations" below are historical pre-migration snapshots and must NOT be used to describe the current Staging RPC state.

| Current verification | Result |
|---|---|
| Target | Staging `amagnzebmmuqiptmrjmc` ONLY |
| Canonical source | `supabase/migrations/20261021120000_global_report_obligation_page.sql`, commit `822ba9702b541bd989cc9dfb46228896ebfcd94e` |
| Managed Supabase migration applied | `20261023080409_rc19_staging_global_report_obligation_page_from_20261021120000` |
| Live Staging function | PRESENT, body exactly equal to canonical source and Production (7,178 characters) |
| Security | `STABLE SECURITY INVOKER`, fixed empty `search_path`, EXECUTE to authenticated only; denied to anon/service_role |
| Auth/scope SQL verification | All nine active Staging business actors: 5 Member, 2 Leader, 2 Admin simulated via transaction-local JWT claims and PostgreSQL `authenticated` role; pagination/counts/unique shift IDs, impossible brand, Member ownership passed |
| Persistent test-data mutation | None; each role-scoped verification used `BEGIN READ ONLY` / `ROLLBACK` |
| Vercel deployment | NONE; Production still at `7c35d784...` in post-apply audit |

**Important ledger caveat:** The managed connector generated **Staging version `20261023080409`**, not canonical source version `20261021120000`. Production equivalent was installed under `20261021100953`. All three map to equivalent Reports RPC source/function but not to the same migration-history version. **Never execute blanket `db push`** and do not mark `20261021120000` as applied merely to silence the mismatch. Review actual state and migration repair provenance before future CLI push.

**Release gate after migration:**
- Staging RPC presence, function/grants comparison, and transaction-scoped SQL Member/Leader/Admin tests: **PASS**.
- Full signed-token, authenticated browser Reports workflow, Excel export fidelity, report detail, role isolation in the UI: **NOT RUN**.
- Storage provider principal ACL and controlled Production route configuration: **HOLD**.
- Only a single, explicitly approved consolidated Preview is permitted. The new authenticated read-only workflow source in `e2e/preview-authenticated-uat.spec.ts` prepares those checks but does not substitute for execution.

---

## Read-only cross-environment observations (historical, before migration)
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

## Version-ledger diff expanded 2026-10-23 (read-only)
- Staging has **77** recorded migration versions. Production has **75**; **59 exact versions match**, **18 staging-only**, **16 Production-only**. These are *ledger entries*, not 34 necessarily-missing features. Schema/function contents may match despite divergent timestamps.
- Crucial alias: Production ledger contains `20261021100953_global_report_obligation_page_production`, and its current `public.get_report_obligation_page(integer,integer,jsonb)` body matches canonical GitHub `20261021120000_global_report_obligation_page.sql` after whitespace normalization; `SECURITY INVOKER`, `authenticated EXECUTE=true`, `anon EXECUTE=false`. The **canonical version `20261021120000` is in neither environment's ledger**, but the Production alias explains why the RPC exists there.
- Production-only versions include `20261011092051_rc15_operational_files`, `20261012000000_rc16_workforce_payroll_foundation`, `20261021100953_global_report_obligation_page_production`, `20261021101021_rc17c_attendance_import_foundation_production`. Staging-only versions include `20261017215937_ops_p03_staging_rc15_operational_files`, `20261017220212_ops_p03_staging_rc16_workforce_foundation`, `20261022185140_rc19_p2_04_member_attendance_event_journal`. **Do not assume these pairs are equivalent without diffing DDL and security behavior**.
- Consult official Supabase CLI docs: use `supabase migration list --linked` to compare after linking the correct project, and `supabase db push --dry-run --include-all` to inspect potential DDL **without applying** it. `supabase migration repair VERSION --status applied` edits ledger only, **does not run SQL**, and is appropriate solely for a reviewed version with verified equivalent deployed schema. Never bulk-repair the 18/16 differences.

### Recommended per-environment decision
1. **Production**: leave both function body and migration ledger untouched until all alias versions have been mapped to repository files and code provenance. Its report RPC is already present; don't re-execute a duplicate CREATE FUNCTION or mark canonical timestamp by assumption.
2. **Staging**: function absent; review the canonical source and all 18 staging-only/16 production-only migrations for collisions. Stage only the needed missing *actual DDL* through a version-reviewed migration plan, then verify result. A `migration repair` alone cannot fix a missing RPC because it only changes ledger metadata.
3. Maintain **two explicitly distinct maps**: `version→migration artifact` and `database object→live schema definition`. A matching live object does not establish matching history; a matching version does not establish matching object body.
4. Before combined Preview: real authenticated Member/Leader/Admin Reports read and category/brand filters; verify error and permission behavior, compare to Production RLS and grants. Approval required for any persistent staging/production schema action.

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
