-- Bounded, read-only Reports Inbox obligations. Table reads remain caller-RLS scoped.
create function public.get_report_obligation_page(
  p_page integer default 1,
  p_page_size integer default 20,
  p_filters jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  actor text := private.current_business_user_id();
  permission text := private.current_system_permission();
  key text;
  search_text text;
  result jsonb;
begin
  if actor is null or permission is null or permission not in ('member', 'leader', 'admin') then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_page is null or p_page < 1 or p_page > 100000
    or p_page_size is null or p_page_size not in (10, 20, 50)
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then
    raise exception using errcode = '22023', message = 'LIST_QUERY_INVALID';
  end if;

  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses') then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  foreach key in array array['brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds','reportStatuses','metricsStatuses'] loop
    if p_filters ? key and jsonb_typeof(p_filters->key) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if p_filters ? key and jsonb_array_length(p_filters->key) > 50 then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(p_filters->key, '[]'::jsonb)) value
      where jsonb_typeof(value) <> 'string' or length(value #>> '{}') not between 1 and 128) then
      raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
    end if;
  end loop;
  if (p_filters ? 'search' and (jsonb_typeof(p_filters->'search') <> 'string' or length(p_filters->>'search') > 256))
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from') <> 'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to') <> 'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date > (p_filters->>'to')::date) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'reportStatuses','[]'::jsonb)) value
    where value not in ('draft','in_review','confirmed','reopened','archived'))
    or exists(select 1 from jsonb_array_elements_text(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) value
    where value not in ('confirmed','unconfirmed')) then
    raise exception using errcode = '22023', message = 'LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search','')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');

  with matching as materialized (
    select s as shift_row, r as report_row
    from public.shifts s
    left join public.reports r on r.shift_id = s.id and r.deleted_at is null and r.archived_at is null
    left join public.brands b on b.id = s.brand_id
    left join public.platforms p on p.id = s.platform_id
    left join public.campaigns c on c.id = s.campaign_id
    where s.deleted_at is null and s.archived_at is null
      and s.status in ('preparing','live','paused','completed')
      and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
      and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date)
      and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'::jsonb)) = 0 or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'platformIds','[]'::jsonb)) = 0 or s.platform_id in (select jsonb_array_elements_text(p_filters->'platformIds')))
      and (jsonb_array_length(coalesce(p_filters->'campaignIds','[]'::jsonb)) = 0 or s.campaign_id in (select jsonb_array_elements_text(p_filters->'campaignIds')))
      and (jsonb_array_length(coalesce(p_filters->'hostIds','[]'::jsonb)) = 0 or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'host' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
      and (jsonb_array_length(coalesce(p_filters->'supportIds','[]'::jsonb)) = 0 or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'support' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
      and (jsonb_array_length(coalesce(p_filters->'technicalIds','[]'::jsonb)) = 0 or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.operational_role = 'technical' and sr.status in ('approved','manually_assigned') and sr.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
      and (search_text = '' or lower(concat_ws(' ', s.id, s.title, b.name, p.name, c.name)) like '%'||search_text||'%' escape E'\\')
      and (permission in ('admin','leader') or s.host_id = actor or s.support_id = actor or s.technical_id = actor
        or exists(select 1 from public.shift_registrations sr where sr.shift_id = s.id and sr.user_id = actor and sr.status in ('approved','manually_assigned'))
        or r.submitted_by = actor)
      and (r.id is null or (not r.metrics_confirmed and r.status not in ('confirmed','archived')))
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'::jsonb)) = 0
        or coalesce(r.status, 'draft') in (select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) = 0
        or (case when coalesce(r.metrics_confirmed, false) then 'confirmed' else 'unconfirmed' end) in (select jsonb_array_elements_text(p_filters->'metricsStatuses')))
  ), stats as (
    select count(*)::bigint as total,
      least(p_page, greatest(1, ceil(count(*)::numeric / p_page_size)::integer)) as page
    from matching
  ), selected as (
    select * from matching
    order by (shift_row).start_at desc nulls last, (shift_row).date desc, (shift_row).start_time desc, (shift_row).id desc
    limit p_page_size offset ((select page from stats) - 1) * p_page_size
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'shift', to_jsonb(shift_row),
      'report', case when report_row is null then null else to_jsonb(report_row) end
    ) order by (shift_row).start_at desc nulls last, (shift_row).date desc, (shift_row).start_time desc, (shift_row).id desc), '[]'::jsonb),
    'total', (select total from stats), 'page', (select page from stats), 'pageSize', p_page_size
  ) into result from selected;
  return result;
end;
$$;

revoke all on function public.get_report_obligation_page(integer, integer, jsonb) from public, anon, service_role;
grant execute on function public.get_report_obligation_page(integer, integer, jsonb) to authenticated;
