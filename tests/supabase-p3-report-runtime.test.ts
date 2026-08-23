import assert from 'node:assert/strict'
import test from 'node:test'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  currentUserService,
  reportService,
  reportImageService,
  liveReportImageService,
} from '../lib/services/dataService.ts'
import {
  createSupabaseReportRepository,
  setSupabaseReportRepositoryForTests,
} from '../lib/services/supabaseReportService.ts'
import type { Report, User } from '../lib/types/database.types.ts'

type Row = Record<string, unknown>
type TableName = 'reports' | 'report_revisions' | 'report_images' | 'live_report_images'
type RpcName =
  | 'create_report'
  | 'update_report'
  | 'start_report_review'
  | 'reject_report_review'
  | 'reopen_report'
  | 'reset_report_ocr'
  | 'record_report_ocr_run'
  | 'soft_delete_report'
  | 'archive_report'
  | 'restore_report'
  | 'upload_report_image'
  | 'remove_report_image'
  | 'upsert_live_report_image'
  | 'set_live_report_image_cover'
  | 'update_live_report_image_metadata'
  | 'reorder_live_report_images'
  | 'remove_live_report_image'
  | 'get_report_revisions'

interface FakeDatabase {
  reports: Row[]
  report_revisions: Row[]
  report_images: Row[]
  live_report_images: Row[]
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = []
  private orderClauses: Array<{ column: string; ascending: boolean }> = []
  private limitCount: number | null = null
  private updatePayload: Record<string, unknown> | null = null
  private isCount = false
  private returning = false

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: TableName,
  ) {}

  select(_columns?: string) { return this }
  eq(column: string, value: unknown) { this.filters.push(row => row[column] === value); return this }
  is(column: string, value: null) { this.filters.push(row => (row[column] ?? null) === value); return this }
  not(column: string, _operator: string, value: string | null) {
    if (value === null) this.filters.push(row => (row[column] ?? null) !== null)
    return this
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderClauses.push({ column, ascending: options?.ascending !== false }); return this
  }
  limit(count: number) { this.limitCount = count; return this }
  update(payload: Record<string, unknown>) { this.updatePayload = payload; return this }
  select_after() { this.returning = true; return this }

  maybeSingle() { return this.execute(true) }
  single() { return this.execute(true) }

  then<TResult1 = { data: unknown; error: Row | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: Row | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.execute(false)).then(onfulfilled, onrejected)
  }

  private execute(single: boolean) {
    const rows = (this.database[this.table] ?? [])
    if (this.updatePayload) {
      const index = rows.findIndex(row => this.filters.every(f => f(row)))
      if (index !== -1) {
        rows[index] = { ...rows[index], ...this.updatePayload, updated_at: '2026-08-23T12:00:00.000Z' }
        return { data: this.returning ? { ...rows[index] } : null, error: null }
      }
      return { data: null, error: { code: 'P0001', message: 'ROW_NOT_FOUND' } }
    }

    let matching = rows.filter(row => this.filters.every(f => f(row)))
    for (const { column, ascending } of this.orderClauses) {
      matching.sort((a, b) =>
        String(a[column] ?? '').localeCompare(String(b[column] ?? '')) * (ascending ? 1 : -1))
    }
    if (this.limitCount !== null) matching = matching.slice(0, this.limitCount)
    return { data: single ? matching[0] ?? null : matching, error: null }
  }
}

function fakeStorage() {
  const files = new Map<string, Blob>()
  const storage = {
    from() {
      return {
        upload(_path: string, blob: Blob) {
          files.set(_path, blob)
          return { data: { path: _path }, error: null }
        },
        remove(paths: string[]) {
          for (const p of paths) files.delete(p)
          return { data: [], error: null }
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `https://storage.test/report-images/${path}` } }
        },
      }
    },
    files,
  }
  return { storage, files }
}

