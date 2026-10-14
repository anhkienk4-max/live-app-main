create function private.filtered_shift_ids(p_scope text,p_filters jsonb)
returns table(id text,date date,start_time time,status text)
language plpgsql stable security invoker set search_path=''
as $$
declare
  actor text := private.current_business_user_id();
  key text;
  roles text[];
  reg_statuses text[];
  search_text text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_scope not in ('all','open','mine') or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text)>16384 then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  for key in select jsonb_object_keys(p_filters) loop
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds') then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
  end loop;
  foreach key in array array['brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','statuses','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','shiftIds'] loop
    if p_filters ? key and (jsonb_typeof(p_filters->key) is distinct from 'array') then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
    if p_filters ? key and jsonb_array_length(p_filters->key)>50 then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
    if exists(select 1 from jsonb_array_elements(coalesce(p_filters->key,'[]'::jsonb)) value
      where jsonb_typeof(value)<>'string' or length(value#>>'{}')>128) then
      raise exception using errcode='22023',message='LIST_FILTER_INVALID';
    end if;
  end loop;
  if (p_filters ? 'hasImportedStaffing' and jsonb_typeof(p_filters->'hasImportedStaffing')<>'boolean')
    or (p_filters ? 'search' and jsonb_typeof(p_filters->'search')<>'string')
    or (p_filters ? 'descending' and jsonb_typeof(p_filters->'descending')<>'boolean')
    or (p_filters ? 'from' and (jsonb_typeof(p_filters->'from')<>'string' or p_filters->>'from' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'to' and (jsonb_typeof(p_filters->'to')<>'string' or p_filters->>'to' !~ '^\d{4}-\d{2}-\d{2}$'))
    or (p_filters ? 'from' and p_filters ? 'to' and (p_filters->>'from')::date>(p_filters->>'to')::date) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  if length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  roles := array(select jsonb_array_elements_text(coalesce(p_filters->'roles','[]'::jsonb)));
  reg_statuses := array(select jsonb_array_elements_text(coalesce(p_filters->'registrationStatuses','[]'::jsonb)));
  if exists(select 1 from unnest(roles) value where value not in ('host','support','technical'))
    or exists(select 1 from unnest(reg_statuses) value where value not in ('pending','approved','manually_assigned')) then
    raise exception using errcode='22023',message='LIST_FILTER_INVALID';
  end if;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search','')),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  return query
    select s.id,s.date,s.start_time,s.status
    from public.shifts s
    left join public.brands b on b.id=s.brand_id
    left join public.platforms p on p.id=s.platform_id
    where s.deleted_at is null and s.archived_at is null
      and (jsonb_array_length(coalesce(p_filters->'shiftIds','[]'))=0 or s.id in (select jsonb_array_elements_text(p_filters->'shiftIds')))
      and (p_scope<>'open' or (s.status='scheduled' and s.end_at>now()))
      and (not p_filters ? 'from' or s.date >= (p_filters->>'from')::date)
      and (not p_filters ? 'to' or s.date <= (p_filters->>'to')::date)
      and (jsonb_array_length(coalesce(p_filters->'brandIds','[]'))=0 or s.brand_id in (select jsonb_array_elements_text(p_filters->'brandIds')))
      and (jsonb_array_length(coalesce(p_filters->'platformIds','[]'))=0 or s.platform_id in (select jsonb_array_elements_text(p_filters->'platformIds')))
      and (jsonb_array_length(coalesce(p_filters->'campaignIds','[]'))=0 or s.campaign_id in (select jsonb_array_elements_text(p_filters->'campaignIds')))
      and (jsonb_array_length(coalesce(p_filters->'statuses','[]'))=0 or s.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (jsonb_array_length(coalesce(p_filters->'studios','[]'))=0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'studios') studio
        where lower(regexp_replace(btrim(coalesce(s.studio,'')), '\s+', ' ', 'g'))=studio
          or (studio='__unassigned__' and btrim(coalesce(s.studio,''))='')
      ))
      and (search_text='' or lower(concat_ws(' ',b.name,p.name,s.title,s.product_notes,s.studio)) like '%'||search_text||'%' escape E'\\')
      and (jsonb_array_length(coalesce(p_filters->'assignedUserIds','[]'))=0 or exists(
        select 1 from jsonb_array_elements_text(p_filters->'assignedUserIds') staff_id
        where staff_id in (s.host_id,s.support_id,s.technical_id) or exists(
          select 1 from public.shift_registrations r where r.shift_id=s.id and r.user_id=staff_id and r.status in ('approved','manually_assigned')
        )
      ))
      and (jsonb_array_length(coalesce(p_filters->'hostIds','[]'))=0 or s.host_id in (select jsonb_array_elements_text(p_filters->'hostIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and r.operational_role='host' and r.status in ('approved','manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'hostIds'))))
      and (jsonb_array_length(coalesce(p_filters->'supportIds','[]'))=0 or s.support_id in (select jsonb_array_elements_text(p_filters->'supportIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and r.operational_role='support' and r.status in ('approved','manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'supportIds'))))
      and (jsonb_array_length(coalesce(p_filters->'technicalIds','[]'))=0 or s.technical_id in (select jsonb_array_elements_text(p_filters->'technicalIds')) or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and r.operational_role='technical' and r.status in ('approved','manually_assigned') and r.user_id in (select jsonb_array_elements_text(p_filters->'technicalIds'))))
      and (jsonb_array_length(coalesce(p_filters->'operationalRoles','[]'))=0 or exists(
        select 1 from (values ('host',s.required_host_count),('support',s.required_support_count),('technical',s.required_technical_count)) demand(role,n)
        where demand.n>0 and demand.role in (select jsonb_array_elements_text(p_filters->'operationalRoles'))))
      and (jsonb_array_length(coalesce(p_filters->'staffingStates','[]'))=0 or exists(
        select 1 from public.get_shift_staffing_summary(array[s.id]) summary
        having (bool_and(summary.approved>=summary.required) and p_filters->'staffingStates' ? 'fully_staffed')
          or (not bool_and(summary.approved>=summary.required) and p_filters->'staffingStates' ? 'missing_staff')))
      and (jsonb_array_length(coalesce(p_filters->'registrationStates','[]'))=0 or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and r.status::text in (select jsonb_array_elements_text(p_filters->'registrationStates'))))
      and (not coalesce((p_filters->>'hasImportedStaffing')::boolean,false) or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and (r.imported_name is not null or r.source='legacy_assignment')))
      and (p_scope<>'mine' or exists(
        select 1 from public.shift_registrations r where r.shift_id=s.id and r.user_id=actor
          and r.status in ('pending','approved','manually_assigned')
          and (cardinality(roles)=0 or r.operational_role::text=any(roles))
          and (cardinality(reg_statuses)=0 or r.status::text=any(reg_statuses))
      ))
