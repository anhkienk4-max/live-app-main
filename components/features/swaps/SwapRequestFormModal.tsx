'use client'

import * as React from 'react'
import { addDays, format, parseISO } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { isStaffedRegistration, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import type { Brand, OperationalRole, Platform, Shift, ShiftRegistration, SwapExchangeCandidate, UserDirectoryEntry } from '@/lib/types/database.types'
import { formatShiftTimeRange, getCurrentBusinessDate, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'

type Mode = 'replacement' | 'exchange'
type SourcePage = { key: string; items: Shift[]; registrations: ShiftRegistration[]; total: number; page: number; error: string | null }
type ShiftPage = { key: string; items: Shift[]; total: number; page: number; error: string | null }
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
  const [replacementId, setReplacementId] = React.useState('')
  const [conflictSnapshot, setConflictSnapshot] = React.useState<{ key: string; reason: string | null; error: string | null } | null>(null)
  const [targetPage, setTargetPage] = React.useState(1)
  const [targetSearchDraft, setTargetSearchDraft] = React.useState('')
  const [targetSearch, setTargetSearch] = React.useState('')
  const [targetRevision, setTargetRevision] = React.useState(0)
  const [targetSnapshot, setTargetSnapshot] = React.useState<ShiftPage | null>(null)
  const [targetId, setTargetId] = React.useState('')
  const [counterpartSnapshot, setCounterpartSnapshot] = React.useState<{ key: string; items: SwapExchangeCandidate[]; error: string | null } | null>(null)
  const [counterpartId, setCounterpartId] = React.useState('')
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

  React.useEffect(() => {
    if (!open || !owner || !from || (to && to < from)) return
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
    void shiftService.getPage({ page: 1, pageSize: 50, filters: {
      assignedUserIds: [replacementId], from: format(addDays(parseISO(selectedSource.date), -1), 'yyyy-MM-dd'), to: sourceTime.endDate,
    } }).then(result => {
      if (!active) return
      const assignedHere = result.items.some(shift => shift.id === selectedSource.id)
      const overlap = result.items.some(shift => {
        if (shift.id === selectedSource.id || shift.status === 'cancelled') return false
        const other = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
        return other?.valid && other.startAt < sourceTime.endAt && other.endAt > sourceTime.startAt
      })
      setConflictSnapshot({ key: conflictKey, reason: assignedHere ? copy('Đã được phân công vào ca này', 'Already assigned to this shift') : overlap ? copy('Trùng lịch với ca khác', 'Overlaps another shift') : null,
        error: result.total > 50 ? copy('Chưa kiểm tra đủ lịch; hệ thống sẽ xác minh khi gửi', 'Schedule check incomplete; verified on submit') : null })
    }).catch(() => {
      if (active) setConflictSnapshot({ key: conflictKey, reason: null, error: copy('Chưa kiểm tra được lịch; hệ thống sẽ xác minh khi gửi', 'Schedule unavailable; verified on submit') })
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

  const clearSource = () => { setSourceId(''); setRole(''); setReplacementId(''); setTargetId(''); setCounterpartId('') }
  const shiftLabel = (shift: Shift) => `${shift.date} · ${formatShiftTimeRange(shift)} · ${shift.title} · ${brands.find(item => item.id === shift.brand_id)?.name ?? '—'} / ${platforms.find(item => item.id === shift.platform_id)?.name ?? '—'}`
  const staff = directory?.items.filter(item => !staffSearch.trim() || item.full_name.toLocaleLowerCase().includes(staffSearch.trim().toLocaleLowerCase())).slice(0, 50) ?? []
  const chosenStaff = directory?.items.find(item => item.id === replacementId)
  const eligibleStaff = Boolean(chosenStaff && chosenStaff.id !== owner && role && chosenStaff.operational_roles?.includes(role))
  const validCandidate = mode === 'replacement' ? eligibleStaff && !directory?.error && Boolean(conflict) && !conflict?.reason && !conflict?.error
    : Boolean(selectedTarget && counterparts && !counterparts.error && counterparts.items.some(item => item.registration_id === counterpartId))

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

  return <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
    <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{copy('Tạo yêu cầu PASS / Đổi ca', 'Create pass / exchange request')}</DialogTitle>
        <DialogDescription>{copy('Chọn ca được phân công, người nhận và lý do. Người nhận xác nhận trước khi quản lý duyệt.', 'Choose an assigned shift, recipient and reason. The recipient accepts before manager approval.')}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-5">
        <fieldset disabled={busy} className="space-y-3"><legend className="font-semibold">1. {copy('Ca của tôi', 'My assigned shift')}</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label={copy('Loại yêu cầu', 'Request type')}>
            {(['replacement', 'exchange'] as Mode[]).map(value => <Button key={value} type="button" variant={mode === value ? 'default' : 'outline'} aria-pressed={mode === value}
              onClick={() => { setMode(value); setReplacementId(''); setTargetId(''); setCounterpartId('') }}>{value === 'replacement' ? 'PASS' : copy('Đổi ca', 'Exchange')}</Button>)}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">{copy('Từ ngày', 'From date')}<Input type="date" value={from} onChange={event => { setFrom(event.target.value); setSourcePage(1); clearSource() }} /></label>
            <label className="text-xs">{copy('Đến ngày', 'To date')}<Input type="date" min={from} value={to} onChange={event => { setTo(event.target.value); setSourcePage(1); clearSource() }} /></label>
            <label className="text-xs">Brand<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={brandId} onChange={event => { setBrandId(event.target.value); setSourcePage(1); clearSource() }}><option value="">{t('all')}</option>{brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-xs">Platform<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={platformId} onChange={event => { setPlatformId(event.target.value); setSourcePage(1); clearSource() }}><option value="">{t('all')}</option>{platforms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <div className="flex gap-2"><Input aria-label={copy('Tìm ca', 'Search shifts')} value={sourceSearchDraft} onChange={event => setSourceSearchDraft(event.target.value)} placeholder={copy('Tên ca, Brand, Platform, Studio', 'Shift, brand, platform or studio')} />
            <Button type="button" variant="outline" onClick={() => { setSourceSearch(sourceSearchDraft.trim()); setSourcePage(1); clearSource() }}>{t('search')}</Button></div>
          {to && to < from && <p role="alert" className="text-xs text-red-600">{copy('Ngày kết thúc phải sau ngày bắt đầu', 'End date must follow start date')}</p>}
          {!from && <p role="alert" className="text-xs text-red-600">{copy('Chọn ngày bắt đầu', 'Choose a start date')}</p>}
          {!source && from && !(to && to < from) && <p role="status" className="text-xs text-muted-foreground">{t('loading')}</p>}
          {source?.error && <p role="alert" className="text-xs text-red-600">{source.error} <Button type="button" size="sm" variant="outline" onClick={() => setSourceRevision(n => n + 1)}>{copy('Thử lại', 'Retry')}</Button></p>}
          {source && !source.error && sourceRows.length === 0 && <p role="status" className="text-xs text-muted-foreground">{copy('Không có ca được phân công phù hợp. Chỉ ca có đăng ký đã duyệt hoặc được phân công thủ công mới dùng làm nguồn; ca legacy chưa có đăng ký không thể gửi yêu cầu.', 'No matching approved or manually assigned registrations. Legacy-only shifts without a registration cannot be used as a source.')}</p>}
          <div role="group" aria-label={copy('Chọn ca được phân công', 'Choose assigned shift')} className="max-h-44 space-y-1 overflow-y-auto">
            {sourceRows.map(shift => <button key={shift.id} type="button" aria-pressed={sourceId === shift.id} onClick={() => { setSourceId(shift.id); setRole(''); setReplacementId(''); setTargetId(''); setCounterpartId('') }}
              className={`w-full rounded-md border p-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary ${sourceId === shift.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>
              {shiftLabel(shift)} · {t(shift.status)} · {source?.registrations.filter(reg => reg.shift_id === shift.id && reg.user_id === owner && isStaffedRegistration(reg)).map(reg => t(reg.operational_role)).join(', ')}
            </button>)}
          </div>
          {source && source.total > pageSize && <div className="flex items-center justify-between text-xs"><Button type="button" size="sm" variant="outline" disabled={source.page <= 1} onClick={() => { setSourcePage(source.page - 1); clearSource() }}>{copy('Trước', 'Previous')}</Button>
            <span>{source.page}/{Math.ceil(source.total / pageSize)} · {source.total}</span><Button type="button" size="sm" variant="outline" disabled={source.page * pageSize >= source.total} onClick={() => { setSourcePage(source.page + 1); clearSource() }}>{copy('Sau', 'Next')}</Button></div>}
          {selectedSource && <label className="block text-xs">{copy('Vai trò trong ca', 'Assigned role')}<select className="mt-1 h-9 w-full rounded-md border bg-background px-2" value={role} onChange={event => { setRole(event.target.value as OperationalRole); setReplacementId(''); setTargetId(''); setCounterpartId('') }}>
            <option value="">{copy('Chọn vai trò', 'Choose role')}</option>{assigned.map(reg => <option key={reg.id} value={reg.operational_role}>{t(reg.operational_role)}</option>)}</select></label>}
        </fieldset>
        {sourceRegistration && selectedSource && <fieldset disabled={busy} className="space-y-2"><legend className="font-semibold">2. {mode === 'replacement' ? copy('Người nhận PASS', 'Pass recipient') : copy('Ca và người đổi chéo', 'Exchange shift and counterpart')}</legend>
          {mode === 'replacement' ? <>
            <Input aria-label={copy('Tìm nhân sự', 'Search staff')} value={staffSearch} onChange={event => setStaffSearch(event.target.value)} placeholder={copy('Tìm theo tên', 'Search by name')} />
            {!directory && <p role="status" className="text-xs">{t('loading')}</p>}
            {directory?.error && <p role="alert" className="text-xs text-red-600">{directory.error}</p>}
            {directory && !directory.error && staff.length === 0 && <p role="status" className="text-xs">{copy('Không tìm thấy ứng viên', 'No candidates found')}</p>}
            <div role="group" aria-label={copy('Chọn người nhận', 'Choose recipient')} className="max-h-40 space-y-1 overflow-y-auto">{staff.map(item => {
              const why = item.id === owner ? copy('Không thể chọn chính mình', 'Cannot choose yourself') : !item.operational_roles?.includes(sourceRegistration.operational_role) ? copy('Không đúng vai trò', 'Role mismatch') : ''
              return <button type="button" key={item.id} disabled={Boolean(why)} aria-pressed={replacementId === item.id} onClick={() => setReplacementId(item.id)}
                className={`w-full rounded-md border p-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${replacementId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>{item.full_name}{why ? ` · ${why}` : ''}</button>
            })}</div>
            {replacementId && !conflict && <p role="status" className="text-xs">{copy('Đang kiểm tra lịch...', 'Checking schedule...')}</p>}
            {conflict?.reason && <p role="alert" className="text-xs text-red-600">{conflict.reason}</p>}
            {conflict?.error && <p role="status" className="text-xs text-amber-700">{conflict.error}</p>}
            {replacementId && !conflict?.reason && <p className="text-xs text-muted-foreground">{copy('Điều kiện cuối cùng được kiểm tra lại khi gửi và khi duyệt.', 'Final eligibility is rechecked on submit and approval.')}</p>}
          </> : <>
            <div className="flex gap-2"><Input aria-label={copy('Tìm ca đổi chéo', 'Search exchange shifts')} value={targetSearchDraft} onChange={event => setTargetSearchDraft(event.target.value)} placeholder={copy('Tên ca, Studio', 'Shift or studio')} />
              <Button type="button" variant="outline" onClick={() => { setTargetSearch(targetSearchDraft.trim()); setTargetPage(1); setTargetId(''); setCounterpartId('') }}>{t('search')}</Button></div>
            {!target && <p role="status" className="text-xs">{t('loading')}</p>}
            {target?.error && <p role="alert" className="text-xs text-red-600">{target.error} <Button type="button" size="sm" variant="outline" onClick={() => setTargetRevision(n => n + 1)}>{copy('Thử lại', 'Retry')}</Button></p>}
            {target && !target.error && targetRows.length === 0 && <p role="status" className="text-xs">{copy('Không có ca đổi phù hợp', 'No matching exchange shifts')}</p>}
            <div role="group" aria-label={copy('Chọn ca đổi', 'Choose exchange shift')} className="max-h-36 space-y-1 overflow-y-auto">{targetRows.map(shift => <button type="button" key={shift.id} aria-pressed={targetId === shift.id} onClick={() => { setTargetId(shift.id); setCounterpartId('') }} className={`w-full rounded-md border p-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary ${targetId === shift.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>{shiftLabel(shift)}</button>)}</div>
            {target && target.total > pageSize && <div className="flex items-center justify-between text-xs"><Button type="button" size="sm" variant="outline" disabled={target.page <= 1} onClick={() => { setTargetPage(target.page - 1); setTargetId(''); setCounterpartId('') }}>{copy('Trước', 'Previous')}</Button><span>{target.page}/{Math.ceil(target.total / pageSize)} · {target.total}</span><Button type="button" size="sm" variant="outline" disabled={target.page * pageSize >= target.total} onClick={() => { setTargetPage(target.page + 1); setTargetId(''); setCounterpartId('') }}>{copy('Sau', 'Next')}</Button></div>}
            {selectedTarget && <>{!counterparts && <p role="status" className="text-xs">{copy('Đang kiểm tra người đổi ca...', 'Checking counterparts...')}</p>}{counterparts?.error && <p role="alert" className="text-xs text-red-600">{counterparts.error}</p>}{counterparts && !counterparts.error && counterparts.items.length === 0 && <p role="status" className="text-xs">{copy('Không có người được phân công đúng vai trò', 'No assigned counterpart for this role')}</p>}
              <div role="group" aria-label={copy('Chọn người đổi chéo', 'Choose counterpart')} className="space-y-1">{counterparts?.items.map(item => <button type="button" key={item.registration_id} aria-pressed={counterpartId === item.registration_id} onClick={() => setCounterpartId(item.registration_id)} className={`w-full rounded-md border p-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-primary ${counterpartId === item.registration_id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}>{item.full_name} · {t(sourceRegistration.operational_role)}</button>)}</div></>}
          </>}
        </fieldset>}
        <label className="block text-sm font-medium">3. {copy('Lý do', 'Reason')}<Textarea className="mt-1" value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3} required minLength={10} /></label>
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button type="submit" disabled={busy || !sourceRegistration || !validCandidate || reason.trim().length < 10}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{copy('Gửi yêu cầu', 'Submit request')}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}
