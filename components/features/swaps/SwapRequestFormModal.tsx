'use client'

import * as React from 'react'
import { isStaffedRegistration, shiftRegistrationService, swapRequestService } from '@/lib/services/dataService'
import { Shift, User, Brand, Platform, OperationalRole } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'

interface SwapRequestFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shifts: Shift[]
  users: User[]
  brands: Brand[]
  platforms: Platform[]
  onSuccess: () => void
}

interface FormData {
  shift_id: string
  requester_id: string
  new_host_id: string
  new_support_id: string
  new_technical_id: string
  reason: string
}

export function SwapRequestFormModal({ 
  open, 
  onOpenChange, 
  shifts, 
  users, 
  brands, 
  platforms, 
  onSuccess 
}: SwapRequestFormModalProps) {
  const [formData, setFormData] = React.useState<FormData>({
    shift_id: '',
    requester_id: '',
    new_host_id: '',
    new_support_id: '',
    new_technical_id: '',
    reason: ''
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const [registeredRoles, setRegisteredRoles] = React.useState<Record<string, OperationalRole[]>>({})
  const [registrationIds, setRegistrationIds] = React.useState<Record<string, string>>({})
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()

  React.useEffect(() => {
    if (open && currentUser) {
      setFormData({
        shift_id: shifts[0]?.id || '',
        requester_id: currentUser.id,
        new_host_id: '',
        new_support_id: '',
        new_technical_id: '',
        reason: ''
      })
      setErrors({})
      void shiftRegistrationService.getForUser(currentUser.id).then(registrations => {
        const next: Record<string, OperationalRole[]> = {}
        const ids: Record<string, string> = {}
        registrations.filter(isStaffedRegistration).forEach(registration => {
          ;(next[registration.shift_id] ??= []).push(registration.operational_role)
          ids[`${registration.shift_id}:${registration.operational_role}`] = registration.id
        })
        setRegisteredRoles(next)
        setRegistrationIds(ids)
      })
    }
  }, [currentUser, open, shifts])

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}

    if (!formData.shift_id) newErrors.shift_id = 'Please select a shift'
    const selectedRoles = [formData.new_host_id, formData.new_support_id, formData.new_technical_id].filter(Boolean)
    if (selectedRoles.length === 0) newErrors.new_host_id = 'Select one replacement role'
    if (selectedRoles.length > 1) newErrors.new_host_id = 'Create one request per operational role'
    const selectedRole: OperationalRole = formData.new_host_id ? 'host' : formData.new_support_id ? 'support' : 'technical'
    if (selectedRoles.length === 1 && !availableRoles.includes(selectedRole)) newErrors.new_host_id = 'You can only swap a role assigned to you.'
    if (!formData.reason.trim()) newErrors.reason = 'Reason is required'
    if (formData.reason.trim().length < 10) newErrors.reason = 'Please provide a detailed reason (min 10 characters)'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast({ 
        title: 'Validation Error', 
        description: 'Please fill in all required fields',
        variant: 'destructive' 
      })
      return
    }

    setSubmitting(true)

    try {
      const operationalRole = formData.new_host_id ? 'host' : formData.new_support_id ? 'support' : 'technical'
      const sourceRegistrationId = registrationIds[`${formData.shift_id}:${operationalRole}`]
      if (!sourceRegistrationId) throw new Error('An active source registration is required.')
      const replacementStaffId = formData.new_host_id || formData.new_support_id || formData.new_technical_id
      const selectedShift = shifts.find(shift => shift.id === formData.shift_id)
      const originalStaffId = operationalRole === 'host' ? selectedShift?.host_id : operationalRole === 'support' ? selectedShift?.support_id : selectedShift?.technical_id
      if (!currentUser || currentUser.id !== formData.requester_id) throw new Error(t('permissionDenied'))
      await swapRequestService.create({
        shift_id: formData.shift_id,
        requester_id: formData.requester_id,
        operational_role: operationalRole,
        original_staff_id: originalStaffId,
        replacement_staff_id: replacementStaffId,
        new_host_id: formData.new_host_id || undefined,
        new_support_id: formData.new_support_id || undefined,
        new_technical_id: formData.new_technical_id || undefined,
        reason: formData.reason.trim(),
        source_registration_id: sourceRegistrationId,
        mode: 'replacement',
      })

      toast({ 
        title: 'Request Submitted', 
        description: 'Your swap request has been submitted for approval',
        variant: 'success' 
      })
      
      onSuccess()
    } catch (error) {
      toast({ 
        title: 'Submission Failed', 
        description: error instanceof Error ? error.message : 'Failed to submit swap request. Please try again.',
        variant: 'destructive' 
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'
  const byRole = (role: 'host' | 'support' | 'technical') => users.filter(u => u.status === 'active' && (u.operational_roles?.includes(role) || (role === 'host' && u.department === 'Live Host') || (role === 'support' && u.department === 'Live Support')))

  const selectedShift = shifts.find(s => s.id === formData.shift_id)
  const availableRoles = React.useMemo(() => {
    if (!selectedShift || !currentUser) return []
    const roles = new Set<OperationalRole>(registeredRoles[selectedShift.id] || [])
    if (selectedShift.host_id === currentUser.id) roles.add('host')
    if (selectedShift.support_id === currentUser.id) roles.add('support')
    if (selectedShift.technical_id === currentUser.id) roles.add('technical')
    return [...roles]
  }, [currentUser, registeredRoles, selectedShift])
  const replacementField: Record<OperationalRole, 'new_host_id' | 'new_support_id' | 'new_technical_id'> = {
    host: 'new_host_id',
    support: 'new_support_id',
    technical: 'new_technical_id',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request Shift Swap</DialogTitle>
          <DialogDescription>
            Request to swap your assigned shift with another host. Requires approval from team leader or admin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Shift Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select Your Shift <span className="text-red-500">*</span>
            </label>
            <Select value={formData.shift_id} onValueChange={(value) => setFormData({ ...formData, shift_id: value, new_host_id: '', new_support_id: '', new_technical_id: '' })}>
              <SelectTrigger className={errors.shift_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a shift..." />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {getBrandName(shift.brand_id)} - {getPlatformName(shift.platform_id)} 
                    ({format(new Date(`${shift.date}T00:00:00`), 'MMM d')}, {formatShiftTimeRange(shift)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.shift_id && <div className="text-xs text-red-500 mt-1">{errors.shift_id}</div>}
          </div>

          {/* Shift Details Preview */}
          {selectedShift && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm font-medium text-blue-900 mb-2">Selected Shift Details</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-blue-700">Brand:</span>
                  <span className="font-medium ml-2">{getBrandName(selectedShift.brand_id)}</span>
                </div>
                <div>
                  <span className="text-blue-700">Platform:</span>
                  <span className="font-medium ml-2">{getPlatformName(selectedShift.platform_id)}</span>
                </div>
                <div>
                  <span className="text-blue-700">Date:</span>
                  <span className="font-medium ml-2">{format(new Date(selectedShift.date), 'MMMM d, yyyy')}</span>
                </div>
                <div>
                  <span className="text-blue-700">Time:</span>
                  <span className="font-medium ml-2">{formatShiftTimeRange(selectedShift)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Replacement team selection */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {availableRoles.map(role => {
            const field = replacementField[role]
            return <div key={role}><label className="text-sm font-medium mb-2 block">{t('replacementStaff')} · {t(role)}</label><Select value={formData[field] || 'none'} onValueChange={(value) => setFormData(current => ({ ...current, [field]: value === 'none' ? '' : value }))}><SelectTrigger className={errors.new_host_id ? 'border-red-500' : ''}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{byRole(role).filter(user => user.id !== currentUser?.id).map(user => <SelectItem key={user.id} value={user.id}>{user.full_name} ({user.email})</SelectItem>)}</SelectContent></Select></div>
          })}
          {availableRoles.length === 0 && <p className="text-sm text-muted-foreground">{t('noMyShifts')}</p>}
          {errors.new_host_id && <div className="text-xs text-red-500 mt-1 md:col-span-3">{errors.new_host_id}</div>}
          </div>

          {/* Reason */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Reason for Swap Request <span className="text-red-500">*</span>
            </label>
            <Textarea
              placeholder="Please provide a detailed explanation for your swap request (e.g., personal emergency, scheduling conflict, health issue)..."
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              rows={5}
              className={errors.reason ? 'border-red-500' : ''}
            />
            {errors.reason && <div className="text-xs text-red-500 mt-1">{errors.reason}</div>}
            <div className="text-xs text-gray-600 mt-1">
              {formData.reason.length} / 500 characters
            </div>
          </div>

          {/* Important Note */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-sm font-medium text-yellow-900 mb-1">Important</div>
            <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
              <li>Swap requests require approval from team leader or admin</li>
              <li>The proposed replacement must be available and qualified</li>
              <li>You will be notified once your request is reviewed</li>
              <li>Emergency swaps may be prioritized</li>
            </ul>
          </div>

          {/* Actions */}
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
