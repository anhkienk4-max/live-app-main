# H4 PROVIDER METADATA CONTRACT REPAIR

**Subject:** Provider Metadata Database Schema & RPC Contract Alignment  
**Affected Tables:** `public.report_images`, `public.live_report_images`  
**Status:** INVALID SQL DRAFT REMOVED & REPLACED WITH ACCURATE FORWARD-ONLY SPECIFICATION  

---

## 1. DEFECT IN PREVIOUS DRAFT (`RC_STORAGE_DATABASE_COMPATIBILITY.md`)

The preliminary draft contained invalid sample SQL:
```sql
-- INVALID DRAFT (REMOVED):
insert into public.live_report_images (
  shift_id, category, file_name, file_url, is_cover, provider, external_file_id, created_by
) values (
  p_data->>'shift_id', ...
)
on conflict (shift_id, category, file_name) do update set ...
```

### Schema Discrepancy Breakdown:
| Field / Constraint in Invalid Draft | Real Production Schema | Severity |
| :--- | :--- | :--- |
| `shift_id` | `report_id` (FK to `reports.id`) | **Fatal Schema Mismatch** |
| `created_by` | `uploaded_by` (FK to `business_users.id`) | **Fatal Schema Mismatch** |
| `on conflict (shift_id, category, file_name)` | Constraint does NOT exist. Actual constraint: `unique (report_id, file_url)` and index `live_report_images_storage_idempotency_key` | **Fatal Constraint Error** |
| `updated_at = now()` | Column `updated_at` does not exist on `live_report_images` | **Column Not Found** |

---

## 2. ACCURATE REAL PRODUCTION SCHEMA

From migrations `20260823000000_p3_report_persistence.sql`, `20260913233111_report_storage_security.sql`, and `20261006160000_rc14_live_image_storage_contract.sql`:
- Table `public.live_report_images` columns:
  - `id` (text / uuid primary key)
  - `report_id` (text not null references `reports(id)`)
  - `category` (text not null check in `'key_visual'`, `'live_session'`, `'other'`)
  - `title`, `description`, `captured_at`, `thumbnail_url`
  - `file_name` (text not null)
  - `file_url` (text not null)
  - `mime_type` (text null)
  - `size_bytes` (bigint null)
  - `sort_order` (integer not null)
  - `is_cover` (boolean not null default false)
  - `uploaded_by` (text references `business_users(id)`)
  - `storage_file_name` (text null)
  - `storage_idempotency_key` (text null)
  - `provider` (text null check in `'google_drive'`, `'onedrive'`)
  - `external_file_id` (text null)
- Unique constraints:
  - `live_report_images_dedupe_key`: `unique (report_id, file_url)`
  - `live_report_images_storage_idempotency_key`: `unique index (report_id, storage_idempotency_key) where storage_idempotency_key is not null`

---

## 3. CORRECTED FORWARD-ONLY COMPATIBILITY MIGRATION DESIGN

The specification in `RC_STORAGE_DATABASE_COMPATIBILITY.md` has been updated with:
```sql
-- Migration: 20261011120000_rc12_provider_metadata_forward_compat.sql
begin;

alter table public.report_images
  add column if not exists provider text null,
  add column if not exists external_file_id text null;

alter table public.live_report_images
  add column if not exists provider text null,
  add column if not exists external_file_id text null;

alter table public.report_images
  drop constraint if exists report_images_file_provider_pair,
  add constraint report_images_file_provider_pair check (
    (provider is null and external_file_id is null)
    or (provider in ('google_drive', 'onedrive') and btrim(external_file_id) <> '')
  );

alter table public.live_report_images
  drop constraint if exists live_report_images_file_provider_pair,
  add constraint live_report_images_file_provider_pair check (
    (provider is null and external_file_id is null)
    or (provider in ('google_drive', 'onedrive') and btrim(external_file_id) <> '')
  );

create or replace function public.upsert_live_report_image_with_provider(p_data jsonb)
returns public.live_report_images
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_image public.live_report_images;
  provider_value text;
  external_id text;
begin
  provider_value := p_data->>'provider';
  external_id := p_data->>'external_file_id';
  if provider_value not in ('google_drive', 'onedrive')
    or external_id is null
    or btrim(external_id) = '' then
    raise exception using errcode = '22023', message = 'REPORT_FILE_PROVIDER_METADATA_INVALID';
  end if;

  created_image := public.upsert_live_report_image(
    p_data - 'provider' - 'external_file_id'
  );

  if created_image.external_file_id is not null then return created_image; end if;

  update public.live_report_images
  set provider = provider_value,
      external_file_id = external_id
  where id = created_image.id
  returning * into created_image;

  return created_image;
end;
$$;

revoke all on function public.upsert_live_report_image_with_provider(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_live_report_image_with_provider(jsonb) to authenticated;

commit;
```

### Contract Guarantees Preserved:
1. **Authorization:** Invocations pass through `private.require_report_actor(false)` inside `upsert_live_report_image`.
2. **RLS & Ownership:** Member ownership is validated (`target_report.submitted_by <> actor_id` check).
3. **Optimistic Concurrency & Locking:** `SELECT ... FOR UPDATE` locks the parent report row.
4. **Idempotency:** Re-uploads with same `storage_idempotency_key` return existing row without duplicate insert or overwriting winner object.
5. **Audit Revisions:** Calls `private.record_report_revision` atomically.
