# RC16I post-main hardening evidence

Verified main baseline: `d166bd74eb77692a7609cc6c9f3e510053da5edf`. Backend ancestry: `5ea8298a116267a2f463cc3c86761c04d92ccde9`. Branch: `fix/rc16i-postmain-hardening`, based directly on main. Reused the already-created post-main worktree only after verifying live HEAD and preserving its pre-existing changes.

## Preservation

Durable local backup: `C:/Users/KienNguyen/Downloads/KIEN ADA code/OPS LIVESTREAM PLATFORM/live-app-rc16-payroll/.worktrees/rc16i-preservation-20261012-213247`. All 57 bundle files hash-verified after copying from temporary storage. Original: three binary patches, 35 copied/hash-verified untracked files, complete 1149-file comparison, Git status and all registered worktree inventories. Post-main: three patches and eight pre-existing untracked files backed up before review. Unavailable historical worktrees left untouched.

Original staged/unstaged/complete-vs-main SHA256 values match the prior backup exactly:

- staged: `ca23fabd4b4f3ef005aa8fe67be58ed2b673daa8a7a23f755c342f61a81e0779`
- unstaged: `94e24720ac5ff7e4c57b124f666ab85bcff0b1b2b49d42a3c526b2ca9c9dab1d`
- complete-vs-main: `d211dd2bf720a8cdfa501b9fec4ebbf34e7a1f81f5c2be6529da26cb66473987`

Final preservation recheck: exact full original status, three patch hashes and all 35 original untracked hashes unchanged. Original HEAD remains 5ea8298 and MERGE_HEAD remains 7dddb168e82dbd49cf3b91d7cfc3ac451ed25478. No reset/clean/abort/restore/switch in original worktree. No wholesale cherry-pick.

Comparison: 1077 ALREADY_IN_MAIN excluded; 40 DIFFERENT, 21 RC16I_ONLY, 11 MAIN_ONLY reviewed in the 72-row file matrix. Retained main's auth resolver, backend, SQL/RLS, integer VND validations, storage MIME allowlist and migration lineage. Additional hardening blocks payroll transitions until current detail/audit is loaded.

## Executed validation

| Check | Current verified result | Evidence file |
|---|---|---|
| Full inventory, Node 22.23.3 | 1557 PASS / 0 FAIL / 3 SKIP; only the three named opt-in staging checks | .rc16i-node22-complete.txt |
| Final focused client/session tests, Node 22 | 11/11 PASS after final UI change | .rc16i-focused-final-node22.txt |
| TypeScript | Node 24 and final Node 22 PASS | .rc16i-tsc-live.txt, .rc16i-tsc-node22-final.txt |
| Full lint | PASS, 0 errors / 25 inherited unused-variable warnings | .rc16i-lint-live.txt |
| Final changed UI/client/browser lint | PASS, 0 errors | .rc16i-lint-focused-final.txt and final browser lint |
| PostgreSQL 16 | Complete existing isolated runner PASS: integrity, 49 RC16B, concurrency, idempotency, rollback, financial parity, 21 G and 10 H checks | .rc16i-pg16-live.txt |
| PostgreSQL 17 | Same complete isolated runner PASS | .rc16i-pg17-live.txt |
| H52 synthetic PGlite rehearsal | ISOLATED_FIXTURE_REHEARSAL_PASS | .rc16i-h52-rehearsal-final.txt |
| Next.js 16.2.10 production build, Node 22 | PASS; no Production credentials, mock OFF, server Workforce/Payroll flags OFF | .rc16i-build-node22-final.txt |
| Final Playwright, Node 22 | 28/28 PASS after final UI edits; desktop 1440px/mobile 390px, retry/edited retry, 401/403/503, identity, 409 correction/void, delayed response, missing audit, independent review, exact CSV bytes | .rc16i-playwright-verified.txt, local HTML/screenshot artifacts |
| Git diff whitespace | PASS | git diff --check |
| Canonical memory | PASS after objective branch/inventory sync; nine JSON records/projection consistent | memory:validate |

The first fresh Node 22 run was blocked because OCR screenshot variables were omitted (1555 PASS / 5 SKIP); the rerun uses main's exact e2e/fixtures/shopee-dashboard.jpg and tiktok-dashboard.jpg, with both OCR checks executed. Initial browser failures exposed stale test tab navigation, PowerShell Unicode damage in new locators and a locale assumption; corrected tests preserve assertions and use explicit Vietnamese fixtures. Final full browser run is green. No test or security constraint was weakened.

## Baseline comparison and CI provenance

Direct GitHub verification on exact d166bd7:

- RC16 gate: https://github.com/anhkienk4-max/live-app-main/actions/runs/38204643904 -- success, Node 22.23.3/PG16 and Node 24.18.0/PG17.
- Convergence: https://github.com/anhkienk4-max/live-app-main/actions/runs/38204643946 -- success. Job logs: full inventory 1551 PASS / 0 FAIL / 3 SKIP, 14 Playwright PASS.

Patch adds six unit/client tests and fourteen browser tests while preserving the inherited inventory and baseline workflows. Exact final pushed SHA and its new CI URLs are recorded in the Draft PR and final handoff after push; do not confuse baseline CI success with patch CI success. The final memory-only commit refreshes objective repository facts without changing tested application source.

## Production boundaries

No cloud database/client invocation, Production DDL/DML, migrations, environment file/provider writes, user provisioning, deployment or activation. Local test/build environment overrides are child-process-only. Docker PG16/17 containers have network none, no published ports and no host mounts; fixtures are synthetic, not a Production baseline rehearsal. Operator-reported ledger versions 20261011221500, 20261012000000 and 20261012000001 are treated as already applied and never replayed in Production.

Deployed immutable SHA and effective flags remain NOT_VERIFIED directly. Remaining owner/operator gates: authorized independent Payroll reviewer, approved payable/OT/break/lateness/rate policies, terminal void/reissue policy, actual Production storage/provider/RPC behavior and backup/restore evidence. Source checks and isolated screenshots do not close UAT or release gates. Branch-specific Vercel Git auto-deploy is disabled in vercel.json.

## Local evidence hashes

- `.rc16i-node22-complete.txt`: `ea5f2973939b9f8df4c06242c2c49c3103a1d66b1dfb94efa4f6822bd1a30209`
- `.rc16i-focused-final-node22.txt`: `f58010b77d9723b144aa396aefabaab1cdb45f96fccea54d79cd4715e76a1ecc`
- `.rc16i-tsc-node22-final.txt`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`
- `.rc16i-lint-live.txt`: `ed71918c0343b4b6512e75c2f15a5fd71bf15b4774e2f2c492a15160d8820443`
- `.rc16i-pg16-live.txt`: `f34bbee0d545eb36a8553468dca5e5f3bd6193e9387b01279ff6c48684a204bc`
- `.rc16i-pg17-live.txt`: `01810b3d6aecbdeb34281c914ce133ccc00913dceb6479683f22e5b131597338`
- `.rc16i-h52-rehearsal-final.txt`: `e92578cd43d4468610f33448474cf67b9a516d7af1f020b66e2c784f1de61af8`
- `.rc16i-build-node22-final.txt`: `f532e5786540ad4e1e499399e5429928df35f1332885f6dcede9394854ba6bfc`
- `.rc16i-playwright-verified.txt`: `f076ad094808d656b7a13999011e7b48a0d4e512c8b60022fd7abe8b8396a04d`
