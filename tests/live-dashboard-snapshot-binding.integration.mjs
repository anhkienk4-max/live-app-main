import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../supabase/migrations/20261019000000_live_dashboard_snapshot_binding.sql', import.meta.url), 'utf8')

test('live snapshot binding rejects unrelated members and invalid snapshots on PostgreSQL 17', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated;
      create schema private;
      create table public.platforms (id text primary key, name text not null);
      create table public.shifts (
        id text primary key, brand_id text not null, platform_id text not null,
        host_id text, support_id text, technical_id text, status text not null,
        start_at timestamptz not null, end_at timestamptz not null,
        deleted_at timestamptz, archived_at timestamptz
      );
      create table public.shift_registrations (shift_id text, user_id text, status text);
      create table public.dashboard_updates (
        id text primary key default gen_random_uuid()::text,
        shift_id text not null, time timestamptz not null,
        revenue numeric not null default 0, gmv numeric, orders integer not null default 0,
        peak_viewers integer not null default 0, current_viewers integer not null default 0,
        total_views integer, total_viewers integer, likes integer, comments integer, shares integer,
        screenshot_url text, screenshot_storage_path text, dashboard_platform text not null,
        normalized_metrics jsonb, ocr_review jsonb, raw_ocr_output text, notes text,
        created_by text, created_at timestamptz default now(), updated_at timestamptz default now(),
        deleted_at timestamptz
      );
      create function private.current_business_user_id() returns text language sql stable
        as $$select nullif(current_setting('app.actor', true), '')$$;
      create function private.current_business_user_is_active() returns boolean language sql stable
        as $$select current_setting('app.active', true) = 'true'$$;
      create function private.current_system_permission() returns text language sql stable
        as $$select current_setting('app.permission', true)$$;
      create function private.can_read_report(p_shift_id text, p_submitted_by text) returns boolean
        language sql stable security definer set search_path = '' as $$
          select coalesce((select (select private.current_business_user_is_active())
            and (select private.current_system_permission()) = 'member'
            and (s.host_id = (select private.current_business_user_id())
              or s.support_id = (select private.current_business_user_id())
              or s.technical_id = (select private.current_business_user_id())
              or p_submitted_by = (select private.current_business_user_id())
              or exists (select 1 from public.shift_registrations r where r.shift_id=s.id
                and r.user_id=(select private.current_business_user_id())
                and r.status in ('approved','manually_assigned')))
          from public.shifts s where s.id=p_shift_id and s.deleted_at is null and s.archived_at is null), false)
        $$;
      create function public.create_dashboard_update(p_data jsonb) returns public.dashboard_updates
        language plpgsql security definer set search_path = '' as $$begin return null; end$$;
      alter table public.dashboard_updates enable row level security;
      create policy dashboard_updates_scoped_read on public.dashboard_updates
        for select to authenticated using (true);
      revoke all on function public.create_dashboard_update(jsonb) from public;
      grant execute on function public.create_dashboard_update(jsonb) to authenticated;
      grant usage on schema public to authenticated;
      grant select on public.dashboard_updates to authenticated;
      insert into public.platforms values ('platform-tiktok','TikTok Shop'),('platform-shopee','Shopee Live');
      insert into public.shifts values
        ('shift-tiktok','brand-1','platform-tiktok','host','support','tech','live',
          '2026-10-18T10:00:00Z','2026-10-18T12:00:00Z',null,null),
        ('shift-shopee','brand-2','platform-shopee',null,null,null,'live',
          '2026-10-18T10:00:00Z','2026-10-18T12:00:00Z',null,null);
      insert into public.shift_registrations values
        ('shift-tiktok','pending','pending'),
        ('shift-tiktok','approved','approved'),
        ('shift-tiktok','manual','manually_assigned');
    `)
    await db.exec(migration)
    const manualReview = actor => ({ status: 'unavailable', metrics: {
      gmv: { value: 100, status: 'manual', source: 'manual', needs_review: false,
        manual_edit: { manual_value: 100, edited_by: actor, edited_at: '2026-10-18T11:00:00Z' } },
    } })
    const payload = { shift_id: 'shift-tiktok', time: '2026-10-18T11:00:00Z',
      dashboard_platform: 'tiktok_shop', revenue: 100, orders: 2,
      normalized_metrics: { gmv: 100 }, ocr_review: manualReview('host'),
      request_id: 'a3559b51-0bb7-452c-bbd4-f218fe27eaa1' }
    const asActor = async (actor, permission, active, action) => {
      await db.exec(`select set_config('app.actor', '${actor}', false),
        set_config('app.permission', '${permission}', false),
        set_config('app.active', '${active}', false); set role authenticated;`)
      try { return await action() } finally { await db.exec('reset role') }
    }
    const create = data => db.query('select id from public.create_dashboard_update($1::jsonb)', [JSON.stringify(data)])
    for (const actor of ['unrelated', 'pending']) {
      await assert.rejects(asActor(actor, 'member', true, () => create(payload)), /DASHBOARD_UPDATE_NOT_ALLOWED/)
    }
    await assert.rejects(asActor('host', 'member', false, () => create(payload)), /AUTHENTICATION_REQUIRED/)
    for (const actor of ['host', 'support', 'tech', 'approved', 'manual']) {
      const id = { ...payload, ocr_review: manualReview(actor), request_id: crypto.randomUUID() }
      const saved = await asActor(actor, 'member', true, () => create(id))
      assert.equal(saved.rows.length, 1)
    }
    const first = await asActor('host', 'member', true, () => create(payload))
    const retry = await asActor('host', 'member', true, () => create(payload))
    assert.equal(retry.rows[0].id, first.rows[0].id)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, revenue: 101 })), /DASHBOARD_REQUEST_CONFLICT/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), time: '2026-10-18T12:00:00Z' })), /DASHBOARD_TIME_OUTSIDE_SHIFT/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), dashboard_platform: 'shopee_live' })), /DASHBOARD_PLATFORM_MISMATCH/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), brand_id: 'other-brand' })), /DASHBOARD_UPDATE_SHIFT_MISMATCH/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), ocr_review: undefined })), /DASHBOARD_OCR_REVIEW_REQUIRED/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), ocr_review: manualReview('unrelated') })), /DASHBOARD_OCR_REVIEW_REQUIRED/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), ocr_review: { metrics: { gmv: { status: 'review_required', value: 100 } } } })), /DASHBOARD_OCR_REVIEW_REQUIRED/)
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID(), ocr_review: { metrics: { gmv: { status: 'confirmed', value: 101 } } } })), /DASHBOARD_OCR_REVIEW_REQUIRED/)
    const visible = actor => asActor(actor, 'member', true,
      () => db.query('select count(*)::integer as total from public.dashboard_updates'))
    assert.equal((await visible('unrelated')).rows[0].total, 0)
    assert.equal((await visible('pending')).rows[0].total, 0)
    assert.equal((await visible('host')).rows[0].total, 6)
    assert.equal((await asActor('admin', 'admin', true,
      () => db.query('select count(*)::integer as total from public.dashboard_updates'))).rows[0].total, 6)
    assert.equal((await db.query('select count(*)::integer as total from public.dashboard_updates')).rows[0].total, 6)
    const catalog = await db.query(`
      select pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
        p.proconfig as config, p.proacl::text as acl, c.relrowsecurity as rls_enabled
      from pg_proc p cross join pg_class c
      where p.oid='public.create_dashboard_update(jsonb)'::regprocedure
        and c.oid='public.dashboard_updates'::regclass
    `)
    assert.equal(catalog.rows[0].owner, 'postgres')
    assert.equal(catalog.rows[0].security_definer, true)
    assert.deepEqual(catalog.rows[0].config, ['search_path=""'])
    assert.match(catalog.rows[0].acl, /authenticated=X\/postgres/)
    assert.equal(catalog.rows[0].rls_enabled, true)
    await db.exec("update public.shifts set archived_at='2026-10-19T00:00:00Z' where id='shift-tiktok'")
    await assert.rejects(asActor('host', 'member', true,
      () => create({ ...payload, request_id: crypto.randomUUID() })), /DASHBOARD_UPDATE_NOT_ALLOWED/)
    assert.equal((await visible('host')).rows[0].total, 0)
  } finally {
    await db.close()
  }
})
