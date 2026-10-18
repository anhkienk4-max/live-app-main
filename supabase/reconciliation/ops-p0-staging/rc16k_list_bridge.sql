-- STAGING-ONLY COMPATIBILITY BRIDGE / NO TABLE-DATA MODIFICATION.
-- Source: 20261012171503_rc16k_bounded_shift_lists.sql (canonical main).
-- Target project: live-app-staging (amagnzebmmuqiptmrjmc), NEVER Production.
-- Installs only the four missing read-list functions, not the full RC16K migration.
-- Does not claim full Production schema or Payroll/Storage parity.
-- Verify a matching staging-only schema fingerprint before applying.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $staging_bridge_guard$
begin
  if to_regclass('public.operational_files') is not null
    or to_regclass('public.workforce_payroll_lines') is not null
    or to_regclass('public.operational_storage_routes') is null then
    raise exception 'P0_STAGING_BRIDGE_ENVIRONMENT_GUARD';
  end if;
  if md5(pg_get_functiondef('private.can_read_shift(text)'::regprocedure)) <> '76f4a8e13c72e29f2932044cb9ed51d0'
    or md5(pg_get_functiondef('public.get_shift_staffing_summary(text[])'::regprocedure)) <> '450888d2d1891d247cc832937f5125ea' then
    raise exception 'P0_STAGING_BRIDGE_PREREQUISITE_DRIFT';
  end if;
  if to_regprocedure('private.filtered_shift_ids(text,jsonb)') is not null
    or to_regprocedure('public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean)') is not null
    or to_regprocedure('public.get_report_list_page(integer,integer,jsonb,boolean)') is not null
    or to_regprocedure('public.get_swap_list_page(integer,integer,jsonb)') is not null then
    raise exception 'P0_STAGING_BRIDGE_ALREADY_PRESENT';
  end if;
end;
$staging_bridge_guard$;

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
