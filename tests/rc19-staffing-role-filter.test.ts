import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = readFileSync(new URL('../supabase/migrations/20261029120000_rc19_staffing_role_scoped_gap_filter.sql', import.meta.url), 'utf8')
const filterFunction = migration.match(/create (?:or replace )?function private\.filtered_shift_ids\([\s\S]*?\n\$\$;/i)?.[0]

test('gap staffing state is evaluated only across the selected operational roles', async () => {
  assert.ok(filterFunction, 'expected the production filtered_shift_ids definition')
  const db = new PGlite()
  try {
    await db.exec(`
      create schema private;
      create table public.shifts (
        id text primary key, date date, start_time time, end_time time, end_at timestamptz,
        status text, deleted_at timestamptz, archived_at timestamptz, brand_id text,
        platform_id text, campaign_id text, studio text, title text, product_notes text,
        host_id text, support_id text, technical_id text,
        required_host_count integer, required_support_count integer, required_technical_count integer
      );
      create table public.brands (id text primary key, name text);
      create table public.platforms (id text primary key, name text);
      create table public.shift_registrations (
        shift_id text, user_id text, status text, operational_role text, imported_name text, source text
      );
      create table public.staffing_test_summary (
        shift_id text, role text, required integer, approved integer
      );
      create function private.current_business_user_id() returns text language sql as $$ select 'admin'::text $$;
      create function public.get_shift_staffing_summary(p_shift_ids text[])
      returns table(shift_id text, role text, required integer, approved integer, pending integer, remaining integer, approved_staff jsonb)
      language sql stable as $$
        select s.shift_id, s.role, s.required, s.approved, 0, greatest(0,s.required-s.approved), '[]'::jsonb
        from public.staffing_test_summary s where s.shift_id = any(p_shift_ids)
      $$;
      insert into public.shifts (id,date,start_time,end_time,end_at,status,required_host_count,required_support_count,required_technical_count)
      values
        ('host-complete-support-gap','2026-10-29','09:00','10:00','2026-10-29 10:00+00','scheduled',1,2,0),
        ('host-gap-support-complete','2026-10-29','11:00','12:00','2026-10-29 12:00+00','scheduled',1,1,0);
      insert into public.staffing_test_summary (shift_id,role,required,approved) values
        ('host-complete-support-gap','host',1,1),
        ('host-complete-support-gap','support',2,0),
        ('host-gap-support-complete','host',1,0),
        ('host-gap-support-complete','support',1,1);
    `)
    await db.exec(filterFunction!)
    const result = await db.query<{ id: string }>(`select id from private.filtered_shift_ids(
      'all', '{"operationalRoles":["host"],"staffingStates":["missing_staff"]}'::jsonb
    ) order by id`)
    assert.deepEqual(result.rows.map(row => row.id), ['host-gap-support-complete'])
  } finally {
    await db.close()
  }
})
