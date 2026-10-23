# RC19 P0 #84 | Reports read-scope security | Staging-only evidence (2026-10-23)

**Release verdict: NO-GO for Production and one consolidated Preview UAT until real signed-token negative tests and owner security review pass.** No Production SQL, production deployment, Drive write, or bulk migration was performed.

## Scope and version provenance

| Item | Value |
|---|---|
| Source migration | `supabase/migrations/20261023093000_rc19_p0_report_read_ownership_and_revisions.sql` |
| Source code before test | `6ffe08102340a30c92702aeae10783de770e8d78` |
| Staging project | `amagnzebmmuqiptmrjmc` |
| Applied Staging managed migration | `20261023094743_rc19_p0_staging_report_read_ownership_and_revisions_from_20261023093000` |
| Production project | `egdjnpmoasarrttvhgds`, **untouched** |
| Current Staging Reports data | 6 active reports and 58 historical report revisions before/after (read-only count confirmation) |
| Storage metadata | 0 operational_files, 2 active operational_storage_routes, unchanged |
| Earlier RPC alias | Source `20261021120000` ↔ Staging applied `20261023080409` ↔ Production equivalent `20261021100953` |

**Migration ledgers are NOT version-identical.** The managed Supabase connector assigned `20261023094743`, rather than source timestamp `20261023093000`. Do **not** run blanket `supabase db push`, reapply either alias, or manually edit `supabase_migrations.schema_migrations`. Before any CLI operation reconcile each actual database object with its canonical source and installed ledger record.

## Problem reproduced before migration (transaction-only, no user identifiers/data logged)

Five active Members: scoped list RPC report totals `[2, 0, 0, 0, 0]` versus direct active Reports table SELECT `[6, 6, 6, 6, 6]`.
Member direct revisions for reports not assigned and not submitted: `[22, 46, 46, 46, 46]`; five of five could call `get_report_revisions` on a report outside authorization scope.
The vulnerable RLS policy predicates are identical in Production, and Production SEC-DEF revision RPC has semantically equivalent body; **no Production signed-token probe was run**.

## Controlled Staging remediation

- New `private.can_read_report(text)` is STABLE, SECURITY DEFINER, fixed empty `search_path`, execute granted to `authenticated`, not `anon`. It does **not** return record data; returns only a per-report boolean. It denies inactive or unmapped accounts.
- Active Admin: all reports, including deleted/archived within the existing Admin-only policy.
- Active Leader: active reports; no access to deleted/archived unless Admin.
- Active Member: active reports if `submitted_by = actor.id` or assigned as Host/Support/Technical directly on the shift or through an `approved` / `manually_assigned` registration. `pending` registration/open unassigned shifts are **not** entitlements.
- Recreated `reports_active_select` and `reports_archived_select` using this helper. Linked `report_revisions`, `report_images`, `live_report_images` metadata and report-images storage object policies already join `public.reports`, so their read scope inherits the corrected parent SELECT visibility.
- `get_report_revisions` remains SECURITY DEFINER to preserve contract but enforces `private.can_read_report` **inside the function** before reading revisions, with same `REPORT_NOT_FOUND` error for foreign and missing reports. Function grants retained for authenticated only.
- The existing read policy allowing `live_report_images.report_id IS NULL` is **not** changed. At audit time Staging had zero unlinked live images. That workflow and any orphan/provider files need independent Storage review.

## Post-migration SQL role smoke (Staging, `BEGIN READ ONLY` / `ROLLBACK`)

**PASS:** 5 Member, 2 Leader, 2 Admin actor mappings.
- Each account's direct `public.reports` rows matched an independent privileged baseline computed from the same explicit ownership/assignment/status rule before `SET LOCAL role=authenticated` in the test.
- Member direct visible active-report counts: `[3, 0, 1, 1, 0]` for the tested account order. Leaders/Admins each see all 6 active reports.
- Five Member calls to `public.get_report_revisions(foreign_report_id)` were denied with `P0001`; direct `report_revisions` SELECT for the same foreign reports returned 0.
- Five valid Member report records were read; revision RPC returned populated history for all five.
- Foreign linked artifacts were absent from Member direct `report_images`, `live_report_images`, report revisions and `storage.objects` metadata: 5/5 cases tested.
- Metadata check: `private.can_read_report` / `public.get_report_revisions` both have `search_path=''`, execute authenticated=true, anon=false.
- No business report, revision, file, route or staffing record was changed.

**Caveat:** One Member's direct report entitlement can include an assigned/historical record outside the current filtered shift list RPC (3 authorized direct vs previous 2 list). This is **not a data-leak regression** because the direct report is explicitly authorized by formal assignment, but the UI/list/export scope is not yet perfectly aligned. Track with #77 and do not count end-to-end Reports workflows as PASS until this is resolved or documented as intentional.

