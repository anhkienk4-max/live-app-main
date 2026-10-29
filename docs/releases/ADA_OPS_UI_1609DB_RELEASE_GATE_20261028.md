# ADA OPS UI candidate based on latest live code

As of 2026-10-28 23:30 ICT, `ops5729.top` serves Vercel CLI deployment `dpl_12GW7ZnV1gw2KmQpXmJtHFBAbKbA`, created 2026-10-28 15:58 UTC. Its navigation, header, sidebar and app shell content hashes match Git commit `1609db684de290e2a49f4c790f8ecdf3d1e9e461`.

Previous draft PR #136 was based on the older RC19 commit `1b96f38a`. Promoting it would roll back six newer commits (22 files) including role-filtered navigation, swaps, staffing and attendance fixes. **Do not merge/promote PR #136 as-is.**

This candidate forks `1609db684de290e2a49f4c790f8ecdf3d1e9e461` and cherry-picks only reviewed PWA presentation components, keeping the latest filtered role navigation in BottomNav/Header/Sidebar. Migrations, RLS, server services, auth sessions, and all other production source are untouched.

The Vercel source manifest records 678 source file hashes from a **truncated** API tree. The CI verifier compares them against immutable Git baseline; it cannot claim full provenance of omitted files. Unknown or mismatched tracked source is a NO-GO.

## Remaining release gate
1. CI provenance + UI boundary, TypeScript, ESLint, Next.js build, mock Login and mobile/desktop screens PASS.
2. Create isolated Preview with explicitly Staging-only Supabase variables for this branch. Never use fallback Production credentials.
3. Authenticate with three dedicated Staging accounts (Admin/Leader/Member) to validate navigation/RLS-sensitive views. Read-only first; no payroll mutation.
4. Prepare production-equivalent staging build without mapping `ops5729.top`, verify essential workflow parity and rollback.
5. Recheck live Production deployment ID immediately before any promote. If it moved, the candidate must be re-based and retested again.
6. Promote the exact tested Production build only after release approval. Keep GitHub `main` unchanged until the canonical source alignment is established.

Status: DRAFT / NOT GO-LIVE.

## Actual 2026-10-28 CLI provenance findings
CI initially failed immutable source attestation: 676/678 visible tracked files byte-match the new CLI Production deployment; `project-memory/current-state.json` and `project-memory/generated/project-memory.md` differ. These are explicitly pinned **documentary metadata drift**, not silently normalized and not identified as runtime JavaScript/TypeScript/SQL changes. The attestation step now passes only if all other tracked files match and the two documentary SHA-1 values are exactly those in the captured production manifest. **This does not establish complete deployment source parity** or authorize Production promotion.


## 2026-10-29 LIVE ALIAS DRIFT — BLOCKER

**Directly revalidated 2026-10-29 (ICT). DO NOT RELEASE PR #138 on the earlier production-source assumption.**

- Live `ops5729.top` is currently assigned in Vercel to READY Production deployment `dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX`, built 2026-10-29 00:54:36 ICT and ready/aliased around 00:57:45 ICT. The previous recorded live deployment was `dpl_12GW7ZnV1gw2KmQpXmJtHFBAbKbA`.
- The latest deployment is a Vercel CLI upload with **no Git commit SHA in its deployment metadata**. Do not attribute it to `1609db68` without further source verification.
- A read-only comparison of the two Vercel deployment source-file inventories returned 678 visible file entries in each. At least four shared files have different content hashes: `lib/services/operationalReferences.ts` (runtime), `e2e/rc16k-ui.spec.ts` (test), and `project-memory/current-state.json` plus `project-memory/generated/project-memory.md` (generated documentation). The new tree also contains `.worktrees/rc19-pass-swap-93/` entries. Directory listings are API-depth-truncated and must **not** be construed as complete source inventory or reliable evidence of deleted files.
- **Runtime drift is confirmed**: the file hash of `lib/services/operationalReferences.ts` changed from `55406165e949ebbd4e1f18611a65ad1e7d2d2d6e` to `62f9e8113f076a5413efa798c550941382b6ebee`. The deployed file snippet shows restructuring of actor verification around `readTransientData`. The connector truncates content, so complete semantic parity remains unverified.
- The reviewed Preview `dpl_rhZCMK6k3RZouAaGLtbMdJBv7QuV`, application SHA `775be57e5cd4bc6abb12387ced5cf4210f4024ca`, is still tied to baseline `1609db684de290e2a49f4c790f8ecdf3d1e9e461`. It remains useful for *UI-only exploratory staging checks*, but is **NOT** accepted as evidence of parity with the newly aliased Production.
- Current PR HEAD `3710baa01150a66b7fd0263fbc683ccd53d7d28a` includes three-role read-only Staging UAT; real authenticated Admin/Leader/Member checks remain **NOT RUN**. Passing CI test-listing and mock assertions is not equivalent to validating Supabase RLS or business workflows.

