# RC19 W4 exact-SHA integration manifest

Manifest prepared 2026-11-27 (UTC). This records source provenance and integration
dependencies; it is not a claim that the sources have been merged or that application
acceptance passed.

## Candidate and source ancestry

| Role | Branch | Exact SHA | Provenance / status |
|---|---|---|---|
| Reviewed integration base | `integration/rc19-w4-final-integration` | `8fab7eacfaab38e7b5e798db7900f12a9b7b17f9` | Supplied integration reference; fetched from origin. Ancestor of this manifest branch. PR #187 remains open and unmerged. |
| Current CI/runtime baseline | `chore/rc19-w4-release-readiness` | `38dd7ae7a374fbb4505b5a95e79c79f060377b42` | Fetched origin branch and current starting HEAD. Descends from the reviewed integration base; contains reusable hosted runtime, allowlist `87a077955f309e5daaaf4c8dd229df2ae586053a`, shared incident contract work, C4 correction, and green CI scoped to this exact SHA. |
| Delta B: Import and staffing | `fix/rc19-w4-import-staffing` | `f28f94ff5772944d7dc6e089af54af12a8376ffb` | PR #188, open/unmerged. Source checkpoint only. |
| Delta C: Live Monitoring | `fix/rc19-w4-live-monitoring-sharing` | `1065e070546daa7997364df42d8ae438c2a94722` | PR #191, draft. Source checkpoint only; WAN acceptance is outstanding. |
| Lane 01: backend and contracts | `backup/rc19/lane01` | `24839cb6eafe019f178195c06fadc5cb66e5f86c` | Immutable recovery/source checkpoint. Includes Lane 01 acceptance entrypoint and backend work; exact app candidate is not yet reviewed/allowlisted. |
| Lane 01 guarded backend checkpoint | `codex/rc19-w4-lane01-backend` | source `015adc54400873f8c8223ff85da2c26e9ef6b043`; memory follow-up `db7c3b4a4fdd8b2a9ea8f07767aff47022d1496d` | Published after this task began; source commit parent is `24839cb6…`, not this Codex branch or the `38dd7ae7…` release baseline. Acceptance-entrypoint inspection found v1 reporting, browser `ran=false`, aggregate authorization flags and Agency denial unasserted. This is a backend source checkpoint, not a v2 hosted acceptance candidate; it is not allowlisted. |
| Frontend pairing | `backup/rc19/w4-frontend` | `634a2533b47d7b1e844483102cadd20d77532337` | Immutable frontend checkpoint; actual pairing/browser acceptance outstanding. |
| Delta D frontend | `backup/rc19/w4-delta-d-frontend-src` | `1a1e8476e528716b736f9905bc4da7d964e22369` | Immutable Delta D frontend checkpoint; overlaps both backend and Delta B UI files. |
| Delta D1 source | `backup/rc19/w4-d1` | `b924939ca21952f0f9730e9c0ad3ff63cc39b0fb` | Immutable atomic replacement source checkpoint. |
| Delta D2 source | `backup/rc19/w4-d2` | `cee519f1cecbcd9830ad5726debac44b1c6879ad` | Immutable notes workflow source checkpoint; includes D1 dependencies. |
| Delta D3 source | `backup/rc19/w4-d3` | `df89b655746af4a3df0818ad0e2480333fa8eeb3` | Immutable workforce/report source checkpoint; includes earlier D dependencies. |
| D1/D2/D3 review WIP | `backup/rc19/w4-d123-review-wip` | `ff181a11557b86a8b9c2598e6be9676ba071efb7` | WIP only; not an approved integration source. Contains frontend, backend and Delta C overlaps plus screenshots. |
| Delta D contract WIP | `backup/rc19/w4-d-contract-wip` | `73380b9a95f021105da2c2cd5de16c2100825e55` | WIP only; not an approved integration source. |
| Frontend Delta D review checkpoint | `backup/rc19/w4-delta-d-frontend-src` | `1a1e8476e528716b736f9905bc4da7d964e22369` | Same immutable source listed above; retained here as the pairing reference. |
| Main reference | `main` | `9b5f3889b243f9ee795e4466a18f24cd896c162f` | Production main reference only; not evidence of deployed Production SHA. |

## Feature source, files, contracts and evidence

“Source evidence” below means relevant tests or workflow evidence exists at the
named source checkpoint. It is not a pass on a converged candidate. Review status
remains **not reviewed for integration** unless stated otherwise.

