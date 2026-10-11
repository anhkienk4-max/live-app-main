# RC1.6C — Checklist synthetic E2E UAT

**Trạng thái tất cả case dưới đây: NOT RUN / BLOCKED tại RC1.6C.** Đây là hướng dẫn thực thi sau authorization, không phải bằng chứng đã seed/login/migrate/UAT. Mỗi case phải ghi PASS/FAIL/BLOCKED, thời gian, deployment/SHA, actor alias, fixture IDs, response đã redact, screenshot và audit/version thực tế. Không ghi token, credential hoặc salary ngoài evidence Admin được bảo vệ.

## Entry gates — dừng trước mọi mutation nếu thiếu

| Gate | Điều kiện |
| --- | --- |
| G01 | Gemini branch+SHA/PR chính thức, integration branch riêng, backend/Storage dependency SHA được pin và CI candidate PASS |
| G02 | Immutable Preview deployment READY đúng candidate; project/team/repo/branch/SHA xác minh; không Production target/alias |
| G03 | Public URL/anon và server URL/key cùng project staging đã phê duyệt; runtime chứng minh identity; mock và mock-user-switcher false |
| G04 | Migration plan và apply staging được chủ dự án cho phép riêng; ledger/schema/RPC baseline verified, RC15+RC16+RC16B hiện diện; PG17 rehearsal PASS |
| G05 | Auth/business mapping, account status và login của A/B (hai Admin độc lập), L (Leader), M1/M2 (Members); không dùng user Production |
| G06 | HR/Finance xác nhận rate/OT/payable-break/lateness; synthetic values dưới đây chỉ fixture, không policy Production |
| G07 | Fixture namespace `RC16C_<run_id>` được duyệt; existing 78 shifts/9 reports được bảo vệ; retention/cleanup chỉ IDs của run và không phá evidence |
| G08 | Provider/account/root/test route cô lập và được duyệt; salary CSV không vào shared Drive; truy cập protected Preview hợp lệ, không tắt SSO |

## Bộ fixture tối thiểu

- Một tháng business timezone Asia/Ho_Chi_Minh; Shift ngày cuối tháng từ 23:30 đến 01:00 hôm sau (90 phút), completed qua luồng hợp lệ. Period tháng đó và period giao nhau. Không đổi ngày ca theo UTC/end date.
- H1/H2 cùng Shift (multiple hosts); H3 replacement tiếp nối H1; S1 support có một interval xuyên qua Host split. Một Shift khác chồng interval S1 để thử reject approved overlap; interval kề nhau để thử allow. Mỗi staff/role/segment có ID riêng.
- Một no_show explicit, một ca late, một ca missing evidence, một evidence draft/rejected, một ca scheduled/future/cancelled. Không tự infer attendance từ planned assignment.
- A ghi attendance; L hoặc B review độc lập. A tạo payroll/correct/void; B Review; A Confirm/Ready/Lock. Rate của nhân viên do Admin khác nhân viên phê duyệt; tài khoản payroll actors không tự approve rate của mình.
- Fixture rate được ghi rõ **synthetic**: 100000 VND/giờ, multiplier 15000 basis points; role-default và staff-specific có effective dates không conflict, cộng một rate ngoài date để thử selection. Không coi fixture rate là lương thực.
- Period P có ít nhất hai active lines để vẫn Review được sau void một line; period E empty; period V chỉ một line rồi void để kiểm tra all-void. Segment dùng cho P/E/V không trùng ngoài case deliberate conflict.
- Golden amount: actual90/payable90/OT30 → gross175000; correction payable60/OT30/adjustment-1000 → gross125000/net124000. Tính server/DB/CSV khớp; không gửi gross/net từ UI.

## Cases end-to-end

