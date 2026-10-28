-- Reviewable additive replacement for private.filtered_shift_ids.
-- Staffing state is evaluated only for roles selected by operationalRoles.create or replace function private.filtered_shift_ids(p_scope text,p_filters jsonb)
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
        where (jsonb_array_length(coalesce(p_filters->'operationalRoles','[]'))=0
          or summary.role in (select jsonb_array_elements_text(p_filters->'operationalRoles')))
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
