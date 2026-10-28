-- RC19 #77 privacy hardening.
-- Historical report context is deliberately only six non-staffing fields.
-- Never use history listing as a Boolean oracle for probing RLS-hidden
-- host/support/technical identities by trying guessed staff IDs.
begin;

create or replace function private.report_historical_staff_filters_match(
  p_report_id text, p_filters jsonb
)
returns boolean
language plpgsql stable security definer set search_path=''
as $$
begin
  if not private.current_business_user_is_active()
    or not private.can_read_report(p_report_id)
    or jsonb_typeof(p_filters) is distinct from 'object' then
    return false;
  end if;
  -- A user can always filter currently RLS-visible shifts through the
  -- existing canonical filtered_shift_ids helper. For RLS-HIDDEN shifts,
  -- selected personnel filters cannot be matched without leaking staffing.
  return jsonb_array_length(coalesce(p_filters->'hostIds','[]'::jsonb))=0
    and jsonb_array_length(coalesce(p_filters->'supportIds','[]'::jsonb))=0
    and jsonb_array_length(coalesce(p_filters->'technicalIds','[]'::jsonb))=0;
end;
$$;

revoke all on function private.report_historical_staff_filters_match(text,jsonb)
  from public,anon,authenticated;
grant execute on function private.report_historical_staff_filters_match(text,jsonb)
  to authenticated;

commit;
