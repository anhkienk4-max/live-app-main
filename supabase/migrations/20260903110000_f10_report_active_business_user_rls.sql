-- F10 Patch-1: active canonical business-user boundary for report reads.
-- Keep existing report role/read semantics; inactive or unmapped Auth users
-- must not retain direct table access to report data.

begin;

drop policy if exists reports_active_select on public.reports;
create policy reports_active_select
  on public.reports for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and deleted_at is null
    and archived_at is null
  );

drop policy if exists reports_archived_select on public.reports;
create policy reports_archived_select
  on public.reports for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and (deleted_at is not null or archived_at is not null)
    and (select private.current_system_permission()) = 'admin'
  );

drop policy if exists report_revisions_read on public.report_revisions;
create policy report_revisions_read
  on public.report_revisions for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and exists (
      select 1
      from public.reports as report
      where report.id = report_revisions.report_id
        and (
          (report.deleted_at is null and report.archived_at is null)
          or (select private.current_system_permission()) = 'admin'
        )
    )
  );

drop policy if exists report_images_read on public.report_images;
create policy report_images_read
  on public.report_images for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and exists (
      select 1
      from public.reports as report
      where report.id = report_images.report_id
        and (
          (report.deleted_at is null and report.archived_at is null)
          or (select private.current_system_permission()) = 'admin'
        )
        and report_images.deleted_at is null
    )
  );

drop policy if exists live_report_images_read on public.live_report_images;
create policy live_report_images_read
  on public.live_report_images for select to authenticated
  using (
    (select private.current_business_user_is_active())
    and (
      report_id is null
      or exists (
        select 1
        from public.reports as report
        where report.id = live_report_images.report_id
          and (
            (report.deleted_at is null and report.archived_at is null)
            or (select private.current_system_permission()) = 'admin'
          )
      )
    )
  );

commit;
