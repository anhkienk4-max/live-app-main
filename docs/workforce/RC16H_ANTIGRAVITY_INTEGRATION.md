# RC1.6H — Antigravity UI/backend contract

Chưa có owner-approved final UI SHA. Tài liệu này là handoff, không là UI integration.
Giữ nguyên [contract RC16/RC16B/discovery](RC16_GEMINI_UI_API_HANDOFF.md), gồm Zod
schema, request_id UUID, expected_version, replayed và Admin audit/CSV. Không sửa UI.

## Bootstrap capabilities

`GET /api/workforce/capabilities`, authenticated cookie-backed identity,
`Cache-Control: no-store`, force-dynamic, không dùng service-role trong browser.

```json
{"ok":true,"capabilities":{"actual_staffing":true,"team_performance":true,"own_performance":true,"payroll":false}}
```

Chỉ trả booleans sau role filtering. Anonymous401 AUTHENTICATION_REQUIRED;
resolver failure cũng fail closed401. Unexpected failure500
WORKFORCE_CAPABILITIES_FAILED. Không trả env values, project IDs, keys, rates,
reviewer lists hoặc salary. Fetch lỗi → UI hidden/disabled; không fallback ON.
Refetch sau login/logout/đổi user; không cache capabilities xuyên tài khoản.

| Surface | Flag server | Quyền UI/API |
|---|---|---|
| Actual Staffing GET/record/review | FEATURE_ACTUAL_STAFFING | Admin/Leader; independent evidence reviewer |
| Team overview/leaderboard | FEATURE_ACTUAL_STAFFING | Admin/Leader |
| Individual performance | FEATURE_ACTUAL_STAFFING | Employee own scope; Admin/Leader authorized supervision |
| Period/rate discovery, prepare/correct/void/transition/audit/CSV | FEATURE_PAYROLL | Admin only |

Flags ON không chứng minh tables đã migrated, policy đã approved, rate tồn tại,
evidence đầy đủ, reviewer độc lập có sẵn hoặc UI đã hoàn thành. UI không được
override flag bằng query/header/localStorage/NEXT_PUBLIC variable.

## Disabled/error contract

```json
{"ok":false,"error":{"code":"WORKFORCE_PAYROLL_FEATURE_DISABLED"}}
```

- Payroll mọi GET/POST action, gồm CSV:503 code trên khi OFF.
- Actual/performance/overview:503 WORKFORCE_FEATURE_DISABLED khi OFF.
- Authorization giữ trước disabled: anonymous401; salary Leader/Member403;
  individual other employee403 trước flag. Invalid performance query vẫn400
  vì query cần được parse để xác định self scope.
- Khi ON: giữ400 validation,401 auth,403 scope/self-review và409 stale/conflict/
  locked/policy như handoff;503 incomplete datasets không được hiển thị như complete.
- Disabled phải có user-visible “chưa được mở”, khác empty evidence/empty period.
  Không retry mutation tự động khi feature unavailable. Không biến UNKNOWN thành no-show.

## UI parity cần owner chứng minh

| Workflow | Backend | UI hiện tại | Acceptance |
|---|---|---|---|
| Actual timeline/split/replacement/extra/no-show/independent review | Có | UNVERIFIED | Real evidence, version conflicts; planned shift không sinh attendance |
| Period/rate manager | Discovery có pagination/exact totals | UNVERIFIED | Không cần biết period_id; không coi truncated pages là complete |
| Draft correction/void | Atomic RPC/audit/server calculations | UNVERIFIED | Submit expected_version + stable UUID; retry same payload/UUID replays original receipt |
| Audit/replay | Admin-only original snapshots/version/reason/action | UNVERIFIED | Receipt replay không được coi là latest line; refetch current period/line sau conflict |
| Review→Confirm→Ready→Locked | Independent identities, no skip/reopen | UNVERIFIED | Một Admin không đủ; không mở role Leader để xử lý blocker |
| Locked CSV | Active lines only, numeric negative adjustment, injection-safe text | UNVERIFIED | Reconcile integer VND + audit; không export draft như final |
| Individual/team/leaderboard | Role-aware/evidence-gated, GMV/orders/hour null | UNVERIFIED | Show missing policies/UNKNOWN, denominator/workload; không fabricate score |
| Capabilities/disabled surfaces | H implementation | UNVERIFIED | Four flag combinations + each role, expired/logout/cache403/401/503 |

Handoff từ Antigravity phải gồm final branch/SHA/PR, changed files, API payload
samples, flag-state behavior, browser validation evidence và unresolved gaps.
Integration phải review collisions ở package.json, Calendar/Campaign/Report/Storage
surfaces mà PR24 đã thay đổi. Không merge active worktree; không assume H5.2 đã ready.
