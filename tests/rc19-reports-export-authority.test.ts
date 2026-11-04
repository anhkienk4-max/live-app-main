import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { ROLE_DEFAULTS_CATALOG } from '@/lib/rbac/roleDefaults'
import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReportExportHandler } from '@/lib/server/reportExportHandler'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

const admin: AuthenticatedServerUser = { id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }
const member: AuthenticatedServerUser = { id: 'auth-member', businessUserId: 'member-1', systemPermission: 'member' }
const leader = (id: string): AuthenticatedServerUser => ({ id: `auth-${id}`, businessUserId: id, systemPermission: 'leader' })
const request = (body: unknown) => new Request('https://ops.example/api/reports/export', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

type Row = Record<string, unknown>
function database(rows: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      const query = {
        select() { return query },
        in(field: string, values: unknown[]) { filters.push(row => values.includes(row[field])); return query },
        is(field: string, value: unknown) { filters.push(row => row[field] === value); return query },
        order() { return query },
        range(first: number, last: number) {
          const result = (rows[table] ?? []).filter(row => filters.every(filter => filter(row)))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          return Promise.resolve({ data: result.slice(first, last + 1), count: result.length, error: null })
        },
      }
      return query
    },
  } as unknown as SupabaseClient
}

function staticHandler(user: AuthenticatedServerUser, db: SupabaseClient, onCreate = () => {}) {
  return createReportExportHandler({
    resolveUser: async () => user,
    createClient: async () => { onCreate(); return db },
  })
}

test('Member cannot export, even their own submitted report', async () => {
  let queries = 0
  const response = await staticHandler(member, database({}), () => { queries += 1 })
    .POST(request({ kind: 'report', report_ids: ['owned-report'] }))
  assert.equal(response.status, 403)
  assert.equal(queries, 0)
})

test('Leaders from separate identities fail closed before report or Brand reads', async () => {
  let queries = 0
  for (const actor of [leader('leader-ada'), leader('leader-snap')]) {
    const response = await staticHandler(actor, database({}), () => { queries += 1 })
      .POST(request({ kind: 'report', report_ids: ['report-from-another-brand'] }))
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error.code, 'REPORT_EXPORT_SCOPE_UNAVAILABLE')
  }
  assert.equal(queries, 0)
})

test('Expired or revoked reports.export decisions deny before reading report data', async t => {
  const previous = process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
  process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = 'true'
  t.after(() => {
    if (previous === undefined) delete process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
    else process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = previous
  })

  for (const source of ['expired', 'revoked'] as const) {
    let queries = 0
    const handler = createReportExportHandler({
      resolveUser: async () => admin,
      createClient: async () => { queries += 1; return database({}) },
      createPermissionClient: async () => ({ rpc: async () => ({ data: {
        actor_business_user_id: admin.businessUserId, role: 'admin', permission: 'reports.export',
        allowed: false, source, reason: source, version: 1,
        expires_at: source === 'expired' ? '2020-01-01T00:00:00Z' : null,
        effective_at: null,
      }, error: null }) }),
    })
    const response = await handler.POST(request({ kind: 'report', report_ids: ['report-1'] }))
    assert.equal(response.status, 403)
    assert.equal(queries, 0)
  }
})

test('Forged report IDs and client-supplied scope fields cannot become export authority', async () => {
  let queries = 0
  const handler = staticHandler(admin, database({ reports: [] }), () => { queries += 1 })
  const forged = await handler.POST(request({ kind: 'report', report_ids: ['not-visible-report'] }))
  assert.equal(forged.status, 404)

  queries = 0
  const forgedScope = await handler.POST(request({ kind: 'report', report_ids: ['report-1'], shift_ids: ['other-shift'] }))
  assert.equal(forgedScope.status, 400)
  assert.equal(queries, 0)
})

