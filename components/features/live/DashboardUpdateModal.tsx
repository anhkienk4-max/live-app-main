'use client'

import * as React from 'react'
import { dashboardUpdateService } from '@/lib/services/dataService'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { Shift } from '@/lib/types/database.types'
import { Loader2, Upload, X } from 'lucide-react'

interface DashboardUpdateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  onSuccess: () => void
}

interface FormData {
  revenue: string
  orders: string
  peak_viewers: string
  current_viewers: string
  notes: string
  screenshot_url: string
}

export function DashboardUpdateModal({ open, onOpenChange, shift, onSuccess }: DashboardUpdateModalProps) {
  const [formData, setFormData] = React.useState<FormData>({
    revenue: '',
    orders: '',
    peak_viewers: '',
    current_viewers: '',
    notes: '',
    screenshot_url: ''
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<FormData>>({})
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
      // Reset form when modal opens
      setFormData({
        revenue: '',
        orders: '',
        peak_viewers: '',
        current_viewers: '',
        notes: '',
        screenshot_url: ''
      })
      setErrors({})
    }
  }, [open])

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {}

    if (!formData.revenue || parseFloat(formData.revenue) < 0) {
      newErrors.revenue = 'Valid revenue is required'
    }
    if (!formData.orders || parseInt(formData.orders) < 0) {
      newErrors.orders = 'Valid order count is required'
    }
    if (!formData.peak_viewers || parseInt(formData.peak_viewers) < 0) {
      newErrors.peak_viewers = 'Valid peak viewer count is required'
    }
    if (!formData.current_viewers || parseInt(formData.current_viewers) < 0) {
      newErrors.current_viewers = 'Valid current viewer count is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // In production, upload to storage
      // For now, use placeholder
      const placeholderUrl = `https://placehold.co/800x600/2563EB/white?text=Dashboard+Update+${Date.now()}`
      setFormData({ ...formData, screenshot_url: placeholderUrl })
      toast({ 
        title: 'Image Selected', 
        description: 'Screenshot ready to submit',
        variant: 'success' 
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      toast({ 
        title: 'Validation Error', 
        description: 'Please fill in all required fields correctly',
        variant: 'destructive' 
      })
      return
    }

    setSubmitting(true)

    try {
      await dashboardUpdateService.create({
        shift_id: shift.id,
        time: new Date().toISOString(),
        revenue: parseFloat(formData.revenue),
        orders: parseInt(formData.orders),
        peak_viewers: parseInt(formData.peak_viewers),
        current_viewers: parseInt(formData.current_viewers),
        screenshot_url: formData.screenshot_url || undefined,
        notes: formData.notes || undefined
      })

      toast({ 
        title: 'Update Submitted', 
        description: 'Dashboard update has been recorded successfully',
        variant: 'success' 
      })
      
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({ 
        title: 'Submission Failed', 
        description: 'Failed to submit dashboard update. Please try again.',
        variant: 'destructive' 
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Dashboard Update</DialogTitle>
          <DialogDescription>
            Record current metrics for this live session. Updates should be submitted every 30 minutes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">
                Revenue ($) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.revenue}
                onChange={(e) => setFormData({ ...formData, revenue: e.target.value })}
                className={errors.revenue ? 'border-red-500' : ''}
              />
              {errors.revenue && <div className="text-xs text-red-500 mt-1">{errors.revenue}</div>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Orders <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={formData.orders}
                onChange={(e) => setFormData({ ...formData, orders: e.target.value })}
                className={errors.orders ? 'border-red-500' : ''}
              />
              {errors.orders && <div className="text-xs text-red-500 mt-1">{errors.orders}</div>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Peak Viewers <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={formData.peak_viewers}
                onChange={(e) => setFormData({ ...formData, peak_viewers: e.target.value })}
                className={errors.peak_viewers ? 'border-red-500' : ''}
              />
              {errors.peak_viewers && <div className="text-xs text-red-500 mt-1">{errors.peak_viewers}</div>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">
                Current Viewers <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                min="0"
                placeholder="0"
                value={formData.current_viewers}
                onChange={(e) => setFormData({ ...formData, current_viewers: e.target.value })}
                className={errors.current_viewers ? 'border-red-500' : ''}
              />
              {errors.current_viewers && <div className="text-xs text-red-500 mt-1">{errors.current_viewers}</div>}
            </div>
          </div>

          {/* Screenshot Upload */}
          <div>
            <label className="text-sm font-medium mb-2 block">Dashboard Screenshot</label>
            {formData.screenshot_url ? (
              <div className="relative">
                <img 
                  src={formData.screenshot_url} 
                  alt="Dashboard screenshot" 
                  className="w-full h-40 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="absolute top-2 right-2"
                  onClick={() => setFormData({ ...formData, screenshot_url: '' })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                <Upload className="h-8 w-8 text-gray-400 mb-2" />
                <span className="text-sm text-gray-600">Click to upload screenshot</span>
                <span className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
              </label>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
            <Textarea
              placeholder="Any observations, issues, or highlights..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
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
              Submit Update
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
