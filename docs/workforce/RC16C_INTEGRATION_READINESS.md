# RC1.6C — Báo cáo sẵn sàng tích hợp và UAT cô lập

Ngày kiểm tra: 2026-10-11. Kết luận: **BLOCKED cho tích hợp UI và E2E UAT; backend đã qua gate tự động, chưa được nghiệm thu UAT hay phát hành.**

## Mốc Git và bằng chứng

- Repository: `anhkienk4-max/live-app-main`; worktree `live-app-rc16-payroll` sạch khi bắt đầu.
- Branch: `feat/rc16-payroll-workforce-backend`; SHA bắt đầu `2be8cfd56f0bb8dbb76baa4fa23021d5e1eb1f63`, bằng remote sau fetch (ahead/behind 0/0).
- `origin/main`: `31efea2d1a60583975e96773f68106d46ab7d8d9`, là tổ tiên của backend; backend ahead 204 commits, behind 0 tại preflight.
- [PR #25](https://github.com/anhkienk4-max/live-app-main/pull/25): Open, Draft; base `fix/rc14-data-report-export-fidelity`.
- [PR #24](https://github.com/anhkienk4-max/live-app-main/pull/24): Open, Draft; base `main`; head `e5879abeff7a1a4ffbf8222093047bb5882456dc`. Head này là tổ tiên của backend. Không có thiếu commit của dependency tại thời điểm kiểm tra.
- [CI trên SHA bắt đầu](https://github.com/anhkienk4-max/live-app-main/actions/runs/38139343311): completed/success; từng bước PostgreSQL 16, TypeScript, test RC16, build và diff check đều success. Đây là bằng chứng backend/DB synthetic, không phải UAT browser.
- RC1.6C chỉ bổ sung tài liệu và checkpoint memory. Không đổi runtime, schema, API, UI hoặc policy; không thêm implementation OpenSpec vì không thay đổi hành vi sản phẩm.

Các deliverable: [ma trận contract](RC16C_UI_API_PARITY_MATRIX.md), [identity/ledger môi trường](RC16C_ENVIRONMENT_IDENTITY.md), [checklist synthetic E2E](RC16C_SYNTHETIC_UAT_CHECKLIST.md). P0/P1 và công việc tiếp theo ở dưới.

## Nguồn UI Gemini

Đã kiểm tra cây `app/`, `components/` trên toàn bộ refs `origin/*` sau fetch, và tìm các caller `/api/workforce`, `correct_line`, `void_line` trong `app/`, `components/`, `lib/services/`. Chỉ branch backend có route API Workforce; không tìm thấy màn hình/caller Workforce hoặc Payroll trong các scope này. Điều này không chứng minh code chưa push hoặc nằm ngoài scope không tồn tại.

Nhánh frontend có thể liên quan nhưng **không được mặc định là deliverable Gemini RC1.6**:

| Ref | SHA ngắn | Bằng chứng và giới hạn |
| --- | --- | --- |
| `integration/rc14-frontend14wave-convergence` | `8e97516` | Handoff Phase H.2 nói về RC14/RC15, không có RC16 UI; chưa có xác nhận nguồn Gemini RC1.6 |
| `feat/frontend-14wave-production`, `rc/frontend-14wave-final` | `555b204` | Frontend 14-wave, không có Workforce caller trong scope đã quét |
| `feat/frontend-ux19` | `fea0121` | UI vận hành trước RC16; không có Workforce caller trong scope đã quét |
| `rc/frontend-final` | `69a5932` | Tên nhánh không xác nhận nguồn, phạm vi hoặc phê duyệt RC16 |
| `staging` | `407b6c2` | Không có RC16 route/UI trong cây; tên branch không chứng minh target DB |

Chưa có branch + SHA/PR được chủ dự án xác nhận là nguồn Gemini RC1.6. **Dừng UI integration**, không tạo/sửa frontend, không lấy một nhánh bất kỳ làm approved source. Các tài liệu readiness vẫn được hoàn thiện trên branch backend.

## Dependency và xung đột

PR25 thêm Workforce lên PR24, không lên trực tiếp `main`. Không đổi base, cherry-pick hay merge trong task này. Khi tạo integration candidate phải ghi cả SHA backend, Storage và Gemini; fetch lại trước thao tác để phát hiện dependency chuyển động.

So với frontend convergence `8e97516`, hai phía cùng thay đổi `components/features/calendar/ScheduleImportPanel.tsx`, `lib/ui/role-ux.ts` và hai file projection/checkpoint memory kể từ merge-base `31efea2`. Đây là **overlap cần review**, chưa kết luận merge conflict vì không thực hiện merge. Frontend có thêm registration/shifts/staffing; PR24 có storage/storage setup và API file. Phải giữ các luồng hiện có khi hội tụ, không ghi đè shell/UI của Gemini. Không đưa projection memory cũ vào làm source of truth.

Database đã khác `main`: Production có RC15 DDL dù hai PR vẫn Draft; staging có privacy/report-history fix mà backend chưa có. Đối chiếu ledger riêng trước rehearsal, không replay mù RC12/RC13A hoặc rewrite migration đã áp dụng. Ledger có version không đồng nghĩa định nghĩa RPC giống nhau; cần schema/RPC digest trước migration được phê duyệt.

## P0/P1 blocker matrix

P0 = chặn bước an toàn kế tiếp; P1 = cần xử lý trước nghiệm thu/go-live tương ứng. Phân loại CODE, POLICY, ENV, DEPENDENCY không được thay thế nhau.

| ID | Mức / loại | Phát hiện đã xác minh | Điều kiện đóng / owner |
| --- | --- | --- | --- |
| C01 | P0 / DEPENDENCY | Chưa xác nhận nguồn Gemini RC16 | Chủ dự án cung cấp branch + SHA/PR + xác nhận; sau đó engineer audit caller và tạo branch tích hợp riêng |
| C02 | P0 / ENV | Chưa chứng minh public/server Supabase, key và provider của deployment cùng target staging | Operator cung cấp deployment được chỉ định; kiểm tra effective config/runtime không in secret; cấm ghi dữ liệu trước khi chứng minh isolation |
| C03 | P0 / ENV | Staging thiếu RC15 và cả hai RC16 migration; có 78 shifts/9 reports sẵn | Duyệt target/scope và migration plan riêng; kiểm tra RPC baseline, backup/fixture namespace; không tự chạy migration |
| C04 | P0 go-live / POLICY | Production 1 Admin; không thể hoàn thành review độc lập | Owner chỉ định Admin thứ hai, hoặc duyệt Finance role qua thay đổi RBAC riêng; không cấp salary cho Leader và không bỏ self-review |
| C05 | P0 UAT acceptance / POLICY | Rate/OT/payable-break/lateness chưa có quyết định được ghi nhận cho RC16C | HR/Finance duyệt policy và config cụ thể; synthetic test dùng giá trị fixture được ghi rõ, không xem là policy thực tế |
| C06 | P1 / CODE | Payroll GET chỉ đọc một `period_id`; không có list periods/list rate cards | Thêm read action/query Admin-only có pagination, validation và regression; giữ GET period/CSV cũ; không gọi service-role từ browser |
| C07 | P1 / POLICY | Void terminal giữ unique(segment_id); chưa có recovery/reissue | Owner chấp nhận giới hạn và UI xác nhận rõ trước void; nếu cần reissue, thiết kế audited replacement riêng giữ chống double-pay |
| C08 | P1 / DEPENDENCY | Storage physical provider UAT chưa có bằng chứng PASS hiện hành | Storage owner chạy fixture trong root/account cô lập đã phê duyệt; kiểm tra bytes/hash/parent/reconnect; không dùng Drive Production |
| C09 | P1 / ENV | Supabase staging PG17.6; CI PG16, Vercel project Node24 so với CI Node22 | Bổ sung rehearsal PG17 + runtime Node24 trên target cô lập trước acceptance; không xem gate PG16 là cloud E2E |
| C10 | P1 / CODE/security, ngoài RC16 | Public URL guard không kiểm tra override `SUPABASE_URL` của privileged client; local-build cũng không đi qua nhánh local rejection | Hardening riêng có tests public/server mismatch và production-ref rejection; trong RC16C bắt buộc kiểm tra cả hai identity thủ công trước UAT |
| C11 | P0 release / DEPENDENCY | Frontend có privacy migration staging-only; backend/Production chưa có; report-history fix cũng staging-only | Release owner hội tụ forward-only riêng, xác minh quyền/định nghĩa RPC; không merge/deploy trong task này |
| C12 | P1 / CODE coverage | Monthly trends/full shift completion/cross-shift actual timeline chưa có endpoint; unmatched cover/extra không vào planned denominator | Hiển thị giới hạn/N/A; reconcile evidence trước leaderboard. Tách iteration Workforce, không chế score/GMV attribution |

Không xác minh rằng adjustment đã được người khác phê duyệt riêng: API lưu amount/reason do Admin nhập, period review độc lập là gate kiểm soát hiện có. Nếu nghiệp vụ yêu cầu approval từng adjustment, đó là policy/workflow mới cần duyệt, không suy diễn từ nhãn “approved adjustment”.

## Công việc triển khai tiếp theo, theo thứ tự

1. Xác nhận Gemini source và UAT deployment/project, hai tài khoản Admin độc lập; ghi identity + approvals trong evidence manifest.
2. Duyệt migration rehearsal **chỉ staging**. So RPC/schema thực tế với prerequisite PR24; staging có RC13A trước đó nên không giả định baseline Production. Giữ ledger privacy/report-history, không replay/chỉnh history. Apply chỉ sau ủy quyền riêng và plan đã review.
3. Backend bổ sung discovery periods/rates Admin-only (C06), có test 401/403, pagination/truncation, rate visibility và effective date; thống nhất response với Gemini trước UI work. Không thêm amount authority phía client.
4. Tạo `integration/rc16c-gemini-uat` từ baseline đã thống nhất, ghép source được chỉ định và backend theo contract. Giữ hai branch gốc. Review hai file overlap và privacy/Storage gates; chạy typecheck, tests, build trên candidate.
5. Thiết lập config Preview branch cụ thể: public/server cùng staging; mock false; grace/minimum-sample có approval; key server không public; root/provider/route test cô lập. Không tự sửa Vercel env/deploy trong RC16C.
6. Chạy checklist E2E bên dưới sau khi tất cả entry gates đạt; lưu status thực tế và bằng chứng. Fix defect có reproduction trên integration branch; không biến policy chưa duyệt thành default.
7. Giữ PR24/25 Draft. Sau integration + synthetic UAT + Storage physical UAT và quyết định reviewer/void/policy, xin phê duyệt merge/migration/deploy Production trong task riêng.

## Kiểm tra RC1.6C và giới hạn

- Chạy lại `node --import ./tests/typescript-alias-loader.mjs --test tests/rc16-*.test.ts`: **25 PASS, 0 FAIL, 0 SKIP**.
- Không sửa runtime: không chạy lại local build/typecheck/PG migration; CI exact starting SHA đã xác minh các gate này success. CI cho commit tài liệu sẽ được kiểm tra sau push; kết quả được ghi trong handoff cuối.
- Review diff/link tài liệu, `git diff --check`, `memory:sync`, `memory:validate` được thực hiện trước giao; handoff cuối nêu kết quả và SHA cuối.
- UAT browser, login tài khoản, race từ UI, physical provider, key matching và effective Preview runtime: **NOT RUN / BLOCKED**, không phải PASS.
- Production chỉ được đọc project/ledger, metadata table và tổng số user theo role. **Không sửa dữ liệu/schema/config, không merge, không deploy, không thao tác Drive**. Staging cũng chỉ đọc, không seed/provision/migrate.
