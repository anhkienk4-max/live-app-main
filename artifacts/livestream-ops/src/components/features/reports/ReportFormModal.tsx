import * as React from 'react'
import { reportService } from '@/lib/services/dataService'
import { Shift, Brand, Platform, ReportImageCategory } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
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

const IMAGE_CATEGORIES: { value: ReportImageCategory; label: string; color: string }[] = [
  { value: 'dashboard', label: 'Dashboard', color: 'bg-blue-100 text-blue-700' },
  { value: 'livestream', label: 'Livestream', color: 'bg-red-100 text-red-700' },
  { value: 'host', label: 'Host', color: 'bg-purple-100 text-purple-700' },
  { value: 'support', label: 'Support', color: 'bg-green-100 text-green-700' },
  { value: 'technical', label: 'Technical', color: 'bg-orange-100 text-orange-700' },
  { value: 'voucher', label: 'Voucher', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'product', label: 'Product', color: 'bg-pink-100 text-pink-700' },
  { value: 'other', label: 'Other', color: 'bg-gray-100 text-gray-700' },
]

interface ScreenshotEntry {
  url: string
  category: ReportImageCategory
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
  screenshots: ScreenshotEntry[]
}

export function ReportFormModal({
  open,
  onOpenChange,
  completedShifts,
  brands,
  platforms,
  onSuccess,
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
    screenshots: [],
  })
  const [currentProduct, setCurrentProduct] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormData, string>>>({})
  // Per-upload pending category — used in the upload flow
  const [pendingCategory, setPendingCategory] = React.useState<ReportImageCategory>('dashboard')
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) {
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
        screenshots: [],
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
    if (!files) return
    const newEntries: ScreenshotEntry[] = Array.from(files).map((file, idx) => ({
      url: `https://placehold.co/800x600/2563EB/white?text=${encodeURIComponent(file.name)}`,
      category: pendingCategory,
    }))
    setFormData(prev => ({ ...prev, screenshots: [...prev.screenshots, ...newEntries] }))
    toast({
      title: 'Images Added',
      description: `${files.length} image(s) added as "${IMAGE_CATEGORIES.find(c => c.value === pendingCategory)?.label}"`,
      variant: 'default',
    })
    // reset input so same file can be re-picked
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setFormData(prev => {
      const updated = [...prev.screenshots]
      updated.splice(index, 1)
      return { ...prev, screenshots: updated }
    })
  }

  const updateImageCategory = (index: number, category: ReportImageCategory) => {
    setFormData(prev => {
      const updated = prev.screenshots.map((s, i) => i === index ? { ...s, category } : s)
      return { ...prev, screenshots: updated }
    })
  }

  const addProduct = () => {
    if (currentProduct.trim()) {
      setFormData(prev => ({ ...prev, top_products: [...prev.top_products, currentProduct.trim()] }))
      setCurrentProduct('')
    }
  }

  const removeProduct = (index: number) => {
    setFormData(prev => {
      const updated = [...prev.top_products]
      updated.splice(index, 1)
      return { ...prev, top_products: updated }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' })
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
        dashboard_url: formData.dashboard_url || undefined,
      })
      toast({ title: 'Report Submitted', description: 'Final report has been recorded successfully', variant: 'default' })
      onSuccess()
    } catch (error) {
      toast({ title: 'Submission Failed', description: 'Failed to submit report. Please try again.', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'
  const getPlatformName = (id: string) => platforms.find(p => p.id === id)?.name || 'Unknown'

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
            <Select value={formData.shift_id} onValueChange={v => setFormData(prev => ({ ...prev, shift_id: v }))}>
              <SelectTrigger className={errors.shift_id ? 'border-red-500' : ''}>
                <SelectValue placeholder="Choose a completed shift..." />
              </SelectTrigger>
              <SelectContent>
                {completedShifts.map(shift => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {getBrandName(shift.brand_id)} – {getPlatformName(shift.platform_id)} ({format(new Date(shift.date), 'MMM d')}, {shift.start_time})
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
                <label className="text-sm font-medium mb-1 block">Total Revenue ($) <span className="text-red-500">*</span></label>
                <Input type="number" step="0.01" min="0" placeholder="0.00"
                  value={formData.revenue} onChange={e => setFormData(p => ({ ...p, revenue: e.target.value }))}
                  className={errors.revenue ? 'border-red-500' : ''} />
                {errors.revenue && <div className="text-xs text-red-500 mt-1">{errors.revenue}</div>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Total Orders <span className="text-red-500">*</span></label>
                <Input type="number" min="0" placeholder="0"
                  value={formData.orders} onChange={e => setFormData(p => ({ ...p, orders: e.target.value }))}
                  className={errors.orders ? 'border-red-500' : ''} />
                {errors.orders && <div className="text-xs text-red-500 mt-1">{errors.orders}</div>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Peak Viewers <span className="text-red-500">*</span></label>
                <Input type="number" min="0" placeholder="0"
                  value={formData.peak_viewer} onChange={e => setFormData(p => ({ ...p, peak_viewer: e.target.value }))}
                  className={errors.peak_viewer ? 'border-red-500' : ''} />
                {errors.peak_viewer && <div className="text-xs text-red-500 mt-1">{errors.peak_viewer}</div>}
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Average Viewers <span className="text-red-500">*</span></label>
                <Input type="number" min="0" placeholder="0"
                  value={formData.average_viewer} onChange={e => setFormData(p => ({ ...p, average_viewer: e.target.value }))}
                  className={errors.average_viewer ? 'border-red-500' : ''} />
                {errors.average_viewer && <div className="text-xs text-red-500 mt-1">{errors.average_viewer}</div>}
              </div>
            </div>
          </div>

          {/* Engagement */}
          <div>
            <h3 className="font-semibold mb-4">Engagement</h3>
            <div className="grid grid-cols-3 gap-4">
              {(['likes', 'comments', 'shares'] as const).map(k => (
                <div key={k}>
                  <label className="text-sm font-medium mb-1 block capitalize">{k}</label>
                  <Input type="number" min="0" placeholder="0"
                    value={formData[k]} onChange={e => setFormData(p => ({ ...p, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div>
            <label className="text-sm font-medium mb-2 block">Top Performing Products</label>
            <div className="flex gap-2 mb-2">
              <Input placeholder="Enter product name..."
                value={currentProduct} onChange={e => setCurrentProduct(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addProduct())} />
              <Button type="button" onClick={addProduct}><Plus className="h-4 w-4" /></Button>
            </div>
            {formData.top_products.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.top_products.map((product, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                    {product}
                    <button type="button" onClick={() => removeProduct(idx)}>
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
              <Textarea placeholder="Positive highlights, successful strategies..."
                value={formData.insights_good}
                onChange={e => setFormData(p => ({ ...p, insights_good: e.target.value }))} rows={4} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Areas for Improvement</label>
              <Textarea placeholder="Challenges faced, suggestions for next time..."
                value={formData.insights_improvement}
                onChange={e => setFormData(p => ({ ...p, insights_improvement: e.target.value }))} rows={4} />
            </div>
          </div>

          {/* URLs */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Replay URL</label>
              <Input type="url" placeholder="https://..." value={formData.replay_url}
                onChange={e => setFormData(p => ({ ...p, replay_url: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Dashboard URL</label>
              <Input type="url" placeholder="https://..." value={formData.dashboard_url}
                onChange={e => setFormData(p => ({ ...p, dashboard_url: e.target.value }))} />
            </div>
          </div>

          {/* Screenshots with categories */}
          <div>
            <label className="text-sm font-medium mb-2 block">Report Screenshots</label>

            {/* Existing screenshots with category selectors */}
            {formData.screenshots.length > 0 && (
              <div className="space-y-3 mb-4">
                {formData.screenshots.map((entry, idx) => {
                  const catMeta = IMAGE_CATEGORIES.find(c => c.value === entry.category)
                  return (
                    <div key={idx} className="flex items-center gap-3 border rounded-lg p-3">
                      <img src={entry.url} alt={`Screenshot ${idx + 1}`}
                        className="w-24 h-16 object-cover rounded border shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 mb-1">Image {idx + 1}</p>
                        <Select value={entry.category} onValueChange={v => updateImageCategory(idx, v as ReportImageCategory)}>
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMAGE_CATEGORIES.map(c => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Badge className={`shrink-0 ${catMeta?.color || ''}`}>{catMeta?.label}</Badge>
                      <Button type="button" size="icon" variant="ghost"
                        className="text-red-500 hover:text-red-700 shrink-0" onClick={() => removeImage(idx)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Upload new images — choose category before picking file */}
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 hover:border-blue-400 transition-colors">
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Add images as:</label>
                <Select value={pendingCategory} onValueChange={v => setPendingCategory(v as ReportImageCategory)}>
                  <SelectTrigger className="flex-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Choose Files
                </Button>
              </div>
              <p className="text-xs text-gray-400 text-center">PNG, JPG, WEBP · Multiple files supported</p>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </div>

            {/* Category legend */}
            {formData.screenshots.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {IMAGE_CATEGORIES.map(c => {
                  const count = formData.screenshots.filter(s => s.category === c.value).length
                  if (count === 0) return null
                  return (
                    <Badge key={c.value} className={c.color}>
                      {c.label}: {count}
                    </Badge>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
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
