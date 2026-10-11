# RC STORAGE DATABASE COMPATIBILITY REPORT

**Project:** APP OPS LIVESTREAM PLATFORM  
**Date:** 2026-10-11T20:39:00+07:00  
**Target Environments:** Staging (`amagnzebmmuqiptmrjmc`) & Production (`egdjnpmoasarrttvhgds`)  
**Strict Constraint:** Zero migration writes to Production or Staging in this phase.  

---

## 1. SCHEMA-LEVEL DRIFT ANALYSIS (CONTRACTS A, B, C)

A rigorous three-way comparative audit between the codebase, Staging database, and Production database revealed distinct contract states that must be reconciled forward-only:

```mermaid
flowchart TD
    subgraph ContractA [Contract A: RC12 Provider Metadata]
        A1[Missing on Production] --> A2[report_images: provider, external_file_id]
        A1 --> A3[live_report_images: provider, external_file_id]
        A1 --> A4[RPC: upsert_live_report_image_with_provider]
        A5[Present on Staging]
    end

    subgraph ContractB [Contract B: RC14 P0/P1 Security]
        B1[Missing on Production] --> B2[P0: Member Directory Privacy RLS]
        B1 --> B3[P1: get_report_revisions repair]
        B4[Present in Staging Ledger]
    end

    subgraph ContractC [Contract C: RC15 Storage Center V2]
        C1[Present on Production] --> C2[Table: operational_files]
        C1 --> C3[Routes: overrides & date ranges]
        C1 --> C4[Brands: 7 storage profiles check]
        C5[Missing on Staging]
    end
```

### Detailed Breakdown

| Contract Component | Object / Schema Element | Current Production (`egdjnp...`) | Current Staging (`amagnz...`) | Codebase Requirement (`rc/convergence...`) | Resolution Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Contract A** | `report_images.provider` | **MISSING** | Present | Required | Forward-only compatibility migration (idempotent `add column if not exists`) |
| **Contract A** | `report_images.external_file_id` | **MISSING** | Present | Required | Forward-only compatibility migration |
| **Contract A** | `live_report_images.provider` | **MISSING** | Present | Required | Forward-only compatibility migration |
| **Contract A** | `live_report_images.external_file_id` | **MISSING** | Present | Required | Forward-only compatibility migration |
| **Contract A** | `upsert_live_report_image_with_provider(jsonb)` | **MISSING** | Present | Required | Forward-only compatibility RPC creation |
| **Contract B** | `users` Member Directory Privacy (P0) | **MISSING** | Present (`20261008160638`) | Required | Source from original P0 migration authority; apply to Production during cutover |
| **Contract B** | `get_report_revisions` Repair (P1) | **MISSING** | Present (`20261008160645`) | Required | Source from original P1 migration authority; apply to Production during cutover |
| **Contract C** | `operational_files` Table & RLS | **PRESENT** | **MISSING** | Required | Forward-only migration staged (`20261011092051`); apply to Staging during rehearsal |
| **Contract C** | `operational_storage_routes.period_label_overrides` | **PRESENT** | **MISSING** | Required | Forward-only migration staged (`20261011091925`); apply to Staging during rehearsal |
| **Contract C** | `brands.storage_profile` 7-Profile Check | **PRESENT** | **MISSING** | Required | Forward-only migration staged (`20261011091925`); apply to Staging during rehearsal |

---

## 2. FORWARD-ONLY MIGRATION DESIGN RULES

To prevent corruption, drift, or catastrophic service disruption, the following rules are strictly enforced:

1. **NO Replay of Obsolete RC12/RC13A Migrations:**
   - Obsolete migrations that attempt to replay unhardened versions of `create_shift` or `update_shift` are permanently excluded.
2. **NO Hardcoded Function MD5 Preflights:**
   - Brittle MD5 checksums of function source strings have been replaced with **structural signature guards** (`pg_proc` argument type checks and parameter count checks).
3. **NO Re-application to Staging Ledger:**
   - Staging already records P0 (`20261008160638`) and P1 (`20261008160645`) in `supabase_migrations.schema_migrations`. They will NOT be re-executed or duplicated.
4. **NO Direct Manipulation of `schema_migrations` Table:**
   - Direct SQL inserts into `supabase_migrations.schema_migrations` are strictly prohibited. All ledger updates must occur through genuine Supabase CLI migration workflows.
5. **Idempotent Column & Constraint Addition:**
   - All schema additions use `ADD COLUMN IF NOT EXISTS` and `IF NOT EXISTS` constraint guards.

---

## 3. COMPATIBILITY MIGRATION SCRIPT DESIGN

### Compatibility Migration A: Provider Metadata (Production Forward-Only)
```sql
-- Migration: 20261011120000_rc12_provider_metadata_forward_compat.sql
-- Idempotent forward-only patch for Production environments lacking RC12 provider columns.

alter table public.report_images
  add column if not exists provider text check (provider in ('google_drive', 'onedrive')),
  add column if not exists external_file_id text;

alter table public.live_report_images
  add column if not exists provider text check (provider in ('google_drive', 'onedrive')),
  add column if not exists external_file_id text;

-- Idempotent RPC definition for live report image upsert with provider
create or replace function public.upsert_live_report_image_with_provider(p_data jsonb)
returns public.live_report_images
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.live_report_images;
  v_actor_id text;
begin
  v_actor_id := private.require_shift_actor(true);
  insert into public.live_report_images (
    shift_id, category, file_name, file_url, is_cover, provider, external_file_id, created_by
  ) values (
    p_data->>'shift_id',
    p_data->>'category',
    p_data->>'file_name',
    p_data->>'file_url',
    coalesce((p_data->>'is_cover')::boolean, false),
    p_data->>'provider',
    p_data->>'external_file_id',
    v_actor_id
  )
  on conflict (shift_id, category, file_name) do update set
    file_url = excluded.file_url,
    provider = excluded.provider,
    external_file_id = excluded.external_file_id,
    updated_at = now()
  returning * into v_row;
  return v_row;
end;
$function$;
```

### Compatibility Migration C: Storage Center V2 (Staging Forward-Only)
Staged in repository as:
- `supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql`
- `supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql`
- `supabase/migrations/20261011092051_rc15_operational_files.sql`

---

## 4. DATABASE CLONE REHEARSAL & ROLLBACK PLAN

Before executing any database cutover:

1. **Rehearsal on Fresh Database Clone:**
   - Spin up a temporary Supabase project or local PostgreSQL container cloned from Production snapshot.
   - Apply compatibility migrations in sequence:
     1. `20261008160638_p0_member_directory_privacy.sql`
     2. `20261008160645_p1_report_revisions_repair.sql`
     3. `20261011120000_rc12_provider_metadata_forward_compat.sql`
     4. `20261011091925_rc15_storage_route_prerequisites.sql`
     5. `20261011092015_rc15_shift_rpc_compatibility.sql`
     6. `20261011092051_rc15_operational_files.sql`
   - Run verification query `scripts/storage/rc15-production-readiness.sql`.
   - Run automated contract tests against the cloned instance.
2. **Backup & Rollback Safeguards:**
   - Take point-in-time snapshot before running migrations.
   - All table alterations are purely additive (no `DROP COLUMN`, no `ALTER TYPE`, no data truncation).
   - In case of unexpected failure, rollback involves reverting newly created functions and removing newly added nullable columns.
