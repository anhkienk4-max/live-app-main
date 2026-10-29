'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Entry = {
  target_id: string
  permission: 'audit.view_team'
  decision: 'allow' | 'deny' | 'reset' | null
  version: number
  reason: string | null
  expires_at: string | null
  changed_by: string | null
  changed_at: string | null
  effective: boolean
  source: 'account_override' | 'role_default'
  history: Array<{
    decision: string
    version: number
    reason: string
    expires_at: string | null
    changed_by: string
    changed_at: string
  }>
}

export function AccountPermissionOverridesPanel() {
  const [entries, setEntries] = React.useState<Entry[]>([])
  const [targetId, setTargetId] = React.useState('')
  const [decision, setDecision] = React.useState<'allow' | 'deny'>('deny')
  const [reason, setReason] = React.useState('')
  const [expiresAt, setExpiresAt] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [pending, setPending] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const selected = entries.find(entry => entry.target_id === targetId)

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    try {
      const response = await fetch('/api/rbac/account-overrides', {
        cache: 'no-store', credentials: 'same-origin', signal,
      })
      const body = await response.json()
      if (!response.ok || body.ok !== true || !Array.isArray(body.entries)) {
        throw new Error(body?.error?.code || 'RBAC02_LOAD_FAILED')
      }
      setEntries(body.entries as Entry[])
      setTargetId(current => body.entries.some((entry: Entry) => entry.target_id === current)
        ? current : body.entries[0]?.target_id ?? '')
      setMessage('')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setEntries([])
      setTargetId('')
      setMessage('Không tải được dữ liệu override. Kiểm tra migration proposal đã được cài trên môi trường test và thử lại.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    const frame = window.requestAnimationFrame(() => void load(controller.signal))
    return () => {
      window.cancelAnimationFrame(frame)
      controller.abort()
    }
  }, [load])

  const submit = async (action: 'set' | 'reset') => {
    if (!selected || reason.trim().length < 5) return
    setPending(true)
    setMessage('')
    try {
      const payload = action === 'set'
        ? {
          action, targetId, permission: 'audit.view_team', decision, reason: reason.trim(),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          expectedVersion: selected.version,
        }
        : { action, targetId, permission: 'audit.view_team', reason: reason.trim(), expectedVersion: selected.version }
      const response = await fetch('/api/rbac/account-overrides', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok || body.ok !== true) throw new Error(body?.error?.code || 'RBAC02_UPDATE_FAILED')
      setMessage('Đã ghi phiên bản mới. Quyền hiệu lực được tính lại ở server; lịch sử cũ được giữ nguyên.')
      setReason('')
      setExpiresAt('')
      await load()
    } catch (error) {
      setMessage(`Không lưu được: ${error instanceof Error ? error.message : 'RBAC02_UPDATE_FAILED'}`)
      if (error instanceof Error && error.message === 'RBAC02_UPDATE_REJECTED') await load()
    } finally {
      setPending(false)
    }
  }

  return <section className="space-y-4 rounded-lg border p-4" data-testid="rbac02-account-overrides">
    <div>
      <h2 className="text-sm font-semibold">Quyền theo tài khoản</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Chỉ hỗ trợ audit.view_team cho Leader. Role DENY và ranh giới quyền luôn được ưu tiên; chưa thay đổi permission khác.
      </p>
    </div>
    {loading ? <p role="status" className="text-sm">Đang tải override…</p> : entries.length === 0
      ? <p className="text-sm text-muted-foreground">Không có Leader đang hoạt động ngoài tài khoản hiện tại.</p>
      : <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="text-sm font-medium">
          Tài khoản Leader
          <select className="mt-1 w-full rounded-md border bg-background p-2" value={targetId}
            onChange={event => setTargetId(event.target.value)}>
            {entries.map(entry => <option key={entry.target_id} value={entry.target_id}>{entry.target_id}</option>)}
          </select>
        </label>
        {selected && <div className="space-y-3 rounded-md border p-3" aria-live="polite">
          <p className="text-xs">Hiệu lực hiện tại: <strong>{selected.effective ? 'ALLOW' : 'DENY'}</strong>
            {' · nguồn: '}{selected.source === 'account_override' ? 'override tài khoản' : 'role default'}</p>
          <p className="text-xs text-muted-foreground">Phiên bản {selected.version}; người sửa: {selected.changed_by ?? '—'}; thời điểm: {selected.changed_at ?? '—'}</p>
          {selected.history.length > 0 && <details className="rounded border p-2 text-xs">
            <summary className="cursor-pointer font-medium">Lịch sử override ({selected.history.length})</summary>
            <ol className="mt-2 space-y-1">
              {selected.history.map(row => <li key={row.version} className="border-t pt-1">
                v{row.version} · {row.decision.toUpperCase()} · {row.changed_by} · {row.changed_at} · {row.reason}
                {row.expires_at ? ` · hết hạn ${row.expires_at}` : ''}
              </li>)}
            </ol>
          </details>}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Quyết định
              <select className="mt-1 w-full rounded-md border bg-background p-2" value={decision}
                onChange={event => setDecision(event.target.value as 'allow' | 'deny')}>
                <option value="deny">DENY</option><option value="allow">ALLOW trong role baseline</option>
              </select>
            </label>
            <label className="text-sm font-medium">Hết hạn (tùy chọn)
              <Input className="mt-1" type="datetime-local" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} />
            </label>
          </div>
          <label className="block text-sm font-medium">Lý do
            <Input className="mt-1" maxLength={500} minLength={5} value={reason}
              onChange={event => setReason(event.target.value)} placeholder="Ghi rõ lý do thay đổi" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending || reason.trim().length < 5}
              onClick={() => void submit('set')}>Ghi override</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || reason.trim().length < 5 || selected.source !== 'account_override'}
              onClick={() => void submit('reset')}>Reset về role default</Button>
          </div>
        </div>}
      </div>}
    {message && <p role="status" className="text-xs">{message}</p>}
  </section>
}
