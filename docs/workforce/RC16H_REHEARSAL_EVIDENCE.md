# RC1.6H — Evidence và giới hạn rehearsal

Starting SHA `7d65097c255ae7ce2973eed78f9f58d10d562c2d`. Chỉ SELECT/catalog cloud,
metadata Vercel/GitHub và disposable SQL. Không cloud DDL/DML/ledger repair/env/
deployment/merge/Drive I/O/reviewer provisioning. Historical SQL không đổi.

## Baseline Production-compatible

`tests/fixtures/rc16h_production_catalog.json` được lấy bằng SELECT catalog trên
Production ngày2026-10-12: **14 tables**, columns/default/nullability/PK/FK/checks/
indexes/RLS/policies/triggers/ACL, **36 real function definitions**, gồm ba Shift
RPC, actor authorization, staffing projection, optimistic version, audit sanitizer/
capture, report metrics và notifications. Không chứa actual user/shift/report/route
rows, credentials, folder IDs hoặc lương. Reviewer/rate/records test đều synthetic.

Renderer/rehearsal không bypass essential helpers bằng stub always-allow.
Auth.uid dùng synthetic JWT-claim session và auth.users chỉ id UUID: không giả
thành Supabase Auth integration. PG16 bỏ duy nhất privilege MAINTAIN (PG17-only)
khi bootstrap ACL; các quyền SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
được giữ theo snapshot. PG17 tái hiện cả MAINTAIN. Private schema USAGE chỉ dành
authenticated theo catalog Production; migration không đổi schema ACL.
Không coi đây là full Production clone,
full backup restore, Auth/Storage extension test hay provider physical UAT.

## Đã thực thi

- PG16.15 và PG17.11: full runner `tests/rc16-payroll-postgres.integration.mjs`,
  validated containers network=none, không port/bind mount/real credentials.
  Engine major khớp17 Production, minor17.11 khác17.6; không claim exact-version clone.
- Foundation integrity; **49 RC16B assertions**; **5 race/atomic rollback/retry
  scenarios**; synthetic split/overnight/support/no-show/UNKNOWN/cover/replacement/
  extra fixture, locked active total **540667 VND**; partial RC15 negative/positive;
  **21 RC16G regression scenarios** retained; **10 RC16H assertion groups PASS**.
- H dùng chính shared renderer SQL: foundation→RC16B, transaction+post-security+
  ledger atomic. Forced failures rollback DDL/ledger, explicit retry, digest drift
  rollback, partial schema rejection và applied replay rejection.
- Synthetic legacy row JSON giữ nguyên sau mỗi migration: Shifts, Reports/revisions,
  routes/files, users/brands/platforms/settings/notifications/import metadata và
  global audit. Columns/defaults/constraints/indexes/triggers/RLS/policies/grants/
  private helpers/RPC body+ACL+SECDEF/search_path footprint giữ nguyên.
- Production create_shift test giữ overnight120 phút, real manual assignment →
  staffing projection, notification và audit triggers. Stale versions, Member RPC
  mutation và authenticated browser salary/RPC access bị từ chối.
- Existing49 RC16B assertions được reuse trên shape thật: các synthetic user/Shift
  inserts cung cấp thêm required fields; không giảm constraints hoặc override defaults
  để qua test. Foundation-only regression chạy trước B vì guard B mạnh hơn.
- Node24.18.0 và Node22.23.3: **106/106 security/auth/Payroll tests PASS** (100 giữ lại,
  6 H mới). Production-supported môi trường vẫn PASS trong security matrix,
  không chạy mutation/credential test Production.
- Storage broad run ban đầu130/131: assertion cũ về shared/subbrand ambiguity không
  khớp PR24 exact-subbrand semantics. Sửa test theo contract đã approved; final
  **131/131 PASS**. Focused Storage trước đó49/50 xác nhận MIME regression; sau
  fix52/52 PASS, gồm2 case mới (report/live invalid MIME và7 supported types).
- TypeScript và focused lint chạy thật; lint0 errors,12 existing unused-fixture
  argument warnings. Node22/24 Next builds không DB credentials; environment guard
  nhận credential_free_build, không cấp runtime DB access.

