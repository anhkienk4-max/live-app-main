import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { scheduleImportBatchPort } from '../lib/services/scheduleImportBatchPort.ts'
import {
  createSupabaseScheduleImportPort,
  ScheduleImportRequestError,
  setSupabaseScheduleImportPortForTests,
} from '../lib/services/supabaseScheduleImportService.ts'
import type { ScheduleImportRow } from '../lib/types/database.types.ts'
import type { ImportBatchSummary } from '../lib/utils/scheduleImportBatch.ts'
import { isScheduleImportDuplicateError } from '../lib/utils/scheduleImportBatch.ts'

type Row = Record<string, unknown>

interface FakeDatabase {
  batches: Row[]
  rows: Row[]
  shifts: Array<{ id: string; import_batch_id: string | null }>
}

type ImportRpcName =
  | 'create_schedule_import_batch'
  | 'update_schedule_import_batch_preview'
  | 'record_schedule_import_batch_outcomes'
  | 'confirm_schedule_import_batch'
  | 'fail_schedule_import_batch'
  | 'cancel_schedule_import_batch'

interface FakeClientOptions {
  deniedRpc?: ImportRpcName
}

const NOW = '2026-08-20T09:00:00.000Z'

function syncCounts(database: FakeDatabase, batchId: string) {
  const batch = database.batches.find(item => item.id === batchId)
  if (!batch) return
  const batchRows = database.rows.filter(item => item.batch_id === batchId)
  batch.imported_rows = batchRows.filter(item => ['imported', 'warning'].includes(String(item.outcome))).length
  batch.duplicate_rows = batchRows.filter(item => item.outcome === 'duplicate_skipped').length
  batch.failed_rows = batchRows.filter(item => item.outcome === 'validation_failed').length
  batch.retryable_rows = batchRows.filter(item => item.outcome === 'retryable').length
}

function insertRows(database: FakeDatabase, batchId: string, rows: Row[]) {
  rows.forEach(row => {
    database.rows.push({
      id: `${batchId}-row-${database.rows.length + 1}`,
      batch_id: batchId,
      row_number: Number(row.row_number ?? 0),
      outcome: 'pending',
      shift_id: null,
      source_row: row,
      failure_code: null,
      created_at: NOW,
      updated_at: NOW,
    })
  })
}

class FakeBatchQuery {
  private filters: Array<(row: Row) => boolean> = []
  private orderColumn: string | null = null
  private ascending = true
  private maybe = false

  constructor(private readonly rows: Row[]) {}

  select() {
    return this
  }

  is(column: string, value: null) {
    this.filters.push(row => (row[column] ?? null) === value)
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column
    this.ascending = options?.ascending ?? true
    return this
  }

  maybeSingle() {
    this.maybe = true
    return this
  }

  then(
    onfulfilled?: ((value: { data: Row[] | Row | null; error: Row | null }) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null,
  ) {
    const matching = this.rows.filter(row => this.filters.every(filter => filter(row)))
    const ordered = this.orderColumn
      ? [...matching].sort((left, right) => {
          const comparison = String(left[this.orderColumn!]).localeCompare(
            String(right[this.orderColumn!]),
            undefined,
            { numeric: true },
          )
          return this.ascending ? comparison : -comparison
        })
      : matching
    const data = this.maybe ? ordered[0] ?? null : ordered
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected)
  }
}

function rpcResponse(result: { data: Row | null; error: Row | null }) {
  const promise = Promise.resolve(result) as Promise<{ data: Row | null; error: Row | null }> & {
    single: () => Promise<{ data: Row | null; error: Row | null }>
  }
  promise.single = () => Promise.resolve(result)
  return promise
}

