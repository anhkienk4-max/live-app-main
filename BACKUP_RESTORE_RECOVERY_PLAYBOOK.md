# RC19 Unified Release — Backup, Restore & Recovery Playbook

**Version:** 1.0.0  
**Target Architecture:** Supabase / PostgreSQL 17  
**Production Host:** `https://ops5729.top`  
**Safety Classification:** MISSION CRITICAL — DATA LOSS PREVENTION

---

## 1. Pre-Cutover Backup Protocol (Mandatory Step 0)

Before executing any database DDL or applying migrations to Production:

### Step 1.1: Physical Database Snapshot
Take an automated Supabase Project Backup and export a full schema + table data dump:

```bash
# Export schema and data for critical operational tables
pg_dump -h db.egdjnpmoasarrttvhgds.supabase.co -U postgres -d postgres \
  --table=public.shifts \
  --table=public.shift_registrations \
  --table=public.reports \
  --table=public.report_images \
  --table=public.workforce_actual_segments \
  --table=public.workforce_rate_cards \
  --table=public.workforce_payroll_periods \
  --table=public.workforce_payroll_lines \
  --table=public.storage_routes \
  --table=public.storage_resource_registry \
  --table=public.audit_logs \
  --format=custom --file=pre_rc19_cutover_backup_$(date +%Y%m%d_%H%M%S).dump
```

### Step 1.2: Checkpoint Record Counts
Log row counts across core tables into verification log:
```sql
SELECT 'shifts' AS table_name, count(*) FROM public.shifts UNION ALL
SELECT 'shift_registrations', count(*) FROM public.shift_registrations UNION ALL
SELECT 'reports', count(*) FROM public.reports UNION ALL
SELECT 'workforce_actual_segments', count(*) FROM public.workforce_actual_segments UNION ALL
SELECT 'workforce_payroll_lines', count(*) FROM public.workforce_payroll_lines;
```

---

## 2. Disaster Recovery Protocol: Forward-Fix vs Application Rollback

### Scenario A: Application Bug Detected (UI or API Error)
- **Action:** Roll back the Vercel deployment to the previous stable release (`dpl_H6YfLQLdMPaUJp8JvjTqeE7n4wmS`).
- **Database Handling:** DO NOT roll back `shifts_active_identity_uidx`. The new index is fully backward-compatible with legacy single-session shifts and protects existing parallel livestreams.
- **Verification:** Confirm all shifts and registrations remain visible in the active calendar.

### Scenario B: Database Migration Stalls on Lock Contention
- **Action:** Migrations are wrapped with `set local lock_timeout = '5s';`. If another transaction holds an exclusive table lock, the migration aborts automatically within 5 seconds without freezing production requests.
- **Remediation:** Inspect active locks (`select pid, query, state from pg_stat_activity where wait_event_type = 'Lock'`), await off-peak window, and re-run.

### Scenario C: Erroneous Historical Import Ingestion
- **Action:** If an erroneous file is uploaded with bad data, perform targeted forward-repair:
  ```sql
  -- Targeted deactivation of only the verified bad batch rows
  UPDATE public.shifts
  SET deleted_at = now(),
      deletion_reason = 'MANUAL_IMPORT_FORWARD_REPAIR'
  WHERE import_batch_id = 'TARGET_BATCH_ID'
    AND id NOT IN (SELECT shift_id FROM public.shift_registrations WHERE status = 'approved')
    AND id NOT IN (SELECT shift_id FROM public.reports);
  ```
- **Rule:** NEVER run bulk archiving (`UPDATE shifts SET archived_at = now()`) across active shifts.

---

## 3. Post-Recovery Verification Checklist

- [ ] All shifts dated in the active window queryable via `deleted_at IS NULL AND archived_at IS NULL`.
- [ ] No foreign key joins broken between `shifts` and `shift_registrations`.
- [ ] No reports orphaned from parent `shifts`.
- [ ] Attendance actual segments join cleanly with `shifts` and `workforce_payroll_lines`.
- [ ] Row counts match or exceed Pre-Cutover Step 1.2 baseline.
