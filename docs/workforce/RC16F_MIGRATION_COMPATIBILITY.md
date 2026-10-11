# RC1.6F — Migration dependency / schema compatibility

Snapshot SELECT/catalog + list_migrations ngày2026-10-11; không apply. Git64,
Staging61, Production60. Digest dưới đây là md5(pg_get_functiondef), dùng phát
hiện drift, không phải chứng thực credentials. Không rewrite migration applied.

| Version / filename trong supabase/migrations | Objects / dependency | Git | Staging ledger / actual | Production ledger / actual | Forward-only action / owner / risk |
| --- | --- | --- | --- | --- | --- |
|20260919074349_rc12_report_file_provider.sql|report_images/live_report_images provider/external_file_id;4 provider/deletion RPCs; existing report/auth/revision functions|Có|Applied;4 columns hiện diện,2 provider-write RPCs hiện diện|Absent;4 columns và2 provider-write RPCs absent|Storage owner phải thiết kế reconciliation riêng cho Production release; không replay vào Staging. Full deletion/RPC equivalence chưa kiểm chứng |
|20260924000000_rc13a_execution_source_storage_routes.sql|shifts.execution_source,brands.storage_profile;routes exact-key NULLS NOT DISTINCT index/RLS/update trigger;create_shift và4arg update_shift;private.set_updated_at/settings/staffing helpers|Có|Applied;routes RLS, six-profile constraints;CANONICAL_V1 brand default;RPC execution_source supported ở create/4arg|Absent nhưng RC15 tạo tương đương từng phần;không cùng schema/RPC|Không replay: ADD COLUMN/create table không idempotent và body RPC lịch sử có thể ghi đè guard. Release owner giữ staging history |
|20261011091925_rc15_storage_route_prerequisites.sql|brands review actor/time + nullable classification;routes approval/period override columns/profile constraints;requires brands/platforms/users/shifts|Có|Absent;CREATE TABLE IF NOT EXISTS không thêm5 route fields vào bảng RC13A;brand/profile constraints vẫn six-profile|Applied;5 route fields + brand review fields present,7-profile brand check,default null|Cần additive ALTER reconciliation được review riêng. Owner Storage/DB; không tự backfill classification/approval; old routes có thể cần approve độc lập |
|20261011092015_rc15_shift_rpc_compatibility.sql|create_shift(jsonb), update_shift(text,jsonb,bool), update_shift(text,jsonb,bool,int);3 digest guards + execution_source;requires settings/private actor/capacity/staffing/version functions|Có|Absent;create/4arg digests khác precondition;3arg còn baseline không execution_source. Apply nguyên file sẽ fail closed|Applied;3 RPC digests khác baseline và support execution_source|Không chạy file này trên Staging. Cần patch additive pin đúng current Staging digests, giữ lifecycle/version/impact/security. DB owner; transaction rollback khi guardfail, không bỏ guard |
|20261011092051_rc15_operational_files.sql|operational_files metadata/checks/active uniqueness/indexes/RLS;FK brands/platforms/shifts/campaigns/users|Có|Absent;table absent|Applied;table RLS present|Apply chỉ sau prerequisite/schema reconciliation; indexes có lock/FK requirements, không seed provider metadata. Storage owner |
|20261012000000_rc16_workforce_payroll_foundation.sql|5 workforce tables;attendance/time/no-show/review/rate/period/line/audit guards;global unique segment_id;transition RPC;RLS/revoke;FK users/shifts +date/status;service_role|Có|Absent;all5 tables absent|Absent;all5 absent|Apply after approved dependencies; no attendance/rate/payroll backfill. Payroll/DB owner; immutable evidence/audit cannot be rolled back by row deletion |
|20261012000001_rc16b_draft_payroll_correction.sql|line version/void/money bounds;audit snapshots/UUID unique/sequencegrant;2 triggers+correction RPC;requires foundation|Có|Absent|Absent|Additive after foundation once only, no replay. Payroll owner; terminalvoid reserves segment forever, no reissue/recovery |
|20261008160638_member_registration_directory_privacy.sql|2 scoped policies +get_staff_directory/get_shift_staffing_summary/get_swap_exchange_candidates;private active/role/shift access helpers|Absent backend;present convergence cf520aa7|Applied;policy own-or-supervisor expressions and3 RPCs present|Absent;directory/raw registration policies broader;3 RPCs absent|Pin approved frontend migration into integration source without reverting Staging privacy. Security/release owner; UI must use narrowed directory contract; not safe to infer equivalence from ledger |
|20261008160645_repair_report_revision_history_rpc.sql|get_report_revisions(text);private report actor+reports/report_revisions fields;auth grant|Absent backend;present convergence cf520aa7|Applied;digest0079040125a6bd3b6fabbb9c12165d93|Absent;digest edbd125bc115a064372a19c53ae5326b differs|Preserve Staging repair; release owner reconcile forward-only source and access. Functional report UAT remains UNVERIFIED |

## Exact RPC evidence

Dependency mới sau fetch cuối: convergence80211dd có
`20261011221500_rc15_provider_metadata_forward_compat.sql`, absent backend và
absent hai ledger ở snapshot61/60 đã đọc. File adds4provider columns/checks,
4RPCs và idempotent live-image winner guard, depends on base report/image/auth
RPCs. Nó không sửa legacy route columns hoặc Staging ShiftRPC digest gap.
Release/Storage owner phải pin/review source và so current definitions trước
reconciliation; không cherry-pick, apply hoặc chấp nhận H5 claims thay verification
trong task này. Full compatibility của file mới với Staging NOT RUN.

| Signature | RC15 required pre-apply digest | Staging actual | Production actual |
| --- | --- | --- | --- |
|create_shift(jsonb)|2133950d90a0610b76d4b6623abf4621|65bfe7dc925fae3364167ef56c896694|7f813fa9c9c4b25f2ed965ffc9fe872c|
|update_shift(text,jsonb,boolean)|6737e74fb449e7745b3847b3f95ec0a0|6737e74fb449e7745b3847b3f95ec0a0|052af1089ed967316d385007828e971c|
|update_shift(text,jsonb,boolean,integer)|c7b743aa97b19c678ff6f84d6c9b8a2c|095d89911f6157a9ce088b9c4da950ed|ead3d98c97a4f293a521e1a6bf4aba3c|

Staging provider-write digests: upload_report_image_with_provider9args
46bce8e5d0f797e5eb75b3211704e771; upsert_live_report_image_with_provider(jsonb)
53380de004d117f9b119dba9347ded09. Directory digests: staff34b1c81363293cbddd54bdbc2642d763,
summary450888d2d1891d247cc832937f5125ea,
swapb96bf4434c5a2ef89544f1bc7fb61cbc.

Confirmed:5 required route columns absent Staging; resolver selects3 JSON override
columns, so database routing currently incompatible with backend RC15.
Brand review2 columns absent; brand/default and both profile-check semantics differ.
Minimal isolated fixture reproduces these omissions and RC15 digest rejection.
It does **not** reproduce live78 shifts/9 reports, full schema, all private RPCs,
policies, extensions, triggers, existing routes/data, provider permissions or
lock duration. Full-schema/data-preserving migration compatibility remains
UNVERIFIED. No historical SQL or ledger repaired during RC16F.
