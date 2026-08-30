'use client'

import * as React from 'react'
import { shiftService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, Campaign, User, ShiftStatus } from '@/lib/types/database.types'
import {
  DEFAULT_SHIFT_STAFFING,
  ShiftTemplate,
  RecurrenceRule,
  detectConflicts,
  generateRecurringShifts,
  formatDuration,
  normalizeCapacity,
  resolveShiftDateTime,
} from '@/lib/utils/shiftUtils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { AlertCircle, Sparkles } from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@/lib/i18n'
import { getAuthMode } from '@/lib/auth/authMode'

interface ShiftFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift | null
  duplicateFrom: Shift | null
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  templates: ShiftTemplate[]
  onSuccess: (savedShift?: Shift) => void | Promise<void>
}

interface ShiftFormState {
  title: string
  date: string
  start_time: string
  end_time: string
  brand_id: string
  platform_id: string
  campaign_id: string
  studio: string
  host_id: string
  support_id: string
  technical_id: string
  required_host_count: number
  required_support_count: number
  required_technical_count: number
  registration_locked: boolean
  allow_multi_role: boolean
  status: ShiftStatus
  live_link: string
  product_notes: string
}

export function ShiftFormDialog({
  open,
  onOpenChange,
  shift,
  duplicateFrom,
  brands,
  platforms,
  campaigns,
  users,
  templates,
  onSuccess
}: ShiftFormDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [showRecurring, setShowRecurring] = React.useState(false)
  const [conflicts, setConflicts] = React.useState<any[]>([])
  const [previewShifts, setPreviewShifts] = React.useState<any[]>([])
  
  const [formData, setFormData] = React.useState<ShiftFormState>({
    title: '',
    date: '',
    start_time: '',
    end_time: '',
    brand_id: '',
    platform_id: '',
    campaign_id: '',
    studio: '',
    host_id: '',
    support_id: '',
    technical_id: '',
    required_host_count: DEFAULT_SHIFT_STAFFING.required_host_count,
    required_support_count: DEFAULT_SHIFT_STAFFING.required_support_count,
    required_technical_count: DEFAULT_SHIFT_STAFFING.required_technical_count,
    registration_locked: false,
    allow_multi_role: false,
    status: 'scheduled',
    live_link: '',
    product_notes: ''
  })

  const [recurrenceRule, setRecurrenceRule] = React.useState<RecurrenceRule>({
    frequency: 'none',
    interval: 1,
    daysOfWeek: [],
    endType: 'count',
    endCount: 5
  })

  const { toast } = useToast()
  const { t } = useTranslation()

  React.useEffect(() => {
    if (shift) {
      setFormData({
        title: shift.title || '',
        date: shift.date,
        start_time: shift.start_time,
        end_time: shift.end_time,
        brand_id: shift.brand_id,
        platform_id: shift.platform_id,
        campaign_id: shift.campaign_id || '',
        studio: shift.studio || '',
        host_id: shift.host_id || '',
        support_id: shift.support_id || '',
        technical_id: shift.technical_id || '',
        required_host_count: normalizeCapacity(shift.required_host_count) ?? DEFAULT_SHIFT_STAFFING.required_host_count,
        required_support_count: normalizeCapacity(shift.required_support_count) ?? DEFAULT_SHIFT_STAFFING.required_support_count,
        required_technical_count: normalizeCapacity(shift.required_technical_count) ?? DEFAULT_SHIFT_STAFFING.required_technical_count,
        registration_locked: shift.registration_locked ?? false,
        allow_multi_role: shift.allow_multi_role ?? false,
        status: shift.status,
        live_link: shift.live_link || '',
        product_notes: shift.product_notes || ''
      })
    } else if (duplicateFrom) {
      setFormData({
        title: duplicateFrom.title || '',
        date: '',
        start_time: duplicateFrom.start_time,
        end_time: duplicateFrom.end_time,
        brand_id: duplicateFrom.brand_id,
        platform_id: duplicateFrom.platform_id,
        campaign_id: duplicateFrom.campaign_id || '',
        studio: duplicateFrom.studio || '',
        host_id: duplicateFrom.host_id || '',
        support_id: duplicateFrom.support_id || '',
        technical_id: duplicateFrom.technical_id || '',
        required_host_count: normalizeCapacity(duplicateFrom.required_host_count) ?? DEFAULT_SHIFT_STAFFING.required_host_count,
        required_support_count: normalizeCapacity(duplicateFrom.required_support_count) ?? DEFAULT_SHIFT_STAFFING.required_support_count,
        required_technical_count: normalizeCapacity(duplicateFrom.required_technical_count) ?? DEFAULT_SHIFT_STAFFING.required_technical_count,
        registration_locked: false,
        allow_multi_role: duplicateFrom.allow_multi_role ?? false,
        status: 'scheduled',
        live_link: '',
        product_notes: duplicateFrom.product_notes || ''
      })
    } else {
      setFormData({
        title: '',
        date: '',
        start_time: '09:00',
        end_time: '13:00',
        brand_id: '',
        platform_id: '',
        campaign_id: '',
        studio: '',
        host_id: '',
        support_id: '',
        technical_id: '',
        ...DEFAULT_SHIFT_STAFFING,
        registration_locked: false,
        allow_multi_role: false,
        status: 'scheduled',
        live_link: '',
        product_notes: ''
      })
    }
    setShowRecurring(false)
    setConflicts([])
    setPreviewShifts([])
  }, [shift, duplicateFrom, open])

  const checkConflicts = React.useCallback(async () => {
    if (!formData.date || !formData.start_time || !formData.end_time) return
    const allShifts = await shiftService.getAll()
    const detected = detectConflicts(formData, allShifts, shift?.id)
    setConflicts(detected)
  }, [formData, shift])

  React.useEffect(() => {
    checkConflicts()
  }, [formData.date, formData.start_time, formData.end_time, formData.host_id, formData.support_id, formData.technical_id, checkConflicts])

  const applyTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setFormData(prev => ({
        ...prev,
        brand_id: template.brand_id,
        platform_id: template.platform_id,
        campaign_id: template.campaign_id || '',
        studio: template.studio || '',
        host_id: template.host_id || '',
        support_id: template.support_id || '',
        technical_id: template.technical_id || '',
        start_time: template.start_time,
        end_time: template.end_time,
        product_notes: template.product_notes || ''
      }))
      toast({ title: 'Template Applied', description: template.name, variant: 'success' })
    }
  }

  const generatePreview = () => {
    if (recurrenceRule.frequency === 'none') return
    const baseShift = { ...formData }
    const generated = generateRecurringShifts(baseShift, recurrenceRule)
    setPreviewShifts(generated.slice(0, 10))
  }

  React.useEffect(() => {
    if (showRecurring) generatePreview()
  }, [recurrenceRule, formData.date, showRecurring])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const resolvedDateTime = resolveShiftDateTime(formData.date, formData.start_time, formData.end_time)
    if (!resolvedDateTime?.valid) {
      toast({ title: 'Invalid shift time', description: resolvedDateTime?.error || 'Enter a valid date and time.', variant: 'destructive' })
      return
    }
    
    if (conflicts.length > 0 && !confirm('Conflicts detected. Continue anyway?')) {
      return
    }

    setLoading(true)

    try {
      if (showRecurring && recurrenceRule.frequency !== 'none') {
        const baseShift = { ...formData }
        const generated = generateRecurringShifts(baseShift, recurrenceRule)
        for (const shiftData of generated) {
          await shiftService.create(shiftData)
        }
        toast({ title: 'Success', description: `Created ${generated.length} recurring shifts`, variant: 'success' })
        await onSuccess()
      } else if (shift) {
        const updatedShift = await shiftService.update(shift.id, { ...formData, version: shift.version })
        if (!updatedShift) throw new Error('Shift was not found.')
        toast({ title: 'Success', description: 'Shift updated', variant: 'success' })
        await onSuccess(updatedShift)
      } else {
        const createdShift = await shiftService.create(formData)
        toast({ title: 'Success', description: 'Shift created', variant: 'success' })
        await onSuccess(createdShift)
      }
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save shift', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const resolvedDateTime = resolveShiftDateTime(formData.date, formData.start_time, formData.end_time)
  const duration = resolvedDateTime?.durationMinutes ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {shift ? 'Edit Shift' : duplicateFrom ? 'Duplicate Shift' : 'Create New Shift'}
          </DialogTitle>
          <DialogDescription>
            {duplicateFrom && 'Creating a copy of existing shift with pre-filled data'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selector */}
          {!shift && templates.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Quick Start with Template</span>
              </div>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Basic Fields */}
          <div>
            <label className="text-sm font-medium">Shift title *</label>
            <Input
              required
              value={formData.title}
              onChange={(event) => setFormData({ ...formData, title: event.target.value })}
              placeholder="Morning livestream"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Date *</label>
              <Input required type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Status</label>
              <Badge variant="outline" className="capitalize text-sm py-1">{formData.status}</Badge>
            </div>
            <div>
              <label className="text-sm font-medium">Start Time *</label>
              <Input required type="time" value={formData.start_time} onChange={(e) => setFormData({ ...formData, start_time: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">End Time *</label>
              <Input required type="time" value={formData.end_time} onChange={(e) => setFormData({ ...formData, end_time: e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">Duration: {formatDuration(duration)}</p>
              {resolvedDateTime?.crossesMidnight && <p className="mt-1 text-xs font-medium text-indigo-700">Ends next day: {format(resolvedDateTime.endAt, 'dd/MM/yyyy')}</p>}
              {resolvedDateTime?.warning && <p className="mt-1 text-xs text-amber-700">{resolvedDateTime.warning}</p>}
              {resolvedDateTime && !resolvedDateTime.valid && <p className="mt-1 text-xs text-red-700">{resolvedDateTime.error}</p>}
            </div>
          </div>

          {/* Brand, Platform, Campaign */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Brand *</label>
              <Select required value={formData.brand_id} onValueChange={(v) => setFormData({ ...formData, brand_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Platform *</label>
              <Select required value={formData.platform_id} onValueChange={(v) => setFormData({ ...formData, platform_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {platforms.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Campaign</label>
              <Select value={formData.campaign_id} onValueChange={(v) => setFormData({ ...formData, campaign_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">{t('studio')}</label>
            <Input
              value={formData.studio}
              onChange={(event) => setFormData({ ...formData, studio: event.target.value })}
              placeholder={t('studioPlaceholder')}
            />
          </div>

          {/* Required role capacity */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Required staffing</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm text-gray-600">Host</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  max="20"
                  value={formData.required_host_count}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    const normalized = normalizeCapacity(nextValue === '' ? undefined : nextValue, DEFAULT_SHIFT_STAFFING.required_host_count)
                    setFormData({ ...formData, required_host_count: normalized ?? DEFAULT_SHIFT_STAFFING.required_host_count })
                  }}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Support</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  max="20"
                  value={formData.required_support_count}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    const normalized = normalizeCapacity(nextValue === '' ? undefined : nextValue, DEFAULT_SHIFT_STAFFING.required_support_count)
                    setFormData({ ...formData, required_support_count: normalized ?? DEFAULT_SHIFT_STAFFING.required_support_count })
                  }}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Technical</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  max="20"
                  value={formData.required_technical_count}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    const normalized = normalizeCapacity(nextValue === '' ? undefined : nextValue, DEFAULT_SHIFT_STAFFING.required_technical_count)
                    setFormData({ ...formData, required_technical_count: normalized ?? DEFAULT_SHIFT_STAFFING.required_technical_count })
                  }}
                />
              </div>
            </div>
          </div>

          {/* Staffing */}
          {getAuthMode() === 'supabase' && shift ? (
            <div className="rounded-lg border p-4">
              <p className="mb-2 text-sm font-medium">Staffing</p>
              <p className="text-sm text-muted-foreground">Nhân sự được quản lý tại tab Nhân sự (Staffing) của ca.</p>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Host</p>
                  <p className="font-medium">{users.find(u => u.id === shift.host_id)?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Support Staff</p>
                  <p className="font-medium">{users.find(u => u.id === shift.support_id)?.full_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Technical Staff</p>
                  <p className="font-medium">{users.find(u => u.id === shift.technical_id)?.full_name || '—'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Host</label>
                <Select value={formData.host_id} onValueChange={(v) => setFormData({ ...formData, host_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign host..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.status === 'active' && (u.operational_roles?.includes('host') || (!u.operational_roles && (u.role === 'staff' || u.role === 'leader')))).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Support Staff</label>
                <Select value={formData.support_id} onValueChange={(v) => setFormData({ ...formData, support_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign support..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.status === 'active' && (u.operational_roles?.includes('support') || (!u.operational_roles && u.department === 'Live Support'))).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Technical Staff</label>
                <Select value={formData.technical_id} onValueChange={(v) => setFormData({ ...formData, technical_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign technical..." /></SelectTrigger>
                  <SelectContent>
                    {users.filter(u => u.status === 'active' && u.operational_roles?.includes('technical')).map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Product Notes</label>
            <Textarea rows={3} value={formData.product_notes} onChange={(e) => setFormData({ ...formData, product_notes: e.target.value })} placeholder="Focus on trending products..." />
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-900">Scheduling Conflicts Detected</span>
              </div>
              <ul className="text-sm text-red-700 space-y-1">
                {conflicts.map((c, i) => <li key={i}>• {c.message}</li>)}
              </ul>
            </div>
          )}

          {/* Recurring Options */}
          {!shift && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-4">
                <Checkbox checked={showRecurring} onCheckedChange={(checked) => setShowRecurring(!!checked)} />
                <label className="text-sm font-medium">Create Recurring Shifts</label>
              </div>

              {showRecurring && (
                <div className="space-y-4 pl-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Frequency</label>
                      <Select value={recurrenceRule.frequency} onValueChange={(v: any) => setRecurrenceRule({ ...recurrenceRule, frequency: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium">End After</label>
                      <Input type="number" min="1" max="365" value={recurrenceRule.endCount} onChange={(e) => setRecurrenceRule({ ...recurrenceRule, endCount: parseInt(e.target.value) })} />
                    </div>
                  </div>
                  {previewShifts.length > 0 && (
                    <div className="text-sm text-gray-600">
                      Preview: {previewShifts.length} shifts will be created
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {previewShifts.map((s, i) => (
                          <div key={i} className="text-xs">• {format(new Date(s.date), 'MMM d, yyyy')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : showRecurring ? `Create ${previewShifts.length} Shifts` : shift ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
