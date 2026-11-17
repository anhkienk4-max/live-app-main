# ADR-DRAFT — OPS Drive-first Full Data Storage (Owner direction, 2026-11-17)

> **Status:** OWNER-APPROVED TARGET / **DEFERRED UNTIL AFTER RC19 PRODUCTION GO-LIVE** / NOT IMPLEMENTED.  
> **Scope:** Next.js/Vercel + Supabase PostgreSQL + Google Drive/OneDrive for ADA OPS Livestream.  
> **Owner priority decision 2026-11-17:** The full Drive-first structured-data migration (DFS-01..08), reducing operational data in PostgreSQL, new archive/outbox, and comprehensive Drive-first recovery redesign are **POST-GO-LIVE ONLY**. Do not run DFS tasks, rewrite current Storage Contract V2, alter working data paths, migrate existing business rows, or let this future architecture delay RC19. Preserve FULL PASS and existing code. **Still mandatory for current RC19:** provider-real Google Drive verification for in-scope file/report evidence, secure ACL for confidential data, and a safe Production DB migration/recovery plan. No Staging deployment.  
> **Source:** Owner says *all persistent business information*, not only binary/media, should be durably retained on Drive. Deployed runtimes and databases should hold only the minimum metadata/index/transactional projection necessary for operations.  
> **CRITICAL:** This target **differs** from the existing production/Core V1 architecture. Do not rewrite FULL PASS, migrate/deploy, purge PostgreSQL tables, or claim compliance until migration/restore/consistency gates are passed.  
> **Deployment path:** Direct Production only; staging/preview is not a prerequisite per `project-memory/decisions/RC16H-production-only.md`; isolated local/disposable Postgres testing and production migration safety remain required.  
> **Original architecture evidence:** `docs/storage/RC15_STORAGE_CONTRACT_V2.md` and `docs/architecture/file-provider-foundation.md` currently designate Supabase as the source of truth for structured operational data, and Drive/OneDrive for binary files.

## 1. Required target data placement

| Data class | Durable Drive/OneDrive content | Minimum live Supabase/Postgres footprint | Notes |
|---|---|---|---|
| Shift, calendar, staffing segments, registration, PASS/SWAP | Canonical versioned JSON records, change journal, import originals/normalized snapshots | Stable IDs, cross-entity keys, unique time-slot constraints, row versions, actor scope, event/outbox status, small query indexes | Atomic two-shift swap cannot be replaced by disconnected Drive file writes without a consistent transaction protocol |
| Attendance, actual worked intervals and evidence | Original check-in/out photos, events, approved corrections, versioned evidence JSON | Identity/shift links, approved interval indexes, validation/review status and receipt pointers | Preserve original immutable evidence and distinct approved effective timestamps |
| Payroll | Approved period payload, line items, rate-version snapshots, change/approval/lock journal | Minimal immutable period-lock and approval/correlation indexes, receipt/version/authorization | Never delete the canonical payroll needed to enforce existing salary locks before safe cutover |
| Reports, live snapshots, OCR, KPI and analytics | Raw source files, corrected payloads, approved reports, metric source/version snapshots, exports | Source lineage, exact session/Brand keys, freshness/revision, ACL, provider pointers | Do not silently replace accepted historical report when new source arrives |
| Brand, store, channel, product/SKU, campaign, scheme, voucher and assets | Versioned master-data JSON and original media/Docs/Sheets | Canonical entity identifiers and relationship/query indexes | Preserve owner and cross-Brand isolation |
| App configurations, audit, migration/recovery metadata | Signed/versioned config snapshots, append-only audit/event export and recovery manifest | Permission decision fields, audit query indexes, schema/migration ledger, store manifest and provider IDs | Sensitive secrets never stored in ordinary Drive files or GitHub |
| Binary files of any type | Photos, xlsx, video, PDFs, scripts, images, audio, documents, original dataset | Provider ID, parent ID, file type/size/hash/revision, effective permissions and referenced entity | Existing Storage Contract V2 binary split remains the starting point |