function fakeClient(database: FakeDatabase, options: FakeClientOptions = {}) {
  const handlers: Record<ImportRpcName, (args: Record<string, unknown>) => Row | null> = {
    create_schedule_import_batch(args) {
      const summary = (args.p_summary ?? {}) as Record<string, unknown>
      const batch: Row = {
        id: `import-batch-${database.batches.length + 1}`,
        source: String(args.p_source ?? 'excel'),
        source_name: String(args.p_source_name ?? ''),
        status: 'previewed',
        total_rows: Number(summary.total_rows ?? 0),
        valid_rows: Number(summary.valid_rows ?? 0),
        invalid_rows: Number(summary.invalid_rows ?? 0),
        warning_rows: Number(summary.warning_rows ?? 0),
        duplicate_rows: Number(summary.duplicate_rows ?? 0),
        imported_rows: 0,
        failed_rows: 0,
        retryable_rows: 0,
        created_by: '1',
        created_at: NOW,
        updated_at: NOW,
        confirmed_at: null,
        deleted_at: null,
        deleted_by: null,
        deletion_reason: null,
      }
      database.batches.push({ ...batch })
      insertRows(database, batch.id, (Array.isArray(args.p_rows) ? args.p_rows : []) as Row[])
      return { ...batch }
    },
    update_schedule_import_batch_preview(args) {
      const id = String(args.p_batch_id ?? '')
      const index = database.batches.findIndex(item => item.id === id)
      if (index === -1) throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_FOUND' }
      if (database.batches[index].status !== 'previewed') throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_PREVIEWED' }
      if (database.rows.some(row => row.batch_id === id && row.outcome !== 'pending')) {
        throw { code: 'P0001', message: 'IMPORT_BATCH_ROWS_ALREADY_RECORDED' }
      }
      const summary = (args.p_summary ?? {}) as Record<string, unknown>
      database.batches[index] = {
        ...database.batches[index],
        total_rows: Number(summary.total_rows ?? 0),
        valid_rows: Number(summary.valid_rows ?? 0),
        invalid_rows: Number(summary.invalid_rows ?? 0),
        warning_rows: Number(summary.warning_rows ?? 0),
        duplicate_rows: Number(summary.duplicate_rows ?? 0),
        updated_at: NOW,
      }
      database.rows = database.rows.filter(item => item.batch_id !== id)
      insertRows(database, id, (Array.isArray(args.p_rows) ? args.p_rows : []) as Row[])
      return { ...database.batches[index] }
    },
    record_schedule_import_batch_outcomes(args) {
      const id = String(args.p_batch_id ?? '')
      const batch = database.batches.find(item => item.id === id)
      if (!batch) throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_FOUND' }
      if (!['previewed', 'failed', 'confirmed'].includes(String(batch.status))) {
        throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_ACTIVE' }
      }
      const outcomes = (Array.isArray(args.p_outcomes) ? args.p_outcomes : []) as Array<Record<string, unknown>>
      for (const item of outcomes) {
        const target = database.rows.find(row => row.batch_id === id && row.row_number === Number(item.row_number))
        if (!target) throw { code: 'P0001', message: 'IMPORT_ROW_NOT_FOUND' }
        if (['imported', 'warning', 'duplicate_skipped'].includes(String(target.outcome))) {
          const requestedOutcome = String(item.outcome ?? '')
          const requestedShiftId = (item.shift_id as string | undefined) ?? null
          if (
            target.outcome === requestedOutcome
            && (requestedOutcome === 'duplicate_skipped' || target.shift_id === requestedShiftId)
          ) continue
          throw { code: 'P0001', message: 'IMPORT_ROW_ALREADY_FINALIZED' }
        }
        if (batch.status === 'confirmed') throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_ACTIVE' }
        if (target.outcome !== item.expected_outcome) {
          throw { code: 'P0001', message: 'IMPORT_ROW_OUTCOME_CONFLICT' }
        }
        const outcome = String(item.outcome ?? 'pending')
        if (['imported', 'warning'].includes(outcome)) {
          const shiftId = (item.shift_id as string | undefined) ?? ''
          const shift = database.shifts.find(candidate => candidate.id === shiftId)
          if (!shift || shift.import_batch_id !== id) {
            throw { code: '22023', message: 'IMPORT_OUTCOME_SHIFT_MISMATCH' }
          }
        }
        target.outcome = outcome
        target.shift_id = (item.shift_id as string | undefined) ?? null
        target.failure_code = (item.failure_code as string | undefined) ?? null
        target.updated_at = NOW
      }
      return null
    },
    confirm_schedule_import_batch(args) {
      const id = String(args.p_batch_id ?? '')
      const batch = database.batches.find(item => item.id === id)
      if (!batch) throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_FOUND' }
      if (batch.status === 'confirmed') {
        if (database.rows.some(row => row.batch_id === id && ['pending', 'retryable'].includes(String(row.outcome)))) {
          throw { code: 'P0001', message: 'IMPORT_BATCH_UNRESOLVED_ROWS' }
        }
        syncCounts(database, id)
        return { ...batch }
      }
      if (!['previewed', 'failed'].includes(String(batch.status))) {
        throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_ACTIVE' }
      }
      const unresolved = database.rows.some(row => {
        if (row.batch_id !== id) return false
        if (row.outcome === 'retryable') return true
        if (row.outcome !== 'pending') return false
        const sourceRow = row.source_row as Row
        return !(Array.isArray(sourceRow?.errors) && sourceRow.errors.length > 0)
      })
      if (unresolved) throw { code: 'P0001', message: 'IMPORT_BATCH_UNRESOLVED_ROWS' }
      batch.status = 'confirmed'
      batch.confirmed_at = NOW
      for (const row of database.rows.filter(item => item.batch_id === id && item.outcome === 'pending')) {
        const sourceRow = row.source_row as Row
        const errors = Array.isArray(sourceRow?.errors) ? sourceRow.errors : []
        row.outcome = errors.length > 0 ? 'validation_failed' : 'duplicate_skipped'
        row.updated_at = NOW
      }
      syncCounts(database, id)
      return { ...batch }
    },
    fail_schedule_import_batch(args) {
      const id = String(args.p_batch_id ?? '')
      const batch = database.batches.find(item => item.id === id)
      if (!batch) throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_FOUND' }
      if (!['previewed', 'failed'].includes(String(batch.status))) {
        throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_ACTIVE' }
      }
      batch.status = 'failed'
      syncCounts(database, id)
      return { ...batch }
    },
    cancel_schedule_import_batch(args) {
      const id = String(args.p_batch_id ?? '')
      const batch = database.batches.find(item => item.id === id)
      if (!batch) throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_FOUND' }
      if (!['previewed', 'failed'].includes(String(batch.status))) {
        throw { code: 'P0001', message: 'IMPORT_BATCH_NOT_REMOVABLE' }
      }
      batch.status = 'cancelled'
      batch.deleted_at = NOW
      batch.deleted_by = '1'
      batch.deletion_reason = String(args.p_reason ?? '') || null
      syncCounts(database, id)
      return { ...batch }
    },
  }

  return {
    rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
    from(table: string) {
      if (table === 'schedule_import_batches') return new FakeBatchQuery(database.batches)
      if (table === 'schedule_import_batch_rows') return new FakeBatchQuery(database.rows)
      throw new Error(`Unexpected table ${table}`)
    },
    rpc(name: string, args: Record<string, unknown>) {
      this.rpcCalls.push({ name, args })
      const handler = handlers[name as ImportRpcName]
      if (!handler) return rpcResponse({ data: null, error: { code: 'P0001', message: `unknown rpc ${name}` } })
      if (options.deniedRpc === name) {
        return rpcResponse({ data: null, error: { code: '42501', message: `permission denied for rpc ${name}` } })
      }
      try {
        return rpcResponse({ data: handler(args), error: null })
      } catch (error) {
        return rpcResponse({ data: null, error: error as Row })
      }
    },
  } as unknown as SupabaseClient
}

