'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import { Eye, Filter, Loader2, RotateCcw } from 'lucide-react'
import type {
  OperationalRole,
  Shift,
  ShiftRegistration,
  ShiftRegistrationReviewAction,
  ShiftRegistrationReviewResult,
  User,
} from '@/lib/types/database.types'
import { shiftRegistrationService } from '@/lib/services/dataService'
import { hasPermission } from '@/lib/permissions'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import {
  buildPendingStaffingReviewRows,
  filterStaffingReviewRows,
  toggleStaffingReviewSelection,
} from '@/lib/utils/calendarStaffingApproval'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useToast } from '@/components/ui/toast'

interface BulkStaffingApprovalDialogProps {
  open: boolean
  registrations: ShiftRegistration[]
  shifts: Shift[]
  users: User[]
  currentUser: User
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<void> | void
  onOpenShift?: (shift: Shift) => void
}

const requestSourceLabels: Record<ShiftRegistration['source'], TranslationKey> = {
  self_registration: 'selfRegistrationSource',
  manual_assignment: 'manualAssignmentSource',
  legacy_assignment: 'legacyAssignmentSource',
}

export function BulkStaffingApprovalDialog({
  open,
  registrations,
  shifts,
  users,
  currentUser,
  onOpenChange,
  onChanged,
  onOpenShift,
}: BulkStaffingApprovalDialogProps) {
  const { language, t } = useTranslation()
  const { toast } = useToast()
  const dateLocale = language === 'vi' ? vi : enUS
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [dateFilter, setDateFilter] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState<'all' | OperationalRole>('all')
  const [shiftFilter, setShiftFilter] = React.useState('all')
  const [campaignFilter, setCampaignFilter] = React.useState('all')
  const [hostFilter, setHostFilter] = React.useState('all')
  const [supportFilter, setSupportFilter] = React.useState('all')
  const [technicalFilter, setTechnicalFilter] = React.useState('all')
  const [showFilters, setShowFilters] = React.useState(false)
  const [busyAction, setBusyAction] = React.useState<ShiftRegistrationReviewAction | null>(null)
  const [busyRegistrationId, setBusyRegistrationId] = React.useState<string | null>(null)
  const [results, setResults] = React.useState<Map<string, ShiftRegistrationReviewResult>>(new Map())

  const rows = React.useMemo(
    () => buildPendingStaffingReviewRows(registrations, shifts, users),
    [registrations, shifts, users],
  )
  const filteredRows = React.useMemo(() => filterStaffingReviewRows(rows, {
    date: dateFilter,
    role: roleFilter,
    shiftId: shiftFilter,
    campaign: campaignFilter,
    host: hostFilter,
    support: supportFilter,
    technical: technicalFilter,
  }), [campaignFilter, dateFilter, hostFilter, roleFilter, rows, shiftFilter, supportFilter, technicalFilter])
  const filteredIds = React.useMemo(
    () => filteredRows.map(row => row.registration.id),
    [filteredRows],
  )
  const actionableIds = React.useMemo(
    () => new Set(rows.map(row => row.registration.id)),
    [rows],
  )
  const selectedActionableIds = React.useMemo(
    () => [...selectedIds].filter(id => actionableIds.has(id)),
    [actionableIds, selectedIds],
  )
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
  const someFilteredSelected = filteredIds.some(id => selectedIds.has(id))

  React.useEffect(() => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(id => actionableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [actionableIds])

  const campaignOptions = React.useMemo(() => {
    const ids = [...new Set(rows.map(row => row.shift.campaign_id).filter((id): id is string => Boolean(id)))].sort()
    return ids
  }, [rows])
  const hostOptions = React.useMemo(() => users
    .filter(user => user.operational_roles?.includes('host'))
    .slice().sort((a, b) => a.full_name.localeCompare(b.full_name)), [users])
  const supportOptions = React.useMemo(() => users
    .filter(user => user.operational_roles?.includes('support'))
    .slice().sort((a, b) => a.full_name.localeCompare(b.full_name)), [users])
  const technicalOptions = React.useMemo(() => users
    .filter(user => user.operational_roles?.includes('technical'))
    .slice().sort((a, b) => a.full_name.localeCompare(b.full_name)), [users])
  const resetFilters = () => {
    setDateFilter('')
    setRoleFilter('all')
    setShiftFilter('all')
    setCampaignFilter('all')
    setHostFilter('all')
    setSupportFilter('all')
    setTechnicalFilter('all')
  }

  const toggleAllFiltered = () => {
    setSelectedIds(current => toggleStaffingReviewSelection(current, filteredIds, !allFilteredSelected))
  }

  const reviewOne = async (registration: ShiftRegistration, action: ShiftRegistrationReviewAction) => {
    if (busyAction || busyRegistrationId) return
    if (!hasPermission(currentUser, 'shifts.approve_registration')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    setBusyRegistrationId(registration.id)
    try {
      const reviewed = action === 'approve'
        ? await shiftRegistrationService.approve(registration.id, currentUser.id, undefined, registration.version)
        : await shiftRegistrationService.reject(registration.id, currentUser.id, undefined, registration.version)
      setResults(current => new Map(current).set(registration.id, {
        registration_id: registration.id,
        action,
        success: true,
        registration: reviewed,
      }))
      setSelectedIds(current => {
        const next = new Set(current)
        next.delete(registration.id)
        return next
      })
      await onChanged()
    } catch (error) {
      setResults(current => new Map(current).set(registration.id, {
        registration_id: registration.id,
        action,
        success: false,
        error_message: error instanceof Error ? error.message : t('validationError'),
      }))
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally {
      setBusyRegistrationId(null)
    }
  }

  const reviewSelected = async (action: ShiftRegistrationReviewAction) => {
    if (busyAction || selectedActionableIds.length === 0) return
    if (!hasPermission(currentUser, 'shifts.approve_registration')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }

    setBusyAction(action)
    try {
      const reviewResults = await shiftRegistrationService.bulkReview(
        selectedActionableIds,
        action,
        currentUser.id,
        undefined,
        Object.fromEntries(
          selectedActionableIds.map(id => [
            id,
            registrations.find(registration => registration.id === id)?.version ?? 1,
          ]),
        ),
      )
      setResults(new Map(reviewResults.map(result => [result.registration_id, result])))
      const succeeded = reviewResults.filter(result => result.success).length
      const failed = reviewResults.length - succeeded
      setSelectedIds(current => {
        const next = new Set(current)
        reviewResults.filter(result => result.success).forEach(result => next.delete(result.registration_id))
        return next
      })
      if (succeeded > 0) await onChanged()
      toast({
        title: failed === 0 ? t('success') : t('bulkStaffingPartialResult'),
        description: t('bulkStaffingResultSummary', { succeeded, failed }),
        variant: failed > 0 ? 'destructive' : 'success',
      })
    } catch (error) {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('validationError'),
        variant: 'destructive',
      })
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="flex h-[86vh] flex-col overflow-hidden" data-testid="bulk-staffing-approval-dialog">
        <DialogHeader>
          <DialogTitle>{t('bulkStaffingApproval')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('bulkStaffingApprovalDescription')}</p>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <Button
            size="sm"
            variant={showFilters ? 'secondary' : 'outline'}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="bulk-staffing-filter-panel"
            data-testid="bulk-staffing-filter-toggle"
          >
            <Filter className="mr-2 h-3 w-3" />
            {t('filters')}
          </Button>
        </div>

        {showFilters && (
          <div id="bulk-staffing-filter-panel" className="space-y-2 border-b pb-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  type="date"
                  className="h-8 text-xs"
                  aria-label={t('date')}
                  value={dateFilter}
                  onChange={event => setDateFilter(event.target.value)}
                  data-testid="bulk-staffing-date-filter"
                />
                <Select value={roleFilter} onValueChange={value => setRoleFilter(value as 'all' | OperationalRole)}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-role-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')} {t('operationalRoles')}</SelectItem>
                    <SelectItem value="host">{t('host')}</SelectItem>
                    <SelectItem value="support">{t('support')}</SelectItem>
                    <SelectItem value="technical">{t('technical')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={shiftFilter} onValueChange={setShiftFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-shift-filter"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    <SelectItem value="all">{t('allShifts')}</SelectItem>
                    {[...shifts].sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).map(shift => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.date} · {shift.start_time} · {shift.title || shift.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-campaign-filter"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64 overflow-y-auto">
                    <SelectItem value="all">{t('all')} {t('campaigns')}</SelectItem>
                    {campaignOptions.map(id => (
                      <SelectItem key={id} value={id}>{id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <Select value={hostFilter} onValueChange={setHostFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-host-filter"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  <SelectItem value="all">{t('all')} {t('host')}</SelectItem>
                  {hostOptions.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={supportFilter} onValueChange={setSupportFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-support-filter"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  <SelectItem value="all">{t('all')} {t('support')}</SelectItem>
                  {supportOptions.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={technicalFilter} onValueChange={setTechnicalFilter}>
                <SelectTrigger className="h-8 text-xs" data-testid="bulk-staffing-technical-filter"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64 overflow-y-auto">
                  <SelectItem value="all">{t('all')} {t('technical')}</SelectItem>
                  {technicalOptions.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={resetFilters} data-testid="bulk-staffing-reset-filters"><RotateCcw className="mr-2 h-3 w-3" />{t('resetFilters')}</Button>
            </div>
          </div>
        )}

        <DialogBody className="flex-1">
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="bulk-staffing-empty">
              {t('noPendingStaffingRequests')}
            </div>
          ) : (
            <Table data-testid="bulk-staffing-table">
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAllFiltered}
                      aria-label={t('selectAll')}
                    />
                  </TableHead>
                  <TableHead>{t('date')} / {t('time')}</TableHead>
                  <TableHead>{t('shiftTitle')}</TableHead>
                  <TableHead>{t('staff')}</TableHead>
                  <TableHead>{t('role')}</TableHead>
                  <TableHead>{t('source')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map(({ registration, shift, user }) => {
                  const result = results.get(registration.id)
                  return (
                    <TableRow key={registration.id} data-testid={`bulk-staffing-row-${registration.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(registration.id)}
                          onCheckedChange={() => setSelectedIds(current => {
                            const next = new Set(current)
                            if (next.has(registration.id)) next.delete(registration.id)
                            else next.add(registration.id)
                            return next
                          })}
                          aria-label={`${t('select')} ${user?.full_name || registration.user_id}`}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div>{format(new Date(`${shift.date}T00:00:00`), 'P', { locale: dateLocale })}</div>
                        <div className="text-xs text-muted-foreground">{formatShiftTimeRange(shift)}</div>
                      </TableCell>
                      <TableCell>{shift.title || shift.id}</TableCell>
                      <TableCell>
                        <div>{user?.full_name || registration.user_id}</div>
                        {user && (user.status !== 'active' || user.archived_at || user.deleted_at) && (
                          <Badge variant="destructive">{t('inactive')}</Badge>
                        )}
                      </TableCell>
                      <TableCell>{t(registration.operational_role)}</TableCell>
                      <TableCell>{t(requestSourceLabels[registration.source])}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{t('pending')}</Badge>
                        {result && !result.success && (
                          <p className="mt-1 max-w-56 text-xs text-destructive" data-testid={`bulk-staffing-error-${registration.id}`}>
                            {result.error_message || result.error_code}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2 justify-end">
                          {onOpenShift && (
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onOpenShift(shift)} aria-label={t('viewShiftDetail')}>
                              <Eye className="mr-1 h-3 w-3" />{t('viewDetails')}
                            </Button>
                          )}
                          <Button size="sm" className="h-8" disabled={busyRegistrationId !== null || busyAction !== null} onClick={() => void reviewOne(registration, 'approve')}>
                            {t('approve')}
                          </Button>
                          <Button size="sm" variant="outline" className="h-8 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" disabled={busyRegistrationId !== null || busyAction !== null} onClick={() => void reviewOne(registration, 'reject')}>
                            {t('reject')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogBody>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 border-t pt-3">
          <Button className="w-full sm:w-auto" variant="outline" onClick={toggleAllFiltered} disabled={filteredIds.length === 0 || busyAction !== null}>
            {allFilteredSelected ? t('clearSelection') : t('selectAll')}
          </Button>
          <div className="flex flex-col sm:flex-row w-full sm:w-auto items-center gap-3">
            <div className="text-sm font-medium text-foreground bg-muted px-3 py-1.5 rounded-full whitespace-nowrap hidden sm:block">
              {t('selectedCount', { count: selectedActionableIds.length })}
            </div>
            <div className="flex w-full sm:w-auto gap-2">
              <Button
                variant="outline"
                className="flex-1 sm:flex-none text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground px-2 sm:px-4 text-xs sm:text-sm"
                disabled={selectedActionableIds.length === 0 || busyAction !== null}
                onClick={() => reviewSelected('reject')}
                data-testid="bulk-reject-selected"
              >
                {busyAction === 'reject' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="hidden sm:inline">{t('rejectSelected')}</span>
                <span className="sm:hidden">{t('reject')} ({selectedActionableIds.length})</span>
              </Button>
              <Button
                className="flex-1 sm:flex-none px-2 sm:px-4 text-xs sm:text-sm"
                disabled={selectedActionableIds.length === 0 || busyAction !== null}
                onClick={() => reviewSelected('approve')}
                data-testid="bulk-approve-selected"
              >
                {busyAction === 'approve' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="hidden sm:inline">{t('approveSelected')}</span>
                <span className="sm:hidden">{t('approve')} ({selectedActionableIds.length})</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