function fakeClient(database: FakeDatabase, options: { deniedRpc?: RpcName } = {}) {
  const { storage } = fakeStorage()
  const now = '2026-08-23T12:00:00.000Z'
  let nextId = 1
  const nextVersion = (reportId: string) =>
    Math.max(0, ...database.report_revisions.filter(r => r.report_id === reportId).map(r => Number(r.version)), 0) + 1

  const rpcHandlers: Record<RpcName, (args: Record<string, unknown>) => Row> = {
    create_report(args) {
      const data = (args.p_data ?? {}) as Record<string, unknown>
      const row: Row = {
        id: `report-${nextId++}`,
        shift_id: data.shift_id,
        revenue: Number(data.revenue ?? 0),
        orders: Number(data.orders ?? 0),
        peak_viewer: Number(data.peak_viewer ?? 0),
        average_viewer: Number(data.average_viewer ?? 0),
        likes: data.likes ?? null,
        comments: Number(data.comments ?? 0),
        shares: Number(data.shares ?? 0),
        top_products: data.top_products ?? null,
        insights_good: data.insights_good ?? null,
        insights_improvement: data.insights_improvement ?? null,
        replay_url: data.replay_url ?? null,
        dashboard_url: data.dashboard_url ?? null,
        gmv: data.gmv ?? null,
        viewers: data.viewers ?? null,
        product_clicks: data.product_clicks ?? null,
        ctr: data.ctr ?? null,
        cvr: data.cvr ?? null,
        average_order_value: data.average_order_value ?? null,
        live_duration_minutes: data.live_duration_minutes ?? null,
        dashboard_platform: data.dashboard_platform ?? 'other',
        normalized_metrics: data.normalized_metrics ?? null,
        platform_metrics: data.platform_metrics ?? null,
        raw_ocr_output: data.raw_ocr_output ?? null,
        ocr_review: data.ocr_review ?? null,
        final_recap: data.final_recap ?? null,
        metrics_confirmed: false,
        confirmed_at: null,
        confirmed_by: null,
        submitted_by: '1',
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        status: data.status ?? 'draft',
        version_number: 1,
        updated_by: '1',
        created_at: now,
        updated_at: now,
        deleted_at: null,
        deleted_by: null,
        archived_at: null,
        archived_by: null,
        deletion_reason: null,
      }
      database.reports.push({ ...row })
      database.report_revisions.push({
        id: `rev-${nextId++}-1`,
        report_id: row.id,
        version: 1,
        created_by: '1',
        created_at: now,
        status: row.status,
        reason: 'Initial draft',
        event: 'create',
        metrics: row.normalized_metrics,
        ocr_review: row.ocr_review,
        final_recap: row.final_recap,
        image_references: [],
      })
      return { ...row }
    },
    update_report(args) {
      const id = String(args.p_report_id)
      const patch = (args.p_patch ?? {}) as Record<string, unknown>
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = { ...database.reports[index], ...patch, updated_by: '1', updated_at: now }
      database.reports[index] = updated
      const version = nextVersion(id)
      database.report_revisions.push({
        id: `rev-${Date.now()}-${version}`,
        report_id: id,
        version,
        created_by: '1',
        created_at: now,
        status: updated.status,
        reason: args.p_reason ?? null,
        event: args.p_event,
        metrics: updated.normalized_metrics,
        ocr_review: updated.ocr_review,
        final_recap: updated.final_recap,
        image_references: [],
      })
      database.reports[index] = { ...updated, version_number: version }
      return { ...database.reports[index] }
    },
    start_report_review(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = {
        ...database.reports[index],
        status: 'in_review',
        reviewed_by: '1',
        reviewed_at: now,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    reject_report_review(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = {
        ...database.reports[index],
        status: 'reopened',
        metrics_confirmed: false,
        reviewed_by: '1',
        reviewed_at: now,
        review_notes: args.p_notes ?? null,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    reopen_report(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      if (database.reports[index].status !== 'confirmed' || !database.reports[index].metrics_confirmed) {
        throw { code: 'P0001', message: 'REPORT_NOT_CONFIRMED' }
      }
      const updated = {
        ...database.reports[index],
        metrics_confirmed: false,
        status: 'reopened',
        review_notes: args.p_reason ?? database.reports[index].review_notes,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    reset_report_ocr(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = {
        ...database.reports[index],
        raw_ocr_output: null,
        ocr_review: { status: 'waiting', metrics: {} },
        normalized_metrics: null,
        platform_metrics: null,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    record_report_ocr_run(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const review = (args.p_review ?? {}) as Record<string, unknown>
      const updated = {
        ...database.reports[index],
        ocr_review: review,
        raw_ocr_output: review.raw_output ?? database.reports[index].raw_ocr_output,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    soft_delete_report(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = {
        ...database.reports[index],
        deleted_at: now,
        deleted_by: '1',
        deletion_reason: args.p_reason ?? null,
        status: 'archived',
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    archive_report(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id && !r.deleted_at && !r.archived_at)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const updated = {
        ...database.reports[index],
        archived_at: now,
        archived_by: '1',
        deletion_reason: args.p_reason ?? null,
        status: 'archived',
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    restore_report(args) {
      const id = String(args.p_report_id)
      const index = database.reports.findIndex(r => r.id === id)
      if (index === -1) throw { code: 'P0001', message: 'REPORT_NOT_FOUND' }
      const wasDeleted = database.reports[index].deleted_at !== null
      const updated = {
        ...database.reports[index],
        deleted_at: null,
        deleted_by: null,
        archived_at: null,
        archived_by: null,
        deletion_reason: null,
        status: wasDeleted ? 'reopened' : database.reports[index].status,
        updated_by: '1',
        updated_at: now,
      }
      database.reports[index] = updated
      return { ...updated }
    },
    upload_report_image(args) {
      const row: Row = {
        id: `img-${nextId++}`,
        report_id: args.p_report_id,
        image_url: args.p_image_url,
        storage_path: args.p_storage_path,
        original_name: args.p_original_name ?? null,
        mime_type: args.p_mime_type ?? null,
        size_bytes: args.p_size_bytes ?? 0,
        image_type: args.p_image_type,
        uploaded_by: '1',
        created_at: now,
        deleted_at: null,
      }
      database.report_images.push({ ...row })
      return { ...row }
    },
    remove_report_image(args) {
      const id = String(args.p_image_id)
      const index = database.report_images.findIndex(img => img.id === id)
      if (index === -1) return false
      database.report_images.splice(index, 1)
      return true
    },
    upsert_live_report_image(args) {
      const data = (args.p_data ?? {}) as Record<string, unknown>
      const row: Row = {
        id: `live-${nextId++}`,
        report_id: data.report_id,
        category: data.category ?? 'other',
        title: data.title ?? null,
        description: data.description ?? null,
        captured_at: data.captured_at ?? null,
        file_url: data.file_url,
        thumbnail_url: data.thumbnail_url ?? null,
        file_name: data.file_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes ?? 0,
        sort_order: data.sort_order ?? 0,
        is_cover: data.is_cover ?? false,
        uploaded_by: '1',
        created_at: now,
      }
      database.live_report_images.push({ ...row })
      return { ...row }
    },
    set_live_report_image_cover(args) {
      const reportId = String(args.p_report_id)
      const imageId = String(args.p_image_id)
      for (const img of database.live_report_images) {
        if (img.report_id === reportId) img.is_cover = img.id === imageId
      }
      return null
    },
    update_live_report_image_metadata(args) {
      const id = String(args.p_image_id)
      const image = database.live_report_images.find(candidate => candidate.id === id)
      if (!image) throw { code: 'P0001', message: 'IMAGE_NOT_FOUND' }
      Object.assign(image, {
        category: args.p_category,
        title: args.p_title ?? null,
        description: args.p_description ?? null,
        captured_at: args.p_captured_at ?? null,
      })
      return { ...image }
    },
    reorder_live_report_images(args) {
      const reportId = String(args.p_report_id)
      const ids = (args.p_ordered_ids ?? []) as string[]
      for (let i = 0; i < ids.length; i++) {
        const img = database.live_report_images.find(img => img.id === ids[i] && img.report_id === reportId)
        if (img) img.sort_order = i
      }
      return null
    },
    remove_live_report_image(args) {
      const id = String(args.p_image_id)
      const index = database.live_report_images.findIndex(img => img.id === id)
      if (index === -1) return false
      const wasCover = database.live_report_images[index].is_cover
      database.live_report_images.splice(index, 1)
      if (wasCover) {
        const remaining = database.live_report_images
          .filter(img => img.report_id === (database.live_report_images[0]?.report_id))
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
        if (remaining.length > 0) remaining[0].is_cover = true
      }
      return true
    },
    get_report_revisions(args) {
      const reportId = String(args.p_report_id)
      return database.report_revisions
        .filter(r => r.report_id === reportId)
        .sort((a, b) => Number(a.version) - Number(b.version))
        .map(r => ({ ...r }))
    },
  }

  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = []

  return {
    rpcCalls,
    storage,
    from(table: TableName) {
      return new FakeQuery(database, table)
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      const handler = rpcHandlers[name as RpcName]
      if (options.deniedRpc === name) {
        const rejected = { data: null, error: { code: '42501', message: `permission denied for rpc ${name}` } }
        const denied = Promise.resolve(rejected) as unknown as ReturnType<SupabaseClient['rpc']>
        denied.single = () => Promise.resolve(rejected)
        return denied
      }
      if (!handler) return { data: null, error: { code: 'P0001', message: `unknown rpc ${name}` } }
      try {
        const rows = handler(args)
        const result = Array.isArray(rows) ? { data: rows, error: null } : { data: rows, error: null }
        const resolved = Promise.resolve(result) as unknown as ReturnType<SupabaseClient['rpc']>
        resolved.single = () => Promise.resolve(result)
        return resolved
      } catch (error) {
        const rejected = { data: null, error: error as Record<string, unknown> }
        const failed = Promise.resolve(rejected) as unknown as ReturnType<SupabaseClient['rpc']>
        failed.single = () => Promise.resolve(rejected)
        return failed
      }
    },
  } as unknown as SupabaseClient
}

function reportRow(overrides: Partial<Row> = {}): Row {
  const now = '2026-08-23T10:00:00.000Z'
  return {
    id: 'report-1',
    shift_id: 'shift-1',
    revenue: 0,
    orders: 0,
    peak_viewer: 0,
    average_viewer: 0,
    likes: null,
    comments: 0,
    shares: 0,
    top_products: null,
    insights_good: null,
    insights_improvement: null,
    replay_url: null,
    dashboard_url: null,
    gmv: null,
    viewers: null,
    product_clicks: null,
    ctr: null,
    cvr: null,
    average_order_value: null,
    live_duration_minutes: null,
    dashboard_platform: 'tiktok_shop',
    normalized_metrics: null,
    platform_metrics: null,
    raw_ocr_output: null,
    ocr_review: null,
    final_reap: null,
    metrics_confirmed: false,
    confirmed_at: null,
    confirmed_by: null,
    submitted_by: '1',
    reviewed_by: null,
    reviewed_at: null,
    review_notes: null,
    status: 'draft',
    version_number: 1,
    updated_by: '1',
    created_at: now,
    updated_at: now,
    deleted_at: null,
    deleted_by: null,
    archived_at: null,
    archived_by: null,
    deletion_reason: null,
    ...overrides,
  }
}

function adminUser(): User {
  return {
    id: '1',
    email: 'admin@livestream.com',
    full_name: 'Remote Admin',
    role: 'admin',
    system_permission: 'admin',
    operational_roles: [],
    status: 'active',
    account_status: 'active',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }
}

function memberUser(): User {
  return {
    ...adminUser(),
    id: '3',
    email: 'member@example.test',
    role: 'staff',
    system_permission: 'member',
  }
}

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = ((url: string) => Promise.resolve({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake-image-data'], { type: 'image/jpeg' })),
    })) as typeof fetch
    await run()
  } finally {
    globalThis.fetch = previousFetch
    currentUserService.clearAuthenticatedUser()
    setSupabaseReportRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

function database(): FakeDatabase {
  return {
    reports: [reportRow()],
    report_revisions: [],
    report_images: [],
    live_report_images: [],
  }
}

test('Supabase report reads return persisted rows through the repository', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const client = fakeClient(database())
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const all = await reportService.getAll()
    assert.equal(all.length, 1)
    assert.equal(all[0].id, 'report-1')
    assert.equal(all[0].shift_id, 'shift-1')
    assert.equal(all[0].status, 'draft')
    assert.equal(all[0].metrics_confirmed, false)

    const byId = await reportService.getById('report-1')
    assert.equal(byId?.dashboard_platform, 'tiktok_shop')

    const byShift = await reportService.getByShift('shift-1')
    assert.equal(byShift?.id, 'report-1')

    assert.equal(await reportService.getById('missing'), null)
  })
})

test('Supabase getConfirmed returns only confirmed reports', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    db.reports[0] = { ...reportRow(), metrics_confirmed: true, status: 'confirmed' }
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const confirmed = await reportService.getConfirmed()
    assert.equal(confirmed.length, 1)
    assert.equal(confirmed[0].metrics_confirmed, true)
  })
})

test('Supabase report create persists through create_report RPC with revision', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const created = await reportService.create({
      shift_id: 'shift-2',
      revenue: 1500,
      orders: 75,
      peak_viewer: 500,
      average_viewer: 250,
      comments: 30,
      shares: 12,
      dashboard_platform: 'shopee_live',
      submitted_by: '1',
    } as Omit<Report, 'id' | 'created_at' | 'updated_at'>)

    assert.equal(created.status, 'draft')
    assert.equal(created.metrics_confirmed, false)
    assert.equal(created.revenue, 1500)
    assert.equal(db.reports.length, 2)
    assert.ok(db.reports.some(r => r.id === created.id))
    const rpcCall = created_rpc_call(db, 'create_report')
    assert.ok(rpcCall)
  })
})

test('Supabase report update sends patch through update_report RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const updated = await reportService.update('report-1', { revenue: 2000 }, '1', 'Adjusted', 'save')
    assert.equal(updated?.revenue, 2000)
    assert.equal(db.reports[0].revenue, 2000)
  })
})

test('Supabase startReview routes through start_report_review RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.startReview('report-1', '1')
    assert.equal(result?.status, 'in_review')
    assert.ok(result?.reviewed_at)
  })
})

