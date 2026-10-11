# RC1.6H — Readiness riêng cho Production

Quyết định owner ngày 2026-10-12: phát hành trực tiếp Production; không bắt buộc
Staging/Preview. Quyết định này **không** cấp phép DDL/DML, merge, deploy, đổi env,
provision reviewer hoặc ghi fixtures cloud. RC1.6G không được tiếp tục triển khai.
Các tài liệu C/F/G là snapshot lịch sử; kế hoạch H này thay thế gate Staging.

## Bằng chứng hiện tại

- Starting SHA `7d65097c255ae7ce2973eed78f9f58d10d562c2d`, worktree sạch,
  branch `feat/rc16-payroll-workforce-backend`, bằng remote sau fetch.
- `origin/main` và Production deployment Git SHA:
  `31efea2d1a60583975e96773f68106d46ab7d8d9`; backend ahead220/behind0 tại preflight.
- PR25 Draft, base `fix/rc14-data-report-export-fidelity`; PR24 Draft, base main,
  head `e5879abeff7a1a4ffbf8222093047bb5882456dc`, đã nằm trong backend ancestry.
- Supabase project `egdjnpmoasarrttvhgds`, ACTIVE_HEALTHY, SQL server_version17.6;
  provider metadata17.6.1.155. Ledger60 entries; RC15 ba bước đã applied;
  RC16/RC16B chưa applied, không có bảng `workforce_%`.
- SELECT chỉ đọc xác nhận **1 Admin** có status/account_status active và không
  archived/deleted. Không đọc tên, email, lương, folder IDs hoặc credentials.
- CLI explicit team `livestream2` xác nhận project
  `prj_YSrsxfYK7skM17D3KtiXUGeim2kr`, Node24.x. API read-only với
  `team_MBreE5MCbrZjyyBHnsaI5mc5` resolve `ops5729.top` tới
  `dpl_CAMJ8fjbFw3PZ7bmKja5QxhY5dAr`, target production, READY,
  immutable URL `livestream-ops-demo-fbvhgsv4x-livestream2.vercel.app`, Git main/SHA trên.
  MCP404 và CLI inspect scope error được phân biệt với API fallback thành công.
  Đây là deployment hiện hành; **chưa phải candidate RC16H**. Không decrypt env;
  metadata không chứng minh effective credentials/provider routing.

## Dependency và conflict matrix

| Dependency | Kết quả thực tế | Xử lý bắt buộc |
|---|---|---|
| RC15 route prerequisites/Shift compatibility/operational_files | Ledger và catalog có; 19 route columns, provider_metadata jsonb, exact NULLS NOT DISTINCT index | Không replay RC15 |
| create_shift / update_shift3 / update_shift4 | MD5 `7f813fa9c9c4b25f2ed965ffc9fe872c` / `052af1089ed967316d385007828e971c` / `ead3d98c97a4f293a521e1a6bf4aba3c`; ACL/SECDEF/search_path khớp | Guard trước mỗi bước; drift → STOP |
| RC16 / RC16B | Thực sự thiếu Production | Hai bước duy nhất trong manifest Payroll H |
| Hai RC16G reconciliation | Chỉ dành baseline Staging; incompatible với Production RPC | Excluded; giữ lịch sử/tests, không áp dụng |
| RC12 provider contract | Không có ledger20260919074349; không có provider/external_file_id trên report_images/live_report_images; không có bốn provider/delete RPC của RC12 | P0 Storage dependency cho database routing; cần owner của Storage xác nhận forward-only solution tương thích H5.2, không blind replay lịch sử |
| RC13A ledger | Không có20260924000000 nhưng execution_source/routes đã tồn tại dưới RC15 | Không suy diễn thiếu schema từ thiếu version; không replay |
| PR24 | Đã chứa trong backend, chưa merge; thay đổi Storage UI, Calendar import, CampaignList, ReportFormModal, package.json, role-ux | Review riêng trên source cuối; không dùng PR25 như chỉ-diff-Workforce khi release từ main |
| Antigravity H5.2 | Owner báo đang phát triển worktree khác; chưa có final branch/SHA/PR được xác nhận cho Payroll/Workforce | Không merge/cherry-pick/overwrite; cần owner bàn giao source cuối |
| Các refs frontend cũ | Có refs14wave/UI nhưng không được xác nhận là UI RC16 | Không coi tên branch là approval |
| Local avatar/screenshot worktrees | Có worktree riêng, chưa thấy remote ref tương ứng tại fetch | Metadata này không chứng minh deliverable hoàn tất hoặc schema release |

Fetch trước delivery thấy `rc/convergence-rc14-rc15` tiến từ d4b5999 tới
`7dddb168e82dbd49cf3b91d7cfc3ac451ed25478` (commit H5.2). Nhánh này có candidate
`20261011221500_rc15_provider_metadata_forward_compat.sql` cho RC12 gap; không
cherry-pick vào backend. Tài liệu H52_GO_NO_GO ở commit mới vẫn ghi verified SHA
d4b5999 và NO-GO Production, có gate Preview/SSO cũ; chưa có owner xác nhận source
cuối hay re-scope theo quyết định H. Không coi tên commit “complete” là approval.
Sau owner bàn giao, review/rehearse candidate này trước hai bước Payroll; **không
viết một migration provider thứ hai** hoặc đưa hai staging-only frontend fixes
`20261008160638`/`20261008160645` vào Production tự động.

