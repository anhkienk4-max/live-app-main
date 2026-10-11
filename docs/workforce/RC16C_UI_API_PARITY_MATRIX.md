# RC1.6C — Ma trận Gemini UI / API

Baseline backend: `2be8cfd56f0bb8dbb76baa4fa23021d5e1eb1f63`. Contract chi tiết: [handoff RC16/RC16B](RC16_GEMINI_UI_API_HANDOFF.md).

RC1.6D cập nhật riêng C06: discovery backend đã kiểm chứng (36 Node tests PASS,
typecheck/lint và isolated PG regression PASS); không cập nhật UI-U thành PASS.

**UI-U = chưa có source Gemini RC16 được xác nhận để kiểm chứng.** Mọi hàng UI-U là UNKNOWN, không phải UI FAIL. Trên refs đã quét không tìm thấy caller `/api/workforce` trong app/components/services; không lấy UI RC14 làm kết quả parity RC16. Severity dưới đây là ưu tiên tích hợp nếu gap còn tồn tại, không khẳng định lỗi UI chưa được đọc.

| Luồng | UI hiện tại | Backend hỗ trợ | Gap / mức | Fix và acceptance |
| --- | --- | --- | --- | --- |
| Actual Staffing theo shift | UI-U | GET actual?shift_id; Admin/Leader; bounded result | UI evidence chưa kiểm chứng / P0 source | Hiển thị planned và actual riêng, UNKNOWN khi thiếu; không tự tạo attendance |
| Worked/no-show, nhiều Host, cover/replacement/extra | UI-U | POST record, completed Shift, timestamp offset; no_show null times | UI-U / P1 | Giữ staff/role/segment; không sao chép support time theo số Host; nhập evidence_note |
| Evidence review độc lập | UI-U | POST review + expected_version; author self-review 403, conflict/stale 409 | UI-U / P0 integrity | Disabled self-review; refresh stale; approved/rejected immutable; rejected resubmit mới |
| Actual timeline nhiều shift | UI-U | Đọc segment từng shift, chưa có cross-shift timeline endpoint | Backend gap / P1 scope | Dùng shift drilldown theo contract; ghi giới hạn thay vì giả timeline đầy đủ |
| Period Manager | UI-U | POST create_period; GET period_id; GET action=list_periods (date overlap/status/page/page_size, exact counts) | C06 backend RESOLVED RC1.6D; UI chưa kiểm chứng | Wiring Admin manager theo handoff; không dựa ID lưu trong một tab/localStorage |
| Rate Manager | UI-U | POST register_rate; GET action=list_rates (staff/role/effective_date/scope/page/page_size); approved amount/identity/validity | C06 backend RESOLVED RC1.6D; UI chưa kiểm chứng | staff_id match exact; defaults query scope=role_default; không lấy table trực tiếp từ browser |
| Prepare line | UI-U | POST prepare_line từ approved worked segment; server/DB calculate; trả version=1 | UI-U / P0 money | Picker chỉ approved worked; dùng date shift; không gửi gross/net/rate authoritative |
| Correct Draft line | UI-U | correct_line; full replacement 4 mutable fields; reason; atomic RPC/audit | UI-U / P0 integrity | Before/after, current line.version, request UUID, Draft+active eligibility; validate bounds nhưng server vẫn quyết định |
| Void | UI-U | void_line; terminal voided_at, giữ amounts/evidence/global uniqueness | POLICY/UI-U / P1 | Confirmation rõ không thể reissue/unvoid; loại void khỏi totals; audit vẫn hiện |
| Version và UUID | UI-U | Correction/void dùng expected_version + UUID scoped actor | UI-U / P0 retry | Một UUID cho một user intent; lưu payload để retry timeout; stale yêu cầu refresh+quyết định mới+UUID mới |
| Replay | UI-U | Exact retry 200/replayed=true, trả historical receipt kể cả sau lock | UI-U / P0 stale display | Không coi receipt là current state; GET refresh period/line sau replay; changed payload same UUID →409 |
| Audit history | UI-U | GET payroll audit: transition + full line before/after, actor/time/reason/version | UI-U / P0 privacy | Admin-only; line fields null ở transition rows; tránh salary cache/log/notification cho Leader/Member |
| Reviewed→Confirmed→Payroll Ready→Locked | UI-U | expected_status RPC; không skip/reopen; creator/corrector/voider không Review; reviewer không Confirm | UI-U + reviewer POLICY / P0 | Hai Admin độc lập; empty/all-void Review fail; fresh mutation ngoài Draft 409 |
| Transition retry | UI-U | expected_status; chưa có request UUID replay cho transition | Existing limit / P1 | Timeout phải GET lại status/audit; không retry blind như correct_line; không hứa exactly-once ngoài hai action mới |
| Create period/rate/prepare retry | UI-U | Unique/constraint protection; không có historical receipt UUID | Existing limit / P1 | Reconcile read/refresh sau timeout; duplicate 409 không đồng nghĩa success cùng request; cần read discovery |
| Locked CSV | UI-U | GET export=csv locked-only; BOM, text neutralization, signed numeric adjustment, exclude void | UI-U / P0 export | Admin download; kiểm tra net/totals với current lines; không upload salary vào shared Drive; không gọi là XLSX |
| Individual performance | UI-U | GET staff_id/role/month; Member own, Admin/Leader supervision | UI-U / P0 privacy | Own scope, month+role; peer access403; null KPI→N/A; không fetch payroll để vẽ performance |
| Team overview | UI-U | GET overview month/role Admin/Leader; weighted denominator, warnings | UI-U / P1 evidence | Hiện coverage và unmatched_approved_segments; không hiểu approved outside planned là no-show |
| Leaderboard | UI-U | Same role/month; minimum sample configured và complete evidence; empty nếu chưa config | UI-U / P1 fairness | Hiện eligibility/sample/workload; không cross-role ranking hoặc score tự tạo |
| Monthly trends/completion | UI-U | Một tháng mỗi request; chưa có trend series/full end-of-shift completion metric | Backend gap / P1 scope | Đánh dấu unavailable; không diễn giải approvedWorkedShifts là hoàn thành toàn bộ ca |
| GMV/Hour, Orders/Hour | UI-U | Luôn null, chưa verified attribution | Blocked business data / P1 | N/A và lý do; không phân bổ GMV theo planned staff hay số Host |
| 400/401/403/409/413/503 | UI-U | Typed code envelope, Cache-Control no-store; 404 period absent | UI-U / P0 error flow | 401 reauthenticate;403 quyền;409 conflict/policy/stale;503 retry only supported actions;413 giảm payload; không fallback mock |

## Điều kiện review contract trên Gemini source sau khi bàn giao

1. Ghi SHA source và liệt kê route/component/service thực sự gọi 4 API; map từng hàng UI-U tới code/evidence.
2. Payroll navigation/component chỉ Admin; kiểm tra Network/DOM/cache cho Leader/Member, không chỉ nút bị ẩn. Actual Admin/Leader, individual own/supervisor, overview supervisor.
3. Schema correction strict: không gửi actor/segment/rate/actual/gross/net/calculation_version; UUID không tái tạo trên transport retry; expected_version của line, không period.revision.
4. Totals chỉ `voided_at == null`; full audit lưu receipt độc lập, GET refresh sau replay. Conflict không overwrite tự động.
5. Wiring rate/period read list theo RC1.6D handoff: exact filtered count, fixed sorting, page_size<=100, không fake completeness khi503; không thêm privileged direct client để bypass API/RLS.
6. Lưu trạng thái từng case PASS/FAIL/BLOCKED cùng response/screenshot đã redact; không đánh dấu cả matrix PASS chỉ vì backend tests xanh.
