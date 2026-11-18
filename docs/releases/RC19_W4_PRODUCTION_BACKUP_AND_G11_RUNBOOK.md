# RC19 W4 Production Backup, Recovery & Google Drive G11 Owner Runbook

**Target Environment:** Supabase Production `egdjnpmoasarrttvhgds` / Vercel `livestream-ops-demo` (`https://ops5729.top`)
**Scope:** Pre-cutover Production safety gates requiring owner credentials (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, encryption passphrase, Google Drive OAuth secrets, and Vercel owner access).
**Status from Non-Production Implementation Lane:** **OWNER-REQUIRED (`BLOCKED` until executed and verified with Production credentials)** — do **NOT** mark Backup or G11 as `PASS` without verified restorable copy / live G11 evidence, do **NOT** modify/delete Production business data, and do **NOT** alter the agreed 93-folder Google Drive operational structure.

---

## 1. Agreed Storage, Backup & Rollback Architecture (3 Separate Layers)

| Layer | System of Record | Backup / Rollback Mechanism | Hard Invariants |
|---|---|---|---|
| **1. Database & Metadata** | **Supabase Production** (`egdjnpmoasarrttvhgds`) — cluster roles + schemas `auth`, `public`, `private`, `storage`, `supabase_migrations` | Supabase automated cloud backups / PITR + **encrypted off-site logical export (roles + schema + table data + migration history + Auth) uploaded to a dedicated, ACL-restricted Google Drive backup folder** | **Zero long-term backups stored on `C:\`, WSL, or `$HOME`.** Ephemeral temp files must be encrypted, uploaded to Drive, readback/checksum-verified, restore-tested on scratch PG 17, and immediately shredded/deleted. |
| **2. Operational Files & Photos** | **Google Drive** — agreed **93 operational folders** | Strict Drive ACL enforcement (no `type = 'anyone'`), Drive revision/trash retention, and metadata cross-checks against Supabase `stored_files`, `operational_files`, `self_attendance_photo_evidence` | Separate from DB backup/export storage (`DRIVE_BACKUP_FOLDER_ID !== GOOGLE_DRIVE_ROOT_FOLDER_ID`). Cutover must **not** reorganize, rename, or alter the 93 operational folders. |
| **3. Application Deployment** | **Vercel** (`livestream-ops-demo` -> `https://ops5729.top`) | **Retain prior immutable Vercel Production deployments** for instant rollback (`vercel rollback` or Vercel Dashboard Instant Rollback) | Do not purge/delete prior Production deployments; rollback switches only the app deployment pointer, independent of DB/Drive backups. |

---

## 2. Automated Tooling vs Manual Owner Execution Split

| Step | Execution Mode | Status in Sandbox | Owner Action Required |
|---|---|---|---|
| Runbook & pre-cutover backup/restore commands | Documented CLI (`supabase`, `pg_dump`, `gpg`, `node` `googleapis`, `psql`) | Syntax-verified locally | Export Production credentials and run from an Owner terminal |
| Supabase Dashboard Cloud Backups / PITR inspection | **Manual UI / Owner CLI** (`npx supabase backups list --remote=egdjnpmoasarrttvhgds`) | **BLOCKED** (no `SUPABASE_ACCESS_TOKEN`) | Inspect latest completed cloud backup & PITR window; reuse if already valid |
| Encrypted DB backup creation + Drive upload + readback | **Automated once Owner exports credentials** (Node `googleapis` + `pg_dump` + `gpg` below) | **BLOCKED** (no Prod DB URI / Drive OAuth) | Provide `DRIVE_BACKUP_FOLDER_ID`, Drive OAuth env vars, `SUPABASE_DB_URL`, and run only if no verified backup exists |
| Scratch PG 17 restore verification of Drive readback | **Semi-automated Owner terminal drill** | **BLOCKED** (requires encrypted Prod export) | Decrypt `$READBACK_FILE` into isolated scratch DB `rc19_w4_prod_restore_drill`, verify counts/roles, then drop DB |
| Google Drive G11 self-attendance photo check | **Automated script** (`verify-production-drive-g11.mjs`) | **Verified Fail-Closed (`BLOCKED` / exit `2`)** | Run `node scripts/rc19-c4-migration-rehearsal/verify-production-drive-g11.mjs` with Production OAuth secrets |
| Vercel deployment retention check | **Manual UI / Owner CLI** (`vercel ls --prod`) | **Owner-Verified Required** | Confirm previous Production deployment remains available for rollback |