;
end;
$$;
revoke all on function private.filtered_shift_ids(text,jsonb) from public,anon,service_role;
grant execute on function private.filtered_shift_ids(text,jsonb) to authenticated;

-- Read-only, caller-RLS pagination. No existing policy, write RPC or Audit ACL changes.
create function public.get_shift_list_page(
  p_scope text default 'all', p_page integer default 1, p_page_size integer default 20,
  p_filters jsonb default '{}'::jsonb, p_pending_page integer default 1, p_include_live boolean default false
) returns jsonb
language plpgsql stable security invoker set search_path = ''
as $$
declare
  actor text := private.current_business_user_id();
  total bigint;
  safe_page integer;
  ids text[];
  key text;
  result jsonb;
  related jsonb;
  pending_total bigint := 0;
  pending_page integer := 1;
  pending_ids jsonb;
  latest_updates jsonb;
  roles text[];
  reg_statuses text[];
  search_text text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_scope is null or p_scope not in ('all','open','mine')
    or p_page is null or p_page < 1 or p_page > 100000
    or p_page_size is null or p_page_size not in (10,20,50)
    or p_pending_page is null or p_pending_page < 1
    or jsonb_typeof(p_filters) is distinct from 'object'
    or octet_length(p_filters::text) > 16384 then
    raise exception using errcode='22023',message='PAGINATION_INVALID';
  end if;
  roles := array(select jsonb_array_elements_text(coalesce(p_filters->'roles','[]'::jsonb)));
  with matching as materialized (
    select * from private.filtered_shift_ids(p_scope,p_filters)

  ), stats as (
    select count(*) n,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select m.* from matching m
    order by case when p_include_live then case m.status when 'live' then 0 when 'paused' then 1 when 'preparing' then 2 when 'scheduled' then 3 when 'completed' then 4 else 5 end end,
      case when coalesce((p_filters->>'descending')::boolean,false) then m.date end desc,
      case when not coalesce((p_filters->>'descending')::boolean,false) then m.date end,
      case when coalesce((p_filters->>'descending')::boolean,false) then m.start_time end desc,
      case when not coalesce((p_filters->>'descending')::boolean,false) then m.start_time end, m.id
    limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), rows as (
    select s.id, s.date, s.start_time, s.end_time, s.timezone, s.start_at, s.end_at, s.end_date, s.crosses_midnight, s.duration_minutes, s.brand_id, s.execution_source, s.platform_id, s.campaign_id, s.title, s.studio, s.host_id, s.support_id, s.technical_id, s.host_names, s.assistant_names, s.technical_names, s.required_host_count, s.required_support_count, s.required_technical_count, s.registration_locked, s.registration_cutoff_at, s.allow_multi_role, s.import_batch_id, s.status, s.status_mode, s.live_link, s.product_notes, s.updated_by, s.created_at, s.updated_at, s.version, s.deleted_at, s.deleted_by, s.archived_at, s.archived_by, s.deletion_reason, exists(
      select 1 from public.shift_registrations r join public.shifts other_shift on other_shift.id=r.shift_id
      where r.user_id=actor and r.shift_id<>s.id and r.status in ('pending','approved','manually_assigned')
        and other_shift.deleted_at is null and other_shift.archived_at is null
        and other_shift.start_at<s.end_at and other_shift.end_at>s.start_at
    ) as registration_conflict from selected chosen join public.shifts s on s.id=chosen.id
  ) select coalesce(jsonb_agg(to_jsonb(rows) order by
    case when p_include_live then case rows.status when 'live' then 0 when 'paused' then 1 when 'preparing' then 2 when 'scheduled' then 3 when 'completed' then 4 else 5 end end,
    case when coalesce((p_filters->>'descending')::boolean,false) then rows.date end desc,
    case when not coalesce((p_filters->>'descending')::boolean,false) then rows.date end,
    case when coalesce((p_filters->>'descending')::boolean,false) then rows.start_time end desc,
    case when not coalesce((p_filters->>'descending')::boolean,false) then rows.start_time end, rows.id), '[]'::jsonb),
    array_agg(rows.id), (select n from stats), (select page from stats) into result,ids,total,safe_page from rows;
  if total is null then total := 0; safe_page := 1; end if;
  ids := coalesce(ids,array[]::text[]);
  select count(*) into pending_total from public.shift_registrations r
    where r.shift_id=any(ids) and r.status='pending'
      and (cardinality(roles)=0 or r.operational_role::text=any(roles));
  pending_page := least(p_pending_page,greatest(1,ceil(pending_total::numeric/20)::integer));
  with mine as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.user_id=actor
      and r.status in ('pending','approved','manually_assigned')
  ), pending as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.status='pending'
      and (cardinality(roles)=0 or r.operational_role::text=any(roles))
    order by r.requested_at,r.id limit 20 offset (pending_page-1)*20
  ), approved as (
    select r.* from public.shift_registrations r where r.shift_id=any(ids) and r.status in ('approved','manually_assigned')
    order by r.requested_at,r.id limit 150
  ), related_rows as (select * from mine union select * from pending union select * from approved)
  select coalesce(jsonb_agg(to_jsonb(related_rows) order by requested_at,id),'[]'::jsonb) into related from related_rows;
  select coalesce(jsonb_agg(id),'[]'::jsonb) into pending_ids from (select r.id from public.shift_registrations r where r.shift_id=any(ids) and r.status='pending' and (cardinality(roles)=0 or r.operational_role::text=any(roles)) order by r.requested_at,r.id limit 20 offset (pending_page-1)*20) pending;
  if p_include_live then
    select coalesce(jsonb_agg(to_jsonb(latest)),'[]'::jsonb) into latest_updates from (
      select distinct on (u.shift_id) u.* from public.dashboard_updates u
      where u.shift_id=any(ids) and u.deleted_at is null order by u.shift_id,u.time desc,u.id
    ) latest;
  end if;
  return jsonb_build_object('rows',result,'registrations',related,'total',total,'page',safe_page,'pageSize',p_page_size,
    'updates',coalesce(latest_updates,'[]'::jsonb),'pendingIds',pending_ids,'pendingTotal',pending_total,'pendingPage',pending_page,'studios',
    (select coalesce(jsonb_agg(studio),'[]'::jsonb) from (
      select distinct lower(regexp_replace(btrim(coalesce(s.studio,'')), '\s+', ' ', 'g')) studio
      from public.shifts s where s.deleted_at is null and s.archived_at is null and btrim(coalesce(s.studio,''))<>''
      order by studio limit 50
    ) locations));
