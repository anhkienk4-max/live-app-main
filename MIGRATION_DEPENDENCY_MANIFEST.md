# RC19 Unified Release — Migration Dependency Manifest

**Document Version:** 1.0.0<br>
**Target Architecture:** PostgreSQL 17 / Supabase<br>
**Environment Targets:** LOCAL / STAGING / PRODUCTION (One-Shot Cutover Only)<br>
**Safety Protocol:** Forward-Fix Disaster Recovery Only (Zero Blanket Archiving)

---

## 1. Migration Order & Dependency Chain

| Sequence | Migration File | Target System | Prerequisite | Irreversible Boundary | Description |
|:---|:---|:---|:---|:---:|:---|
| **01** | `20261102110001_rc19_batch05a_report_storage_expand.sql` | `public.report_images` | Baseline Schema | No | Supersedes archived `20261102110000`; adds storage metadata while retaining the dashboard image public-read path during expand. |
| **02** | `20261102135047_rc19_batch05a3_domain_storage_routes.sql` | `public.storage_routes` | Migration 01 | No | Configures category routing rules, folder mapping, and provider tokens. |
| **03** | `20261102150000_rc19_batch05a4_storage_runtime.sql` | RPC & Triggers | Migration 02 | No | Storage runtime RPCs, security definer guards, access token validation. |
| **04** | `20261102160334_rc19_batch05a41_storage_release_blockers.sql` | Storage ACLs | Migration 03 | No | Ancestor path permission checks, sensitive folder quarantine. |
| **05** | `20261102170608_rc19_batch05a42_registry_and_excel_integrity.sql` | `public.storage_resource_registry` | Migration 04 | No | Resource registry, SHA-256 checksum tracking, export metadata. |
| **06** | `20261102190000_rc19_batch01_1_agency_code.sql` | `public.shifts` | Migration 05 | No | Adds `agency_code` & `execution_source`, enforces Live AI != Internal constraint. |
| **07** | `20261102200000_rc19_batch01_3_shift_identity_index.sql` | `public.shifts` | Migration 06 | **YES** | Creates `normalize_shift_qualifier`, drops legacy slot index, adds `shifts_active_identity_uidx`. |

---

## 2. Irreversible Schema Boundary Notice (Migration 07)

> [!CAUTION]
> **IRREVERSIBLE COMPATIBILITY BOUNDARY:**
> Once parallel livestreams (identical date/time slot, distinct physical studios or campaigns) are created under `shifts_active_identity_uidx`, restoring the legacy slot-only index `shifts_active_slot_uidx` is physically impossible without dropping or altering active business shifts.
>
> **FORBIDDEN PRACTICE:**
> Never attempt to soft-archive active parallel shifts (`UPDATE shifts SET archived_at = now()`) to force a legacy index restoration. Soft-archived shifts disappear from all operational active queries (`where deleted_at is null and archived_at is null`), causing severe silent business data loss across Calendar, Staffing, Attendance, Reports, and Payroll.
>
> **APPROVED DISASTER RECOVERY:**
> Follow the **Forward-Fix / Application Rollback Protocol** (roll back the frontend/API container to a compatible release; retain `shifts_active_identity_uidx` in the database).

---

## 3. Migration Pre-flight Verification Queries

Before applying `20261102200000_rc19_batch01_3_shift_identity_index.sql`, run this query on the target database to ensure zero collision among active shifts:

```sql
SELECT
  brand_id,
  platform_id,
  date,
  start_time,
  end_time,
  coalesce(regexp_replace(lower(btrim(studio)), '\s+', ' ', 'g'), '') as studio_norm,
  coalesce(regexp_replace(lower(btrim(campaign_id)), '\s+', ' ', 'g'), '') as campaign_norm,
  count(*) as active_duplicates
FROM public.shifts
WHERE deleted_at IS NULL AND archived_at IS NULL
GROUP BY
  brand_id,
  platform_id,
  date,
  start_time,
  end_time,
  coalesce(regexp_replace(lower(btrim(studio)), '\s+', ' ', 'g'), ''),
  coalesce(regexp_replace(lower(btrim(campaign_id)), '\s+', ' ', 'g'), '')
HAVING count(*) > 1;
```

**Expected Result:** 0 rows. (If > 0 rows, stop immediately and resolve duplicate identities before running migration).
