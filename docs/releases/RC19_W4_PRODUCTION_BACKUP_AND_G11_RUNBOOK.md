# RC19 W4 Production Backup, Recovery & Google Drive G11 Owner Runbook

**Target Environment:** Supabase Production `egdjnpmoasarrttvhgds` / Vercel `livestream-ops-demo` (`https://ops5729.top`)
**Scope:** Pre-cutover Production safety gates requiring owner credentials (`SUPABASE_ACCESS_TOKEN` / Production DB URI + Google Drive OAuth secrets + Vercel owner access).
**Status from Non-Production Implementation Lane:** **OWNER-REQUIRED (`BLOCKED` until executed and verified with Production credentials)** — do **NOT** mark Backup or G11 as `PASS` without verified restorable copy / live G11 evidence, do **NOT** modify/delete Production business data, and do **NOT** alter the agreed 93-folder Google Drive operational structure.

---

## 1. Agreed Storage, Backup & Rollback Architecture (3 Separate Layers)

| Layer | System of Record | Backup / Rollback Mechanism | Hard Invariants |
|---|---|---|---|
| **1. Database & Metadata** | **Supabase Production** (`egdjnpmoasarrttvhgds`) — schemas `public`, `private`, `storage` (tables/metadata) | Supabase automated cloud backups / PITR + **encrypted off-site logical export uploaded to a dedicated, ACL-restricted Google Drive backup folder** | **Zero long-term backups stored on `C:\`, WSL, or `$HOME`.** Ephemeral temp files must be encrypted, uploaded, checksum/readback-verified, restore-tested, and immediately shredded/deleted. |
| **2. Operational Files & Photos** | **Google Drive** — agreed **93 operational folders** | Drive ACL enforcement (no `type = 'anyone'`), Drive revision/trash retention, and metadata cross-checks against Supabase `stored_files`, `operational_files`, `self_attendance_photo_evidence` | Separate from DB backup/export storage. Cutover verification must **not** reorganize, rename, or alter the 93 operational folders. |
| **3. Application Deployment** | **Vercel** (`livestream-ops-demo` -> `https://ops5729.top`) | **Retain prior immutable Vercel Production deployments** for instant rollback (`vercel rollback` or Vercel Dashboard Instant Rollback) | Do not purge/delete prior Production deployments; rollback is an application-layer deploy pointer switch, independent of DB/Drive backups. |

---

## 2. Gate G-Backup: Database & Encrypted Google Drive Off-Site Backup Protocol

