# RC1.6F — Staging migration approval package (documentation only)

**RC1.6G: READY FOR TECHNICAL OWNER REVIEW; NO-GO cloud apply. Không có lệnh cloud apply/seed đã thực thi.** Owner
cần duyệt target `amagnzebmmuqiptmrjmc` riêng; production `egdjnpmoasarrttvhgds`
và ops5729.top ngoài scope. Package không là authorization tự động.

## Approval fields

Release/DB owner ký: targetref, source fullSHA/migration fileSHA256, maintenance
window/lock timeout, backup/snapshot+restore owner, planversion, actor, audit
location, exact SQL allowlist, fixture namespace/retention. Security ký giữ RLS,
service-role isolation, privacy fixes; Storage ký provider/root/route isolation;
HR/Finance ký policies và hai authorizedreviewers. Chưa có chữ ký nào được suy diễn.

## Pre-verification (read-only trước apply được duyệt)

1. Fetch/pin backend+Storage+officialGemini;recorddirty/status/HEAD/main/PRbases;
   check CI22/16 và24/17 exactcandidate. Không tự merge/promote.
2. Verify provider projectref/health và SELECT server_version;list ledger;
   compare catalogcolumn types/defaults/checks/FKs/indexes/RLS/grants/triggers,
   all3 ShiftRPC bodies/digests and privatehelpers with approvedmanifest.
3. Snapshot baseline counts78 shifts/9 reports (re-query nếu drift), route
   keys/config chỉ evidenceprotected; existingdata không disposable. Recheck
   privacy policies/report revisions definitions; never overwrite them.
4. Obtain owner-managed backup/restore drill evidence. Schema-only snapshot
   sanitization và representative synthetic baseline phải được authorize riêng;
   RC16F minimalfixture không thay thế fullStagingrehearsal.
5. STOP khi digest/schema drift, routecols missing sau reconciliation hoặc patchfiles chưa tồn tại;
   không bỏ guard, repair ledger hay replay historicalfiles để vượt kiểm tra.

## Ordered allowlist — điều kiện bắt buộc

| Step | File/action | Điều kiện / trạng thái |
| --- | --- | --- |
|0|Preserve20260919074349 RC12,20260924000000 RC13A,20261008160638 privacy,20261008160645 history|Đã applied Staging;không replay. Pin hai frontendfiles vào integrationmanifest sau ownerapprovedsource |
|1|20261011091925_rc15_storage_route_prerequisites.sql|Chưa applied;adds brandreview cols/dropsdefault nhưng **không hoàn tất legacy routes**;chỉ apply trong reconciliationplan ký duyệt |
|2|supabase/reconciliation/rc16g/20261013000000_rc16g_legacy_storage_routes.sql|IMPLEMENTED, guarded legacy-only transaction;5columns,JSON/profile checks,nullableapproval,brand review/default;no backfill |
|3|supabase/reconciliation/rc16g/20261013000001_rc16g_staging_shift_rpc.sql|IMPLEMENTED;exact3digest+ACL guards;patch only3arg;preservecreate/4arg. Exclude20261011092015 on Staging |
|4|20261011092051_rc15_operational_files.sql|After2/3,FK targettypes verified;no metadata/providerseed |
|5|20261012000000_rc16_workforce_payroll_foundation.sql|After dependencyverification;empty newWorkforcetables;no inferred historicalattendance/rates |
|6|20261012000001_rc16b_draft_payroll_correction.sql|Exactlyafterfoundation,onceonly;lineversions/audit/void/globaluniqueness validated |
|7|Post-verification then separate fixture approval|No seeding in migrationphase;no reclassification historicalshifts |

Steps2/3 có code và isolated rehearsal RC16G; cloud apply vẫn chưa được duyệt.
Historical
version gap20261011092015 may intentionally remain; a future approved additive
version records equivalent Staging patch rather than falsely marking history.
Future newversions can be chronologically later thanRC16; plan enforces dependency
order explicitly, not blind `db push`. No ledgerrepair suggested.

## Post-verification / stop / recovery

