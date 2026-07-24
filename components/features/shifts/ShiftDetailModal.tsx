'use client'

import * as React from 'react'
import { shiftRegistrationService, shiftService, type ShiftRoleCapacity } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User, ShiftRegistration, OperationalRole, DeletionImpact } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { format } from 'date-fns'
import { Calendar, Clock, User as UserIcon, ExternalLink, Trash2, Check, X, Lock, LockOpen, Download, UserPlus } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { exportShiftStaffingToExcel } from '@/lib/utils/excelUtils'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'

interface ShiftDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  onUpdate: () => void
  onDelete: () => void
}

export function ShiftDetailModal({
  open,
  onOpenChange,
  shift,
  brands,
  platforms,
  campaigns,
  users,
  onUpdate,
  onDelete
}: ShiftDetailModalProps) {
  const { toast } = useToast()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [capacities, setCapacities] = React.useState<ShiftRoleCapacity[]>([])
  const [selectedRole, setSelectedRole] = React.useState<OperationalRole>('host')
  const [selectedStaff, setSelectedStaff] = React.useState('')
  const [isLocked, setIsLocked] = React.useState(Boolean(shift.registration_locked))
  const [busy, setBusy] = React.useState(false)
  const [deleteImpact, setDeleteImpact] = React.useState<DeletionImpact | null>(null)
  const [registrationPage, setRegistrationPage] = React.useState(1)
  const [registrationPageSize, setRegistrationPageSize] = React.useState(10)
  const canManageShift = Boolean(currentUser && hasPermission(currentUser, 'shifts.assign_staff'))
  const registrationTotalPages = Math.max(1, Math.ceil(registrations.length / registrationPageSize))
  const safeRegistrationPage = Math.min(registrationPage, registrationTotalPages)
  const visibleRegistrations = registrations.slice(
    (safeRegistrationPage - 1) * registrationPageSize,
    safeRegistrationPage * registrationPageSize,
  )

  const loadStaffing = React.useCallback(async () => {
    const [loadedRegistrations, loadedCapacities, updatedShift] = await Promise.all([
      shiftRegistrationService.getForShift(shift.id),
      shiftRegistrationService.getCapacity(shift.id),
      shiftService.getById(shift.id),
    ])
    setRegistrations(loadedRegistrations)
    setCapacities(loadedCapacities)
    setIsLocked(Boolean(updatedShift?.registration_locked))
  }, [shift.id])

  React.useEffect(() => { if (open) void loadStaffing() }, [loadStaffing, open])
  React.useEffect(() => { setRegistrationPage(1) }, [shift.id])
  
  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find(b => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const getCampaignName = (id?: string) => id ? campaigns.find(c => c.id === id)?.name || 'N/A' : 'N/A'
  const getUserName = (id?: string) => id ? users.find(u => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-800'
      case 'live': return 'bg-red-100 text-red-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'cancelled': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const requestDelete = async () => {
    if (!canManageShift) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    setDeleteImpact(await shiftService.getDeletionImpact(shift.id))
  }

  const handleDelete = async (reason: string) => {
    if (!currentUser) return
    try {
      await shiftService.remove(shift.id, currentUser.id, reason)
      toast({
        title: deleteImpact?.action === 'delete' ? 'Shift deleted' : 'Shift cancelled',
        description: deleteImpact?.consequence,
        variant: 'success'
      })
      setDeleteImpact(null)
      onDelete()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const runStaffingAction = async (action: () => Promise<unknown>, message: string) => {
    if (!currentUser) return
    setBusy(true)
    try {
      await action()
      toast({ title: t('success'), description: message, variant: 'success' })
      await loadStaffing()
      onUpdate()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)}</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">{getPlatformName(shift.platform_id)}</div>
            </div>
            <Badge className={getStatusColor(shift.status)}>
              {shift.status === 'live' ? t('liveStatus') : t(shift.status)}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="info">Additional Info</TabsTrigger>
            <TabsTrigger value="staffing">{t('remainingPositions')}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-gray-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Date</div>
                      <div className="font-semibold">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                      <div className="text-sm text-gray-500">{format(new Date(shift.date), 'EEEE')}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-gray-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Time</div>
                      <div className="font-semibold">{formatShiftTimeRange(shift)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-gray-600 mb-4">Brand & Platform</div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrandColor(shift.brand_id) }}></div>
                      <div className="text-sm text-gray-600">Brand</div>
                    </div>
                    <div className="font-semibold">{getBrandName(shift.brand_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Platform</div>
                    <div className="font-semibold">{getPlatformName(shift.platform_id)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600 mb-1">Campaign</div>
                    <div className="font-semibold">{getCampaignName(shift.campaign_id)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-sm text-gray-600 mb-1">{t('studio')}</div>
                    <div className="font-semibold">{shift.studio || t('notUpdated')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-medium text-gray-600 mb-4">Team</div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-5 w-5 text-blue-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Host</div>
                      <div className="font-semibold">{getUserName(shift.host_id)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-5 w-5 text-green-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Support</div>
                      <div className="font-semibold">{getUserName(shift.support_id)}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <UserIcon className="h-5 w-5 text-purple-600 mt-1" />
                    <div>
                      <div className="text-sm text-gray-600">Technical</div>
                      <div className="font-semibold">{getUserName(shift.technical_id)}</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            {shift.live_link && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Live Link</div>
                      <div className="font-mono text-sm text-blue-600">{shift.live_link}</div>
                    </div>
                    <Button size="sm" onClick={() => window.open(shift.live_link, '_blank')}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {shift.product_notes && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">Product Notes</div>
                  <div className="text-sm whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                    {shift.product_notes}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm text-gray-600 mb-4">Metadata</div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Created:</span>
                    <span className="ml-2">{format(new Date(shift.created_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Updated:</span>
                    <span className="ml-2">{format(new Date(shift.updated_at), 'MMM d, yyyy h:mm a')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="staffing" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {capacities.map(capacity => (
                <Card key={capacity.role}><CardContent className="pt-5"><div className="flex items-center justify-between"><span className="font-semibold">{t(capacity.role)}</span><Badge variant={capacity.remaining > 0 ? 'outline' : 'secondary'}>{capacity.remaining}/{capacity.required}</Badge></div><p className="mt-2 text-xs text-muted-foreground">{capacity.approved} {t('approved')} · {capacity.pending} {t('pending')}</p></CardContent></Card>
              ))}
            </div>

            {currentUser && hasPermission(currentUser, 'shifts.assign_staff') && (
              <Card><CardContent className="pt-5"><div className="flex flex-wrap items-end gap-3"><label className="min-w-40 flex-1 text-xs font-medium">{t('role')}<Select value={selectedRole} onValueChange={value => { setSelectedRole(value as OperationalRole); setSelectedStaff('') }}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{(['host','support','technical'] as OperationalRole[]).map(role => <SelectItem key={role} value={role}>{t(role)}</SelectItem>)}</SelectContent></Select></label><label className="min-w-56 flex-[2] text-xs font-medium">{t('staff')}<Select value={selectedStaff} onValueChange={setSelectedStaff}><SelectTrigger className="mt-1 w-full"><SelectValue placeholder={t('assignStaff')} /></SelectTrigger><SelectContent>{users.filter(user => user.status === 'active' && user.operational_roles?.includes(selectedRole)).map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></label><Button disabled={busy || !selectedStaff} onClick={() => runStaffingAction(() => shiftRegistrationService.assignManually(shift.id, selectedStaff, selectedRole, currentUser.id), t('registrationApproved'))}><UserPlus className="mr-2 h-4 w-4" />{t('assignStaff')}</Button></div></CardContent></Card>
            )}

            <Card className="overflow-hidden"><CardContent className="p-0">
              <div className="max-h-[440px] space-y-2 overflow-auto p-5">
              {registrations.length === 0 ? <p className="text-sm text-muted-foreground">{t('noData')}</p> : visibleRegistrations.map(registration => (
                <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div><p className="font-medium">{getUserName(registration.user_id)} · {t(registration.operational_role)}</p><p className="text-xs text-muted-foreground">{registration.source} · {format(new Date(registration.requested_at), 'dd/MM/yyyy HH:mm')}</p>{registration.review_notes && <p className="mt-1 text-xs">{registration.review_notes}</p>}</div>
                  <div className="flex items-center gap-2"><Badge className={registration.status === 'approved' || registration.status === 'manually_assigned' ? 'bg-green-100 text-green-800' : registration.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}>{registration.status === 'manually_assigned' ? t('manuallyAssigned') : registration.status === 'removed' ? t('removed') : registration.status === 'available' ? t('available') : t(registration.status)}</Badge>{registration.status === 'pending' && currentUser && hasPermission(currentUser, 'shifts.approve_registration') && <><Button size="sm" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.approve(registration.id, currentUser.id), t('registrationApproved'))}><Check className="mr-1 h-4 w-4" />{t('approve')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.reject(registration.id, currentUser.id), t('rejected'))}><X className="mr-1 h-4 w-4" />{t('reject')}</Button></>}</div>
                </div>
              ))}
              </div>
              <HistoryPagination
                page={safeRegistrationPage}
                pageSize={registrationPageSize}
                total={registrations.length}
                onPageChange={setRegistrationPage}
                onPageSizeChange={size => {
                  setRegistrationPageSize(size)
                  setRegistrationPage(1)
                }}
              />
            </CardContent></Card>

            <div className="flex flex-wrap justify-end gap-2">
              {currentUser && hasPermission(currentUser, 'shifts.export') && <Button variant="outline" onClick={() => exportShiftStaffingToExcel(shift, registrations, new Map(users.map(user => [user.id, user.full_name])))}><Download className="mr-2 h-4 w-4" />{t('exportStaffing')}</Button>}
              {currentUser && hasPermission(currentUser, 'shifts.lock') && (isLocked
                ? <Button variant="outline" disabled={busy || shift.status !== 'scheduled'} onClick={() => runStaffingAction(() => shiftService.reopen(shift.id), t('reopenShift'))}><LockOpen className="mr-2 h-4 w-4" />{t('reopenShift')}</Button>
                : <Button variant="outline" disabled={busy} onClick={() => runStaffingAction(() => shiftService.lock(shift.id), t('lockShift'))}><Lock className="mr-2 h-4 w-4" />{t('lockShift')}</Button>)}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex justify-between">
          {canManageShift && <Button variant="outline" className="text-red-600" onClick={() => void requestDelete()}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t('delete')}
          </Button>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('close')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <LifecycleActionDialog open={Boolean(deleteImpact)} onOpenChange={open => !open && setDeleteImpact(null)} title={deleteImpact?.action === 'delete' ? 'Delete shift' : 'Cancel and archive shift'} impact={deleteImpact} confirmText={deleteImpact?.action === 'delete' ? 'Delete' : 'Cancel shift'} onConfirm={handleDelete} />
  </>)
}
