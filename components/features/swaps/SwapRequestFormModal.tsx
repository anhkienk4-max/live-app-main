'use client'

import * as React from 'react'
import { swapRequestService } from '@/lib/services/dataService'
import { Shift, User, Brand, Platform } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

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
    requester_id: '3', // Mock current user
    new_host_id: '',
    new_support_id: '',
    new_technical_id: '',
    reason: ''
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
      setFormData({
        shift_id: shifts[0]?.id || '',
        requester_id: '3',
        new_host_id: '',
        new_support_id: '',
        new_technical_id: '',
        reason: ''
      })
      setErrors({})
    }
  }, [open, shifts])

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}

    if (!formData.shift_id) newErrors.shift_id = 'Please select a shift'
    if (!formData.new_host_id && !formData.new_support_id && !formData.new_technical_id) newErrors.new_host_id = 'Select at least one replacement role'
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
      await swapRequestService.create({
        shift_id: formData.shift_id,
        requester_id: formData.requester_id,
        new_host_id: formData.new_host_id || undefined,
        new_support_id: formData.new_support_id || undefined,
        new_technical_id: formData.new_technical_id || undefined,
        reason: formData.reason.trim()
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
        description: 'Failed to submit swap request. Please try again.',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
            <Select value={formData.shift_id} onValueChange={(value) => setFormData({ ...formData, shift_id: value })}>
              <SelectTrigger className={errors.shift_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a shift..." />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {getBrandName(shift.brand_id)} - {getPlatformName(shift.platform_id)} 
                    ({format(new Date(shift.date), 'MMM d')}, {shift.start_time} - {shift.end_time})
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
                  <span className="font-medium ml-2">{selectedShift.start_time} - {selectedShift.end_time}</span>
                </div>
              </div>
            </div>
          )}

          {/* Replacement team selection */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium mb-2 block">
              Proposed Replacement Host <span className="text-red-500">*</span>
            </label>
            <Select value={formData.new_host_id || 'none'} onValueChange={(value) => setFormData({ ...formData, new_host_id: value === 'none' ? '' : value })}>
              <SelectTrigger className={errors.new_host_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a replacement host..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No host change</SelectItem>
                {byRole('host').map((host) => (
                  <SelectItem key={host.id} value={host.id}>
                    {host.full_name} ({host.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.new_host_id && <div className="text-xs text-red-500 mt-1">{errors.new_host_id}</div>}
            {errors.new_host_id && <div className="text-xs text-red-500 mt-1">{errors.new_host_id}</div>}
          </div>
          <div><label className="text-sm font-medium mb-2 block">Replacement Support</label><Select value={formData.new_support_id || 'none'} onValueChange={(value) => setFormData({ ...formData, new_support_id: value === 'none' ? '' : value })}><SelectTrigger><SelectValue placeholder="Keep current support" /></SelectTrigger><SelectContent><SelectItem value="none">No support change</SelectItem>{byRole('support').map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div><label className="text-sm font-medium mb-2 block">Replacement Technical</label><Select value={formData.new_technical_id || 'none'} onValueChange={(value) => setFormData({ ...formData, new_technical_id: value === 'none' ? '' : value })}><SelectTrigger><SelectValue placeholder="Keep current technical" /></SelectTrigger><SelectContent><SelectItem value="none">No technical change</SelectItem>{byRole('technical').map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></div>
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