> Reference baseline: [core-v1-backup-restore.md](file:///C:/Users/KienNguyen/Downloads/KIEN%20ADA%20code/OPS%20LIVESTREAM%20PLATFORM/rc19-w4-final-integration/docs/runbooks/core-v1-backup-restore.md). Never mark this gate `PASS` until a restorable copy is actually verified.

### 2.1 Step 1 — Inspect Existing Backups First (Prevent Duplicate Backups)

Before creating any new backup export, check what already exists and reuse a verified current-window backup if already present:

1. **Supabase Cloud Backups / PITR:**
   - Open **Supabase Dashboard -> Project `egdjnpmoasarrttvhgds` -> Database -> Backups** (or run `npx supabase backups list --project-ref egdjnpmoasarrttvhgds` with owner `SUPABASE_ACCESS_TOKEN`).
   - Record the latest completed cloud backup timestamp/ID and PITR recovery window in the release ticket.
2. **Dedicated Google Drive Backup Folder (`DRIVE_BACKUP_FOLDER_ID`):**
   - Confirm `DRIVE_BACKUP_FOLDER_ID` points to a dedicated, restricted backup folder **outside** the 93 operational folders.
   - Verify folder ACLs contain **zero** `type = 'anyone'` public permissions.
   - List existing archives in `DRIVE_BACKUP_FOLDER_ID` for the current cutover baseline (`egdjnpmoasarrttvhgds-precutover-*`). If a checksum- and restore-verified archive already exists for the unchanged pre-cutover state (`117` migrations), **do not create a duplicate** — record its Drive file ID, SHA-256, and restore drill timestamp.

### 2.2 Step 2 — Ephemeral Dump, Encryption, Drive Upload, Readback & Cleanup

Only if no verified current-window encrypted Drive backup exists, run inside a restricted ephemeral workspace (`umask 077`, `mktemp -d`) with an `EXIT` trap that shreds/removes all local temp files even on error. **Never write backups into `C:\`, WSL persistent paths, `$HOME`, or the Git repository.**

```bash
set -euo pipefail
umask 077

export SUPABASE_DB_URL="<PRODUCTION_DIRECT_POSTGRES_URI>"
export DRIVE_BACKUP_FOLDER_ID="<DEDICATED_RESTRICTED_DRIVE_BACKUP_FOLDER_ID>" # Must NOT be any of the 93 operational folders

TMP_BACKUP_DIR="$(mktemp -d)"
cleanup() {
  if [ -d "$TMP_BACKUP_DIR" ]; then
    find "$TMP_BACKUP_DIR" -type f -exec shred -u -n 1 {} \; 2>/dev/null || true
    rm -rf "$TMP_BACKUP_DIR"
  fi
}
trap cleanup EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RAW_SQL="$TMP_BACKUP_DIR/egdjnpmoasarrttvhgds-precutover-${STAMP}.sql"
ENC_FILE="${RAW_SQL}.gpg"
READBACK_FILE="$TMP_BACKUP_DIR/readback-${STAMP}.sql.gpg"

# 1. Read-only logical export + pre-cutover ledger count (expect 117)
npx supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --schema public,private,storage \
  --file "$RAW_SQL"

RAW_SHA256="$(sha256sum "$RAW_SQL" | awk '{print $1}')"
MIG_COUNT="$(psql "$SUPABASE_DB_URL" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations;")"
test "$MIG_COUNT" -eq 117

# 2. Encrypt immediately and shred plaintext dump before transfer
gpg --batch --yes --symmetric --cipher-algo AES256 --output "$ENC_FILE" "$RAW_SQL"
shred -u -n 1 "$RAW_SQL" 2>/dev/null || rm -f "$RAW_SQL"
ENC_SHA256="$(sha256sum "$ENC_FILE" | awk '{print $1}')"

# 3. Upload "$ENC_FILE" ONLY to $DRIVE_BACKUP_FOLDER_ID (strictly ACL-checked, no 'anyone' links),
#    download uploaded bytes back into "$READBACK_FILE", and verify exact SHA-256 match
#    (using owner Drive OAuth credentials):
#    READBACK_SHA256="$(sha256sum "$READBACK_FILE" | awk '{print $1}')"
#    test "$ENC_SHA256" = "$READBACK_SHA256"
```

### 2.3 Step 3 — Mandatory Restore Verification Before Marking `PASS`

Before deleting `$READBACK_FILE` (handled automatically on exit), decrypt from `$READBACK_FILE` (proving the Drive-stored copy itself is intact and decryptable) into an **isolated disposable PostgreSQL 17 scratch database** (never Production):

```bash
DECRYPTED_SQL="$TMP_BACKUP_DIR/restore-verify-${STAMP}.sql"
gpg --batch --yes --decrypt --output "$DECRYPTED_SQL" "$READBACK_FILE"

createdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -v ON_ERROR_STOP=1 -f "$DECRYPTED_SQL"

psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -Atc "
  SELECT 'schema_migrations', count(*) FROM supabase_migrations.schema_migrations
  UNION ALL SELECT 'business_users', count(*) FROM public.business_users
  UNION ALL SELECT 'brands', count(*) FROM public.brands
  UNION ALL SELECT 'shifts', count(*) FROM public.shifts
  UNION ALL SELECT 'workforce_payroll_lines', count(*) FROM public.workforce_payroll_lines
  UNION ALL SELECT 'workforce_overtime_requests', count(*) FROM public.workforce_overtime_requests;
"

dropdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill
```

Once `cleanup` runs on exit, verify **zero** backup files remain on `C:\`, WSL, or `$HOME`. Gate status remains **`BLOCKED`** unless:
1. Drive backup file ID, folder ACL check, and readback `ENC_SHA256` match are recorded, **and**
2. Scratch restore from the read-back encrypted copy succeeded cleanly (`ON_ERROR_STOP=1`, `schema_migrations = 117`, table counts verified).

---

## 3. Operational File Backup & Application Rollback Distinction

1. **Google Drive Operational File Integrity (93 Folders — No Structural Changes):**
   - Cutover must leave all **93 agreed Google Drive operational folders** untouched (no folder renames, moves, bulk deletions, or ACL relaxation).
   - Operational continuity relies on Drive's native retention/ACL boundaries and matching metadata rows in Supabase (`stored_files`, `operational_files`, `self_attendance_photo_evidence`).
2. **Vercel Application Rollback (`livestream-ops-demo`):**
   - Previous immutable Production deployments for `https://ops5729.top` remain preserved in Vercel (`vercel ls --prod` / Project Deployments UI).
   - If an application regression occurs post-cutover without destructive DB schema mismatch, roll back the frontend/API layer immediately via Vercel Dashboard Instant Rollback or `vercel rollback <previous-deployment-url>` — do **not** touch the 93 Drive folders or Supabase backup archives for an app-only rollback.

---

## 4. Gate G11: Google Drive Self-Attendance Photo Scope & Verification

### 4.1 Is G11 Required for RC19 W4 Go-Live?

Classification from source and schema:

- **Application layer** (`lib/server/selfAttendancePhotoHandler.ts`): When `FEATURE_SELF_ATTENDANCE_PHOTO !== 'true'`, photo upload / review endpoints return HTTP `503` without affecting legacy report or operational file uploads.
- **Database trigger layer** (`supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql` + C5.15 payroll gates):
  - Trigger `self_attendance_checkin_photo_required` rejects any `public.self_attendance_record` `'check_in'` insert unless a corresponding `self_attendance_photo_evidence` row (`provider = 'google_drive'`) exists.
  - Trigger/guard `rc19_c515_required_payroll_evidence` checks self-attendance photo & review evidence before post-cutover Host/Support payroll approval.
- **Go-Live Decision:** While Production Vercel runs with `FEATURE_SELF_ATTENDANCE_PHOTO=true` and these DB triggers active, **G11 is REQUIRED for full RC19 Production Go-Live** (`BLOCKED` until executed with Production Vercel OAuth credentials).

### 4.2 Owner-Executable Real G11 Verification Command

Export Production Vercel `livestream-ops-demo` Google Drive variables in an interactive owner shell (never commit credentials to Git):

```bash
export GOOGLE_DRIVE_AUTH_MODE="oauth_refresh_token"
export GOOGLE_DRIVE_ROOT_FOLDER_ID="<PRODUCTION_ROOT_FOLDER_ID>"
export GOOGLE_DRIVE_CLIENT_ID="<PRODUCTION_CLIENT_ID>"
export GOOGLE_DRIVE_CLIENT_SECRET="<PRODUCTION_CLIENT_SECRET>"
export GOOGLE_DRIVE_REFRESH_TOKEN="<PRODUCTION_REFRESH_TOKEN>"
export FEATURE_SELF_ATTENDANCE_PHOTO="true"
export FILE_STORAGE_ENABLED="true"

node scripts/rc19-c4-migration-rehearsal/verify-production-drive-g11.mjs
```

### 4.3 What `verify-production-drive-g11.mjs` Verifies (Fail-Closed, Zero Structural Mutation)

1. Fails closed (`exit 2`, `ATTENDANCE_DRIVE_NOT_CONFIGURED`) if any required Drive env var is missing.
2. Authenticates via `oauth_refresh_token` (or `service_account`) and validates root folder metadata (`mimeType = application/vnd.google-apps.folder`, not trashed, `capabilities.canAddChildren = true`).
3. Inspects Google Drive folder ACLs (`drive.permissions.list`) and **fails if any `type = 'anyone'` public link permission exists**.
4. Uploads an isolated ephemeral 1x1 PNG probe without altering the 93-folder structure, reads metadata and bytes back (`alt=media`), verifies MD5/SHA-256 checksum match, and trashes the synthetic probe (`cleanup_trashed = true`).