| Scope | Source checkpoint | Relevant files and contracts | Migration dependencies | Existing test/evidence references | Conflicts, duplicate detection, integration status |
|---|---|---|---|---|---|
| Delta A: segment attendance | Release baseline `38dd7ae7…`; Lane 01 `24839cb6…` | `lib/services/supabaseSelfAttendanceService.ts`, `lib/services/supabaseShiftRegistrationService.ts`, `lib/server/selfAttendancePhotoHandler.ts`, `app/api/workforce/*`, `lib/types/database.types.ts`; segment assignment identity and attendance API contracts | `20261124093722_rc19_w4_attendance_assignment_links.sql`, `20261124104803_rc19_w4_actual_assignment_evidence.sql` | `tests/rc19-c511-persisted-e2e.test.ts`, `tests/rc19-self-attendance-contract.test.ts`, `tests/rc19-owner23-segmented-staffing.test.ts`; release gate run `45789031016` covers its recorded staffing scope at `38dd7ae7…` | Same files are changed again by Lane 01 and D1/D2/D3. Keep the release baseline as the starting implementation and review each later diff; do not replay a whole backup branch. Final paired acceptance not run. |
| Delta B: Import and staffing | `fix/rc19-w4-import-staffing@f28f94ff5772944d7dc6e089af54af12a8376ffb` | `ScheduleImportPanel.tsx`, `ShiftDetailModal.tsx`, `ShiftStaffingSegmentsPanel.tsx`, `operationsCollectionHandler.ts`, `dataService.ts`, `supabaseShiftService.ts`, `supabaseStaffingReadService.ts`, `database.types.ts`, `excelUtils.ts`, `scheduleImportDraft.ts`, `scheduleImportPreview.ts`, `scheduleImportReadback.ts`, `scheduleImportRecovery.ts`, `staffingSemantics.ts`; import preview/confirm/readback API | Adds `20261124120000_rc19_w4_import_staffing_integrity.sql`; follows attendance identity/evidence migrations | `tests/rc19-w4-taskb-import-staffing-pg17.integration.mjs`, `tests/rc19-w4-taskb-issue184-kao-regression.test.ts`, `tests/rc19-w4-taskb-staffing-semantics.test.ts`, `e2e/rc19-w4-import-staffing.spec.ts`; PR #188 | Broad overlap with Lane 01, D1/D2/D3 and frontend branches in schedule import, shift detail, services, generated types and release test manifest. KAO #184 P0 is not accepted. Not integrated. |
| Delta C: Live Monitoring | `fix/rc19-w4-live-monitoring-sharing@1065e070546daa7997364df42d8ae438c2a94722` | Dashboard/layout, `LiveStreamPanel`, `LiveTabCapture`, `LiveSharedStreamViewer`, publisher context, media API/server handlers, gateway and WebRTC clients; publisher/viewer contracts | Adds `20261124150000_rc19_w4_deltac_live_monitoring_sharing.sql` | `tests/rc19-w4-deltac-live-monitoring.test.ts`, `tests/rc19-w4-deltac-webrtc.test.ts`, `e2e/rc19-w4-live-monitoring-sharing.spec.ts`; PR #191 | Lane 01 and D123 WIP contain overlapping live/media files. Ignore WIP screenshots and gateway artifacts unless individually reviewed. Source/local tests do not establish WAN delivery. Not integrated. |
| Delta D1: Atomic Staffing Replacement | `backup/rc19/w4-d1@b924939ca21952f0f9730e9c0ad3ff63cc39b0fb`; Lane 01 consolidated source `24839cb6…` | `staffing/replacements/incident-v1` API, `staffingIncidentReplacementHandler.ts`, `staffingIncidentReplacementService.ts`, `shiftIncidentService.ts`, `shiftIncidentContract.ts`, `AtomicStaffingReplacementDialog.tsx`; replacement, incident and idempotency contracts | D1 incident foundation and atomic replacement: `20261125042222_rc19_w4_delta_d_incident_foundation.sql`, `20261125042647_rc19_w4_delta_d_atomic_replacement.sql`; requires attendance assignment identity/evidence and import staffing foundation | `tests/rc19-c4-atomic-staffing-replacement.test.ts`, `tests/rc19-delta-d-incident-error-contract.test.ts`, C4 regression run `45789031016` only covers baseline correction; actual D01–D11 remains not run | D1 files also appear in D2, D3, D123 WIP and Lane 01. Use one reviewed source for each file, not repeated cherry-picks. C4 correction already in release baseline; do not reapply. Not integrated. |
| Delta D2: Operational Notes | `backup/rc19/w4-d2@cee519f1cecbcd9830ad5726debac44b1c6879ad`; Lane 01 `24839cb6…` | `operational-notes/workflow-v1` API, `shiftOperationalNoteWorkflowHandler.ts`, `shiftNoteService.ts`, `shiftOperationalNoteWorkflow.ts`, `ShiftOperationalNotesSection.tsx`, `ReportOperationalNotesReview.tsx`; note lifecycle/CAS contracts | Adds `20261125175702_rc19_w4_delta_d_note_workflow_v1.sql`; depends on D1 incident foundation and shared staffing/shift identity | `tests/rc19-delta-d2-note-workflow-contract.test.cjs` and PG17 test at source branch; Lane 01 acceptance entrypoint | D2 checkpoint includes D1 plus import/attendance files. Avoid duplicate D1 migrations, shared service/type changes and UI from other backups. Not integrated. |
| Delta D3: Workforce and report snapshots | `backup/rc19/w4-d3@df89b655746af4a3df0818ad0e2480333fa8eeb3`; Lane 01 `24839cb6…` | `workforce/incidents/monthly` API, `workforceIncidentMonthlyHandler.ts`, `workforceIncidentMonth.ts`, `WorkforceIncidentSummaryPanel.tsx`, report revision/external summary routes and handlers/types | Adds `20261125175629_rc19_w4_delta_d_workforce_monthly_read_model.sql`; report snapshots `20261126051534_rc19_w4_d3_report_revision_snapshot.sql`; external summary `20261126120000_rc19_w4_d3_external_operational_summary.sql`; also requires `20261126130000_rc19_w4_canonical_agency_membership.sql` and `20261126140000_rc19_w4_workforce_monthly_scope_totals.sql` | `tests/rc19-w4-workforce-monthly-v2-contract.test.ts`, `tests/rc19-d3-report-revision-snapshot-pglite.test.ts`, `tests/report-external-summary-handler.test.ts`, `tests/workforce-incident-monthly-handler.test.ts`; Lane 01 entrypoint | D3 includes D1/D2-era shared files. Review authoritative full-scope aggregation before pagination, immutable snapshot and external audience contracts. Not integrated. |
| Agency Membership | Lane 01 `backup/rc19/lane01@24839cb6eafe019f178195c06fadc5cb66e5f86c` | `app/api/reports/external-operational-summary/route.ts`, workforce/reports services and `lib/types/database.types.ts`; membership authorization contract | `20261126130000_rc19_w4_canonical_agency_membership.sql`; dependent on temporal membership policy decision | `tests/canonical-agency-membership-pglite.test.ts`; Lane 01 acceptance entrypoint | Requires Owner policy review and actual Auth scope tests. Do not infer/backfill historical membership. Not integrated. |
| External Summary | Lane 01 `24839cb6…` | `app/api/reports/external-operational-summary/route.ts`, `reportExternalSummaryHandler.ts`, `reportExternalSummary.ts`; safe projection/audience API | SQL creates its summary records after the existing reports/revisions foundations; it has no direct Agency-membership FK. The application authorization contract uses canonical Agency membership. | `tests/report-external-summary-handler.test.ts`, `tests/report-external-summary-migration-pglite.test.ts`; Lane 01 acceptance entrypoint | Review explicit external audience authorization, revision linkage and safe fields; internal report data must not leak. Not integrated. |
| Workforce authoritative aggregates | Lane 01 `24839cb6…` | `workforce/incidents/monthly`, `workforceIncidentMonthlyHandler.ts`, `workforceIncidentMonth.ts`, `dataService.ts`; pre-pagination full authorized-scope totals contract | `20261125175629_rc19_w4_delta_d_workforce_monthly_read_model.sql`, `20261126130000_rc19_w4_canonical_agency_membership.sql`, `20261126140000_rc19_w4_workforce_monthly_scope_totals.sql` | `tests/rc19-w4-workforce-monthly-v2-contract.test.ts`, workforce incident handler tests | Overlaps D3 and generated DB types. Validate count scope and Agency authorization before merging. Not integrated. |
| Segment-aware PASS/Swap and receipt idempotency | Lane 01 `24839cb6…` | `segmentAwarePassSwap.ts`, registration/swap service and API contracts, `database.types.ts` | `20261126150000_rc19_w4_segment_aware_pass_swap.sql`; requires segment staffing and canonical Agency membership | `tests/rc19-w4-segment-aware-pass-swap-contract.test.ts`, `tests/rc19-issue93-pass-swap.test.ts` | Verify exact registration/segment IDs, capacity, role/Agency, retry authorization and payload-bound receipts. Existing `38dd7ae7…` C4 shared incident typing is separate and already present. Not integrated/accepted. |
| Origin Guard | `backup/rc19/w4-d123-review-wip@ff181a11557b86a8b9c2598e6be9676ba071efb7`; Lane 01 source | Runtime-origin and disposable-environment guards in media/storage source and tests; exact file set to be reviewed from the checkpoint diff before selection | No new migration approved by this manifest | `tests/origin-guard-security.test.ts` exists on WIP source | WIP only. Review strict runtime check AND disposable flag, and negative cases. Do not copy wholesale or count WIP evidence as PASS. Not integrated. |
| Frontend pairing | `backup/rc19/w4-frontend@634a2533b47d7b1e844483102cadd20d77532337`; Delta D frontend `backup/rc19/w4-delta-d-frontend-src@1a1e8476e528716b736f9905bc4da7d964e22369` | attendance, import, staffing segments, shift detail/notes, staff/workforce incident, report snapshot, swap and live UI; typed API use | No independent migration; must follow the selected backend contracts | `e2e/rc19-w4-import-staffing.spec.ts`, `e2e/rc19-w4-live-monitoring-sharing.spec.ts`, `scripts/verify-d1-review-pairing-uat.mjs` at source refs | High overlap with backend-owned components and among frontend checkpoints. Antigravity owns these paths. Pair only after API/type review; screenshots are optional evidence, not implementation. Not integrated or browser accepted. |
| Release Engineering and shared runtime | `chore/rc19-w4-release-readiness@38dd7ae7a374fbb4505b5a95e79c79f060377b42` | `.github/workflows/rc19-w4-hosted-application-acceptance.yml`, `.github/workflows/rc19-w4-infrastructure-rehearsal.yml`, `.github/rc19-w4-reviewed-application.sha`, harness contract | Runs canonical candidate migrations in a fresh disposable Supabase runtime; no remote migration | CI runs `45789031016` and `45789030990`, scoped exactly to this SHA | Keep harness refs immutable and action pins. Current allowlisted app SHA lacks the v2 acceptance entrypoint; newly published Lane 01 `015adc54…` is a backend source checkpoint with v1 reporting and does not meet it. The corrected harness is developed on the current Codex 02 branch; its caller is push-triggered only by a reviewed-ready marker. Actual application runtime remains not run. |

