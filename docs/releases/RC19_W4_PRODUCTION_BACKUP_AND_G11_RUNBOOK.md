# RC19 W4 Production Backup, Restore Drill & Google Drive G11 Owner Runbook

**Target Environment:** Supabase Production `egdjnpmoasarrttvhgds` / Vercel `livestream-ops-demo` (`https://ops5729.top`)  
**Scope:** Pre-cutover Production safety gates requiring owner credentials (`SUPABASE_ACCESS_TOKEN` / Production DB URI + Google Drive OAuth secrets).  
**Status from Non-Production Implementation Lane:** **OWNER-REQUIRED (`BLOCKED` in local sandbox without Production credentials)** — do **NOT** extrapolate local PostgreSQL 17 dumps as Production off-site backup proof.

---

## 1. Gate G-Backup: Genuine Off-Site / Cloud Backup & Non-Destructive Restore Drill

> Reference baseline: [core-v1-backup-restore.md](file:///C:/Users/KienNguyen/Downloads/KIEN ADA code/OPS LIVESTREAM PLATFORM/rc19-w4-final-integration/docs/runbooks/core-v1-backup-restore.md). Note that logical `supabase db dump` captures schemas `public,private,storage` (tables/metadata) and does **NOT** replace provider-managed daily backups, PITR, or Storage object binaries.

### 1.1 Verify Supabase Cloud Backups / PITR (Owner Console or CLI)

1. Open **Supabase Dashboard -> Project `egdjnpmoasarrttvhgds` -> Database -> Backups**:
   - Confirm recent daily backup timestamp and status (`Completed`).
   - Confirm PITR status / earliest-to-latest recovery window (if enabled on the project tier).
   - Capture the latest backup ID / timestamp into the cutover ticket.
2. Optionally inspect backups via authenticated CLI (`SUPABASE_ACCESS_TOKEN` set by owner):
   ```bash
   npx supabase backups list --project-ref egdjnpmoasarrttvhgds
   ```

### 1.2 Take Pre-Cutover Logical Off-Site Dump (Owner Terminal)

Export to an encrypted local/cloud backup location **outside** the repository working tree:

```bash
export SUPABASE_DB_URL="<PRODUCTION_DIRECT_POSTGRES_URI>"
mkdir -p "$HOME/rc19-w4-prod-backups"

# Schema + data logical dump for public, private, storage metadata (read-only against Prod)
npx supabase db dump \
  --db-url "$SUPABASE_DB_URL" \
  --schema public,private,storage \
  --file "$HOME/rc19-w4-prod-backups/egdjnpmoasarrttvhgds-precutover-$(date -u +%Y%m%dT%H%M%SZ).sql"

# Record SHA-256 and exact 117-row schema_migrations ledger snapshot
sha256sum "$HOME/rc19-w4-prod-backups/"*.sql
psql "$SUPABASE_DB_URL" -Atc "SELECT count(*) FROM supabase_migrations.schema_migrations;"
```

Expected pre-cutover count: `117`.

### 1.3 Non-Destructive Restore Verification into Isolated Scratch PostgreSQL 17

Never restore into Production. Load the pre-cutover dump into a scratch/disposable PG 17 instance (such as WSL PostgreSQL 17 on port `55449` or a Supabase Branch) and assert core invariants:

```bash
createdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill
psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -v ON_ERROR_STOP=1 \
  -f "$HOME/rc19-w4-prod-backups/<DUMP_FILE>.sql"

psql -h 127.0.0.1 -p 55449 -U postgres -d rc19_w4_prod_restore_drill -Atc "
  SELECT 'profiles', count(*) FROM public.profiles
  UNION ALL SELECT 'brands', count(*) FROM public.brands
  UNION ALL SELECT 'live_shifts', count(*) FROM public.live_shifts
  UNION ALL SELECT 'payroll_lines', count(*) FROM public.payroll_lines
  UNION ALL SELECT 'workforce_overtime_requests', count(*) FROM public.workforce_overtime_requests;
"
```

Drop the scratch restore database immediately when verification passes (`dropdb -h 127.0.0.1 -p 55449 -U postgres rc19_w4_prod_restore_drill`).

---

## 2. Gate G11: Google Drive Self-Attendance Photo Scope & Verification

### 2.1 Is G11 Required for RC19 W4 Go-Live?

Let's classify `FEATURE_SELF_ATTENDANCE_PHOTO` cleanly from source and schema:

- **Application layer** (`lib/server/selfAttendancePhotoHandler.ts`): When `FEATURE_SELF_ATTENDANCE_PHOTO !== 'true'`, photo upload / review endpoints return HTTP `503` without affecting legacy report or operational file flows.
- **Database trigger layer** (`supabase/migrations/20261023144000_rc19_p2_04b_drive_photo_checkin.sql` + C5.15 payroll gates):
  - Trigger `self_attendance_checkin_photo_required` rejects any `public.self_attendance_record` `'check_in'` insert unless a corresponding `self_attendance_photo_evidence` row (`provider = 'google_drive'`) exists.
  - Trigger/guard `rc19_c515_required_payroll_evidence` checks self-attendance photo & review evidence before post-cutover Host/Support payroll approval.
- **Go-Live Decision:** While Production Vercel runs with `FEATURE_SELF_ATTENDANCE_PHOTO=true` and these DB triggers active, **G11 is REQUIRED for full RC19 Production Go-Live** (`BLOCKED` until executed with Production Vercel OAuth credentials). Turning the flag off would block check-ins guarded by `self_attendance_checkin_photo_required` unless intentionally scoped out with trigger remediation.

### 2.2 Owner-Executable Real G11 Verification Command

Pull or export the Production Vercel `livestream-ops-demo` Google Drive environment variables (without committing them anywhere in Git):

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

### 2.3 What the Script Verifies (Fail-Closed)

1. Fails closed (`exit 2`, `ATTENDANCE_DRIVE_NOT_CONFIGURED`) if any required Drive env var is missing.
2. Authenticates via `oauth_refresh_token` (or `service_account`) and checks root folder metadata (`mimeType = application/vnd.google-apps.folder`, not trashed, `capabilities.canAddChildren = true`).
3. Inspects Google Drive folder ACLs (`drive.permissions.list`) and **fails if any `type = 'anyone'` public link permission exists**.
4. Uploads a synthetic 1x1 PNG probe, reads metadata and bytes back (`alt=media`), verifies MD5/SHA-256 checksum match, and trashes the synthetic probe (`cleanup_trashed = true`).
