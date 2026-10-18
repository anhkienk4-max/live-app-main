-- STAGING ONLY: remaining nine non-payroll, read-only RC16K functions.
-- Purpose: enable complete Calendar/Staff/Review/History/Analytics API UAT.
-- Source: canonical supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql.
-- Does NOT include sensitive payroll period snapshot RPC, table DDL or data seeds.
-- Production must NOT run this bridge; Production already has these definitions.
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $guard$
begin
  if to_regclass('public.operational_files') is not null
    or to_regclass('public.workforce_payroll_lines') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_WRONG_ENVIRONMENT';
  end if;
  if md5(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure)) <> 'bdb629b93dfa26cc9d6c234a1e875581'
    or md5(pg_get_functiondef('public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean)'::regprocedure)) <> 'a87046c601b7591d584fd494b8d84913' then
    raise exception 'P0_STAGING_REMAINING_RPC_PREVIOUS_BRIDGE_DRIFT';
  end if;
  if to_regprocedure('public.get_staff_workload(text[])') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_staff_workload(text[])';
  end if;
  if to_regprocedure('private.rc16k_report_metric(public.reports,text)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: private.rc16k_report_metric(public.reports,text)';
  end if;
  if to_regprocedure('public.get_analytics_snapshot(jsonb)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_analytics_snapshot(jsonb)';
  end if;
  if to_regprocedure('public.get_registration_review_page(integer,integer,jsonb)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_registration_review_page(integer,integer,jsonb)';
  end if;
  if to_regprocedure('public.get_registration_review_context(text)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_registration_review_context(text)';
  end if;
  if to_regprocedure('public.get_schedule_change_page(integer,integer,jsonb)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_schedule_change_page(integer,integer,jsonb)';
  end if;
  if to_regprocedure('public.get_audit_actor_page(integer,integer)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_audit_actor_page(integer,integer)';
  end if;
  if to_regprocedure('public.get_live_update_page(text,integer,integer)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_live_update_page(text,integer,integer)';
  end if;
  if to_regprocedure('public.get_archived_entity_page(integer,integer)') is not null then
    raise exception 'P0_STAGING_REMAINING_RPC_ALREADY_PRESENT: public.get_archived_entity_page(integer,integer)';
  end if;
end;
$guard$;

create function public.get_staff_workload(p_staff_ids text[])
returns table(staff_id text, role text, shift_count bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_staff_ids is null or cardinality(p_staff_ids)>50 then
    raise exception using errcode='22023',message='STAFF_PAGE_INVALID';
  end if;
  return query
  select u.id, r.role, count(distinct s.id)
  from public.business_users u cross join (values ('host'),('support'),('technical')) r(role)
  left join public.shifts s on s.deleted_at is null and s.archived_at is null
    and (case r.role when 'host' then s.host_id when 'support' then s.support_id else s.technical_id end=u.id
      or exists(select 1 from public.shift_registrations registration where registration.shift_id=s.id
        and registration.user_id=u.id and registration.operational_role::text=r.role
        and registration.status in ('approved','manually_assigned')))
  where u.id=any(p_staff_ids)
  group by u.id,r.role;
end;
$$;
revoke all on function public.get_staff_workload(text[]) from public,anon,service_role;
grant execute on function public.get_staff_workload(text[]) to authenticated;

create function private.rc16k_report_metric(r public.reports,k text)
returns numeric language plpgsql immutable security invoker set search_path=''
as $$
begin
  if jsonb_typeof(r.normalized_metrics->k)='number' then return (r.normalized_metrics->>k)::numeric; end if;
  if jsonb_typeof(r.platform_metrics->k)='number' then return (r.platform_metrics->>k)::numeric; end if;
  if k='revenue' then
    if jsonb_typeof(r.platform_metrics->'sales')='number' then return (r.platform_metrics->>'sales')::numeric; end if;
    return r.revenue;
  end if;
  if k='gmv' then return r.gmv; end if;
  if k='orders' then return r.orders; end if;
  if k='engaged_viewers' then return coalesce(r.viewers,r.average_viewer); end if;
  if k='product_clicks' then return r.product_clicks; end if;
  if k='ctr' then return r.ctr; end if;
  if k='conversion_rate' then return r.cvr; end if;
  if k='live_duration_seconds' then return r.live_duration_minutes*60; end if;
  raise exception using errcode='22023',message='ANALYTICS_METRIC_INVALID';
end;
$$;
revoke all on function private.rc16k_report_metric(public.reports,text) from public,anon,service_role;
grant execute on function private.rc16k_report_metric(public.reports,text) to authenticated;

create function public.get_analytics_snapshot(p_filters jsonb)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare start_date date; end_date date; previous_start date; days integer; filter_key text; result jsonb;
  empty_metrics jsonb:='{"revenue":null,"gmv":null,"orders":null,"viewers":null,"productClicks":null,"ctr":null,"cvr":null,"averageOrderValue":null,"liveDuration":null,"reportCount":0}'::jsonb;
begin
  if private.current_business_user_id() is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or not p_filters ? 'from' or not p_filters ? 'to'
    or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  for filter_key in select jsonb_object_keys(p_filters) loop
    if filter_key not in ('from','to','brandIds','platformIds','campaignIds','hostIds','supportIds','technicalIds') then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
  end loop;
  start_date:=(p_filters->>'from')::date; end_date:=(p_filters->>'to')::date;
  if start_date>end_date then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  days:=end_date-start_date+1; previous_start:=start_date-days;
  with scoped as materialized (
    select s.* from private.filtered_shift_ids('all',jsonb_set(jsonb_set(p_filters,'{from}',to_jsonb(previous_start::text)),'{to}',to_jsonb(end_date::text))) ids
    join public.shifts s on s.id=ids.id
  ), staffed as materialized (
    select s.id shift_id,a.user_id,a.role from scoped s
    cross join lateral (values (s.host_id,'host'),(s.support_id,'support'),(s.technical_id,'technical')) a(user_id,role) where a.user_id is not null
    union
    select s.id,r.user_id,r.operational_role::text from scoped s join public.shift_registrations r on r.shift_id=s.id
      where r.status in ('approved','manually_assigned')
  ), report_values as materialized (
    select r.id,s.id shift_id,s.date,s.brand_id,s.platform_id,s.campaign_id,
      private.rc16k_report_metric(r,'revenue') revenue,private.rc16k_report_metric(r,'gmv') gmv,
      private.rc16k_report_metric(r,'orders') orders,private.rc16k_report_metric(r,'engaged_viewers') viewers,
      private.rc16k_report_metric(r,'product_clicks') clicks,private.rc16k_report_metric(r,'ctr') ctr,
      private.rc16k_report_metric(r,'conversion_rate') cvr,private.rc16k_report_metric(r,'live_duration_seconds') duration
    from public.reports r join scoped s on s.id=r.shift_id
    where r.status='confirmed' and r.metrics_confirmed and r.deleted_at is null and r.archived_at is null
  ), grouped as materialized (
    select g.kind,g.key,sum(v.revenue) revenue,sum(v.gmv) gmv,sum(v.orders) orders,sum(v.viewers) viewers,
      sum(v.clicks) "productClicks",avg(v.ctr) ctr,avg(v.cvr) cvr,
      case when sum(v.orders) filter(where v.revenue is not null and v.orders is not null)>0
        then sum(v.revenue) filter(where v.revenue is not null and v.orders is not null)
          /sum(v.orders) filter(where v.revenue is not null and v.orders is not null) else null end "averageOrderValue",
      sum(v.duration)/60 "liveDuration",count(*) "reportCount"
    from report_values v cross join lateral (values
      ('total',case when v.date>=start_date then 'current' else 'previous' end),
      (case when v.date>=start_date then 'trend' else null end,
        case when days<=31 then v.date::text when days<=120 then date_trunc('week',v.date)::date::text else to_char(v.date,'YYYY-MM') end),
      (case when v.date>=start_date then 'brand' else null end,v.brand_id),
      (case when v.date>=start_date then 'platform' else null end,v.platform_id),
      (case when v.date>=start_date then 'campaign' else null end,v.campaign_id)
    ) g(kind,key) where g.kind is not null group by g.kind,g.key
  ), workload as (
    select st.user_id,count(*) filter(where st.role='host') host,count(*) filter(where st.role='support') support,
      count(*) filter(where st.role='technical') technical from staffed st join scoped s on s.id=st.shift_id
    where s.date>=start_date group by st.user_id
  ), host_performance as (
    select st.user_id,sum(v.revenue) revenue from report_values v join staffed st on st.shift_id=v.shift_id and st.role='host'
    where v.date>=start_date group by st.user_id
  )
  select jsonb_build_object(
    'totals',coalesce((select to_jsonb(g)-'kind'-'key' from grouped g where kind='total' and key='current'),empty_metrics),
    'previous',coalesce((select to_jsonb(g)-'kind'-'key' from grouped g where kind='total' and key='previous'),empty_metrics),
    'trend',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('period',key) order by key) from grouped g where kind='trend'),'[]'::jsonb),
    'brands',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='brand'),'[]'::jsonb),
    'platforms',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='platform'),'[]'::jsonb),
    'campaigns',coalesce((select jsonb_agg((to_jsonb(g)-'kind'-'key')||jsonb_build_object('id',key) order by key) from grouped g where kind='campaign'),'[]'::jsonb),
    'workload',coalesce((select jsonb_agg(to_jsonb(w) order by w.user_id) from workload w),'[]'::jsonb),
    'hostPerformance',coalesce((select jsonb_agg(to_jsonb(h) order by h.user_id) from host_performance h),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_analytics_snapshot(jsonb) from public,anon,service_role;
grant execute on function public.get_analytics_snapshot(jsonb) to authenticated;

create function public.get_registration_review_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb; search_text text; key text;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','statuses','roles') then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  if (p_filters ? 'statuses' and (jsonb_typeof(p_filters->'statuses')<>'array' or jsonb_array_length(p_filters->'statuses')>6))
    or (p_filters ? 'roles' and (jsonb_typeof(p_filters->'roles')<>'array' or jsonb_array_length(p_filters->'roles')>3)) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  search_text:=replace(replace(replace(lower(trim(coalesce(p_filters->>'search',''))),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with all_rows as materialized (
    select r.* from public.shift_registrations r join public.shifts s on s.id=r.shift_id
    where s.deleted_at is null and s.archived_at is null
  ), matching as materialized (
    select r.* from all_rows r join public.shifts s on s.id=r.shift_id
    left join public.business_users u on u.id=r.user_id
    where (jsonb_array_length(coalesce(p_filters->'statuses','[]'))=0 or r.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (jsonb_array_length(coalesce(p_filters->'roles','[]'))=0 or r.operational_role::text in (select jsonb_array_elements_text(p_filters->'roles')))
      and (search_text='' or lower(concat_ws(' ',r.id,r.imported_name,u.full_name,u.email,s.id,s.title)) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by requested_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), counts as (
    select jsonb_build_object('all',count(*),'pending',count(*) filter(where status='pending'),
      'approved',count(*) filter(where status in ('approved','manually_assigned')),
      'rejected',count(*) filter(where status='rejected'),
      'cancelled',count(*) filter(where status in ('cancelled','removed'))) value from all_rows
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by requested_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,'counts',(select value from counts)) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_registration_review_page(integer,integer,jsonb) from public,anon,service_role;
grant execute on function public.get_registration_review_page(integer,integer,jsonb) to authenticated;

create function public.get_registration_review_context(p_registration_id text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare target_user text; target_date date; result jsonb; row_count integer;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  select r.user_id,s.date into target_user,target_date from public.shift_registrations r
    join public.shifts s on s.id=r.shift_id where r.id=p_registration_id and s.deleted_at is null and s.archived_at is null;
  if not found then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  with weekly as materialized (
    select r.*,to_jsonb(s) shift from public.shift_registrations r join public.shifts s on s.id=r.shift_id
    where r.user_id=target_user and r.status in ('approved','manually_assigned')
      and s.date>=date_trunc('week',target_date)::date and s.date<date_trunc('week',target_date)::date+7
      and s.deleted_at is null and s.archived_at is null
    order by s.date,s.id,r.id limit 501
  ) select count(*),jsonb_build_object('registrations',coalesce(jsonb_agg(to_jsonb(weekly)-'shift'),'[]'::jsonb),
    'shifts',coalesce(jsonb_agg(weekly.shift),'[]'::jsonb)) into row_count,result from weekly;
  if row_count>500 then raise exception using errcode='54000',message='REGISTRATION_CONTEXT_TOO_LARGE'; end if;
  return result;
end;
$$;
revoke all on function public.get_registration_review_context(text) from public,anon,service_role;
grant execute on function public.get_registration_review_context(text) to authenticated;

create function public.get_schedule_change_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb; key text;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('from','to','actorIds','actionIds','shiftIds','brandIds','sources') then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  foreach key in array array['actorIds','actionIds','shiftIds','brandIds','sources'] loop
    if p_filters ? key and (jsonb_typeof(p_filters->key)<>'array' or jsonb_array_length(p_filters->key)>50) then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  end loop;
  with matching as materialized (
    select a.id,a.created_at as timestamp,a.actor_business_user_id as actor_id,a.action,a.entity_id as shift_id,
      a.before_data as before,a.after_data as after,a.source,a.reason,a.status
    from public.audit_logs a
    where a.entity_type='shift' and a.module in ('calendar','imports')
      and (not p_filters ? 'from' or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date>=(p_filters->>'from')::date)
      and (not p_filters ? 'to' or (a.created_at at time zone 'Asia/Ho_Chi_Minh')::date<=(p_filters->>'to')::date)
      and (jsonb_array_length(coalesce(p_filters->'actorIds','[]'))=0 or a.actor_business_user_id in (select jsonb_array_elements_text(p_filters->'actorIds')))
      and (jsonb_array_length(coalesce(p_filters->'actionIds','[]'))=0 or a.action in (select jsonb_array_elements_text(p_filters->'actionIds')))
      and (jsonb_array_length(coalesce(p_filters->'shiftIds','[]'))=0 or a.entity_id in (select jsonb_array_elements_text(p_filters->'shiftIds')))
      and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'))=0 or coalesce(a.after_data->>'brand_id',a.before_data->>'brand_id') in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'sources','[]'))=0 or a.source in (select jsonb_array_elements_text(p_filters->'sources')))
  ), stats as (select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching),
  selected as (select * from matching order by timestamp desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size)
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by timestamp desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_schedule_change_page(integer,integer,jsonb) from public,anon,service_role;
grant execute on function public.get_schedule_change_page(integer,integer,jsonb) to authenticated;

create function public.get_audit_actor_page(p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or private.is_leader_or_admin() is distinct from true then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  with actors as materialized (
    select actor_business_user_id id,max(coalesce(actor_name,actor_business_user_id)) name
    from public.audit_logs where actor_business_user_id is not null group by actor_business_user_id
  ), selected as (
    select * from actors order by name,id limit p_page_size offset (p_page-1)*p_page_size
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by name,id),'[]'::jsonb),'total',(select count(*) from actors)) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_audit_actor_page(integer,integer) from public,anon,service_role;
grant execute on function public.get_audit_actor_page(integer,integer) to authenticated;

create function public.get_live_update_page(p_shift_id text,p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or not private.can_read_shift(p_shift_id) then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then
    raise exception using errcode='22023',message='LIST_QUERY_INVALID';
  end if;
  with matching as materialized (
    select * from public.dashboard_updates where shift_id=p_shift_id and deleted_at is null
  ), stats as (
    select count(*) total,max(peak_viewers) peak,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by time desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), recent as (select * from matching order by time desc,id limit 4)
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by time desc,id),'[]'),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,
    'peakViewers',(select peak from stats),'recent',(select coalesce(jsonb_agg(to_jsonb(recent) order by time desc,id),'[]') from recent))
    into result from selected;
  return result;
end;
$$;
revoke all on function public.get_live_update_page(text,integer,integer) from public,anon,service_role;
grant execute on function public.get_live_update_page(text,integer,integer) to authenticated;

create function public.get_archived_entity_page(p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if private.current_business_user_id() is null or private.current_system_permission() is distinct from 'admin' then
    raise exception using errcode='42501',message='PERMISSION_DENIED';
  end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50) then
    raise exception using errcode='22023',message='LIST_QUERY_INVALID';
  end if;
  with archived as materialized (
    select 'shift' entity_type,id entity_id,coalesce(title,date::text||' '||start_time::text) entity_name,
      coalesce(deleted_at,archived_at) archived_at,coalesce(deleted_by,archived_by) archived_by,deletion_reason reason,version
      from public.shifts where deleted_at is not null or archived_at is not null
    union all select 'report',id,'Report · '||shift_id,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.reports where deleted_at is not null or archived_at is not null
    union all select 'brand',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.brands where deleted_at is not null or archived_at is not null
    union all select 'platform',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.platforms where deleted_at is not null or archived_at is not null
    union all select 'campaign',id,name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.campaigns where deleted_at is not null or archived_at is not null
    union all select 'staff',id,full_name,coalesce(deleted_at,archived_at),coalesce(deleted_by,archived_by),deletion_reason,null
      from public.business_users where deleted_at is not null or archived_at is not null
  ), stats as (select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from archived),
  selected as (select * from archived order by archived_at desc,entity_type,entity_id limit p_page_size offset ((select page from stats)-1)*p_page_size)
  select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(selected) order by archived_at desc,entity_type,entity_id),'[]'),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_archived_entity_page(integer,integer) from public,anon,service_role;
grant execute on function public.get_archived_entity_page(integer,integer) to authenticated;
