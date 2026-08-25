'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import { Eye, Loader2 } from 'lucide-react'
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
  const [busyAction, setBusyAction] = React.useState<ShiftRegistrationReviewAction | null>(null)
  const [results, setResults] = React.useState<Map<string, ShiftRegistrationReviewResult>>(new Map())

  const rows = React.useMemo(
    () => buildPendingStaffingReviewRows(registrations, shifts, users),
    [registrations, shifts, users],
  )
  const filteredRows = React.useMemo(() => filterStaffingReviewRows(rows, {
    date: dateFilter,
    role: roleFilter,
    shiftId: shiftFilter,
  }), [dateFilter, roleFilter, rows, shiftFilter])
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

  const toggleAllFiltered = () => {
    setSelectedIds(current => toggleStaffingReviewSelection(current, filteredIds, !allFilteredSelected))
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
      <DialogContent size="xl" className="h-[86vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden" data-testid="bulk-staffing-approval-dialog">
        <DialogHeader>
          <DialogTitle>{t('bulkStaffingApproval')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('bulkStaffingApprovalDescription')}</p>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 border-y py-3 sm:grid-cols-3">
          <Input
            type="date"
            aria-label={t('date')}
            value={dateFilter}
            onChange={event => setDateFilter(event.target.value)}
            data-testid="bulk-staffing-date-filter"
          />
          <Select value={roleFilter} onValueChange={value => setRoleFilter(value as 'all' | OperationalRole)}>
            <SelectTrigger data-testid="bulk-staffing-role-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('all')} {t('operationalRoles')}</SelectItem>
              <SelectItem value="host">{t('host')}</SelectItem>
              <SelectItem value="support">{t('support')}</SelectItem>
              <SelectItem value="technical">{t('technical')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={shiftFilter} onValueChange={setShiftFilter}>
            <SelectTrigger data-testid="bulk-staffing-shift-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allShifts')}</SelectItem>
              {shifts.map(shift => (
                <SelectItem key={shift.id} value={shift.id}>
                  {shift.date} · {shift.start_time} · {shift.title || shift.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogBody>
          {filteredRows.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground" data-testid="bulk-staffing-empty">
              {t('noPendingStaffingRequests')}
            </div>
          ) : (
            <Table data-testid="bulk-staffing-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allFilteredSelected}
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
                  <TableHead className="w-16">{t('actions')}</TableHead>
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
                        {onOpenShift && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onOpenShift(shift)}
                            aria-label={t('viewShiftDetail')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DialogBody>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <Button variant="outline" onClick={toggleAllFiltered} disabled={filteredIds.length === 0 || busyAction !== null}>
            {allFilteredSelected ? t('clearSelection') : t('selectAll')}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {t('selectedCount', { count: selectedActionableIds.length })}
            </span>
            <Button
              variant="outline"
              disabled={selectedActionableIds.length === 0 || busyAction !== null}
              onClick={() => reviewSelected('reject')}
              data-testid="bulk-reject-selected"
            >
              {busyAction === 'reject' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('rejectSelected')}
            </Button>
            <Button
              disabled={selectedActionableIds.length === 0 || busyAction !== null}
              onClick={() => reviewSelected('approve')}
              data-testid="bulk-approve-selected"
            >
              {busyAction === 'approve' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('approveSelected')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