**Hard distinction:** Vercel is stateless compute and deployment, not a durable business-data store. Supabase Postgres is an operational transactional database; reducing it to *only provider metadata* while keeping atomic scheduling/payroll behavior is not a no-code setting. Certain constrained business fields are genuinely required in DB for uniqueness, locking, consistency, authorization and fast reads until a different transactional mechanism is approved.

## 2. Source-of-truth policy

**Owner desired:** Drive-first, fully recoverable and inspectable durable copies for *all* business domains, with application/database provider-neutral metadata and minimal query/transaction state.

**Current real system:** Supabase is authoritative for operational relational records. Files are on Drive/OneDrive by contract, but physical-provider acceptance is not yet proven for every flow; the old V2 `SYSTEM/EXPORTS` JSON action is *not* a full SQL backup or database restore.

**Migration-safe interim:** Operational Postgres remains authoritative for live transactions **until** a verified Drive-first synchronization/restore mechanism passes reliability acceptance. Durable Drive mirror/snapshot/event export can be built without deleting existing operational tables. Only after readback/restore evidence can the authority be formally reconsidered.

## 3. Drive organization and privacy

- Reuse the actual, approved root **`LIVESTREAM REPORT`** and verified Brand/Platform/Period/Execution Source paths. **Never duplicate `ADA`**, move old files, guess a subbrand key, or rewrite historic naming.
- Keep raw binaries, row-level event archive, report snapshots and index manifests in exact approved folder categories; do not assume all can be written under legacy folder layout.
- Maintain a **restricted Admin-only destination** for Salary, attendance photos, private personnel data, user-identifying exports and recovery snapshots. Existing notes report the root had an `anyone:writer` ACL; do NOT store confidential database dumps/Payroll/credentials under that broad root.
- No database secrets, service-role keys, OAuth refresh tokens, password hashes, private encryption keys or runtime env dumps in ordinary Drive/Notion/GitHub.
- Use deterministic object ID/path, provider file ID/parent, checksum, generation/version, content type and size; immutable snapshot naming. Large files via approved direct provider upload/link, not serverless multipart beyond size limits.
- Define retention, confidentiality, export right, deletion, legal hold, access expiry, and audit for each data class.

## 4. Consistency & event protocol

1. Resolve Brand/user/operational role and one exact authorized Drive destination. Reject unverified/ambiguous destination and exposed sensitive ACL.
2. Validate operation against current live DB transaction (unique slot, optimistic `version`, staffing segment capacity, approved actual, payroll period lock, reviewer separation).
3. In the transaction, record a durable **outbox/event intent** with stable event ID, entity revision, correlation ID, destination key and expected checksum; atomically commit existing business change + intent. No binary stored in DB.
4. Secure worker processes outbox with idempotent Drive write; read back provider ID, parent, byte hash/size, verify ACL and then mark archive `VERIFIED`. Backpressure/retry and poison/dead-letter state are observable.
5. Make the operational UI show `PENDING_ARCHIVE`, `VERIFIED`, `RETRY_REQUIRED` honestly; do not claim Drive durability while pending.
6. Reconcile periodically: DB rows with no Drive object, Drive orphaned object with no DB receipt, checksum drift, wrong parent or missing archive versions; remediation is targeted, audited and non-destructive.
7. For true **Drive-authoritative writes** in a later phase, design and prove a coherent transaction protocol including recovery from DB commit/provider failure and concurrent writers; do not simply reverse write order or assume Drive files support relational transactions.

**Important:** Temporary outbox records and critical indices make this a *minimal durable operational footprint*, not technically `metadata only` in the strict sense. If the owner requires literally zero business state in PostgreSQL, this is a separate, incompatible redesign requiring a transactional datastore alternative and new full UAT; it cannot preserve FULL PASS by definition.

## 5. Recovery contract (NO obligatory C-drive dump)

