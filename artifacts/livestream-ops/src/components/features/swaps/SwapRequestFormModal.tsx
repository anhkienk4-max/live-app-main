import * as React from 'react'
import { swapRequestService } from '@/lib/services/dataService'
import { Shift, User, Brand, Platform } from '@/lib/types/database.types'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  shifts: Shift[]
  users: User[]
  brands: Brand[]
  platforms: Platform[]
  onSuccess: () => void
}

const ROLE_COLORS = {
  host: 'bg-blue-100 text-blue-700',
  support: 'bg-green-100 text-green-700',
  technical: 'bg-purple-100 text-purple-700',
}

export function SwapRequestFormModal({ open, onOpenChange, shifts, users, brands, platforms, onSuccess }: Props) {
  const [formData, setFormData] = React.useState({
    shift_id: '',
    requester_id: '3',
    role_slot: 'host' as 'host' | 'support' | 'technical',
    new_assignee_id: '',
    reason: '',
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
      setFormData({ shift_id: shifts[0]?.id || '', requester_id: '3', role_slot: 'host', new_assignee_id: '', reason: '' })
      setErrors({})
    }
  }, [open, shifts])

  const getBrand = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getPlatform = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'
  const selectedShift = shifts.find(s => s.id === formData.shift_id)

  // Filter replacement candidates by the selected operational role
  const candidates = users.filter(u =>
    u.id !== formData.requester_id &&
    u.status === 'active' &&
    (u.operational_roles?.includes(formData.role_slot) || u.operational_roles?.length === 0)
  )

  const validate = () => {
    const e: Record<string, string> = {}
    if (!formData.shift_id) e.shift_id = 'Select a shift'
    if (!formData.new_assignee_id) e.new_assignee_id = 'Select a replacement'
    if (!formData.reason.trim() || formData.reason.trim().length < 10)
      e.reason = 'Provide a detailed reason (min 10 characters)'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }
    setSubmitting(true)
    try {
      await swapRequestService.create({
        shift_id: formData.shift_id,
        requester_id: formData.requester_id,
        role_slot: formData.role_slot,
        new_assignee_id: formData.new_assignee_id,
        // legacy compat
        new_host_id: formData.role_slot === 'host' ? formData.new_assignee_id : undefined,
        new_support_id: formData.role_slot === 'support' ? formData.new_assignee_id : undefined,
        reason: formData.reason.trim(),
      })
      toast({ title: 'Request Submitted', description: 'Swap request sent for approval', variant: 'default' })
      onSuccess()
    } catch {
      toast({ title: 'Submission Failed', description: 'Please try again', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Request Shift Swap</DialogTitle>
          <DialogDescription>Submit a swap request for Leader/Admin approval.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Shift */}
          <div>
            <label className="text-sm font-medium block mb-1">Shift <span className="text-red-500">*</span></label>
            <Select value={formData.shift_id} onValueChange={v => setFormData({ ...formData, shift_id: v })}>
              <SelectTrigger className={errors.shift_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a shift…" />
              </SelectTrigger>
              <SelectContent>
                {shifts.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {getBrand(s.brand_id)} — {getPlatform(s.platform_id)} ({format(new Date(s.date), 'MMM d')}, {s.start_time})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.shift_id && <p className="text-xs text-red-500 mt-1">{errors.shift_id}</p>}
          </div>

          {/* Shift preview */}
          {selectedShift && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm grid grid-cols-2 gap-2">
              <div><span className="text-blue-700">Brand:</span> <strong>{getBrand(selectedShift.brand_id)}</strong></div>
              <div><span className="text-blue-700">Platform:</span> <strong>{getPlatform(selectedShift.platform_id)}</strong></div>
              <div><span className="text-blue-700">Date:</span> <strong>{format(new Date(selectedShift.date), 'MMMM d, yyyy')}</strong></div>
              <div><span className="text-blue-700">Time:</span> <strong>{selectedShift.start_time} – {selectedShift.end_time}</strong></div>
              <div className="col-span-2 flex gap-2">
                <span className="text-blue-700">Assigned:</span>
                {selectedShift.host_id && <Badge variant="outline" className="bg-blue-100 text-blue-700 border-0 text-xs">Host assigned</Badge>}
                {selectedShift.support_id && <Badge variant="outline" className="bg-green-100 text-green-700 border-0 text-xs">Support assigned</Badge>}
                {selectedShift.technical_id && <Badge variant="outline" className="bg-purple-100 text-purple-700 border-0 text-xs">Technical assigned</Badge>}
              </div>
            </div>
          )}

          {/* Role slot */}
          <div>
            <label className="text-sm font-medium block mb-1">Role Slot Being Swapped *</label>
            <Select value={formData.role_slot} onValueChange={(v: any) => setFormData({ ...formData, role_slot: v, new_assignee_id: '' })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="host">Host</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">Which role slot needs to be covered?</p>
          </div>

          {/* Replacement */}
          <div>
            <label className="text-sm font-medium block mb-1">
              Proposed Replacement <span className="text-red-500">*</span>
            </label>
            <Select value={formData.new_assignee_id} onValueChange={v => setFormData({ ...formData, new_assignee_id: v })}>
              <SelectTrigger className={errors.new_assignee_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose replacement…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map(u => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name}
                    {u.operational_roles?.includes(formData.role_slot) && (
                      <span className={`ml-2 text-xs px-1 rounded ${ROLE_COLORS[formData.role_slot]}`}>✓ qualified</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.new_assignee_id && <p className="text-xs text-red-500 mt-1">{errors.new_assignee_id}</p>}
            <p className="text-xs text-gray-500 mt-1">The proposed person must confirm availability separately.</p>
          </div>

          {/* Reason */}
          <div>
            <label className="text-sm font-medium block mb-1">Reason <span className="text-red-500">*</span></label>
            <Textarea
              rows={4}
              value={formData.reason}
              onChange={e => setFormData({ ...formData, reason: e.target.value })}
              className={errors.reason ? 'border-red-500' : ''}
              placeholder="Family emergency, scheduling conflict, health issue… (min 10 characters)"
            />
            {errors.reason && <p className="text-xs text-red-500 mt-1">{errors.reason}</p>}
            <p className="text-xs text-gray-500 mt-1">{formData.reason.length} / 500 characters</p>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
            Swap requests require Leader/Admin approval. You will be notified once reviewed.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
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
