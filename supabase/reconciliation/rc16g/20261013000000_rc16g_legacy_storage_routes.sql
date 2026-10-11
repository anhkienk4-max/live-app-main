-- Explicit reconciliation manifest only: NOT a supabase db push migration.
-- Legacy RC13A only. Modern Production and replays fail closed, never backfill.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.brands, public.operational_storage_routes in access exclusive mode;
do $guard$
declare
  actual jsonb;
begin
  select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
    'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) into actual
    from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
    where a.attrelid='public.operational_storage_routes'::regclass and a.attnum>0 and not a.attisdropped;
  if actual is distinct from '[{"name":"id","type":"text","default":"(gen_random_uuid())::text","notnull":true},{"name":"provider","type":"text","default":null,"notnull":true},{"name":"execution_source","type":"text","default":null,"notnull":true},{"name":"brand_id","type":"text","default":null,"notnull":true},{"name":"platform_id","type":"text","default":null,"notnull":false},{"name":"subbrand_key","type":"text","default":null,"notnull":false},{"name":"storage_profile","type":"text","default":null,"notnull":true},{"name":"root_folder_id","type":"text","default":null,"notnull":true},{"name":"base_folder_id","type":"text","default":null,"notnull":true},{"name":"folder_labels","type":"jsonb","default":"''{}''::jsonb","notnull":true},{"name":"period_naming_style","type":"text","default":null,"notnull":true},{"name":"active","type":"boolean","default":"true","notnull":true},{"name":"created_at","type":"timestamp with time zone","default":"statement_timestamp()","notnull":true},{"name":"updated_at","type":"timestamp with time zone","default":"statement_timestamp()","notnull":true}]'::jsonb then
    raise exception 'RC16G_ROUTE_COLUMN_DRIFT';
  end if;
  select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid)) order by conname)
    into actual from pg_constraint where conrelid='public.operational_storage_routes'::regclass;
  if actual is distinct from (select jsonb_agg(value order by value->>'name')
    from jsonb_array_elements('[{"name":"operational_storage_routes_brand_id_fkey","definition":"FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE RESTRICT"},{"name":"operational_storage_routes_execution_source_check","definition":"CHECK ((execution_source = ANY (ARRAY[''internal''::text, ''agency''::text])))"},{"name":"operational_storage_routes_ids_check","definition":"CHECK (((btrim(root_folder_id) <> ''''::text) AND (btrim(base_folder_id) <> ''''::text)))"},{"name":"operational_storage_routes_labels_check","definition":"CHECK ((jsonb_typeof(folder_labels) = ''object''::text))"},{"name":"operational_storage_routes_period_check","definition":"CHECK ((btrim(period_naming_style) <> ''''::text))"},{"name":"operational_storage_routes_pkey","definition":"PRIMARY KEY (id)"},{"name":"operational_storage_routes_platform_id_fkey","definition":"FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE RESTRICT"},{"name":"operational_storage_routes_profile_check","definition":"CHECK ((storage_profile = ANY (ARRAY[''LEGACY_CATEGORY_PERIOD''::text, ''LEGACY_PLATFORM_CATEGORY_PERIOD''::text, ''LEGACY_PERIOD_CATEGORY''::text, ''LEGACY_SUBBRAND_PERIOD_CATEGORY''::text, ''LEGACY_SUBBRAND_CATEGORY_PERIOD''::text, ''CANONICAL_V1''::text])))"},{"name":"operational_storage_routes_provider_check","definition":"CHECK ((provider = ANY (ARRAY[''google_drive''::text, ''onedrive''::text])))"},{"name":"operational_storage_routes_subbrand_check","definition":"CHECK (((subbrand_key IS NULL) OR (btrim(subbrand_key) <> ''''::text)))"},{"name":"operational_storage_routes_subbrand_profile_check","definition":"CHECK (((storage_profile = ANY (ARRAY[''LEGACY_SUBBRAND_PERIOD_CATEGORY''::text, ''LEGACY_SUBBRAND_CATEGORY_PERIOD''::text])) = (subbrand_key IS NOT NULL)))"}]'::jsonb)) then
    raise exception 'RC16G_ROUTE_CONSTRAINT_DRIFT';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
      where conrelid='public.brands'::regclass and conname='brands_storage_profile_check')
    is distinct from 'CHECK ((storage_profile = ANY (ARRAY[''LEGACY_CATEGORY_PERIOD''::text, ''LEGACY_PLATFORM_CATEGORY_PERIOD''::text, ''LEGACY_PERIOD_CATEGORY''::text, ''LEGACY_SUBBRAND_PERIOD_CATEGORY''::text, ''LEGACY_SUBBRAND_CATEGORY_PERIOD''::text, ''CANONICAL_V1''::text])))' then
    raise exception 'RC16G_BRAND_PROFILE_DRIFT';
  end if;
  if exists (select 1 from pg_attribute where attrelid='public.operational_storage_routes'::regclass
      and attnum>0 and not attisdropped and attname in
      ('period_label_overrides','period_date_ranges','folder_label_overrides','approved_by','approved_at')) then
    raise exception 'RC16G_ROUTE_ALREADY_RECONCILED_OR_PARTIAL';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.operational_storage_routes'::regclass)
    or has_table_privilege('anon','public.operational_storage_routes','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated','public.operational_storage_routes','SELECT,INSERT,UPDATE,DELETE')
    or (select pg_get_indexdef(indexrelid) from pg_index
      where indexrelid=to_regclass('public.operational_storage_routes_active_key_uidx'))
      is distinct from 'CREATE UNIQUE INDEX operational_storage_routes_active_key_uidx ON public.operational_storage_routes USING btree (provider, execution_source, brand_id, platform_id, subbrand_key) NULLS NOT DISTINCT WHERE active'
    or (select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.operational_storage_routes'::regclass
      and tgname='operational_storage_routes_set_updated_at' and tgenabled='O')
      is distinct from 'CREATE TRIGGER operational_storage_routes_set_updated_at BEFORE UPDATE ON public.operational_storage_routes FOR EACH ROW EXECUTE FUNCTION private.set_updated_at()' then
    raise exception 'RC16G_ROUTE_SECURITY_OR_INDEX_DRIFT';
  end if;
  if exists (select 1 from pg_attribute where attrelid='public.brands'::regclass
      and attname in ('storage_profile_reviewed_by','storage_profile_reviewed_at')
      and (attnotnull or atttypid <> case attname when 'storage_profile_reviewed_by' then 'text'::regtype
        else 'timestamptz'::regtype end)) then
    raise exception 'RC16G_BRAND_REVIEW_SCHEMA_DRIFT';
  end if;
  if exists (select 1 from pg_attrdef d join pg_attribute a on a.attrelid=d.adrelid and a.attnum=d.adnum
    where a.attrelid='public.brands'::regclass and
      (a.attname in ('storage_profile_reviewed_by','storage_profile_reviewed_at')
       or (a.attname='storage_profile' and pg_get_expr(d.adbin,d.adrelid) <> '''CANONICAL_V1''::text')))
    or exists (select 1 from pg_attribute a where a.attrelid='public.brands'::regclass
      and a.attname='storage_profile_reviewed_by' and not exists
        (select 1 from pg_constraint c where c.conrelid=a.attrelid and c.contype='f'
          and c.conkey=array[a.attnum]::smallint[] and c.confrelid='public.business_users'::regclass
          and c.confkey=array[(select attnum from pg_attribute where attrelid=c.confrelid and attname='id')]::smallint[]
          and c.confdeltype='n' and c.convalidated)) then
    raise exception 'RC16G_BRAND_REVIEW_DEFAULT_OR_FK_DRIFT';
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.operational_storage_routes'::regclass and not convalidated)
    or exists (select 1 from pg_constraint where conrelid='public.brands'::regclass
      and contype='c' and conname <> 'brands_storage_profile_check'
      and conkey @> array[(select attnum from pg_attribute where attrelid='public.brands'::regclass
        and attname='storage_profile')]::smallint[]) then
    raise exception 'RC16G_PROFILE_CONSTRAINT_DRIFT';
  end if;
end $guard$;
alter table public.brands
  add column if not exists storage_profile_reviewed_by text references public.business_users(id) on delete set null,
  add column if not exists storage_profile_reviewed_at timestamptz,
  alter column storage_profile drop default,
  drop constraint brands_storage_profile_check,
  add constraint brands_storage_profile_check check (storage_profile in
    ('LEGACY_CATEGORY_PERIOD','LEGACY_PLATFORM_CATEGORY_PERIOD','LEGACY_PERIOD_CATEGORY',
     'LEGACY_SUBBRAND_PERIOD_CATEGORY','LEGACY_SUBBRAND_CATEGORY_PERIOD','CANONICAL_V1',
     'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'));
alter table public.operational_storage_routes
  add column period_label_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(period_label_overrides)='object'),
  add column period_date_ranges jsonb not null default '[]'::jsonb check (jsonb_typeof(period_date_ranges)='array'),
  add column folder_label_overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(folder_label_overrides)='object'),
  add column approved_by text references public.business_users(id) on delete set null,
  add column approved_at timestamptz,
  add constraint rc16g_route_approval_timestamp check (approved_by is null or approved_at is not null),
  drop constraint operational_storage_routes_profile_check,
  add constraint operational_storage_routes_profile_check check (storage_profile in
    ('LEGACY_CATEGORY_PERIOD','LEGACY_PLATFORM_CATEGORY_PERIOD','LEGACY_PERIOD_CATEGORY',
     'LEGACY_SUBBRAND_PERIOD_CATEGORY','LEGACY_SUBBRAND_CATEGORY_PERIOD','CANONICAL_V1',
     'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'));
comment on column public.operational_storage_routes.approved_at is
  'NULL for legacy unreviewed routes; never inferred from creation/update time. Actor deletion may retain genuine approval time.';
commit;