---

## 3. Gate G-Backup: Complete Database, Roles, Auth & Migration History Backup

> Reference baseline: [core-v1-backup-restore.md](file:///C:/Users/KienNguyen/Downloads/KIEN%20ADA%20code/OPS%20LIVESTREAM%20PLATFORM/rc19-w4-final-integration/docs/runbooks/core-v1-backup-restore.md). Never mark this gate `PASS` until a restorable copy is actually verified.

### 3.1 Step 1 — Check Existing Valid Cloud & Drive Backups First (Do Not Create Duplicates)

**Stop and reuse existing backups** if both checks below already confirm a valid, verified pre-cutover backup for the current unchanged `117`-migration Production state:

1. **Check Supabase Automated Backups / PITR (Owner Console & CLI):**
   ```bash
   # Requires Owner SUPABASE_ACCESS_TOKEN exported in shell
   npx supabase backups list --remote=egdjnpmoasarrttvhgds
   ```
   Also inspect **Supabase Dashboard -> Project `egdjnpmoasarrttvhgds` -> Database -> Backups** to verify the latest completed cloud backup timestamp and PITR window.
2. **Check Existing Encrypted Backups in `DRIVE_BACKUP_FOLDER_ID`:**
   The Node `googleapis` step in Section 3.2 automatically lists `egdjnpmoasarrttvhgds-precutover-*` files inside `DRIVE_BACKUP_FOLDER_ID` first and **exits cleanly without creating a duplicate** if a pre-cutover backup already exists (unless `FORCE_NEW_BACKUP=true` is explicitly set after verifying existing backups are stale/missing).
3. **Rule:** If a valid cloud backup (Supabase automated/PITR + verified encrypted Drive archive from the unchanged `117`-migration baseline) is already present and restore-verified, **do not run Step 2 to create another backup**.

### 3.2 Step 2 — Ephemeral Complete Dump, Encryption, Real Drive Upload, Readback & Cleanup

Only when Step 1 confirms no verified pre-cutover backup exists for this baseline, run the procedure below inside an ephemeral `0700` directory (`umask 077`, `mktemp -d`) with an `EXIT` trap that shreds and removes all local temp artifacts even on failure. **Never store backup files in `C:\`, WSL persistent directories, `$HOME`, or the Git repository.**

```bash
set -euo pipefail
umask 077

# Owner exports these in memory for this shell only (never save secrets in Git):
#   SUPABASE_DB_URL               (Production direct Postgres URI)
#   BACKUP_GPG_PASSPHRASE         (Strong passphrase stored in Owner password manager)
#   DRIVE_BACKUP_FOLDER_ID        (Dedicated restricted backup folder ID; NEVER one of the 93 operational folders)
#   GOOGLE_DRIVE_ROOT_FOLDER_ID   (93-folder operational root ID, checked only to enforce separation)
#   GOOGLE_DRIVE_CLIENT_ID
#   GOOGLE_DRIVE_CLIENT_SECRET
#   GOOGLE_DRIVE_REFRESH_TOKEN

: "${SUPABASE_DB_URL:?Missing SUPABASE_DB_URL}"
: "${BACKUP_GPG_PASSPHRASE:?Missing BACKUP_GPG_PASSPHRASE}"
: "${DRIVE_BACKUP_FOLDER_ID:?Missing DRIVE_BACKUP_FOLDER_ID}"
: "${GOOGLE_DRIVE_CLIENT_ID:?Missing GOOGLE_DRIVE_CLIENT_ID}"
: "${GOOGLE_DRIVE_CLIENT_SECRET:?Missing GOOGLE_DRIVE_CLIENT_SECRET}"
: "${GOOGLE_DRIVE_REFRESH_TOKEN:?Missing GOOGLE_DRIVE_REFRESH_TOKEN}"

if [ -n "${GOOGLE_DRIVE_ROOT_FOLDER_ID:-}" ] && [ "$DRIVE_BACKUP_FOLDER_ID" = "$GOOGLE_DRIVE_ROOT_FOLDER_ID" ]; then
  echo "ABORT: DRIVE_BACKUP_FOLDER_ID must be strictly separate from GOOGLE_DRIVE_ROOT_FOLDER_ID (93 folders)." >&2
  exit 2
fi

TMP_BACKUP_DIR="$(mktemp -d)"
cleanup() {
  if [ -d "$TMP_BACKUP_DIR" ]; then
    find "$TMP_BACKUP_DIR" -type f -exec shred -u -n 1 {} \; 2>/dev/null || true
    rm -rf "$TMP_BACKUP_DIR"
  fi
}
trap cleanup EXIT

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLES_SQL="$TMP_BACKUP_DIR/roles.sql"
DATA_SQL="$TMP_BACKUP_DIR/database.sql"
TAR_BUNDLE="$TMP_BACKUP_DIR/bundle.tar"
ENC_NAME="egdjnpmoasarrttvhgds-precutover-${STAMP}.tar.gpg"
ENC_FILE="$TMP_BACKUP_DIR/${ENC_NAME}"
READBACK_FILE="$TMP_BACKUP_DIR/readback-${STAMP}.tar.gpg"

# 0. Pre-check existing Drive backup before dumping Production
export DRIVE_BACKUP_FOLDER_ID ENC_NAME FORCE_NEW_BACKUP="${FORCE_NEW_BACKUP:-false}"
node --input-type=module - <<'EOF'
import { google } from 'googleapis'
const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET)
auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })
const folderId = process.env.DRIVE_BACKUP_FOLDER_ID.trim()
const meta = await drive.files.get({
  fileId: folderId,
  fields: 'id,mimeType,trashed,capabilities(canAddChildren)',
  supportsAllDrives: true,
})
if (meta.data.mimeType !== 'application/vnd.google-apps.folder' || meta.data.trashed || !meta.data.capabilities?.canAddChildren) {
  throw new Error('INVALID_BACKUP_FOLDER: not an active writable Google Drive folder')
}
const perms = await drive.permissions.list({ fileId: folderId, fields: 'permissions(id,type,role)', supportsAllDrives: true })
if ((perms.data.permissions ?? []).some((p) => p.type === 'anyone')) {
  throw new Error('UNSAFE_BACKUP_FOLDER_ACL: public anyone permission detected')
}
const existing = await drive.files.list({
  q: `'${folderId}' in parents and name contains 'egdjnpmoasarrttvhgds-precutover-' and trashed = false`,
  fields: 'files(id,name,createdTime,size,sha256Checksum)',
  orderBy: 'createdTime desc',
  pageSize: 5,
  includeItemsFromAllDrives: true,
  supportsAllDrives: true,
})
if ((existing.data.files?.length ?? 0) > 0 && process.env.FORCE_NEW_BACKUP !== 'true') {
  console.error('EXISTING_DRIVE_BACKUP_PRESENT (set FORCE_NEW_BACKUP=true only if invalid/stale):')
  console.error(JSON.stringify(existing.data.files, null, 2))
  process.exit(3)
}
EOF