## Required remaining gates

1. **Signed JWT / real Preview UAT:** Member external `/rest/v1/reports`, `report_revisions`, `report_images`, storage paths and `/rest/v1/rpc/get_report_revisions` negative foreign and positive owned tests. No screenshots of personal data or logging bearer tokens.
2. Review `SECURITY DEFINER` function body/privileges and `live_report_images.report_id IS NULL` access; validate archived and historical reporting behavior and all required approvals.
3. Prove exact member/leader/admin list, detail, edit, review, XLSX and image workflows using the single expressly approved Preview after latest no-deploy CI passes.
4. Security reviewer approves Production hotfix change window and rollback/verification; Production must not inherit staging aliases or unrelated migrations automatically.

See [#84](https://github.com/anhkienk4-max/live-app-main/issues/84), [#77](https://github.com/anhkienk4-max/live-app-main/issues/77), [#80](https://github.com/anhkienk4-max/live-app-main/issues/80).


## Follow-up: revision RPC switched to SECURITY INVOKER (Staging only, 2026-10-23)

**This section supersedes the older SECURITY DEFINER status of `public.get_report_revisions` above.** The parent `private.can_read_report` remains a boolean-only fixed-search-path SECURITY DEFINER, not directly exposed through PostgREST.

| Source | Applied managed Staging ledger |
|---|---|
| `20261023102000_rc19_p0_report_revision_rpc_invoker.sql` | `20261023100211_rc19_p0_report_revision_invoker_from_20261023102000` |
| `20261023103500_rc19_p0_report_revision_invoker_identity_fix.sql` | `20261023100318_rc19_p0_report_revision_invoker_identity_fix_from_20261023103500` |

Initial `ALTER FUNCTION ... SECURITY INVOKER` uncovered a real permissions blocker: existing RPC called `private.require_report_actor(false)` which is intentionally NOT executable by `authenticated`. That intermediate state denied valid invoker reads. The second migration replaced the RPC body with a caller-executable `private.current_business_user_id()` + `private.current_business_user_is_active()` identity check, and an explicit per-report `private.can_read_report` check. **The privileged helper's EXECUTE grant was not expanded.**

After applying both migrations, `public.get_report_revisions(text)` has:
- `SECURITY INVOKER`, fixed empty `search_path`, `authenticated` EXECUTE true, `anon` EXECUTE false.
- SELECTs on `public.reports` and `public.report_revisions` now honor the caller's RLS, as well as the explicit `can_read_report` defense-in-depth check.
- A fresh 9-actor role-simulated transaction-only test: 5 Members, 2 Leaders, 2 Admins, **35 successful authorized RPC calls**, including Admin archived history, **7/7 forbidden foreign-report calls denied** with `P0001`. All 35 returned populated revision history.
- Supabase Security Advisor no longer emitted an exact warning for authenticated-callable **`public.get_report_revisions` as a SECURITY DEFINER**. Other functions may still have independent warnings. This is NOT proof of the entire Supabase security posture.
- All runtime SQL tests used `BEGIN READ ONLY` / `ROLLBACK`; only controlled migration DDL was persisted on Staging.

**Newly characterized report-list gap (no broadening applied):** For the Member who can directly read 3 authorized reports, only 2 have related shifts readable via current `shifts` RLS; the filtered list RPC also returns 2. Two other Members each have one authorized report linked to a shift not readable under current `shifts` RLS, and list RPC returns 0. Fixing reports list without considering linked shift RLS and UI shift hydration would be an incomplete/unsafe change. Keep this as #77 work requiring explicit historical shift visibility model, not an unrestricted RLS grant.

**Remaining release gates:** signed-JWT Data API/real browser tests for foreign report IDs, UI list/detail/export parity and archived histories, owner-approved single Preview, Storage provider ACL, and separate Production security migration sign-off. No Production SQL/deploy change, no automatic Preview, and no blanket `supabase db push` for mismatched source/managed ledger versions.


## RC19 #77 follow-up: historical report shift display context, not yet wired to UI

- Source migration: `supabase/migrations/20261023112000_rc19_report_authorized_shift_display_context.sql` (source commit `88e500dcc3d8e1b3abbb3fbfc3316b2ac2837bfd`).
- Applied to **Staging only** under managed ledger version `20261023101431_rc19_report_authorized_shift_display_context_from_20261023112000`. Preserve this source/ledger alias; do not blanket `supabase db push`.
- New `private.report_shift_display_context(p_report_id text)` is STABLE, SECURITY DEFINER, fixed `search_path=''`, authenticated EXECUTE YES, anon NO, and stays in the `private` schema. It first requires an active actor and `private.can_read_report(p_report_id)`.
- Successful return is exactly six non-PII fields from the specific linked shift: `date`, `start_time`, `end_time`, `brand_id`, `platform_id`, `campaign_id`. No staff identities, host/support/tech, shift notes, studio, file paths, dashboard metrics, or raw full shift row.
- Actor-simulated Staging read-only 9-role matrix (5 Member, 2 Leader, 2 Admin) across all report IDs yielded **35/35 authorized contexts equal to independently built expected minimal fields**, **46/46 unauthorized contexts returned null**, and each payload had precisely the six approved keys. No report IDs, staffing names, or contents logged. No business data was changed; after migration Staging still has 6 active reports and 58 revisions.
- This is a **building block**, not a released list fix. Current `get_report_list_page` still takes visible shift IDs via `private.filtered_shift_ids`; `ReportsList` still hydrates shift via `shiftService.getByIds` and omits report cards with missing Shift. The three authorized historical reports associated with RLS-hidden shifts therefore still require controlled API/list/UI integration.
- No change to `public.shifts` RLS, `private.can_read_shift`, `public.reports` policies, provider ACL, or Production. Remaining design gate: query scoped reports under caller RLS, apply supported shift filters via minimal authorized context, return a separate typed display context and explicitly read-only historical UI state. Do not fabricate full Shift objects or enable editing/reassignment on hidden shifts. Verify complete pagination and XLSX parity as separate gates.

**Release verdict unchanged: NO-GO pending real signed-token API negative checks, authenticated UAT, full UI integration and the owner-approved consolidated Preview.**


## RC19 #77: History-aware Reports pagination & read-only card (source/Staging only)

**Canonical source migrations**
- `supabase/migrations/20261023153500_rc19_reports_historical_pagination_v2.sql`: additive `public.get_report_list_with_history(page,pageSize,filters)` RPC, **SECURITY INVOKER**, with original `public.reports` RLS as the authoritative list scope. No change to `public.shifts` RLS, no artificial complete Shift. Scoped `private.report_shift_display_context(report_id)` yields six fields only, per-report, for historical rows whose linked shift is RLS-hidden. Existing Analytics RPC continues unchanged. Private boolean-only staff filter helper requires `private.can_read_report`.
- `supabase/migrations/20261023155000_rc19_reports_history_validate_filters_v2.sql`: separate corrective migration. Force-shift filter validation before query execution, because empty matching sets could skip the lazy canonical CTE and silently accept unknown filter keys. Added type guards for `search`, report status and metric arrays. Never change already-applied migration source history.

**Staging migrations** were applied only to `amagnzebmmuqiptmrjmc`, via managed aliases
`rc19_reports_historical_pagination_v2_from_20261023153500` and
`rc19_reports_history_validate_filters_v2_from_20261023155000`.
No Production schema changes.

**Read-only role simulation, in rolled-back transactions**
- 9 active identities: 2 Admin, 2 Leader and 5 Member.
- History-aware list `total` equaled the exact direct `public.reports` RLS authorized total for **every actor**: Admin 6/6, Leader 6/6, Member 3,0,1,1,0. All selected report IDs and returned history-context keys were bounded to the same actor's RLS rows. **29 authorized row reads, 7 minimal historical contexts** across 9 actor lookups; each entry is bounded to six non-PII attributes.
- The first filter probe found an unsupported key could be accepted when zero matching rows. Patched before wiring into UI; after patch **45/45 negative inputs (five invalid filters across nine actors) were rejected**. Brand filter checked against real minimal context in 7 role cases; metrics confirmed and future date filters also passed.
- Existing positive/negative permissions of `get_report_revisions` remain independent and unchanged.

**Application code**
- `lib/server/operationsCollectionHandler.ts` routes `reports` to new history RPC, preserves `analytics_reports` route, and guards that historical-context keys map only to returned report IDs.
- `lib/services/operationsPageService.ts` validates the exact six-key context schema, returning `REPORT_HISTORY_RESPONSE_INVALID` on malformed/unexpected context. `dataService` preserves contexts across bounded, identity-stable Excel export.
- `ReportsList` shows historical rows read-only with date/brand/platform/session, a separate read-only detail containing the report's own metrics and recap, and export; **does not fake a full Shift or expose staffing, edit, archive, assignment or other Shift actions**.
- Excel exporter populates only authorized six-field shift context. Host/Support/Technical and Studio remain intentionally blank if Shift is RLS-hidden; overnight date calculations are retained. Existing Global Search mock fixture was brought into sync without weakening response validation.
- Tests added to `tests/report-history-access.test.ts` (existing canonical test file). No unmanifested test path was added.

**Status:** Staging role+filter SQL PASS; final HEAD CI and real authenticated Preview UI/XLSX QC still pending. As owner directed, do not QC before the remaining RC19 source issues are finished. The one already-created Preview remains pinned to old SHA `ae0fe7d0` and does **not** contain these changes. Never create per-module Preview; Production **NO-GO**.
