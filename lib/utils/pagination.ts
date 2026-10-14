export const PAGE_SIZES = [10, 20, 50] as const
export type PageSize = typeof PAGE_SIZES[number]

export function pageRange(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages)
  return { page: safePage, totalPages, from: total === 0 ? 0 : (safePage - 1) * pageSize + 1, to: Math.min(total, safePage * pageSize) }
}

export function readPage(value: string | null): number {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1
}

export function readPageSize(value: string | null, fallback: PageSize): PageSize {
  const size = Number(value)
  return PAGE_SIZES.includes(size as PageSize) ? size as PageSize : fallback
}