test('Admin exports list, detail and image workbooks from authorized database rows', async () => {
  const db = database({
    reports: [{ id: 'report-1', shift_id: 'shift-1', revenue: 1250, gmv: 1500, orders: 5,
      peak_viewer: 20, average_viewer: 10, comments: 2, shares: 1, dashboard_platform: 'other',
      metrics_confirmed: true, status: 'confirmed', submitted_by: 'staff-1', confirmed_by: 'staff-1',
      deleted_at: null, created_at: '2026-11-02T12:00:00Z', updated_at: '2026-11-02T12:00:00Z', version_number: 7 }],
    shifts: [{ id: 'shift-1', date: '2026-11-02', start_time: '10:00', end_time: '12:00',
      brand_id: 'brand-1', platform_id: 'platform-1', campaign_id: 'campaign-1', host_id: 'staff-1',
      support_id: null, technical_id: null, studio: 'Studio 1', status: 'completed',
      created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z' }],
    shift_registrations: [],
    brands: [{ id: 'brand-1', name: 'ADA Brand' }],
    platforms: [{ id: 'platform-1', name: 'TikTok Live' }],
    campaigns: [{ id: 'campaign-1', name: 'Campaign 1' }],
    business_users: [{ id: 'staff-1', full_name: 'Verified Host' }],
    report_images: [{ id: 'image-1', report_id: 'report-1', image_url: 'https://drive.example/image-1',
      storage_path: 'reports/report-1/image-1.jpg', original_name: 'dashboard.jpg', mime_type: 'image/jpeg',
      size_bytes: 1234, image_type: 'dashboard', created_at: '2026-11-02T12:30:00Z', deleted_at: null }],
  })
  const handler = staticHandler(admin, db)
  const response = await handler.POST(request({ kind: 'reports', report_ids: ['report-1'] }))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('Content-Type') ?? '', /spreadsheet/)
  assert.equal(response.headers.get('X-Export-Record-Count'), '1')
  const workbook = XLSX.read(new Uint8Array(await response.arrayBuffer()), { type: 'array' })
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Reports, { header: 1 }) as unknown[][]
  const header = rows[0] as string[]
  const reportRow = rows[1] as unknown[]
  assert.equal(reportRow[header.indexOf('Report ID')], 'report-1')
  assert.equal(reportRow[header.indexOf('Revenue')], 1250)
  assert.equal(reportRow[header.indexOf('Brand')], 'ADA Brand')
  assert.equal(reportRow[header.indexOf('Host')], 'Verified Host')

  const detailResponse = await handler.POST(request({ kind: 'report', report_ids: ['report-1'] }))
  const detail = XLSX.read(new Uint8Array(await detailResponse.arrayBuffer()), { type: 'array' })
  assert.equal(detailResponse.status, 200)
  assert.deepEqual(detail.SheetNames, ['Report'])
  assert.equal((XLSX.utils.sheet_to_json(detail.Sheets.Report, { header: 1 }) as unknown[][])[1][0], 'report-1')

  const imageResponse = await handler.POST(request({ kind: 'images', report_ids: ['report-1'] }))
  const imageWorkbook = XLSX.read(new Uint8Array(await imageResponse.arrayBuffer()), { type: 'array' })
  const imageRows = XLSX.utils.sheet_to_json(imageWorkbook.Sheets.Images, { header: 1 }) as unknown[][]
  assert.equal(imageResponse.status, 200)
  assert.deepEqual(imageRows[0], ['Report ID', 'Category', 'Original Name', 'Storage Path', 'Mock URL', 'MIME Type', 'Size Bytes', 'Created At'])
  assert.deepEqual(imageRows[1], ['report-1', 'dashboard', 'dashboard.jpg', 'reports/report-1/image-1.jpg',
    'https://drive.example/image-1', 'image/jpeg', 1234, '2026-11-02T12:30:00Z'])
})

test('C3 Leader scope migration is additive, DB-owned, versioned and applied to report read paths', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261104120000_rc19_c3_leader_brand_scope_reports.sql', import.meta.url), 'utf8')
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.rc19_leader_brand_scopes/i)
  assert.match(sql, /REFERENCES public\.business_users\(id\)/i)
  assert.match(sql, /REFERENCES public\.brands\(id\)/i)
  assert.match(sql, /valid_from timestamptz[\s\S]*?valid_until timestamptz[\s\S]*?revoked_at timestamptz/i)
  assert.match(sql, /UNIQUE \(leader_business_user_id, brand_id, scope_key\)/i)
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*?LEADER_BRAND_SCOPE_VERSION_CONFLICT[\s\S]*?40001/i)
  assert.match(sql, /private\.current_system_permission\(\) <> 'admin'[\s\S]*?ADMIN_SCOPE_MANAGEMENT_REQUIRED/i)
  assert.match(sql, /rc19_leader_brand_scope_events[\s\S]*?actor_business_user_id[\s\S]*?reason/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION private\.can_read_report[\s\S]*?rc19_has_any_leader_brand_scope/i)
  const reportRead = sql.split('CREATE OR REPLACE FUNCTION private.can_read_report')[1]?.split('CREATE OR REPLACE FUNCTION private.rc19_guard_report_write')[0] ?? ''
  assert.match(reportRead, /reports\.read[\s\S]*?reports\.review[\s\S]*?reports\.submit/i)
  assert.doesNotMatch(reportRead, /reports\.export/i, 'export-only scope cannot grant direct Data API reads')
  assert.match(sql, /CREATE POLICY reports_active_select[\s\S]*?private\.can_read_report\(id\)/i)
  assert.match(sql, /CREATE POLICY report_revisions_read[\s\S]*?private\.can_read_report\(report_id\)/i)
  assert.match(sql, /CREATE POLICY report_images_read[\s\S]*?private\.can_read_report\(report_id\)/i)
  assert.match(sql, /CREATE POLICY live_report_images_read[\s\S]*?report_id IS NOT NULL AND private\.can_read_report\(report_id\)/i)
  assert.match(sql, /CREATE POLICY "report-images-authenticated-read"[\s\S]*?private\.can_read_report/i)
  assert.match(sql, /DROP POLICY IF EXISTS "report-images-read" ON storage\.objects/i)
  assert.match(sql, /CREATE TRIGGER rc19_report_scope_write_guard/i)
  assert.match(sql, /CREATE TRIGGER rc19_report_image_scope_write_guard/i)
  assert.match(sql, /CREATE TRIGGER rc19_live_report_image_scope_write_guard/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.authorize_report_image_delete[\s\S]*?private\.rc19_can_mutate_report/i)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.authorize_live_report_image_delete[\s\S]*?private\.rc19_can_mutate_report/i)
  assert.match(sql, /event_type = 'automatic_revoke'| 'automatic_revoke'/i)
  const resolver = sql.split('CREATE OR REPLACE FUNCTION private.rc19_has_leader_brand_scope')[1]?.split('CREATE OR REPLACE FUNCTION public.rc19_current_leader_brand_ids')[0] ?? ''
  assert.doesNotMatch(resolver, /department/i)
  assert.doesNotMatch(sql, /WHEN actor_role = 'leader' THEN true/i)

  const exportPermission = ROLE_DEFAULTS_CATALOG.find(item => item.permission === 'reports.export')
  assert.equal(exportPermission?.locked, true, 'reports.export stays locked until the DB and scope evidence is exact-SHA verified')
})
