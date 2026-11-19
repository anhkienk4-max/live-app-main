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
| Supabase Dashboard Cloud Backups / PITR inspection | **Manual UI / Owner CLI** (`supabase backups list --project-ref egdjnpmoasarrttvhgds`) | **BLOCKED** (no `SUPABASE_ACCESS_TOKEN`) | Inspect latest completed cloud backup & PITR window; reuse if already valid |
| Encrypted DB backup creation + Drive upload + readback | **Automated once Owner exports credentials** (Node `googleapis` + `pg_dump` + `gpg` below) | **BLOCKED** (no Prod DB URI / backup Drive ACL) | Provide `DRIVE_BACKUP_FOLDER_ID` (`05_DATA_EXPORT_BACKUPS`), `SUPABASE_DB_URL`, and run only if no verified backup exists |
| Scratch PG 17 restore verification of Drive readback | **Semi-automated Owner terminal drill** | **BLOCKED** (requires encrypted Prod export) | Decrypt `$READBACK_FILE` into isolated scratch DB `rc19_w4_prod_restore_drill`, verify counts/roles/grants/default ACL, then drop DB |
| Google Drive G11 self-attendance photo check | **Production Admin Diagnostics + Cutover Canary Gate** (`1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P`) | **BLOCKED (`NO_GO_HOLD`)** | Run Admin diagnostics/preflight + effective ACL check pre-cutover; run single approved cutover canary `POST /api/internal/storage-drive-probe` post-deploy (never export long-lived refresh token) |
| Vercel deployment retention check | **Manual UI / Owner CLI** (`vercel ls --prod`) | **Owner-Verified Required** | Confirm previous Production deployment remains available for rollback |

---

## 3. Gate G-Backup: Complete Database, Roles, Auth & Migration History Backup

