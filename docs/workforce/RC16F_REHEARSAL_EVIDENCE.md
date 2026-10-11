# RC1.6F — Executed isolated rehearsal

## RC1.6G executed extension — 2026-10-12

PG16.15 / PG17.11 disposable network-none containers rc16f-pg16-gfinal2 và
rc16f-pg17-gfinal2: **21/21 compatibility scenarios PASS trên mỗi major**.
Giữ foundation integrity,49RC16B assertions,5race/rollback scenarios,540667VND
golden fixture và2RC16F legacy scenarios đều PASS. Thêm3Node tests cho
hash/order/drift/discovery: total100/100 (97existing+3new) trên Node22.23.3/24.18.0.
Focused lint và typecheck PASS; builds Node22 và Node24 PASS. Exact-SHA GitHub CI được xác minh sau push.

Bốn DB disposable/major: legacy,fresh operational baseline,controlled failure,
recorded Production RPC branch. Fixture có synthetic historical Shift+Brand+routes,
actual column/default/check/FK,actor/eligibility/capacity/overlap/staffing/version
helpers và derived/status/version/update triggers. Route/Brand/Shift row JSON,
route ACL/trigger/index và RPC owner/ACL/SECDEF/search_path được so pre/post.
Test cả raw replay và ledger replay; drift và injected failure sau ALTER/function
replace rollback, không ghi version giả. Legacy/fresh chain tới RC15files/RC16B.
Digest sau3arg patch=1ed36fa69c62713d89ed2a104c73c013;create/4arg unchanged.

Reproduce bằng runner/lệnh local bên dưới, dùng container mới cho mỗi run;
RC16G tự chạy cuối tests/rc16-payroll-postgres.integration.mjs.
Manifest hash phải đúng trước writes. Không port/bind mount hoặc cloud URL.
Auth JWT service/global operational audit/privacy/report/provider schema không
clone; không claim full Staging clone, full Git clean install hoặc cloud UAT.
Chi tiết [RC16G readiness](RC16G_RECONCILIATION_READINESS.md).
Early replay regression expected constraint error nhưng guard mới bắt column
drift trước; fixed expected code, final fresh runs PASS. Sandbox spawn EPERM
được rerun với quyền local child process; không bỏ guard hoặc giảm assertions.

Local execution2026-10-11, Windows Node24.18.0, starting ba9b13f. Docker local,
network none, no published DB ports, no cloud credentials, initially empty DBs.
PG16.15 andPG17.11; actual Supabase server17.6. Major compatibility does not prove
exact minor/extensions/cloud baseline compatibility.

| Executed gate | PG16.15 | PG17.11 |
| --- | --- | --- |
|Foundation schema/RLS/browser grants,attendance/rate immutability,financial checks,independent transitions/global duplicate protection|PASS|PASS|
|Correction/void/idempotency/audit/nonDraft restrictions|49assertions PASS|49assertions PASS|
|Different UUID stale race,same UUID retry race,audit rollback,retry after rollback,Review/correction race|5scenarios PASS|5scenarios PASS|
|Namespaced overnight/multipleHosts/splitreplacement/singleSupport/late/extra/cover/no_show/UNKNOWN/correction/replay/void/lock|PASS;540667VND/6active/6audit|PASS;540667VND/6active/6audit|
|Partial RC13A→RC15 omissions and RPC fail closed;recorded Production baseline accepts RPC/files DDL|2compatibility scenarios PASS|2compatibility scenarios PASS|

Final local Node22.23.3 andNode24.18.0 each **97/97 PASS**:94existing tests plus
3rehearsal safety/manifest tests. TypeScript and focused new-script lint PASS.
Local Next builds on both Node22/24 PASS; memory validation,7deliverable links
and diff checks PASS. GitHub CI is independently verified after push; final SHA/run link
reported in handoff. CI matrix retains Node22/PG16 and adds Node24/PG17, pinned
pnpm10.26.0/frozen lockfile, full typecheck/security/auth/payroll/lint/credential-free
build. Relevant helper/fixture/legacy migrations trigger the gate.

Initial golden fixture failed against existing period uniqueness. It now uses
09-02→09-30 without weakening any constraint; both final fresh DB runs PASS.
One early run before server readiness failed without fixture writes; commands
below require pg_isready. No unresolved assertion failure in final runs.

## Reproduce (repository root, disposable local target only)

Create a new `rc16f-pg17-<run>`; suffix lowercase letters/digits/hyphens max40.
`docker run --detach --name <name> --network none --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17-alpine`.
Wait `docker exec <name> pg_isready -U postgres` until success. Set
`$env:RC16_PG_MAJOR='17'`, then
`node tests/rc16-payroll-postgres.integration.mjs --container <name>`.
PG16 uses fresh name/image16/major16. No ports or host bind mounts allowed.
Runner validates before SQL and refuses nonempty public schema. New container
per run; never delete approved rows to rerun. Stop named container after capture.
CI loopback mode requires GitHub Actions and forbids libpq routing overrides.

PG17 pull manifest digest:
`sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`.
Tags can move; record actual image/server version each run.

CSV verification is synthetic API regression, no browser/physical provider UAT.
Legacy fixture uses actual RC13A SQL/recorded Production RPCs with minimal tables.
Full Staging78shifts/9reports/private helpers/extensions/triggers/routes/permissions,
functional legacy RPC parity and Auth mapping remain UNVERIFIED. C02/C03 BLOCKED;
C09 only isolated compatibility PASS. All37browser cases NOT RUN.
