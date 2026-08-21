import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type {
  ScheduleImportBatch,
  ScheduleImportSource,
  ScheduleImportStatus,
} from '@/lib/types/database.types'
import type { ScheduleImportBatchPort } from '@/lib/services/scheduleImportBatchPort'
import type {
  ImportBatchFinalRowStatus,
  ImportBatchSummary,
} from '@/lib/utils/scheduleImportBatch'
import { toPreviewCounters } from '@/lib/utils/scheduleImportBatch'

const batchColumns = [
  'id',
  'source',
  'source_name',
  'status',
  'total_rows',
  'valid_rows',
  'invalid_rows',
  'warning_rows',
  'imported_rows',
  'duplicate_rows',
  'failed_rows',
  'retryable_rows',
  'created_by',
  'created_at',
  'updated_at',
  'confirmed_at',
  'deleted_at',
  'deleted_by',
  'deletion_reason',
].join(',')

interface BatchDbRow {
  id: string
  source: ScheduleImportSource
  source_name: string
  status: ScheduleImportStatus
  total_rows: number
  valid_rows: number
  invalid_rows: number
  warning_rows: number
  imported_rows: number | null
  duplicate_rows: number | null
  failed_rows: number | null
  retryable_rows: number | null
  created_by: string
  created_at: string
  updated_at: string
  confirmed_at: string | null
  deleted_at: string | null
  deleted_by: string | null
  deletion_reason: string | null
}

interface SupabaseErrorShape {
  code?: string
  message?: string
}

export class ScheduleImportRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'SCHEDULE_IMPORT_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'ScheduleImportRequestError'
  }
}

function requestError(operation: string, error: SupabaseErrorShape): ScheduleImportRequestError {
  const message = error.message?.trim() || `Supabase ${operation} failed.`
  return new ScheduleImportRequestError(message, error.code || 'SCHEDULE_IMPORT_REQUEST_FAILED')
}

function requiredRow<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T {
  if (result.error) throw requestError(operation, result.error)
  if (result.data === null) {
    throw new ScheduleImportRequestError(
      `Supabase ${operation} returned no persisted row.`,
      'SCHEDULE_IMPORT_WRITE_NOT_APPLIED',
    )
  }
  return result.data
}

function optionalRows<T>(
  operation: string,
  result: { data: T[] | null; error: SupabaseErrorShape | null },
): T[] {
  if (result.error) throw requestError(operation, result.error)
  return result.data ?? []
}

function batchFromRow(row: BatchDbRow): ScheduleImportBatch {
  return {
    id: row.id,
    source: row.source,
    source_name: row.source_name,
    status: row.status,
    total_rows: row.total_rows,
    valid_rows: row.valid_rows,
    invalid_rows: row.invalid_rows,
    warning_rows: row.warning_rows,
    imported_rows: row.imported_rows ?? undefined,
    duplicate_rows: row.duplicate_rows ?? undefined,
    failed_rows: row.failed_rows ?? undefined,
    retryable_rows: row.retryable_rows ?? undefined,
    created_by: row.created_by,
    created_at: row.created_at,
    confirmed_at: row.confirmed_at ?? undefined,
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: row.deleted_by ?? undefined,
    deletion_reason: row.deletion_reason ?? undefined,
  }
}

/** Maps the shared ImportBatchSummary onto the stored preview counters. */
function rpcSummary(summary: ImportBatchSummary) {
  return toPreviewCounters(summary)
}

interface RpcOutcomeInput {
  row_number: number
  outcome: ImportBatchFinalRowStatus
  shift_id?: string
  failure_code?: string
}

/**
 * Supabase-backed import batch port. All writes go through SECURITY DEFINER
 * RPCs (create/update/record/confirm/fail/cancel); the actor is derived from
 * the authenticated user inside each RPC. Rows are persisted with outcome
 * 'pending' at create time and finalized through record/confirm.
 */
