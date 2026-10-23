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
