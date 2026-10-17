-- EMERGENCY STAGING-ONLY rollback for isolated RC16K four-RPC bridge.
-- Never run on Production. Only use if the functions still match
-- the exact original Production-baseline definitions.
-- It removes only four function definitions, not any table or business row.
do $guard$
begin
  if to_regclass('public.operational_files') is not null
    or to_regclass('public.workforce_payroll_lines') is not null then
    raise exception 'P0_ROLLBACK_WRONG_ENVIRONMENT';
  end if;
  if md5(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure)) <> 'bdb629b93dfa26cc9d6c234a1e875581'
    or md5(pg_get_functiondef('public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean)'::regprocedure)) <> 'a87046c601b7591d584fd494b8d84913'
    or md5(pg_get_functiondef('public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure)) <> '297bca1d0c7faad09cf298b59b42127b'
    or md5(pg_get_functiondef('public.get_swap_list_page(integer,integer,jsonb)'::regprocedure)) <> 'b0db928a367c71ed1da736d8b1b4273d' then
    raise exception 'P0_ROLLBACK_FUNCTION_DEFINITION_DRIFT';
  end if;
end;
$guard$;
drop function public.get_swap_list_page(integer,integer,jsonb);
drop function public.get_report_list_page(integer,integer,jsonb,boolean);
drop function public.get_shift_list_page(text,integer,integer,jsonb,integer,boolean);
drop function private.filtered_shift_ids(text,jsonb);