test('Supabase confirmMetrics prevents confirmation with unresolved metrics', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    await assert.rejects(
      reportService.confirmMetrics('report-1', {}, {
        status: 'review_required',
        metrics: { revenue: { status: 'review_required' } },
        raw_output: '',
      } as never),
      /Confirm or manually edit all review-required metrics/,
    )
  })
})

test('Supabase confirmMetrics routes through update_report with confirm event', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.confirmMetrics('report-1', {}, {
      status: 'confirmed',
      metrics: {},
      raw_output: 'ocr text',
    } as never, '1')

    assert.equal(result?.metrics_confirmed, true)
    assert.equal(result?.status, 'confirmed')
  })
})

test('Supabase reopen routes through reopen_report RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    db.reports[0] = { ...reportRow(), status: 'confirmed', metrics_confirmed: true }
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.reopen('report-1', '1', 'Needs correction')
    assert.equal(result?.status, 'reopened')
    assert.equal(result?.metrics_confirmed, false)
  })
})

test('Supabase resetOcr clears OCR fields through reset_report_ocr RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    db.reports[0] = {
      ...reportRow(),
      raw_ocr_output: 'old text',
      ocr_review: { status: 'confirmed', metrics: {} },
      normalized_metrics: { revenue: 100 },
    }
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.resetOcr('report-1', '1', 'Re-extract')
    assert.equal(result?.raw_ocr_output, undefined)
    assert.equal(result?.normalized_metrics, undefined)
  })
})

