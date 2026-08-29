'use client'

import * as React from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { enUS, vi } from 'date-fns/locale'
import {
  isStaffedRegistration,
  shiftRegistrationService,
  shiftService,
  type ShiftRoleCapacity,
} from '@/lib/services/dataService'
import type {
  Brand,
  Campaign,
  DeletionImpact,
  OperationalRole,
  Platform,
  Shift,
  ShiftRegistration,
  ShiftStaffIdentityMatchMethod,
  ShiftStatus,
  User,
} from '@/lib/types/database.types'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Calendar,
  Check,
  Clock,
  Download,
  ExternalLink,
  Link2,
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { exportShiftStaffingToExcel } from '@/lib/utils/excelUtils'
import { useTranslation, type Language, type TranslationKey } from '@/lib/i18n'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { normalizeStaffingDisplayNames } from '@/lib/utils/scheduleImportPreview'
import { deriveShiftStaffIdentityMatches } from '@/lib/utils/staffIdentityMatching'
import { SwapRequestDialog } from '@/components/features/swaps/SwapRequestDialog'
import { ShiftRegistrationActions } from '@/components/features/calendar/ShiftRegistrationActions'

const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

const roleAssignmentField: Record<OperationalRole, 'host_id' | 'support_id' | 'technical_id'> = {
  host: 'host_id',
  support: 'support_id',
  technical: 'technical_id',
}

const roleRequiredField: Record<OperationalRole, 'required_host_count' | 'required_support_count' | 'required_technical_count'> = {
  host: 'required_host_count',
  support: 'required_support_count',
  technical: 'required_technical_count',
}

const roleImportedNameField: Record<OperationalRole, 'host_names' | 'assistant_names' | 'technical_names'> = {
  host: 'host_names',
  support: 'assistant_names',
  technical: 'technical_names',
}

export type ShiftStaffingLabelValues = {
  host_names: string[]
  assistant_names: string[]
  technical_names: string[]
}

type ShiftStaffingLabelDraft = Record<OperationalRole, string>

export function normalizeShiftStaffingLabelDraft(
  draft: ShiftStaffingLabelDraft,
): ShiftStaffingLabelValues {
  return {
    host_names: normalizeStaffingDisplayNames(draft.host),
    assistant_names: normalizeStaffingDisplayNames(draft.support),
    technical_names: normalizeStaffingDisplayNames(draft.technical),
  }
}

function staffingLabelValuesFromShift(shift: Shift): ShiftStaffingLabelValues {
  return {
    host_names: shift.host_names ?? [],
    assistant_names: shift.assistant_names ?? [],
    technical_names: shift.technical_names ?? [],
  }
}

function staffingLabelDraftFromValues(values: ShiftStaffingLabelValues): ShiftStaffingLabelDraft {
  return {
    host: values.host_names.join(', '),
    support: values.assistant_names.join(', '),
    technical: values.technical_names.join(', '),
  }
}