## Migration and type convergence order

Review and verify the exact SQL before execution; this is an integration dependency
order, not authorization to apply migrations to any environment.

1. Attendance assignment links and actual evidence:
   `20261124093722`, `20261124104803`.
2. Import/staffing integrity: `20261124120000`.
3. Live Monitoring sharing: `20261124150000`.
4. D1 incident foundation and atomic replacement: `20261125042222`, `20261125042647`.
5. D3 workforce read model: `20261125175629` (requires the D1 incident table).
6. D2 notes workflow: `20261125175702` (also references D1 incidents; independent
   of the D3 workforce read model).
7. D3 report revision snapshots: `20261126051534`.
8. External operational summary: `20261126120000` (requires the report/revision
   foundations above; do not assume it depends on the later membership migration).
9. Canonical Agency membership: `20261126130000`.
10. Workforce authorized-scope totals: `20261126140000` (requires the membership
    function created in the preceding migration).
11. Segment-aware PASS/Swap: `20261126150000`.

The final order must be derived from migration contents and references, not timestamps
alone. Reconcile the External Summary, Agency Membership and Workforce prerequisites
against SQL dependencies before running the hosted application workflow. The hosted
fresh-stack path must run only from a reviewed, exact application SHA.

Independent SQL inspection confirms that the D3 workforce read model queries the D1
incident foundation, and D2 adds a foreign key to that same foundation. Therefore
both follow D1; D3's migration timestamp precedes D2 by 33 seconds, but there is no
D2-to-D3 dependency. Keep the report snapshot migration after the existing report
revision foundation, External Summary after report snapshot sources, canonical
Agency membership before authorized-scope totals, and membership before
segment-aware PASS/Swap. This is source dependency review only; no migration was run.

