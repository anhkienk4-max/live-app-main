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
import { ChevronLeft } from 'lucide-react'
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
  Lock,
  LockOpen,
  MapPin,
  Pencil,
  Trash2,
  UserPlus,
  X,
  FileText,
} from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { exportShiftStaffingToExcel } from '@/lib/utils/excelUtils'
import { useTranslation, type Language, type TranslationKey } from '@/lib/i18n'
import { getCurrentBusinessDate, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { normalizeStaffingDisplayNames } from '@/lib/utils/scheduleImportPreview'
import { deriveShiftStaffIdentityMatches } from '@/lib/utils/staffIdentityMatching'
import { SwapRequestDialog } from '@/components/features/swaps/SwapRequestDialog'
import { ShiftRegistrationActions } from '@/components/features/calendar/ShiftRegistrationActions'
import { deriveShiftAttention } from '@/lib/ui/operational-attention'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { ShiftLifecycleActions } from './ShiftLifecycleActions'
import { resolveStaffingLabelsForRole, StaffingLabel } from '@/lib/utils/staffingResolver'

const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

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



export interface ShiftDetailWorkspaceProps {
  onBack?: () => void
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
    <div className="flex justify-end gap-2 mt-4">
      <Button className="w-full sm:w-auto" type="button" variant="outline" disabled={busy} onClick={onClose} data-testid="close-shift-detail">
        {closeLabel}
      </Button>
      {canDelete ? (
        <Button className="w-full sm:w-auto text-red-600" type="button" variant="outline" disabled={busy} onClick={onDelete} data-testid="delete-shift-detail">
          <Trash2 className="mr-2 h-4 w-4" />
          {deleteLabel}
        </Button>
      ) : null}
      {canEdit ? (
        <Button className="w-full sm:w-auto" type="button" variant="outline" disabled={busy} onClick={onEdit} data-testid="edit-shift-detail">
          <Pencil className="mr-2 h-4 w-4" />
          {editLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function ShiftDetailWorkspace({
  onBack,
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
}: ShiftDetailWorkspaceProps) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required immediate staffing refresh contract
    void loadStaffing()
  }, [loadStaffing])
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- required immediate shift-state reconciliation contract
    setRegistrationPage(1)
    setIsLocked(Boolean(shift.registration_locked))
  }, [shift.id, shift.registration_locked])


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

  // E5: Exception-first attention derivation
  const pendingCount = registrations.filter(r => r.status === 'pending').length
  const todayDate = getCurrentBusinessDate()
  const isUpcoming = shift.date >= todayDate

  const required = {
    host: shift.required_host_count ?? 1,
    support: shift.required_support_count ?? 0,
    technical: shift.required_technical_count ?? 0,
  }
  const staffed = {
    host: registrations.filter(r => r.operational_role === 'host' && isStaffedRegistration(r)).length,
    support: registrations.filter(r => r.operational_role === 'support' && isStaffedRegistration(r)).length,
    technical: registrations.filter(r => r.operational_role === 'technical' && isStaffedRegistration(r)).length,
  }

  const attention = deriveShiftAttention({
    shiftId: shift.id,
    shiftDate: shift.date,
    shiftStatus: shift.status,
    pendingCount,
    isUpcoming,
    required,
    staffed,
  })

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
      await shiftService.remove(shift.id, currentUser.id, reason, shift.version)
      toast({
        title: deleteImpact?.action === 'delete' ? t('shiftDeleted') : t('shiftCancelled'),
        description: deleteImpact?.consequence,
        variant: 'success',
      })
      setDeleteImpact(null)
      onDelete()
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('validationError')
      if (msg.toLowerCase().includes('version') || msg.toLowerCase().includes('stale') || msg.toLowerCase().includes('conflict') || msg.toLowerCase().includes('modified')) {
        toast({ title: t('error'), description: "This shift was modified by another user. Please refresh and try again.", variant: 'destructive' })
      } else {
        toast({ title: t('error'), description: msg, variant: 'destructive' })
      }
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
      const updated = await shiftService.updateStaffingLabels(shift.id, labels, currentUser.id, shift.version)
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
        shift.version,
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
      <div className="flex h-full flex-col bg-muted/5 w-full overflow-hidden" data-testid="shift-detail-workspace">
        <div className="flex h-full flex-col w-full">
          {/* A. COMMAND HEADER */}
          <header className="sticky top-0 z-10 border-b bg-background px-6 py-4 shadow-sm flex-shrink-0">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="mb-4 -ml-2 text-muted-foreground">
                <ChevronLeft className="mr-1 h-4 w-4" /> {t('back')}
              </Button>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <Badge className={`${getShiftStatusClass(shift.status)} shrink-0`} variant="outline" data-testid="shift-detail-status">
                    {t(statusKey)}
                  </Badge>
                  <h1 className="break-words text-xl sm:text-2xl font-bold leading-none" data-testid="shift-detail-title">
                    {shift.title?.trim() || t('shiftDetail')}
                  </h1>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {brand?.color ? <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: brand.color }} /> : null}
                    {brand?.name || fallback}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/40">•</span>
                    {platform?.name || fallback}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {safeFormatShiftDate(shift.date, 'PP', language, fallback)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {shift.start_time || fallback} – {shift.end_time || fallback}
                  </span>
                  {shift.studio?.trim() && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      {shift.studio.trim()}
                    </span>
                  )}
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex flex-col items-end gap-3 shrink-0">
                <div className="flex items-center gap-2">
                   {currentUser && hasPermission(currentUser, 'shifts.export') ? (
                    <Button size="sm" variant="outline" onClick={() => exportShiftStaffingToExcel(shift, registrations, new Map(users.map(user => [user.id, user.full_name])))}>
                      <Download className="mr-2 h-4 w-4" />{t('exportStaffing')}
                    </Button>
                  ) : null}
                  {currentUser && hasPermission(currentUser, 'shifts.lock') ? (
                    isLocked
                      ? <Button size="sm" variant="outline" disabled={busy || shift.status !== 'scheduled'} onClick={() => runStaffingAction(() => shiftService.reopen(shift.id, undefined, shift.version), t('reopenShift'))}><LockOpen className="mr-2 h-4 w-4" />{t('reopenShift')}</Button>
                      : <Button size="sm" variant="outline" disabled={busy} onClick={() => runStaffingAction(() => shiftService.lock(shift.id, undefined, shift.version), t('lockShift'))}><Lock className="mr-2 h-4 w-4" />{t('lockShift')}</Button>
                  ) : null}
                </div>
                <ShiftLifecycleActions shift={shift} onSuccess={onUpdate} />
              </div>
            </div>

            {attention.length > 0 && (
              <div className="mt-4">
                <OperationalStatusStrip items={attention} compact />
              </div>
            )}
            
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-8">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* LEFT 8 COLUMNS */}
                <div className="lg:col-span-8 space-y-6">
            <Tabs defaultValue="overview" className="min-w-0">
              <TabsList className="mx-4 mt-4 flex w-auto overflow-x-auto sm:mx-6">
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="overview">{t('shiftOverview')}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="staffing">{t('staffing')}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="registration">{t('registration') || 'Registration'}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="live">{t('live') || 'Live'}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="details">{t('additionalInfo')}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="reports">{t('reports') || 'Reports'}</TabsTrigger>
                <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="activity">{t('activity') || 'Activity'}</TabsTrigger>
                {currentUser?.system_permission === 'admin' && (
                  <TabsTrigger className="min-w-0 px-3 text-xs sm:text-sm whitespace-nowrap" value="audit">{t('audit') || 'Audit'}</TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="space-y-6 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

               {/* LEFT COLUMN: Summary & Details */}
               <div className="lg:col-span-5 space-y-6">

                 {/* B. OPERATIONAL SUMMARY */}
                 <section>
                   <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('shiftOverview')}</h3>
                   <div className="rounded-lg border bg-card p-0 shadow-sm divide-y">
                      <dl className="grid grid-cols-1 text-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2">
                          <dt className="text-muted-foreground">{t('campaign')}</dt>
                          <dd className="font-medium text-foreground text-right">{campaign?.name || '—'}</dd>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2">
                          <dt className="text-muted-foreground">{t('date')}</dt>
                          <dd className="font-medium text-foreground text-right">
                             {safeFormatShiftDate(shift.date, 'EEEE, PP', language, fallback)}
                          </dd>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2">
                          <dt className="text-muted-foreground">{t('time')}</dt>
                          <dd className="font-medium text-foreground text-right">
                            {shift.start_time || fallback} – {shift.end_time || fallback}
                            {dateTime?.valid && dateTime.crossesMidnight && (
                              <span className="block text-[11px] font-bold text-indigo-600 mt-0.5" data-testid="shift-detail-overnight">
                                {t('endsNextDay')}: {safeFormatShiftDate(dateTime.endDate, 'MMM d', language, fallback)}
                              </span>
                            )}
                          </dd>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-2">
                          <dt className="text-muted-foreground">{t('shiftIdentifier')}</dt>
                          <dd className="font-mono text-[11px] text-muted-foreground text-right break-all">{shift.id || fallback}</dd>
                        </div>
                      </dl>
                   </div>
                 </section>

                 </div>
                </div>
              </TabsContent>

              <TabsContent value="details" className="space-y-6 p-4 sm:p-6">
                 <section>
                   <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('additionalInfo')}</h3>
                   <div className="rounded-lg border bg-card shadow-sm divide-y text-sm">
                      <div className="p-4 space-y-2">
                        <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t('liveUrl')}</div>
                        {shift.live_link?.trim() ? (
                          <a
                            className="inline-flex max-w-full items-center gap-1.5 break-all font-medium text-blue-600 hover:text-blue-800 hover:underline"
                            href={shift.live_link}
                            rel="noreferrer"
                            target="_blank"
                          >
                            <ExternalLink className="h-4 w-4 shrink-0" />
                            {shift.live_link.trim()}
                          </a>
                        ) : (
                          <div className="text-foreground">{fallback}</div>
                        )}
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{t('productNotes')}</div>
                        <div className={`text-foreground break-words ${shift.product_notes?.trim() ? 'whitespace-pre-wrap' : ''}`}>
                          {shift.product_notes?.trim() || fallback}
                        </div>
                      </div>

                      <div className="p-4 grid grid-cols-2 gap-5 text-sm">
                        <div>
                           <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-1">{t('createdAt')}</div>
                           <div className="font-medium text-xs">{safeFormatShiftDate(shift.created_at, 'Pp', language, fallback)}</div>
                        </div>
                        <div>
                           <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-1">{t('updatedAt')}</div>
                           <div className="font-medium text-xs">{safeFormatShiftDate(shift.updated_at, 'Pp', language, fallback)}</div>
                        </div>
                        <div className="col-span-2">
                           <div className="text-muted-foreground text-[10px] uppercase font-semibold mb-1">{t('updatedBy')}</div>
                           <div className="font-medium text-xs">{shift.updated_by ? userName(shift.updated_by) : fallback}</div>
                        </div>
                      </div>
                   </div>
                  </section>
                </TabsContent>

                <TabsContent value="staffing" className="space-y-6 p-4 sm:p-6">
                {/* RIGHT COLUMN: Staffing & Workflow */}
                <div className="space-y-6">

                 {/* C. STAFFING */}
                 <section>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('staffing')}</h3>
                    </div>

                    {staffingLoading ? (
                      <div className="space-y-3" data-testid="staffing-skeleton">
                        {Array.from({ length: 3 }).map((_, index) => (
                          <Card key={index}><CardContent className="space-y-2 pt-5"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-full" /></CardContent></Card>
                        ))}
                      </div>
                    ) : staffingError ? (
                      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center text-sm text-destructive font-medium">{t('staffingUnavailable')}</div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-3 mb-4">
                        {capacities.map(capacity => (
                          <div key={capacity.role} className="rounded-lg border bg-card p-3 shadow-sm">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="font-bold text-sm text-foreground">{t(capacity.role)}</span>
                                <Badge variant={capacity.remaining > 0 ? 'outline' : 'secondary'} className="h-5 px-1.5 text-[10px]">{capacity.remaining}/{capacity.required}</Badge>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                                <span className="text-green-700 bg-green-50 px-1 rounded-sm">{capacity.approved} {t('approved')}</span>
                                {capacity.pending > 0 && <span className="text-amber-700 bg-amber-50 px-1 rounded-sm">{capacity.pending} {t('pending')}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-3">
                      {operationalRoles.map(role => (
                        <RoleAssignments
                          labels={resolveStaffingLabelsForRole(shift, registrations, users, role, t)}
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
                 </section>

                </div>
                </TabsContent>
                <TabsContent value="registration" className="space-y-6 p-4 sm:p-6">
                  <div className="space-y-6">
                 {/* D. REGISTRATION / WORKFLOW STATE */}
                 <section className="space-y-4">
                    <ShiftRegistrationActions
                      allShifts={allShifts ?? [shift]}
                      currentUser={currentUser}
                      onRegister={registerForRole}
                      registrations={registrationContext}
                      shift={shift}
                    />

                    {canRequestSwap && myRegistration && (
                      <Card><CardContent className="pt-5 flex justify-end"><Button variant="outline" onClick={() => setShowSwapDialog(true)}>Đổi ca</Button></CardContent></Card>
                    )}
                    {canRequestSwap && myRegistration && (
                      <SwapRequestDialog open={showSwapDialog} onOpenChange={setShowSwapDialog} sourceShift={shift} sourceRegistration={myRegistration} shifts={[]} users={users} currentUser={currentUser!} onSuccess={loadStaffing} />
                    )}

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
                            <Button disabled={busy || !selectedStaff} onClick={() => runStaffingAction(() => shiftRegistrationService.assignManually(shift.id, selectedStaff, selectedRole, currentUser.id, shift.version), t('registrationApproved'))}>
                              <UserPlus className="mr-2 h-4 w-4" />{t('assignStaff')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : null}

                    {/* Registrations List */}
                    {registrations.length > 0 && (
                      <div className="rounded-lg border bg-card shadow-sm overflow-hidden mt-6">
                        <div className="p-3.5 border-b bg-muted/10 font-semibold text-sm text-foreground">
                           {t('staffing')} ({registrations.length})
                        </div>
                        <div className="p-0">
                          <div className="max-h-[400px] overflow-auto p-2 space-y-2">
                            {visibleRegistrations.map(registration => (
                              <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-muted/50 bg-background p-3 hover:bg-muted/10 transition-colors">
                                <div className="min-w-0">
                                  <p className="break-words font-medium text-sm text-foreground">
                                    {userName(registration.user_id)}
                                    <span className="text-muted-foreground/40 font-normal mx-1.5">•</span>
                                    {t(registration.operational_role)}
                                  </p>
                                  <p className="text-[11px] font-medium text-muted-foreground mt-0.5">
                                    <span className="uppercase tracking-wider">{registration.source}</span>
                                    <span className="mx-1.5 text-muted-foreground/40">•</span>
                                    {safeFormatShiftDate(registration.requested_at, 'Pp', language, fallback)}
                                  </p>
                                  {registration.review_notes ? <p className="mt-2 break-words text-xs text-muted-foreground italic border-l-2 pl-2 border-muted">{registration.review_notes}</p> : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge className={registration.status === 'approved' || registration.status === 'manually_assigned' ? 'bg-green-100 text-green-800 border-green-200' : registration.status === 'pending' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-muted text-muted-foreground'} variant="outline">
                                    {registration.status === 'manually_assigned' ? t('manuallyAssigned') : registration.status === 'removed' ? t('removed') : registration.status === 'available' ? t('available') : t(registration.status)}
                                  </Badge>
                                  {registration.status === 'pending' && currentUser && hasPermission(currentUser, 'shifts.approve_registration') ? (
                                    <>
                                      <Button size="sm" variant="outline" className="h-7 text-xs border-green-200 text-green-700 hover:bg-green-50" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.approve(registration.id, currentUser.id, undefined, registration.version), t('registrationApproved'))}><Check className="mr-1 h-3 w-3" />{t('approve')}</Button>
                                      <Button size="sm" variant="outline" className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => runStaffingAction(() => shiftRegistrationService.reject(registration.id, currentUser.id, undefined, registration.version), t('rejected'))}><X className="mr-1 h-3 w-3" />{t('reject')}</Button>
                                    </>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                          {registrations.length > registrationPageSize && (
                            <div className="border-t p-2 bg-muted/5">
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
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                 </section>

                  </div>
                </TabsContent>
              </Tabs>
                          </div>
                
                {/* RIGHT 4 COLUMNS: Operational Sidebar */}
                <div className="lg:col-span-4 space-y-6">
                  <section className="rounded-lg border bg-card p-4 shadow-sm">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('liveStatus')}</h3>
                    {shift.live_link?.trim() ? (
                      <div className="rounded border p-3 bg-muted/10">
                        <div className="aspect-video bg-black/5 rounded flex items-center justify-center mb-3">
                           <span className="text-muted-foreground text-xs font-medium">Live Preview</span>
                        </div>
                        <a
                          className="inline-flex w-full items-center justify-center rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          href={shift.live_link}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {t('openLiveStudio')} <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">{t('notProvided')}</div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </main>

          <div className="sticky bottom-0 z-10 border-t bg-background px-6 py-4 shadow-sm">
             <ShiftDetailActions
                currentUser={currentUser}
                busy={busy}
                onEdit={onEdit}
                onDelete={() => void requestDelete()}
                onClose={() => onBack?.()}
                editLabel={t('edit')}
                deleteLabel={t('delete')}
                closeLabel={t('close')}
              />
          </div>
        </div>
      </div>

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



function RoleAssignments({
  labels,
  label,
  notAssignedLabel,
  required,
  requiredLabel,
  t,
  testId,
}: {
  labels: StaffingLabel[]
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
      {labels.length === 0 ? (
        <p className="text-sm text-muted-foreground">{notAssignedLabel}</p>
      ) : (
        <div className="space-y-3">
          {labels.map((lbl, idx) => {
            const name = lbl.name
            const initials = lbl.isUnassigned
              ? '?'
              : name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
            return (
              <div className="flex min-w-0 items-center gap-3" key={lbl.id + idx}>
                <Avatar>
                  {lbl.avatarUrl ? <AvatarImage alt={name} src={lbl.avatarUrl} /> : null}
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className={`break-words font-medium ${lbl.isUnassigned ? 'text-muted-foreground italic' : ''}`}>{name}</p>
                  {!lbl.isUnassigned && (
                    <Badge className="mt-1" variant="secondary">
                      {lbl.isImportedOnly ? t('scheduleStaffingName') : t('approved')}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