export function ShiftImportedStaffingLabels({
  shift,
  t,
  testId = 'shift-detail-imported-staffing',
  variant = 'embedded',
}: {
  shift: Shift
  t: (key: TranslationKey) => string
  testId?: string
  variant?: 'embedded' | 'standalone'
}) {
  if (!operationalRoles.some(role => (shift[roleImportedNameField[role]]?.length ?? 0) > 0)) {
    return null
  }

  return (
    <div
      className={variant === 'standalone' ? 'rounded-lg border bg-muted/20 p-4' : 'mt-5 border-t pt-4'}
      data-testid={testId}
    >
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('importedStaffingLabels')}</h4>
      <dl className="grid gap-3 sm:grid-cols-3">
        {operationalRoles.map(role => (
          <div key={role}>
            <dt className="text-xs text-muted-foreground">{t(role)}</dt>
            <dd className="mt-1 break-words text-sm font-medium" data-testid={`${testId}-${role}`}>
              {shift[roleImportedNameField[role]]?.join(', ') || '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ImportedStaffIdentityMapping({
  busy,
  canAssign,
  onAssign,
  registrations,
  shift,
  t,
  users,
}: {
  busy: boolean
  canAssign: boolean
  onAssign: (
    role: OperationalRole,
    importedName: string,
    userId: string,
    matchMethod: ShiftStaffIdentityMatchMethod,
  ) => Promise<void>
  registrations: ShiftRegistration[]
  shift: Shift
  t: (key: TranslationKey) => string
  users: User[]
}) {
  const [selectedUsers, setSelectedUsers] = React.useState<Record<string, string>>({})
  const matches = React.useMemo(() => deriveShiftStaffIdentityMatches({
    host: shift.host_names ?? [],
    support: shift.assistant_names ?? [],
    technical: shift.technical_names ?? [],
  }, users), [shift.assistant_names, shift.host_names, shift.technical_names, users])

  if (matches.length === 0) return null

  return (
    <Card data-testid="shift-imported-staff-identity-mapping">
      <CardContent className="space-y-3 pt-5">
        <div>
          <h4 className="font-semibold">{t('staffIdentityMapping')}</h4>
          <p className="mt-1 text-xs text-muted-foreground">{t('staffIdentityMappingHelp')}</p>
        </div>
        <div className="space-y-3">
          {matches.map((match, index) => {
            const itemKey = `${match.role}:${index}:${match.importedName}`
            const assignedRegistration = registrations.find(registration =>
              registration.shift_id === shift.id &&
              registration.operational_role === match.role &&
              isStaffedRegistration(registration) &&
              registration.imported_name === match.importedName,
            )
            const assignedUser = assignedRegistration
              ? users.find(user => user.id === assignedRegistration.user_id)
              : undefined
            const selectedUserId = selectedUsers[itemKey] ?? match.suggestedUser?.id ?? ''
            const selectedMethod: ShiftStaffIdentityMatchMethod =
              selectedUserId === match.suggestedUser?.id && match.method
                ? match.method
                : 'manual'
            const eligibleUsers = users.filter(user =>
              user.status === 'active' && user.operational_roles?.includes(match.role),
            )
            const statusKey: TranslationKey = assignedRegistration
              ? 'staffMatchAssigned'
              : match.status === 'candidate'
                ? 'staffMatchCandidate'
                : match.status === 'ambiguous'
                  ? 'staffMatchAmbiguous'
                  : 'staffMatchUnmatched'

            return (
              <div
                className="rounded-lg border p-3"
                data-testid={`staff-identity-${match.role}-${index}`}
                key={itemKey}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t(match.role)} · {t('scheduleStaffingName')}</p>
                    <p className="break-words font-medium">{match.importedName}</p>
                  </div>
                  <Badge variant={assignedRegistration ? 'secondary' : 'outline'}>{t(statusKey)}</Badge>
                </div>

                {assignedRegistration ? (
                  <p className="mt-2 text-sm" data-testid={`${itemKey}-assignment`}>
                    {t('actualAssignment')}: {assignedUser?.full_name ?? assignedRegistration.user_id}
                    {assignedRegistration.match_method ? ` · ${t(assignedRegistration.match_method === 'exact' ? 'staffMatchExact' : assignedRegistration.match_method === 'normalized' ? 'staffMatchNormalized' : 'staffMatchManual')}` : ''}
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-xs font-medium">
                      {t('actualAssignment')}
                      <Select
                        disabled={!canAssign || busy}
                        onValueChange={value => setSelectedUsers(current => ({ ...current, [itemKey]: value }))}
                        value={selectedUserId}
                      >
                        <SelectTrigger className="mt-1 w-full" data-testid={`${itemKey}-select`}>
                          <SelectValue placeholder={t('chooseStaff')} />
                        </SelectTrigger>
                        <SelectContent>
                          {eligibleUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                    {canAssign ? (
                      <Button
                        data-testid={`${itemKey}-confirm`}
                        disabled={busy || !selectedUserId}
                        onClick={() => onAssign(match.role, match.importedName, selectedUserId, selectedMethod)}
                        size="sm"
                      >
                        <UserPlus className="mr-2 h-4 w-4" />{t('confirmStaffIdentity')}
                      </Button>
                    ) : null}
                  </div>
                )}

                {!assignedRegistration && match.status === 'candidate' && match.suggestedUser ? (
                  <p className="mt-2 text-xs text-muted-foreground" data-testid={`${itemKey}-suggestion`}>
                    {t('suggestedCandidate')}: {match.suggestedUser.full_name} · {t(match.method === 'exact' ? 'staffMatchExact' : 'staffMatchNormalized')}
                  </p>
                ) : null}
                {!assignedRegistration && match.status === 'ambiguous' ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('matchingCandidates')}: {match.candidates.map(candidate => candidate.full_name).join(', ')}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export function ShiftStaffingLabelsEditor({
  disabled = false,
  onSave,
  shift,
  t,
}: {
  disabled?: boolean
  onSave: (labels: ShiftStaffingLabelValues) => Promise<void>
  shift: Shift
  t: (key: TranslationKey) => string
}) {
  const initialValues = staffingLabelValuesFromShift(shift)
  const [savedValues, setSavedValues] = React.useState(initialValues)
  const [draft, setDraft] = React.useState(() => staffingLabelDraftFromValues(initialValues))
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const startEditing = () => {
    setDraft(staffingLabelDraftFromValues(savedValues))
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft(staffingLabelDraftFromValues(savedValues))
    setEditing(false)
  }

  const save = async () => {
    const normalized = normalizeShiftStaffingLabelDraft(draft)
    setSaving(true)
    try {
      await onSave(normalized)
      setSavedValues(normalized)
      setDraft(staffingLabelDraftFromValues(normalized))
      setEditing(false)
    } catch {
      // The caller owns user-facing error reporting. Keep the draft open.
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border bg-muted/20 p-4" data-testid="shift-detail-staffing-labels-editor">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('importedStaffingLabels')}
        </h4>
        {!editing ? (
          <Button
            data-testid="edit-shift-staffing-labels"
            disabled={disabled}
            onClick={startEditing}
            size="sm"
            type="button"
            variant="outline"
          >
            <Pencil className="mr-2 h-4 w-4" />{t('edit')}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {operationalRoles.map(role => (
              <label className="text-xs font-medium" key={role}>
                {t(role)}
                <Textarea
                  className="mt-1 min-h-20"
                  data-testid={`shift-staffing-labels-${role}`}
                  disabled={saving}
                  value={draft[role]}
                  onChange={event => setDraft(current => ({ ...current, [role]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button disabled={saving} onClick={cancelEditing} type="button" variant="outline">
              {t('cancel')}
            </Button>
            <Button data-testid="save-shift-staffing-labels" disabled={saving} onClick={() => void save()} type="button">
              {t('save')}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {operationalRoles.map(role => (
            <div key={role}>
              <dt className="text-xs text-muted-foreground">{t(role)}</dt>
              <dd className="mt-1 break-words text-sm font-medium" data-testid={`shift-detail-staffing-labels-${role}`}>
                {savedValues[roleImportedNameField[role]].join(', ') || '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

const statusStyles: Record<ShiftStatus, string> = {
  scheduled: 'border-blue-200 bg-blue-50 text-blue-800',
  preparing: 'border-amber-200 bg-amber-50 text-amber-800',
  live: 'border-red-200 bg-red-50 text-red-800',
  paused: 'border-orange-200 bg-orange-50 text-orange-800',
  completed: 'border-green-200 bg-green-50 text-green-800',
  cancelled: 'border-gray-200 bg-gray-100 text-gray-700',
}

export interface ShiftStaffAssignment {
  role: OperationalRole
  user: User | null
  userId: string
  status: 'approved' | 'manually_assigned'
}

interface ShiftDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  allShifts?: Shift[]
  allRegistrations?: ShiftRegistration[]
  onUpdate: () => void
  onEdit?: () => void
  onDelete: () => void
}

export function getShiftStatusClass(status: ShiftStatus) {
  return statusStyles[status]
}

export function safeFormatShiftDate(
  value: string | undefined,
  pattern: string,
  language: Language,
  fallback: string,
) {
  if (!value) return fallback
  const parsed = parseISO(value)
  return isValid(parsed)
    ? format(parsed, pattern, { locale: language === 'vi' ? vi : enUS })
    : fallback
}

export function buildShiftStaffing(
  shift: Shift,
  registrations: ShiftRegistration[],
  users: User[],
): Record<OperationalRole, ShiftStaffAssignment[]> {
  const usersById = new Map(users.map(user => [user.id, user]))
  const result: Record<OperationalRole, ShiftStaffAssignment[]> = {
    host: [],
    support: [],
    technical: [],
  }

  for (const role of operationalRoles) {
    const assignments = new Map<string, ShiftStaffAssignment>()
    const directUserId = shift[roleAssignmentField[role]]
    if (directUserId) {
      assignments.set(directUserId, {
        role,
        user: usersById.get(directUserId) || null,
        userId: directUserId,
        status: 'approved',
      })
    }

    for (const registration of registrations) {
      if (
        registration.shift_id !== shift.id ||
        registration.operational_role !== role ||
        !isStaffedRegistration(registration)
      ) continue

      assignments.set(registration.user_id, {
        role,
        user: usersById.get(registration.user_id) || null,
        userId: registration.user_id,
        status: registration.status === 'manually_assigned' ? 'manually_assigned' : 'approved',
      })
    }

    result[role] = [...assignments.values()]
  }

  return result
}

export function ShiftDetailActions({
  currentUser,
  busy,
  onEdit,
  onDelete,
  onClose,
  editLabel,
  deleteLabel,
  closeLabel,
}: {
  currentUser: User | null
  busy: boolean
  onEdit?: () => void
  onDelete: () => void
  onClose: () => void
  editLabel: string
  deleteLabel: string
  closeLabel: string
}) {
  const canEdit = Boolean(onEdit && currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canDelete = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))
  return (
    <DialogFooter className="flex w-full flex-wrap justify-end gap-2">
      {canEdit ? (
        <Button type="button" variant="outline" disabled={busy} onClick={onEdit} data-testid="edit-shift-detail">
          <Pencil className="mr-2 h-4 w-4" />
          {editLabel}
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" variant="outline" className="text-red-600" disabled={busy} onClick={onDelete} data-testid="delete-shift-detail">
          <Trash2 className="mr-2 h-4 w-4" />
          {deleteLabel}
        </Button>
      ) : null}
      <Button type="button" variant="outline" disabled={busy} onClick={onClose} data-testid="close-shift-detail">
        {closeLabel}
      </Button>
    </DialogFooter>
  )
}

export function ShiftDetailModal({
  open,
  onOpenChange,
  shift,
  brands,
  platforms,
  campaigns,
  users,
  allShifts,
  allRegistrations,
  onUpdate,
  onEdit,
  onDelete,
}: ShiftDetailModalProps) {
  const { toast } = useToast()
  const { language, t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [capacities, setCapacities] = React.useState<ShiftRoleCapacity[]>([])
  const [selectedRole, setSelectedRole] = React.useState<OperationalRole>('host')
  const [selectedStaff, setSelectedStaff] = React.useState('')
  const [isLocked, setIsLocked] = React.useState(Boolean(shift.registration_locked))
  const [busy, setBusy] = React.useState(false)
  const [staffingLoading, setStaffingLoading] = React.useState(false)
  const [staffingError, setStaffingError] = React.useState(false)
  const [deleteImpact, setDeleteImpact] = React.useState<DeletionImpact | null>(null)
  const [registrationPage, setRegistrationPage] = React.useState(1)
  const [registrationPageSize, setRegistrationPageSize] = React.useState(10)
  const [showSwapDialog, setShowSwapDialog] = React.useState(false)
  const canDeleteShift = Boolean(currentUser && hasPermission(currentUser, 'shifts.delete'))
  const canEditStaffingLabels = Boolean(currentUser && hasPermission(currentUser, 'shifts.edit'))
  const canAssignStaff = Boolean(currentUser && hasPermission(currentUser, 'shifts.assign_staff'))
  const registrationTotalPages = Math.max(1, Math.ceil(registrations.length / registrationPageSize))
  const safeRegistrationPage = Math.min(registrationPage, registrationTotalPages)
  const visibleRegistrations = registrations.slice(
    (safeRegistrationPage - 1) * registrationPageSize,
    safeRegistrationPage * registrationPageSize,
  )

  const loadStaffing = React.useCallback(async () => {
    setStaffingLoading(true)
    setStaffingError(false)
    try {
      const [loadedRegistrations, loadedCapacities, updatedShift] = await Promise.all([
        shiftRegistrationService.getForShift(shift.id),
        shiftRegistrationService.getCapacity(shift.id),
        shiftService.getById(shift.id),
      ])
      setRegistrations(loadedRegistrations)
      setCapacities(loadedCapacities)
      setIsLocked(Boolean(updatedShift?.registration_locked))
    } catch {
      setStaffingError(true)
    } finally {
      setStaffingLoading(false)
    }
  }, [shift.id])

  React.useEffect(() => {
    if (open) void loadStaffing()
  }, [loadStaffing, open])
  React.useEffect(() => {
    setRegistrationPage(1)
    setIsLocked(Boolean(shift.registration_locked))
  }, [shift.id, shift.registration_locked])

  const staffing = React.useMemo(
    () => buildShiftStaffing(shift, registrations, users),
    [registrations, shift, users],
  )
  const myRegistration = React.useMemo(() => registrations.find(r => r.user_id === currentUser?.id && r.shift_id === shift.id && isStaffedRegistration(r)), [registrations, currentUser?.id, shift.id])
  const registrationContext = allRegistrations ?? registrations
  const canRequestSwap = Boolean(myRegistration && shift.status === 'scheduled' && !shift.deleted_at && !shift.archived_at)
  const dateTime = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)
  const fallback = t('notProvided')
  const brand = brands.find(item => item.id === shift.brand_id)
  const platform = platforms.find(item => item.id === shift.platform_id)
  const campaign = shift.campaign_id ? campaigns.find(item => item.id === shift.campaign_id) : undefined
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || fallback : fallback
  const statusKey: TranslationKey = shift.status === 'live' ? 'liveStatus' : shift.status

  const requestDelete = async () => {
    if (!canDeleteShift) {
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
        title: deleteImpact?.action === 'delete' ? t('shiftDeleted') : t('shiftCancelled'),
        description: deleteImpact?.consequence,
        variant: 'success',
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

  const saveStaffingLabels = async (labels: ShiftStaffingLabelValues) => {
    if (!currentUser) throw new Error(t('permissionDenied'))
    try {
      const updated = await shiftService.updateStaffingLabels(shift.id, labels, currentUser.id)
      if (!updated) throw new Error(t('validationError'))
      toast({ title: t('success'), description: t('shiftUpdated'), variant: 'success' })
      onUpdate()
    } catch (error) {
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('validationError'),
        variant: 'destructive',
      })
      throw error
    }
  }

  const assignImportedStaff = async (
    role: OperationalRole,
    importedName: string,
    userId: string,
    matchMethod: ShiftStaffIdentityMatchMethod,
  ) => {
    if (!currentUser) return
    await runStaffingAction(
      () => shiftRegistrationService.assignImported(
        shift.id,
        userId,
        role,
        importedName,
        matchMethod,
        currentUser.id,
      ),
      t('staffIdentityAssigned'),
    )
  }

  const registerForRole = async (role: OperationalRole) => {
    if (!currentUser) return
    await runStaffingAction(
      () => shiftRegistrationService.register(shift.id, currentUser.id, role),
      t('registrationPending'),
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          size="xl"
          className="h-[calc(100vh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:h-[92vh]"
          data-testid="shift-detail-modal"
        >
          <DialogHeader>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <DialogTitle className="break-words pr-2 text-xl sm:text-2xl" data-testid="shift-detail-title">
                  {shift.title?.trim() || t('shiftDetail')}
                </DialogTitle>
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {brand?.name || fallback} · {platform?.name || fallback}
                </p>
              </div>
              <Badge className={`${getShiftStatusClass(shift.status)} w-fit shrink-0`} variant="outline" data-testid="shift-detail-status">
                {t(statusKey)}
              </Badge>
            </div>
          </DialogHeader>

          <DialogBody className="pb-1">
            <Tabs defaultValue="overview" className="min-w-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger className="min-w-0 px-2 text-xs sm:text-sm" value="overview">{t('shiftOverview')}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-2 text-xs sm:text-sm" value="staffing">{t('staffing')}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-2 text-xs sm:text-sm" value="details">{t('additionalInfo')}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 pt-1">
                <Card>
                  <CardContent className="grid gap-5 pt-6 sm:grid-cols-2">
                    <OverviewItem icon={<Calendar className="h-5 w-5" />} label={t('date')} testId="shift-detail-date">
                      <p className="font-semibold">
                        {safeFormatShiftDate(shift.date, 'PP', language, fallback)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {safeFormatShiftDate(shift.date, 'EEEE', language, fallback)}
                      </p>
                    </OverviewItem>
                    <OverviewItem icon={<Clock className="h-5 w-5" />} label={t('time')} testId="shift-detail-time">
                      <p className="font-semibold">
                        {shift.start_time || fallback} – {shift.end_time || fallback}
                      </p>
                      {dateTime?.valid && dateTime.crossesMidnight ? (
                        <p className="text-xs font-medium text-indigo-700" data-testid="shift-detail-overnight">
                          {t('endsNextDay')}: {safeFormatShiftDate(dateTime.endDate, 'PP', language, fallback)}
                        </p>
                      ) : null}
                    </OverviewItem>
                    <OverviewItem icon={<MapPin className="h-5 w-5" />} label={t('studio')}>
                      <p className="font-semibold">{shift.studio?.trim() || fallback}</p>
                    </OverviewItem>
                    <OverviewItem icon={<Link2 className="h-5 w-5" />} label={t('shiftIdentifier')}>
                      <p className="break-all font-mono text-sm font-semibold">{shift.id || fallback}</p>
                    </OverviewItem>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('brandAndPlatform')}</h3>
                    <dl className="grid gap-5 sm:grid-cols-2">
                      <DetailValue label={t('brand')} value={brand?.name || fallback} color={brand?.color} />
                      <DetailValue label={t('platform')} value={platform?.name || fallback} />
                      <DetailValue className="sm:col-span-2" label={t('campaign')} value={campaign?.name || fallback} />
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('team')}</h3>
                    <div className="grid gap-4 lg:grid-cols-3">
                      {operationalRoles.map(role => (
                        <RoleAssignments
                          assignments={staffing[role]}
                          key={role}
                          label={t(role)}
                          notAssignedLabel={t('notAssigned')}
                          required={shift[roleRequiredField[role]]}
                          requiredLabel={t('required')}
                          t={t}
                          testId={`shift-detail-role-${role}`}
                        />
                      ))}
                    </div>
                    <ShiftImportedStaffingLabels shift={shift} t={t} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="staffing" className="space-y-4 pt-1">
                <ShiftRegistrationActions
                  allShifts={allShifts ?? [shift]}
                  currentUser={currentUser}
                  onRegister={registerForRole}
                  registrations={registrationContext}
                  shift={shift}
                />
                {canEditStaffingLabels ? (
                  <ShiftStaffingLabelsEditor
                    disabled={busy}
                    key={`${shift.id}:${shift.host_names?.join('|')}:${shift.assistant_names?.join('|')}:${shift.technical_names?.join('|')}`}
                    onSave={saveStaffingLabels}
                    shift={shift}
                    t={t}
                  />
                ) : (
                  <ShiftImportedStaffingLabels
                    shift={shift}
                    t={t}
                    testId="shift-detail-staffing-imported-labels"
                    variant="standalone"
                  />
                )}

                <ImportedStaffIdentityMapping
                  busy={busy}
                  canAssign={canAssignStaff}
                  onAssign={assignImportedStaff}
                  registrations={registrations}
                  shift={shift}
                  t={t}
                  users={users}
                />

                {staffingLoading ? (
                  <div className="space-y-3" data-testid="staffing-skeleton">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <Card key={index}><CardContent className="space-y-2 pt-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-2/3" /></CardContent></Card>
                    ))}
                  </div>
                ) : staffingError ? (
                  <Card><CardContent className="py-8 text-center text-muted-foreground">{t('staffingUnavailable')}</CardContent></Card>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {capacities.map(capacity => (
                      <Card key={capacity.role}>
                        <CardContent className="pt-5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{t(capacity.role)}</span>
                            <Badge variant={capacity.remaining > 0 ? 'outline' : 'secondary'}>{capacity.remaining}/{capacity.required}</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {capacity.approved} {t('approved')} · {capacity.pending} {t('pending')}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {canAssignStaff && currentUser ? (
                  <Card>
                    <CardContent className="pt-5">
                      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <label className="min-w-40 flex-1 text-xs font-medium">
                          {t('role')}
                          <Select value={selectedRole} onValueChange={value => { setSelectedRole(value as OperationalRole); setSelectedStaff('') }}>
                            <SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>{operationalRoles.map(role => <SelectItem key={role} value={role}>{t(role)}</SelectItem>)}</SelectContent>
                          </Select>
                        </label>
                        <label className="min-w-0 flex-[2] text-xs font-medium sm:min-w-56">
                          {t('staff')}
                          <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                            <SelectTrigger className="mt-1 w-full"><SelectValue placeholder={t('assignStaff')} /></SelectTrigger>
                            <SelectContent>{users.filter(user => user.status === 'active' && user.operational_roles?.includes(selectedRole)).map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent>
                          </Select>
                        </label>
                        <Button disabled={busy || !selectedStaff} onClick={() => runStaffingAction(() => shiftRegistrationService.assignManually(shift.id, selectedStaff, selectedRole, currentUser.id), t('registrationApproved'))}>
                          <UserPlus className="mr-2 h-4 w-4" />{t('assignStaff')}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}
                {canRequestSwap && myRegistration && (
                  <Card><CardContent className="pt-5 flex justify-end"><Button variant="outline" onClick={() => setShowSwapDialog(true)}>Đổi ca</Button></CardContent></Card>
                )}
                {canRequestSwap && myRegistration && (
                  <SwapRequestDialog open={showSwapDialog} onOpenChange={setShowSwapDialog} sourceShift={shift} sourceRegistration={myRegistration} shifts={[]} users={users} currentUser={currentUser!} onSuccess={loadStaffing} />
                )}

                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="max-h-[440px] space-y-2 overflow-auto p-5">
                      {registrations.length === 0 ? <p className="text-sm text-muted-foreground">{t('noData')}</p> : visibleRegistrations.map(registration => (
                        <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <p className="break-words font-medium">{userName(registration.user_id)} · {t(registration.operational_role)}</p>
                            <p className="text-xs text-muted-foreground">{registration.source} · {safeFormatShiftDate(registration.requested_at, 'Pp', language, fallback)}</p>
                            {registration.review_notes ? <p className="mt-1 break-words text-xs">{registration.review_notes}</p> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={registration.status === 'approved' || registration.status === 'manually_assigned' ? 'bg-green-100 text-green-800' : registration.status === 'pending' ? 'bg-amber-100 text-amber-800' : ''}>
                              {registration.status === 'manually_assigned' ? t('manuallyAssigned') : registration.status === 'removed' ? t('removed') : registration.status === 'available' ? t('available') : t(registration.status)}
                            </Badge>
                            {registration.status === 'pending' && currentUser && hasPermission(currentUser, 'shifts.approve_registration') ? (
                              <>
                                <Button size="sm" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.approve(registration.id, currentUser.id, undefined, registration.version), t('registrationApproved'))}><Check className="mr-1 h-4 w-4" />{t('approve')}</Button>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.reject(registration.id, currentUser.id, undefined, registration.version), t('rejected'))}><X className="mr-1 h-4 w-4" />{t('reject')}</Button>
                              </>
                            ) : null}
                          </div>
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
                  </CardContent>
                </Card>

                <div className="flex flex-wrap justify-end gap-2">
                  {currentUser && hasPermission(currentUser, 'shifts.export') ? (
                    <Button variant="outline" onClick={() => exportShiftStaffingToExcel(shift, registrations, new Map(users.map(user => [user.id, user.full_name])))}>
                      <Download className="mr-2 h-4 w-4" />{t('exportStaffing')}
                    </Button>
                  ) : null}
                  {currentUser && hasPermission(currentUser, 'shifts.lock') ? (
                    isLocked
                      ? <Button variant="outline" disabled={busy || shift.status !== 'scheduled'} onClick={() => runStaffingAction(() => shiftService.reopen(shift.id), t('reopenShift'))}><LockOpen className="mr-2 h-4 w-4" />{t('reopenShift')}</Button>
                      : <Button variant="outline" disabled={busy} onClick={() => runStaffingAction(() => shiftService.lock(shift.id), t('lockShift'))}><Lock className="mr-2 h-4 w-4" />{t('lockShift')}</Button>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-4 pt-1">
                <Card>
                  <CardContent className="space-y-5 pt-6">
                    <DetailValue label={t('liveUrl')} value={shift.live_link?.trim() || fallback} />
                    {shift.live_link?.trim() ? (
                      <a
                        className="inline-flex max-w-full items-center gap-2 break-all text-sm font-medium text-blue-700 underline-offset-4 hover:underline"
                        href={shift.live_link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        {t('openLiveLink')}
                      </a>
                    ) : null}
                    <DetailValue label={t('productNotes')} value={shift.product_notes?.trim() || fallback} preserveWhitespace />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <h3 className="mb-4 text-sm font-semibold text-muted-foreground">{t('metadata')}</h3>
                    <dl className="grid gap-4 text-sm sm:grid-cols-2">
                      <DetailValue label={t('createdAt')} value={safeFormatShiftDate(shift.created_at, 'Pp', language, fallback)} />
                      <DetailValue label={t('updatedAt')} value={safeFormatShiftDate(shift.updated_at, 'Pp', language, fallback)} />
                      <DetailValue className="sm:col-span-2" label={t('updatedBy')} value={shift.updated_by ? userName(shift.updated_by) : fallback} />
                    </dl>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </DialogBody>

          <ShiftDetailActions
            currentUser={currentUser}
            busy={busy}
            onEdit={onEdit}
            onDelete={() => void requestDelete()}
            onClose={() => onOpenChange(false)}
            editLabel={t('edit')}
            deleteLabel={t('delete')}
            closeLabel={t('close')}
          />
        </DialogContent>
      </Dialog>
      <LifecycleActionDialog
        open={Boolean(deleteImpact)}
        onOpenChange={nextOpen => { if (!nextOpen) setDeleteImpact(null) }}
        title={deleteImpact?.action === 'delete' ? t('deleteShiftTitle') : t('cancelArchiveShiftTitle')}
        impact={deleteImpact}
        confirmText={deleteImpact?.action === 'delete' ? t('delete') : t('cancel')}
        onConfirm={handleDelete}
      />
    </>
  )
}

function OverviewItem({
  children,
  icon,
  label,
  testId,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  label: string
  testId?: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-3" data-testid={testId}>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  )
}

function DetailValue({
  className,
  color,
  label,
  preserveWhitespace = false,
  value,
}: {
  className?: string
  color?: string
  label: string
  preserveWhitespace?: boolean
  value: string
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {color ? <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: color }} /> : null}
        {label}
      </dt>
      <dd className={`mt-1 break-words font-medium ${preserveWhitespace ? 'whitespace-pre-wrap rounded-lg bg-muted/40 p-3' : ''}`}>{value}</dd>
    </div>
  )
}

function RoleAssignments({
  assignments,
  label,
  notAssignedLabel,
  required,
  requiredLabel,
  t,
  testId,
}: {
  assignments: ShiftStaffAssignment[]
  label: string
  notAssignedLabel: string
  required?: number
  requiredLabel: string
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string
  testId: string
}) {
  const requiredValue = typeof required === 'number' && Number.isFinite(required) ? required : '—'

  return (
    <section className="min-w-0 rounded-lg border p-4" data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{label}</h4>
        <Badge variant="outline">{requiredLabel}: {requiredValue}</Badge>
      </div>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{notAssignedLabel}</p>
      ) : (
        <div className="space-y-3">
          {assignments.map(assignment => {
            const name = assignment.user?.full_name?.trim() || notAssignedLabel
            const initials = name === notAssignedLabel
              ? '?'
              : name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
            return (
              <div className="flex min-w-0 items-center gap-3" key={assignment.userId}>
                <Avatar>
                  {assignment.user?.avatar_url ? <AvatarImage alt={name} src={assignment.user.avatar_url} /> : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{name}</p>
                  <Badge className="mt-1" variant="secondary">
                    {assignment.status === 'manually_assigned' ? t('manuallyAssigned') : t('approved')}
                  </Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