function previewRow(rowNumber: number, overrides: Partial<ScheduleImportRow> = {}): ScheduleImportRow {
  return {
    row_number: rowNumber,
    date: '2026-09-01',
    start_time: '09:00',
    end_time: '13:00',
    brand_name: 'Mars Wrigley',
    platform_name: 'Shopee Live',
    title: 'Morning shift',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    warnings: [],
    errors: [],
    ...overrides,
  }
}

const summary: ImportBatchSummary = {
  total_rows: 3,
  imported_rows: 1,
  failed_rows: 1,
  warning_rows: 0,
  duplicate_rows: 1,
  pending_rows: 0,
}

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    await run()
  } finally {
    setSupabaseScheduleImportPortForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('supabase port createBatch persists a previewed batch with pending rows', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2), previewRow(3, { errors: ['Brand "X" was not found.'] })],
    })

    assert.equal(batch.status, 'previewed')
    assert.equal(batch.source_name, 'mars.xlsx')
    assert.equal(batch.imported_rows, 0)
    assert.equal(db.batches.length, 1)
    assert.equal(db.rows.length, 2)
    assert.ok(db.rows.every(row => row.outcome === 'pending'))
    const createCall = client.rpcCalls.find(call => call.name === 'create_schedule_import_batch')
    assert.ok(createCall, 'create_schedule_import_batch RPC was called')
    assert.equal(createCall.args.p_source, 'excel')
    assert.equal(createCall.args.p_source_name, 'mars.xlsx')
    assert.equal((createCall.args.p_rows as unknown[]).length, 2)
  })
})

