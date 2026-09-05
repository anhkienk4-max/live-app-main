'use client'

import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, Trash2, Users } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

interface BulkActionsToolbarProps {
  selectedCount: number
  onBulkDelete: (ids: string[]) => void
  onDeselectAll: () => void
  shifts: Shift[]
  onUpdate: () => void
}

export function BulkActionsToolbar({ selectedCount, onBulkDelete, onDeselectAll, shifts, onUpdate }: BulkActionsToolbarProps) {
  const { toast } = useToast()

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

  return (
    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Badge variant="default">{selectedCount} selected</Badge>
        <Button size="sm" variant="outline" onClick={() => handleBulkStatusChange('scheduled')}>
          Mark Scheduled
        </Button>
        <Button size="sm" variant="outline" onClick={() => handleBulkStatusChange('completed')}>
          Mark Completed
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onBulkDelete(shifts.map(s => s.id))}>
          <Trash2 className="h-4 w-4 mr-2" />
          Delete All
        </Button>
      </div>
      <Button size="sm" variant="ghost" onClick={onDeselectAll}>
        <X className="h-4 w-4 mr-2" />
        Deselect All
      </Button>
    </div>
  )
}
