# RC19 Unified Production Release — One-Shot Cutover Plan

**Release Candidate:** `gemini/rc19-batch01.3.1-unified-release`<br>
**Target URL:** `https://ops5729.top`<br>
**Target Environment:** PRODUCTION (`egdjnpmoasarrttvhgds`)<br>
**Deployment Tooling:** Supabase CLI / Vercel CLI / GitHub Actions<br>
**Cutover Window:** Off-peak operations window (15 minutes maintenance allowance)

---

## Phase Breakdown

### Phase 1: Pre-Flight Verification & Lock
1. **Repository & Provenance Verification:**
   - Verify Git commit SHA matches exact candidate SHA tested in CI.
   - Confirm all local changes committed and pushed.
2. **Environment Variable & Secret Verification:**
   - Verify Production Supabase URL: `https://egdjnpmoasarrttvhgds.supabase.co`.
   - Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SECRET_KEY` present.
   - Verify Google Drive service account / OAuth credentials for live file persistence.
3. **Database Pre-flight Integrity Check:**
   - Run conflict detection query (`MIGRATION_DEPENDENCY_MANIFEST.md`, Section 3).
   - Ensure 0 conflicting active shifts exist.

### Phase 2: Database Backup & Checkpoint
1. Export physical database custom dump (`BACKUP_RESTORE_RECOVERY_PLAYBOOK.md`, Section 1.1).
2. Record baseline row counts across `shifts`, `shift_registrations`, `reports`, `workforce_actual_segments`, `workforce_payroll_lines`.

### Phase 3: Transactional Database Migration Apply
Apply migrations sequentially with `lock_timeout = '5s'`:

> This historical command list is not a current execution allowlist. The C5.3 release sequence is the versioned 20-file manifest; do not apply individual files until its reviewed Production allowlist is explicitly approved.

```bash
# 1. Report storage columns
supabase db query --file supabase/migrations/20261102110001_rc19_batch05a_report_storage_expand.sql
# 2. Storage routes & category mapping
supabase db query --file supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql
# 3. Storage runtime RPCs
supabase db query --file supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql
# 4. Storage release blockers & ACL hardening
supabase db query --file supabase/migrations/20261102160334_rc19_batch05a41_storage_release_blockers.sql
# 5. Registry & Excel integrity
supabase db query --file supabase/migrations/20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql
# 6. Agency code & execution source constraint
supabase db query --file supabase/migrations/20261102190000_rc19_batch01_1_agency_code.sql
# 7. Canonical shift identity unique index (IRREVERSIBLE UPGRADE)
supabase db query --file supabase/migrations/20261102200000_rc19_batch01_3_shift_identity_index.sql
```

### Phase 4: Production Application Deployment
1. Deploy Next.js production build to Vercel production target:
   ```bash
   vercel deploy --prebuilt --prod
   ```
2. Verify production deployment URL responds with HTTP 200 on `https://ops5729.top`.

### Phase 5: Production Post-Deployment Smoke Tests
1. **Auth & Identity:** Login with Admin and Member accounts.
2. **Calendar Loading:** Verify shifts load without blank screen or filter lag.
3. **Parallel Livestream Ingestion:** Test schedule import of 2 parallel sessions (same slot, different studios) -> Both appear cleanly.
4. **Registration Board:** Submit registration -> Approve applicant -> Verify capacity count increment.
5. **Storage Registry:** Verify `/storage/resources` is accessible with active categories.
6. **Report Submission:** Verify photo upload persists to Google Drive without DB base64 bloat.

### Phase 6: Operational Handover & Monitoring
1. Monitor Sentry for 30 minutes for any runtime exceptions.
2. Monitor PostgreSQL connection pool and lock wait events.
