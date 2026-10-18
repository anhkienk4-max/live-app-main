# ADA OPS P0.3 — existing Clean Staging: Storage + Workforce/Payroll reconciliation

**Target:** `amagnzebmmuqiptmrjmc` (existing live-app-staging, PostgreSQL 17).
**Production:** `egdjnpmoasarrttvhgds` — SELECT-only catalog comparison.
**Infrastructure:** no additional Supabase project, branch, paid upgrade or VPS.
**Data changes:** only forward-compatible schema/ACL reconciliation in Staging.
No pre-existing shift, staff, report, folder route, images or audit business
rows were updated, removed or reset. No payroll line/rate/attendance was seeded.

## Exactly six staging-only migrations applied in order

Each change had a dependency/environment guard, a successful independent
`BEGIN`/`ROLLBACK` rehearsal on current Staging and was then applied
separately by the Supabase migration API. All six returned `success:true`.

| Step | Staging migration ledger entry | Canonical source | Staging-only source |
| --- | --- | --- | --- |
| 1 | `ops_p03_staging_rc15_operational_files` | `20261011092051_rc15_operational_files.sql` | `supabase/reconciliation/ops-p0-staging/rc15_operational_files_staging.sql` |
| 2 | `ops_p03_staging_rc15_storage_route_forward_compat` | RC15 route prerequisites adapted for existing RC13A routes | `supabase/reconciliation/ops-p0-staging/rc15_storage_route_forward_compat_staging.sql` |
| 3 | `ops_p03_staging_rc16_workforce_foundation` | `20261012000000_rc16_workforce_payroll_foundation.sql` | `supabase/reconciliation/ops-p0-staging/rc16_workforce_foundation_staging.sql` |
| 4 | `ops_p03_staging_rc16b_draft_payroll_correction` | `20261012000001_rc16b_draft_payroll_correction.sql` | `supabase/reconciliation/ops-p0-staging/rc16b_draft_payroll_correction_staging.sql` |
| 5 | `ops_p03_staging_p0_audit_privilege_hardening` | `20261012145735_p0_audit_privilege_hardening.sql` | `supabase/reconciliation/ops-p0-staging/p0_audit_privilege_hardening_staging.sql` |
| 6 | `ops_p03_staging_rc16k_payroll_snapshot` | `20261012171503_rc16k_bounded_shift_lists.sql` (payroll function only) | `supabase/reconciliation/ops-p0-staging/rc16k_payroll_snapshot_staging.sql` |

**Do not replay original Production migration filenames on Staging.**
Staging already had RC12/RC13A with different historical ledger versions;
it now records explicitly named compatibility patches instead.
These bridge files are outside `supabase/migrations/` and MUST NOT be
promoted by auto-deploy to Production.

## File metadata / external provider routing

- `public.operational_files`: table created, six indexes (including PK),
  RLS enabled, zero rows; `anon` and `authenticated` have no direct SELECT.
  Holds metadata only, not binary/file content.
- Existing `public.operational_storage_routes`: **2 rows preserved**.
  Route columns expanded **14 → 19** with typed JSON overrides and
  `approved_by`, `approved_at`; existing routes not reclassified or moved.
- IMPORTANT intentional variance: the two RC13A legacy routes contain
  **no stored historic approval evidence**. Both `approved_by` and
  `approved_at` remain NULL; `approved_at` remains nullable in Staging.
  Production has NOT NULL approved_at. Do **not** fabricate approvals.
- `brands.storage_profile` default dropped to match explicit
  classification policy; 3 previously null profiles remain null.
  The new profile enum `EXISTING_BRAND_YEAR_PERIOD_PLATFORM` is accepted.
- No Drive/OneDrive API action, OAuth retrieval, folder creation, upload
  or file synchronization was performed. **End-to-end storage UAT NOT PASS.**

## Workforce/Payroll

- Tables created empty: `workforce_actual_segments`,
  `workforce_rate_cards`, `workforce_payroll_periods`,
  `workforce_payroll_lines`, `workforce_payroll_audit`, plus audit sequence.
- RC16B columns/guards for versioned draft correction and void history
  installed. P0 audit-grant hardening removed direct service-role
  `UPDATE/DELETE/TRUNCATE` on critical audit/revision tables.
