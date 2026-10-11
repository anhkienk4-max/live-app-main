-- Explicit manifest only. Preserve Staging create/4arg, patch ONLY the 3arg body.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(hashtextextended('rc16g:shift-rpc-reconciliation',0));
do $patch$
declare
  item record;
  definition text;
  anchor text;
  replacement text;
begin
  for item in select * from (values
    ('public.create_shift(jsonb)','65bfe7dc925fae3364167ef56c896694'),
    ('public.update_shift(text,jsonb,boolean)','6737e74fb449e7745b3847b3f95ec0a0'),
    ('public.update_shift(text,jsonb,boolean,integer)','095d89911f6157a9ce088b9c4da950ed')
  ) expected(signature,digest) loop
    if to_regprocedure(item.signature) is null
      or md5(pg_get_functiondef(to_regprocedure(item.signature))) <> item.digest then
      raise exception 'RC16G_SHIFT_RPC_DEFINITION_DRIFT';
    end if;
    if (select prosecdef and proconfig=array['search_path=""']::text[]
      and pg_get_userbyid(proowner)='postgres'
      and proacl::text=case when item.signature='public.update_shift(text,jsonb,boolean)'
        then '{postgres=X/postgres,service_role=X/postgres}'
        else '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' end
      from pg_proc where oid=to_regprocedure(item.signature)) is not true then
      raise exception 'RC16G_SHIFT_RPC_SECURITY_DRIFT';
    end if;
  end loop;
  definition := pg_get_functiondef('public.update_shift(text,jsonb,boolean)'::regprocedure);
  for anchor,replacement in select * from (values
    (E'''registration_cutoff_at'', ''allow_multi_role''\n',E'''registration_cutoff_at'', ''allow_multi_role'', ''execution_source''\n'),
    (E'  select * into existing_shift\n',
     E'  if p_patch->>''execution_source'' is not null\n    and p_patch->>''execution_source'' not in (''internal'', ''agency'') then\n    raise exception using errcode = ''22023'', message = ''SHIFT_EXECUTION_SOURCE_INVALID'';\n  end if;\n  select * into existing_shift\n'),
    (E'    updated_by = actor_id\n',
     E'    execution_source = case when p_patch ? ''execution_source'' then p_patch->>''execution_source'' else shift.execution_source end,\n    updated_by = actor_id\n')
  ) changes(anchor,replacement) loop
    if (length(definition)-length(replace(definition,anchor,'')))/length(anchor) <> 1 then
      raise exception 'RC16G_SHIFT_RPC_PATCH_ANCHOR_DRIFT';
    end if;
    definition := replace(definition,anchor,replacement);
  end loop;
  execute definition;
end $patch$;
commit;
