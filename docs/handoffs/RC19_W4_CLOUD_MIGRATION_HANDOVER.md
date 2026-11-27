# APP OPS RC19 W4 — Cloud Migration Handover

**Snapshot verified:** 2026-11-27 (UTC date). **Repository:** anhkienk4-max/live-app-main (public). **Purpose:** portable source, task, and evidence handoff for Codex Cloud 01, Codex Cloud 02, Antigravity Cloud, and GitHub Actions.

This document is not Production acceptance. The source checkpoints below are recoverable from GitHub. Complete local-data recovery verification is blocked as described in “Recovery and deletion gate”; do not treat this handoff as proof that all recovery backups exist.

## Cloud entry points and exact refs

| Owner | Branch and exact SHA | Status |
|---|---|---|
| Codex 01 | backup/rc19/lane01 — 24839cb6eafe019f178195c06fadc5cb66e5f86c (source checkpoint 75e5cc09569e5c971280bd655308cd61fcf73d33 is its ancestor) | Preserves Agency Membership, External Summary, Workforce monthly v2, typed incident correction, and the Lane 01 acceptance entrypoint. WIP preservation checkpoint, not application acceptance. |
| Codex 02 | chore/rc19-w4-release-readiness — 38dd7ae7a374fbb4505b5a95e79c79f060377b42 | Release workflow, reusable hosted runtime harness, and C4 correction. Latest unified gate is green on this SHA; application acceptance has not run. |
| Antigravity | fix/rc19-w4-live-monitoring-sharing — 1065e070546daa7997364df42d8ae438c2a94722 | Delta C source; PR 191 is open and draft. No Production acceptance. |

Other recoverable integration checkpoints:

- Integration candidate: integration/rc19-w4-final-integration — 8fab7eacfaab38e7b5e798db7900f12a9b7b17f9; PR 187 is open and unmerged. Use it as the current integration reference, not main.
- Delta B: fix/rc19-w4-import-staffing — f28f94ff5772944d7dc6e089af54af12a8376ffb; PR 188 is open and unmerged.
- Exact segment-aware PASS/Swap frontend: backup/rc19/w4-frontend — 634a2533b47d7b1e844483102cadd20d77532337. It preserves exact commits bd6d7fa7537961ac224e9609d8ecbda513623cd9 and 765ffd924926336c0615f30ab6f6696090d55775 as ancestors. The paired backend contract commit 520a1d585d5b495e5c8525399193745374699f17 is in backup/rc19/lane01.
- Delta D1: backup/rc19/w4-d1 — b924939ca21952f0f9730e9c0ad3ff63cc39b0fb; original tip 6923a0bda50ae1cccb64726e1fb1134e60085e8d is an ancestor.
- Delta D2: backup/rc19/w4-d2 — cee519f1cecbcd9830ad5726debac44b1c6879ad; original tip 5eb3992c23767af539b946af9105af93bc70d126 is an ancestor.
- Delta D3: backup/rc19/w4-d3 — df89b655746af4a3df0818ad0e2480333fa8eeb3; original tip 4ff3d55c2bcda2e966393b52fc22c4dc7f43d92a is an ancestor.
- Delta D frontend source-only equivalent: backup/rc19/w4-delta-d-frontend-src — 1a1e8476e528716b736f9905bc4da7d964e22369. This retains source from the reviewed work but omits 48 PNGs and one browser report and anonymizes mock identities. The original 747092128b4667b535eb62d016237eb472a82875 is intentionally not the recovery ref.
- D123 review WIP: backup/rc19/w4-d123-review-wip — ff181a11557b86a8b9c2598e6be9676ba071efb7. Contains 12 scoped source/test files; the Origin Guard assertion remains, with synthetic URL userinfo only.
- Delta D contract/OpenSpec WIP: backup/rc19/w4-d-contract-wip — 73380b9a95f021105da2c2cd5de16c2100825e55. Contains five contract/OpenSpec files.
- Earlier Antigravity checkpoint: backup/rc19/frontend — dd033e868c3a45610fd9731e202e03cf9c50a40c; its preserved source checkpoint is an ancestor.

Treat all backup refs as immutable recovery points. Start new working branches from reviewed integration candidates; do not develop directly on backup refs. Each backup ref has a branch-specific Vercel deployment guard.

## Repository instructions, memory, contracts, and setup

The required repository AGENTS.md, project memory under .agents/memory, and MIGRATION_DEPENDENCY_MANIFEST.md are present in the Lane 01 and Lane 02 refs. Read AGENTS.md and the memory on the chosen exact ref before changing source. PROJECT_STATE.md contains historical snapshots; Git SHA and this handover take precedence when it disagrees.

