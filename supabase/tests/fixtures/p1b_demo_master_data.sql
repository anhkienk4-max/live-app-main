-- TEST/DEVELOPMENT-ONLY mock master data. This file is intentionally outside
-- supabase/migrations. It must run only after P1B production bootstrap.

do $$
begin
  if current_setting('app.p1b_fixture_mode', true) is distinct from 'isolated-test' then
    raise exception 'p1b_demo_master_data.sql requires app.p1b_fixture_mode=isolated-test';
  end if;
end;
$$;

insert into public.brands (
  id, name, logo_url, color, description, category, status,
  contact_person, contact_email, brand_guideline, tone_of_voice,
  key_products, mandatory_claims, restricted_claims, dos, donts,
  asset_links, updated_by, created_at, updated_at
)
values
  ('b1', 'TechGear Pro', 'https://api.dicebear.com/7.x/shapes/svg?seed=techgear', '#2563EB', 'Consumer electronics and livestream-first product launches.', 'Electronics', 'active', 'Linh Nguyen', 'brand-contact@techgear.example', 'Use clean product close-ups and demonstrate one benefit at a time.', 'Clear, confident, practical', array['Wireless Earbuds', 'Smart Watch', 'Charging Accessories']::text[], array['Official warranty applies to eligible products']::text[], array['Do not claim medical benefits']::text[], array['Show product specifications on screen', 'Confirm voucher conditions']::text[], array['Do not compare against unnamed competitors']::text[], array['https://example.com/techgear/brand-assets']::text[], '1', '2024-01-01T00:00:00Z'::timestamptz, '2024-01-01T00:00:00Z'::timestamptz),
  ('b2', 'Fashion Nova', 'https://api.dicebear.com/7.x/shapes/svg?seed=fashion', '#EC4899', 'Seasonal fashion collections and social commerce drops.', 'Fashion', 'active', null, null, null, 'Energetic, inclusive, trend-aware', array['Seasonal collections', 'Accessories']::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '1', '2024-01-15T00:00:00Z'::timestamptz, '2024-01-15T00:00:00Z'::timestamptz),
  ('b3', 'Beauty Essentials', 'https://api.dicebear.com/7.x/shapes/svg?seed=beauty', '#8B5CF6', 'Beauty essentials, tutorials, and product education.', 'Beauty', 'active', null, null, null, 'Warm, educational, responsible', '{}'::text[], '{}'::text[], array['Do not make unverified treatment claims']::text[], '{}'::text[], '{}'::text[], '{}'::text[], '2', '2024-02-01T00:00:00Z'::timestamptz, '2024-02-01T00:00:00Z'::timestamptz),
  ('b4', 'Home Living', 'https://api.dicebear.com/7.x/shapes/svg?seed=home', '#10B981', 'Home organization and lifestyle products.', 'Home & Living', 'active', null, null, null, 'Helpful and approachable', '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '{}'::text[], '2', '2024-02-15T00:00:00Z'::timestamptz, '2024-02-15T00:00:00Z'::timestamptz)
on conflict (id) do update
set
  name = excluded.name,
  logo_url = excluded.logo_url,
  color = excluded.color,
  description = excluded.description,
  category = excluded.category,
  status = excluded.status,
  contact_person = excluded.contact_person,
  contact_email = excluded.contact_email,
  brand_guideline = excluded.brand_guideline,
  tone_of_voice = excluded.tone_of_voice,
  key_products = excluded.key_products,
  mandatory_claims = excluded.mandatory_claims,
  restricted_claims = excluded.restricted_claims,
  dos = excluded.dos,
  donts = excluded.donts,
  asset_links = excluded.asset_links,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at
where public.brands.updated_at < excluded.updated_at;

insert into public.campaigns (
  id, name, brand_id, start_date, end_date, type, notes, campaign_url,
  website_embed_enabled, platform_ids, status, owner_id, created_at, updated_at
)
values
  ('c1', 'Summer Sale 2024', 'b1', '2024-06-01'::date, '2024-08-31'::date, 'Seasonal', 'Major summer promotion', 'https://example.com/campaigns/summer-sale', false, array['p1', 'p2']::text[], 'completed', '2', '2024-05-01T00:00:00Z'::timestamptz, '2024-05-01T00:00:00Z'::timestamptz),
  ('c2', 'New Collection Launch', 'b2', '2024-07-01'::date, '2024-07-31'::date, 'Product Launch', 'Fall collection preview', 'https://example.com/campaigns/new-collection', false, array['p2']::text[], 'completed', '2', '2024-06-01T00:00:00Z'::timestamptz, '2024-06-01T00:00:00Z'::timestamptz),
  ('c3', 'Flash Sale Week', 'b3', '2026-08-11'::date, '2026-08-18'::date, 'Flash Sale', 'Daily deals', 'https://example.com/campaigns/flash-sale', false, array['p1', 'p3']::text[], 'active', '2', '2024-07-01T00:00:00Z'::timestamptz, '2024-07-01T00:00:00Z'::timestamptz)
on conflict (id) do update
set
  name = excluded.name,
  brand_id = excluded.brand_id,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  type = excluded.type,
  notes = excluded.notes,
  campaign_url = excluded.campaign_url,
  website_embed_enabled = excluded.website_embed_enabled,
  platform_ids = excluded.platform_ids,
  status = excluded.status,
  owner_id = excluded.owner_id,
  updated_at = excluded.updated_at
where public.campaigns.updated_at < excluded.updated_at;

do $$
begin
  if exists (
    select 1
    from public.campaigns as campaign
    cross join lateral unnest(campaign.platform_ids) as platform_id
    left join public.platforms as platform on platform.id = platform_id
    where campaign.id in ('c1', 'c2', 'c3')
      and platform.id is null
  ) then
    raise exception 'P1B demo campaign references an unknown platform';
  end if;
end;
$$;
