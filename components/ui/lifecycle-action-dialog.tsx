'use client'

import * as React from 'react'
import { AlertTriangle } from 'lucide-react'
import { DeletionImpact } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

interface LifecycleActionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  impact: DeletionImpact | null
  confirmText: string
  onConfirm: (reason: string) => Promise<void> | void
  requireReason?: boolean
  variant?: 'destructive' | 'default'
}

export function LifecycleActionDialog({
  open,
  onOpenChange,
  title,
  impact,
  confirmText,
  onConfirm,
  requireReason = true,
  variant = 'destructive',
}: LifecycleActionDialogProps) {
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const canSubmit = Boolean(impact) && (!requireReason || reason.trim().length >= 3)

  React.useEffect(() => {
    if (open) setReason('')
  }, [open])

  const confirm = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{impact?.entity_name}</DialogDescription>
        </DialogHeader>
        {impact && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-medium">{impact.consequence}</p>
              <p className="mt-1">Can undo: <Badge variant="outline">{impact.reversible ? 'Yes' : 'No'}</Badge></p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Related data</p>
              {impact.related_records.length === 0 ? (
                <p className="text-sm text-muted-foreground">No related records.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {impact.related_records.map(record => (
                    <li className="flex justify-between rounded border px-3 py-2" key={`${record.entity_type}-${record.entity_id}`}>
                      <span>{record.entity_name}</span>
                      <Badge variant="secondary">{record.count ?? 1}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="block text-sm font-medium">
              Reason {requireReason && '*'}
              <Textarea className="mt-1" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this action is required…" />
            </label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="button" variant={variant} onClick={() => void confirm()} disabled={!canSubmit || busy}>{busy ? 'Processing…' : confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
