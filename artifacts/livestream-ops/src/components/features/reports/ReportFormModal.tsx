

import * as React from 'react'
import { reportService } from '@/lib/services/dataService'
import { Shift, Brand, Platform } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Loader2, Upload, X, Plus } from 'lucide-react'
import { format } from 'date-fns'

interface ReportFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  completedShifts: Shift[]
  brands: Brand[]
  platforms: Platform[]
  onSuccess: () => void
}

interface FormData {
  shift_id: string
  revenue: string
  orders: string
  peak_viewer: string
  average_viewer: string
  likes: string
  comments: string
  shares: string
  top_products: string[]
  insights_good: string
  insights_improvement: string
  replay_url: string
  dashboard_url: string
  screenshot_urls: string[]
}

export function ReportFormModal({ 
  open, 
  onOpenChange, 
  completedShifts, 
  brands, 
  platforms, 
  onSuccess 
}: ReportFormModalProps) {
  const [formData, setFormData] = React.useState<FormData>({
    shift_id: '',
    revenue: '',
    orders: '',
    peak_viewer: '',
    average_viewer: '',
    likes: '',
    comments: '',
    shares: '',
    top_products: [],
    insights_good: '',
    insights_improvement: '',
    replay_url: '',
    dashboard_url: '',
    screenshot_urls: []
  })
  const [currentProduct, setCurrentProduct] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormData, string>>>({})
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
      // Reset form
      setFormData({
        shift_id: completedShifts[0]?.id || '',
        revenue: '',
        orders: '',
        peak_viewer: '',
        average_viewer: '',
        likes: '',
        comments: '',
        shares: '',
        top_products: [],
        insights_good: '',
        insights_improvement: '',
        replay_url: '',
        dashboard_url: '',
        screenshot_urls: []
      })
      setErrors({})
    }
  }, [open, completedShifts])

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.shift_id) newErrors.shift_id = 'Please select a shift'
    if (!formData.revenue || parseFloat(formData.revenue) < 0) newErrors.revenue = 'Valid revenue required'
    if (!formData.orders || parseInt(formData.orders) < 0) newErrors.orders = 'Valid order count required'
    if (!formData.peak_viewer || parseInt(formData.peak_viewer) < 0) newErrors.peak_viewer = 'Valid peak viewer count required'
    if (!formData.average_viewer || parseInt(formData.average_viewer) < 0) newErrors.average_viewer = 'Valid average viewer count required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      // In production, upload to storage
      const newUrls = Array.from(files).map((_, idx) => 
        `https://placehold.co/800x600/2563EB/white?text=Report+Image+${formData.screenshot_urls.length + idx + 1}`
      )
      setFormData({ ...formData, screenshot_urls: [...formData.screenshot_urls, ...newUrls] })
      toast({ 
        title: 'Images Added', 
        description: `${files.length} image(s) ready to submit`,
        variant: 'default' 
      })
    }
  }

  const removeImage = (index: number) => {
    const newUrls = [...formData.screenshot_urls]
    newUrls.splice(index, 1)
    setFormData({ ...formData, screenshot_urls: newUrls })
  }

  const addProduct = () => {
    if (currentProduct.trim()) {
      setFormData({ 
        ...formData, 
        top_products: [...formData.top_products, currentProduct.trim()] 
      })
      setCurrentProduct('')
    }
  }

  const removeProduct = (index: number) => {
    const newProducts = [...formData.top_products]
    newProducts.splice(index, 1)
    setFormData({ ...formData, top_products: newProducts })
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
      await reportService.create({
        shift_id: formData.shift_id,
        revenue: parseFloat(formData.revenue),
        orders: parseInt(formData.orders),
        peak_viewer: parseInt(formData.peak_viewer),
        average_viewer: parseInt(formData.average_viewer),
        likes: parseInt(formData.likes) || 0,
        comments: parseInt(formData.comments) || 0,
        shares: parseInt(formData.shares) || 0,
        top_products: formData.top_products.length > 0 ? formData.top_products : undefined,
        insights_good: formData.insights_good || undefined,
        insights_improvement: formData.insights_improvement || undefined,
        replay_url: formData.replay_url || undefined,
        dashboard_url: formData.dashboard_url || undefined
      })

      toast({ 
        title: 'Report Submitted', 
        description: 'Final report has been recorded successfully',
        variant: 'default' 
      })
      
      onSuccess()
    } catch (error) {
      toast({ 
        title: 'Submission Failed', 
        description: 'Failed to submit report. Please try again.',
        variant: 'destructive' 
      })
    } finally {
      setSubmitting(false)
    }
  }

  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'
  const getPlatformName = (platformId: string) => platforms.find(p => p.id === platformId)?.name || 'Unknown'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit Final Report</DialogTitle>
          <DialogDescription>
            Complete the final report for a completed live session with performance metrics and insights.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Shift Selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Select Shift <span className="text-red-500">*</span>
            </label>
            <Select value={formData.shift_id} onValueChange={(value) => setFormData({ ...formData, shift_id: value })}>
              <SelectTrigger className={errors.shift_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a completed shift..." />
              </SelectTrigger>
              <SelectContent>
                {completedShifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {getBrandName(shift.brand_id)} - {getPlatformName(shift.platform_id)} 
                    ({format(new Date(shift.date), 'MMM d')}, {shift.start_time})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.shift_id && <div className="text-xs text-red-500 mt-1">{errors.shift_id}</div>}
          </div>

          {/* Performance Metrics */}
          <div>
            <h3 className="font-semibold mb-4">Performance Metrics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Total Revenue ($) <span className="text-red-500">*</span>
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
                  Total Orders <span className="text-red-500">*</span>
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
                  value={formData.peak_viewer}
                  onChange={(e) => setFormData({ ...formData, peak_viewer: e.target.value })}
                  className={errors.peak_viewer ? 'border-red-500' : ''}
                />
                {errors.peak_viewer && <div className="text-xs text-red-500 mt-1">{errors.peak_viewer}</div>}
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">
                  Average Viewers <span className="text-red-500">*</span>
                </label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.average_viewer}
                  onChange={(e) => setFormData({ ...formData, average_viewer: e.target.value })}
                  className={errors.average_viewer ? 'border-red-500' : ''}
                />
                {errors.average_viewer && <div className="text-xs text-red-500 mt-1">{errors.average_viewer}</div>}
              </div>
            </div>
          </div>

          {/* Engagement Metrics */}
          <div>
            <h3 className="font-semibold mb-4">Engagement</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Likes</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.likes}
                  onChange={(e) => setFormData({ ...formData, likes: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Comments</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Shares</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={formData.shares}
                  onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div>
            <label className="text-sm font-medium mb-2 block">Top Performing Products</label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Enter product name..."
                value={currentProduct}
                onChange={(e) => setCurrentProduct(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addProduct())}
              />
              <Button type="button" onClick={addProduct}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.top_products.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.top_products.map((product, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    {product}
                    <button type="button" onClick={() => removeProduct(idx)} className="hover:text-blue-900">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Insights */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">What Went Well</label>
              <Textarea
                placeholder="Positive highlights, successful strategies..."
                value={formData.insights_good}
                onChange={(e) => setFormData({ ...formData, insights_good: e.target.value })}
                rows={4}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Areas for Improvement</label>
              <Textarea
                placeholder="Challenges faced, suggestions for next time..."
                value={formData.insights_improvement}
                onChange={(e) => setFormData({ ...formData, insights_improvement: e.target.value })}
                rows={4}
              />
            </div>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Replay URL</label>
              <Input
                type="url"
                placeholder="https://..."
                value={formData.replay_url}
                onChange={(e) => setFormData({ ...formData, replay_url: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Dashboard URL</label>
              <Input
                type="url"
                placeholder="https://..."
                value={formData.dashboard_url}
                onChange={(e) => setFormData({ ...formData, dashboard_url: e.target.value })}
              />
            </div>
          </div>

          {/* Screenshots */}
          <div>
            <label className="text-sm font-medium mb-2 block">Report Screenshots</label>
            {formData.screenshot_urls.length > 0 && (
              <div className="grid grid-cols-4 gap-4 mb-4">
                {formData.screenshot_urls.map((url, idx) => (
                  <div key={idx} className="relative">
                    <img src={url} alt={`Screenshot ${idx + 1}`} className="w-full h-24 object-cover rounded-lg border" />
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => removeImage(idx)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              <Upload className="h-8 w-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">Click to upload screenshots</span>
              <span className="text-xs text-gray-500 mt-1">Multiple images supported</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
            </label>
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
              Submit Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
