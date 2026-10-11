# RC1.6C — Danh tính môi trường và migration ledger

Snapshot chỉ đọc ngày 2026-10-11; phải kiểm tra lại trước thao tác ghi sau này. Không migrate/seed/provision/deploy/env update trong RC1.6C. Các ref/ID dưới đây là identity, không phải credential.

## Target đã xác minh

| Target | Bằng chứng live | Kết luận |
| --- | --- | --- |
| Supabase STAGING | `amagnzebmmuqiptmrjmc`, `live-app-staging`, ACTIVE_HEALTHY, database `db.amagnzebmmuqiptmrjmc.supabase.co`, PG17.6 | Project riêng với Production; chưa chứng minh deployment RC16 dùng nó; không phải DB trống |
| Supabase PRODUCTION | `egdjnpmoasarrttvhgds`, ACTIVE_HEALTHY, PG17; project user chỉ định | Chỉ list migrations và SELECT metadata/tổng role; không ghi |
| Isolated PG test | CI `postgres:16-alpine`; fixture bootstrap/integrity/correction + concurrent harness tại SHA baseline | Synthetic CI PASS; không phải Preview/UAT cloud. Không chạy lại migration local trong RC1.6C |
| Vercel project | CLI explicit scope `livestream2`, project `livestream-ops-demo`, ID `prj_YSrsxfYK7skM17D3KtiXUGeim2kr`, team `team_MBreE5MCbrZjyyBHnsaI5mc5`; Git link đúng repo, productionBranch=main | MCP lookup trả404; CLI cùng scope thành công. Node24.x; SSO `all_except_custom_domains`; không suy diễn mất quyền từ404 |
| Preview quan sát | `dpl_GKbTMDzRpEbxeriJHsdt5K6CFiFV`, `livestream-ops-demo-r40aqciga-livestream2.vercel.app`, READY; CLI inspect target=preview; API raw target=null (non-production) | Git metadata: branch PR24, SHA `a1fb0fdc36375f508b6fa7673b8b5779abda2046`; **không phải** HEAD PR24 hiện tại hoặc RC16/Gemini candidate |
| Production alias | `ops5729.top` → `dpl_CAMJ8fjbFw3PZ7bmKja5QxhY5dAr`, `livestream-ops-demo-fbvhgsv4x-livestream2.vercel.app`, production/READY theo inspect; metadata main SHA `31efea2d1a60583975e96773f68106d46ab7d8d9` | Identity đối chứng; không tạo deployment, không smoke/mutate business flow |

Danh sách 100 Preview gần nhất (cả state, projection branch/SHA) không có branch `feat/rc16-payroll-workforce-backend`. Có pagination, nên không khẳng định toàn bộ lịch sử không tồn tại RC16 deployment. Một query metadata bổ sung trả danh sách không lọc như mong đợi nên không dùng làm bằng chứng absence. Chưa có deployment candidate được chỉ định/phê duyệt cho RC16C.

## Ledger live so với Git

Nguồn: Supabase `list_migrations` cho **hai project ID cụ thể**, Git `supabase/migrations/` có 64 files; so version, không tự sửa ledger. Staging có 61 records, Production 60 records. Các version chung có thể khác tên prefix lịch sử; chưa so SQL/digest toàn bộ.

| Version / chức năng | Git backend | Staging | Production | Hành động sau khi được duyệt |
| --- | --- | --- | --- | --- |
| `20260919074349` RC12 provider | Có | Có | Không trong ledger | Không replay mù; so schema thực tế/digest |
| `20260924000000` RC13A storage routes | Có | Có | Không trong ledger | Production đã có RC15; ledger absence không chứng minh thiếu functionality; không replay RC13A |
| `20261008160638` Member registration privacy | Không | Có | Không | Dependency từ frontend convergence; review riêng và hội tụ release |
| `20261008160645` report revision history repair | Không | Có | Không | Dependency frontend; bảo toàn fix staging khi migration rehearsal |
| `20261011091925` RC15 prerequisites | Có | Không | Có | So prerequisite với staging RC13A baseline trước apply |
| `20261011092015` RC15 Shift RPC compatibility | Có | Không | Có | RPC baseline Production không được giả định giống staging; digest/rehearsal riêng |
| `20261011092051` RC15 operational files | Có | Không | Có | Staging thiếu `operational_files`; chưa ready Storage physical UAT |
| `20261012000000` RC16 foundation | Có | Không | Không | Chỉ apply target đã phê duyệt; không Production trong scope này |
| `20261012000001` RC16B Draft correction | Có | Không | Không | Additive sau foundation; giữ immutable audit/global unique |