## Independent reproduction and isolated test preparation

- **KAO #184 / Delta B:** the source regression fixture is a 2026-11-26 08:00–22:00
  Shopee Live KAO shift split into 08:00–12:00, 12:00–17:00 and 17:00–22:00
  segments. It exercises host requirements 2/1/2, support 1/1/1, technical `KT0`
  equal to zero, total positions (host 5, support 3, technical 0), staff-hours
  (23/14/0), inline title edit round-trip, duplicate re-import, safe update and
  readback/conflict guards. Reproduce only from the exact reviewed Delta B source
  with its synthetic fixture against isolated PGlite/PG17; the checked-in KAO test
  is source evidence, not a run or acceptance result from this branch. Do not use
  Production/Staging data.
- **Drive G11:** before any OAuth or upload, identify an Owner-authorized isolated
  test account and empty test folder, confirm the permitted Drive scope and cleanup
  owner, and use run-unique synthetic content. Required evidence is upload plus
  provider readback/hash, private ACL inspection, authorized same-Agency access,
  denied cross-Agency and unauthenticated reads, and cleanup/revocation. Capture
  only sanitized pass/fail, status and content hash; never retain OAuth tokens,
  file contents, personal data or raw provider responses. This is a test plan only;
  no Drive account, OAuth flow or upload was accessed here.