List ledgeragain, compareapproved hashes/catalog and all3 ShiftRPC digests/grants;
confirm privacy/historyunchanged and baselinecounts stable;test expectednewtables,
RLS+revokes,invokerRPC grants,globalunique(segment_id) includingvoidedlines,
auditappend-only andline/version/void/moneyconstraints. No mutation-based destructive
test on historicaldata. Fixturetests only separateauthorization+namespace.
Measure locks/timeouts and record failed transaction before proceeding to nextstep.

RC15RPC file hastransaction+digestguard; otherfiles do not all wrapthemselves.
Use operator-reviewed atomic per-file execution/ledgerrecording with fail-fast,
no autocommit partialapply. OnfailureSTOP; inspect schema/ledger and use forwardfix
afterownerreview. Do not DROP workforce/route tables, delete evidence/audit, unvoid,
editlockedpayroll or restoreover operationalrecords casually. Restore is a separate
owner decision with outage/data-loss implications. No reverseSQL/automaticrollback
for approvedfinancialevidence.

## RC1.6G pinned file hashes / execution contract

Canonical manifest: ../../supabase/reconciliation/rc16g/manifest.json. SHA256 là
bytes file LF trong Git, kiểm lại ở mỗi step trước khi dùng cùng buffer SQL.

| Step | Version / file | SHA256 |
| --- | --- | --- |
|1|20261011091925_rc15_storage_route_prerequisites.sql|319ea68aea1cb42ca88b7403a0c61dac6a9fc4c64025cbe5fab5d946f9380357|
|2|20261013000000_rc16g_legacy_storage_routes.sql|b428609ccd015ad2eab73dfc5074b201b3666422f55ccd1010fc751db9361cf9|
|3|20261013000001_rc16g_staging_shift_rpc.sql|49cfdb33a1849f5e46ba637a220d515e06b0708d7be692a80a459ca71b153706|
|4|20261011092051_rc15_operational_files.sql|33aa62e14b50d6d2195d094423b7f876877fd86c9116bdf8434b573906637bb2|
|5|20261012000000_rc16_workforce_payroll_foundation.sql|889fae5221c16b4e983f22e07da7e1212f796440eb06f4e327db0b862568b170|
|6|20261012000001_rc16b_draft_payroll_correction.sql|5f3484fe3a2203cfa8cb484a97900975b1f72c75a35f8a09f49eb243283c7e72|

Prerequisites: business_users/brands/platforms/campaigns/shifts, UUID generator,
anon/authenticated/service_role, private actor/settings/staffing/version helpers,
verified legacy14-column route table, legacy profile checks, named unique
NULLS NOT DISTINCT index, enabled set_updated_at trigger and browser revokes.
Route/brand existing values must satisfy the expanded validated CHECK constraints.
All5newroute columns must be absent; partial application is STOP, not IF NOT EXISTS
recovery. Brand review fields if already present require verified nullable types,
no defaults, FK to business_users(id) ON DELETE SET NULL.

RPC preconditions:
create65bfe7dc925fae3364167ef56c896694;
3arg6737e74fb449e7745b3847b3f95ec0a0;
4arg095d89911f6157a9ce088b9c4da950ed.
Post B: create/4arg unchanged;3arg1ed36fa69c62713d89ed2a104c73c013.
Owner postgres,SECURITY DEFINER,emptysearch_path;3arg ACL postgres/service_role
only;create/4arg also authenticated. No changes to grants or role authority.
Expected route constraint/index/trigger definitions and column types/defaults:
tests/fixtures/rc16g_staging_catalog.json; SQL A embeds their exact guard values.

Catalog snapshot file SHA256:
eb643d121f811ae6a8497203e663ff22caf5c12d200a3b342b7ad0aaba9d90a1.
Expected legacy MD5(pg_get_constraintdef): brands_storage_profile_check và
operational_storage_routes_profile_check=3b9c82593913519ac47f664472aa8d90;
operational_storage_routes_labels_check=56e2601d4569112a72993b7fee4638b1;
operational_storage_routes_subbrand_profile_check=b0cc848e580d405447157160c62e2e52.
SQL guards so exact definitions, mạnh hơn chỉ dùng MD5. Preflight phải so toàn bộ
snapshot/constraints, không coi vài fingerprint bằng nhau là full schema proof.

