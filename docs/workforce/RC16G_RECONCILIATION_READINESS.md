# RC1.6G — Forward-only reconciliation readiness

Starting d802d0e2e2212061935da02b258cfae84eb908e9, branch
feat/rc16-payroll-workforce-backend, PR25 Draft/base Draft PR24; không đổi base.
Cloud chỉ SELECT catalog, không ghi dữ liệu/ledger, không migration hoặc deployment.

## Contract đã triển khai

- A: năm cột route mới; JSON object/array constraints; approval actor/time nullable,
  không default timestamp. Route cũ có cả hai NULL = chưa có bằng chứng phê duyệt.
  Không UPDATE/backfill hoặc tự tắt route; hoạt động routing hiện hữu không bị đổi.
  Actor có mặt bắt buộc có timestamp; FK SET NULL cho phép giữ timestamp thật khi
  actor bị xóa. Brand review fields nullable, bỏ default phân loại cho brand mới,
  giữ classification hiện hữu; mở profile thứ bảy cho brand/route.
- Guard A pin toàn bộ route column shape/default/nullability và constraints,
  brand profile constraint, RLS/browser revokes, exact unique index NULLS NOT DISTINCT
  và update trigger. Sai catalog/JSON/data, default hoặc FK review bất thường: STOP.
- B: pin ba definition MD5 và ACL/owner/SECURITY DEFINER/search_path. Chỉ ba thay thế
  có anchor duy nhất trong body RPC ba tham số: allowlist, validate, assignment
  execution_source internal/agency/null. Create và bốn tham số không bị viết lại.
  Giữ actor/lifecycle/confirm_impact/CAS/staffing/private helpers và grants.
  RPC ba tham số vẫn service-role-only, không tự cấp quyền authenticated/Leader.
- Hai file là transaction riêng, lock_timeout5s/statement_timeout60s. Replay raw SQL
  fail closed; executor local kiểm ledger trước, hash lại bytes đang dùng, rồi
  thực thi SQL và ghi version cùng transaction. Không retry bằng cách bỏ guard.

## Sequence và bằng chứng

[Manifest](../../supabase/reconciliation/rc16g/manifest.json) là thứ tự allowlist,
không phải filename sort. Hai file mới ở supabase/reconciliation/rc16g/,
ngoài thư mục auto-discovery; version20261013000000/1 duy nhất, sau RC16B.
CLI tạo file local, sau đó đổi version/vị trí theo contract reconciliation;
không đổi file/version lịch sử đã applied.

Legacy Staging có RC13A: RC15 prerequisites → A → B → RC15 files → RC16 → RC16B.
Fresh operational baseline: dựng schema prerequisite được review → RC13A → cùng
manifest. Đây là baseline mới của operational objects, **không phải clean install
toàn bộ lịch sử Git**; lịch sử phân kỳ làm automatic chain không phù hợp.
Production giữ manifest riêng, loại cả A/B legacy-only; không đưa chúng vào
automatic release hoặc apply RC13A lên Production. db push không hỗ trợ dùng
timestamp muộn để giải quyết dependency sớm; không repair ledger hoặc đánh dấu
20261011092015 applied giả. Future CLI sync phải dùng approved curated release
workspace/manifest riêng, không dùng toàn bộ thư mục backend để push Staging.

Cloud RPC snapshot được SELECT lại trong phiên: ba MD5 khớp RC16F, không RPC drift.
Registration catalog mới có imported_name/match_method; fixture đã refresh các
column/check/FK cùng contract. Không lấy payload, tên/email nhân viên hay folder ID
thật. Latest remote convergence d4b5999 chưa được công nhận là Gemini RC16 source.

## Phạm vi rehearsal

Fixture dùng column/default/check/FK thực, real private actor/role/capacity/conflict/
manual assignment/version helpers và derived/status/version/update triggers;
synthetic brand/routes/historical shift/staff/JWT claims. Không unconditional
authorization stubs. Test bảo toàn row JSON, ACL/index/trigger, invalid JSON/profile,
duplicate key, overnight/manual staffing/overlap, source set/clear, stale version,
unauthorized/Leader fields, lifecycle/impact, drift/replay, failure sau ALTER/function
replace và retry sau rollback; complete ordered chain tới operational_files/RC16B.

Giới hạn: Auth service/JWT signature verification, global audit_shifts_change,
report/provider schema và full privacy policy catalog không được clone. Không chứng
minh full Staging restore, lock duration trên dữ liệu thật hoặc physical UAT.
Không thay thế/nới privacy/report-history functions; migration SQL không chạm chúng.
PG17.11 local khác Supabase17.6; nghiệm thu cloud vẫn cần snapshot/owner approvals.

Kết quả thực thi và hash: [approval package](RC16F_STAGING_APPROVAL_PACKAGE.md),
[rehearsal evidence](RC16F_REHEARSAL_EVIDENCE.md). C01/C02 BLOCKED, C03 OPEN.
Package sẵn sàng technical owner review sau exact-SHA CI; chưa được phép apply.
