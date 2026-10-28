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
    <div className="flex flex-col gap-3 border-t bg-card px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {t('showingRecords', { from, to, total })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && <><span className="text-sm">{t('show')}</span>
        <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-20" aria-label={t('recordsPerPage')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm">{t('recordsPerPage')}</span></>}
        <Button type="button" size="icon-sm" variant="outline" className="max-md:!h-11 max-md:!w-11" disabled={safePage <= 1} aria-label={t('firstPage')} title={t('firstPage')} onClick={() => onPageChange(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" className="max-md:!h-11 max-md:!w-11" disabled={safePage <= 1} aria-label={t('previousPage')} title={t('previousPage')} onClick={() => onPageChange(safePage - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-24 text-center text-sm">{t('pageOf', { page: safePage, totalPages })}</span>
        <Button type="button" size="icon-sm" variant="outline" className="max-md:!h-11 max-md:!w-11" disabled={safePage >= totalPages} aria-label={t('nextPage')} title={t('nextPage')} onClick={() => onPageChange(safePage + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="outline" className="max-md:!h-11 max-md:!w-11" disabled={safePage >= totalPages} aria-label={t('lastPage')} title={t('lastPage')} onClick={() => onPageChange(totalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