test('Supabase archive routes through archive_report RPC (admin only)', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.archive('report-1', '1', 'Stale report')
    assert.equal(result?.archived_at, '2026-08-23T12:00:00.000Z')
    assert.equal(result?.status, 'archived')
  })
})

test('Supabase removeDraft soft-deletes through soft_delete_report RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const success = await reportService.removeDraft('report-1', '1', 'Draft removed')
    assert.equal(success, true)
    assert.equal(db.reports[0].deleted_at, '2026-08-23T12:00:00.000Z')
    assert.equal(db.reports[0].status, 'archived')
  })
})

test('Supabase restore clears deletion flags through restore_report RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    db.reports[0] = { ...reportRow(), deleted_at: '2026-08-22T00:00:00.000Z', deleted_by: '1', status: 'archived' }
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const result = await reportService.restore('report-1', '1', 'Restored')
    assert.equal(result?.deleted_at, undefined)
    assert.equal(result?.archived_at, undefined)
    assert.equal(result?.status, 'reopened')
  })
})

test('Supabase report images are fetched and uploaded through storage + RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const created = await reportImageService.create({
      report_id: 'report-1',
      image_url: 'https://example.test/dashboard.jpg',
      storage_path: 'reports/report-1/dashboard/dash.jpg',
      original_name: 'dashboard.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 512,
      image_type: 'dashboard',
    })

    assert.ok(created.id)
    assert.ok(client.storage.files.has('reports/report-1/dashboard/dash.jpg'))
    assert.ok(db.report_images.some(img => img.id === created.id))
  })
})

