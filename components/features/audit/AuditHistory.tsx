'use client'

import * as React from 'react'
import Link from 'next/link'
import { Eye, History, RotateCcw, ShieldAlert } from 'lucide-react'
import { AuditAction, AuditLog, AuditModule, DeletionImpact } from '@/lib/types/database.types'
import { auditService } from '@/lib/services/auditService'
import { ArchivedEntitySummary, lifecycleService } from '@/lib/services/dataService'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasAnyPermission, hasPermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { useToast } from '@/components/ui/toast'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useTranslation } from '@/lib/i18n'

const actions: AuditAction[] = ['create', 'update', 'delete', 'soft_delete', 'restore', 'archive', 'unarchive', 'confirm', 'unconfirm', 'approve', 'reject', 'assign', 'unassign', 'register', 'cancel_registration', 'lock', 'reopen', 'import', 'export', 'ocr_run', 'ocr_rerun', 'ocr_reset', 'upload', 'remove_upload']
const modules: AuditModule[] = ['calendar', 'live', 'reports', 'staff', 'brands', 'platforms', 'campaigns', 'swaps', 'imports', 'settings']

export function AuditHistory() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [actors, setActors] = React.useState<Array<{ id: string; name: string }>>([])
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [sort, setSort] = React.useState<'newest' | 'oldest'>('newest')
  const [archived, setArchived] = React.useState<ArchivedEntitySummary[]>([])
  const [archivedPage, setArchivedPage] = React.useState(1)
  const [archivedPageSize, setArchivedPageSize] = React.useState(10)
  const [selected, setSelected] = React.useState<AuditLog | null>(null)
  const [restoreTarget, setRestoreTarget] = React.useState<ArchivedEntitySummary | null>(null)
  const [filters, setFilters] = React.useState({ query: '', from: '', to: '', actor: 'all', role: 'all', module: 'all', action: 'all', status: 'all', source: 'all' })

  const canView = Boolean(currentUser && hasAnyPermission(currentUser, ['audit.view', 'audit.view_team']))
  const isAdmin = Boolean(currentUser && hasPermission(currentUser, 'audit.view'))

  React.useEffect(() => {
    const stored = Number(window.localStorage.getItem('livestream-ops-audit-page-size'))
    if ([10, 20, 50, 100].includes(stored)) setPageSize(stored)
  }, [])

  const updateFilters = (next: Partial<typeof filters>) => {
    setFilters(current => ({ ...current, ...next }))
    setPage(1)
  }

  const load = React.useCallback(async () => {
    if (!currentUser || !canView) return
    const [visible, deleted] = await Promise.all([
      auditService.getAuditLogs({ user: currentUser, page, pageSize, filters, sort }),
      isAdmin ? lifecycleService.getArchived(currentUser.id) : Promise.resolve([]),
    ])
    setLogs(visible.items)
    setTotal(visible.total)
    setTotalPages(visible.totalPages)
    setActors(visible.actors)
    if (visible.page !== page) setPage(visible.page)
    setArchived(deleted)
  }, [canView, currentUser, filters, isAdmin, page, pageSize, sort])

  React.useEffect(() => { void load() }, [load])

  if (userLoading) return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  if (!currentUser || !canView) {
    return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><ShieldAlert className="mb-3 h-10 w-10 text-amber-600" /><h2 className="font-semibold">{t('accessDenied')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('auditAccessDeniedHelp')}</p></CardContent></Card>
  }

  const archivedTotalPages = Math.max(1, Math.ceil(archived.length / archivedPageSize))
  const safeArchivedPage = Math.min(archivedPage, archivedTotalPages)
  const visibleArchived = archived.slice((safeArchivedPage - 1) * archivedPageSize, safeArchivedPage * archivedPageSize)

  const restoreImpact: DeletionImpact | null = restoreTarget ? {
    entity_type: restoreTarget.entity_type,
    entity_id: restoreTarget.entity_id,
    entity_name: restoreTarget.entity_name,
    action: 'archive',
    consequence: t('restoreConsequence'),
    reversible: true,
    related_records: [],
  } : null

  const restore = async (reason: string) => {
    if (!currentUser || !restoreTarget) return
    try {
      await lifecycleService.restore(restoreTarget.entity_type, restoreTarget.entity_id, currentUser.id, reason)
      toast({ title: t('restored'), description: restoreTarget.entity_name, variant: 'success' })
      setRestoreTarget(null)
      await load()
    } catch (error) {
      toast({ title: t('restoreFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6" />{t('auditHistoryTitle')}</h1><p className="text-sm text-muted-foreground">{t('auditHistoryDescription')}</p></div>
      <Card><CardHeader><CardTitle className="text-base">{t('filters')}</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input placeholder={t('entityActorSearch')} value={filters.query} onChange={event => updateFilters({ query: event.target.value })} />
        <Input type="date" value={filters.from} onChange={event => updateFilters({ from: event.target.value })} />
        <Input type="date" value={filters.to} onChange={event => updateFilters({ to: event.target.value })} />
        <FilterSelect value={filters.actor} onChange={value => updateFilters({ actor: value })} items={actors.map(actor => ({ value: actor.id, label: actor.name }))} placeholder={t('actor')} />
        <FilterSelect value={filters.role} onChange={value => updateFilters({ role: value })} items={['member','leader','admin'].map(value => ({ value, label: value }))} placeholder={t('role')} />
        <FilterSelect value={filters.module} onChange={value => updateFilters({ module: value })} items={modules.map(value => ({ value, label: value }))} placeholder={t('auditModule')} />
        <FilterSelect value={filters.action} onChange={value => updateFilters({ action: value })} items={actions.map(value => ({ value, label: value.replaceAll('_', ' ') }))} placeholder={t('action')} />
        <FilterSelect value={filters.status} onChange={value => updateFilters({ status: value })} items={['success','failed'].map(value => ({ value, label: value }))} placeholder={t('status')} />
        <FilterSelect value={filters.source} onChange={value => updateFilters({ source: value })} items={['manual','excel_import','google_sheets','system','ocr','upload'].map(value => ({ value, label: value }))} placeholder={t('source')} />
        <FilterSelect value={sort} onChange={value => { setSort(value as 'newest' | 'oldest'); setPage(1) }} items={[{ value: 'newest', label: t('newestFirst') }, { value: 'oldest', label: t('oldestFirst') }]} placeholder={t('auditSort')} includeAll={false} />
      </CardContent></Card>

      <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[60vh] overflow-auto"><table className="w-full min-w-[900px] text-sm"><thead className="sticky top-0 z-10 bg-card shadow-sm"><tr className="border-b text-left"><th className="p-2">{t('time')}</th><th className="p-2">{t('actor')}</th><th className="p-2">{t('action')}</th><th className="p-2">{t('auditEntity')}</th><th className="p-2">{t('auditModule')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('auditDetails')}</th></tr></thead><tbody>{logs.map(entry => <tr className="border-b" key={entry.id}><td className="p-2 whitespace-nowrap">{new Date(entry.timestamp).toLocaleString()}</td><td className="p-2">{entry.actor_name}<p className="text-xs text-muted-foreground">{entry.actor_role}</p></td><td className="p-2"><Badge variant="outline">{entry.action.replaceAll('_', ' ')}</Badge></td><td className="p-2">{entry.entity_name}<p className="text-xs text-muted-foreground">{entry.entity_type} · {entry.entity_id}</p></td><td className="p-2">{entry.module}</td><td className="p-2"><Badge className={entry.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>{entry.status}</Badge></td><td className="p-2"><Button size="icon" variant="ghost" aria-label={t('viewAuditDetails')} onClick={() => setSelected(entry)}><Eye className="h-4 w-4" /></Button></td></tr>)}</tbody></table>{logs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('noAuditEvents')}</p>}</div><HistoryPagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); window.localStorage.setItem('livestream-ops-audit-page-size', String(size)) }} /></CardContent></Card>

      {isAdmin && <Card className="overflow-hidden"><CardHeader><CardTitle className="text-base">{t('archivedRecords')}</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[420px] space-y-2 overflow-auto px-6 pb-4">{visibleArchived.map(item => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={`${item.entity_type}-${item.entity_id}`}><div><p className="font-medium">{item.entity_name}</p><p className="text-xs text-muted-foreground">{item.entity_type} · {new Date(item.archived_at).toLocaleString()} · {item.reason || t('noReasonSupplied')}</p></div><Button variant="outline" size="sm" onClick={() => setRestoreTarget(item)}><RotateCcw className="mr-2 h-4 w-4" />{t('restore')}</Button></div>)}{archived.length === 0 && <p className="text-sm text-muted-foreground">{t('noArchivedRecords')}</p>}</div><HistoryPagination page={safeArchivedPage} pageSize={archivedPageSize} total={archived.length} onPageChange={setArchivedPage} onPageSizeChange={size => { setArchivedPageSize(size); setArchivedPage(1) }} /></CardContent></Card>}

      {selected && <AuditDetail entry={selected} currentUser={currentUser} onClose={() => setSelected(null)} onUpdated={async () => { setSelected(null); await load() }} />}
      <LifecycleActionDialog open={Boolean(restoreTarget)} onOpenChange={open => !open && setRestoreTarget(null)} title={t('restoreRecord')} impact={restoreImpact} confirmText={t('restore')} variant="default" onConfirm={restore} />
    </div>
  )
}

function FilterSelect({ value, onChange, items, placeholder, includeAll = true }: { value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }>; placeholder: string; includeAll?: boolean }) {
  const { t } = useTranslation()
  return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger><SelectContent>{includeAll && <SelectItem value="all">{t('all')} {placeholder.toLowerCase()}</SelectItem>}{items.map(item => <SelectItem value={item.value} key={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
}

function AuditDetail({ entry, currentUser, onClose, onUpdated }: { entry: AuditLog; currentUser: NonNullable<ReturnType<typeof useCurrentUser>['currentUser']>; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [note, setNote] = React.useState(entry.admin_note || '')
  const [reviewStatus, setReviewStatus] = React.useState(entry.review_status || 'unreviewed')
  const [handlingReason, setHandlingReason] = React.useState(entry.handling_reason || '')
  const { toast } = useToast()
  const changed = new Set([...Object.keys(entry.before || {}), ...Object.keys(entry.after || {})].filter(key => JSON.stringify(entry.before?.[key]) !== JSON.stringify(entry.after?.[key])))
  const canReview = hasPermission(currentUser, 'audit.review')
  const entityHref = entityLink(entry)
  const save = async () => {
    await auditService.addAdministrativeReview(entry.id, currentUser, { admin_note: note, review_status: reviewStatus, handling_reason: handlingReason })
    toast({ title: 'Audit review saved', variant: 'success' })
    await onUpdated()
  }
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent size="full" className="h-[calc(100vh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:h-[92vh]"><DialogHeader><DialogTitle>Audit event · {entry.action.replaceAll('_', ' ')}</DialogTitle><p className="text-sm text-muted-foreground">{entry.entity_name} · {entry.correlation_id}</p></DialogHeader><DialogBody className="space-y-4"><div className="grid gap-3 md:grid-cols-3"><Meta label="Actor" value={`${entry.actor_name} (${entry.actor_role})`} /><Meta label="Module/source" value={`${entry.module} · ${entry.source}`} /><Meta label="Time/status" value={`${new Date(entry.timestamp).toLocaleString()} · ${entry.status}`} /></div>{entry.reason && <Meta label="Reason" value={entry.reason} />}<div className="grid gap-4 lg:grid-cols-2"><Snapshot title="Before" value={entry.before} changed={changed} /><Snapshot title="After" value={entry.after} changed={changed} /></div>{entry.related_records && entry.related_records.length > 0 && <div><h3 className="mb-2 font-semibold">Related records</h3><ul className="space-y-1">{entry.related_records.map(item => <li className="rounded border p-2 text-sm" key={`${item.entity_type}-${item.entity_id}`}>{item.entity_name} {item.count ? `(${item.count})` : ''}</li>)}</ul></div>}{entityHref && entry.entity_exists && <Button render={<Link href={entityHref} />} variant="outline">Open entity</Button>}{canReview && <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"><label className="text-sm font-medium">Review status<Select value={reviewStatus} onValueChange={value => setReviewStatus(value as NonNullable<AuditLog['review_status']>)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{['unreviewed','reviewed','action_required','resolved'].map(value => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></label><label className="text-sm font-medium">Handling reason<Input className="mt-1" value={handlingReason} onChange={event => setHandlingReason(event.target.value)} /></label><label className="text-sm font-medium md:col-span-2">Administrative note<Textarea className="mt-1" value={note} onChange={event => setNote(event.target.value)} /></label></div>}</DialogBody><DialogFooter><Button variant="outline" onClick={onClose}>Close</Button>{canReview && <Button onClick={() => void save()}>Save review metadata</Button>}</DialogFooter></DialogContent></Dialog>
}

function Meta({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div> }
function Snapshot({ title, value, changed }: { title: string; value?: Record<string, unknown>; changed: Set<string> }) { return <div><h3 className="mb-2 font-semibold">{title}</h3><div className="max-h-[420px] overflow-auto rounded-lg border"><table className="w-full min-w-[420px] text-xs"><tbody>{Object.entries(value || {}).map(([key, field]) => <tr className={changed.has(key) ? 'border-b bg-amber-50' : 'border-b'} key={key}><th className="w-1/3 p-2 text-left align-top">{key}</th><td className="break-all p-2 font-mono">{JSON.stringify(field)}</td></tr>)}</tbody></table>{!value && <p className="p-3 text-muted-foreground">No snapshot.</p>}</div></div> }
function entityLink(entry: AuditLog) { const links: Record<string, string> = { shift: '/calendar', shift_registration: '/calendar', report: '/reports', campaign: '/campaigns', brand: '/brands', platform: '/platforms', staff: '/staff', swap_request: '/swaps', live_snapshot: '/live' }; return links[entry.entity_type] }
