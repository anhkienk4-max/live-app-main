'use client'

import * as React from 'react'
import { ocrService, reportImageService, reportService } from '@/lib/services/dataService'
import { Brand, OcrReviewData, Platform, ReportImageCategory, Shift } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, Loader2, ScanText, Upload, X } from 'lucide-react'
import { format } from 'date-fns'

const imageCategories: { value: ReportImageCategory; label: string }[] = [
  { value: 'dashboard', label: 'Dashboard' }, { value: 'livestream', label: 'Livestream' },
  { value: 'host', label: 'Host' }, { value: 'support', label: 'Support' },
  { value: 'technical', label: 'Technical' }, { value: 'voucher', label: 'Voucher' },
  { value: 'product', label: 'Product' }, { value: 'other', label: 'Other' },
]

type MetricField = 'revenue' | 'orders' | 'peak_viewer' | 'average_viewer' | 'likes' | 'comments' | 'shares'
type FormData = Record<MetricField, string> & {
  shift_id: string; insights_good: string; insights_improvement: string; replay_url: string; dashboard_url: string
}
type PendingImage = { url: string; name: string; type: ReportImageCategory; mime: string; size: number }

const emptyForm = (shiftId = ''): FormData => ({
  shift_id: shiftId, revenue: '', orders: '', peak_viewer: '', average_viewer: '', likes: '', comments: '', shares: '',
  insights_good: '', insights_improvement: '', replay_url: '', dashboard_url: '',
})