end;
$$;
revoke all on function public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean) from public,anon,service_role;
grant execute on function public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean) to authenticated;

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

create function public.get_report_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}',p_summary boolean default false)
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
      and (search_text='' or lower(concat_ws(' ',r.id,b.name,p.name,c.name)) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by updated_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(case when p_summary then (
      select jsonb_object_agg(key,value) from jsonb_each(to_jsonb(selected)) where key in (
        'id','shift_id','status','metrics_confirmed','created_at','updated_at','normalized_metrics','platform_metrics',
        'revenue','gmv','orders','viewers','peak_viewer','average_viewer','product_clicks','ctr','cvr','average_order_value','live_duration_minutes','dashboard_platform'
      )
    ) else to_jsonb(selected) end order by updated_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_report_list_page(integer,integer,jsonb,boolean) from public,anon,service_role;
grant execute on function public.get_report_list_page(integer,integer,jsonb,boolean) to authenticated;

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

-- Financial detail is a complete, finite period snapshot, independent of PostgREST max_rows.
create function public.get_payroll_period_snapshot(p_period_id text)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare result jsonb;
begin
  if current_user<>'service_role' then raise exception using errcode='42501',message='PERMISSION_DENIED'; end if;
  if p_period_id is null or length(p_period_id) not between 1 and 120 then raise exception using errcode='22023',message='PERIOD_INVALID'; end if;
  with period as materialized (
    select * from public.workforce_payroll_periods where id=p_period_id
  ), lines as materialized (
    select * from public.workforce_payroll_lines where period_id=p_period_id
  ), audit as materialized (
    select * from public.workforce_payroll_audit where period_id=p_period_id
  )
  select case when exists(select 1 from period) then jsonb_build_object(
    'period',(select to_jsonb(period) from period),
    'lineCount',(select count(*) from lines),'auditCount',(select count(*) from audit),
    'lines',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from lines order by created_at,id limit 3000) selected),
    'audit',(select coalesce(jsonb_agg(to_jsonb(selected) order by created_at,id),'[]'::jsonb) from (select * from audit order by created_at,id limit 3000) selected)
  ) end into result;
  if (result->>'lineCount')::bigint>=3000 or (result->>'auditCount')::bigint>=3000 then
    raise exception using errcode='54000',message='WORKFORCE_PAYROLL_READ_INCOMPLETE';
  end if;
  return result;