# 1. Read-only cluster roles + full schema, table data, auth, and supabase_migrations ledger dump
MIG_COUNT="$(psql "$SUPABASE_DB_URL" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations;")"
test "$MIG_COUNT" -eq 117

npx supabase db dump --remote="$SUPABASE_DB_URL" --role-only --file "$ROLES_SQL"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --schema=public \
  --schema=private \
  --schema=storage \
  --schema=auth \
  --schema=supabase_migrations \
  --file="$DATA_SQL"

# 2. Bundle roles + DB dump, encrypt immediately, and shred plaintext artifacts before upload
tar -C "$TMP_BACKUP_DIR" -cf "$TAR_BUNDLE" roles.sql database.sql
shred -u -n 1 "$ROLES_SQL" "$DATA_SQL" 2>/dev/null || rm -f "$ROLES_SQL" "$DATA_SQL"

printf '%s' "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --output "$ENC_FILE" "$TAR_BUNDLE"
shred -u -n 1 "$TAR_BUNDLE" 2>/dev/null || rm -f "$TAR_BUNDLE"
ENC_SHA256="$(sha256sum "$ENC_FILE" | awk '{print $1}')"

# 3. Upload encrypted archive to restricted Google Drive backup folder + readback byte-for-byte SHA-256 verification
export ENC_FILE ENC_SHA256 READBACK_FILE
node --input-type=module - <<'EOF'
import { createHash } from 'node:crypto'
import { createReadStream, writeFileSync } from 'node:fs'
import { google } from 'googleapis'

