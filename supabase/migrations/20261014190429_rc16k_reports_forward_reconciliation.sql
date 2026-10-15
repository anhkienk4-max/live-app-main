-- Forward-only reconciliation of the live 20261014173408 SQL, not a ledger repair.
-- Preserve signatures, owners and ACLs; only own active report adds shift read access.
-- reportCandidates is opt-in; Registration/My Shifts role/status semantics stay unchanged.

do $$ begin
  if to_regprocedure('private.can_read_shift(text)') is null
    or to_regprocedure('private.filtered_shift_ids(text,jsonb)') is null
    or to_regprocedure('private.rc16k_report_metric(public.reports,text)') is null
    or to_regprocedure('public.get_report_list_page(integer,integer,jsonb,boolean)') is null then
    raise exception 'RC16K_FORWARD_BASELINE_MISSING';
  end if;
end $$;

CREATE OR REPLACE FUNCTION private.can_read_shift(p_shift_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case
      when (select private.current_system_permission()) = 'admin' then true
      when shift.deleted_at is not null or shift.archived_at is not null then false
      when (select private.current_system_permission()) = 'leader' then true
      else (
        (
          shift.status = 'scheduled'
          and shift.registration_locked = false
          and shift.end_at > statement_timestamp()
        )
        or (select private.current_business_user_id()) in
          (shift.host_id, shift.support_id, shift.technical_id)
        or exists (
          select 1
          from public.shift_registrations as registration
          where registration.shift_id = shift.id
            and registration.user_id = (select private.current_business_user_id())
            and registration.status in ('pending', 'approved', 'manually_assigned')
        )
        or exists (
          select 1 from public.reports report where report.shift_id=shift.id
            and report.submitted_by=(select private.current_business_user_id())
            and report.deleted_at is null and report.archived_at is null
        )
      )
    end
    from public.shifts as shift
    where shift.id = p_shift_id
      and (select private.current_business_user_is_active())
  ), false);
$function$
;

create or replace function private.filtered_shift_ids(p_scope text,p_filters jsonb)
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
    if key not in ('search','from','to','brandIds','platformIds','campaignIds','studios','roles','registrationStatuses','reportCandidates','statuses','descending','assignedUserIds','hostIds','supportIds','technicalIds','operationalRoles','staffingStates','registrationStates','hasImportedStaffing','shiftIds') then
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
  if (p_filters ? 'reportCandidates' and jsonb_typeof(p_filters->'reportCandidates')<>'boolean') or (p_filters ? 'hasImportedStaffing' and jsonb_typeof(p_filters->'hasImportedStaffing')<>'boolean')
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
      ) or (coalesce((p_filters->>'reportCandidates')::boolean,false) and cardinality(roles)=0 and cardinality(reg_statuses)=0 and (
        actor in (s.host_id,s.support_id,s.technical_id)
        or exists(select 1 from public.reports rep where rep.shift_id=s.id and rep.submitted_by=actor and rep.deleted_at is null and rep.archived_at is null))))
;
end;
$$;

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
