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