**New release gate: NO-GO / REBASE REQUIRED until independently proven equivalent.**

1. Freeze and preserve both Production deployment IDs and the current PR/Preview SHA. Do not merge, assign aliases, or deploy to Production.
2. Obtain the complete newly deployed runtime source (and its trusted Git mapping or a reviewed reproducible source bundle); compare with `1609db68`, especially `lib/services/operationalReferences.ts`, role filtering, staffing/swap, attendance, data caches and environment configuration. Resolve the extra worktree content in the CLI upload.
3. If runtime differences are material, port the approved UI-only changes onto the **actual new live source**, generate a new immutable Preview and require fresh CI/build/permission tests at the same application SHA.
4. Run real, dedicated Staging Admin/Leader/Member UAT with protected Preview bypass and non-production credentials; record FAIL/BLOCKED as such. Test mutations and backend RLS separately using approved Staging fixtures.
5. Stage Production with domain assignment explicitly suppressed, inspect the exact staged build and prepare rollback, recheck the live alias immediately before promotion, and promote only with owner approval.

This is an evidence update to the draft PR's release gate only; it does not change UI/runtime code, Supabase, CI secrets, or Production traffic.

## 2026-10-29 RC19 Core-source reconciliation (read-only evidence)

The live deployment remains `dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX` on `ops5729.top`; a separate READY production-target build `dpl_6KfC7VLRAwHkTcGnFyqhv6gkucqL` has **no production aliases**. Do not confuse readiness with promotion.

The exact deployed raw SHA-1 of `lib/services/operationalReferences.ts` is `62f9e8113f076a5413efa798c550941382b6ebee`. Its bytes are matched by GitHub branch `release/rc19-core-2026-11-01` at commit `1befe23bea9380dac37061a7132ac38143cf678b`. This branch is three commits ahead of `1609db684de290e2a49f4c790f8ecdf3d1e9e461`; differences are solely the runtime cache file, two generated memory files, a test manifest and a new operational-reference cache test. These five paths do not overlap the 54-file approved UI PR #138 patch.

A read-only comparison of the *visible* runtime paths of the aliased live deployment and the separate unaliased build found no changed shared `app/`, `components/`, `lib/` or `supabase/` files. This is **partial inventory evidence, not a full deploy-to-Git attestation**. The CLI upload exposed an embedded `.worktrees/` directory in one snapshot; the unaliased build did not show that directory in the visible listing. Review source-upload exclusions before a release.

**Candidate merge plan:** combine the approved UI branch with Core base `1befe23bea9380dac37061a7132ac38143cf678b` via an auditable two-parent merge commit without overwriting the Core changes. Retarget PR #138 to `release/rc19-core-2026-11-01`, preserving the same branch-scoped Staging Preview environment. CI scope checks must now diff from `1befe23bea9380dac37061a7132ac38143cf678b`. Old 28 Oct source attestation stays historical and cannot authorize a release. The new Preview needs a confirmed deployment SHA and real Admin/Leader/Member Staging UAT. Do not promote Production.

## 2026-10-29 RC19 Core-based staging build verified

