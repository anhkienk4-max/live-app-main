-- RC1.6K UX-W2: exact filtered Reports aggregates, plus search by shift title.
-- Preserves caller-RLS; apply after 20261012171503, never independently on Production.
create or replace function public.get_report_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}',p_summary boolean default false)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb; search_text text;
begin
  if private.current_business_user_id() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  if (p_filters ? 'reportStatuses' and (jsonb_typeof(p_filters->'reportStatuses')<>'array' or jsonb_array_length(p_filters->'reportStatuses')>50))
    or (p_filters ? 'metricsStatuses' and (jsonb_typeof(p_filters->'metricsStatuses')<>'array' or jsonb_array_length(p_filters->'metricsStatuses')>2)) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search','')),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with shift_ids as materialized (
    select * from private.filtered_shift_ids('all',p_filters-'reportStatuses'-'metricsStatuses'-'search')
  ), matching as materialized (
    select r.* from public.reports r join shift_ids on shift_ids.id=r.shift_id
    join public.shifts s on s.id=r.shift_id
    left join public.brands b on b.id=s.brand_id left join public.platforms p on p.id=s.platform_id
    left join public.campaigns c on c.id=s.campaign_id
    where r.deleted_at is null and r.archived_at is null
      and (jsonb_array_length(coalesce(p_filters->'reportStatuses','[]'))=0 or r.status::text in (select jsonb_array_elements_text(p_filters->'reportStatuses')))
      and (jsonb_array_length(coalesce(p_filters->'metricsStatuses','[]'))=0 or (case when r.metrics_confirmed then 'confirmed' else 'unconfirmed' end) in (select jsonb_array_elements_text(p_filters->'metricsStatuses')))
      and (search_text='' or lower(concat_ws(' ',r.id,s.title,b.name,p.name,c.name)) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by updated_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), metrics as (
    select count(*) filter(where m.metrics_confirmed is distinct from true) needs_review,
      sum(private.rc16k_report_metric(r,'revenue')) filter(where m.status='confirmed' and m.metrics_confirmed) total_revenue,
      sum(private.rc16k_report_metric(r,'revenue')) filter(where m.status='confirmed' and m.metrics_confirmed and private.rc16k_report_metric(r,'orders') is not null and private.rc16k_report_metric(r,'revenue') is not null) paired_revenue,
      sum(private.rc16k_report_metric(r,'orders')) filter(where m.status='confirmed' and m.metrics_confirmed and private.rc16k_report_metric(r,'orders') is not null and private.rc16k_report_metric(r,'revenue') is not null) paired_orders
    from matching m join public.reports r on r.id=m.id
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(case when p_summary then (
      select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(selected)) where key in (
        'id','shift_id','status','metrics_confirmed','created_at','updated_at','normalized_metrics','platform_metrics',
        'revenue','gmv','orders','viewers','peak_viewer','average_viewer','product_clicks','ctr','cvr','average_order_value','live_duration_minutes','dashboard_platform'
      )
    ) else to_jsonb(selected) end order by updated_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,
    'summary',(select jsonb_build_object('revenue',total_revenue,'aov',case when paired_orders>0 then paired_revenue/paired_orders else null end,'needsReview',needs_review) from metrics)
    ) into result from selected;
  return result;
end;
$$;