Local Node22/24 typecheck và Next build PASS trên code cuối; memory validation
và diff check PASS. GitHub run [38164109865](https://github.com/anhkienk4-max/live-app-main/actions/runs/38164109865)
đã completed/success trên implementation SHA `781ebde19594e3929bfb73f35c430fddd05cc088`.
Hai lane Node22.23.3/PG16 và Node24.18.0/PG17 đều PASS:90 RC16 +16 auth +131 Storage
=237 tests/lane,0 fail; PG integrity/49 B assertions/races/21 G/10 H groups,
typecheck, focused lint và Next build đều success. Checkpoint documentation/memory
sau implementation cần kiểm tra CI exact final SHA riêng trong handoff; không
suy diễn từ run implementation. Không coi CI là Production UAT/authorization.

## Hashes review artifacts

- Foundation `889fae5221c16b4e983f22e07da7e1212f796440eb06f4e327db0b862568b170`.
- B `5f3484fe3a2203cfa8cb484a97900975b1f72c75a35f8a09f49eb243283c7e72`.
- Preflight `9c5bf7b3386872bab899cff5e24cc48ed747bfc6b0ff4cb77f0ac7541dc0cfce`.
- Catalog fixture `cebb699d8402d18215f9697a3adeef89205cfb1572d8f632c732457e1bf860ac`.
- SQL renderer `d59031d30020aa0b12a9ac6dd2f7183a5cef52029a0dfc047e4cb8f46af46108`.

Renderer CLI1/2 đã chạy để render-only (47674/27255 characters trước newline counting);
không execute SQL cloud. Kiểm tra SHA artifacts một lần nữa trên exact approved
commit trước apply; manifests không phải permission.

## NOT RUN / blockers

Browser37 cases, Antigravity integration, physical provider UAT, real backup restore,
Production RC16 DDL, effective deployment key ownership và feature activation đều
**NOT RUN/BLOCKED**. Không seed cloud. Một Admin được xác nhận hiện hành;
không provision reviewer. Storage provider RPC/columns RC12 chưa có là gap catalog
thực tế; manifest Payroll không giải quyết dependency ấy. Staging không required
theo owner H; không tiếp tục apply G và không falsely đóng C02/C03.

## Tệp thay đổi (32)

```text
.github/workflows/rc16-workforce-payroll-gate.yml
app/api/workforce/capabilities/route.ts
docs/workforce/RC16C_INTEGRATION_READINESS.md
docs/workforce/RC16_GEMINI_UI_API_HANDOFF.md
docs/workforce/RC16H_ANTIGRAVITY_INTEGRATION.md
docs/workforce/RC16H_PRODUCTION_APPROVAL.md
docs/workforce/RC16H_PRODUCTION_READINESS.md
docs/workforce/RC16H_REHEARSAL_EVIDENCE.md
lib/server/reportImageRouteHandler.ts
lib/server/workforceActualHandler.ts
lib/server/workforceCapabilitiesHandler.ts
lib/server/workforceOverviewHandler.ts
lib/server/workforcePayrollHandler.ts
lib/server/workforcePerformanceHandler.ts
openspec/changes/rc16h-production-readiness/proposal.md
openspec/changes/rc16h-production-readiness/tasks.md
project-memory/current-state.json
project-memory/decisions/RC16H-production-only.md
project-memory/evidence/RC16H-production-readiness.md
project-memory/generated/project-memory.md
scripts/workforce/rc16h-production-manifest.mjs
supabase/release/rc16h/manifest.json
supabase/release/rc16h/preflight.sql
supabase/release/rc16h/production-evidence.json
tests/fixtures/rc16h_production_catalog.json
tests/rc12-report-file-provider.test.ts
tests/rc13c-compat-routing.test.ts
tests/rc16-payroll-discovery.test.ts
tests/rc16-payroll-postgres.integration.mjs
tests/rc16-production-readiness.test.ts
tests/rc16-workforce-api.test.ts
tests/rc16h-production.integration.mjs
```
