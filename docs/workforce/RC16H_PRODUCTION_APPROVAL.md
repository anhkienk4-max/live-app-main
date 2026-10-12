# RC1.6H — Production migration, backup và approval package

**DOCUMENTATION/SQL RENDER ONLY. Chưa được phép thực thi cloud.** Package này
phục vụ review hai bước Payroll DDL; full release vẫn NO-GO theo
[blockers](RC16H_PRODUCTION_READINESS.md). RC12 Storage compatibility chưa nằm
trong package; cần package forward-only riêng sau reconciliation source H5.2.

Candidate hiện đã xuất hiện trong remote `rc/convergence-rc14-rc15` tại
`7dddb168e82dbd49cf3b91d7cfc3ac451ed25478`:
`supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql`.
Git-blob SHA256 tại SHA trên:
`f649eab692c892f66019b1aad7ad5b98b5f168ca8e69247577554ed7d0723155`.
Chưa được owner xác nhận là source cuối; không nằm trong manifest/backend và
chưa được H chạy SQL. Nếu approved sau integration/rehearsal, dependency sequence
là RC15 đã applied → provider compat11221500 → RC16 foundation → RC16B.
Full manifest/backup/permission digests phải được regenerate trên integrated SHA;
không suy diễn candidate H5.2 ready từ tài liệu verified SHA cũ d4b5999.

## Manifest và execution order

Target bắt buộc: Supabase `egdjnpmoasarrttvhgds`, Production. Không infer từ tên
env hoặc database `postgres`. File: `supabase/release/rc16h/manifest.json`.

| Bước | File / version | SHA256 | Boundary |
|---|---|---|---|
| Baseline, không replay | RC15 `20261011091925` → `20261011092015` → `20261011092051` | Ledger + actual catalog đã xác minh | Drift/missing → STOP |
| 1 | `supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql` | `889fae5221c16b4e983f22e07da7e1212f796440eb06f4e327db0b862568b170` | Guard + DDL + post-security + ledger insert trong một transaction |
| 2 | `supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql` | `5f3484fe3a2203cfa8cb484a97900975b1f72c75a35f8a09f49eb243283c7e72` | Require committed foundation; guard + additive DDL + post-security + ledger trong một transaction |

Không sửa historical migration. Không chạy `supabase db push` cả thư mục vì Git
và Production ledger diverge (RC12/RC13A). Không chạy migration repair hoặc đánh
dấu applied thay cho DDL. Hai file `supabase/reconciliation/rc16g/2026101300000{0,1}_*.sql`
excluded hoàn toàn. Không thêm source frontend migration chưa approved.

Renderer đã được dùng trực tiếp trong PG16/17 rehearsal; **không có connection
handling, executor hay credential reading**:

```powershell
node scripts/workforce/rc16h-production-manifest.mjs 1
node scripts/workforce/rc16h-production-manifest.mjs 2
```

Stdout là SQL reviewable. Nếu lưu artifact, operator phải dùng UTF-8 và record
SHA256 artifact sau render trên exact approved Git SHA. Lưu manifest, hash
preflight/renderer/catalog fixture và toàn bộ SQL artifacts trong approval record.
Không pipe renderer vào psql/Supabase trong task này.

Mỗi step SQL gồm BEGIN; lock_timeout5s, statement_timeout60s; preflight guard;
reject applied/partial state; unchanged migration; post-verification; ledger insert
với statements của migration; COMMIT. Failure ở bất kỳ điểm nào rollback step.
Step2 failure không rollback Step1 đã commit: flags phải vẫn OFF, chẩn đoán rồi
roll-forward/retry có review. Không seed, backfill hoặc classification tự động.

## Pre-apply readonly verification

Operator chịu trách nhiệm cùng owner xác minh project ref qua provider metadata,
connection target và quyền truy cập; không in connection string/key. Trong approved
transaction, `supabase/release/rc16h/preflight.sql` chỉ có assertions, không DDL/DML.
Nó kiểm tra PG major16/17, security roles, ledger RC15, exact RPC MD5/owner/ACL/
SECDEF/search_path, route columns/unique index và schema Workforce prerequisites.
Baseline snapshot là catalog ngày2026-10-12, không là evidence luôn đúng tương lai.

```sql
select current_setting('server_version');
select version,name from supabase_migrations.schema_migrations
where version in ('20261011091925','20261011092015','20261011092051',
                  '20261012000000','20261012000001') order by version;
select oid::regprocedure,md5(pg_get_functiondef(oid)),prosecdef,proconfig,proacl
from pg_proc where oid in (to_regprocedure('public.create_shift(jsonb)'),
  to_regprocedure('public.update_shift(text,jsonb,boolean)'),
  to_regprocedure('public.update_shift(text,jsonb,boolean,integer)'));
select relname,relrowsecurity from pg_class
where relnamespace='public'::regnamespace and relname like 'workforce_%';
select count(*) as independently_authorized_admin_candidates from public.business_users
where system_permission='admin' and status='active' and account_status='active'
  and archived_at is null and deleted_at is null;
```

