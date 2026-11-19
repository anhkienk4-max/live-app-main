-- RC19 #77 follow-up. Old additive function was deployed on Staging;
-- keep migration ledger immutable, apply this separate fail-closed patch.
begin;
CREATE OR REPLACE FUNCTION public.get_report_list_with_history(p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  -- RC19_HISTORY_VALIDATE_ALL_FILTERS: validate regardless of whether any
  -- report rows match. Otherwise lazy CTE evaluation can accept unknown keys.
  if (p_filters ? 'search' and jsonb_typeof(p_filters->'search') <> 'string')
    or exists(select 1 from jsonb_array_elements(coalesce(p_filters->'reportStatuses','[]'::jsonb)) v
      where jsonb_typeof(v)<>'string' or length(v#>>'{}')>128)
    or exists(select 1 from jsonb_array_elements(coalesce(p_filters->'metricsStatuses','[]'::jsonb)) v
      where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('confirmed','unconfirmed'))
  then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  -- This call intentionally executes even for an empty report set. It reuses
  -- canonical shift-list key, date, cardinality and type validation with RLS.
  perform 1 from private.filtered_shift_ids('all',
    p_filters-'reportStatuses'-'metricsStatuses'-'search') limit 1;
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
$function$
;
revoke all on function public.get_report_list_with_history(integer,integer,jsonb)
  from public,anon,authenticated;
grant execute on function public.get_report_list_with_history(integer,integer,jsonb)
  to authenticated;
commit;