- **Application commit:** `0e1c82cf0c60a73be6916029b457732f8960b9ee`, merged from original approved UI plus Core `1befe23bea9380dac37061a7132ac38143cf678b`.
- **UI-only diff from Core:** 54 files; no `lib/services/`, `app/api/`, `supabase/` or auth-backend changes in the PR diff.
- **GitHub UI CI:** https://github.com/anhkienk4-max/live-app-main/actions/runs/40831992753 (**SUCCESS** at the exact application SHA).
- **PostgreSQL CI:** https://github.com/anhkienk4-max/live-app-main/actions/runs/40831998666 (**SUCCESS**).
- **Verified Vercel Preview:** `dpl_7LQDADvHVuHYrxVifCN9MBvxE9Mf`, https://livestream-ops-demo-2x9hddzmk-livestream2.vercel.app, status **READY**, `target=null`, GitHub source SHA `0e1c82cf0c60a73be6916029b457732f8960b9ee`, no Production domain assigned.
- **Preview env preflight:** five branch-scoped Preview variables are configured, server and public Supabase URLs match, mock data is disabled. No decrypted or private credentials are recorded.
- **Remaining blocker:** run real read-only three-role Staging UAT; test capability/RLS and mutation safety separately, establish complete live CLI source provenance and prepare staged Production build/rollback before any release.
- **Release decision: NO-GO**, Production `ops5729.top` remains aliased to `dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX` at this observation.

## 2026-10-29 visible-file Core proof (explicitly partial)

Vercel source-list response for the currently aliased `dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX` exposed **678 file entries**, of which **677 have usable 40-character SHA-1 hashes**. Exactly **one** displayed hash is truncated: `e2e/rc16k-ui.spec.ts`. The same response includes **612 depth-truncation placeholders**, so it is not a complete source tree or a deployment-to-Git attestation.

The upload also exposes **84 files inside `.worktrees/rc19-pass-swap-93/`**. This is an avoidable build-context issue. The next source upload must explicitly exclude worktrees, local credentials, environment files, reports and development-only artifacts; confirm the upload exclusion configuration in the CLI workflow. No uploaded worktree source is authorized to replace the canonical Core branch.

The immutable visibility snapshot is `docs/releases/VERCEL_ALIASED_LIVE_20261029_VISIBLE_SHA1.json`. The CI verifier `scripts/verify-aliased-live-core-visible.mjs` compares every visible SHA-1 file that exists in Git at Core `1befe23bea9380dac37061a7132ac38143cf678b`, allows *only specifically hashed* generated memory metadata differences, and fails on unexpected executable/config/source mismatches. Nested worktree files and the truncated hash are reported separately. **Even a successful verifier cannot lift NO-GO**: exhaustive upload provenance, 3-role live-auth Staging UAT, RLS/mutation negative tests and owner approval remain mandatory.

## 2026-10-29 Staging login recovery (environment only, NO Production change)

A user-visible login screenshot displayed the generic `authUnknownError` error from `lib/i18n.tsx`; this does **not** identify the provider's root cause. Staging Supabase `amagnzebmmuqiptmrjmc` is ACTIVE, and a reviewed Staging identity was confirmed linked to an active business profile; no credentials are stored here. The Vercel encrypted env API returns a wrapped value, so comparing it directly with a public JWT is invalid and **must not** be reported as proof of a mismatched key.

The official current *Staging legacy anon/publishable key* was refreshed into `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Preview branch `release/rc19-ui-on-live-1609db-20261028` **only**, preserving its single Preview target. No server secret, user, password, RLS policy or database state was changed. A fresh Git-source build on the same application SHA `0e1c82cf0c60a73be6916029b457732f8960b9ee` created protected Preview `dpl_DM7VXbJqSY6RQW1E1LtyKGya4j2Z`, https://livestream-ops-demo-65dgk9k3z-livestream2.vercel.app, status READY, `target=null`. UAT script, harness and instructions are now pinned to this new Preview URL; old Preview `livestream-ops-demo-2x9hddzmk-livestream2.vercel.app` must not be used for post-env-change testing.

**Still BLOCKED:** manually authenticate on the new Preview with dedicated Staging identities and record the actual browser result. If the generic error persists, inspect browser Network for sanitized Supabase auth error code/status; do not paste passwords, tokens or unredacted network payloads. The existence of a READY Preview is **not** evidence of login success. Production `ops5729.top` had already been externally realiased to deployment `dpl_6KfC7VLRAwHkTcGnFyqhv6gkucqL`; no alias was changed by this fix. Treat this live deployment as a *new source parity gate* before any future production promotion.