test('supabase port lists canonical batch rows in source-row order', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const port = createSupabaseScheduleImportPort(fakeClient(db))
    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'ordered.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(5), previewRow(2)],
    })

    const rows = await port.listBatchRows(batch.id)
    assert.deepEqual(rows.map(row => row.source_row_number), [2, 5])
    assert.ok(rows.every(row => row.status === 'pending'))
    assert.equal(rows[0]?.normalized_values.title, 'Morning shift')
  })
})

test('supabase port linkRowToShift records imported and warning outcomes with shift ids', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'google_sheets',
      sourceName: 'mock://schedule',
      createdBy: '1',
      summary,
      previewRows: [
        previewRow(2),
        previewRow(5, { warnings: ['Ends on the next day (2026-09-02).'] }),
      ],
    })

    db.shifts.push(
      { id: 'shift-1', import_batch_id: batch.id },
      { id: 'shift-2', import_batch_id: batch.id },
    )

    await port.linkRowToShift(batch.id, 2, 'shift-1', 'pending')
    await port.linkRowToShift(batch.id, 5, 'shift-2', 'pending', 'warning')

    const row2 = db.rows.find(row => row.row_number === 2)
    assert.equal(row2?.outcome, 'imported')
    assert.equal(row2?.shift_id, 'shift-1')
    const row5 = db.rows.find(row => row.row_number === 5)
    assert.equal(row5?.outcome, 'warning')
    assert.equal(row5?.shift_id, 'shift-2')
    const outcomeCalls = client.rpcCalls.filter(call => call.name === 'record_schedule_import_batch_outcomes')
    assert.equal(outcomeCalls.length, 2)
  })
})

test('supabase port marks rows retryable with failure codes and duplicate rows skipped', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2), previewRow(3)],
    })

    await port.markRowRetryable(batch.id, 2, 'SHIFT_REQUEST_FAILED', 'pending')
    await port.recordRowOutcome(batch.id, 3, 'duplicate_skipped', { expectedOutcome: 'pending' })

    const row2 = db.rows.find(row => row.row_number === 2)
    assert.equal(row2?.outcome, 'retryable')
    assert.equal(row2?.failure_code, 'SHIFT_REQUEST_FAILED')
    assert.equal(row2?.shift_id, null)
    const row3 = db.rows.find(row => row.row_number === 3)
    assert.equal(row3?.outcome, 'duplicate_skipped')
    assert.equal(row3?.shift_id, null)
  })
})

test('supabase port distinguishes missing, stale, and finalized outcome writes', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const port = createSupabaseScheduleImportPort(fakeClient(db))
    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'cas.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2), previewRow(3)],
    })

    await port.markRowRetryable(batch.id, 2, 'NETWORK_TIMEOUT', 'pending')
    await assert.rejects(
      port.recordRowOutcome(batch.id, 2, 'duplicate_skipped', { expectedOutcome: 'pending' }),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_ROW_OUTCOME_CONFLICT/.test(error.message),
    )

    await port.recordRowOutcome(batch.id, 3, 'duplicate_skipped', { expectedOutcome: 'pending' })
    await assert.rejects(
      port.recordRowOutcome(batch.id, 3, 'retryable', {
        expectedOutcome: 'pending',
        failureCode: 'NETWORK_TIMEOUT',
      }),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_ROW_ALREADY_FINALIZED/.test(error.message),
    )

    await assert.rejects(
      port.recordRowOutcome(batch.id, 99, 'duplicate_skipped', { expectedOutcome: 'pending' }),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_ROW_NOT_FOUND/.test(error.message),
    )
  })
})