- **Migration ledger:** collect exact-runtime evidence from the isolated hosted
  rehearsal: full ordered local migration filenames and SHA-256, actual ordered
  `supabase_migrations.schema_migrations` receipts, PostgreSQL version, extension
  versions, Auth catalog tables, and GoTrue/PostgREST database identities. Compare
  the files and receipts from the same run and preserve sanitized evidence beside
  its application and harness SHAs. Fresh-stack receipts do not prove historical
  Production provenance or upgrade/rollback readiness.

`lib/types/database.types.ts`, `lib/types/shiftIncidentContract.ts`,
`lib/types/shiftOperationalNoteWorkflow.ts`, `lib/types/workforceIncidentMonth.ts`,
`lib/types/reportRevisionSnapshot.ts`, `lib/types/reportExternalSummary.ts`, and
`lib/types/segmentAwarePassSwap.ts` are shared contract surfaces. Select one reviewed
generated database type snapshot after all selected migrations are reconciled; do not
apply generated type patches from multiple backups.

## Explicit duplicate and artifact exclusions

- The C4 assertion correction and shared incident typing already exist in the
  `38dd7ae7…` release baseline. Do not cherry-pick them again.
- Delta B, D1, D2 and D3 checkpoints share schedule import, shift detail, staffing,
  service, generated database type and release-test-manifest files. Select reviewed
  file hunks by ownership; never merge all backup refs.
- Lane 01, Delta C, D123 review WIP and frontend backup contain overlapping media
  code. Only the reviewed Delta C checkpoint is an eligible Delta C source; WIP is
  evidence/provenance only until review.
- Do not bring `artifacts/d1-review-screenshots`, obsolete screenshots, cache/build
  output, synthetic provider artifacts, or WIP files into the release candidate by
  copying a backup branch wholesale.
- Preserve all `backup/rc19/*` refs as immutable recovery points.

## Current integration state and next gates

- Reviewed integration base and release baseline ancestry verified locally.
- Source refs fetched; SHA and file-diff inventories recorded above.
- No Delta A–D, Lane 01, or Antigravity code has been applied by this manifest.
- PR #187, #188, #191 and #192 remain unmerged; review status remains source-only.
- The push caller listens only to the Codex 02 branch and the reviewed-ready marker;
  current guard/caller commits do not match that path and cannot start business
  acceptance. The marker must not be created until Lane 01's candidate, harness
  allowlist and caller pins are reviewed together.
- Codex 01 must supply the reviewed application candidate and acceptance result.
- Antigravity must supply contract-paired frontend and browser/L01–L15 evidence.
- Before convergence, review provenance, changed code, overlaps, exact migration
  dependencies and API/type compatibility; then run impacted gates and record the
  resulting SHA. Candidate-wide checks remain NOT RUN.
- This document does not update the 8-phase checklist: no acceptance result changed.
