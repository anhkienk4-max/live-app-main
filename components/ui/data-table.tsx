'use client'

import * as React from 'react'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from './input'
import { Button } from './button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'
import { HistoryPagination } from './history-pagination'
import { pageRange } from '@/lib/utils/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table'

export interface Column<T> {
  header: React.ReactNode | (() => React.ReactNode)
  accessor: keyof T | ((row: T) => React.ReactNode)
  cell?: (value: unknown, row: T) => React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchPlaceholder?: string
  search?: string
  onSearch?: (query: string) => void
  onVisibleDataChange?: (visibleRows: T[]) => void
  onFilteredDataChange?: (filteredRows: T[]) => void
  onPageChange?: (page: number, totalPages: number) => void
  filterComponent?: React.ReactNode
  searchableText?: (row: T) => string
  emptyMessage?: string
  pageSize?: number
  pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void; loading?: boolean }
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  onSearch,
  search,
  onVisibleDataChange,
  onFilteredDataChange,
  onPageChange,
  filterComponent,
  searchableText,
  emptyMessage = 'No data available',
  pageSize = 20,
  pagination,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [currentPage, setCurrentPage] = React.useState(1)
  const [itemsPerPage, setItemsPerPage] = React.useState(pageSize)

  // Sync itemsPerPage if pageSize prop changes
  const [prevPageSize, setPrevPageSize] = React.useState(pageSize)
  if (pageSize !== prevPageSize) {
    setPrevPageSize(pageSize)
    setItemsPerPage(pageSize)
  }

  const filteredData = React.useMemo(() => {
    if (pagination) return data
    const q = searchQuery.toLowerCase().trim()
    if (!q) return data
    return data.filter(row => {
      if (searchableText?.(row).toLowerCase().includes(q)) return true
      return columns.some(col => {
        if (typeof col.accessor === 'function') return false
        const value = row[col.accessor]
        return String(value).toLowerCase().includes(q)
      })
    })
  }, [data, searchQuery, columns, searchableText, pagination])

  const size = pagination?.pageSize ?? itemsPerPage
  const range = pageRange(pagination?.total ?? filteredData.length, pagination?.page ?? currentPage, size)
  const totalPages = range.totalPages
  const safeCurrentPage = range.page
  const startIndex = (safeCurrentPage - 1) * itemsPerPage
  const paginatedData = pagination ? filteredData : filteredData.slice(startIndex, startIndex + itemsPerPage)

  const prevVisibleIdsRef = React.useRef<string | null>(null)
  const prevFilteredIdsRef = React.useRef<string | null>(null)
  const prevPageRef = React.useRef<string>('')

  // Reconcile currentPage state whenever totalPages changes
  const [prevTotalPages, setPrevTotalPages] = React.useState(totalPages)
  if (totalPages !== prevTotalPages) {
    setPrevTotalPages(totalPages)
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    } else if (currentPage < 1) {
      setCurrentPage(1)
    }
  }

  React.useEffect(() => {
    const ids = paginatedData.map(r => r.id).join(',')
    if (ids !== prevVisibleIdsRef.current) {
      prevVisibleIdsRef.current = ids
      onVisibleDataChange?.(paginatedData)
    }
  }, [paginatedData, onVisibleDataChange])

  React.useEffect(() => {
    const ids = filteredData.map(r => r.id).join(',')
    if (ids !== prevFilteredIdsRef.current) {
      prevFilteredIdsRef.current = ids
      onFilteredDataChange?.(filteredData)
    }
  }, [filteredData, onFilteredDataChange])

  React.useEffect(() => {
    const pageKey = `${safeCurrentPage}_${totalPages}`
    if (pageKey !== prevPageRef.current) {
      prevPageRef.current = pageKey
      onPageChange?.(safeCurrentPage, totalPages)
    }
  }, [safeCurrentPage, totalPages, onPageChange])

  const handleSearch = (query: string) => {
    setCurrentPage(1)
    setSearchQuery(query)
    onSearch?.(query)
  }

  return (
    <div className="min-w-0 space-y-4" aria-busy={pagination?.loading}>
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full min-w-0 flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            value={search ?? searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
            data-testid="data-table-search-input"
          />
        </div>
        {filterComponent}
      </div>

      <div className="max-w-full overflow-x-auto rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col, i) => (
                <TableHead key={i}>
                  {typeof col.header === 'function' ? col.header() : col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-gray-500">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow key={row.id} data-testid={`data-table-row-${row.id}`}>
                  {columns.map((col, i) => {
                    const value =
                      typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : row[col.accessor]
                    return (
                      <TableCell key={i}>
                        {col.cell ? col.cell(value, row) : (value as React.ReactNode)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination ? <HistoryPagination
        page={range.page} pageSize={size} total={pagination?.total ?? filteredData.length}
        onPageChange={pagination?.onPageChange ?? setCurrentPage}
        onPageSizeChange={pagination?.onPageSizeChange ?? (value => { setItemsPerPage(value); setCurrentPage(1) })}
      /> : filteredData.length > 0 && (
        <div className="flex items-center justify-between px-2" data-testid="data-table-pagination">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Rows per page:</span>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(val) => {
                setItemsPerPage(Number(val))
                setCurrentPage(1)
              }}
            >
              <SelectTrigger className="w-16" data-testid="data-table-rows-per-page-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600" data-testid="data-table-page-info">
              Page {safeCurrentPage} of {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                data-testid="data-table-prev-page-btn"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                data-testid="data-table-next-page-btn"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