The Delta D proposed contract and OpenSpec proposal/design/tasks are available on backup/rc19/w4-d-contract-wip. The full latest PASS/Swap contract handoff is included beside this document as RC19_W4_PASS_SWAP_SEGMENT_HANDOFF_LATEST.md. The typed incident patch (SHA-256 05100B28D35E428FE84DACEC80BAB4CAD602533BBA4A299D5D4949F5F398E8D5) is already represented in the Lane 01 source; the patch file itself is not a dependency. No APP OPS-specific custom skill was found in the local custom-skill roots. The repository tests, workflows, AGENTS.md, memory, and contracts are the portable sources of truth.

For a fresh Cloud checkout, use the repository URL and exact refs above. Release workflows pin Node.js 24.18.0 and pnpm 10.26.0. Standard setup is: enable Corepack, activate pnpm 10.26.0, then run pnpm install --frozen-lockfile. Do not copy any local .env file. Use only synthetic credentials in disposable environments and inject authorized secrets through the relevant Cloud/GitHub secret store. Keep memory:validate in the mandatory release workflow.

## Dependency order and integration sequence

1. Read the exact integration candidate, AGENTS.md, project memory, and migration dependency manifest. Create a new integration branch from the reviewed candidate; do not change main or the backup refs.
2. Codex 01 reviews Agency Membership and the canonical contracts first. Produce a reviewed application candidate SHA and sanitized migration evidence from the correct disposable database. Keep business migrations, RLS/RBAC, and fixture contracts under Lane 01 ownership.
3. Integrate Delta A and Delta B against the exact staffing/import contracts and verify persisted assignment/segment identity. PR 188 remains open and is not implicitly accepted by this handoff.
4. Integrate segment-aware PASS/Swap backend contract and migration before the frontend. Preserve exact registration IDs, segment IDs, eligibility, and persisted readback. The local latest handoff says authenticated PG17/GoTrue and end-to-end acceptance remain required.
5. Review Delta D1 incident replacement and D2 operational notes contracts/migrations, then D3 report/workforce snapshots that depend on their canonical source contracts. Do not rename, replay, or repair historical receipts by guesswork. The D1/D2/D3 refs are WIP, not accepted integrations.
6. Antigravity owns Delta C. Keep its database/app changes isolated and finish real streaming infrastructure and authorized viewer proof before calling it accepted.
7. Codex 02 updates the application SHA allowlist and adds/uses an authorized workflow_call caller only after Codex 01 supplies an exact reviewed application candidate. Run the reusable application acceptance while the disposable database/runtime is alive. It must attest synthetic Admin, Leader, Member, canonical business_users mappings, RBAC/RLS, application API, and sanitized evidence.
8. Run the Unified Release Gate on the exact integrated SHA, including memory:validate, mandatory synthetic fixture restore, Full Canonical Regression, and Next.js production build. A fresh-stack pass is not historical upgrade acceptance.
9. Only after gates and Owner approval may separate KAO/G11, Production identity, backup freshness, rollback compatibility, and release decisions proceed. No Production/Staging writes are authorized by this handoff.

## Current test evidence and limits

- Unified Release Gate run 45789031016 on 38dd7ae7a374fbb4505b5a95e79c79f060377b42 completed successfully. ESLint, PostgreSQL 17 migration/constraint gates, synthetic fixture dump/isolated restore parity, storage/sequential migration verification, Full Canonical Regression, and Next.js production build succeeded. Link: https://github.com/anhkienk4-max/live-app-main/actions/runs/45789031016
- Hosted infrastructure rehearsal run 45789030990 on the same SHA succeeded. It proves the disposable PostgreSQL/Supabase infrastructure smoke only. Link: https://github.com/anhkienk4-max/live-app-main/actions/runs/45789030990
- The synthetic fixture Restore is not a historical production-clone upgrade, Production Restore, or recovery-backup verification.
- No hosted application acceptance run was found for the release branch. The reusable workflow is workflow_call-only, has no caller on that branch, and currently pins application SHA 87a077955f309e5daaaf4c8dd229df2ae586053a. That SHA does not contain the Lane 01 acceptance entrypoint and is not an ancestor of the Lane 01 backup. The entrypoint commit ec44ace77a28c0f0d4a9bbe758773f4e5c2a8021 is preserved in the Lane 01 backup. Update the allowlist to a reviewed candidate and establish an authorized caller before claiming application acceptance.
- Delta D branches and the latest Antigravity head have no current acceptance result in this handoff. Do not reuse older test claims for a different SHA.

