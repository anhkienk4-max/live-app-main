'use client'

import * as React from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Loader2, Calendar, Clock, Moon, CheckCircle2, AlertCircle, RotateCcw, Search } from 'lucide-react'
import { isStaffedRegistration, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import type { Brand, OperationalRole, Platform, Shift, ShiftRegistration, SwapExchangeCandidate, UserDirectoryEntry } from '@/lib/types/database.types'
import { formatShiftTimeRange, getCurrentBusinessDate, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'

type Mode = 'replacement' | 'exchange'
type SourcePage = { key: string; items: Shift[]; registrations: ShiftRegistration[]; total: number; page: number; error: string | null }
type ShiftPage = { key: string; items: Shift[]; total: number; page: number; error: string | null }
export type ConflictVerificationStatus = 'idle' | 'checking' | 'verified_clear' | 'conflict' | 'unverified'
export type ConflictSnapshot = {
  key: string
  status: 'verified_clear' | 'conflict' | 'unverified'
  reason: string | null
  error: string | null
}
const pageSize = 20

export function SwapRequestFormModal({ open, onOpenChange, brands, platforms, onSuccess }: {
  open: boolean; onOpenChange: (open: boolean) => void; brands: Brand[]; platforms: Platform[]; onSuccess: () => void
}) {
  const { currentUser } = useCurrentUser()
  const { language, t } = useTranslation()
  const { toast } = useToast()
  const copy = React.useCallback((vi: string, en: string) => language === 'vi' ? vi : en, [language])
  const owner = currentUser?.id ?? ''
  const [mode, setMode] = React.useState<Mode>('replacement')
  const [sourcePage, setSourcePage] = React.useState(1)
  const [sourceSearchDraft, setSourceSearchDraft] = React.useState('')
  const [sourceSearch, setSourceSearch] = React.useState('')
  const [from, setFrom] = React.useState(getCurrentBusinessDate)
  const [to, setTo] = React.useState('')
  const [brandId, setBrandId] = React.useState('')
  const [platformId, setPlatformId] = React.useState('')
  const [sourceRevision, setSourceRevision] = React.useState(0)
  const [sourceSnapshot, setSourceSnapshot] = React.useState<SourcePage | null>(null)
  const [sourceId, setSourceId] = React.useState('')
  const [role, setRole] = React.useState<OperationalRole | ''>('')
  const [directorySnapshot, setDirectorySnapshot] = React.useState<{ owner: string; items: UserDirectoryEntry[]; error: string | null } | null>(null)
  const [staffSearch, setStaffSearch] = React.useState('')
  const [staffOnlyEligible, setStaffOnlyEligible] = React.useState(true)
  const [replacementId, setReplacementId] = React.useState('')
  const [conflictSnapshot, setConflictSnapshot] = React.useState<ConflictSnapshot | null>(null)
  const [targetPage, setTargetPage] = React.useState(1)
  const [targetSearchDraft, setTargetSearchDraft] = React.useState('')
  const [targetSearch, setTargetSearch] = React.useState('')
  const [targetRevision, setTargetRevision] = React.useState(0)
  const [targetSnapshot, setTargetSnapshot] = React.useState<ShiftPage | null>(null)
  const [targetId, setTargetId] = React.useState('')
  const [counterpartSnapshot, setCounterpartSnapshot] = React.useState<{ key: string; items: SwapExchangeCandidate[]; error: string | null } | null>(null)
  const [counterpartId, setCounterpartId] = React.useState('')
  const [exchangeConflictSnapshot, setExchangeConflictSnapshot] = React.useState<ConflictSnapshot | null>(null)
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const submitLock = React.useRef(false)

  const sourceKey = JSON.stringify([owner, sourcePage, sourceSearch, from, to, brandId, platformId, sourceRevision])
  const source = open && sourceSnapshot?.key === sourceKey ? sourceSnapshot : null
  const sourceRows = source?.items.filter(shift => source.registrations.some(reg => reg.shift_id === shift.id && reg.user_id === owner && isStaffedRegistration(reg))) ?? []
  const selectedSource = sourceRows.find(shift => shift.id === sourceId)
  const assigned = source?.registrations.filter(reg => reg.shift_id === sourceId && reg.user_id === owner && isStaffedRegistration(reg)) ?? []
  const sourceRegistration = assigned.find(reg => reg.operational_role === role)
  const targetKey = JSON.stringify([owner, sourceId, targetPage, targetSearch, targetRevision])
  const target = open && mode === 'exchange' && targetSnapshot?.key === targetKey ? targetSnapshot : null
  const targetRows = target?.items.filter(shift => shift.id !== sourceId && shift.status === 'scheduled' && !shift.deleted_at && !shift.archived_at) ?? []
  const selectedTarget = targetRows.find(shift => shift.id === targetId)
  const counterpartKey = JSON.stringify([owner, sourceId, role, targetId])
  const counterparts = open && selectedTarget && counterpartSnapshot?.key === counterpartKey ? counterpartSnapshot : null
  const directory = open && directorySnapshot?.owner === owner ? directorySnapshot : null
  const conflictKey = JSON.stringify([owner, sourceId, replacementId])
  const conflict = open && conflictSnapshot?.key === conflictKey ? conflictSnapshot : null
  const replacementCheckStatus: ConflictVerificationStatus = !open || mode !== 'replacement' || !selectedSource || !replacementId
    ? 'idle'
    : !conflict
      ? 'checking'
      : conflict.status

  const exchangeConflictKey = JSON.stringify([owner, sourceId, targetId, counterpartId])
  const exchangeConflict = open && mode === 'exchange' && selectedSource && selectedTarget && counterpartId && exchangeConflictSnapshot?.key === exchangeConflictKey ? exchangeConflictSnapshot : null
  const exchangeCheckStatus: ConflictVerificationStatus = !open || mode !== 'exchange' || !selectedSource || !selectedTarget || !counterpartId
    ? 'idle'
    : !exchangeConflict
      ? 'checking'
      : exchangeConflict.status

  React.useEffect(() => {
    if (!open || !owner || (from && to && to < from)) return
    let active = true
    void shiftService.getRegistrationPage('mine', { page: sourcePage, pageSize, filters: {
      statuses: ['scheduled'], registrationStatuses: ['approved', 'manually_assigned'], from,
      ...(to ? { to } : {}), ...(sourceSearch ? { search: sourceSearch } : {}),
      ...(brandId ? { brandIds: [brandId] } : {}), ...(platformId ? { platformIds: [platformId] } : {}),
    } }).then(result => {
      if (active) setSourceSnapshot({ key: sourceKey, items: result.items, registrations: result.registrations.filter(reg => reg.user_id === owner), total: result.total, page: result.page, error: null })
    }).catch(error => {
      if (active) setSourceSnapshot({ key: sourceKey, items: [], registrations: [], total: 0, page: sourcePage, error: error instanceof Error ? error.message : 'SOURCE_LOAD_FAILED' })
    })
    return () => { active = false }
  }, [open, owner, sourceKey, sourcePage, sourceSearch, from, to, brandId, platformId])

  React.useEffect(() => {
    if (!open || !owner || mode !== 'replacement') return
    let active = true
    void userService.getDirectory().then(items => {
      if (active) setDirectorySnapshot({ owner, items, error: null })
    }).catch(error => {
      if (active) setDirectorySnapshot({ owner, items: [], error: error instanceof Error ? error.message : 'DIRECTORY_LOAD_FAILED' })
    })
    return () => { active = false }
  }, [open, owner, mode])

  React.useEffect(() => {
    if (!open || mode !== 'replacement' || !selectedSource || !replacementId) return
    let active = true
    const sourceTime = resolveShiftDateTime(selectedSource.date, selectedSource.start_time, selectedSource.end_time, selectedSource.timezone)
    if (!sourceTime?.valid) return
    const filters = {
      assignedUserIds: [replacementId],
      from: format(addDays(parseISO(selectedSource.date), -1), 'yyyy-MM-dd'),
      to: format(addDays(parseISO(sourceTime.endDate), 1), 'yyyy-MM-dd'),
    }
    void shiftService.getPage({ page: 1, pageSize: 50, filters }).then(async result => {
      if (!active) return

      let allItems = result.items
      let complete = true

      if (result.total > result.items.length) {
        if (result.total <= 250) {
          const totalPages = Math.ceil(result.total / 50)
          const remaining = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              shiftService.getPage({ page: i + 2, pageSize: 50, filters })
            )
          )
          if (!active) return
          allItems = [...result.items, ...remaining.flatMap(p => p.items)]
        } else {
          complete = false
        }
      }

      const assignedHere = allItems.some(shift => shift.id === selectedSource.id)
      const overlap = allItems.some(shift => {
        if (shift.id === selectedSource.id) return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < sourceTime.endAt && other.endAt > sourceTime.startAt
      })
      if (assignedHere) {
        setConflictSnapshot({
          key: conflictKey,
          status: 'conflict',
          reason: copy('Đã được phân công vào ca này', 'Already assigned to this shift'),
          error: null,
        })
      } else if (overlap) {
        setConflictSnapshot({
          key: conflictKey,
          status: 'conflict',
          reason: copy('Trùng lịch với ca khác', 'Overlaps another shift'),
          error: null,
        })
      } else if (!complete) {
        setConflictSnapshot({
          key: conflictKey,
          status: 'unverified',
          reason: null,
          error: copy('Lịch ca vượt quá giới hạn kiểm tra tự động; vui lòng liên hệ Quản lý/Leader để xác nhận trước khi gửi.', 'Shift count exceeds automatic check limit; please contact Manager/Leader to verify before submitting.'),
        })
      } else {
        setConflictSnapshot({
          key: conflictKey,
          status: 'verified_clear',
          reason: null,
          error: null,
        })
      }
    }).catch(() => {
      if (active) setConflictSnapshot({
        key: conflictKey,
        status: 'unverified',
        reason: null,
        error: copy('Không thể kiểm tra lịch do lỗi kết nối; vui lòng thử lại hoặc liên hệ Quản lý/Leader.', 'Cannot check schedule due to connection error; please retry or contact Manager/Leader.'),
      })
    })
    return () => { active = false }
  }, [open, owner, mode, selectedSource, replacementId, conflictKey, copy])

  React.useEffect(() => {
    if (!open || !owner || mode !== 'exchange' || !selectedSource || !role) return
    let active = true
    void shiftService.getPage({ page: targetPage, pageSize, filters: { statuses: ['scheduled'], from: getCurrentBusinessDate(), ...(targetSearch ? { search: targetSearch } : {}) } }).then(result => {
      if (active) setTargetSnapshot({ key: targetKey, items: result.items, total: result.total, page: result.page, error: null })
    }).catch(error => {
      if (active) setTargetSnapshot({ key: targetKey, items: [], total: 0, page: targetPage, error: error instanceof Error ? error.message : 'TARGET_LOAD_FAILED' })
    })
    return () => { active = false }
  }, [open, owner, mode, selectedSource, role, targetKey, targetPage, targetSearch])

  React.useEffect(() => {
    if (!open || mode !== 'exchange' || !selectedTarget || !role) return
    let active = true
    void shiftRegistrationService.getExchangeCandidates(selectedTarget.id, role).then(items => {
      if (active) setCounterpartSnapshot({ key: counterpartKey, items: items.filter(item => item.user_id !== owner), error: null })
    }).catch(error => {
      if (active) setCounterpartSnapshot({ key: counterpartKey, items: [], error: error instanceof Error ? error.message : 'CANDIDATE_LOAD_FAILED' })
    })
    return () => { active = false }
  }, [open, mode, selectedTarget, role, counterpartKey, owner])

  // Two-sided conflict checking for Exchange
  React.useEffect(() => {
    if (!open || mode !== 'exchange' || !selectedSource || !selectedTarget || !counterpartId) return
    const counterpartCandidate = counterparts?.items.find(item => item.registration_id === counterpartId)
    if (!counterpartCandidate) return

    let active = true

    const sourceTime = resolveShiftDateTime(selectedSource.date, selectedSource.start_time, selectedSource.end_time, selectedSource.timezone)
    const targetTime = resolveShiftDateTime(selectedTarget.date, selectedTarget.start_time, selectedTarget.end_time, selectedTarget.timezone)

    if (!sourceTime?.valid || !targetTime?.valid) return

    const requesterFilters = {
      assignedUserIds: [owner],
      from: format(addDays(parseISO(selectedTarget.date), -1), 'yyyy-MM-dd'),
      to: format(addDays(parseISO(targetTime.endDate), 1), 'yyyy-MM-dd'),
    }
    const counterpartFilters = {
      assignedUserIds: [counterpartCandidate.user_id],
      from: format(addDays(parseISO(selectedSource.date), -1), 'yyyy-MM-dd'),
      to: format(addDays(parseISO(sourceTime.endDate), 1), 'yyyy-MM-dd'),
    }

    Promise.all([
      // Check requester schedule against target shift
      shiftService.getPage({ page: 1, pageSize: 50, filters: requesterFilters }),
      // Check counterpart schedule against source shift
      shiftService.getPage({ page: 1, pageSize: 50, filters: counterpartFilters }),
    ]).then(async ([requesterShifts, counterpartShifts]) => {
      if (!active) return

      let allRequesterItems = requesterShifts.items
      let allCounterpartItems = counterpartShifts.items
      let complete = true

      if (requesterShifts.total > requesterShifts.items.length) {
        if (requesterShifts.total <= 250) {
          const totalPages = Math.ceil(requesterShifts.total / 50)
          const remaining = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              shiftService.getPage({ page: i + 2, pageSize: 50, filters: requesterFilters })
            )
          )
          if (!active) return
          allRequesterItems = [...requesterShifts.items, ...remaining.flatMap(p => p.items)]
        } else {
          complete = false
        }
      }

      if (counterpartShifts.total > counterpartShifts.items.length) {
        if (counterpartShifts.total <= 250) {
          const totalPages = Math.ceil(counterpartShifts.total / 50)
          const remaining = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              shiftService.getPage({ page: i + 2, pageSize: 50, filters: counterpartFilters })
            )
          )
          if (!active) return
          allCounterpartItems = [...counterpartShifts.items, ...remaining.flatMap(p => p.items)]
        } else {
          complete = false
        }
      }

      const requesterConflict = allRequesterItems.some(shift => {
        if (shift.id === selectedSource.id || shift.id === selectedTarget.id) return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < targetTime.endAt && other.endAt > targetTime.startAt
      })

      const counterpartConflict = allCounterpartItems.some(shift => {
        if (shift.id === selectedTarget.id || shift.id === selectedSource.id) return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < sourceTime.endAt && other.endAt > sourceTime.startAt
      })

      if (requesterConflict) {
        setExchangeConflictSnapshot({
          key: exchangeConflictKey,
          status: 'conflict',
          reason: copy('Bạn đã có ca khác trùng giờ với ca đổi chéo', 'You have another shift overlapping the target shift'),
          error: null,
        })
      } else if (counterpartConflict) {
        setExchangeConflictSnapshot({
          key: exchangeConflictKey,
          status: 'conflict',
          reason: copy('Đối ứng có ca khác trùng giờ với ca của bạn', 'Counterpart has another shift overlapping your shift'),
          error: null,
        })
      } else if (!complete) {
        setExchangeConflictSnapshot({
          key: exchangeConflictKey,
          status: 'unverified',
          reason: null,
          error: copy('Lịch ca vượt quá giới hạn kiểm tra tự động; vui lòng liên hệ Quản lý/Leader để xác nhận trước khi gửi.', 'Shift count exceeds automatic check limit; please contact Manager/Leader to verify before submitting.'),
        })
      } else {
        setExchangeConflictSnapshot({
          key: exchangeConflictKey,
          status: 'verified_clear',
          reason: null,
          error: null,
        })
      }
    }).catch(() => {
      if (active) setExchangeConflictSnapshot({
        key: exchangeConflictKey,
        status: 'unverified',
        reason: null,
        error: copy('Không thể kiểm tra lịch do lỗi kết nối; vui lòng thử lại hoặc liên hệ Quản lý/Leader.', 'Cannot check schedule due to connection error; please retry or contact Manager/Leader.'),
      })
    })

    return () => { active = false }
  }, [open, mode, selectedSource, selectedTarget, counterpartId, counterparts, owner, exchangeConflictKey, copy])

  const clearSource = () => { setSourceId(''); setRole(''); setReplacementId(''); setTargetId(''); setCounterpartId('') }

  const selectSourceShift = (shiftId: string) => {
    setSourceId(shiftId)
    const shiftAssigned = source?.registrations.filter(
      reg => reg.shift_id === shiftId && reg.user_id === owner && isStaffedRegistration(reg)
    ) ?? []
    if (shiftAssigned.length === 1) {
      setRole(shiftAssigned[0].operational_role)
    } else {
      setRole('')
    }
    setReplacementId('')
    setTargetId('')
    setCounterpartId('')
  }

  const resetFilters = () => {
    setFrom(getCurrentBusinessDate())
    setTo('')
    setBrandId('')
    setPlatformId('')
    setSourceSearchDraft('')
    setSourceSearch('')
    setSourcePage(1)
    clearSource()
  }

  const setPresetDays = (days: number | null) => {
    const today = getCurrentBusinessDate()
    setFrom(today)
    if (days === null) {
      setTo('')
    } else {
      setTo(format(addDays(parseISO(today), days), 'yyyy-MM-dd'))
    }
    setSourcePage(1)
    clearSource()
  }

  const staff = directory?.items
    .filter(item => !staffSearch.trim() || item.full_name.toLocaleLowerCase().includes(staffSearch.trim().toLocaleLowerCase()))
    .filter(item => !staffOnlyEligible || !sourceRegistration || (item.id !== owner && item.operational_roles?.includes(sourceRegistration.operational_role)))
    .slice(0, 50) ?? []

  const chosenStaff = directory?.items.find(item => item.id === replacementId)
  const eligibleStaff = Boolean(chosenStaff && chosenStaff.id !== owner && role && chosenStaff.operational_roles?.includes(role))
  const validCandidate = mode === 'replacement'
    ? eligibleStaff && !directory?.error && replacementCheckStatus === 'verified_clear'
    : Boolean(
        selectedTarget &&
        counterparts &&
        !counterparts.error &&
        counterparts.items.some(item => item.registration_id === counterpartId) &&
        exchangeCheckStatus === 'verified_clear'
      )

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitLock.current || busy) return
    if (!owner || currentUser?.id !== owner || !source || source.error || !selectedSource || selectedSource.status !== 'scheduled' || !sourceRegistration || !validCandidate || reason.trim().length < 10) {
      toast({ title: t('validationError'), description: copy('Chọn ca, vai trò, người nhận hợp lệ và nhập lý do ít nhất 10 ký tự.', 'Select a valid shift, role and recipient, then enter a reason of at least 10 characters.'), variant: 'destructive' })
      return
    }
    submitLock.current = true
    setBusy(true)
    try {
      if (mode === 'replacement') {
        await swapRequestService.create({ shift_id: selectedSource.id, requester_id: owner, operational_role: sourceRegistration.operational_role,
          source_registration_id: sourceRegistration.id, replacement_staff_id: replacementId, reason: reason.trim(), mode } as never)
      } else {
        await swapRequestService.create({ shift_id: selectedSource.id, requester_id: owner, operational_role: sourceRegistration.operational_role,
          source_registration_id: sourceRegistration.id, target_shift_id: targetId, counterpart_registration_id: counterpartId, reason: reason.trim(), mode } as never)
      }
      toast({ title: t('success'), description: copy('Đã gửi yêu cầu', 'Request submitted'), variant: 'success' })
      onSuccess()
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    } finally { submitLock.current = false; setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent size="lg" className="max-h-[92vh] overflow-y-auto max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{copy('Tạo yêu cầu PASS / Đổi ca', 'Create pass / exchange request')}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {copy('Chọn ca bạn được phân công, chỉ định người nhận hoặc ca muốn đổi chéo. Yêu cầu cần người nhận xác nhận trước khi quản lý phê duyệt.',
              'Choose your assigned shift, pick a recipient or target shift. The request requires recipient confirmation prior to manager approval.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5 pt-1">
          {/* STEP 1: CHỌN CA CỦA TÔI */}
          <fieldset disabled={busy} className="space-y-3 rounded-lg border p-3.5 bg-card">
            <legend className="px-1 text-sm font-semibold flex items-center gap-1.5 text-primary">
              <span>1. {copy('Ca của tôi', 'My assigned shift')}</span>
            </legend>

            {/* Mode selection */}
            <div className="flex flex-wrap gap-2 items-center" role="group" aria-label={copy('Loại yêu cầu', 'Request type')}>
              {(['replacement', 'exchange'] as Mode[]).map(value => (
                <Button
                  key={value}
                  type="button"
                  variant={mode === value ? 'default' : 'outline'}
                  size="sm"
                  aria-pressed={mode === value}
                  onClick={() => { setMode(value); setReplacementId(''); setTargetId(''); setCounterpartId(''); setExchangeConflictSnapshot(null) }}
                  className="font-medium text-xs h-8 px-3"
                >
                  {value === 'replacement' ? 'PASS' : copy('Đổi ca', 'Exchange')}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground ml-auto">
                {mode === 'replacement'
                  ? copy('Nhờ đồng nghiệp nhận thay ca', 'Colleague covers your shift')
                  : copy('Đổi chéo ca trực với đồng nghiệp', 'Direct exchange with a counterpart')}
              </span>
            </div>

            {/* Quick date presets */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-xs text-muted-foreground mr-1">{copy('Khoảng thời gian:', 'Preset:')}</span>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setPresetDays(7)}>7 {copy('ngày', 'days')}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setPresetDays(14)}>14 {copy('ngày', 'days')}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setPresetDays(30)}>30 {copy('ngày', 'days')}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => setPresetDays(null)}>{copy('Tất cả', 'All upcoming')}</Button>
              {(brandId || platformId || sourceSearch || to) && (
                <Button type="button" variant="ghost" size="sm" className="h-6 text-xs px-2 ml-auto text-muted-foreground hover:text-foreground" onClick={resetFilters}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {copy('Đặt lại', 'Reset')}
                </Button>
              )}
            </div>

            {/* Filter controls */}
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-medium">
                {copy('Từ ngày', 'From date')}
                <Input type="date" value={from} onChange={event => { setFrom(event.target.value); setSourcePage(1); clearSource() }} className="mt-1 h-8 text-xs" />
              </label>
              <label className="text-xs font-medium">
                {copy('Đến ngày', 'To date')}
                <Input type="date" min={from} value={to} onChange={event => { setTo(event.target.value); setSourcePage(1); clearSource() }} className="mt-1 h-8 text-xs" />
              </label>
              <label className="text-xs font-medium">
                Brand
                <select className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs" value={brandId} onChange={event => { setBrandId(event.target.value); setSourcePage(1); clearSource() }}>
                  <option value="">{t('all')}</option>
                  {brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-medium">
                Platform
                <select className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs" value={platformId} onChange={event => { setPlatformId(event.target.value); setSourcePage(1); clearSource() }}>
                  <option value="">{t('all')}</option>
                  {platforms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>

            {/* Search input */}
            <div className="flex gap-2">
              <Input
                aria-label={copy('Tìm ca', 'Search shifts')}
                value={sourceSearchDraft}
                onChange={event => setSourceSearchDraft(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setSourceSearch(sourceSearchDraft.trim()); setSourcePage(1); clearSource() } }}
                placeholder={copy('Tìm theo tên ca, Brand, Platform, Studio...', 'Search shift, brand, platform or studio...')}
                className="h-8 text-xs"
              />
              <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => { setSourceSearch(sourceSearchDraft.trim()); setSourcePage(1); clearSource() }}>
                <Search className="h-3.5 w-3.5 mr-1" />
                {t('search')}
              </Button>
            </div>

            {/* Validation & status feedback */}
            {to && to < from && <p role="alert" className="text-xs text-red-600 font-medium">{copy('Ngày kết thúc phải sau ngày bắt đầu', 'End date must follow start date')}</p>}
            {!from && <p role="alert" className="text-xs text-red-600 font-medium">{copy('Chọn ngày bắt đầu', 'Choose a start date')}</p>}
            {!source && from && !(to && to < from) && (
              <div role="status" className="flex items-center gap-2 py-3 text-xs text-muted-foreground justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{t('loading')}</span>
              </div>
            )}
            {source?.error && (
              <div role="alert" className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
                <span>{source.error}</span>
                <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => setSourceRevision(n => n + 1)}>
                  <RotateCcw className="h-3 w-3 mr-1" />
                  {copy('Thử lại', 'Retry')}
                </Button>
              </div>
            )}

            {/* Rich Zero-Results Banner */}
            {source && !source.error && sourceRows.length === 0 && (
              <div className="rounded-lg border border-dashed border-muted-foreground/30 p-4 text-center space-y-2 bg-muted/20">
                <div className="mx-auto w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {copy('Không có ca được phân công phù hợp trong khoảng thời gian này', 'No matching assigned shifts in this date range')}
                </p>
                <div className="text-[11px] text-muted-foreground max-w-md mx-auto space-y-1 text-left">
                  <p>• {copy('Chỉ ca có trạng thái Được duyệt (Approved) hoặc Phân công (Manually Assigned) mới có thể tạo yêu cầu đổi ca.', 'Only shifts with status Approved or Manually Assigned can be passed or exchanged.')}</p>
                  <p>• {copy('Các ca đã hoàn thành, ca đã qua hoặc đang có yêu cầu đổi ca chưa xử lý sẽ không hiển thị.', 'Completed shifts, past shifts, or shifts with pending swap requests are excluded.')}</p>
                  <p className="text-muted-foreground">
                    • {copy('Nếu ca chỉ mới được gán tên trực tiếp (Host/Trợ trì) mà chưa có phiếu phân công chính thức: Quản trị viên/Leader cần vào trang Điều phối ca (Staffing) để duyệt hoặc phân công ca cho nhân sự. Hệ thống tuân thủ hợp đồng backend và không cho phép đổi ca khi thiếu registration được duyệt.',
                      'If a shift only has a legacy name assignment without an official registration: an Admin or Leader must approve or assign the shift in Staffing. The system enforces backend safety and disallows swaps without an approved registration.')}
                  </p>
                  {(brandId || platformId || sourceSearch) && (
                    <p className="text-amber-600 dark:text-amber-400 font-medium">
                      • {copy('Bộ lọc Brand, Platform hoặc từ khóa tìm kiếm đang thu hẹp kết quả.', 'Current Brand, Platform, or search filters may be restricting results.')}
                    </p>
                  )}
                </div>
                <div className="pt-1 flex items-center justify-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="text-xs h-7" onClick={resetFilters}>
                    <RotateCcw className="h-3 w-3 mr-1" />
                    {copy('Đặt lại bộ lọc', 'Reset filters')}
                  </Button>
                </div>
              </div>
            )}

            {/* Rich Shift Card List */}
            {source && !source.error && sourceRows.length > 0 && (
              <div role="group" aria-label={copy('Chọn ca được phân công', 'Choose assigned shift')} className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {sourceRows.map(shift => {
                  const shiftRegs = source.registrations.filter(reg => reg.shift_id === shift.id && reg.user_id === owner && isStaffedRegistration(reg))
                  const isSelected = sourceId === shift.id
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => selectSourceShift(shift.id)}
                      className={`w-full rounded-lg border p-3 text-left text-xs transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-xs ring-1 ring-primary/40'
                          : 'border-border/60 hover:border-primary/40 hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex flex-col gap-1.5 w-full">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-semibold text-foreground text-sm">{shift.title || copy('Ca trực', 'Shift')}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[11px] font-medium border-primary/30 text-primary bg-primary/5">
                              {brands.find(item => item.id === shift.brand_id)?.name ?? '—'}
                            </Badge>
                            <Badge variant="outline" className="text-[11px] font-medium border-muted-foreground/30 text-muted-foreground">
                              {platforms.find(item => item.id === shift.platform_id)?.name ?? '—'}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                              {t(shift.status)}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {shift.date}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono font-medium text-foreground">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatShiftTimeRange(shift)}
                          </span>
                          {shift.crosses_midnight && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 gap-1 font-medium">
                              <Moon className="h-2.5 w-2.5" />
                              {copy('Qua đêm', 'Overnight')}
                            </Badge>
                          )}
                          {shift.studio && (
                            <span className="text-[11px] text-muted-foreground">
                              Studio: {shift.studio}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground/70">
                            ({shift.timezone || 'ICT / GMT+7'})
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{copy('Vai trò của bạn:', 'Your role:')}</span>
                          {shiftRegs.map(reg => (
                            <Badge key={reg.id} variant="default" className="text-[11px] capitalize py-0 px-2 h-5 font-medium">
                              {t(reg.operational_role)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {source && source.total > pageSize && (
              <div className="flex items-center justify-between text-xs pt-1">
                <Button type="button" size="sm" variant="outline" disabled={source.page <= 1} onClick={() => { setSourcePage(source.page - 1); clearSource() }}>
                  {copy('Trước', 'Previous')}
                </Button>
                <span className="text-muted-foreground">{source.page}/{Math.ceil(source.total / pageSize)} · {source.total} {copy('ca', 'shifts')}</span>
                <Button type="button" size="sm" variant="outline" disabled={source.page * pageSize >= source.total} onClick={() => { setSourcePage(source.page + 1); clearSource() }}>
                  {copy('Sau', 'Next')}
                </Button>
              </div>
            )}

            {/* Role selection / confirmation */}
            {selectedSource && (
              <div className="rounded-md border p-2.5 bg-muted/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    {copy('Vai trò thực hiện đổi ca', 'Role for swap')}
                  </label>
                  {assigned.length === 1 && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ {copy('Tự động chọn vai trò duy nhất', 'Auto-selected single role')}
                    </span>
                  )}
                </div>
                {assigned.length > 1 ? (
                  <select
                    className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                    value={role}
                    onChange={event => { setRole(event.target.value as OperationalRole); setReplacementId(''); setTargetId(''); setCounterpartId(''); setExchangeConflictSnapshot(null) }}
                  >
                    <option value="">{copy('Chọn vai trò', 'Choose role')}</option>
                    {assigned.map(reg => <option key={reg.id} value={reg.operational_role}>{t(reg.operational_role)}</option>)}
                  </select>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs capitalize py-0.5 px-2.5">
                      {role ? t(role) : assigned[0]?.operational_role ? t(assigned[0].operational_role) : '—'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {selectedSource.title} · {selectedSource.date} ({formatShiftTimeRange(selectedSource)})
                    </span>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* STEP 2: CHỌN NGƯỜI NHẬN HOẶC CA ĐỔI CHÉO */}
          {sourceRegistration && selectedSource && (
            <fieldset disabled={busy} className="space-y-3 rounded-lg border p-3.5 bg-card">
              <legend className="px-1 text-sm font-semibold flex items-center gap-1.5 text-primary">
                <span>2. {mode === 'replacement' ? copy('Người nhận PASS', 'Pass recipient') : copy('Ca và người đổi chéo', 'Exchange shift and counterpart')}</span>
              </legend>

              {mode === 'replacement' ? (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Input
                      aria-label={copy('Tìm nhân sự', 'Search staff')}
                      value={staffSearch}
                      onChange={event => setStaffSearch(event.target.value)}
                      placeholder={copy('Tìm theo tên nhân sự...', 'Search staff by name...')}
                      className="h-8 text-xs"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={staffOnlyEligible}
                        onChange={e => setStaffOnlyEligible(e.target.checked)}
                        className="rounded border"
                      />
                      {copy('Chỉ đúng vai trò', 'Matching role only')}
                    </label>
                  </div>

                  {!directory && (
                    <div role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{t('loading')}</span>
                    </div>
                  )}
                  {directory?.error && <p role="alert" className="text-xs text-red-600 font-medium">{directory.error}</p>}
                  {directory && !directory.error && staff.length === 0 && (
                    <div role="status" className="p-3 text-center rounded-md border border-dashed text-xs text-muted-foreground">
                      {copy('Không tìm thấy nhân sự phù hợp với vai trò này', 'No matching staff found for this role')}
                    </div>
                  )}

                  <div role="group" aria-label={copy('Chọn người nhận', 'Choose recipient')} className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {staff.map(item => {
                      const isSelf = item.id === owner
                      const hasRole = item.operational_roles?.includes(sourceRegistration.operational_role)
                      const why = isSelf
                        ? copy('Không thể chọn chính mình', 'Cannot choose yourself')
                        : !hasRole
                        ? copy(`Thiếu năng lực ${t(sourceRegistration.operational_role)}`, `Missing ${sourceRegistration.operational_role} role`)
                        : ''
                      const isSelected = replacementId === item.id

                      return (
                        <button
                          type="button"
                          key={item.id}
                          disabled={Boolean(why)}
                          aria-pressed={isSelected}
                          onClick={() => setReplacementId(item.id)}
                          className={`w-full rounded-md border p-2 text-left text-xs transition-all focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/40 font-medium'
                              : 'hover:bg-muted/50 border-border/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{item.full_name}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.operational_roles?.map(r => (
                                <Badge
                                  key={r}
                                  variant={r === sourceRegistration.operational_role ? 'default' : 'outline'}
                                  className="text-[10px] py-0 px-1.5 h-4 capitalize"
                                >
                                  {t(r)}
                                </Badge>
                              ))}
                              {why && <span className="text-[11px] text-destructive font-medium">({why})</span>}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Schedule Conflict Status */}
                  {replacementId && replacementCheckStatus === 'checking' && (
                    <div role="status" className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      <span>{copy('Đang kiểm tra lịch nhân sự...', 'Checking schedule...')}</span>
                    </div>
                  )}
                  {replacementCheckStatus === 'conflict' && conflict?.reason && (
                    <div role="alert" className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{conflict.reason}</span>
                    </div>
                  )}
                  {replacementCheckStatus === 'unverified' && (
                    <div role="alert" className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 font-medium">
                      <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>{conflict?.error || copy('Chưa thể xác minh lịch ca; vui lòng thử lại hoặc liên hệ Quản lý/Leader để xác nhận trước khi gửi.', 'Schedule could not be verified; please retry or contact Manager/Leader to verify before submitting.')}</span>
                    </div>
                  )}
                  {replacementCheckStatus === 'verified_clear' && (
                    <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{copy('Lịch trống - đủ điều kiện nhận ca', 'Schedule available - recipient is eligible')}</span>
                    </div>
                  )}
                  {replacementId && replacementCheckStatus === 'verified_clear' && (
                    <p className="text-xs text-muted-foreground pt-0.5">
                      {copy('Điều kiện cuối cùng được kiểm tra lại khi gửi và khi duyệt.', 'Final eligibility is rechecked on submit and approval.')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <Input
                      aria-label={copy('Tìm ca đổi chéo', 'Search exchange shifts')}
                      value={targetSearchDraft}
                      onChange={event => setTargetSearchDraft(event.target.value)}
                      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setTargetSearch(targetSearchDraft.trim()); setTargetPage(1); setTargetId(''); setCounterpartId(''); setExchangeConflictSnapshot(null) } }}
                      placeholder={copy('Tìm ca đổi chéo theo tên, studio...', 'Search exchange shift by title, studio...')}
                      className="h-8 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" className="h-8 text-xs px-3" onClick={() => { setTargetSearch(targetSearchDraft.trim()); setTargetPage(1); setTargetId(''); setCounterpartId(''); setExchangeConflictSnapshot(null) }}>
                      <Search className="h-3.5 w-3.5 mr-1" />
                      {t('search')}
                    </Button>
                  </div>

                  {!target && (
                    <div role="status" className="flex items-center gap-2 py-2 text-xs text-muted-foreground justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>{t('loading')}</span>
                    </div>
                  )}
                  {target?.error && (
                    <div role="alert" className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center justify-between">
                      <span>{target.error}</span>
                      <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => setTargetRevision(n => n + 1)}>
                        {copy('Thử lại', 'Retry')}
                      </Button>
                    </div>
                  )}
                  {target && !target.error && targetRows.length === 0 && (
                    <div role="status" className="p-3 text-center rounded-md border border-dashed text-xs text-muted-foreground">
                      {copy('Không có ca đổi phù hợp trong hệ thống', 'No matching exchange shifts found')}
                    </div>
                  )}

                  <div role="group" aria-label={copy('Chọn ca đổi', 'Choose exchange shift')} className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {targetRows.map(shift => {
                      const isSelected = targetId === shift.id
                      return (
                        <button
                          type="button"
                          key={shift.id}
                          aria-pressed={isSelected}
                          onClick={() => { setTargetId(shift.id); setCounterpartId(''); setExchangeConflictSnapshot(null) }}
                          className={`w-full rounded-md border p-2 text-left text-xs transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                              : 'hover:bg-muted/50 border-border/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{shift.title || copy('Ca trực', 'Shift')}</span>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
                                {brands.find(item => item.id === shift.brand_id)?.name ?? '—'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-muted-foreground">
                                {platforms.find(item => item.id === shift.platform_id)?.name ?? '—'}
                              </Badge>
                              {shift.crosses_midnight && (
                                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 py-0 px-1 h-4">
                                  {copy('Qua đêm', 'Overnight')}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground pt-0.5">
                            {shift.date} · {formatShiftTimeRange(shift)} {shift.studio ? `· Studio ${shift.studio}` : ''}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {target && target.total > pageSize && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <Button type="button" size="sm" variant="outline" disabled={target.page <= 1} onClick={() => { setTargetPage(target.page - 1); setTargetId(''); setCounterpartId('') }}>
                        {copy('Trước', 'Previous')}
                      </Button>
                      <span className="text-muted-foreground">{target.page}/{Math.ceil(target.total / pageSize)} · {target.total}</span>
                      <Button type="button" size="sm" variant="outline" disabled={target.page * pageSize >= target.total} onClick={() => { setTargetPage(target.page + 1); setTargetId(''); setCounterpartId('') }}>
                        {copy('Sau', 'Next')}
                      </Button>
                    </div>
                  )}

                  {selectedTarget && (
                    <div className="rounded-md border p-2.5 bg-muted/20 space-y-2 mt-2">
                      <label className="text-xs font-semibold text-foreground block">
                        {copy('Người đổi ca trên ca đích (cùng vai trò)', 'Counterpart on target shift (same role)')}
                      </label>
                      {!counterparts && (
                        <div role="status" className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span>{copy('Đang kiểm tra nhân sự trên ca đích...', 'Checking counterparts on target shift...')}</span>
                        </div>
                      )}
                      {counterparts?.error && <p role="alert" className="text-xs text-red-600 font-medium">{counterparts.error}</p>}
                      {counterparts && !counterparts.error && counterparts.items.length === 0 && (
                        <p role="status" className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          {copy(`Không có nhân sự nào được phân công vai trò ${t(sourceRegistration.operational_role)} trên ca này`,
                            `No counterpart assigned with role ${sourceRegistration.operational_role} on this shift`)}
                        </p>
                      )}
                      <div role="group" aria-label={copy('Chọn người đổi chéo', 'Choose counterpart')} className="space-y-1.5">
                        {counterparts?.items.map(item => {
                          const isSelected = counterpartId === item.registration_id
                          return (
                            <button
                              type="button"
                              key={item.registration_id}
                              aria-pressed={isSelected}
                              onClick={() => setCounterpartId(item.registration_id)}
                              className={`w-full rounded-md border p-2 text-left text-xs transition-all focus-visible:ring-2 focus-visible:ring-primary ${
                                isSelected
                                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40 font-medium'
                                  : 'hover:bg-muted/50 border-border/60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">{item.full_name}</span>
                                <Badge variant="default" className="text-[10px] capitalize py-0 px-2 h-4">
                                  {t(sourceRegistration.operational_role)}
                                </Badge>
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      {/* Two-sided conflict checking feedback */}
                      {counterpartId && exchangeCheckStatus === 'checking' && (
                        <div role="status" className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                          <span>{copy('Đang kiểm tra trùng lịch hai phía...', 'Checking two-sided schedule conflicts...')}</span>
                        </div>
                      )}
                      {exchangeCheckStatus === 'conflict' && exchangeConflict?.reason && (
                        <div role="alert" className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2 font-medium">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span>{exchangeConflict.reason}</span>
                        </div>
                      )}
                      {exchangeCheckStatus === 'unverified' && (
                        <div role="alert" className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 font-medium">
                          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>{exchangeConflict?.error || copy('Chưa thể xác minh lịch ca; vui lòng thử lại hoặc liên hệ Quản lý/Leader để xác nhận trước khi gửi.', 'Schedule could not be verified; please retry or contact Manager/Leader to verify before submitting.')}</span>
                        </div>
                      )}
                      {exchangeCheckStatus === 'verified_clear' && (
                        <div className="p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2 font-medium">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>{copy('Lịch hai bên hợp lệ - sẵn sàng gửi yêu cầu đổi chéo', 'Both schedules valid - ready for exchange')}</span>
                        </div>
                      )}
                      {counterpartId && exchangeCheckStatus === 'verified_clear' && (
                        <p className="text-xs text-muted-foreground pt-0.5">
                          {copy('Điều kiện cuối cùng được kiểm tra lại khi gửi và khi duyệt.', 'Final eligibility is rechecked on submit and approval.')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </fieldset>
          )}

          {/* STEP 3: LÝ DO */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-foreground">
              3. {copy('Lý do yêu cầu', 'Reason for request')} <span className="text-destructive">*</span>
            </label>
            <Textarea
              className="mt-1 text-xs"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={copy('Nhập lý do chi tiết (tối thiểu 10 ký tự)...', 'Enter a detailed reason (minimum 10 characters)...')}
              maxLength={500}
              rows={3}
              required
              minLength={10}
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{copy('Tối thiểu 10 ký tự', 'Minimum 10 characters')}</span>
              <span>{reason.trim().length}/500</span>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !sourceRegistration || !validCandidate || reason.trim().length < 10}
              className="font-medium"
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {copy('Gửi yêu cầu', 'Submit request')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
