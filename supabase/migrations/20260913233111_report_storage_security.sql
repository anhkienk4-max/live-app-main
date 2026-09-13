-- Migration: Report Image Storage Security
-- Sets report-images bucket to private and replaces permissive read policy
-- with authenticated, report-linked access control.
-- Adds idempotency constraints to prevent duplicate image metadata.

-- ============================================================
-- 1. Set bucket to private
-- ============================================================
update storage.buckets
  set public = false
  where id = 'report-images';

-- ============================================================
-- 2. Drop overly-permissive read policy
-- ============================================================
drop policy if exists "report-images-read" on storage.objects;

-- ============================================================
-- 3. Create authenticated read policy with report access check
-- ============================================================
create policy "report-images-authenticated-read"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'report-images'
    and (
      (
        split_part(name, '/', 1) = 'reports'
        and exists (
          select 1
          from public.reports as report
          where report.id = split_part(name, '/', 2)
            and (
              report.deleted_at is null and report.archived_at is null
              or (select private.current_system_permission() = 'admin')
            )
        )
      )
      or
      (
        split_part(name, '/', 1) = 'live'
        and exists (
          select 1
          from public.reports as report
          where report.id = split_part(name, '/', 2)
            and (
              report.deleted_at is null and report.archived_at is null
              or (select private.current_system_permission() = 'admin')
            )
        )
      )
    )
  );

-- ============================================================
-- 4. Add unique constraints for idempotency
-- ============================================================
alter table public.report_images
  drop constraint if exists report_images_dedupe_key;
alter table public.report_images
  add constraint report_images_dedupe_key unique (report_id, storage_path);

alter table public.live_report_images
  drop constraint if exists live_report_images_dedupe_key;
alter table public.live_report_images
  add constraint live_report_images_dedupe_key unique (report_id, file_url);