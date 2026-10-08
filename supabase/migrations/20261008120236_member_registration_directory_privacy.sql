-- Raw records contain reviewer/contact data. Shift readability is not applicant access.
alter policy shift_registrations_scoped_select on public.shift_registrations
using (
  (select private.current_business_user_is_active())
  and (select private.can_read_shift(shift_id))
  and ((select private.is_leader_or_admin()) or user_id = (select private.current_business_user_id()))
);

alter policy business_users_active_directory_select on public.business_users
using (
  (select private.current_business_user_is_active())
  and status = 'active' and account_status = 'active'
  and archived_at is null and deleted_at is null
  and ((select private.is_leader_or_admin()) or id = (select private.current_business_user_id()))
);

-- A directory entry is deliberately not a full business user record.
create or replace function public.get_staff_directory()
returns table(id text, full_name text, avatar_url text, operational_roles text[])
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.current_business_user_id() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return query select u.id, u.full_name, u.avatar_url, u.operational_roles
    from public.business_users as u
    where u.status = 'active' and u.account_status = 'active'
      and u.archived_at is null and u.deleted_at is null
    order by u.full_name, u.id;
end;
$$;
revoke all on function public.get_staff_directory() from public, anon, authenticated;
grant execute on function public.get_staff_directory() to authenticated;

-- Readable shifts expose capacities and approved display names, never applicants/reviewers.
create or replace function public.get_shift_staffing_summary(p_shift_ids text[])
returns table(shift_id text, role text, required integer, approved integer,
  pending integer, remaining integer, approved_staff jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if private.current_business_user_id() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return query
  select s.id, demand.role, demand.required,
    count(r.id) filter (where r.status in ('approved', 'manually_assigned'))::integer,
    count(r.id) filter (where r.status = 'pending')::integer,
    greatest(0, demand.required - (count(r.id) filter (where r.status in ('approved', 'manually_assigned')))::integer),
    coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(u.full_name, r.imported_name),
      'avatar_url', u.avatar_url,
      'imported_only', r.user_id is null
    ) order by r.created_at, r.id) filter (
      where r.status in ('approved', 'manually_assigned')
        and coalesce(u.full_name, r.imported_name) is not null
    ), '[]'::jsonb)
  from public.shifts as s
  cross join lateral (values
    ('host'::text, coalesce(s.required_host_count, 1)),
    ('support'::text, coalesce(s.required_support_count, 1)),
    ('technical'::text, coalesce(s.required_technical_count, 1))
  ) as demand(role, required)
  left join public.shift_registrations as r
    on r.shift_id = s.id and r.operational_role = demand.role
  left join public.business_users as u on u.id = r.user_id
  where s.id = any(p_shift_ids) and private.can_read_shift(s.id)
  group by s.id, demand.role, demand.required
  order by s.id, demand.role;
end;
$$;
revoke all on function public.get_shift_staffing_summary(text[]) from public, anon, authenticated;
grant execute on function public.get_shift_staffing_summary(text[]) to authenticated;

-- Exchange selection needs approved counterpart IDs, not raw registration records.
create or replace function public.get_swap_exchange_candidates(p_shift_id text, p_role text)
returns table(registration_id text, user_id text, full_name text)
language plpgsql stable security definer set search_path = ''
as $$
declare actor_id text := private.current_business_user_id();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not private.can_read_shift(p_shift_id) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return query select r.id, u.id, u.full_name
  from public.shift_registrations as r
  join public.shifts as s on s.id = r.shift_id
  join public.business_users as u on u.id = r.user_id
  where s.id = p_shift_id and s.status = 'scheduled'
    and s.archived_at is null and s.deleted_at is null
    and r.operational_role = p_role and r.status in ('approved', 'manually_assigned')
    and u.id <> actor_id and u.status = 'active' and u.account_status = 'active'
    and u.archived_at is null and u.deleted_at is null
  order by u.full_name, r.id;
end;
$$;
revoke all on function public.get_swap_exchange_candidates(text,text) from public, anon, authenticated;
grant execute on function public.get_swap_exchange_candidates(text,text) to authenticated;
