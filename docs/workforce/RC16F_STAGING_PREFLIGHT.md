# RC1.6F — Staging preflight (2026-10-11)

**NO-GO cho cloud migration/Preview E2E.** Rehearsal được thực thi chỉ trong
Docker local/disposable CI; không phải nghiệm thu cloud. Starting SHA
`ba9b13ffa9faef796927170cc1d300301ac03551`, branch
`feat/rc16-payroll-workforce-backend`, origin khớp, worktree sạch trước sửa.
`origin/main=31efea2d1a60583975e96773f68106d46ab7d8d9`.
PR25 Draft/base PR24; PR24 Draft/head `e5879abeff7a1a4ffbf8222093047bb5882456dc`
là ancestor của backend. Không đổi base/merge. CI baseline
[38150242635](https://github.com/anhkienk4-max/live-app-main/actions/runs/38150242635)
completed/success đúng starting SHA. CI final được xác minh sau push.

## Cloud chỉ đọc — identity độc lập

| Target | Identity/health | Version/ledger | Dữ liệu có sẵn |
| --- | --- | --- | --- |
| Staging | `amagnzebmmuqiptmrjmc`, live-app-staging, ACTIVE_HEALTHY, ap-northeast-2 | SQL server_version17.6; provider17.6.1.155, engine17;61 ledger entries |78 shifts/9 reports; active roles2 Admin/2 Leader/7 Member |
| Production | `egdjnpmoasarrttvhgds`, ACTIVE_HEALTHY, ap-northeast-2 | SQL17.6; provider17.6.1.155;60 ledger entries |771 shifts/2 reports; active roles1 Admin/1 Leader/5 Member |

Aggregate nondeleted Admin count Staging=3, nhưng **active+account_active=2**;
không suy rằng Admin thứ ba có thể review. Chưa xác minh Auth mapping/login,
chưa provision accounts. Không đọc salary hoặc nội dung shifts/reports.
Git có64 migrations; ledger version/name không chứng minh schema tương đương.
Hai target chưa có table `workforce_%`. Details/digests:
[migration matrix](RC16F_MIGRATION_COMPATIBILITY.md).

Vercel CLI GET xác minh `livestream-ops-demo`
`prj_YSrsxfYK7skM17D3KtiXUGeim2kr`, team
`team_MBreE5MCbrZjyyBHnsaI5mc5` (`livestream2`), repo live-app-main,
Node24.x, SSO `all_except_custom_domains`. Connector403 đã fallback CLI đúng
scope; không đổi quyền. Preview listing trả20 entries, **không có starting SHA**
khi lọc client-side. Không coi query SHA được API chấp nhận là exact match.
Baseline backend READY `dpl_GRbiDr4mxwDeDB8Affrh1VRz2nwC` có SHA267604b3,
trước RC16E; không đủ điều kiện UAT. Latest listed READY convergence
`dpl_3qY8m6UMHxWRgFRyaDukXFvUfVhZ` có SHAb90ac998, khác remote
convergence `cf520aa7c86cd5991974aa6785e6129fe090fc13` và backend.
Đây là listing giới hạn, không chứng minh toàn bộ deployment history.

Env metadata GET `decrypt=false`: Preview chung có public URL/anon/server secret,
mock flags, provider/root/OAuth; không thấy server URL Preview hoặc hai policy
Workforce trong scope đọc. Khi server URL absent code fallback public, nhưng
**effective deployment config/key ownership chưa được chứng minh**. Mode/static
routes và một refresh-token override scope RC12, không phải backend RC16.
Không decrypt/in giá trị; không env pull/link/token retrieval, không tắt SSO.
Root/provider/route hiện hành và credential alignment UNKNOWN. C02 BLOCKED.

## Gemini và dependency

Open PRs chỉ24/25; remote refs không có nguồn Gemini RC16 được chủ dự án xác
nhận. Convergence `cf520aa7` chứa hai migration privacy/history staging-only,
nhưng tìm `/api/workforce` trong app/components/services không có caller.
Branch name/RC14 UI không phải approval RC16. **C01 BLOCKED**, không tạo branch
tích hợp hoặc sửa UI. Handoff cần owner cung cấp branch, immutable SHA/PR,
phạm vi RC16 và xác nhận nguồn; Gemini wiring theo contract existing discovery,
expected_version/request UUID, replay receipt, active/void totals và RBAC.

## Deliverables và trạng thái

Fetch cuối: convergence tiến tới `80211dd385ae39672f102fa360f2a5f3d28f40a7`
(implementation `b864c8bb76ebbfc09033423394966268cab947ef`), thêm provider metadata
forward migration và clone harness. Backend/main/PR24 không đổi. H5 reports tự
ghi PG17.6 rehearsal/conditional GO ở source khác; RC16F **không chạy/verify lại
harness đó**. Harness dựng structural tables tối thiểu, không chứng minh clone
đầy đủ Staging; H5 Preview URL mang tên live-app-clean, chưa chứng minh thuộc
project/team/candidate RC16 được chỉ định. Không dùng báo cáo nhánh khác làm
cloud UAT PASS hoặc nguồn Gemini RC16. Caller Workforce vẫn không tìm thấy trong
scope app/components/services tại80211dd.

- [Dependency/schema matrix](RC16F_MIGRATION_COMPATIBILITY.md).
- [Rehearsal evidence và lệnh chạy](RC16F_REHEARSAL_EVIDENCE.md).
- [Immutable Preview acceptance](RC16F_PREVIEW_ACCEPTANCE.md).
- [Fixture manifest và37 cases mapping](RC16F_SYNTHETIC_FIXTURES.md).
- [Staging approval package](RC16F_STAGING_APPROVAL_PACKAGE.md).
- [P0/P1 và công việc kế tiếp](RC16F_BLOCKERS.md).

Code/CI PASS, cloud config verification, physical UAT và Production readiness
là các kết luận riêng. GitHub Actions chạy matrix22/16 và24/17; auto-deployment
của branch backend vẫn disabled trong vercel.json. Không cloud writes,
migration/seed/deployment/env/role changes, không Drive I/O, không merge.
