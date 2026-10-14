# RC1.6I Post-main hardening

Baseline: `d166bd74eb77692a7609cc6c9f3e510053da5edf`; backend ancestry `5ea8298a116267a2f463cc3c86761c04d92ccde9`. Nhánh patch: `fix/rc16i-postmain-hardening`, base `main`.

## Bảo toàn và chọn delta

[File-by-file delta matrix](RC16I_POSTMAIN_DELTA_MATRIX.md) ghi đủ 72 khác biệt, hashes backup và quyết định port/giữ/loại. Original dirty merge vẫn tại `.worktrees/rc16i`; không abort/reset/clean/discard. New worktree được tạo trực tiếp từ main, không wholesale cherry-pick UI/backend cũ. Main's `useCurrentUser`, runtime Supabase guards, Storage MIME allowlist, staffing labels, PGlite dependency, RLS và tất cả migration giữ nguyên.

## Hành vi hardening

- Sidebar, menu tablet/mobile và Actual Staffing tab chỉ mở theo boolean capability từ server, sau role filter. Không dùng client-local feature flag.
- 401/403/feature-disabled xoá quyền và unmount workspace; abort capability request đang chờ để response cũ không phục hồi quyền. Giữ thông báo lỗi cụ thể. Identity key/cancellation hiện có của main được giữ.
- Correction và void giữ UUID/payload trên lỗi mạng/503 và modal reopen. Edited retry bị từ chối; nút tải lại/đối soát audit là hành động rõ ràng để tạo intent mới. 409 đóng stale dialog, refetch, không auto-resubmit.
- UI không cho Admin đã correction/void tự Reviewed; không bỏ canTransition Admin/self-review/self-confirm rules main. Database vẫn authoritative.
- Các list/detail/performance/actual reads chỉ nhận kết quả của request hiện hành; bỏ response cũ sau filter/identity/unmount. Individual đọc đúng field `performance`.
- Audit drill-down hiển thị actor/action/UUID/version/payload/before/after. CSV chỉ tải server bytes qua authenticated no-store; không tính gross/net hoặc sửa CSV client-side.
- Rate input trống/approved checks, integer VND step=1 và 4-decimal OT checks main giữ nguyên. Prepare payable mặc định 0, yêu cầu nhập theo chính sách đã duyệt; payable bao gồm OT. Thiếu attendance là UNKNOWN.

## Kết quả và provenance

Hai workflow baseline đã được đọc trực tiếp từ GitHub, exact SHA d166bd7, completed/success:

- [RC16 gate 38204643904](https://github.com/anhkienk4-max/live-app-main/actions/runs/38204643904)
- [Convergence gate 38204643946](https://github.com/anhkienk4-max/live-app-main/actions/runs/38204643946)

Executed local evidence: Node22 full inventory 1557 PASS / 0 FAIL / 3 optional staging SKIP; final client/session 11/11; TypeScript, lint, PG16/17, H52 synthetic rehearsal, Node22 production build and final Playwright 28/28 PASS. Full lint retains 25 inherited warnings. See `project-memory/evidence/RC16I-postmain-hardening.md` for commands, hashes, baseline comparison and limitations. Exact final pushed SHA/CI will be attached to the Draft PR and handoff. Local screenshots are synthetic, not cloud UAT.

## Production boundaries và blockers

Operator xác nhận ledger có `20261011221500`, `20261012000000`, `20261012000001`. Task này không query/reconcile/write cloud ledger và không replay bất kỳ migration nào. Không sử dụng manifest RC16H/I cũ như kế hoạch cho migrations còn thiếu.

| Gate | Trạng thái trong task này | Next owner action |
|---|---|---|
| Deployed immutable SHA và effective flags | NOT_VERIFIED trực tiếp; không suy từ main/source flags | Operator-authenticated read-only runtime/deployment verification |
| Second independent authorized Payroll reviewer | Chưa được thiết lập/xác minh trong task | Owner xác nhận reviewer trước activation; không cấp quyền Leader |
| HR payable/OT/break/lateness policies | Không tạo/thay chính sách | Owner/HR xác nhận policy và approved rates |
| Terminal void/reissue | Warning giữ nguyên; segment không được reissue | Owner chấp nhận semantics hoặc phê duyệt giải pháp riêng |
| Production storage/provider and operational RPC behavior | Isolated regressions không chứng minh provider I/O hoặc live schema | Physical/read-only post-go-live checks với Operator; không replay historical SQL |
| Backup/restore và data recovery | Không kiểm chứng cloud trong task | Owner/operator lưu evidence restore và recovery trước release authorization |

Patch là review candidate, không phải authorization merge/deploy/activate. `vercel.json` chặn auto-deploy riêng nhánh patch; không thay Production defaults hoặc environment variables. Production code/data/users/passwords không bị task này sửa.
