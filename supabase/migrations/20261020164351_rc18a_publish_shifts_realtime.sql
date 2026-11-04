do $migration$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shifts'
  ) then
    alter publication supabase_realtime add table public.shifts;
  end if;
end;
$migration$;
