'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { authorizedExportFields } from '@/lib/utils/calendarExport'
import type { ListFilters } from '@/lib/services/operationsPageService'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

export interface CalendarExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shiftId?: string
  selectedIds?: string[]
  filters?: ListFilters
  listScope?: 'all' | 'open' | 'mine'
}
export function CalendarExportDialog(props: CalendarExportDialogProps) {
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent size="lg"><DialogHeader><DialogTitle>Xuất lịch ca</DialogTitle><DialogDescription>Chọn phạm vi và cột được phép xuất. CSV hỗ trợ bảng lịch phẳng.</DialogDescription></DialogHeader>
      {props.open && <ExportWorkspace {...props} />}
    </DialogContent>
  </Dialog>
}

function ExportWorkspace({ shiftId, selectedIds = [], filters = {}, listScope = 'all' }: CalendarExportDialogProps) {
  const { currentUser, loading, authIdentity } = useCurrentUser()
  const identityKey = `${authIdentity ?? ''}:${currentUser?.id ?? ''}:${resolveSystemPermission(currentUser)}`
  const [scope, setScope] = React.useState<'one' | 'selected' | 'filtered'>(shiftId ? 'one' : 'filtered')
  const [mode, setMode] = React.useState<'all' | 'select'>('all')
  const [format, setFormat] = React.useState<'xlsx' | 'csv'>('xlsx')
  const [selected, setSelected] = React.useState<string[]>(['schedule.Shift ID', 'schedule.Date', 'schedule.Start Time', 'schedule.End Time', 'schedule.Brand'])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [exported, setExported] = React.useState<number | null>(null)
  const controller = React.useRef<AbortController | null>(null)
  const owner = React.useRef(identityKey)
  React.useLayoutEffect(() => { owner.current = identityKey; controller.current?.abort(); return () => controller.current?.abort() }, [identityKey])
  const fields = authorizedExportFields(resolveSystemPermission(currentUser)).filter(field => format !== 'csv' || field.group === 'schedule')
  const availableSelected = selected.filter(id => fields.some(field => field.id === id))
  const submit = async () => {
    if (busy || !currentUser) return
    const identity = identityKey
    const request = new AbortController()
    controller.current = request
    setBusy(true); setError(null); setExported(null)
    try {
      const response = await fetch('/api/operations/calendar-export', { method: 'POST', cache: 'no-store', credentials: 'same-origin', signal: request.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, filters, format, listScope,
          ...(scope === 'one' ? { shiftIds: [shiftId] } : scope === 'selected' ? { shiftIds: selectedIds } : {}),
          ...(mode === 'select' ? { fields: availableSelected } : format === 'csv' ? { fields: fields.map(field => field.id) } : {}),
        }) })
      if (!response.ok) { const body = await response.json(); throw new Error(body.error?.code ?? 'EXPORT_FAILED') }
      const count = Number(response.headers.get('X-Export-Record-Count'))
      if (!response.headers.has('X-Export-Record-Count') || !Number.isSafeInteger(count) || count < 0 || !response.headers.get('Content-Type')?.includes(format === 'csv' ? 'text/csv' : 'spreadsheetml')) throw new Error('EXPORT_RESPONSE_INVALID')
      const blob = await response.blob()
      if (identity !== owner.current || request.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = 'calendar.' + format; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExported(count)
    } catch (cause) {
      if (!request.signal.aborted) {
        const code = cause instanceof Error ? cause.message : 'EXPORT_FAILED'
        const messages: Record<string, string> = {
          EXPORT_COLLECTION_CHANGED: 'Danh sách ca đã thay đổi. Vui lòng tải lại trước khi xuất.',
          EXPORT_SCOPE_CHANGED: 'Một số ca đã chọn không còn khả dụng trong phạm vi được phép.',
          EXPORT_FIELD_DENIED: 'Quyền xuất cột đã thay đổi. Vui lòng kiểm tra lại tài khoản.',
        }
        setError(messages[code] ?? 'Không thể xuất đầy đủ dữ liệu. Vui lòng thử lại sau.')
      }
    }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  if (loading) return <p role="status">Đang xác minh quyền xuất…</p>
  if (!currentUser) return <p role="alert">Không thể xác minh tài khoản để xuất dữ liệu.</p>
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="space-y-1 text-sm">Phạm vi<select aria-label="Phạm vi xuất" className="h-9 w-full rounded-md border bg-background px-2" value={scope} disabled={busy} onChange={event => setScope(event.target.value as typeof scope)}>
        <option value="one" disabled={!shiftId}>Một ca</option><option value="selected" disabled={!selectedIds.length}>Các ca đã chọn ({selectedIds.length})</option><option value="filtered">Tất cả ca khớp bộ lọc</option>
      </select></label>
      <label className="space-y-1 text-sm">Cột<select aria-label="Chế độ xuất" className="h-9 w-full rounded-md border bg-background px-2" value={mode} disabled={busy} onChange={event => setMode(event.target.value as typeof mode)}>
        <option value="all">Export All Authorized Fields</option><option value="select">Select Fields</option>
      </select></label>
      <label className="space-y-1 text-sm">Định dạng<select aria-label="Định dạng xuất" className="h-9 w-full rounded-md border bg-background px-2" value={format} disabled={busy} onChange={event => setFormat(event.target.value as typeof format)}><option value="xlsx">XLSX</option><option value="csv">CSV</option></select></label>
    </div>
    {mode === 'select' && <div className="grid gap-3 sm:grid-cols-2">{(['schedule', 'registrations'] as const).map(group => {
      const choices = fields.filter(field => field.group === group)
      return !!choices.length && <fieldset key={group} className="space-y-2 rounded-md border p-3"><legend className="text-sm font-semibold">{{ schedule: 'Lịch ca', registrations: 'Đăng ký' }[group]}</legend>
        {choices.map(field => <label key={field.id} className="flex items-center gap-2 text-xs"><Checkbox checked={selected.includes(field.id)} disabled={busy} onCheckedChange={checked => setSelected(current => checked ? [...current, field.id] : current.filter(id => id !== field.id))} />{field.label}</label>)}
      </fieldset>
    })}</div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {exported !== null && <p role="status">Đã xuất và xác minh {exported} ca.</p>}
    <Button disabled={busy || !fields.length || !currentUser || mode === 'select' && !availableSelected.length} onClick={() => void submit()}>{busy ? 'Đang xuất…' : 'Xuất file'}</Button>
  </div>
}