Read-only pre/post queries (identity verified independently by provider metadata):

~~~sql
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.prosecdef,
       p.proconfig,p.proacl,pg_get_userbyid(p.proowner)
FROM pg_proc p WHERE p.oid IN ('public.create_shift(jsonb)'::regprocedure,
  'public.update_shift(text,jsonb,boolean)'::regprocedure,
  'public.update_shift(text,jsonb,boolean,integer)'::regprocedure);
SELECT conname,convalidated,md5(pg_get_constraintdef(oid)),pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid IN ('public.operational_storage_routes'::regclass,'public.brands'::regclass)
ORDER BY conrelid,conname;
SELECT a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
       pg_get_expr(d.adbin,d.adrelid)
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.operational_storage_routes'::regclass AND a.attnum>0 AND NOT a.attisdropped
ORDER BY a.attnum;
SELECT relrowsecurity,relacl FROM pg_class WHERE oid='public.operational_storage_routes'::regclass;
SELECT pg_get_indexdef(indexrelid) FROM pg_index
WHERE indrelid='public.operational_storage_routes'::regclass;
SELECT pg_get_triggerdef(oid) FROM pg_trigger
WHERE tgrelid='public.operational_storage_routes'::regclass AND NOT tgisinternal;
SELECT count(*) FILTER(WHERE approved_by IS NULL AND approved_at IS NULL) AS unreviewed,
       count(*) AS routes FROM public.operational_storage_routes; -- post A only
~~~

Operator phải approve cả SQL và việc ghi **new** ledger versions cùng transaction,
không sửa/delete/repair existing rows, không giả-applied excluded20261011092015.
Harness local đã demonstrate SQL+ledger atomicity và rollback; nó không có cloud
connection/deployment support. Không copy runner để trỏ cloud.
Mỗi file historical không tự wrap cần outer BEGIN/COMMIT; A/B inner wrappers được
executor local loại đúng dòng trước outer transaction. Operator dùng reviewed
executor tương đương,không autocommit từng statement; pin cùng buffer/hash.
Before step: nếu version đã present thì STOP và verify catalog/hash; không replay.
Failure: transaction rollback và không record version; STOP chuỗi; inspect chỉ đọc.
Retry chỉ sau owner xác minh rollback,restore verified baseline hoặc forward fix;
không bỏ digest guard hay ghi lại version cũ.

Thứ tự không chronological là chủ ý và đã test trên2operational baselines mới/cũ.
Supabase CLI áp migration theo timestamp; hai file mới nằm ngoài auto-discovery.
Curated Staging release workspace cần giữ historical excluded file ngoài allowlist
và pin A/B cùng approved manifest để tránh CLI local/remote ledger mismatch.
Không dùng backend supabase db push hoặc --include-all/repair để vượt gap.
Production manifest phải exclude A/B; raw B reject Production RPC digests.
Clean install toàn bộ historical Git chưa được chứng minh: fresh test bắt đầu bằng
approved operational prerequisite schema rồi RC13A,có private security helpers thật.
[Supabase migration ordering](https://supabase.com/docs/guides/deployment/database-migrations)
không biến later timestamp thành prerequisite override.

Locks: A ACCESS EXCLUSIVE trên brands/routes; mở rộng CHECK quét existing data.
B advisory transaction lock chỉ serialize reconciliation,không thay business locks.
Maintenance window, concurrent-DDL freeze,backup/restore drill và owner-approved
locktimeout5s/statementtimeout60s bắt buộc; actual duration on Staging NOT RUN.
Hash/digest/ACL/index/trigger/schema/data drift,timeout,missing backup/candidate
approval hoặc unexpected ledger: STOP. Không có automated down migration;
drop cột/new tables có thể mất evidence. Forward correction/restore cần review riêng.
Postcheck không mutate historicalrows; compare protected pre/post row evidence,
count/schema/ACL/trigger/index/privacy/reportRPC digests và workforce guards.
C03 OPEN đến approved actual Staging apply+postverification; C01/C02 BLOCKED.

Only after approvedmigration+postchecks and allPreviewacceptance gates may an
authorizedoperator execute syntheticUAT. Productionmigration/merge/deploy remains
a separate task/approval.
