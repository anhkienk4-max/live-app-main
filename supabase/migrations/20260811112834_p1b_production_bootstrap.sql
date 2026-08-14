-- P1B production compatibility bootstrap.
-- Applied once through migration history after the six Auth prerequisites exist.
-- Demo brands and campaigns live outside the production migration path.

do $$
declare
  expected record;
  auth_ids uuid[];
  mapped_auth_user_id uuid;
  auth_metadata jsonb;
  auth_email_verified boolean;
begin
  for expected in
    select *
    from (
      values
        ('1'::text, 'admin@livestream.com'::text, 'Admin User'::text, 'admin'::text, 'admin'::text, '{}'::text[], 'Management'::text, '+1234567890'::text, '2024-01-01'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin'::text),
        ('2', 'leader@livestream.com', 'Team Leader', 'leader', 'leader', array['host', 'support', 'technical']::text[], 'Operations', '+1234567891', '2024-02-01'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=leader'),
        ('3', 'host1@livestream.com', 'Sarah Johnson', 'staff', 'member', array['host']::text[], 'Live Host', '+1234567892', '2024-03-01'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah'),
        ('4', 'host2@livestream.com', 'Michael Chen', 'staff', 'member', array['host']::text[], 'Live Host', '+1234567893', '2024-03-15'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=michael'),
        ('5', 'support1@livestream.com', 'Emily Davis', 'staff', 'member', array['support']::text[], 'Live Support', '+1234567894', '2024-04-01'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily'),
        ('6', 'technical1@livestream.com', 'Alex Morgan', 'staff', 'member', array['technical']::text[], 'Live Technical', null::text, '2024-04-15'::date, 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex')
    ) as mapping(
      business_user_id,
      email,
      full_name,
      legacy_role,
      system_permission,
      operational_roles,
      department,
      phone,
      join_date,
      avatar_url
    )
  loop
    select
      array_agg(auth_user.id order by auth_user.id),
      bool_or(auth_user.email_confirmed_at is not null)
    into auth_ids, auth_email_verified
    from auth.users as auth_user
    where lower(auth_user.email) = lower(expected.email);

    if coalesce(cardinality(auth_ids), 0) <> 1 then
      raise exception 'P1B production bootstrap requires exactly one Auth user for %; found %',
        expected.email,
        coalesce(cardinality(auth_ids), 0);
    end if;

    mapped_auth_user_id := auth_ids[1];

    select auth_user.raw_app_meta_data
    into auth_metadata
    from auth.users as auth_user
    where auth_user.id = mapped_auth_user_id;

    if coalesce(auth_metadata ->> 'business_user_id', '') <> expected.business_user_id
      or coalesce(auth_metadata ->> 'system_permission', '') <> expected.system_permission
    then
      raise exception 'P1B production Auth app_metadata mapping mismatch for %', expected.email;
    end if;

    insert into public.business_users (
      id,
      auth_user_id,
      email,
      full_name,
      avatar_url,
      phone,
      role,
      system_permission,
      operational_roles,
      department,
      status,
      account_status,
      email_verified,
      auth_provider,
      join_date,
      created_at,
      updated_at
    )
    values (
      expected.business_user_id,
      mapped_auth_user_id,
      expected.email,
      expected.full_name,
      expected.avatar_url,
      expected.phone,
      expected.legacy_role,
      expected.system_permission,
      expected.operational_roles,
      expected.department,
      'active',
      'active',
      coalesce(auth_email_verified, false),
      'email',
      expected.join_date,
      expected.join_date::timestamptz,
      expected.join_date::timestamptz
    )
    on conflict (id) do update
    set
      auth_user_id = excluded.auth_user_id,
      email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      phone = excluded.phone,
      role = excluded.role,
      system_permission = excluded.system_permission,
      operational_roles = excluded.operational_roles,
      department = excluded.department,
      status = excluded.status,
      account_status = excluded.account_status,
      email_verified = excluded.email_verified,
      auth_provider = excluded.auth_provider,
      join_date = excluded.join_date,
      updated_at = excluded.updated_at
    where public.business_users.updated_at < excluded.updated_at;

    if not exists (
      select 1
      from public.business_users as business_user
      where business_user.id = expected.business_user_id
        and business_user.auth_user_id = mapped_auth_user_id
        and lower(business_user.email) = lower(expected.email)
        and business_user.system_permission = expected.system_permission
    ) then
      raise exception 'P1B production business user verification failed for %', expected.email;
    end if;
  end loop;
end;
$$;

insert into public.platforms (
  id,
  name,
  icon,
  logo_url,
  platform_type,
  platform_url,
  status,
  account_information,
  policy_notes,
  livestream_rules,
  content_restrictions,
  technical_requirements,
  report_requirements,
  external_links,
  updated_by,
  created_at,
  updated_at
)
values
  ('p1', 'TikTok Shop', 'tiktok', null, 'Social commerce', 'https://www.tiktok.com/', 'active', 'Managed business account. Credentials are stored outside this application.', 'Follow current commerce and branded-content policies.', array['Disclose promotions clearly', 'Keep products visible during demonstrations']::text[], array['No prohibited products', 'No misleading urgency claims']::text[], array['Stable 10 Mbps upload', 'Vertical 9:16 output']::text[], array['Revenue', 'Orders', 'Viewers', 'Product clicks']::text[], array['https://seller.tiktok.com/']::text[], '1', '2024-01-01T00:00:00Z'::timestamptz, '2024-01-01T00:00:00Z'::timestamptz),
  ('p2', 'Shopee Live', 'shopee', null, 'Marketplace livestream', 'https://shopee.com/', 'active', null, 'Verify voucher stock before announcing offers.', array['Pin the active product', 'Repeat voucher conditions']::text[], '{}'::text[], array['Stable 8 Mbps upload', 'Mobile-safe audio']::text[], array['GMV', 'Orders', 'Viewers']::text[], '{}'::text[], '1', '2024-01-01T00:00:00Z'::timestamptz, '2024-01-01T00:00:00Z'::timestamptz),
  ('p3', 'Lazada Live', 'lazada', null, 'Marketplace livestream', 'https://www.lazada.com/', 'active', null, 'Use approved campaign assets.', array['Follow campaign price windows']::text[], '{}'::text[], array['Stable 8 Mbps upload']::text[], array['Revenue', 'Orders', 'Viewers']::text[], '{}'::text[], '2', '2024-01-01T00:00:00Z'::timestamptz, '2024-01-01T00:00:00Z'::timestamptz),
  ('p4', 'Facebook Live', 'facebook', null, 'Social livestream', 'https://www.facebook.com/live/', 'active', null, 'Follow branded-content disclosure requirements.', array['Use approved page and scheduled event']::text[], '{}'::text[], array['Landscape or portrait layout per campaign brief']::text[], array['Viewers', 'Engagement', 'Clicks']::text[], '{}'::text[], '2', '2024-01-01T00:00:00Z'::timestamptz, '2024-01-01T00:00:00Z'::timestamptz)
on conflict (id) do update
set
  name = excluded.name,
  icon = excluded.icon,
  logo_url = excluded.logo_url,
  platform_type = excluded.platform_type,
  platform_url = excluded.platform_url,
  status = excluded.status,
  account_information = excluded.account_information,
  policy_notes = excluded.policy_notes,
  livestream_rules = excluded.livestream_rules,
  content_restrictions = excluded.content_restrictions,
  technical_requirements = excluded.technical_requirements,
  report_requirements = excluded.report_requirements,
  external_links = excluded.external_links,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at
where public.platforms.updated_at < excluded.updated_at;
