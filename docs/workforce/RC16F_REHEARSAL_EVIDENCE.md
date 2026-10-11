# RC1.6F — Executed isolated rehearsal

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
