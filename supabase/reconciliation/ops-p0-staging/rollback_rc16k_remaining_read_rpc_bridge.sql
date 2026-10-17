-- STAGING ONLY: optional rollback for remaining nine non-payroll RC16K RPCs.
-- DO NOT run on Production. Checks exact original canonical definition hashes.
-- Never blindly CASCADE or remove shared tables. Inspect dependencies before using.
do $guard$
begin
  if to_regclass('public.operational_files') is not null
    or to_regclass('public.workforce_payroll_lines') is not null then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_WRONG_ENVIRONMENT';
  end if;
  if md5(pg_get_functiondef('public.get_staff_workload(text[])'::regprocedure)) <> 'db434578ebd8bbc90ce29032de768395' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_staff_workload(text[])';
  end if;
  if md5(pg_get_functiondef('private.rc16k_report_metric(public.reports,text)'::regprocedure)) <> '7ec4b13ae9b8da441e7d58e27a4cc6b5' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: private.rc16k_report_metric(public.reports,text)';
  end if;
  if md5(pg_get_functiondef('public.get_analytics_snapshot(jsonb)'::regprocedure)) <> '2739c085f763048ef562bbeeaf32dff7' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_analytics_snapshot(jsonb)';
  end if;
  if md5(pg_get_functiondef('public.get_registration_review_page(integer,integer,jsonb)'::regprocedure)) <> '6375e693da6cf6933a5561116e9da8e9' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_registration_review_page(integer,integer,jsonb)';
  end if;
  if md5(pg_get_functiondef('public.get_registration_review_context(text)'::regprocedure)) <> 'dc6e293b7d15b74503a0321b57bbe01d' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_registration_review_context(text)';
  end if;
  if md5(pg_get_functiondef('public.get_schedule_change_page(integer,integer,jsonb)'::regprocedure)) <> '33e96b2affb4527c001e6d9f8d244ebc' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_schedule_change_page(integer,integer,jsonb)';
  end if;
  if md5(pg_get_functiondef('public.get_audit_actor_page(integer,integer)'::regprocedure)) <> '5bd9921b89263299e2b314071e0ac92d' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_audit_actor_page(integer,integer)';
  end if;
  if md5(pg_get_functiondef('public.get_live_update_page(text,integer,integer)'::regprocedure)) <> '8582685a603b1ea8bc309f4623bb9225' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_live_update_page(text,integer,integer)';
  end if;
  if md5(pg_get_functiondef('public.get_archived_entity_page(integer,integer)'::regprocedure)) <> '807a8b98ddbd119e6b82df867c325897' then
    raise exception 'P0_STAGING_REMAINING_ROLLBACK_DEFINITION_DRIFT: public.get_archived_entity_page(integer,integer)';
  end if;
end;
$guard$;
drop function public.get_archived_entity_page(integer,integer);
drop function public.get_live_update_page(text,integer,integer);
drop function public.get_audit_actor_page(integer,integer);
drop function public.get_schedule_change_page(integer,integer,jsonb);
drop function public.get_registration_review_context(text);
drop function public.get_registration_review_page(integer,integer,jsonb);
drop function public.get_analytics_snapshot(jsonb);
drop function private.rc16k_report_metric(public.reports,text);
drop function public.get_staff_workload(text[]);
