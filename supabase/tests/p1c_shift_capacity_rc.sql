-- P1C-B1 RC capacity simulation. Schema/function changes are transaction-local
-- and always rolled back; this does not apply or record the migration.

\set ON_ERROR_STOP on

select current_setting('app.p1b_fixture_mode', true) = 'isolated-test'
  as p1c_fixture_mode_ok
\gset
\if :p1c_fixture_mode_ok
\else
  \echo 'p1c_shift_capacity_rc.sql requires app.p1b_fixture_mode=isolated-test'
  select 1 / 0;
\endif

begin;

alter table public.shifts
  drop constraint shifts_required_host_count_check,
  drop constraint shifts_required_support_count_check,
  drop constraint shifts_required_technical_count_check,
  add constraint shifts_required_host_count_check check (required_host_count between 0 and 100),
  add constraint shifts_required_support_count_check check (required_support_count between 0 and 100),
  add constraint shifts_required_technical_count_check check (required_technical_count between 0 and 100);

create or replace function private.normalize_shift_capacity(p_value text, p_default smallint)
returns smallint
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  parsed numeric;
begin
  if p_value is null or btrim(p_value) = '' then
    return p_default;
  end if;
  begin
    parsed := p_value::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end;
  if parsed < 0 or parsed > 100 or trunc(parsed) <> parsed then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end if;
  return parsed::smallint;
end;
$$;

do $$
begin
  if private.normalize_shift_capacity(null, 1::smallint) <> 1
    or private.normalize_shift_capacity('', 1::smallint) <> 1
    or private.normalize_shift_capacity('   ', 1::smallint) <> 1
    or private.normalize_shift_capacity('0', 1::smallint) <> 0
    or private.normalize_shift_capacity('100', 1::smallint) <> 100 then
    raise exception 'P1C capacity normalization contract failed';
  end if;

  begin
    perform private.normalize_shift_capacity('-1', 1::smallint);
    raise exception 'Negative capacity was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'SHIFT_CAPACITY_INVALID' then raise; end if;
  end;

  begin
    perform private.normalize_shift_capacity('1.5', 1::smallint);
    raise exception 'Decimal capacity was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'SHIFT_CAPACITY_INVALID' then raise; end if;
  end;

  begin
    perform private.normalize_shift_capacity('101', 1::smallint);
    raise exception 'Capacity above 100 was accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'SHIFT_CAPACITY_INVALID' then raise; end if;
  end;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select (public.create_shift(jsonb_build_object(
  'date', (current_date + 50)::text,
  'start_time', '10:00',
  'end_time', '12:00',
  'brand_id', 'b1',
  'platform_id', 'p1',
  'title', 'P1C zero-capacity RC',
  'required_host_count', 0,
  'required_support_count', null,
  'required_technical_count', ''
))).id as zero_capacity_shift_id
\gset
select required_host_count = 0
  and required_support_count = 1
  and required_technical_count = 1
  as persisted_capacity_contract_ok
from public.shifts
where id = :'zero_capacity_shift_id'
\gset
select set_config('app.p1c_zero_capacity_shift_id', :'zero_capacity_shift_id', true);

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
do $$
begin
  begin
    perform public.register_for_shift(current_setting('app.p1c_zero_capacity_shift_id'), 'host');
    raise exception 'A zero-capacity role accepted a registration';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'SHIFT_FULL' then raise; end if;
  end;
end;
$$;

rollback;

\if :persisted_capacity_contract_ok
  \echo '[OK] P1C staffing capacity 0..100 RC simulation'
\else
  \echo 'P1C zero/default staffing persistence failed'
  select 1 / 0;
\endif
