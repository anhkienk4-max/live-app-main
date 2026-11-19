import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createOperationsCollectionHandler } from '@/lib/server/operationsCollectionHandler'

const migration = readFileSync(new URL('../supabase/migrations/20261112000000_rc19_c2_calendar_overlap_range.sql', import.meta.url), 'utf8')
const filterFunction = migration.match(/^\s*create or replace function private\.filtered_shift_ids\([\s\S]*?\n\$\$;/im)?.[0]

test('calendar range uses half-open Asia/Ho_Chi_Minh timestamp overlap and returns every dense event', async () => {
  assert.ok(filterFunction)
  const db = new PGlite()
  try {
    await db.exec(`
      create role authenticated nologin;
      create role anon nologin;
      create role service_role nologin;
      create schema private;
      grant usage on schema private to authenticated;
      create table public.shifts (
        id text primary key, date date, start_time time, start_at timestamptz, end_at timestamptz,
        status text, deleted_at timestamptz, archived_at timestamptz, registration_locked boolean,
        registration_cutoff_at timestamptz, brand_id text, platform_id text, campaign_id text,
        studio text, title text, product_notes text, host_id text, support_id text, technical_id text,
        required_host_count integer, required_support_count integer, required_technical_count integer
      );
      create table public.brands (id text primary key, name text);
      create table public.platforms (id text primary key, name text);
      create table public.business_users (id text primary key, status text, operational_roles text[]);
      create table public.shift_staffing_segments (id text primary key, shift_id text);
      create table public.shift_registrations (
        shift_id text, user_id text, status text, operational_role text, imported_name text, source text
      );
      create function private.current_business_user_id() returns text language sql as $$ select 'admin'::text $$;
      create function public.get_shift_staffing_summary(p_shift_ids text[])
      returns table(shift_id text, role text, required integer, approved integer)
      language sql stable as $$ select null::text,null::text,0,0 where false $$;
      insert into public.shifts
        (id,date,start_time,start_at,end_at,status,registration_locked,registration_cutoff_at,
         required_host_count,required_support_count,required_technical_count)
      values
        ('overnight-in-range','2026-11-10','23:45','2026-11-10 16:45Z','2026-11-10 18:45Z','scheduled',false,'2026-11-10 10:45Z',1,0,0),
        ('ends-at-midnight','2026-11-11','22:00','2026-11-11 15:00Z','2026-11-11 17:00Z','scheduled',false,'2026-11-11 09:00Z',1,0,0),
        ('end-at-range-start','2026-11-10','22:00','2026-11-10 15:00Z','2026-11-10 17:00Z','scheduled',false,'2026-11-10 09:00Z',1,0,0),
        ('start-at-range-end','2026-11-13','00:00','2026-11-12 17:00Z','2026-11-12 18:00Z','scheduled',false,'2026-11-12 11:00Z',1,0,0),
        ('month-boundary-overlap','2026-11-29','23:45','2026-11-29 16:45Z','2026-11-29 18:45Z','scheduled',false,'2026-11-29 10:45Z',1,0,0);
    `)
    await db.exec(migration)
    const acl = await db.query<{ schema_usage: boolean; anon_schema_usage: boolean; service_schema_usage: boolean; authenticated: boolean; anon: boolean; service_role: boolean }>(`
      select has_schema_privilege('authenticated','private','USAGE') schema_usage,
        has_schema_privilege('anon','private','USAGE') anon_schema_usage,
        has_schema_privilege('service_role','private','USAGE') service_schema_usage,
        has_function_privilege('authenticated','private.filtered_shift_ids(text,jsonb)','EXECUTE') authenticated,
        has_function_privilege('anon','private.filtered_shift_ids(text,jsonb)','EXECUTE') anon,
        has_function_privilege('service_role','private.filtered_shift_ids(text,jsonb)','EXECUTE') service_role
    `)
    assert.deepEqual(acl.rows[0], { schema_usage: true, anon_schema_usage: false, service_schema_usage: false, authenticated: true, anon: false, service_role: false })
    const denseRows = Array.from({ length: 37 }, (_, index) => {
      const startMinute = String(index % 60).padStart(2, '0')
      return `('dense-${index + 1}','2026-11-11','10:${startMinute}','2026-11-11 03:${startMinute}Z','2026-11-11 04:${startMinute}Z','scheduled',false,'2026-11-10 21:00Z',1,0,0)`
    }).join(',')
    await db.exec(`insert into public.shifts (id,date,start_time,start_at,end_at,status,registration_locked,registration_cutoff_at,required_host_count,required_support_count,required_technical_count) values ${denseRows};`)

    const selected = await db.query<{ id: string }>(`select id from private.filtered_shift_ids(
      'all', '{"from":"2026-11-11","to":"2026-11-12","calendarOverlap":true}'::jsonb
    ) order by id`)
    const ids = selected.rows.map(row => row.id)
    assert.equal(ids.length, 39, 'all 37 same-day shifts plus both overlapping boundary shifts are returned')
    assert.ok(ids.includes('overnight-in-range'))
    assert.ok(ids.includes('ends-at-midnight'))
    assert.ok(!ids.includes('end-at-range-start'))
    assert.ok(!ids.includes('start-at-range-end'))

    const oldSemantics = await db.query<{ id: string }>(`select id from private.filtered_shift_ids(
      'all', '{"from":"2026-11-11","to":"2026-11-12"}'::jsonb
    ) order by id`)
    assert.ok(!oldSemantics.rows.some(row => row.id === 'overnight-in-range'), 'non-calendar consumers retain start-date filtering')
    const month = await db.query<{ id: string }>(`select id from private.filtered_shift_ids(
      'all', '{"from":"2026-11-30","to":"2026-11-30","calendarOverlap":true}'::jsonb
    )`)
    assert.deepEqual(month.rows.map(row => row.id), ['month-boundary-overlap'])

    await assert.rejects(db.query(`select * from private.filtered_shift_ids('all','{"calendarOverlap":true,"from":"2026-11-11"}')`), /LIST_FILTER_INVALID/)
    await assert.rejects(db.query(`select * from private.filtered_shift_ids('all','{"calendarOverlap":"true","from":"2026-11-11","to":"2026-11-12"}')`), /LIST_FILTER_INVALID/)
  } finally {
    await db.close()
  }
})

test('authenticated calendar collection requests use overlap mode and include persisted segment context', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const segment = {
    id: 'segment-a', shift_id: 'shift-a', segment_index: 1,
    start_at: '2026-11-11T02:00:00Z', end_at: '2026-11-11T03:00:00Z',
    required_host_count: 2, required_support_count: 1, required_technical_count: 0,
    planned_host_names: ['Host A'], planned_support_names: ['Support A'], planned_technical_names: [],
  }
  const row = {
    id: 'shift-a', date: '2026-11-11', start_time: '09:00:00', end_time: '10:00:00',
    timezone: 'Asia/Ho_Chi_Minh', start_at: segment.start_at, end_at: segment.end_at,
    end_date: '2026-11-11', crosses_midnight: false, duration_minutes: 60,
    brand_id: 'brand-a', platform_id: 'platform-a', status: 'scheduled',
    created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', version: 1,
    registration_conflict: false,
  }
  const registration = {
    id: 'registration-a', shift_id: 'shift-a', staffing_segment_id: 'segment-a',
    user_id: 'host-a', operational_role: 'host', status: 'approved', source: 'manual_assignment',
    requested_at: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z', version: 2,
  }
  const segmentQuery = {
    select: () => segmentQuery,
    in: () => segmentQuery,
    order: () => segmentQuery,
    then: (resolve: (value: { data: typeof segment[]; error: null }) => unknown) => Promise.resolve({ data: [segment], error: null }).then(resolve),
  }
  const GET = createOperationsCollectionHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin', systemPermission: 'admin' }),
    createClient: async () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return name === 'get_shift_list_page'
          ? { data: { rows: [row], registrations: [registration], total: 1, page: 1, pageSize: 20 }, error: null }
          : { data: [], error: null }
      },
      from: (table: string) => {
        assert.equal(table, 'shift_staffing_segments')
        return segmentQuery
      },
    }) as never,
  }).GET

  const filters = encodeURIComponent(JSON.stringify({ from: '2026-11-11', to: '2026-11-12', brandIds: ['brand-a'] }))
  const response = await GET(new Request(`http://local.test/api/operations/collection?entity=shifts&page=1&pageSize=20&filters=${filters}`))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(rpcCalls[0].args.p_filters, { from: '2026-11-11', to: '2026-11-12', brandIds: ['brand-a'], calendarOverlap: true })
  assert.deepEqual(body.items[0].persisted_staffing_segments, [segment])
  assert.deepEqual(body.items[0].staffing_summary, [])
  assert.equal(body.registrations[0].staffing_segment_id, 'segment-a')

  const forged = await GET(new Request('http://local.test/api/operations/collection?entity=shifts&page=1&pageSize=20&filters=' + encodeURIComponent('{"calendarOverlap":true}')))
  assert.equal(forged.status, 400, 'clients cannot set the server-derived overlap mode')
})

