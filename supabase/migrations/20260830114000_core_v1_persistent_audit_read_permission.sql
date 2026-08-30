drop policy if exists audit_logs_read on public.audit_logs;

create policy audit_logs_read
  on public.audit_logs for select to authenticated
  using (
    (select private.current_system_permission()) = 'admin'
    or (
      (select private.current_system_permission()) = 'leader'
      and module in ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports')
    )
  );
