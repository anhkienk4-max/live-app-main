-- RC19.1B2 - SQL DRAFT ONLY: staging-first, NEVER run directly on Production.
-- Do not install until isolated DB permission / overlap / pagination tests pass.
-- No Vercel Preview deployment is part of this change.
-- Candidate status is advisory; existing write RPCs recheck transactionally.
create or replace function public.search_staffing_candidates(
  p_shift_id text,
  p_role text,
  p_search text default '',
  p_limit integer default 20,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_shift public.shifts;
  normalized_search text;
  result jsonb;
begin
  -- A SECURITY DEFINER read is narrowly scoped to active Leader/Admin business identity.
  perform private.require_shift_actor(true);

  if p_role is null or p_role not in ('host', 'support', 'technical') then
    raise exception using errcode = '22023', message = 'OPERATIONAL_ROLE_INVALID';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
    or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception using errcode = '22023', message = 'PAGINATION_INVALID';
  end if;
  if pg_catalog.length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = '22023', message = 'SEARCH_TOO_LONG';
  end if;

  select * into target_shift
  from public.shifts as s
  where s.id = p_shift_id and s.deleted_at is null and s.archived_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  normalized_search := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));

  -- A real total survives even if the requested page is empty. Use literal substring
  -- semantics: '%' and '_' are text, not SQL LIKE wildcards.
  with eligible as materialized (
    select u.id as user_id, u.full_name
    from public.business_users as u
    where u.status = 'active'
      and u.account_status = 'active'
      and u.archived_at is null
      and u.deleted_at is null
      and u.operational_roles @> array[p_role]::text[]
      and (normalized_search = '' or pg_catalog.strpos(pg_catalog.lower(u.full_name), normalized_search) > 0)
  ), availability_rows as materialized (
    select e.user_id, e.full_name,
      case
        when exists (
          select 1 from public.shift_registrations as same_shift
          where same_shift.shift_id = target_shift.id
            and same_shift.user_id = e.user_id
            and same_shift.status in ('pending', 'approved', 'manually_assigned')
            and (same_shift.operational_role = p_role or not target_shift.allow_multi_role)
        ) then 'already_on_shift'
        when exists (
          select 1
          from public.shift_registrations as r
          join public.shifts as other_shift on other_shift.id = r.shift_id
          where r.user_id = e.user_id
            and r.shift_id <> target_shift.id
            and r.status in ('pending', 'approved', 'manually_assigned')
            and other_shift.deleted_at is null
            and other_shift.archived_at is null
            and other_shift.status <> 'cancelled'
            and other_shift.start_at < target_shift.end_at
            and other_shift.end_at > target_shift.start_at
        ) then 'conflict'
        else 'available'
      end as availability
    from eligible as e
  ), paged as (
    select user_id, full_name, availability
    from availability_rows
    order by pg_catalog.lower(full_name), user_id
    limit p_limit offset p_offset
  )
  select pg_catalog.jsonb_build_object(
    'total', (select count(*) from eligible),
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(paged) order by pg_catalog.lower(paged.full_name), paged.user_id) from paged), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.search_staffing_candidates(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_staffing_candidates(text, text, text, integer, integer)
  to authenticated;