test('authenticated swaps collection accepts shiftIds filter from ShiftDetailModal and rejects unsupported keys', async () => {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []
  const GET = createOperationsCollectionHandler({
    resolveUser: async () => ({ id: 'auth-leader', businessUserId: 'leader-1', systemPermission: 'leader' }),
    createClient: async () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args })
        return {
          data: {
            rows: [{
              id: 'swap-1',
              mode: 'replacement',
              shift_id: 'shift-1',
              source_registration_id: 'reg-1',
              requester_id: 'member-1',
              operational_role: 'host',
              reason: 'Need replacement coverage',
              status: 'pending',
              target_shift_id: null,
              replacement_staff_id: 'member-2',
              counterpart_registration_id: null,
              notes: null,
              reviewed_by: null,
              reviewed_at: null,
              rejection_reason: null,
              version: 1,
              created_at: '2026-11-11T00:00:00Z',
              updated_at: '2026-11-11T00:00:00Z',
            }],
            total: 1,
            page: 1,
            pageSize: 50,
            pendingTotal: 1,
          },
          error: null,
        }
      },
    }) as never,
  }).GET

  const valid = await GET(new Request(
    'http://local.test/api/operations/collection?entity=swaps&page=1&pageSize=50&pendingPage=1&filters='
    + encodeURIComponent(JSON.stringify({ shiftIds: ['shift-1'] })),
  ))
  assert.equal(valid.status, 200)
  const body = await valid.json() as { items: Array<{ id: string; shift_id: string }>; total: number }
  assert.equal(body.total, 1)
  assert.equal(body.items.length, 1)
  assert.equal(body.items[0].shift_id, 'shift-1')
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'get_swap_list_page')
  assert.deepEqual(rpcCalls[0].args.p_filters, { shiftIds: ['shift-1'] })

  const disallowedForSwaps = await GET(new Request(
    'http://local.test/api/operations/collection?entity=swaps&page=1&pageSize=50&filters='
    + encodeURIComponent(JSON.stringify({ studios: ['studio-a'] })),
  ))
  assert.equal(disallowedForSwaps.status, 400)
  const disallowedBody = await disallowedForSwaps.json() as { error?: { code?: string } }
  assert.equal(disallowedBody.error?.code, 'LIST_FILTER_INVALID')

  const invalid = await GET(new Request(
    'http://local.test/api/operations/collection?entity=swaps&page=1&pageSize=50&filters='
    + encodeURIComponent(JSON.stringify({ unsupportedKey: ['x'] })),
  ))
  assert.equal(invalid.status, 400)
  const invalidBody = await invalid.json() as { error?: { code?: string } }
  assert.equal(invalidBody.error?.code, 'LIST_QUERY_INVALID')
})