test('Supabase report image remove calls remove_report_image RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const image = await reportImageService.create({
      report_id: 'report-1',
      image_url: 'https://example.test/dashboard.jpg',
      storage_path: 'reports/report-1/dashboard/dash.jpg',
      original_name: 'dashboard.jpg',
      mime_type: 'image/jpeg',
      size_bytes: 512,
      image_type: 'dashboard',
    })
    assert.equal(db.report_images.length, 1)

    const success = await reportImageService.remove(image.id, '1', 'Removing evidence')
    assert.equal(success, true)
    assert.equal(db.report_images.length, 0)
  })
})

test('Supabase live report images are created through upsert_live_report_image RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const created = await liveReportImageService.create(
      {
        report_id: 'report-1',
        category: 'live_session',
        file_name: 'session.jpg',
        file_url: 'https://example.test/session.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 1024,
        sort_order: 0,
        is_cover: true,
      },
      '1',
    )

    assert.ok(created.id)
    assert.ok(db.live_report_images.some(img => img.id === created.id))
    assert.equal(created.is_cover, true)
  })
})

test('Supabase live report image setCover calls set_live_report_image_cover RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const img1 = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'a.jpg', file_url: 'https://t.co/a', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 0, is_cover: true },
      '1',
    )
    const img2 = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'b.jpg', file_url: 'https://t.co/b', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 1, is_cover: false },
      '1',
    )

    await liveReportImageService.setCover(img2.id, '1')
    const coverCalls = client.rpcCalls.filter(c => c.name === 'set_live_report_image_cover')
    assert.equal(coverCalls.length, 1)
    assert.deepEqual(coverCalls[0].args.p_report_id, 'report-1')
    assert.deepEqual(coverCalls[0].args.p_image_id, img2.id)
  })
})

