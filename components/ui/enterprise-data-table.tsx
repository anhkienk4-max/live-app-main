'use client'

import * as React from 'react'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/states'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface EnterpriseColumn<T> {
  id: string
  header: React.ReactNode | ((props: { sortDirection: 'asc' | 'desc' | null; toggleSort: () => void }) => React.ReactNode)
  accessor: (row: T) => unknown
  cell?: (value: unknown, row: T) => React.ReactNode
  sortable?: boolean
  className?: string
  width?: number | string
}

export interface EnterpriseServerPagination {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (newPage: number) => void
  onPageSizeChange?: (newSize: number) => void
  loading?: boolean
}

export interface EnterpriseServerSorting {
  sortColumnId: string | null
  sortDirection: 'asc' | 'desc' | null
  onSortChange: (columnId: string, direction: 'asc' | 'desc' | null) => void
}

export interface EnterpriseDataTableProps<T> {
  data: T[]
  columns: EnterpriseColumn<T>[]
  searchPlaceholder?: string
  searchableText?: (row: T) => string
  pageSize?: number
  pageSizeOptions?: number[]
  enableVirtualization?: boolean
  virtualHeight?: number
  rowHeight?: number
  emptyTitle?: string
  emptyDescription?: string
  loading?: boolean
  onRowClick?: (row: T) => void
  toolbarActions?: React.ReactNode
  title?: string
  totalCountLabel?: string
  exportFileName?: string
  /**
   * Server pagination contract: When provided, table operates in server-paged mode,
   * avoiding full client data loading and preserving backend read-safety bounds.
   */
  serverPagination?: EnterpriseServerPagination
  /**
   * Server sorting contract: When provided, sorting triggers backend RPC/queries.
   */
  serverSorting?: EnterpriseServerSorting
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 animate-pulse">
      <div className="flex gap-4 border-b pb-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`head-${i}`} className="h-5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={`row-${r}`} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={`cell-${r}-${c}`} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EnterpriseDataTable<T extends { id?: string | number }>({
  data,
  columns,
  searchPlaceholder = 'Tìm kiếm dữ liệu...',
  searchableText,
  pageSize: initialPageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  enableVirtualization = false,
  virtualHeight = 520,
  rowHeight = 48,
  emptyTitle = 'Không tìm thấy dữ liệu',
  emptyDescription = 'Thử điều chỉnh bộ lọc hoặc từ khóa tìm kiếm.',
  loading = false,
  onRowClick,
  toolbarActions,
  title,
  totalCountLabel = 'bản ghi',
  exportFileName,
  serverPagination,
  serverSorting,
}: EnterpriseDataTableProps<T>) {
  const isServerPaged = Boolean(serverPagination)
  const isServerSorted = Boolean(serverSorting)

  const [search, setSearch] = React.useState('')
  const [clientSortColumnId, setClientSortColumnId] = React.useState<string | null>(null)
  const [clientSortDirection, setClientSortDirection] = React.useState<'asc' | 'desc' | null>(null)
  const [clientPage, setClientPage] = React.useState(0)
  const [clientPageSize, setClientPageSize] = React.useState(initialPageSize)
  const [visibleColumnIds, setVisibleColumnIds] = React.useState<Set<string>>(
    () => new Set(columns.map((c) => c.id))
  )
  const [showColumnToggle, setShowColumnToggle] = React.useState(false)

  const activeSortColumnId = isServerSorted ? serverSorting!.sortColumnId : clientSortColumnId
  const activeSortDirection = isServerSorted ? serverSorting!.sortDirection : clientSortDirection

  // 1. Filter data based on search text (only for client mode)
  const filteredData = React.useMemo(() => {
    if (isServerPaged || !search.trim()) return data
    const query = search.toLowerCase().trim()
    return data.filter((row) => {
      if (searchableText) {
        return searchableText(row).toLowerCase().includes(query)
      }
      return columns.some((col) => {
        const val = col.accessor(row)
        return String(val ?? '').toLowerCase().includes(query)
      })
    })
  }, [data, search, searchableText, columns, isServerPaged])

  // 2. Sort data (only for client mode)
  const sortedData = React.useMemo(() => {
    if (isServerSorted || !clientSortColumnId || !clientSortDirection) return filteredData
    const col = columns.find((c) => c.id === clientSortColumnId)
    if (!col) return filteredData

    return [...filteredData].sort((a, b) => {
      const valA = col.accessor(a)
      const valB = col.accessor(b)
      if (valA == null && valB == null) return 0
      if (valA == null) return clientSortDirection === 'asc' ? -1 : 1
      if (valB == null) return clientSortDirection === 'asc' ? 1 : -1

      if (typeof valA === 'number' && typeof valB === 'number') {
        return clientSortDirection === 'asc' ? valA - valB : valB - valA
      }
      const strA = String(valA).toLowerCase()
      const strB = String(valB).toLowerCase()
      if (strA < strB) return clientSortDirection === 'asc' ? -1 : 1
      if (strA > strB) return clientSortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredData, clientSortColumnId, clientSortDirection, columns, isServerSorted])

  // 3. Resolve active page & page size
  const activePage = isServerPaged ? serverPagination!.page : clientPage
  const activePageSize = isServerPaged ? serverPagination!.pageSize : clientPageSize
  const totalItems = isServerPaged ? serverPagination!.totalItems : sortedData.length
  const totalPages = Math.max(1, Math.ceil(totalItems / activePageSize))
  const safePage = Math.min(activePage, totalPages - 1)

  // 4. Data slice to display (Server mode receives the exact page; Client mode slices)
  const displayData = React.useMemo(() => {
    if (isServerPaged) return data
    if (enableVirtualization) return sortedData
    const start = safePage * activePageSize
    return sortedData.slice(start, start + activePageSize)
  }, [data, isServerPaged, enableVirtualization, sortedData, safePage, activePageSize])

  const toggleSort = (colId: string) => {
    if (isServerSorted) {
      let nextDir: 'asc' | 'desc' | null = 'asc'
      if (activeSortColumnId === colId) {
        if (activeSortDirection === 'asc') nextDir = 'desc'
        else if (activeSortDirection === 'desc') nextDir = null
      }
      serverSorting!.onSortChange(colId, nextDir)
      return
    }

    if (clientSortColumnId !== colId) {
      setClientSortColumnId(colId)
      setClientSortDirection('asc')
    } else if (clientSortDirection === 'asc') {
      setClientSortDirection('desc')
    } else {
      setClientSortColumnId(null)
      setClientSortDirection(null)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (isServerPaged) {
      serverPagination!.onPageChange(newPage)
    } else {
      setClientPage(newPage)
    }
  }

  const handlePageSizeChange = (newSize: number) => {
    if (isServerPaged && serverPagination!.onPageSizeChange) {
      serverPagination!.onPageSizeChange(newSize)
    } else {
      setClientPageSize(newSize)
      setClientPage(0)
    }
  }

  // Virtualization setup
  const parentRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: enableVirtualization ? displayData.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  // Export CSV
  const handleExportCsv = () => {
    const activeCols = columns.filter((c) => visibleColumnIds.has(c.id))
    const headerRow = activeCols.map((c) => `"${String(c.id).replace(/"/g, '""')}"`).join(',')
    const dataRows = (isServerPaged ? data : sortedData).map((row) =>
      activeCols
        .map((c) => {
          const val = c.accessor(row)
          return `"${String(val ?? '').replace(/"/g, '""')}"`
        })
        .join(',')
    )
    const csvContent = 'data:text/csv;charset=utf-8,﻿' + [headerRow, ...dataRows].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `${exportFileName || 'export'}_${Date.now()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const activeColumns = columns.filter((c) => visibleColumnIds.has(c.id))
  const isBusy = loading || serverPagination?.loading

  return (
    <div className="flex flex-col gap-3" data-testid="enterprise-data-table">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-[240px] max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                if (!isServerPaged) setClientPage(0)
              }}
              className="pl-8 pr-8 text-sm h-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  if (!isServerPaged) setClientPage(0)
                }}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {toolbarActions}

          {/* Column Toggle */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColumnToggle(!showColumnToggle)}
              className="h-9 gap-1.5 text-xs font-medium"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Cột
            </Button>
            {showColumnToggle && (
              <div className="absolute right-0 top-10 z-30 w-48 rounded-md border bg-popover p-2 shadow-md">
                <div className="text-xs font-semibold px-2 py-1 text-muted-foreground">
                  Hiện / Ẩn cột
                </div>
                <div className="mt-1 space-y-1">
                  {columns.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumnIds.has(c.id)}
                        onChange={(e) => {
                          const next = new Set(visibleColumnIds)
                          if (e.target.checked) next.add(c.id)
                          else if (next.size > 1) next.delete(c.id)
                          setVisibleColumnIds(next)
                        }}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{c.id}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Export CSV */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={displayData.length === 0}
            className="h-9 gap-1.5 text-xs font-medium"
          >
            <Download className="h-3.5 w-3.5" />
            Xuất CSV
          </Button>
        </div>
      </div>

      {/* Title & Count Bar */}
      {(title || totalItems > 0) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          {title && <span className="font-semibold text-foreground text-sm">{title}</span>}
          <span>
            Tổng cộng: <strong className="text-foreground">{totalItems.toLocaleString()}</strong> {totalCountLabel}
            {!isServerPaged && search && ` (đã lọc từ ${data.length.toLocaleString()})`}
          </span>
        </div>
      )}

      {/* Main Table Body */}
      {isBusy ? (
        <TableSkeleton rows={Math.min(activePageSize, 8)} columns={activeColumns.length} />
      ) : displayData.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : enableVirtualization ? (
        /* Virtualized Table container */
        <div
          ref={parentRef}
          style={{ height: `${virtualHeight}px`, overflow: 'auto' }}
          className="rounded-lg border bg-card relative"
        >
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                {activeColumns.map((col) => {
                  const isSorted = activeSortColumnId === col.id
                  return (
                    <TableHead
                      key={col.id}
                      style={{ width: col.width }}
                      className={cn('text-xs font-semibold', col.className)}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.id)}
                          className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
                        >
                          {typeof col.header === 'function'
                            ? col.header({
                                sortDirection: isSorted ? activeSortDirection : null,
                                toggleSort: () => toggleSort(col.id),
                              })
                            : col.header}
                          {isSorted ? (
                            activeSortDirection === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                          )}
                        </button>
                      ) : typeof col.header === 'function' ? (
                        col.header({ sortDirection: null, toggleSort: () => {} })
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = displayData[virtualRow.index]
                  if (!row) return null
                  const rowKey = row.id ?? virtualRow.index
                  return (
                    <TableRow
                      key={String(rowKey)}
                      data-index={virtualRow.index}
                      onClick={() => onRowClick?.(row)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className={cn(
                        'hover:bg-muted/50 transition-colors flex',
                        onRowClick && 'cursor-pointer'
                      )}
                    >
                      {activeColumns.map((col) => {
                        const val = col.accessor(row)
                        return (
                          <TableCell
                            key={col.id}
                            style={{ width: col.width }}
                            className={cn('text-sm py-2.5 truncate flex-1', col.className)}
                          >
                            {col.cell ? col.cell(val, row) : String(val ?? '')}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </div>
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Standard Paginated Table */
        <div className="rounded-lg border bg-card overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                {activeColumns.map((col) => {
                  const isSorted = activeSortColumnId === col.id
                  return (
                    <TableHead
                      key={col.id}
                      style={{ width: col.width }}
                      className={cn('text-xs font-semibold', col.className)}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(col.id)}
                          className="flex items-center gap-1.5 hover:text-foreground transition-colors group"
                        >
                          {typeof col.header === 'function'
                            ? col.header({
                                sortDirection: isSorted ? activeSortDirection : null,
                                toggleSort: () => toggleSort(col.id),
                              })
                            : col.header}
                          {isSorted ? (
                            activeSortDirection === 'asc' ? (
                              <ArrowUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                          )}
                        </button>
                      ) : typeof col.header === 'function' ? (
                        col.header({ sortDirection: null, toggleSort: () => {} })
                      ) : (
                        col.header
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayData.map((row, idx) => {
                const rowKey = row.id ?? idx
                return (
                  <TableRow
                    key={String(rowKey)}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'hover:bg-muted/50 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {activeColumns.map((col) => {
                      const val = col.accessor(row)
                      return (
                        <TableCell key={col.id} className={cn('text-sm py-2.5', col.className)}>
                          {col.cell ? col.cell(val, row) : String(val ?? '')}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Số dòng mỗi trang:</span>
              <select
                value={activePageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="h-7 rounded border bg-background px-2 text-xs"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <span>
                Hiển thị {Math.min(totalItems, safePage * activePageSize + 1)}–
                {Math.min(totalItems, (safePage + 1) * activePageSize)} / {totalItems}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(0)}
                disabled={safePage === 0}
                className="h-8 w-8 p-0"
                title="Trang đầu"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.max(0, safePage - 1))}
                disabled={safePage === 0}
                className="h-8 w-8 p-0"
                title="Trang trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-xs font-medium">
                {safePage + 1} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(Math.min(totalPages - 1, safePage + 1))}
                disabled={safePage >= totalPages - 1}
                className="h-8 w-8 p-0"
                title="Trang sau"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="h-8 w-8 p-0"
                title="Trang cuối"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
