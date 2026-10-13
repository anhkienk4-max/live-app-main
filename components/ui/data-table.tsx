'use client'

import * as React from 'react'
import { Search } from 'lucide-react'
import { Input } from './input'
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
  filterComponent,
  searchableText,
  emptyMessage = 'No data available',
  pageSize = 20,
  pagination,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = React.useState('')
  const [currentPage, setCurrentPage] = React.useState(1)
  const [itemsPerPage, setItemsPerPage] = React.useState(pageSize)

  const filteredData = React.useMemo(() => {
    if (pagination || !searchQuery) return data
    
    return data.filter(row => {
      if (searchableText?.(row).toLowerCase().includes(searchQuery.toLowerCase())) return true
      return columns.some(col => {
        if (typeof col.accessor === 'function') return false
        const value = row[col.accessor]
        return String(value).toLowerCase().includes(searchQuery.toLowerCase())
      })
    })
  }, [data, searchQuery, columns, searchableText, pagination])

  const size = pagination?.pageSize ?? itemsPerPage
  const range = pageRange(pagination?.total ?? filteredData.length, pagination?.page ?? currentPage, size)
  const startIndex = (range.page - 1) * size
  const paginatedData = pagination ? filteredData : filteredData.slice(startIndex, startIndex + size)


  const handleSearch = (query: string) => {
    setCurrentPage(1)
    setSearchQuery(query)
    onSearch?.(query)
  }

  return (
    <div className="space-y-4" aria-busy={pagination?.loading}>
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder={searchPlaceholder}
            value={search ?? searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
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
                <TableRow key={row.id}>
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

      <HistoryPagination
        page={range.page} pageSize={size} total={pagination?.total ?? filteredData.length}
        onPageChange={pagination?.onPageChange ?? setCurrentPage}
        onPageSizeChange={pagination?.onPageSizeChange ?? (value => { setItemsPerPage(value); setCurrentPage(1) })}
      />

    </div>
  )
}