Hai environment đều không có table `workforce_%` qua information_schema. Staging đã có `operational_storage_routes`, thiếu `operational_files`. Production **đã có RC15**, phù hợp runbook Storage hiện tại; RC16 không applied. Không được hiểu “PR Draft” là “mọi DDL chưa applied”.

## Tài khoản và fixture safety

SELECT aggregate dùng `status='active' AND account_status='active' AND deleted_at IS NULL`:

| Scope | Admin | Leader | Member | Giới hạn |
| --- | --- | --- | --- | --- |
| Staging | 2 | 2 | 7 | Chưa xác minh Auth mapping/login/ownership hoặc hai Admin độc lập được chỉ định cho Payroll UAT |
| Production | 1 | 1 | 5 | Không đủ reviewer độc lập theo RBAC Admin-only; không thay quyền trong audit |

Staging có 78 shifts và 9 reports. Không xem là disposable/synthetic toàn bộ; chưa đọc nội dung, không sửa/delete/reclassify chúng. UAT cần namespace fixture riêng và owner chấp thuận, lưu IDs đã tạo. Nếu chưa xác định ownership hoặc isolation phù hợp, dùng target cô lập khác được chỉ định; không seed đè existing data.

## Configuration/security đã kiểm tra và chưa chứng minh

Đọc metadata qua `/v10/projects/<projectId>/env?decrypt=false`, chỉ xuất **key/type/target/branch/khả năng đọc metadata value**, không xuất hoặc decrypt giá trị. Có entry Preview chung cho public URL/anon, `SUPABASE_SECRET_KEY`, mock flags, Google OAuth/root và storage enable. Một số storage mode/static routes/token entries chỉ scope branch RC12. Không thấy entry `WORKFORCE_LATE_GRACE_MINUTES` hoặc `WORKFORCE_LEADERBOARD_MIN_VERIFIED_SHIFTS` trong metadata Preview đã đọc. Không có override RC16 branch được xác nhận.

Encrypted entry tồn tại không chứng minh value đúng target/key hoặc runtime configured. Sensitive entry không có readable value không có nghĩa credential absent. Không đọc/decrypt credential, không `env pull`, không `vercel link`, không tạo bypass URL, không tắt SSO.

Source `createSupabaseAdminClient` chọn `SUPABASE_URL || NEXT_PUBLIC_SUPABASE_URL`, secret chỉ server `SUPABASE_SECRET_KEY`. Guard build chỉ kiểm tra public URL; do đó phải chứng minh **cả privileged URL/key và browser URL/anon** cùng staging, không chỉ public URL. Guard local-build có nhánh khác local dev; không dùng build PASS làm isolation proof. Key thật không được log/copy vào docs, không có `NEXT_PUBLIC_*` service-role.

RC16 schema bật RLS và revoke anon/authenticated table/RPC access; API authorization là ranh giới khi server dùng service-role. Salary/rates/audit chỉ Admin. Actual Admin/Leader; own performance Member; overview Admin/Leader. Chưa có schema này ở staging, nên chưa kiểm tra RLS cloud hay authenticated RC16 response.

Trước UAT phải xác minh effective configuration trên đúng immutable deployment SHA: public/server project identity và key alignment, mock false, approved workforce policies, SSO access, scoped test provider/root/route và absence Production credentials/routes trong candidate. Source guard + encrypted metadata không đủ để mở ghi dữ liệu.

## Ranh giới migration được đề xuất

Chưa có ủy quyền migration. Không chạy `supabase db push`, apply_migration, raw DDL, repair ledger, fixture SQL hoặc seed lên cloud. Kế tiếp là duyệt **manifest migrations forward-only** cho target xác minh, kiểm tra baseline RPC/schema và rehearsal PG17. Không clone Production data vào fixture, không đổi historical shift source, không chạm Drive Production. Sau approval apply chỉ version/scope đã review, rồi list ledger/schema lại trước browser E2E.