export function createSupabaseScheduleImportPort(
  client: SupabaseClient,
): ScheduleImportBatchPort {
  const recordOutcomes = async (batchId: string, outcomes: RpcOutcomeInput[]) => {
    if (outcomes.length === 0) return
    const result = await client.rpc('record_schedule_import_batch_outcomes', {
      p_batch_id: batchId,
      p_outcomes: outcomes,
    })
    if (result.error) throw requestError('schedule import outcome record', result.error)
  }

  return {
    async createBatch({ source, sourceName, summary, previewRows }) {
      const result = await client.rpc('create_schedule_import_batch', {
        p_source: source,
        p_source_name: sourceName,
        p_summary: rpcSummary(summary),
        p_rows: previewRows ?? [],
      }).single()
      return batchFromRow(requiredRow('schedule import create', result) as unknown as BatchDbRow)
    },

    // Rows are already persisted by create_schedule_import_batch; there is
    // nothing more to record at preview time in Supabase mode.
    async recordBatchRows(_batchId, rows) {
      return rows
    },

    async linkRowToShift(batchId, sourceRowNumber, shiftId, outcome = 'imported') {
      await recordOutcomes(batchId, [{
        row_number: sourceRowNumber,
        outcome,
        shift_id: shiftId,
      }])
      return null
    },

    async markRowRetryable(batchId, sourceRowNumber, failureCode) {
      await recordOutcomes(batchId, [{
        row_number: sourceRowNumber,
        outcome: 'retryable',
        failure_code: failureCode,
      }])
      return null
    },

    async recordRowOutcome(batchId, sourceRowNumber, outcome, options) {
      await recordOutcomes(batchId, [{
        row_number: sourceRowNumber,
        outcome,
        shift_id: options?.shiftId,
        failure_code: options?.failureCode,
      }])
      return null
    },

    async updateBatchPreview(batchId, summary, previewRows) {
      const result = await client.rpc('update_schedule_import_batch_preview', {
        p_batch_id: batchId,
        p_summary: rpcSummary(summary),
        p_rows: previewRows ?? [],
      }).single()
      if (result.error) throw requestError('schedule import preview update', result.error)
      return result.data
        ? batchFromRow(result.data as unknown as BatchDbRow)
        : null
    },

    async markBatchStatus(batchId, status) {
      if (status === 'confirmed') {
        const result = await client.rpc('confirm_schedule_import_batch', {
          p_batch_id: batchId,
        }).single()
        if (result.error) throw requestError('schedule import confirm', result.error)
        return result.data ? batchFromRow(result.data as unknown as BatchDbRow) : null
      }
      if (status === 'failed') {
        const result = await client.rpc('fail_schedule_import_batch', {
          p_batch_id: batchId,
        }).single()
        if (result.error) throw requestError('schedule import fail', result.error)
        return result.data ? batchFromRow(result.data as unknown as BatchDbRow) : null
      }
      return null
    },

    async removeBatch(batchId, _actorId, reason) {
      const result = await client.rpc('cancel_schedule_import_batch', {
        p_batch_id: batchId,
        p_reason: reason,
      }).single()
      requiredRow('schedule import cancel', result)
      return true
    },

    async getBatch(batchId) {
      const result = await client.from('schedule_import_batches')
        .select(batchColumns)
        .eq('id', batchId)
        .maybeSingle()
      if (result.error) throw requestError('schedule import lookup', result.error)
      return result.data ? batchFromRow(result.data as unknown as BatchDbRow) : null
    },

    async listBatches() {
      const result = await client.from('schedule_import_batches')
        .select(batchColumns)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      return optionalRows('schedule import read', result)
        .map(row => batchFromRow(row as unknown as BatchDbRow))
    },
  }
}

let browserPort: ScheduleImportBatchPort | null = null
let testPort: ScheduleImportBatchPort | undefined

export function getSupabaseScheduleImportPort(): ScheduleImportBatchPort {
  if (testPort) return testPort
  if (!browserPort) browserPort = createSupabaseScheduleImportPort(createClient())
  return browserPort
}

export function setSupabaseScheduleImportPortForTests(
  port: ScheduleImportBatchPort | undefined,
): void {
  testPort = port
}
