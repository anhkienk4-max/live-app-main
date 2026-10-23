# RC19 · Production UAT ledger (2026-10-24)

**Status:** Production DB Reports security and history contracts patched and read-only role-tested; integrated RC19 frontend **NOT deployed**. Production testing explicitly authorized by owner because there are no real end-users yet. This does not remove P0 authentication and environment-access controls.

## Scope and environment

- Supabase Production project: `egdjnpmoasarrttvhgds`.
- Vercel project: `livestream-ops-demo`, `prj_YSrsxfYK7skM17D3KtiXUGeim2kr`, team `team_MBreE5MCbrZjyyBHnsaI5mc5`.
- Existing Production Vercel deployment: `dpl_GYFqiUTaAibTZZ7g4ggiXHaJjUzM`, Git SHA `7c35d784f5a0c7165a12ac9d20296642419c193b`, READY. This is the code rollback candidate.
- Integration source branch HEAD when deployment attempted: `633165c66b42e4f29714e3186db5d68dbf6232c6`, status **identical**. No merge to `main`.
- `ops5729.top` is a Vercel custom domain. SSO configuration on this project is `all_except_custom_domains` and password protection is disabled. App authentication/RLS remains essential. Never treat “no users yet” as a security boundary.

## Production DB preflight and read-only reproduction

Before patching, 4/4 valid Auth-linked active Member actor simulations could select a report they did not submit and whose shift they could not read under `private.can_read_shift`. Each test used `BEGIN READ ONLY`, transaction-local Auth claim + `SET LOCAL ROLE authenticated`, and `ROLLBACK`. No row values, user IDs or tokens returned. Production had 2 report rows and 17 revision rows.

A pre-change **schema-only** snapshot (3 affected policy definitions and revision function source) was saved as:
`scripts/uat/production_safety_snapshots/rc19_reports_prechange_20261024.sql`
at commit `633165c66b42e4f29714e3186db5d68dbf6232c6`. **It is not a full database backup.** Its rollback definitions restore insecure legacy privileges; do not apply except an explicitly authorized emergency rollback under access restrictions.

## Production migrations actually applied

These versions were **confirmed** in `supabase_migrations.schema_migrations` after each migration succeeded. The names were generated for the Production-UAT application of the **existing tested** source SQL, not new hand-written policy changes.

| Production migration version | Applied migration name | Exact source file in integration branch |
|---|---|---|
| `20261023201938` | `rc19_prod_uat_p0_report_read_ownership_and_revisions` | `supabase/migrations/20261023093000_rc19_p0_report_read_ownership_and_revisions.sql` |
| `20261023201941` | `rc19_prod_uat_p0_report_revision_invoker_identity_fix` | `supabase/migrations/20261023103500_rc19_p0_report_revision_invoker_identity_fix.sql` |
| `20261023201944` | `rc19_prod_uat_p0_orphan_live_image_read_rls` | `supabase/migrations/20261024003000_rc19_p0_orphan_live_image_read_rls.sql` |
| `20261023202331` | `rc19_prod_uat_report_authorized_shift_context` | `supabase/migrations/20261023112000_rc19_report_authorized_shift_display_context.sql` |
| `20261023202335` | `rc19_prod_uat_reports_historical_pagination_v2` | `supabase/migrations/20261023153500_rc19_reports_historical_pagination_v2.sql` |
| `20261023202339` | `rc19_prod_uat_reports_history_validate_filters_v2` | `supabase/migrations/20261023155000_rc19_reports_history_validate_filters_v2.sql` |
| `20261023202342` | `rc19_prod_uat_reports_history_staff_filter_privacy` | `supabase/migrations/20261023160500_rc19_reports_history_staff_filter_privacy.sql` |

**Migration history caution:** Production-UAT ledger names/versions differ from the original checked-in source filenames. The release engineer must reconcile migration history before running the ordinary `supabase db push` to avoid accidental reapplication. This ledger tracks the relationship but does **not** automatically repair CLI migration history.

## Post-patch checks

- Report active and archived RLS requires `private.can_read_report(id)`; live images require linked `report_id`; revision RPC is `SECURITY INVOKER`.
- Production row counts unchanged after #84: **2 reports, 17 revisions**; images/live images remain zero.
- **Member 4/4 PASS**: foreign `reports`, `report_revisions`, `report_images`, `live_report_images` invisible, foreign revision RPC returns `REPORT_NOT_FOUND`, authorized revision RPC agrees with direct RLS rows where fixture exists.
- **Leader 1/1 PASS**, **Admin 1/1 PASS**: authorized reports/revision counts agree.
- After history migrations: `get_report_list_with_history(1,10,'{}')` schema, scoped rows and history context **PASS 4 Members, 1 Leader, 1 Admin** in **read-only SQL role simulations**.
- None of the above is **real signed JWT HTTP/browser UAT**; that remains required.
- Supabase security advisor after patch reports 71 existing authenticated SECURITY DEFINER function warnings, 1 anonymous SECURITY DEFINER warning, 10 RLS-with-no-policy info notices, and 1 search-path warning. Review separately; the former revision `SECURITY DEFINER` concern is no longer flagged after conversion.

## Vercel Production release blocker

Attempted `create_deployment` with `target=production`, pinned HEAD SHA `633165c66b42e4f29714e3186db5d68dbf6232c6`, and GitHub integration branch.

**Vercel responded 403 `You don't have permission to create a Production Deployment for this project.`** No deployment was created. Production remains at `7c35d784`; Preview remains at `ae0fe7d0`. Runtime logs endpoint also returned 403. This connected principal cannot finish deployment without appropriate Vercel team permissions. Do not bypass this using a merge to `main`.

Production Vercel CLI fallback is not available in the current sandbox (`vercel` binary absent). An authorized team member may deploy **exact SHA** from the working repository via their authenticated Vercel CLI, after checking DB dependencies and builds. Prior production deployment is available to roll back via Vercel `request_rollback` by authorized user.

## Remaining gate

1. Reconcile Stage vs Production differences for non-Reports RC19 APIs, particularly staffing candidates and Member attendance, before enabling dependent features. Production `FEATURE_SELF_ATTENDANCE_PHOTO` / `NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO` are currently false.
2. Verify full exact-SHA TypeScript, lint, canonical Node suites, Playwright and build. Connected GitHub commit-run/status endpoints are PR-associated and returned no current-run evidence.
3. Obtain Vercel Production deploy permission, deploy the pinned candidate directly to Production UAT under controlled access, verify alias SHA and route health; roll back if materially broken.
4. Genuine authenticated 20x Member/Leader/Admin browser UAT, signed-JWT HTTP Reports #84 negative/positive matrix, Payroll/Workforce/Storage feature gates, and production feature flags. No external users before these checks PASS.

**RC19 frontend go-live remains NO-GO. This ledger confirms completed Production DB work, not application release completion.**