const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET)
auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
const drive = google.drive({ version: 'v3', auth })
const folderId = process.env.DRIVE_BACKUP_FOLDER_ID.trim()

const up = await drive.files.create({
  requestBody: { name: process.env.ENC_NAME, mimeType: 'application/octet-stream', parents: [folderId] },
  media: { mimeType: 'application/octet-stream', body: createReadStream(process.env.ENC_FILE) },
  fields: 'id,name,size,sha256Checksum',
  supportsAllDrives: true,
})
if (!up.data.id) throw new Error('DRIVE_UPLOAD_FAILED: missing file id')

const rb = await drive.files.get(
  { fileId: up.data.id, alt: 'media', supportsAllDrives: true },
  { responseType: 'arraybuffer' },
)
const readbackBuf = Buffer.from(rb.data)
writeFileSync(process.env.READBACK_FILE, readbackBuf)
const actualSha256 = createHash('sha256').update(readbackBuf).digest('hex')
if (actualSha256 !== process.env.ENC_SHA256) {
  throw new Error(`READBACK_SHA256_MISMATCH expected=${process.env.ENC_SHA256} got=${actualSha256}`)
}
console.log(JSON.stringify({
  status: 'UPLOADED_AND_READBACK_VERIFIED',
  drive_file_id: up.data.id,
  name: up.data.name,
  size: up.data.size,
  sha256: actualSha256,
}, null, 2))
EOF
```

### 3.3 Step 3 — Mandatory Restore Verification Before Deleting `$TMP_BACKUP_DIR`

While still inside the same ephemeral shell (before `trap cleanup EXIT` wipes `$TMP_BACKUP_DIR` and `$READBACK_FILE`), decrypt `$READBACK_FILE` (verifying the remote Google Drive copy itself is restorable) into an **isolated scratch PostgreSQL 17 instance** (e.g. disposable WSL PG 17 port `55449` or temporary Supabase branch — **never Production**):

```bash
RESTORE_DIR="$TMP_BACKUP_DIR/restore"
mkdir -p "$RESTORE_DIR"

printf '%s' "$BACKUP_GPG_PASSPHRASE" | gpg --batch --yes --passphrase-fd 0 \
  --decrypt "$READBACK_FILE" | tar -C "$RESTORE_DIR" -xf -

createdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill

# Ensure required Supabase base roles exist on vanilla scratch PG17 before restoring schemas/data
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'anon','authenticated','service_role','authenticator',
    'supabase_auth_admin','supabase_storage_admin','supabase_admin'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I', r);
    END IF;
  END LOOP;
END $$;
SQL

# Apply exported roles.sql (existing built-in cluster roles emit harmless "already exists" notices)
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -f "$RESTORE_DIR/roles.sql" 2>&1 | grep -v 'already exists' || true
# Restore full schema + table data + auth + supabase_migrations ledger cleanly:
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -v ON_ERROR_STOP=1 -f "$RESTORE_DIR/database.sql"

psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -Atc "
  SELECT 'roles_present', count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin')
  UNION ALL SELECT 'schema_migrations', count(*) FROM supabase_migrations.schema_migrations
  UNION ALL SELECT 'auth_users', count(*) FROM auth.users
  UNION ALL SELECT 'business_users', count(*) FROM public.business_users
  UNION ALL SELECT 'brands', count(*) FROM public.brands
  UNION ALL SELECT 'shifts', count(*) FROM public.shifts
  UNION ALL SELECT 'workforce_payroll_lines', count(*) FROM public.workforce_payroll_lines
  UNION ALL SELECT 'workforce_overtime_requests', count(*) FROM public.workforce_overtime_requests;
"

dropdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill
```

When the shell exits, `cleanup` shreds and removes `$TMP_BACKUP_DIR` automatically (`zero` persistent dump/decrypt files on `C:\`, WSL, or `$HOME`). Gate status remains **`BLOCKED`** unless:
1. Pre-existing or newly uploaded encrypted Drive backup ID + ACL check + readback `ENC_SHA256` verification succeed, **and**
2. Scratch restore from the Drive readback archive succeeds cleanly (`ON_ERROR_STOP=1`, `schema_migrations = 117`, `auth.users` + core public tables + roles verified).

---

## 4. Distinction: Operational Drive Backup vs Application Deployment Rollback

1. **Google Drive Operational File Integrity (93 Folders — No Structural Changes):**
   - Keep all **93 agreed Google Drive operational folders** unchanged (no moves, renames, folder deletions, or public `anyone` ACLs).
   - Operational assets and attendance photos stay synchronized with Supabase metadata tables (`stored_files`, `operational_files`, `self_attendance_photo_evidence`).
2. **Vercel Application Rollback (`livestream-ops-demo`):**
   - Retain all prior immutable Production deployments in Vercel (`vercel ls --prod` or Vercel Project Deployments UI) serving `https://ops5729.top`.
   - For application regressions that do not require reverting database state, execute Vercel Instant Rollback (`vercel rollback <previous-deployment-url>`). Do **not** alter the 93 Drive folders or Supabase backup archives during an app-only rollback.

---

## 5. Gate G11: Google Drive Self-Attendance Photo Scope & Verification

### 5.1 Is G11 Required for RC19 W4 Go-Live?

Classification from source and schema:

- **Application layer** (`lib/server/selfAttendancePhotoHandler.ts`): When `FEATURE_SELF_ATTENDANCE_PHOTO !== 'true'`, photo upload / review endpoints return HTTP `503` without affecting legacy report or operational file uploads.
- **Database trigger layer** (`supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql` + C5.15 payroll gates):
  - Trigger `self_attendance_checkin_photo_required` rejects any `public.self_attendance_record` `'check_in'` insert unless a corresponding `self_attendance_photo_evidence` row (`provider = 'google_drive'`) exists.
  - Trigger/guard `rc19_c515_required_payroll_evidence` checks self-attendance photo & review evidence before post-cutover Host/Support payroll approval.
- **Go-Live Decision:** While Production Vercel runs with `FEATURE_SELF_ATTENDANCE_PHOTO=true` and these DB triggers active, **G11 is REQUIRED for full RC19 Production Go-Live** (`BLOCKED` until executed with Production Vercel OAuth credentials).

### 5.2 Owner-Executable Real G11 Verification Command

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

### 5.3 What `verify-production-drive-g11.mjs` Verifies (Fail-Closed, Zero Structural Mutation)

1. Fails closed (`exit 2`, `ATTENDANCE_DRIVE_NOT_CONFIGURED`) if any required Drive env var is missing.
2. Authenticates via `oauth_refresh_token` (or `service_account`) and validates root folder metadata (`mimeType = application/vnd.google-apps.folder`, not trashed, `capabilities.canAddChildren = true`).
3. Inspects Google Drive folder ACLs (`drive.permissions.list`) and **fails if any `type = 'anyone'` public link permission exists**.
4. Uploads an isolated ephemeral 1x1 PNG probe without altering the 93-folder structure, reads metadata and bytes back (`alt=media`), verifies MD5/SHA-256 checksum match, and trashes the synthetic probe (`cleanup_trashed = true`).
