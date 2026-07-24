'use client'

import * as React from 'react'
import { CheckCircle2, Eye, Pencil, Power, PowerOff, UserPlus, XCircle } from 'lucide-react'
import { isStaffedRegistration, shiftRegistrationService, shiftService, userService } from '@/lib/services/dataService'
import { OperationalRole, Shift, ShiftRegistration, SystemPermission, User } from '@/lib/types/database.types'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Column, DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { StaffFormDialog } from './StaffFormDialog'

type StaffFilters = {
  permission: 'all' | SystemPermission
  role: 'all' | OperationalRole
  status: 'all' | User['status']
}

const initialFilters: StaffFilters = { permission: 'all', role: 'all', status: 'all' }
const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

export function StaffList() {
  const [staff, setStaff] = React.useState<User[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedStaff, setSelectedStaff] = React.useState<User | null>(null)
  const [detailStaff, setDetailStaff] = React.useState<User | null>(null)
  const [statusTarget, setStatusTarget] = React.useState<User | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [filters, setFilters] = React.useState<StaffFilters>(initialFilters)
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const canManage = Boolean(currentUser && hasPermission(currentUser, 'staff.manage'))

  const loadStaff = React.useCallback(async () => {
    setLoading(true)
    const [loadedStaff, loadedShifts, loadedRegistrations] = await Promise.all([
      userService.getAll(),
      shiftService.getAll(),
      shiftRegistrationService.getAll(),
    ])
    setStaff(loadedStaff)
    setShifts(loadedShifts)
    setRegistrations(loadedRegistrations)
    setLoading(false)
  }, [])

  React.useEffect(() => { void loadStaff() }, [loadStaff])

  const approveAccount = async (user: User) => {
    if (!canManage) return
    await userService.approvePendingAccount(user.id, currentUser?.id)
    toast({ title: t('success'), description: t('accountApprovedByAdmin'), variant: 'success' })
    await loadStaff()
  }

  const rejectAccount = async (user: User) => {
    if (!canManage) return
    await userService.rejectPendingAccount(user.id, currentUser?.id)
    toast({ title: t('success'), description: t('accountRejectedByAdmin'), variant: 'success' })
    await loadStaff()
  }

  const visibleStaff = React.useMemo(() => {
    const permitted = resolveSystemPermission(currentUser) === 'member'
      ? staff.filter(user => user.id === currentUser?.id)
      : staff
    return permitted
      .filter(user => filters.permission === 'all' || resolveSystemPermission(user) === filters.permission)
      .filter(user => filters.role === 'all' || user.operational_roles?.includes(filters.role))
      .filter(user => filters.status === 'all' || user.status === filters.status)
  }, [currentUser, filters, staff])

  const assignedShifts = React.useCallback((userId: string) => {
    const registeredShiftIds = new Set(registrations
      .filter(registration => registration.user_id === userId && isStaffedRegistration(registration))
      .map(registration => registration.shift_id))
    return shifts.filter(shift =>
      registeredShiftIds.has(shift.id) ||
      shift.host_id === userId ||
      shift.support_id === userId ||
      shift.technical_id === userId
    )
  }, [registrations, shifts])

  const workload = React.useCallback((userId: string, role: OperationalRole) => {
    const field = role === 'host' ? 'host_id' : role === 'support' ? 'support_id' : 'technical_id'
    return shifts.filter(shift =>
      shift[field] === userId ||
      registrations.some(registration =>
        registration.shift_id === shift.id &&
        registration.user_id === userId &&
        registration.operational_role === role &&
        isStaffedRegistration(registration)
      )
    ).length
  }, [registrations, shifts])

  const updateStatus = async () => {
    if (!statusTarget || !canManage) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    const status = statusTarget.status === 'active' ? 'inactive' : 'active'
    await userService.update(statusTarget.id, { status })
    toast({ title: t('success'), description: t(status === 'active' ? 'activate' : 'deactivate'), variant: 'success' })
    setStatusTarget(null)
    await loadStaff()
  }

  const columns: Column<User>[] = [
    {
      header: t('staff'),
      accessor: row => (
        <div className="flex min-w-56 items-center gap-3">
          <Avatar>
            <AvatarImage src={row.avatar_url} />
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {row.full_name?.split(' ').map(name => name[0]).join('').toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div><p className="font-medium">{row.full_name}</p><p className="text-sm text-muted-foreground">{row.email}</p></div>
        </div>
      ),
    },
    {
      header: t('systemPermissions'),
      accessor: row => <Badge variant={resolveSystemPermission(row) === 'admin' ? 'default' : 'secondary'}>{t(resolveSystemPermission(row))}</Badge>,
    },
    {
      header: t('operationalRoles'),
      accessor: row => <div className="flex min-w-44 flex-wrap gap-1">{row.operational_roles?.length ? row.operational_roles.map(role => <Badge variant="outline" key={role}>{t(role)}</Badge>) : <span className="text-muted-foreground">—</span>}</div>,
    },
    { header: t('department'), accessor: 'department', cell: value => value || <span className="text-muted-foreground">—</span> },
    { header: t('status'), accessor: row => <Badge variant={row.status === 'active' ? 'default' : 'secondary'}>{t(row.status)}</Badge> },
    {
      header: t('workload'),
      accessor: row => operationalRoles.map(role => `${t(role)}: ${workload(row.id, role)}`).join(' · '),
    },
    {
      header: t('actions'),
      accessor: row => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('viewDetails')} onClick={() => setDetailStaff(row)}><Eye className="h-4 w-4" /></Button>
          {canManage && <>
            {row.account_status === 'pending_approval' && <>
              <Button variant="ghost" size="icon" aria-label={t('approvePendingAccount')} onClick={() => void approveAccount(row)} data-testid={`approve-staff-${row.id}`}><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>
              <Button variant="ghost" size="icon" aria-label={t('rejectPendingAccount')} onClick={() => void rejectAccount(row)} data-testid={`reject-staff-${row.id}`}><XCircle className="h-4 w-4 text-red-600" /></Button>
            </>}
            <Button variant="ghost" size="icon" aria-label={t('edit')} onClick={() => { setSelectedStaff(row); setIsFormOpen(true) }} data-testid={`edit-staff-${row.id}`}><Pencil className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label={t(row.status === 'active' ? 'deactivate' : 'activate')} onClick={() => setStatusTarget(row)} data-testid={`toggle-staff-${row.id}`}>
              {row.status === 'active' ? <PowerOff className="h-4 w-4 text-amber-600" /> : <Power className="h-4 w-4 text-green-600" />}
            </Button>
          </>}
        </div>
      ),
    },
  ]

  if (loading) return <div className="py-12 text-center">{t('loading')}</div>

  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-2xl font-bold">{t('staffManagement')}</h2><p className="mt-1 text-muted-foreground">{t('staffManagementSubtitle')}</p></div>
      {canManage && <Button onClick={() => { setSelectedStaff(null); setIsFormOpen(true) }} data-testid="add-staff-btn"><UserPlus className="mr-2 h-4 w-4" />{t('addStaff')}</Button>}
    </div>

    <DataTable
      data={visibleStaff}
      columns={columns}
      searchPlaceholder={t('searchStaff')}
      searchableText={user => [user.full_name, user.email, user.phone, user.department, resolveSystemPermission(user), ...(user.operational_roles || [])].filter(Boolean).join(' ')}
      filterComponent={<StaffFilterControls filters={filters} onChange={setFilters} />}
      emptyMessage={t('noStaff')}
    />

    <StaffFormDialog open={isFormOpen} onOpenChange={setIsFormOpen} staff={selectedStaff} onSuccess={loadStaff} />

    {detailStaff && (
      <StaffDetail
        user={detailStaff}
        shifts={assignedShifts(detailStaff.id)}
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
  </>
}

function StaffFilterControls({ filters, onChange }: { filters: StaffFilters; onChange: (filters: StaffFilters) => void }) {
  const { t } = useTranslation()
  return <div className="flex flex-wrap gap-2">
    <Filter value={filters.permission} onChange={value => onChange({ ...filters, permission: value as StaffFilters['permission'] })} label={t('systemPermissions')} options={['admin', 'leader', 'member']} />
    <Filter value={filters.role} onChange={value => onChange({ ...filters, role: value as StaffFilters['role'] })} label={t('operationalRoles')} options={operationalRoles} />
    <Filter value={filters.status} onChange={value => onChange({ ...filters, status: value as StaffFilters['status'] })} label={t('status')} options={['active', 'inactive']} />
  </div>
}

function Filter({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: string[] }) {
  const { t, translate } = useTranslation()
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-40" aria-label={label}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')} {label}</SelectItem>{options.map(option => <SelectItem key={option} value={option}>{translate(option)}</SelectItem>)}</SelectContent></Select>
}

function StaffDetail({ user, shifts, workload, onClose, onEdit }: { user: User; shifts: Shift[]; workload: (role: OperationalRole) => number; onClose: () => void; onEdit?: () => void }) {
  const { t } = useTranslation()
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><div className="flex items-start justify-between gap-3"><div><DialogTitle>{user.full_name}</DialogTitle><p className="mt-1 text-sm text-muted-foreground">{user.email}</p></div>{onEdit && <Button onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />{t('edit')}</Button>}</div></DialogHeader>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('systemPermissions')}</p><Badge className="mt-2">{t(resolveSystemPermission(user))}</Badge></CardContent></Card>
      <Card className="sm:col-span-2"><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t('operationalRoles')}</p><div className="mt-2 flex flex-wrap gap-2">{user.operational_roles?.length ? user.operational_roles.map(role => <Badge variant="outline" key={role}>{t(role)}</Badge>) : '—'}</div></CardContent></Card>
      {operationalRoles.map(role => <Card key={role}><CardContent className="pt-5"><p className="text-xs text-muted-foreground">{t(role)} · {t('workload')}</p><p className="mt-1 text-2xl font-bold">{workload(role)}</p></CardContent></Card>)}
    </div>
    <div><h3 className="mb-3 font-semibold">{t('assignedShifts')} ({shifts.length})</h3>{shifts.length ? <div className="space-y-2">{shifts.sort((left, right) => `${left.date}${left.start_time}`.localeCompare(`${right.date}${right.start_time}`)).map(shift => <div className="rounded-lg border p-3" key={shift.id}><p className="font-medium">{shift.title || shift.id}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {t(shift.status)}</p></div>)}</div> : <p className="text-sm text-muted-foreground">{t('noData')}</p>}</div>
  </DialogContent></Dialog>
}