- **No duplicate local copy** of the existing media and file archive is required. Existing Drive file objects are the durable file storage.
- Design a complete **database recovery artifact** (schema/migrations and consistent transactional state/metadata, auth mapping dependency, constraints, audit, index rebuilding spec) stored in a restricted independent provider/location (e.g. approved secured Drive, OneDrive or other encrypted offsite location). `SYSTEM/EXPORTS` of selected Brand rows alone is insufficient.
- On Supabase Free, do not presume scheduled provider-managed backups or PITR. Verify actual backup availability and capture immutable recovery receipt before a data-affecting Production migration.
- A SQL export need not reside on local `C:`; generate and upload via a safe authenticated remote runner/alternate disk/streaming mechanism. Do not store credentials in backup artifacts.
- Restore into isolated disposable PostgreSQL 17 (never production); assert schema/RLS/ACL/auth mapping, migration ledger, counts, critical payroll/attendance invariants, event receipt and Drive object readback. Record exact source/time/size/hash and RPO/RTO evidence.
- Deployment rollback (Vercel) is not a DB rollback. Avoid destructive migrations; use expand/migrate/contract and explicit recovery plan.

## 6. Rollout work packages (PLAN ONLY — activate only AFTER RC19 Production Go-live)

| ID | Earliest wave | Scope | Exit evidence | Dependent |
|---|---|---|---|---|
| DFS-01 | R0/W0 | Owner architecture decision, inventory all DB domain tables and existing Drive/provider paths; classify transactional/metadata/payload/secret | Inventory + proposed future authority, schema diff, no business mutation | PG-003–005 |
| DFS-02 | W0/W1 | Confidential Drive ACL/namespace/recovery destination approval, cost/quotas, fallback | Actual provider ACL/Brand-scope verification | PG-113/114 |
| DFS-03 | W1/W2 | Durable operational event outbox + retry & readback mechanism, scoped business entities | Concurrency and provider outage tests, no FULL PASS regression | PG-014/026/047 |
| DFS-04 | W2/W4 | Complete versioned Drive archives for staffing/attendance/payroll/reports/catalog and raw files | Rebuildable export, role correct, source hash and no missing entity | PG-027/029/040/046/118 |
| DFS-05 | W4/W5 | Bulk source import and data snapshot archival, incremental reconciliation, session and metric lineage | Import duplicate/no-op, big dataset and wrong parent recovery tests | PG-052–058, PG-121 |
| DFS-06 | W5/W7 | Offsite full database recovery envelope with Drive receipts; isolated restore proof | PostgreSQL 17 restore 100% for accepted scope; no C-drive requirement | PG-079/080 |
| DFS-07 | W7+ CONDITIONAL | Evaluate reduction of operational SQL data; no deletion until full production-level restoration and atomic operation parity | Full security, latency, recovery, multi-actor and integrity acceptance | DFS-01..06 |
| DFS-08 | W7+ | Cost controls and storage/provider portability | Measured p95, Drive API quota, private retention and failure monitoring | PG-122 |

## 7. Non-negotiable acceptance

- The result can recover every accepted entity to a consistent point, not merely replay files with unknown order, and preserve locked payroll, approved attendance, shift identity and approved reports.
- Full Android/Desktop UI and Admin/Leader/Member authenticated access tests; exact Brand isolation and denial of an unrelated Drive parent.
- Concurrent PASS/SWAP and payroll review are atomic from the user's perspective, with durable correction/journal and no double effect.
- Fully tracked Drive archive completion or visible pending/error with safe retry; no fake green from an upload call lacking readback.
- No `anyone:writer` confidential destination; no proprietary platform API claims.
- No local disk dependency to meet the architecture; alternate approved secure runner may be used to generate/restore backup.
- No schema/data deletion, no production credentials and no code changes without an independent plan, owner approval and release gate.

## 8. Documentation links

- [Current Storage V2 contract](https://github.com/anhkienk4-max/live-app-main/blob/main/docs/storage/RC15_STORAGE_CONTRACT_V2.md).
- [Current provider foundation](https://github.com/anhkienk4-max/live-app-main/blob/main/docs/architecture/file-provider-foundation.md).
- [Existing direct Production decision](https://github.com/anhkienk4-max/live-app-main/blob/main/project-memory/decisions/RC16H-production-only.md).
- [V1.1 post-go-live plan](OPS_POST_GO_LIVE_V1_1_122_TASKS.md).
- [Owner's Notion roadmap](https://app.notion.com/p/41b5449511e68184a07ad66f248d8e81).

**Status: DEFERRED POST-GO-LIVE. Requirements preserved; not a pre-Go-live blocker, not implemented, no migrations/deploy authorized.**