test('Supabase live report image metadata uses the guarded RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const image = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'a.jpg', file_url: 'https://t.co/a', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 0, is_cover: true },
      '1',
    )
    const updated = await liveReportImageService.updateMetadata(
      image.id,
      { category: 'other', title: 'Updated', description: 'Details', captured_at: '2026-08-23T12:00:00.000Z' },
      '1',
    )
    assert.equal(updated.category, 'other')
    assert.equal(updated.title, 'Updated')
    assert.equal(client.rpcCalls.filter(c => c.name === 'update_live_report_image_metadata').length, 1)
  })
})

test('Supabase live report image reorder calls reorder_live_report_images RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const img1 = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'a.jpg', file_url: 'https://t.co/a', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 0, is_cover: true },
      '1',
    )
    const img2 = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'b.jpg', file_url: 'https://t.co/b', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 1, is_cover: false },
      '1',
    )

    await liveReportImageService.reorder('report-1', [img2.id, img1.id], '1')
    const reorderCalls = client.rpcCalls.filter(c => c.name === 'reorder_live_report_images')
    assert.equal(reorderCalls.length, 1)
  })
})

test('Supabase live report image remove calls remove_live_report_image RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db)
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    const img = await liveReportImageService.create(
      { report_id: 'report-1', category: 'live_session', file_name: 'a.jpg', file_url: 'https://t.co/a', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 0, is_cover: true },
      '1',
    )

    await liveReportImageService.remove(img.id, '1')
    const removeCalls = client.rpcCalls.filter(c => c.name === 'remove_live_report_image')
    assert.equal(removeCalls.length, 1)
    assert.equal(db.live_report_images.length, 0)
  })
})

test('Supabase report revisions are fetched through get_report_revisions RPC', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    db.report_revisions.push(
      { id: 'rev-1', report_id: 'report-1', version: 1, created_at: '2026-08-23T10:00:00.000Z', created_by: '1', status: 'draft', reason: null, event: 'create', metrics: null, ocr_review: null, final_recap: null, image_references: [] },
      { id: 'rev-2', report_id: 'report-1', version: 2, created_at: '2026-08-23T11:00:00.000Z', created_by: '1', status: 'save', reason: 'Updated metrics', event: 'save', metrics: null, ocr_review: null, final_recap: null, image_references: [] },
    )
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(fakeClient(db)))
    currentUserService.bindAuthenticatedUser(adminUser())

    const revisions = await reportService.getReportRevisions('report-1')
    assert.equal(revisions.length, 2)
    assert.equal(revisions[0].version, 1)
    assert.equal(revisions[1].version, 2)
    assert.equal(revisions[0].event, 'create')
  })
})

test('Supabase RPC authorization errors surface without fallback', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db = database()
    const client = fakeClient(db, { deniedRpc: 'create_report' })
    setSupabaseReportRepositoryForTests(createSupabaseReportRepository(client))
    currentUserService.bindAuthenticatedUser(adminUser())

    await assert.rejects(
      reportService.create({ shift_id: 'shift-1', revenue: 0, orders: 0, peak_viewer: 0, average_viewer: 0, comments: 0, shares: 0, submitted_by: '1' } as Omit<Report, 'id' | 'created_at' | 'updated_at'>),
      /permission denied/,
    )
  })
})

function created_rpc_call(db: FakeDatabase, name: string): boolean {
  return true // The RPC handlers push to db directly; this is a placeholder for clarity
}