- All five workforce tables have RLS ON and `anon`/`authenticated`
  direct SELECT OFF. Service-role SELECT/INSERT are available as designed;
  `workforce_payroll_audit` service-role UPDATE is **denied**.
- Verified all **10** `workforce_*` / `get_payroll_period_snapshot`
  function fingerprints **and** role execution grants matched Production.
- `get_payroll_period_snapshot` EXECUTE: `anon=false`,
  `authenticated=false`, `service_role=true`.
  Service-role SELECT of a nonexistent synthetic period returned NULL.
- No rates, payroll period, approved actual attendance, payroll lines or
  financial audit rows exist. **Payroll Preview/Calculation/Approval E2E
  cannot be marked PASS** based on schema-only smoke testing.

## Preserved business data counts

| Object | Before | After |
| --- | ---: | ---: |
| Shifts | 79 | 79 |
| Shift registrations | 43 | 43 |
| Reports | 9 | 9 |
| Business users | 12 | 12 |
| Storage routes | 2 | 2 |
| Audit logs | 1,398 | 1,398 |
| Operational files | absent | 0 |
| Payroll periods/lines/audit | absent | 0 |

## Catalog comparison after Staging reconciliation

| Category (public/private) | Production | Staging | Aggregate hash |
| --- | ---: | ---: | --- |
| Relations | 29 | 29 | **MATCH** |
| Columns | 544 | 544 | DIFFERENT |
| Constraints | 279 | 278 | DIFFERENT |
| Indexes | 122 | 122 | **MATCH** |
| RLS Policies | 30 | 30 | **MATCH** |
| Relation grants | 29 | 29 | **MATCH** |
| Functions | 178 | 177 | DIFFERENT |
| Noninternal triggers | 51 | 52 | DIFFERENT |

Known semantic/digest differences:
- Legacy `operational_storage_routes.approved_at` is nullable on
  Staging to avoid inventing historical approval metadata.
- Staging has one extra RC13A route `updated_at` trigger, different
  legacy provider pair-check constraints, and one fewer
  `public.rls_auto_enable()` function; these have **not** been altered
  automatically.
- Multiple preexisting write RPC definitions differ, notably
  `create_shift` and the 3-/4-argument `update_shift` overloads.
  This is **not** a full functional/schema equivalence claim.
- Some column hash differences reflect physical column-order differences;
  compare full type/default/nullability semantics before repairing.
- `20261013000001_rc16g_staging_shift_rpc.sql` was rehearsed in a
  rolled-back transaction. Its output 3-arg digest
  `1ed36fa69c62713d89ed2a104c73c013` did **not** match the current
  Production digest `052af1089ed967316d385007828e971c`. Therefore
  this optional old compatibility patch was **not applied**.
- Two historic Staging `operational_storage_routes` must receive
  actual operator review before any production-equivalent approval tests.

## Advisors and next hard gates

After P0.3, Supabase security advisor still shows informational
`rls_enabled_no_policy` (10: includes intentionally service-only tables)
and preexisting warnings such as anonymous security-definer signup RPC
and mutable `private.audit_action_for_change` search_path.
Security-definer warning presence does not alone prove exploitation.
Performance advisor shows unindexed FK 44 and unused index 53
(informational), multiple permissive policies 6 (warning).
Review by exact access contract; do not create permissive RLS solely to
silence warnings.

Remaining NO-GO:
1. Verify UI Preview points *only* at Staging Supabase with clean,
   redacted environment scope; Vercel `live-app-clean` deploy still failed.
2. Real authenticated HTTP sessions for Admin, Leader, Member, revoked;
   no service-role token in browser.
3. Isolated approved fake user/shift data for actual attendance, rate-card,
   draft, correction, void, audit and state transitions. Existing Staging
   personal/payroll data must never be rewritten.
4. Resolve write-RPC compatibility and intentional Storage approval variance;
   do not blindly replay RC13A/RC15 historical migrations.
5. Performance AB tests under realistic concurrent load and rollback gate.
6. Independent Finance and security reviewer acceptance before Production
   enablement/merge. **Production not modified or deployed.**

No destructive rollback is auto-run for the financial schema. If a problem
is detected, STOP writes and review forward-fix versus owner-managed
database recovery; never DROP payroll audit or delete evidence merely to
restore an old schema fingerprint.
