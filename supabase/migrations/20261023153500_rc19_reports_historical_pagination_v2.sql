-- RC19 #77: Authorization-preserving history-aware report pagination.
-- Report RLS is the source of truth. Missing/archived shift RLS does not widen
-- shift SELECT; only a scoped six-field historical context may be emitted.
-- This is additive: old list RPC stays untouched until UI/export parity passes.
begin;

create or replace function private.report_historical_staff_filters_match(p_report_id text, p_filters jsonb)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
declare s public.shifts;
begin
  if not private.can_read_report(p_report_id) then return false; end if;
  select shift.* into s from public.reports r
    join public.shifts shift on shift.id=r.shift_id where r.id=p_report_id;
  if not found then return false; end if;
  return (
    (jsonb_array_length(coalesce(p_filters->'hostIds','[]'::jsonb))=0
      or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds'))
      or exists(select 1 from public.shift_registrations reg
        where reg.shift_id=s.id and reg.operational_role='host'
          and reg.status in ('approved','manually_assigned')
          and reg.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
    and (jsonb_array_length(coalesce(p_filters->'supportIds','[]'::jsonb))=0
      or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds'))
      or exists(select 1 from public.shift_registrations reg
        where reg.shift_id=s.id and reg.operational_role='support'
          and reg.status in ('approved','manually_assigned')
          and reg.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
    and (jsonb_array_length(coalesce(p_filters->'technicalIds','[]'::jsonb))=0
      or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))
      or exists(select 1 from public.shift_registrations reg
        where reg.shift_id=s.id and reg.operational_role='technical'
          and reg.status in ('approved','manually_assigned')
          and reg.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
  );
end;
$$;
revoke all on function private.report_historical_staff_filters_match(text,jsonb) from public,anon,authenticated;
grant execute on function private.report_historical_staff_filters_match(text,jsonb) to authenticated;

create or replace function public.get_report_list_with_history(
  p_page integer default 1,
  p_page_size integer default 20,
  p_filters jsonb default '{}'::jsonb
)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb; search_text text;
begin
  if private.current_business_user_id() is null or not private.current_business_user_is_active()
  then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000
    or p_page_size is null or p_page_size not in(10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256
  then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;

  if (p_filters ? 'reportStatuses' and
    (jsonb_typeof(p_filters->'reportStatuses')<>'array'
      or jsonb_array_length(p_filters->'reportStatuses')>50))
    or (p_filters ? 'metricsStatuses' and
    (jsonb_typeof(p_filters->'metricsStatuses')<>'array'
      or jsonb_array_length(p_filters->'metricsStatuses')>2))
  then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  -- Reuse current canonical shift-filter validator and visible-shift RLS.
  -- SECURITY INVOKER means this query only sees rows authorized by report RLS.
  search_text:=replace(replace(replace(lower(coalesce(p_filters->>'search','')),
    chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');

  with eligible_shifts as materialized (
    select id from private.filtered_shift_ids('all',
      p_filters-'reportStatuses'-'metricsStatuses'-'search')
  ), scoped as materialized (
    select r.*,private.report_shift_display_context(r.id) as shift_context,
      exists(select 1 from eligible_shifts v where v.id=r.shift_id) as visible_shift
    from public.reports r
    where r.deleted_at is null and r.archived_at is null
  ), matching as materialized (
    select scoped.* from scoped
    left join public.brands b on b.id=scoped.shift_context->>'brand_id'
    left join public.platforms p on p.id=scoped.shift_context->>'platform_id'
    left join public.campaigns c on c.id=scoped.shift_context->>'campaign_id'
    where scoped.shift_context is not null
      and (scoped.visible_shift or (
        -- Historical records may be listed only if the report itself is RLS
        -- readable. Unsupported historical shift-specific filters fail closed.
        not exists (
          select 1 from jsonb_each(p_filters-'search'-'reportStatuses'-'metricsStatuses'
             -'from'-'to'-'brandIds'-'platformIds'-'campaignIds'
             -'hostIds'-'supportIds'-'technicalIds') kv
          where case jsonb_typeof(kv.value)
            when 'array' then jsonb_array_length(kv.value)>0
            when 'boolean' then kv.value='true'::jsonb
            when 'string' then kv.value#>>'{}'<>''
            else kv.value is not null and kv.value<>'null'::jsonb end
        )
        and (not p_filters?'from' or (scoped.shift_context->>'date')::date >= (p_filters->>'from')::date)
        and (not p_filters?'to' or (scoped.shift_context->>'date')::date <= (p_filters->>'to')::date)
        and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'::jsonb))=0
          or scoped.shift_context->>'brand_id' in (select jsonb_array_elements_text(p_filters->'brandIds')))
        and (jsonb_array_length(coalesce(p_filters->'platformIds','[]'::jsonb))=0
          or scoped.shift_context->>'platform_id' in (select jsonb_array_elements_text(p_filters->'platformIds')))
        and (jsonb_array_length(coalesce(p_filters->'campaignIds','[]'::jsonb))=0
          or scoped.shift_context->>'campaign_id' in (select jsonb_array_elements_text(p_filters->'campaignIds')))
        and private.report_historical_staff_filters_match(scoped.id,p_filters)
      ))
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'::jsonb))=0
        or scoped.status::text in(select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'::jsonb))=0
        or (case when scoped.metrics_confirmed then 'confirmed' else 'unconfirmed' end)
          in(select jsonb_array_elements_text(p_filters->'metricsStatuses')))
      and (search_text='' or lower(concat_ws(' ',scoped.id,b.name,p.name,c.name))
        like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) as total,
      least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) as page
    from matching
  ), selected as (
    select * from matching
    order by updated_at desc,id
    limit p_page_size offset ((select page from stats)-1)*p_page_size
  )
  select jsonb_build_object(
    'rows',coalesce(jsonb_agg(to_jsonb(selected)-'shift_context'-'visible_shift'
      order by updated_at desc,id),'[]'::jsonb),
    'historicalShiftContexts',coalesce(jsonb_object_agg(selected.id,selected.shift_context)
      filter (where not selected.visible_shift),'{}'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size
  ) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_report_list_with_history(integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.get_report_list_with_history(integer,integer,jsonb) to authenticated;
commit;
