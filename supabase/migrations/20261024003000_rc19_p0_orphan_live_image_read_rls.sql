-- RC19 P0 #84: Prevent an orphaned live-image record from bypassing
-- per-report RLS. Live-image creation already requires a real report.
-- Preserve read access to authorized linked images, including Admin archive.
begin;

drop policy if exists live_report_images_read on public.live_report_images;
create policy live_report_images_read
  on public.live_report_images for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and report_id is not null
    and exists (
      select 1 from public.reports report
      where report.id = live_report_images.report_id
        and (
          (report.deleted_at is null and report.archived_at is null)
          or (select private.current_system_permission()) = 'admin'
        )
    )
  );

commit;
