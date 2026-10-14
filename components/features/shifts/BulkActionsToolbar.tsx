'use client'

import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { LanguageContext, LanguageContextType, TranslationKey } from '@/lib/i18n'

interface BulkActionsToolbarProps {
  selectedCount: number
  totalFilteredCount?: number
  onBulkDelete: (ids: string[]) => void
  onDeselectAll: () => void
  shifts: Shift[]
  onUpdate: () => void
  canDelete?: boolean
  onBulkStatus?: (status: 'scheduled' | 'completed') => void
}

export function BulkActionsToolbar({
  selectedCount,
  totalFilteredCount,
  onBulkDelete,
  onDeselectAll,
  shifts,
  onUpdate,
  canDelete = true,
  onBulkStatus,
}: BulkActionsToolbarProps) {
  const { toast } = useToast()
  const langContext = React.useContext(LanguageContext) as LanguageContextType | null

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    if (langContext && typeof langContext.t === 'function') {
      return langContext.t(key, params)
    }
    switch (key) {
      case 'markScheduled': return 'Mark Scheduled'
      case 'markCompleted': return 'Mark Completed'
      case 'deleteAll': return 'Delete All'
      case 'deselectAll': return 'Deselect All'
      default: return key
    }
  }

  const handleBulkStatusChange = async (status: 'scheduled' | 'live' | 'completed' | 'cancelled') => {
    const result = await shiftService.bulkUpdateStatus(shifts, status)
    await onUpdate()
    if (result.failed === 0) {
      toast({ title: 'Success', description: `Updated ${result.succeeded} shifts`, variant: 'success' })
      onDeselectAll()
      return
    }
    const conflicts = result.outcomes.filter(outcome => !outcome.success && outcome.error_message?.includes('STALE_WRITE')).length
    toast({
      title: result.succeeded > 0 ? 'Partial update' : 'Action failed',
      description: `Updated ${result.succeeded} of ${shifts.length} shifts. ${result.failed} failed${conflicts > 0 ? ` (${conflicts} version conflict)` : ''}: ${result.outcomes.filter(outcome => !outcome.success).map(outcome => outcome.shift_title || outcome.shift_id).join(', ')}`,
      variant: 'destructive',
    })
  }

  const badgeText = totalFilteredCount && totalFilteredCount > selectedCount
    ? (langContext && typeof langContext.t === 'function' ? t('selectedOfFiltered', { selected: selectedCount, total: totalFilteredCount }) : `${selectedCount} / ${totalFilteredCount} selected`)
    : (langContext && typeof langContext.t === 'function' ? t('selectedCount', { count: selectedCount }) : `${selectedCount} selected`)

  return (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="default" data-testid="bulk-selected-badge">
          {badgeText}
        </Badge>
        <Button
          size="sm"
          variant="outline"
          data-testid="bulk-mark-scheduled-btn"
          disabled={selectedCount === 0 || shifts.length === 0}
          onClick={() => onBulkStatus ? onBulkStatus('scheduled') : handleBulkStatusChange('scheduled')}
        >
          {t('markScheduled')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="bulk-mark-completed-btn"
          disabled={selectedCount === 0 || shifts.length === 0}
          onClick={() => onBulkStatus ? onBulkStatus('completed') : handleBulkStatusChange('completed')}
        >
          {t('markCompleted')}
        </Button>
        {canDelete && (
          <Button
            size="sm"
            variant="destructive"
            data-testid="bulk-delete-btn"
            disabled={selectedCount === 0 || shifts.length === 0}
            onClick={() => onBulkDelete(shifts.map(s => s.id))}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('deleteAll')}
          </Button>
        )}
      </div>
      <Button size="sm" variant="ghost" data-testid="bulk-deselect-btn" onClick={onDeselectAll}>
        <X className="h-4 w-4 mr-2" />
        {t('deselectAll')}
      </Button>
    </div>
  )
}