test('supabase port confirm finalizes pending rows and syncs outcome counters', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [
        previewRow(2),
        previewRow(3, { errors: ['Brand "X" was not found.'] }),
        previewRow(4, { warnings: ['A shift with the same brand, platform, campaign, studio, date, and time already exists.'] }),
      ],
    })
    db.shifts.push({ id: 'shift-1', import_batch_id: batch.id })
    await port.linkRowToShift(batch.id, 2, 'shift-1', 'pending')
    await port.recordRowOutcome(batch.id, 4, 'duplicate_skipped', { expectedOutcome: 'pending' })

    const confirmed = await port.markBatchStatus(batch.id, 'confirmed')

    assert.equal(confirmed?.status, 'confirmed')
    assert.ok(confirmed?.confirmed_at)
    assert.equal(confirmed?.imported_rows, 1)
    assert.equal(confirmed?.failed_rows, 1)
    assert.equal(confirmed?.duplicate_rows, 1)
    assert.equal(confirmed?.retryable_rows, 0)
    assert.equal(db.rows.find(row => row.row_number === 3)?.outcome, 'validation_failed')
    assert.equal(db.rows.find(row => row.row_number === 4)?.outcome, 'duplicate_skipped')
  })
})

test('supabase port fail keeps pending rows pending and records retryable counters', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2), previewRow(3, { errors: ['Brand "X" was not found.'] })],
    })
    await port.markRowRetryable(batch.id, 2, 'SHIFT_REQUEST_FAILED', 'pending')

    const failed = await port.markBatchStatus(batch.id, 'failed')

    assert.equal(failed?.status, 'failed')
    assert.equal(failed?.retryable_rows, 1)
    assert.equal(db.rows.find(row => row.row_number === 3)?.outcome, 'pending')
  })
})

test('supabase port removeBatch cancels a preview and listBatches hides it', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const first = await port.createBatch({ source: 'excel', sourceName: 'a.xlsx', createdBy: '1', summary })
    const second = await port.createBatch({ source: 'excel', sourceName: 'b.xlsx', createdBy: '1', summary })

    assert.equal((await port.listBatches()).length, 2)
    assert.equal(await port.removeBatch(first.id, '1', 'wrong file'), true)

    const listed = await port.listBatches()
    assert.equal(listed.length, 1)
    assert.equal(listed[0].id, second.id)
    assert.equal((await port.getBatch(first.id))?.status, 'cancelled')
  })
})

test('supabase port refuses to cancel a confirmed batch', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({ source: 'excel', sourceName: 'a.xlsx', createdBy: '1', summary })
    await port.markBatchStatus(batch.id, 'confirmed')

    await assert.rejects(
      port.removeBatch(batch.id, '1', 'mistake'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_NOT_REMOVABLE/.test(error.message),
    )
  })
})

test('supabase port updateBatchPreview replaces rows for draft edits', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2), previewRow(3)],
    })

    const updated = await port.updateBatchPreview(batch.id, {
      ...summary,
      total_rows: 2,
      imported_rows: 2,
      failed_rows: 0,
    }, [previewRow(2), previewRow(3)])

    assert.equal(updated?.status, 'previewed')
    assert.equal(updated?.total_rows, 2)
    assert.equal(db.rows.filter(row => row.batch_id === batch.id).length, 2)
    assert.ok(db.rows.every(row => row.outcome === 'pending'))
  })
})

test('supabase port surfaces RPC permission failures without mock fallback', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db, { deniedRpc: 'create_schedule_import_batch' })
    const port = createSupabaseScheduleImportPort(client)

    await assert.rejects(
      port.createBatch({ source: 'excel', sourceName: 'a.xlsx', createdBy: '1', summary }),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && error.code === '42501'
        && /permission denied/.test(error.message),
    )
  })
})

