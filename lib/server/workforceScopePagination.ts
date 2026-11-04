/** Exact-count, stable-key pagination for workforce KPI source reads.
 * Fail closed if a page is missing, duplicated, the count changes or a configured
 * capacity ceiling would otherwise turn a partial source into a false KPI.
 */
export class WorkforceScopeReadError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'WorkforceScopeReadError'
  }
}

export const WORKFORCE_SCOPE_PAGE_SIZE = 500
export const WORKFORCE_SCOPE_MAX_ROWS = 50000
export const WORKFORCE_SHIFT_ID_CHUNK_SIZE = 150

export type WorkforceReadPage<T> = {
  data: T[] | null
  error: unknown
  count: number | null
}

/** Callers MUST apply a deterministic .order('id') before .range(). */
export async function readCompleteWorkforceRows<T extends { id: string }>(
  page: (from: number, to: number) => PromiseLike<WorkforceReadPage<T>>,
  failureCode: string,
  maxRows = WORKFORCE_SCOPE_MAX_ROWS,
): Promise<T[]> {
  const fail = () => { throw new WorkforceScopeReadError(failureCode) }
  if (!Number.isSafeInteger(maxRows) || maxRows < 0) return fail()
  const rows: T[] = []
  const ids = new Set<string>()
  let expectedTotal: number | null = null
  for (let offset = 0; ; offset += WORKFORCE_SCOPE_PAGE_SIZE) {
    let result: WorkforceReadPage<T>
    try {
      result = await page(offset, offset + WORKFORCE_SCOPE_PAGE_SIZE - 1)
    } catch {
      return fail()
    }
    const count = result?.count
    if (result?.error || !Array.isArray(result?.data)
      || !Number.isSafeInteger(count) || count === null
      || count < 0 || count > maxRows) return fail()
    if (expectedTotal === null) expectedTotal = count
    if (expectedTotal !== count) return fail()
    const expectedLength = Math.min(WORKFORCE_SCOPE_PAGE_SIZE, Math.max(0, count - offset))
    if (result.data.length !== expectedLength) return fail()
    for (const row of result.data) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id)) return fail()
      ids.add(row.id)
      rows.push(row)
    }
    if (rows.length === count) return rows
  }
}

/** Split IDs before .in('shift_id', ids) to bound URI/SQL parameter sizes.
 * Global deduplication and hard cap apply across all independent chunks.
 */
export async function readWorkforceRowsForShifts<T extends { id: string }>(
  shiftIds: readonly string[],
  buildPage: (chunk: string[], from: number, to: number) => PromiseLike<WorkforceReadPage<T>>,
  failureCode: string,
): Promise<T[]> {
  const rows: T[] = []
  const seen = new Set<string>()
  for (let i = 0; i < shiftIds.length; i += WORKFORCE_SHIFT_ID_CHUNK_SIZE) {
    const chunk = shiftIds.slice(i, i + WORKFORCE_SHIFT_ID_CHUNK_SIZE)
    const batch = await readCompleteWorkforceRows(
      (from, to) => buildPage(chunk, from, to),
      failureCode,
      WORKFORCE_SCOPE_MAX_ROWS - rows.length,
    )
    for (const row of batch) {
      if (seen.has(row.id)) throw new WorkforceScopeReadError(failureCode)
      seen.add(row.id)
      rows.push(row)
    }
  }
  return rows
}