So sánh shape/default/nullability/constraints/indexes/RLS/policies/triggers/grants
các bảng trong `tests/fixtures/rc16h_production_catalog.json`, riêng RPC fingerprints
ở readiness matrix. Không đọc hoặc đưa actual operational rows vào Git.
Table identity text PK, shifts.date/status/deleted_at, business_users permission/
active account fields và service_role isolation phải khớp. Private helpers và
Report/Storage flows không bị migration H thay thế.

## Backup/recovery requirements — NOT RUN ở task H

- DB operator và owner chốt maintenance window, writer quiescence, lock budget,
  RPO/RTO, incident contact và fallback deployment. Không tự invent RPO/RTO.
- Xác minh plan/retention của Supabase backup/PITR, timestamp trước change, quyền
  restore và export schema/ledger đã mã hóa vào kho owner-approved. Ghi checksum;
  không commit production dump/keys hoặc dùng Google Drive folder thật trong task H.
- Restore rehearsal cần authorization riêng cho disposable **private** restore
  target; PII encryption, restricted access và retention owner-approved. Synthetic
  catalog rehearsal H không phải backup restore drill.
- Capture count/fingerprint read-only cho Shifts, Reports/revisions, route/file
  metadata, permissions/RPCs trước/sau. Dùng aggregate/checksum nội bộ, không in
  dữ liệu nhân sự hoặc salary; tránh scans dài ngoài maintenance budget.
- Database backup không chứa binary Google Drive/OneDrive; provider owner phải
  xác minh inventory/routing, quyền read/recovery và backup/retention riêng.
  Không tự copy/delete external objects để thử rollback.

Sau COMMIT không có down migration an toàn mặc định. Tắt feature/rollback app
không xóa schema/data. Nếu chưa có feature writes, giữ bảng mới và xử lý forward.
Nếu đã có approved attendance/rates/payroll audit/locked period, không DROP/TRUNCATE,
manual UPDATE, unvoid hoặc sửa ledger. Restore toàn DB có thể mất operational
writes sau backup: owner phải quyết định riêng cùng operator, đối chiếu external
provider objects và audit obligations. Không hứa zero-loss rollback.

## Post-apply / activation acceptance — chỉ sau authorization riêng

1. Read ledger đúng hai versions, hash artifacts, presence5 tables+RLS, service-only
   browser revokes, correction RPC, immutable audit trigger, global segment UNIQUE
   bao gồm voided lines. So sánh legacy footprint/counts như preflight.
2. Xác minh bằng read-only client dùng **effective deployed credential**, không
   export key: approved Production URL, successful authorized HEAD/count/schema
   query khớp provider project metadata; capture sanitized success/error và target
   ref. Matching URL không chứng minh credential ownership. Runtime validator có
   trước privileged creation, nhưng chứng minh key alignment là gate operator.
3. Deploy/merge cần approval khác với DDL. Candidate phải exact integrated SHA,
   expected project/team/Production target, READY và served asset/source evidence.
   Không coi GitHub CI hoặc main alias cũ là deployment mới. Mock phải OFF.
4. Keep FEATURE_ACTUAL_STAFFING=false và FEATURE_PAYROLL=false, capabilities tất cả
   false theo role. Kiểm tra existing Storage/Reports/Shifts/auth/read permissions
   không regression. Không upload provider file nếu chưa có approval riêng.
5. Mở Workforce chỉ sau approved lateness/evidence policies và owner-authorized
   validation data; không suy diễn attendance lịch sử. Mở Payroll độc lập chỉ sau
   reviewer thứ hai, HR rates/OT/break policies, void/reissue acceptance và UI checks.
6. Physical browser acceptance dùng checklist37 cases đã được re-scope Production;
   fixture SQL H/F chỉ disposable và **không được seed Production**. Owner phải
   phê duyệt từng dữ liệu/flow Production dùng thật; không chạy synthetic mutations
   vào live shifts/reports. CSV/audit reconciliation và dual-review là gate riêng.

## STOP conditions và sign-off

STOP nếu target/SHA/credential/provider routing chưa xác minh, metadata/catalog
drift, partial Workforce schema, applied version nhưng SQL chưa đối chiếu, lock
timeout, unexpected defaults/grants, thiếu backup/restore proof, Storage RC12 gap,
UI chưa owner-approved, hoặc feature activation thiếu reviewer/policies/void acceptance.
Không sửa guard cho pass và không retry tự động.

Sign-off cần: owner (scope/mutations/activation), DB operator (backup/apply/recovery),
Storage owner (compatibility/provider), Antigravity owner (final UI/source), HR
(rates/policies), độc lập Payroll reviewer (authority). Từng approval phải ghi
exact SHA, project/deployment, artifact hashes, window, steps và verification owner.

Package Payroll kỹ thuật có thể review; **full Production release và mọi mutation
vẫn NO-GO/chưa authorized**. Không có hành động Production nào được thực thi ở H.