test('dispatching port routes Supabase mode to the RPC port', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    setSupabaseScheduleImportPortForTests(createSupabaseScheduleImportPort(client))

    const batch = await scheduleImportBatchPort.createBatch({
      source: 'excel',
      sourceName: 'dispatch.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })

    assert.equal(batch.status, 'previewed')
    assert.ok(client.rpcCalls.some(call => call.name === 'create_schedule_import_batch'))
    assert.ok(db.batches.some(item => item.id === batch.id))
  })
})

test('dispatching port keeps mock mode in memory with row outcomes', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')

    const batch = await scheduleImportBatchPort.createBatch({
      source: 'excel',
      sourceName: 'mock.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })
    assert.ok((await scheduleImportBatchPort.listBatches()).some(item => item.id === batch.id))

    const recorded = await scheduleImportBatchPort.recordBatchRows(batch.id, [2, 3].map(rowNumber => ({
      id: `${batch.id}:${rowNumber}`,
      batch_id: batch.id,
      source_row_number: rowNumber,
      original_values: {},
      normalized_values: previewRow(rowNumber),
      status: 'imported' as const,
      validation_issues: [],
      created_at: NOW,
    })))
    assert.equal(recorded.length, 2)
    assert.ok(recorded.every(row => row.status === 'pending'))
    assert.equal((await scheduleImportBatchPort.listBatchRows(batch.id)).length, 2)

    const linked = await scheduleImportBatchPort.linkRowToShift(batch.id, 2, 'shift-mock', 'pending', 'warning')
    assert.equal(linked?.status, 'warning')
    assert.equal(linked?.resulting_shift_id, 'shift-mock')

    const retryable = await scheduleImportBatchPort.markRowRetryable(batch.id, 3, 'SHIFT_CONFLICT', 'pending')
    assert.equal(retryable?.status, 'retryable')
    assert.equal(retryable?.failure_code, 'SHIFT_CONFLICT')
  })
})

test('crash recovery: shift created but outcome not recorded leaves row pending with shift import_batch_id', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'mars.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })

    // Simulate: shiftService.create succeeded (shift exists with import_batch_id)
    // but record_schedule_import_batch_outcomes failed (row stays pending)
    db.shifts.push({ id: 'shift-orphan', import_batch_id: batch.id })
    // Row is still pending — outcome was never recorded
    const row = db.rows.find(r => r.batch_id === batch.id && r.row_number === 2)
    assert.equal(row?.outcome, 'pending')
    assert.equal(row?.shift_id, null)

    // Recovery: re-link the already-created shift to the pending row
    await port.linkRowToShift(batch.id, 2, 'shift-orphan', 'pending', 'imported')
    const recovered = db.rows.find(r => r.batch_id === batch.id && r.row_number === 2)
    assert.equal(recovered?.outcome, 'imported')
    assert.equal(recovered?.shift_id, 'shift-orphan')
  })
})

test('batch confirmation is idempotent after the first confirmation', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'a.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2, { errors: ['Brand was not found.'] })],
    })
    const first = await port.markBatchStatus(batch.id, 'confirmed')
    const second = await port.markBatchStatus(batch.id, 'confirmed')

    assert.equal(first?.status, 'confirmed')
    assert.equal(second?.status, 'confirmed')
    assert.equal(db.batches.length, 1)
    assert.equal(db.rows.filter(row => row.batch_id === batch.id).length, 1)
  })
})

test('batch confirmation rejects retryable and valid unprocessed pending rows', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const pendingBatch = await port.createBatch({
      source: 'excel',
      sourceName: 'pending.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })
    await assert.rejects(
      port.markBatchStatus(pendingBatch.id, 'confirmed'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_UNRESOLVED_ROWS/.test(error.message),
    )

    const retryBatch = await port.createBatch({
      source: 'excel',
      sourceName: 'retry.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(3)],
    })
    await port.markRowRetryable(retryBatch.id, 3, 'NETWORK_TIMEOUT', 'pending')
    await assert.rejects(
      port.markBatchStatus(retryBatch.id, 'confirmed'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_UNRESOLVED_ROWS/.test(error.message),
    )
  })
})

test('retryable row resolves before confirmation and remains replay-safe', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)
    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'recover.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })
    db.shifts.push({ id: 'shift-recovered', import_batch_id: batch.id })
    await port.markRowRetryable(batch.id, 2, 'NETWORK_TIMEOUT', 'pending')
    await port.linkRowToShift(batch.id, 2, 'shift-recovered', 'retryable')
    const confirmed = await port.markBatchStatus(batch.id, 'confirmed')
    const replay = await port.markBatchStatus(batch.id, 'confirmed')

    assert.equal(confirmed?.status, 'confirmed')
    assert.equal(replay?.status, 'confirmed')
    assert.equal(db.rows.find(row => row.row_number === 2)?.outcome, 'imported')
  })
})

