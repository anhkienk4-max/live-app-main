# Core V1 RC1 release manifest

## Release candidate

- Branch: `release/core-v1-rc1`
- RC commit: recorded by the final Git HEAD at handoff
- Backend/domain base: `3d05f6a347c042aa68dfc07726c794ea75fb9252`
- Account source: `origin/feat/account-management-core-v1` (`89acc408dee690d5462a23ecd96ade56cd606e20`)
- UI source: `origin/integration/ui-v1.1-final` (`d50771d846a5147dea4ecd1241decbb4e7901e81`)
- E2E/smoke source: `origin/feat/core-v1-e2e-smoke` (`28f6bc80ecf36929f22906dc19e6a44806ae7d91`)
- Recovery runbook: `771f039c59ffaf29e115e925fbd46e04c3fbd351`

## Database lineage

The RC carries the staging-verified migrations in order:

1. `20260827094704_core_account_lifecycle.sql`
2. `20260827110001_notifications_persistent_realtime.sql`
3. `20260829120000_core_v1_timezone_contract.sql`
4. `20260829130000_core_v1_data_integrity_p1b.sql`
5. `20260830085911_core_v1_data_integrity_p1c.sql`
6. `20260830102222_core_v1_permission_rls_final.sql`
7. `20260830113000_core_v1_persistent_audit.sql`
8. `20260830114000_core_v1_persistent_audit_read_permission.sql`

The account branch's duplicate `20260827100000` migration was identical to
`20260827094704` and is intentionally absent from this lineage. Staging target
for read-only verification: `amagnzebmmuqiptmrjmc`. No database migration was
applied by this RC task; production remains untouched.

## Completed gates

- Account lifecycle, operational staffing/registration, swap, data-integrity,
  timezone, permission/RLS, persistent-audit, UI E3/E4/E5, recovery, and E2E
  harness sources integrated with domain conflicts resolved explicitly.
- Targeted staging schema recovery delta verified audit read policies in a
  disposable local PostgreSQL restore; temporary dump and target were removed.
- Typecheck and production build pass after the isolated UI merge correction;
  `git diff --check` passes. The focused account/integrity/timezone/audit/
  permission/notification/swap gates pass (account 57/57 and the combined
  integrity/UI/operational gate passes apart from the known stale
  `swap-request-modes` calls that omit required revisions). The full Node test
  run is 604/633 passed with 2 skipped; its 27 failures are classified as
  baseline stale tests or environment-only Next ESM/relative-fetch failures,
  with no new RC regression. Targeted ESLint reports existing repository/UI
  debt; it has no parser error after the merge correction.

## Deferred/manual release gates

- Staging application deployment and credentialed three-role browser UAT.
- Supabase leaked-password protection and non-localhost staging Auth Site URL.
- Provider-managed backup/PITR dashboard verification.
- Separate recovery procedure for report-image Storage binaries.
- Leader persona UAT, persistent Report/Swap audit live UAT, and a second
  authorized audit viewer.

## Recovery reference and NO-GO items

Use `docs/runbooks/core-v1-backup-restore.md`. Its full data drill covers the
snapshot through `20260830113000`; the targeted `20260830114000` policy delta
is documented separately. This RC is not a go-live authorization: do not
deploy production or apply production migrations until every manual gate above
passes and an explicit release approval is recorded.