end;
$$;
revoke all on function public.get_payroll_period_snapshot(text) from public,anon,authenticated;
grant execute on function public.get_payroll_period_snapshot(text) to service_role;

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

create function public.get_swap_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare actor text:=private.current_business_user_id(); result jsonb; search_text text;
begin
  if actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_page is null or p_page<1 or p_page>100000 or p_page_size is null or p_page_size not in (10,20,50)
    or jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>16384
    or coalesce(p_filters->>'scope','all') not in ('all','mine','forMe')
    or length(coalesce(p_filters->>'search',''))>256 then raise exception using errcode='22023',message='LIST_QUERY_INVALID'; end if;
  if (p_filters ? 'statuses' and (jsonb_typeof(p_filters->'statuses')<>'array' or jsonb_array_length(p_filters->'statuses')>50))
    or (p_filters ? 'roles' and (jsonb_typeof(p_filters->'roles')<>'array' or jsonb_array_length(p_filters->'roles')>3))
    or (p_filters ? 'requesterIds' and (jsonb_typeof(p_filters->'requesterIds')<>'array' or jsonb_array_length(p_filters->'requesterIds')>50)) then raise exception using errcode='22023',message='LIST_FILTER_INVALID'; end if;
  search_text:=replace(replace(replace(lower(coalesce(p_filters->>'search','')),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_');
  with shift_ids as materialized (
    select * from private.filtered_shift_ids('all',p_filters-'scope'-'roles'-'statuses'-'requesterIds'-'search')
  ), directory as materialized (
    select id,full_name from public.get_staff_directory() where search_text<>''
    union select id,full_name from public.business_users where search_text<>''
  ), all_rows as materialized (
    select * from public.swap_requests where deleted_at is null
  ), matching as materialized (
    select sw.* from all_rows sw join shift_ids ids on ids.id=coalesce(nullif(sw.shift_id,''),sw.source_shift_id)
    join public.shifts s on s.id=ids.id
    where (coalesce(p_filters->>'scope','all')='all' or (p_filters->>'scope'='mine' and sw.requester_id=actor) or (p_filters->>'scope'='forMe' and sw.counterpart_id=actor))
      and (jsonb_array_length(coalesce(p_filters->'requesterIds','[]'))=0 or sw.requester_id in (select jsonb_array_elements_text(p_filters->'requesterIds')))
      and (jsonb_array_length(coalesce(p_filters->'roles','[]'))=0 or coalesce(sw.operational_role,case when sw.new_support_id is not null then 'support' when sw.new_technical_id is not null then 'technical' else 'host' end) in (select jsonb_array_elements_text(p_filters->'roles')))
      and (jsonb_array_length(coalesce(p_filters->'statuses','[]'))=0 or sw.status::text in (select jsonb_array_elements_text(p_filters->'statuses')))
      and (search_text='' or lower(concat_ws(' ',sw.id,s.title,sw.reason,
        (select full_name from directory where id=sw.requester_id limit 1),
        (select full_name from directory where id=coalesce(sw.replacement_staff_id,sw.new_host_id,sw.new_support_id,sw.new_technical_id,sw.counterpart_id) limit 1))) like '%'||search_text||'%' escape E'\\')
  ), stats as (
    select count(*) total,least(p_page,greatest(1,ceil(count(*)::numeric/p_page_size)::integer)) page from matching
  ), selected as (
    select * from matching order by created_at desc,id limit p_page_size offset ((select page from stats)-1)*p_page_size
  ), counts as (
    select jsonb_build_object('all',count(*),'mine',count(*) filter(where requester_id=actor),'forMe',count(*) filter(where counterpart_id=actor),
      'pending',count(*) filter(where status='pending'),'accepted',count(*) filter(where status in ('accepted','approved')),
      'completed',count(*) filter(where status='completed'),'rejected',count(*) filter(where status='rejected'),'cancelled',count(*) filter(where status='cancelled')) value from all_rows
  )
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(selected) order by created_at desc,id),'[]'::jsonb),
    'total',(select total from stats),'page',(select page from stats),'pageSize',p_page_size,'counts',(select value from counts)) into result from selected;
  return result;
end;
$$;
revoke all on function public.get_swap_list_page(integer,integer,jsonb) from public,anon,service_role;
grant execute on function public.get_swap_list_page(integer,integer,jsonb) to authenticated;

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