> Reference baseline: [core-v1-backup-restore.md](file:///C:/Users/KienNguyen/Downloads/KIEN%20ADA%20code/OPS%20LIVESTREAM%20PLATFORM/rc19-w4-final-integration/docs/runbooks/core-v1-backup-restore.md). Never mark this gate `PASS` until a restorable copy is actually verified.

### 3.1 Step 1 — Check Existing Valid Cloud & Drive Backups First (Do Not Create Duplicates)

**Stop and reuse existing backups** if both checks below already confirm a valid, verified pre-cutover backup for the current unchanged `117`-migration Production state:

1. **Check Supabase Automated Backups / PITR (Owner Console & CLI):**
   ```bash
   # Requires Owner SUPABASE_ACCESS_TOKEN exported in shell
   supabase backups list --project-ref egdjnpmoasarrttvhgds
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
# Restore full schema + table data + auth + roles/grants/default ACL + supabase_migrations ledger cleanly:
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -v ON_ERROR_STOP=1 -f "$RESTORE_DIR/database.sql"

psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -Atc "
  SELECT 'roles_present', count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','supabase_auth_admin')
  UNION ALL SELECT 'role_memberships', count(*) FROM pg_auth_members
  UNION ALL SELECT 'default_acl_entries', count(*) FROM pg_default_acl
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
2. Scratch restore from the Drive readback archive succeeds cleanly (`ON_ERROR_STOP=1`, `schema_migrations = 117`, `auth.users`, `pg_auth_members`, `pg_default_acl`, core public tables & roles verified).

### 3.4 Sanitized Zero-PII Schema-Only Production Baseline for Codex Verification

When Codex requires a Production-faithful isolated PostgreSQL `17.6` baseline for full 117 -> 130 migration parity verification (without any secrets or personal/employee rows), the Owner runs `export-sanitized-prod-117-schema-baseline-for-codex.mjs` against read-only `egdjnpmoasarrttvhgds`:
- Exports **only**: sanitized cluster roles (password hashes stripped), `pg_auth_members`, `pg_default_acl`, `--schema-only` definitions (`public`, `private`, `storage`, `auth`, `supabase_migrations`, extensions, 7 event triggers, owners, grants, RLS policies, complete function bodies), and `--data-only --table=supabase_migrations.schema_migrations` (exact 117 receipts, preserving the 9 empty-statement receipts without fabrication).
- Automatically scans output for secrets and business/PII data (`hits=0`) and emits SHA-256 checksums for isolated local PG `17.6` restore only.

---

## 4. Distinction: Operational Drive Backup vs Application Deployment Rollback

1. **Google Drive Operational File Integrity (93 Folders — No Structural Changes):**
   - Keep all **93 agreed Google Drive operational folders** unchanged (no moves, renames, folder deletions, or public `anyone` ACLs).
   - Operational assets and attendance photos stay synchronized with Supabase metadata tables (`stored_files`, `operational_files`, `self_attendance_photo_evidence`).
2. **Vercel Application Rollback (`livestream-ops-demo`):**
   - Retain all prior immutable Production deployments in Vercel (`vercel ls --prod` or Vercel Project Deployments UI) serving `https://ops5729.top` (primary anchor: `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E`).
   - For application regressions that do not require reverting database state, execute Vercel Instant Rollback (`vercel rollback <previous-deployment-url>`). Do **not** alter the 93 Drive folders or Supabase backup archives during an app-only rollback.

---

## 5. Gate G11: Google Drive Self-Attendance Photo Scope & Production-Only Canary Gate

### 5.1 Hard Constraints (Production-Only, Zero Separate Probe Deployments)

While Production Vercel runs with `FEATURE_SELF_ATTENDANCE_PHOTO=true` and database triggers `self_attendance_checkin_photo_required` and `rc19_c515_required_payroll_evidence` active, **G11 is mandatory for RC19 Production Go-Live**:

1. **Use existing Production Vercel configuration (`prj_YSrsxfYK7skM17D3KtiXUGeim2kr`):** Never ask the Owner to reinstall Google OAuth or export long-lived refresh tokens to local files, and never count a personal Google Drive connector run as app OAuth proof.
2. **No Preview, No Staging, No Probe-Only Production Redeploy:** If current Production runtime (`dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E`) has `RC19_STORAGE_DRIVE_PROBE_ENABLED` unset (`404 STORAGE_PROBE_DISABLED`), do **NOT** create a separate temporary Production deployment just to probe.
3. **Separate `PRE-CUTOVER READY` vs `POST-DEPLOY G11 PASS`:**
   - **`PRE-CUTOVER READY` (Required Before Cutover):**
     1. Authenticated Production Admin session calls `GET https://ops5729.top/api/internal/file-provider-diagnostics` and `GET https://ops5729.top/api/workforce/self-attendance-photo/preflight` (read-only; confirms runtime OAuth configuration, `root_readable=true`, `root_can_add_children=true`, and ACL state on Check-in & Check-out folders without mutating ACLs or 93 folders).
     2. Effective Drive ACL & Limited Access verification (`inheritedPermissionsDisabled`, `view`, `permissionDetails`, direct/inherited grants, child file readability across `00_ADA_OPS_PLATFORM -> 08_HR_RESTRICTED_PENDING_ACCESS -> 01_ATTENDANCE_PRIVATE_EVIDENCE -> 01_CHECKIN_PHOTOS & 02_CHECKOUT_PHOTOS`) passes without public content exposure.
     3. Migration Gate (semantic parity + PG17 CLI proof + CI) and Recovery Gate (`egdjnpmoasarrttvhgds` Cloud Backup/PITR + restore proof covering all 117 receipts) both `PASS`.
   - **`POST-DEPLOY G11 PASS` (Single Approved Cutover Window Canary):**
     1. Executed **once** during the Owner-approved Production cutover on `https://ops5729.top` against existing isolated test folder `1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P` (`POST /api/internal/storage-drive-probe {"mode":"upload_readback"}` or coordinated app-identity probe).
     2. Captures all 6 proofs: runtime Drive identity, synthetic upload, provider file ID + parent ID (`1ucgT3BkHtKOqDqkKY5i7Gd5s6akTPH1P`), readback byte-for-byte SHA-256, trash cleanup (`cleanup_status='trashed'`), and Supabase audit receipt (`operational_storage_drive_probe_runs`).
     3. Immediately disable/unset `RC19_STORAGE_DRIVE_PROBE_ENABLED` after canary verification (never leave permanent debug probe enabled). On canary failure, immediately roll back `ops5729.top` to `dpl_GHPSqMNBQ1yMVwGGGkZn1ygd8N3E`.