| ID | Thao tác | Expected / bằng chứng bắt buộc |
| --- | --- | --- |
| A01 | Anonymous GET/POST actual/payroll/performance/overview | 401; không truy cập privileged data; không fake data fallback |
| A02 | L/M truy cập Payroll GET/correct/void/CSV và rate manager | 403, không salary/audit trong Network/DOM/cache; payroll navigation không hiện |
| A03 | M1 own performance; M1→M2; M1 team; L actual/team | Own allowed; peer/team Member403; supervisor allowed trong scope; no salary fields |
| A04 | Record worked/no_show với missing note, reversed time, no_show có timestamps | 400 validation; không có partial evidence |
| A05 | Record/review ca chưa completed | 409 fail closed; future/scheduled/cancelled không biến thành worked |
| A06 | A record; A self-review; L/B review; stale expected_version; rejected resubmit | Self403, independent success, stale409; approved/rejected immutable; resubmit draft mới |
| A07 | Overnight, multiple Hosts và H3 replacement | Minute theo timestamp offset; distinct approved segments; không tự cắt planned interval; date boundary đúng |
| A08 | S1 xuyên Host split; approve overlap ca khác; approve adjacent interval | Không nhân đôi payable; overlap cùng staff bị409 dù role/shift khác; adjacent không overlap |
| A09 | Approved worked cùng scope explicit no_show | Conflict409; thiếu evidence vẫn UNKNOWN; no-show chỉ sau review explicit |
| P01 | Create period valid/invalid dates; register rate effective range, self, overlapping | Valid201; invalid400/409; self-rate403; approved date/scope đúng; capture IDs qua contract |
| P02 | Period/rate manager reload trang/tab mới | RC1.6D GET action=list_periods/list_rates; filter/pagination/count/empty/error đúng contract; C06 backend resolved, browser case vẫn NOT RUN; không dùng privileged table client |
| P03 | Prepare từ approved worked; draft/rejected/no_show/outside-period/missing rate | Valid201 version1; invalid409; shift business date chọn rate; thiếu rate không invent |
| P04 | Staff-specific vs role-default và effective date/month overnight | Chọn staff-specific đúng; outside-date reject; snapshot không đổi theo rate mới; không chuyển segment sang ngày kết thúc |
| P05 | Prepare cùng segment ở period giao nhau hoặc lặp trong cùng period | 409 globally; một segment chỉ có một payroll line kể cả period dates khác |
| P06 | Correction full four fields + reason + line version + UUID | 200; lineversion+1; periodrevision không đổi; golden amounts đúng; audit full before/after/actor/time/reason/action/version/request |
| P07 | Payable>actual, OT>payable, negative/fractional minutes, adjustment không reason hoặc net<0 | 400 schema hoặc409 calculation đúng code; line/audit không đổi |
| P08 | Gửi gross/net/rate/actor/actual/unknown field, malformed JSON, >16KiB | Strict400/malformed400/413; không trusting salary client |
| P09 | Giả lập timeout sau correction commit; retry cùng actor/UUID/payload | 200 replayed=true; cùng auditid/version/snapshot, không audit duplicate; GET refresh current state |
| P10 | Cùng UUID đổi payload/action/line; UUID mới staleversion | 409 idempotency hoặc stale; không overwrite; UI refresh, before/after, user decision mới |
| P11 | Hai tab correction cùng expected_version, khác UUID | Đúng một success; một409; một increment/audit; UI loser refresh, không auto-submit |
| P12 | Correction và Review đồng thời bằng A/B | Serialize theo period lock; nếu correction trước thì Review thấy kết quả; nếu Review trước thì fresh correction409; không partial audit |
| P13 | Void active Draft line, retry exact UUID, new correction sau void | Void200 incrementsversion, giữ evidence/amount; exactretry replay200; freshcorrect409; void loại khỏi totals nhưng audit hiển thị |
| P14 | Prepare voided segment lần nữa ở cùng/khác period | 409; không unvoid/reissue/delete; UI giải thích terminal limitation trước confirm |
| P15 | Review empty E hoặc all-void V; creator/corrector/voider selfReview | 409 transition rejected; period/audit không chuyển trạng thái |
| P16 | B Review P; B selfConfirm; A Confirm→Ready→Locked | Review200; selfConfirm409; authorized independent chain success; không skip/reopen |
| P17 | Fresh correct/void/prepare ở Reviewed, Confirmed, Ready, Locked | 409 tất cả; không version/audit/amount changes; replay lịch sử vẫn allowed200 theo P18 |
| P18 | Replay correction cũ sau correction mới/void/Review/Lock | Historical receipt200/replayed=true; UI GET current state, không render historicalversion như latest |
| P19 | Timeout transition/create/rate/prepare | GET/read reconciliation, không hứa UUID replay ở actions chưa hỗ trợ; duplicate409 được xử lý có kiểm chứng |
| P20 | Edit approved attendance/rate sau finalization; sửa/delete audit | API không có edit route; DB integrity trong isolated tests reject; không raw destructive SQL trên staging để “thử” |
| P21 | CSV trước lock, sau lock với correction/void/negative adjustment | Prelock409; Locked download UTF8 BOM; totals đúng active lines; negative numeric giữ nguyên; text =/+/-/@ neutralized; void không export |
| W01 | Role/month own/team với complete + unknown + explicit no_show | Coverage/known reliability đúng denominator; unknown không thành no-show/zero; null metric N/A |
| W02 | Late grace không configured rồi configured approved fixture | 409 WORKFORCE_GRACE_POLICY_NOT_CONFIGURED trước config; punctuality theo approved grace, client không override |
| W03 | Leaderboard minimum sample absent/insufficient/incomplete rồi đủ sample | Empty/unconfigured hoặc exclude; only same role/month, sample/workload hiển thị; không fabricated scores |
| W04 | Cover/extra không planned; unmatched approved segment | Team warning/count hiện; không giả planned denominator complete; reconcile trước rank; individual planned-scope limitation ghi rõ |
| W05 | Trends/full completion/GMV per hour/Orders per hour | Missing capability N/A; GMV/orders null; không chia GMV planned, không gọi worked-shift count là full completion |
| S01 | PR24 physical upload/list/read/reconnect test fixture trong provider cô lập | Bytes/hash/provider parent/metadata/idempotency proof; role access đúng; separate Storage PASS, không suy từ mock tests |
| S02 | Export Payroll và retention/cleanup | Không upload salary CSV shared Drive; fixture manifest/audit giữ lại; cleanup chỉ scope đã duyệt, không delete lịch sử/void evidence |

## Exit gates

Tất cả case critical PASS hoặc exception policy được owner chấp nhận rõ; không đổi BLOCKED thành PASS. Candidate SHA và immutable deployment phải khớp evidence. Không double-payment, không salary leakage, không self-review bypass, audit append-only, retry/race không lost update, CSV đúng. Storage physical gate có evidence riêng; policy reviewer/void/payout chưa giải quyết thì go-live vẫn NO-GO.

Handoff cuối gồm test counts thực tế, IDs synthetic được bảo vệ, blocked decisions, defect repros và người nghiệm thu. UAT acceptance không tự cấp quyền merge/migrate/deploy Production; cần task/phê duyệt riêng.
