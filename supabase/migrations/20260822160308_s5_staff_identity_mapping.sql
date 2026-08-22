alter table public.shift_registrations
  add column if not exists imported_name text null,
  add column if not exists match_method text null;

alter table public.shift_registrations
  add constraint shift_registrations_imported_name_not_blank
    check (imported_name is null or btrim(imported_name) <> ''),
  add constraint shift_registrations_match_method_check
    check (match_method is null or match_method in ('exact', 'normalized', 'manual')),
  add constraint shift_registrations_import_match_pair_check
    check (
      (imported_name is null and match_method is null)
      or (imported_name is not null and match_method is not null)
    );

comment on column public.shift_registrations.imported_name is
  'Original display-only schedule label confirmed by a Leader/Admin for this canonical assignment.';
comment on column public.shift_registrations.match_method is
  'How the confirmed imported label was related to the assigned user: exact, normalized, or manual.';

create or replace function private.normalize_staff_identity_name(p_value text)
returns text
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.translate(
        pg_catalog.btrim(p_value),
        'ÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ',
        'AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYDaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    )
  );
$$;

revoke all on function private.normalize_staff_identity_name(text)
from public, anon, authenticated;

create or replace function public.manual_assign_imported_shift_staff(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_imported_name text,
  p_match_method text,
  p_notes text default null
)
returns public.shift_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_user public.business_users;
  created_registration public.shift_registrations;
  exact_name text;
  exact_user_name text;
begin
  actor_id := private.require_shift_actor(true);

  if p_imported_name is null or btrim(p_imported_name) = '' then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_NAME_INVALID';
  end if;
  if p_match_method is null or p_match_method not in ('exact', 'normalized', 'manual') then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_MATCH_METHOD_INVALID';
  end if;

  select * into target_user
  from public.business_users
  where id = p_user_id and status = 'active' and deleted_at is null;
  if target_user.id is null then
    raise exception using errcode = 'P0001', message = 'STAFF_NOT_FOUND';
  end if;

  exact_name := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(p_imported_name), '[[:space:]]+', ' ', 'g')
  );
  exact_user_name := pg_catalog.lower(
    pg_catalog.regexp_replace(pg_catalog.btrim(target_user.full_name), '[[:space:]]+', ' ', 'g')
  );

  if p_match_method = 'exact' and exact_name is distinct from exact_user_name then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_EXACT_MATCH_INVALID';
  end if;
  if p_match_method = 'normalized'
    and private.normalize_staff_identity_name(p_imported_name)
      is distinct from private.normalize_staff_identity_name(target_user.full_name)
  then
    raise exception using errcode = '22023', message = 'IMPORTED_STAFFING_NORMALIZED_MATCH_INVALID';
  end if;

  created_registration := private.insert_manual_shift_assignment(
    p_shift_id,
    p_user_id,
    p_role,
    actor_id,
    p_notes,
    false
  );

  update public.shift_registrations
  set
    imported_name = btrim(p_imported_name),
    match_method = p_match_method
  where id = created_registration.id
  returning * into created_registration;

  perform private.refresh_shift_registration_lock(p_shift_id, false);
  return created_registration;
end;
$$;

revoke all on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text)
to authenticated;