test('confirmed finalized replay is idempotent but conflicting replay is rejected', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)
    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'final.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2)],
    })
    db.shifts.push(
      { id: 'shift-final', import_batch_id: batch.id },
      { id: 'shift-other', import_batch_id: 'other-batch' },
    )
    await port.linkRowToShift(batch.id, 2, 'shift-final', 'pending')
    await port.markBatchStatus(batch.id, 'confirmed')

    await port.linkRowToShift(batch.id, 2, 'shift-final', 'pending')
    await assert.rejects(
      port.linkRowToShift(batch.id, 2, 'shift-other', 'pending'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_ROW_ALREADY_FINALIZED/.test(error.message),
    )
  })
})

test('batch state machine: fail on confirmed batch is rejected', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({ source: 'excel', sourceName: 'a.xlsx', createdBy: '1', summary })
    await port.markBatchStatus(batch.id, 'confirmed')

    await assert.rejects(
      port.markBatchStatus(batch.id, 'failed'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_NOT_ACTIVE/.test(error.message),
    )
  })
})

test('batch state machine: recording outcomes on a confirmed batch is rejected', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({
      source: 'excel',
      sourceName: 'a.xlsx',
      createdBy: '1',
      summary,
      previewRows: [previewRow(2, { errors: ['Brand was not found.'] })],
    })
    db.shifts.push({ id: 'shift-1', import_batch_id: batch.id })
    await port.markBatchStatus(batch.id, 'confirmed')
    const row = db.rows.find(item => item.batch_id === batch.id && item.row_number === 2)
    assert.ok(row)
    // A confirmed batch may only replay an already-finalized row. Keep this
    // row unresolved to prove the lifecycle guard still rejects late writes.
    row.outcome = 'retryable'

    await assert.rejects(
      port.linkRowToShift(batch.id, 2, 'shift-1', 'pending'),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_NOT_ACTIVE/.test(error.message),
    )
  })
})

test('batch state machine: updateBatchPreview on a confirmed batch is rejected', async () => {
  await withEnvironment(async () => {
    const db: FakeDatabase = { batches: [], rows: [], shifts: [] }
    const client = fakeClient(db)
    const port = createSupabaseScheduleImportPort(client)

    const batch = await port.createBatch({ source: 'excel', sourceName: 'a.xlsx', createdBy: '1', summary })
    await port.markBatchStatus(batch.id, 'confirmed')

    await assert.rejects(
      port.updateBatchPreview(batch.id, { ...summary, total_rows: 1, imported_rows: 1, failed_rows: 0, warning_rows: 0, duplicate_rows: 0, pending_rows: 0 }, [previewRow(99)]),
      (error: unknown) => error instanceof ScheduleImportRequestError
        && /IMPORT_BATCH_NOT_PREVIEWED|IMPORT_BATCH_NOT_ACTIVE/.test(error.message),
    )
  })
})

test('23505 classification: unrelated unique violation is NOT treated as duplicate_skipped', async () => {
  // This tests the isScheduleImportDuplicateError function directly
  // The function requires the constraint name to be shifts_active_slot_uidx
  assert.equal(
    isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "shift_registrations_active_role_uidx"', details: '', hint: '' }),
    false,
    'registration unique violation must not be treated as import duplicate',
  )
  assert.equal(
    isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "schedule_import_batch_rows_batch_row_uidx"', details: '', hint: '' }),
    false,
    'batch row unique violation must not be treated as import duplicate',
  )
  assert.equal(
    isScheduleImportDuplicateError({ code: '23505', message: 'duplicate key value violates unique constraint "shifts_active_slot_uidx"', details: '', hint: '' }),
    true,
    'only the active slot constraint is a legitimate import duplicate',
  )
})
