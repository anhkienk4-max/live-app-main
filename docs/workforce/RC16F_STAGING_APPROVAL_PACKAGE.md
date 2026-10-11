# RC1.6F — Staging migration approval package (documentation only)

**Decision: NO-GO hiện tại. Không có lệnh cloud apply/seed đã thực thi.** Owner
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
5. STOP khi digest/schema drift, routecols missing hoặc patchfiles chưa tồn tại;
   không bỏ guard, repair ledger hay replay historicalfiles để vượt kiểm tra.

## Ordered allowlist — điều kiện bắt buộc

| Step | File/action | Điều kiện / trạng thái |
| --- | --- | --- |
|0|Preserve20260919074349 RC12,20260924000000 RC13A,20261008160638 privacy,20261008160645 history|Đã applied Staging;không replay. Pin hai frontendfiles vào integrationmanifest sau ownerapprovedsource |
|1|20261011091925_rc15_storage_route_prerequisites.sql|Chưa applied;adds brandreview cols/dropsdefault nhưng **không hoàn tất legacy routes**;chỉ apply trong reconciliationplan ký duyệt |
|2|NEW forward-only legacy-route reconciliation migration|**NOT IMPLEMENTED/NOT APPROVED**: add5routecols with validated JSON/check/nullableapproval semantics;expand existing brand/routeprofiles without backfill;retain RLS/indexes/update triggers;validate data. Pin fileversion/hash after implementation+fullbaseline tests |
|3|NEW forward-only Staging ShiftRPC compatibility patch|**NOT IMPLEMENTED/NOT APPROVED**: pin Staging3 digests in matrix;add execution_source to3arg contract preserving current4arg/create/lifecycle/CAS/impact/privatehelpers. **Do not apply20261011092015 Production-only patch on Staging**; do not rewrite historicalversion or ledger |
|4|20261011092051_rc15_operational_files.sql|After2/3,FK targettypes verified;no metadata/providerseed |
|5|20261012000000_rc16_workforce_payroll_foundation.sql|After dependencyverification;empty newWorkforcetables;no inferred historicalattendance/rates |
|6|20261012000001_rc16b_draft_payroll_correction.sql|Exactlyafterfoundation,onceonly;lineversions/audit/void/globaluniqueness validated |
|7|Post-verification then separate fixture approval|No seeding in migrationphase;no reclassification historicalshifts |

Steps2/3 are explicit blockers: exact fileversion/body/hash do not exist yet, so
**no executable cloud migration set can be approved from RC16F alone**. Historical
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

Only after approvedmigration+postchecks and allPreviewacceptance gates may an
authorizedoperator execute syntheticUAT. Productionmigration/merge/deploy remains
a separate task/approval.