export function ReportFormModal({ open, onOpenChange, completedShifts, brands, platforms, onSuccess }: {
  open: boolean; onOpenChange: (open: boolean) => void; completedShifts: Shift[]; brands: Brand[]; platforms: Platform[]; onSuccess: () => void
}) {
  const [formData, setFormData] = React.useState<FormData>(emptyForm())
  const [images, setImages] = React.useState<PendingImage[]>([])
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [category, setCategory] = React.useState<ReportImageCategory>('dashboard')
  const [review, setReview] = React.useState<OcrReviewData>({ status: 'not_started', metrics: {} })
  const [submitting, setSubmitting] = React.useState(false)
  const [reviewing, setReviewing] = React.useState(false)
  const { toast } = useToast()

  React.useEffect(() => {
    if (open) { setFormData(emptyForm(completedShifts[0]?.id)); setImages([]); setReview({ status: 'not_started', metrics: {} }) }
  }, [open, completedShifts])

  const getBrandName = (id: string) => brands.find(item => item.id === id)?.name ?? 'Unknown'
  const getPlatformName = (id: string) => platforms.find(item => item.id === id)?.name ?? 'Unknown'
  const setMetric = (field: MetricField, value: string) => setFormData(current => ({ ...current, [field]: value }))

  const runOcrReview = async () => {
    if (!images.some(image => image.type === 'dashboard')) {
      toast({ title: 'Dashboard image required', description: 'Add at least one dashboard image before reviewing OCR metrics.', variant: 'destructive' })
      return
    }
    setReviewing(true)
    try {
      const candidate = await ocrService.extractDashboardMetrics()
      setReview(candidate)
      for (const [key, metric] of Object.entries(candidate.metrics)) {
        const field = key === 'viewers' ? 'peak_viewer' : key
        if (field in formData && metric) setMetric(field as MetricField, String(metric.value))
      }
      toast({ title: 'OCR metrics ready for review', description: 'Values are editable. Low-confidence values are marked for confirmation.', variant: 'success' })
    } finally { setReviewing(false) }
  }

  const addImages = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setImages(current => [...current, ...files.map(file => ({ url: URL.createObjectURL(file), name: file.name, type: category, mime: file.type, size: file.size }))])
    event.target.value = ''
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const required: MetricField[] = ['revenue', 'orders', 'peak_viewer', 'average_viewer']
    if (!formData.shift_id || required.some(field => formData[field] === '' || Number(formData[field]) < 0)) {
      toast({ title: 'Validation error', description: 'Select a shift and enter non-negative required metrics.', variant: 'destructive' }); return
    }
    if (review.status !== 'pending_review') {
      toast({ title: 'Review required', description: 'Run the dashboard OCR review and confirm the editable metrics before saving.', variant: 'destructive' }); return
    }
    setSubmitting(true)
    try {
      const report = await reportService.create({
        shift_id: formData.shift_id, revenue: Number(formData.revenue), orders: Number(formData.orders),
        peak_viewer: Number(formData.peak_viewer), average_viewer: Number(formData.average_viewer), likes: Number(formData.likes || 0),
        comments: Number(formData.comments || 0), shares: Number(formData.shares || 0), viewers: Number(formData.peak_viewer),
        insights_good: formData.insights_good || undefined, insights_improvement: formData.insights_improvement || undefined,
        replay_url: formData.replay_url || undefined, dashboard_url: formData.dashboard_url || undefined,
        metrics_confirmed: false, ocr_review: review,
      })
      await Promise.all(images.map(image => reportImageService.create({ report_id: report.id, image_url: image.url, image_type: image.type, original_name: image.name, mime_type: image.mime, size_bytes: image.size })))
      await reportService.confirmMetrics(report.id, {
        revenue: Number(formData.revenue), orders: Number(formData.orders), peak_viewer: Number(formData.peak_viewer), average_viewer: Number(formData.average_viewer),
        likes: Number(formData.likes || 0), comments: Number(formData.comments || 0), shares: Number(formData.shares || 0), viewers: Number(formData.peak_viewer),
      }, review)
      toast({ title: 'Confirmed report saved', description: 'Only this confirmed report will be used by Analytics.', variant: 'success' })
      onSuccess()
    } catch { toast({ title: 'Save failed', description: 'The mock report could not be saved. Please try again.', variant: 'destructive' }) }
    finally { setSubmitting(false) }
  }

  const grouped = images.reduce<Record<string, PendingImage[]>>((result, image) => { (result[image.type] ??= []).push(image); return result }, {})
  const lowConfidence = Object.values(review.metrics).some(metric => metric?.needs_review)

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Report & OCR review</DialogTitle><DialogDescription>Select a completed shift, upload dashboard evidence, review editable OCR candidates, then confirm the report.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-6">
      <div><label className="text-sm font-medium mb-2 block">Completed shift *</label><Select value={formData.shift_id} onValueChange={value => setFormData(current => ({ ...current, shift_id: value }))}><SelectTrigger><SelectValue placeholder="Choose a completed shift" /></SelectTrigger><SelectContent>{completedShifts.map(shift => <SelectItem key={shift.id} value={shift.id}>{getBrandName(shift.brand_id)} · {getPlatformName(shift.platform_id)} ({format(new Date(shift.date), 'MMM d')}, {shift.start_time})</SelectItem>)}</SelectContent></Select></div>
      <div className="rounded-lg border p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Evidence images</h3><p className="text-sm text-muted-foreground">Files stay local in mock mode; metadata is saved by category.</p></div><div className="flex gap-2"><Select value={category} onValueChange={value => setCategory(value as ReportImageCategory)}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{imageCategories.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select><Button type="button" onClick={() => fileInputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Add images</Button><input ref={fileInputRef} className="sr-only" type="file" accept="image/*" multiple onChange={addImages} /></div></div>
        {Object.entries(grouped).map(([type, categoryImages]) => <div key={type}><p className="mb-2 text-sm font-medium capitalize">{type} ({categoryImages.length})</p><div className="flex flex-wrap gap-3">{categoryImages.map((image, index) => <div className="relative w-28" key={`${image.url}-${index}`}><img src={image.url} alt={image.name} className="h-20 w-28 rounded border object-cover" /><p className="truncate text-xs">{image.name}</p><Button aria-label={`Remove ${image.name}`} type="button" size="icon" variant="destructive" className="absolute -right-2 -top-2 h-5 w-5" onClick={() => setImages(current => current.filter(item => item !== image))}><X className="h-3 w-3" /></Button></div>)}</div></div>)}</div>
      <div className="rounded-lg border border-dashed p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Dashboard OCR review</h3><p className="text-sm text-muted-foreground">Mock extraction creates review candidates only; it never updates Analytics directly.</p></div><Button type="button" onClick={runOcrReview} disabled={reviewing}>{reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}Review dashboard</Button></div>{lowConfidence && <p className="mt-3 flex items-center gap-2 text-sm text-amber-700"><AlertTriangle className="h-4 w-4" />Low-confidence values require your edit/confirmation before saving.</p>}</div>
      <div><h3 className="mb-3 font-semibold">Confirmed metrics</h3><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{([['revenue', 'Revenue'], ['orders', 'Orders'], ['peak_viewer', 'Peak viewers'], ['average_viewer', 'Average viewers'], ['likes', 'Likes'], ['comments', 'Comments'], ['shares', 'Shares']] as [MetricField, string][]).map(([field, label]) => <label key={field} className="text-sm font-medium">{label}{['revenue','orders','peak_viewer','average_viewer'].includes(field) ? ' *' : ''}<Input className="mt-1" type="number" min="0" step={field === 'revenue' ? '0.01' : '1'} value={formData[field]} onChange={event => setMetric(field, event.target.value)} /></label>)}</div></div>
      <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Replay URL<Input className="mt-1" type="url" value={formData.replay_url} onChange={event => setFormData(current => ({ ...current, replay_url: event.target.value }))} /></label><label className="text-sm font-medium">Dashboard URL<Input className="mt-1" type="url" value={formData.dashboard_url} onChange={event => setFormData(current => ({ ...current, dashboard_url: event.target.value }))} /></label><label className="text-sm font-medium">What went well<Textarea className="mt-1" value={formData.insights_good} onChange={event => setFormData(current => ({ ...current, insights_good: event.target.value }))} /></label><label className="text-sm font-medium">Improvement areas<Textarea className="mt-1" value={formData.insights_improvement} onChange={event => setFormData(current => ({ ...current, insights_improvement: event.target.value }))} /></label></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button><Button type="submit" disabled={submitting}>{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm & save report</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
