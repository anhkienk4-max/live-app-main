'use client'

import * as React from 'react'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { Archive, CheckCircle2, Eye, MoreHorizontal, Pencil, Power, PowerOff, RotateCcw, Search, UserPlus, XCircle } from 'lucide-react'
import { shiftService, userService } from '@/lib/services/dataService'
import { OperationalRole, SystemPermission, User } from '@/lib/types/database.types'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Column, DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/toast'
import { StaffFormDialog } from './StaffFormDialog'
import { AccountRequestPanel } from './AccountRequestPanel'
import { PageLoadError } from '@/components/ui/page-load-error'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

type StaffFilters = {
  permissionIds: SystemPermission[]
  roleIds: OperationalRole[]
  statuses: User['status'][]
}

const initialFilters: StaffFilters = { permissionIds: [], roleIds: [], statuses: [] }
const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

export function StaffList() {
  const [selectedStaff, setSelectedStaff] = React.useState<User | null>(null)
  const [detailStaff, setDetailStaff] = React.useState<User | null>(null)
  const detailInitialized = React.useRef(false)
  const [statusTarget, setStatusTarget] = React.useState<User | null>(null)
  const [archiveTarget, setArchiveTarget] = React.useState<User | null>(null)
  const [restoreTarget, setRestoreTarget] = React.useState<User | null>(null)
  const [showArchived, setShowArchived] = React.useState(false)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [tab, setTab] = React.useState<'staff' | 'requests'>('staff')
  const [filters, setFilters] = React.useState<StaffFilters>(initialFilters)
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const canManage = Boolean(currentUser && hasPermission(currentUser, 'staff.manage'))

  const [search, setSearch] = React.useState('')
  const list = usePagedList(userService, 'staff', { search, archived: showArchived, systemPermissions: filters.permissionIds, roles: filters.roleIds, statuses: filters.statuses })
  const { items: staff, loading, error: loadError } = list
  const workloadRows = (list.result as typeof list.result & { workload?: Array<{ staff_id: string; role: string; shift_count: number }> })?.workload ?? []
  const loadStaff = async (forceAll = false) => { void forceAll; await list.reload() }

  const approveAccount = async (user: User) => {
    if (!canManage) return
    await userService.approvePendingAccount(user.id, currentUser?.id)
    toast({ title: t('success'), description: t('accountApprovedByAdmin'), variant: 'success' })
    await loadStaff(true)
  }

  const rejectAccount = async (user: User) => {
    if (!canManage) return
    await userService.rejectPendingAccount(user.id, currentUser?.id)
    toast({ title: t('success'), description: t('accountRejectedByAdmin'), variant: 'success' })
    await loadStaff(true)
  }

  const visibleStaff = staff

  React.useEffect(() => {
    if (loading || detailInitialized.current || !visibleStaff.length) return
    if (window.matchMedia('(max-width: 767px)').matches) return
    detailInitialized.current = true
    setDetailStaff(visibleStaff[0])
  }, [loading, visibleStaff])

  const workload = (userId: string, role: OperationalRole) => workloadRows.find(row => row.staff_id === userId && row.role === role)?.shift_count ?? 0

  const updateStatus = async () => {
    if (!statusTarget || !canManage) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    try {
      const status = statusTarget.status === 'active' ? 'inactive' : 'active'
      await userService.update(statusTarget.id, { status })
      toast({ title: t('success'), description: t(status === 'active' ? 'activate' : 'deactivate'), variant: 'success' })
      setStatusTarget(null)
      await loadStaff(true)
    } catch {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
    }
  }

  const archiveStaff = async () => {
    if (!archiveTarget || !currentUser || !canManage) return
    try {
      await userService.archive(archiveTarget.id, currentUser.id, 'Archived from Staff Management')
      toast({ title: t('success'), description: t('archived'), variant: 'success' })
      setArchiveTarget(null)
      await loadStaff(true)
    } catch {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
    }
  }

  const restoreStaff = async () => {
    if (!restoreTarget || !currentUser || !canManage) return
    try {
      await userService.restore(restoreTarget.id, currentUser.id, 'Restored from Staff Management')
      toast({ title: t('success'), description: t('restored'), variant: 'success' })
      setRestoreTarget(null)
      await loadStaff(true)
    } catch {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
    }
  }


  const openStaffDetail = (row: User) => {
    setDetailStaff(row)
    if (window.matchMedia('(max-width: 767px)').matches) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        document.getElementById('staff-selected-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }))
    }
  }
  const updateSearch = (value: string) => { setSearch(value); setDetailStaff(null); list.reset() }
  const updateFilters = (value: StaffFilters) => { setFilters(value); setDetailStaff(null); list.reset() }
  const renderStaffActions = (row: User, hideView = false) => (
        <div className="flex items-center gap-1 justify-end">
          {!hideView && <Button variant="ghost" size="icon" aria-label={t('viewDetails')} onClick={() => openStaffDetail(row)}><Eye className="h-4 w-4" /></Button>}
          {canManage && <>
            {row.account_status === 'pending_approval' && !row.archived_at && !row.deleted_at && <>
              <Button variant="ghost" size="icon" aria-label={t('approvePendingAccount')} onClick={() => void approveAccount(row)} data-testid={`approve-staff-${row.id}`}><CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /></Button>
              <Button variant="ghost" size="icon" aria-label={t('rejectPendingAccount')} onClick={() => void rejectAccount(row)} data-testid={`reject-staff-${row.id}`}><XCircle className="h-4 w-4 text-red-600 dark:text-red-400" /></Button>
            </>}
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-muted h-9 w-9" aria-label={t('actions')}>
                <MoreHorizontal className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {row.archived_at || row.deleted_at ? (
                  <DropdownMenuItem onClick={() => setRestoreTarget(row)} data-testid={`restore-staff-${row.id}`}><RotateCcw className="mr-2 h-4 w-4" />{t('restore')}</DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onClick={() => { setSelectedStaff(row); setIsFormOpen(true) }} data-testid={`edit-staff-${row.id}`}><Pencil className="mr-2 h-4 w-4" />{t('edit')}</DropdownMenuItem>
                    {row.id !== currentUser?.id && (
                      <DropdownMenuItem onClick={() => setStatusTarget(row)} data-testid={`toggle-staff-${row.id}`}>
                        {row.status === 'active' ? <><PowerOff className="mr-2 h-4 w-4" />{t('deactivate')}</> : <><Power className="mr-2 h-4 w-4" />{t('activate')}</>}
                      </DropdownMenuItem>
                    )}
                    {row.id !== currentUser?.id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => setArchiveTarget(row)} data-testid={`archive-staff-${row.id}`}><Archive className="mr-2 h-4 w-4" />{t('archive')}</DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>}
        </div>
  )

  const columns: Column<User>[] = [
    {
      header: t('staff'),
      accessor: row => (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar>
            <AvatarImage src={row.avatar_url} />
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {row.full_name ? row.full_name.split(' ').map(name => name[0]).join('').toUpperCase() : 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0"><p className="break-words font-medium [overflow-wrap:anywhere]">{row.full_name}</p><p className="break-all text-sm text-muted-foreground">{row.email}</p></div>
        </div>
      ),
    },
    {
      header: t('roles'),
      accessor: row => <div className="flex min-w-0 flex-col items-start gap-1"><Badge variant={resolveSystemPermission(row) === 'admin' ? 'default' : 'secondary'}>{t(resolveSystemPermission(row))}</Badge><span className="text-[11px] text-muted-foreground">{row.operational_roles?.length ? row.operational_roles.map(role => t(role)).join(' · ') : '—'}</span></div>,
    },
    { header: t('department'), accessor: 'department', cell: value => value ? String(value) : <span className="text-muted-foreground">—</span> },
    { header: t('status'), accessor: row => <div className="flex flex-wrap items-center gap-1"><Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{t(row.status)}</Badge><Badge variant="outline">{row.account_status ? t(row.account_status === 'active' ? 'active' : row.account_status === 'rejected' ? 'rejected' : 'pending') : '—'}</Badge></div> },
    {
      header: t('workload'),
      accessor: row => <div className="flex whitespace-nowrap text-[10px] text-muted-foreground" aria-label={operationalRoles.map(role => `${t(role)}: ${workload(row.id, role)}`).join(', ')} title={operationalRoles.map(role => `${t(role)}: ${workload(row.id, role)}`).join(' · ')}>{operationalRoles.map(role => <span key={role} className="mr-1.5 last:mr-0"><strong className="text-slate-700">{role[0].toUpperCase()}</strong> {workload(row.id, role)}</span>)}</div>,
    },
    {
      header: t('actions'),
      accessor: row => renderStaffActions(row),
    },
  ]

  if (loadError) return <PageLoadError error={loadError} onRetry={() => { void loadStaff(true) }} />
  if (loading && staff.length === 0) {
    return (
      <div className="space-y-4" data-testid="staff-initial-loading">
        <div className="flex flex-col gap-2 rounded-lg border bg-white px-3 py-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">{t('staffManagement')}</h1>
            <p className="mt-1 text-muted-foreground">{t('staffManagementSubtitle')}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-white p-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
          <p className="text-xs text-muted-foreground">{t('loading') || 'Đang tải dữ liệu nhân viên...'}</p>
        </div>
      </div>
    )
  }

  return <>
    <div className="mb-3 flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-3 md:flex-row md:items-center md:justify-between md:px-4 md:py-3">
      <div className="min-w-0"><h1 className="text-lg font-semibold leading-tight md:text-xl">{t('staffManagement')}</h1><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground md:text-sm">{t('staffManagementSubtitle')}</p></div>
      {canManage && <div className="grid w-full grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:flex md:w-auto">
        <Button className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-[13px] leading-snug md:w-auto" variant="outline" onClick={() => setShowArchived(value => !value)} data-testid="toggle-archived-staff"><Archive className="mr-2 h-4 w-4" />{t(showArchived ? 'active' : 'archivedRecords')}</Button>
        {!showArchived && <Button className="h-auto min-h-11 w-full whitespace-normal px-3 py-2 text-[13px] leading-snug md:w-auto" onClick={() => { setSelectedStaff(null); setIsFormOpen(true) }} data-testid="add-staff-btn"><UserPlus className="mr-2 h-4 w-4" />{t('addStaff')}</Button>}
      </div>}
    </div>
    <p className="mb-2 text-xs text-muted-foreground">{t('currentPage')}</p>
    <div data-testid="staff-summary-grid" className="mb-3 grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4 md:gap-0 md:overflow-hidden md:rounded-lg md:border md:border-slate-200 md:bg-white">{[[t('staff'),list.total],[t('active'),visibleStaff.filter(user=>user.status==='active').length],[t('inactive'),visibleStaff.filter(user=>user.status==='inactive').length],[t('pendingAccounts'),visibleStaff.filter(user=>user.account_status==='pending_approval').length]].map(([label,value])=><div key={String(label)} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 md:rounded-none md:border-0 md:border-r md:px-3 md:py-2 md:last:border-r-0"><p className="min-h-8 text-xs leading-4 text-slate-600 md:min-h-0">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums md:mt-0 md:text-base">{value}</p></div>)}</div>

    <nav className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b pb-2 [scrollbar-width:thin] [&_button]:min-h-11 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&_button]:text-xs" aria-label={t('staff')}><Button size="sm" variant={tab === 'staff' && !showArchived ? 'default' : 'ghost'} onClick={() => {setTab('staff');setShowArchived(false)}}>{t('staff')} ({list.total})</Button>{canManage && <><Button size="sm" variant={tab === 'requests' ? 'default' : 'ghost'} onClick={() => setTab('requests')}>{t('pending')}</Button><Button size="sm" variant={showArchived ? 'default' : 'ghost'} onClick={() => {setTab('staff');setShowArchived(true)}}>{t('archivedRecords')}</Button></>}</nav>
    {tab === 'requests' && canManage ? <AccountRequestPanel /> : <div className={`grid items-start gap-3 ${detailStaff ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'}`}>    <section data-testid="staff-mobile-layout" className="min-w-0 space-y-3 md:hidden" aria-label={t('staff')}>
      <div className="min-w-0 space-y-3 rounded-xl border bg-white p-3">
        <label htmlFor="staff-mobile-search" className="block text-[13px] font-semibold">{t('searchStaff')}</label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
          <Input id="staff-mobile-search" data-testid="staff-mobile-search" className="min-h-11 w-full pl-10 text-sm"
            value={search} onChange={event => updateSearch(event.target.value)} placeholder={t('searchStaff')} />
        </div>
        <StaffFilterControls filters={filters} onChange={updateFilters} />
      </div>
      <div className="space-y-2.5" aria-busy={list.refreshing}>
        {visibleStaff.length === 0 ? (
          <p className="rounded-xl border bg-white p-6 text-center text-sm text-muted-foreground">{showArchived ? t('archivedRecords') + ': ' + t('noStaff') : t('noStaff')}</p>
        ) : visibleStaff.map(row => (
          <article key={row.id} data-testid={`staff-mobile-card-${row.id}`} className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarImage src={row.avatar_url} />
                <AvatarFallback className="bg-blue-100 text-[13px] font-semibold text-blue-700">
                  {row.full_name ? row.full_name.split(' ').map(name => name[0]).join('').slice(0,2).toUpperCase() : 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <h3 title={row.full_name} className="line-clamp-2 break-words text-sm font-semibold leading-5 text-slate-900 [overflow-wrap:anywhere]">{row.full_name}</h3>
                <p title={row.email} className="mt-0.5 break-all text-xs leading-4 text-slate-600">{row.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={resolveSystemPermission(row) === 'admin' ? 'default' : 'secondary'}>{t(resolveSystemPermission(row))}</Badge>
                  <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{t(row.status)}</Badge>
                  {row.account_status && <Badge variant="outline">{t(row.account_status === 'active' ? 'active' : row.account_status === 'rejected' ? 'rejected' : 'pending')}</Badge>}
                </div>
              </div>
            </div>
            <dl className="grid min-w-0 grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
              <div className="min-w-0"><dt className="mb-1 text-slate-500">{t('department')}</dt><dd className="break-words font-medium [overflow-wrap:anywhere]">{row.department || '—'}</dd></div>
              <div className="min-w-0"><dt className="mb-1 text-slate-500">{t('operationalRoles')}</dt><dd className="break-words font-medium">{row.operational_roles?.length ? row.operational_roles.map(role => t(role)).join(' · ') : '—'}</dd></div>
            </dl>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2">
              {operationalRoles.map(role => <div key={role} className="min-w-0 text-center">
                <p className="truncate text-[11px] text-slate-600">{t(role)}</p><p className="mt-0.5 text-[15px] font-semibold tabular-nums">{workload(row.id, role)}</p>
              </div>)}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <button type="button" className="inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-blue-700" onClick={() => openStaffDetail(row)}>
                <Eye className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('viewDetails')}
              </button>
              <div className="max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11">{renderStaffActions(row, true)}</div>
            </div>
          </article>
        ))}
      </div>
      <HistoryPagination page={list.page} pageSize={list.pageSize} total={list.total}
        onPageChange={value => { setDetailStaff(null); list.setPage(value) }}
        onPageSizeChange={value => { setDetailStaff(null); list.setPageSize(value) }} />
    </section>
    <div className="hidden min-w-0 md:block [&_table]:text-xs [&_th]:px-2 [&_th]:py-2 [&_th]:text-[11px] [&_th]:bg-slate-50 [&_td]:px-2 [&_td]:py-2">



    <DataTable
      data={visibleStaff}
      search={search}
      onSearch={updateSearch}
      pagination={{ loading: list.refreshing, page: list.page, pageSize: list.pageSize, total: list.total,
        onPageChange: value => { setDetailStaff(null); list.setPage(value) },
        onPageSizeChange: value => { setDetailStaff(null); list.setPageSize(value) } }}
      columns={columns}
      searchPlaceholder={t('searchStaff')}
      searchableText={user => [user.full_name, user.email, user.phone, user.department, resolveSystemPermission(user), ...(user.operational_roles || [])].filter(Boolean).join(' ')}
      filterComponent={<StaffFilterControls filters={filters} onChange={updateFilters} />}
      emptyMessage={showArchived ? (t('archivedRecords') + ': ' + t('noStaff')) : t('noStaff')}
    /></div>{detailStaff && <div id="staff-selected-detail" className="min-w-0 scroll-mt-3"><StaffDetail inline user={detailStaff} workload={role => workload(detailStaff.id,role)} onClose={() => setDetailStaff(null)} onEdit={canManage ? () => {setSelectedStaff(detailStaff);setIsFormOpen(true)} : undefined} /></div>}</div>}

    <StaffFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} staff={selectedStaff} onSuccess={() => void loadStaff(true)} />

    {detailStaff && tab !== 'staff' && (
      <StaffDetail
        user={detailStaff}

        workload={role => workload(detailStaff.id, role)}
        onClose={() => setDetailStaff(null)}
        onEdit={canManage ? () => { setSelectedStaff(detailStaff); setDetailStaff(null); setIsFormOpen(true) } : undefined}
      />
    )}

    <AlertDialog
      open={Boolean(statusTarget)}
      onOpenChange={open => !open && setStatusTarget(null)}
      title={t(statusTarget?.status === 'active' ? 'deactivateStaff' : 'activateStaff')}
      description={statusTarget ? `${statusTarget.full_name} · ${t(statusTarget.status)}` : ''}
      onConfirm={updateStatus}
      confirmText={t(statusTarget?.status === 'active' ? 'deactivate' : 'activate')}
      variant={statusTarget?.status === 'active' ? 'destructive' : 'default'}
    />
    <AlertDialog
      open={Boolean(archiveTarget)}
      onOpenChange={open => !open && setArchiveTarget(null)}
      title={t('archive')}
      description={archiveTarget?.full_name || ''}
      onConfirm={archiveStaff}
      confirmText={t('archive')}
      variant="destructive"
    />
    <AlertDialog
      open={Boolean(restoreTarget)}
      onOpenChange={open => !open && setRestoreTarget(null)}
      title={t('restoreRecord')}
      description={restoreTarget?.full_name || ''}
      onConfirm={restoreStaff}
      confirmText={t('restore')}
    />
  </>
}

function StaffFilterControls({ filters, onChange }: { filters: StaffFilters; onChange: (filters: StaffFilters) => void }) {
  const { t } = useTranslation()
  return <div className="grid min-w-0 grid-cols-2 gap-3 md:flex md:flex-wrap md:gap-2">
    <Filter value={filters.permissionIds} onChange={value => onChange({ ...filters, permissionIds: value as SystemPermission[] })} label={t('systemPermissions')} options={['admin', 'leader', 'member']} />
    <Filter value={filters.roleIds} onChange={value => onChange({ ...filters, roleIds: value as OperationalRole[] })} label={t('operationalRoles')} options={operationalRoles} />
    <div className="col-span-2 md:col-span-1"><Filter value={filters.statuses} onChange={value => onChange({ ...filters, statuses: value as User['status'][] })} label={t('status')} options={['active', 'inactive']} /></div>
  </div>
}

function Filter({ value, onChange, label, options }: { value: string[]; onChange: (value: string[]) => void; label: string; options: string[] }) {
  const { translate } = useTranslation()
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option, label: translate(option) }))} className="w-full md:w-40" />
}

