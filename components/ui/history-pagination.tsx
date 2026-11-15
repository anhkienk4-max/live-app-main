'use client'

import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'

import { PAGE_SIZES, pageRange } from '@/lib/utils/pagination'

export function HistoryPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  const { t } = useTranslation()
  const { page: safePage, totalPages, from, to } = pageRange(total, page, pageSize)

  return (
    <div className="flex flex-col gap-2.5 border-t bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
        {t('showingRecords', { from, to, total })}
      </p>
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{t('show')}</span>
            <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
              <SelectTrigger className="h-8 w-16 text-xs" aria-label={t('recordsPerPage')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
              </SelectContent>
            </Select>
            <span className="hidden sm:inline">{t('recordsPerPage')}</span>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          <Button type="button" size="icon-sm" variant="outline" className="h-8 w-8" disabled={safePage <= 1} aria-label={t('firstPage')} title={t('firstPage')} onClick={() => onPageChange(1)}>
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" className="h-8 w-8" disabled={safePage <= 1} aria-label={t('previousPage')} title={t('previousPage')} onClick={() => onPageChange(safePage - 1)}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="px-1.5 text-center text-xs whitespace-nowrap">{t('pageOf', { page: safePage, totalPages })}</span>
          <Button type="button" size="icon-sm" variant="outline" className="h-8 w-8" disabled={safePage >= totalPages} aria-label={t('nextPage')} title={t('nextPage')} onClick={() => onPageChange(safePage + 1)}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" className="h-8 w-8" disabled={safePage >= totalPages} aria-label={t('lastPage')} title={t('lastPage')} onClick={() => onPageChange(totalPages)}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