RC12 thiếu là một dependency **được xác nhận ở catalog**, không khẳng định thao tác
Storage hiện hành đang hỏng: runtime routing mode chưa được đọc. Manifest này chỉ
áp dụng Payroll, không sửa Storage. Full release phải giữ mode/semantics đang hoạt
động và chặn cutover thiếu contract. H5.2 source cuối phải được so sánh lại với
Production catalog mới; tránh hai nhánh cùng thay đổi provider persistence.

## Feature flags đã thực thi

Reuse `lib/flags.ts`; không thêm NEXT_PUBLIC flag hoặc nguồn quyền thứ hai.

| FEATURE_ACTUAL_STAFFING | FEATURE_PAYROLL | Hành vi API |
|---|---|---|
| absent/false | absent/false | Actual/performance/overview và Payroll503 sau authorization; không connect privileged DB |
| true | false | Workforce hoạt động theo RBAC; Payroll disabled |
| false | true | Payroll hoạt động theo Admin RBAC; Workforce disabled |
| true | true | Cả hai theo quyền/policy/evidence hiện hữu |

Giá trị không nhận diện → OFF, đúng semantics helper hiện hữu. Flags độc lập;
không mở rộng Leader/Member salary access, không bỏ self-review/self-confirm.
API capabilities hỗ trợ UI ẩn menu theo server result. Không đổi env cloud.
OFF chặn request mới; không hoàn tác request đã được nhận, migration, chứng cứ
hoặc payroll locked. Không phải emergency transaction cancellation.

## Verified code/test hardening

- Trước H, feature flags có sẵn nhưng chưa được nối vào Workforce/Payroll handlers;
  H chặn toàn bộ surface tương ứng trước privileged DB, sau authorization.
- Storage regression được xác nhận: RC15 mở MIME cho operational artifacts nhưng
  report/live uploader dùng allowlist global, khiến text/plain nhận200. H khôi phục
  allowlist bảy types đang được Production main hỗ trợ ở đúng hai đường upload,
  trước idempotent retry/routing/provider. Tài liệu RC15 vẫn giữ allowlist rộng.
- Broader Storage gate phát hiện assertion RC13C cũ mong ambiguity giữa route
  platform shared và subbrand-specific. PR24 đã sửa semantics exact subbrand;
  H cập nhật **test**, xác minh chọn subbrand-base và reject shared-only fallback.
  Không thay routing source hoặc mở rộng quyền/storage profiles.

## P0/P1 và GO/NO-GO

| Gate | Severity | Trạng thái / owner / điều kiện đóng |
|---|---|---|
| H01 UI/source/integration, tương ứng C01 | P0 | BLOCKED; Antigravity owner cung cấp final verified SHA/PR, integration contract và browser evidence |
| H02 candidate/runtime identity | P0 | BLOCKED; release operator xác minh SHA, project/team/Production target, effective URL và key ownership, mock=false, provider routes |
| H03 Production migration approval/apply | P0 | OPEN; owner/DB operator duyệt backup + manifest + apply/post-verify riêng; C03 Staging không còn prerequisite, không được ghi RESOLVED |
| H04 independent reviewer | P0 Payroll | BLOCKED; owner cấp phép reviewer Admin thứ hai theo quy trình hiện hữu; không tạo Finance role tự phát |
| H05 HR rates/OT/payable-break/lateness/leaderboard policy | P0 activation | OPEN; HR/owner phê duyệt rõ, không đưa synthetic rate vào Production |
| H06 terminal void/reissue | P0 Payroll | OPEN; owner chấp nhận void giữ segment vĩnh viễn hoặc duyệt workflow recovery riêng; không unvoid/pay cùng segment hai lần |
| H07 Storage RC12 compatibility + PR24/H5.2 | P0 release | BLOCKED; Storage owner xử lý source/schema/runtime dependency và chứng minh không regression |
| H08 backup/recovery/physical Storage verification | P0 release | NOT RUN; DB/operator/provider owner cần bằng chứng mới trước mutation |
| H09 backend code, C10 | P1 | Regression verified; không đồng nghĩa cloud UAT hay release authorization |
| C02 Preview proof | Historical | Không required theo quyết định H; không falsely close bằng Production/isolated evidence |

**NO-GO phát hành/activation lúc này.** Backend rehearsal có thể hoàn tất trong khi
UI, policy, reviewer và live verification còn mở. Staging bỏ khỏi critical path;
Production identity/backup/approval không bị bỏ.

## Công việc tiếp theo chính xác

1. Antigravity owner finish/push final H5.2 và bàn giao branch/SHA/PR + các file
   Payroll/Workforce đã thực hiện; Storage owner xác định ai sở hữu RC12 compatibility.
2. Chỉ sau bàn giao: tạo integration branch riêng từ source được owner duyệt,
   reconcile PR24/backend/UI, giữ H flags OFF, chạy toàn bộ automated gates.
3. HR/owner quyết định policies, reviewer thứ hai và terminal void. Hoàn tất
   [approval package](RC16H_PRODUCTION_APPROVAL.md) và backup rehearsal.
4. Xin approval cụ thể cho Production DDL, release/deploy, provisioning và feature
   activation theo từng hành động. Task H dừng trước gate này.

Contract: [Antigravity integration](RC16H_ANTIGRAVITY_INTEGRATION.md).
Rehearsal: [evidence](RC16H_REHEARSAL_EVIDENCE.md).