function StaffDetail({ user, workload, onClose, onEdit, inline = false }: { inline?: boolean; user: User; workload: (role: OperationalRole) => number; onClose: () => void; onEdit?: () => void }) {
  const { t } = useTranslation()
  const assigned = usePagedList(shiftService, 'staff_detail_' + user.id, { assignedUserIds: [user.id] }, 10)
  const shifts = assigned.items

  const content = <><DialogHeader className="border-b pb-4 mb-2"><div className="flex items-start justify-between gap-3"><div><DialogTitle>{user.full_name}</DialogTitle><p className="mt-1 text-sm text-muted-foreground">{user.email}</p></div>{onEdit && <Button onClick={onEdit} size="sm"><Pencil className="mr-2 h-4 w-4" />{t('edit')}</Button>}</div></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-5 mb-4">
      <Card className="shadow-none sm:col-span-2"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{t('systemPermissions')}</p><Badge className="mt-1.5">{t(resolveSystemPermission(user))}</Badge></CardContent></Card>
      <Card className="shadow-none sm:col-span-3"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground">{t('operationalRoles')}</p><div className="mt-1.5 flex flex-wrap gap-1.5">{user.operational_roles?.length ? user.operational_roles.map(role => <Badge variant="outline" key={role}>{t(role)}</Badge>) : '—'}</div></CardContent></Card>
      {operationalRoles.map(role => <Card key={role} className="shadow-none sm:col-span-1"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground truncate">{t(role)}</p><p className="mt-1 text-xl font-bold">{workload(role)}</p></CardContent></Card>)}
    </div>
    {assigned.error && <PageLoadError error={assigned.error} onRetry={() => void assigned.reload()} />}
    <div className="rounded-md border"><div className="bg-muted/30 px-4 py-2 border-b"><h3 className="font-semibold text-sm">{t('assignedShifts')} ({assigned.total})</h3></div><div className="p-0">{shifts.length ? <div className="divide-y max-h-[300px] overflow-y-auto">{shifts.map(shift => <div className="flex items-center justify-between gap-4 p-3 hover:bg-muted/10 transition-colors" key={shift.id}><div className="min-w-0 flex-1"><p className="font-medium truncate">{shift.title || shift.id}</p><div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground"><span>{shift.date}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{formatShiftTimeRange(shift)}</span></div></div><Badge variant="secondary" className="shrink-0">{t(shift.status)}</Badge></div>)}</div> : <div className="p-4"><p className="text-sm text-muted-foreground">{assigned.loading ? t('loading') : t('noData')}</p></div>}</div></div>
    <HistoryPagination page={assigned.page} pageSize={assigned.pageSize} total={assigned.total} onPageChange={assigned.setPage} onPageSizeChange={assigned.setPageSize} />
  </>
  return inline ? <section className="min-w-0 rounded-lg border bg-white p-3 [&_h2]:text-base" role="region" aria-label={user.full_name}><div className="mb-3 flex items-start gap-2 border-b pb-3"><Avatar className="h-9 w-9 shrink-0"><AvatarImage src={user.avatar_url} /><AvatarFallback className="bg-blue-100 text-xs text-blue-700">{user.full_name.split(' ').map(part=>part[0]).join('').slice(0,2).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.full_name}</p><p className="truncate text-xs text-slate-500">{user.email}</p><div className="mt-1 flex flex-wrap gap-1"><Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{t(user.status)}</Badge>{user.account_status && <Badge variant="outline">{t(user.account_status === 'active' ? 'active' : user.account_status === 'rejected' ? 'rejected' : 'pending')}</Badge>}</div></div><Button variant="ghost" size="sm" onClick={onClose}>{t('close')}</Button></div><section className="rounded-md border p-2.5"><h3 className="mb-2 text-xs font-semibold">{t('systemPermissions')} · {t('operationalRoles')}</h3><div className="flex flex-wrap items-center gap-1"><Badge variant={resolveSystemPermission(user) === 'admin' ? 'default' : 'secondary'}>{t(resolveSystemPermission(user))}</Badge>{user.operational_roles?.length ? user.operational_roles.map(role=><Badge variant="outline" key={role}>{t(role)}</Badge>) : <span className="text-xs text-muted-foreground">—</span>}</div></section><section className="mt-2 rounded-md border p-2.5"><h3 className="mb-2 text-xs font-semibold">{t('staff')}</h3><dl className="space-y-1.5 text-xs">{[['Department',user.department],['Join date',user.join_date],['Updated',user.updated_at]].map(([label,value])=><div key={label} className="grid grid-cols-[72px_1fr] gap-2"><dt className="text-slate-500">{label}</dt><dd className="break-words">{value || '—'}</dd></div>)}</dl></section><section className="mt-2 rounded-md border p-2.5"><h3 className="mb-2 text-xs font-semibold">{t('workload')}</h3><div className="grid grid-cols-3 gap-1">{operationalRoles.map(role=><div key={role} className="rounded bg-slate-50 px-1.5 py-1 text-center"><p className="truncate text-[10px] text-slate-500">{t(role)}</p><p className="text-sm font-semibold">{workload(role)}</p></div>)}</div></section>{onEdit && <Button className="mt-2" size="sm" variant="outline" onClick={onEdit}>{t('edit')}</Button>}<section className="mt-2 rounded-md border p-2.5"><h3 className="mb-2 text-xs font-semibold">{t('assignedShifts')} ({assigned.total})</h3><div className="divide-y text-xs">{shifts.length ? shifts.map(shift=><div key={shift.id} className="py-2"><p className="truncate font-medium">{shift.title || shift.id}</p><p className="mt-1 text-slate-500">{shift.date} · {formatShiftTimeRange(shift)}</p></div>) : <p className="py-2 text-slate-500">{t('noData')}</p>}</div><HistoryPagination page={assigned.page} pageSize={assigned.pageSize} total={assigned.total} onPageChange={assigned.setPage} onPageSizeChange={assigned.setPageSize} /></section></section> : <Dialog open onOpenChange={open => !open && onClose()}><DialogContent size="xl" className="overflow-y-auto">{content}</DialogContent></Dialog>
}
