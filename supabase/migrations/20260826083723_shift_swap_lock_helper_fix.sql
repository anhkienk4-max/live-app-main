-- Forward-only fix for the Shift Swap advisory-lock helper.
-- The prior definition referenced an unnamed unnest column ("value"), which
-- fails at runtime before any swap request can be created.

create or replace function private.lock_swap_rows(p_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lock_id text;
begin
  for lock_id in
    select distinct u.value
    from unnest(coalesce(p_ids, '{}'::text[])) as u(value)
    order by u.value
  loop
    perform pg_advisory_xact_lock(hashtextextended(lock_id, 0));
  end loop;
end
$$;

revoke all on function private.lock_swap_rows(text[]) from public, anon, authenticated;
