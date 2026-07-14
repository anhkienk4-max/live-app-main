

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
    for (const shift of shifts) {
      await shiftService.update(shift.id, { status })
    }
    toast({ title: 'Success', description: `Updated ${selectedCount} shifts`, variant: 'default' })
    onUpdate()
    onDeselectAll()
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