## Migration and historical runtime blockers

Historical migration evidence reported 140 local files, 135 application receipts, 116 common versions, 43 unmatched versions, 16 same-SQL version aliases, two receipts without source provenance, and an empty statements receipt at version 20261111200000. These are stale historical counts, not a current reconciliation. Obtain the sanitized artifact from Lane 01 for the exact disposable database: marker/database identity, PostgreSQL version, application versions and executed file/statement hashes, Auth versions/catalog metadata, runtime image/version, and actual connection identity. Exclude user rows, credentials, JWTs, and raw dumps. Reconcile Git provenance, order, dependencies, schema impact, and remediation per version. No blanket migration repair, manual receipt, arbitrary rename, or guessed replay.

The historical GoTrue clone failure (SQLSTATE 42703, missing client_id) remains unresolved as a historical-clone root cause. The successful fresh stack does not prove historical clone health. No managed Auth schema edits or fabricated Auth receipts are allowed.

## Open Go-Live and Production readiness work

As of 2026-11-27, Issues 80, 93, 165, 184, 189, and 190 remain open. Issue 184 is the confirmed KAO wrong-date/zero-segment defect; full KAO acceptance remains outstanding. Issue 165 still requires actual Drive write/readback and ACL evidence. Issue 93 requires authenticated PASS/Swap acceptance. Issue 189/PR 191 is draft; real WHIP/WHEP, MediaMTX, TLS/TURN, and authorized delivery remain pending. Issue 190 Delta D remains implementation/review work, not acceptance. The master release issue remains open.

The release branch has no verified Production deployment source identity, Supabase runtime binding, current backup freshness/retention proof, or rollback compatibility evidence in this audit. The historical BACKUP_RESTORE_RECOVERY_PLAYBOOK.md is not proof of a current backup and contains stale operational specifics; do not execute it without revalidation. Keep all provider credentials outside GitHub and do not perform Production/Staging writes.

## Recovery and deletion gate

Source recovery has been verified by remote branch SHA and ancestry. To recover a source checkpoint on a new machine, fetch the named branch and check out the exact SHA above. For example, fetch backup/rc19/w4-d1 and check out b924939ca21952f0f9730e9c0ad3ff63cc39b0fb. The source-only Delta D frontend ref intentionally recovers equivalent source, not the omitted images/report or original sensitive mock identifiers.

A connected Drive search found backup/restore runbooks but no actual RC19 production database backup artifact. Supabase project metadata confirmed project records only; the available read-only interface did not expose backup timestamps, retention, or restore points. Therefore safe off-machine recovery of necessary Production data is NOT VERIFIED. A runbook or sanitized summary cannot replace a restorable backup. Before deleting the local project, an authorized Owner/DB operator must verify the correct provider-managed backup/point-in-time recovery window and retention in the provider console, record a non-sensitive reference and timestamp, and confirm a tested restore path in an isolated environment. Store the actual recovery backup only in Owner-approved secure storage, never in this public repository or chat.

Local-only generated runtime evidence and screenshots were not uploaded. They are not source; the successful GitHub Actions runs above are the portable CI evidence. If any local rehearsal artifact is required for a separate audit, preserve it through an approved private archive before local deletion. No worktree or local data was deleted as part of preparing this handoff.

## Agent task checklist

- **Codex 01:** review the exact Lane 01 source and manifest; prepare a reviewed application candidate; verify source ownership/contracts; export the sanitized disposable-database migration/runtime artifact; run focused business acceptance; do not modify Lane 02 orchestration or production data.
- **Codex 02:** keep the Lane 02 release branch as orchestration owner; refresh the app SHA allowlist from reviewed evidence; create the authorized workflow caller; run actual hosted application acceptance before cleanup; reconcile migrations with Lane 01 evidence; repeat the Unified Release Gate only on a new exact integrated SHA; maintain no-deploy guards.
- **Antigravity:** continue from the exact Delta C branch head; finish real infrastructure and authorization requirements; update PR 191 evidence for its current SHA; keep the PR draft until acceptance requirements pass.
- **All agents:** use exact GitHub SHAs, keep secrets and raw data out of public artifacts, do not merge main, deploy, or write Production/Staging without separate authorization.

## Portability status

**Source and agent-instruction portability:** verified on GitHub at the refs listed above. **Full ZERO LOCAL DEPENDENCY / SAFE TO DELETE ENTIRE LOCAL PROJECT:** BLOCKED until the off-machine Production recovery backup and restore path are independently verified. No source acceptance or Production readiness is implied.