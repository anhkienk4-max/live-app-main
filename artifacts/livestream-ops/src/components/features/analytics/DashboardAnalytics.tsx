import * as React from 'react'
import { analyticsService, shiftService, brandService, platformService, userService } from '@/lib/services/dataService'
import { AnalyticsEntry, Shift, Brand, Platform, User } from '@/lib/types/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, DollarSign, Users, Calendar, Upload, CheckCircle, Clock, Eye, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { format } from 'date-fns'

// ─── Types ────────────────────────────────────────────────────────────────────
type ExtractedData = AnalyticsEntry['extracted_data']

const FIELDS: { key: keyof ExtractedData; label: string }[] = [
  { key: 'revenue', label: 'Revenue ($)' },
  { key: 'orders', label: 'Orders' },
  { key: 'peak_viewers', label: 'Peak Viewers' },
  { key: 'current_viewers', label: 'Current Viewers' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Comments' },
  { key: 'shares', label: 'Shares' },
]

// ─── Static chart data (future: derived from confirmed entries) ───────────────
const revenueData = [
  { date: 'Mon', revenue: 15420, orders: 234 },
  { date: 'Tue', revenue: 18350, orders: 289 },
  { date: 'Wed', revenue: 22100, orders: 312 },
  { date: 'Thu', revenue: 19800, orders: 276 },
  { date: 'Fri', revenue: 25600, orders: 356 },
  { date: 'Sat', revenue: 31200, orders: 423 },
  { date: 'Sun', revenue: 28900, orders: 398 },
]

const platformData = [
  { name: 'TikTok Shop', value: 45, color: '#2563EB' },
  { name: 'Shopee Live', value: 30, color: '#EC4899' },
  { name: 'Lazada Live', value: 15, color: '#8B5CF6' },
  { name: 'Facebook Live', value: 10, color: '#10B981' },
]

export function DashboardAnalytics() {
  const [timeRange, setTimeRange] = React.useState('7d')
  const [entries, setEntries] = React.useState<AnalyticsEntry[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [users, setUsers] = React.useState<User[]>([])

  // OCR workflow state
  const [ocrOpen, setOcrOpen] = React.useState(false)
  const [ocrStep, setOcrStep] = React.useState<'upload' | 'preview' | 'confirm'>('upload')
  const [ocrShiftId, setOcrShiftId] = React.useState('')
  const [ocrScreenshotUrl, setOcrScreenshotUrl] = React.useState('')
  const [ocrData, setOcrData] = React.useState<ExtractedData>({})
  const [confirming, setConfirming] = React.useState(false)
  const [reviewEntry, setReviewEntry] = React.useState<AnalyticsEntry | null>(null)
  const [reviewData, setReviewData] = React.useState<ExtractedData>({})

  const fileRef = React.useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [e, s, b, p, u] = await Promise.all([
      analyticsService.getAll(),
      shiftService.getAll(),
      brandService.getAll(),
      platformService.getAll(),
      userService.getAll(),
    ])
    setEntries(e)
    setShifts(s)
    setBrands(b)
    setPlatforms(p)
    setUsers(u)
  }

  const getShiftLabel = (id: string) => {
    const s = shifts.find(sh => sh.id === id)
    if (!s) return id
    const brand = brands.find(b => b.id === s.brand_id)?.name || ''
    return `${brand} — ${format(new Date(s.date), 'MMM d')} ${s.start_time}`
  }

  const totalRevenue = revenueData.reduce((s, d) => s + d.revenue, 0)
  const totalOrders = revenueData.reduce((s, d) => s + d.orders, 0)

  // ── OCR Workflow handlers ──────────────────────────────────────────────────
  const handleScreenshotPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Simulate upload — in production, upload to object storage and get back URL
    const mockUrl = `https://placehold.co/800x450/1e3a5f/white?text=${encodeURIComponent(file.name)}`
    setOcrScreenshotUrl(mockUrl)
    // Simulate OCR extraction (placeholder values — real OCR comes later)
    setOcrData({ revenue: 0, orders: 0, peak_viewers: 0, likes: 0, comments: 0 })
    setOcrStep('preview')
  }

  const handleConfirm = async () => {
    if (!ocrShiftId) {
      toast({ title: 'Select a shift first', variant: 'destructive' })
      return
    }
    setConfirming(true)
    try {
      const entry = await analyticsService.createFromScreenshot(ocrShiftId, ocrScreenshotUrl, ocrData)
      await analyticsService.confirm(entry.id, ocrData, '1')
      toast({ title: 'Entry Confirmed', description: 'Analytics data saved', variant: 'default' })
      setOcrOpen(false)
      setOcrStep('upload')
      loadData()
    } finally {
      setConfirming(false)
    }
  }

  const openReview = (entry: AnalyticsEntry) => {
    setReviewEntry(entry)
    setReviewData({ ...(entry.confirmed_data || entry.extracted_data) })
  }

  const handleReviewConfirm = async () => {
    if (!reviewEntry) return
    setConfirming(true)
    try {
      await analyticsService.confirm(reviewEntry.id, reviewData, '1')
      toast({ title: 'Confirmed', description: 'Analytics entry confirmed', variant: 'default' })
      setReviewEntry(null)
      loadData()
    } finally {
      setConfirming(false)
    }
  }

  const pending = entries.filter(e => e.ocr_status === 'pending_review')
  const confirmed = entries.filter(e => e.ocr_status === 'confirmed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
          <p className="text-gray-600 mt-1">Performance data from dashboard screenshots. OCR extraction coming soon.</p>
        </div>
        <Button onClick={() => { setOcrOpen(true); setOcrStep('upload') }}>
          <Upload className="h-4 w-4 mr-2" /> Upload Screenshot
        </Button>
      </div>

      {/* Pending review banner */}
      {pending.length > 0 && (
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-yellow-800">{pending.length} entry{pending.length > 1 ? 's' : ''} pending review</p>
            <p className="text-sm text-yellow-600">Review and confirm extracted data before it counts toward analytics.</p>
          </div>
          <Button size="sm" variant="outline" className="border-yellow-400 text-yellow-700" onClick={() => openReview(pending[0])}>
            Review Now
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `$${(totalRevenue / 1000).toFixed(1)}k`, icon: <DollarSign className="h-8 w-8 text-green-600" />, note: 'Last 7 days' },
          { label: 'Total Orders', value: totalOrders, icon: <TrendingUp className="h-8 w-8 text-blue-600" />, note: 'Last 7 days' },
          { label: 'Confirmed Entries', value: confirmed.length, icon: <CheckCircle className="h-8 w-8 text-emerald-600" />, note: 'All time' },
          { label: 'Pending Review', value: pending.length, icon: <Clock className="h-8 w-8 text-yellow-500" />, note: 'Needs attention' },
        ].map(c => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-500">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">{c.value}</div>
                {c.icon}
              </div>
              <p className="text-xs text-gray-400 mt-1">{c.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Revenue Trend</CardTitle>
              <Select value={timeRange} onValueChange={v => v && setTimeRange(v)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={v => `$${v}`} />
                <Line type="monotone" dataKey="revenue" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Platform Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={platformData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                  label={e => `${e.name}: ${e.value}%`} labelLine={false}>
                  {platformData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* OCR entries log */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Screenshot Entries</CardTitle>
            <Badge variant="outline">{entries.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Eye className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No screenshots uploaded yet. Upload a dashboard screenshot to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => {
                const data = entry.confirmed_data || entry.extracted_data
                return (
                  <div key={entry.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                    <img src={entry.screenshot_url} alt="screenshot" className="w-20 h-12 object-cover rounded border" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{getShiftLabel(entry.shift_id)}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {data.revenue != null && <span>Revenue: ${Number(data.revenue).toLocaleString()}</span>}
                        {data.orders != null && <span>Orders: {data.orders}</span>}
                        {data.peak_viewers != null && <span>Peak: {data.peak_viewers}</span>}
                      </div>
                    </div>
                    <Badge className={
                      entry.ocr_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                      entry.ocr_status === 'pending_review' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }>{entry.ocr_status.replace('_', ' ')}</Badge>
                    {entry.ocr_status === 'pending_review' && (
                      <Button size="sm" variant="outline" onClick={() => openReview(entry)}>Review</Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── OCR Upload Workflow Modal ──────────────────────────────────────── */}
      <Dialog open={ocrOpen} onOpenChange={v => { setOcrOpen(v); if (!v) setOcrStep('upload') }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Dashboard Screenshot</DialogTitle>
            <DialogDescription>
              {ocrStep === 'upload' && 'Select a dashboard screenshot. OCR will extract data automatically (coming soon).'}
              {ocrStep === 'preview' && 'Review extracted values. Edit any incorrect fields before confirming.'}
              {ocrStep === 'confirm' && 'Confirm the data to save it to analytics.'}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm mb-4">
            {['upload', 'preview', 'confirm'].map((step, i) => (
              <React.Fragment key={step}>
                <div className={`px-3 py-1 rounded-full ${ocrStep === step ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>
                  {i + 1}. {step.charAt(0).toUpperCase() + step.slice(1)}
                </div>
                {i < 2 && <div className="h-px flex-1 bg-gray-200" />}
              </React.Fragment>
            ))}
          </div>

          {ocrStep === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Shift *</label>
                <Select value={ocrShiftId} onValueChange={setOcrShiftId}>
                  <SelectTrigger><SelectValue placeholder="Select the shift this screenshot is from…" /></SelectTrigger>
                  <SelectContent>
                    {shifts.filter(s => s.status === 'live' || s.status === 'completed').map(s => (
                      <SelectItem key={s.id} value={s.id}>{getShiftLabel(s.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleScreenshotPick} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-400 transition-colors cursor-pointer"
              >
                <Upload className="h-10 w-10 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Click to upload screenshot</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP supported</p>
              </button>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>OCR coming soon:</strong> Currently you'll manually enter the values in the next step. Future versions will auto-extract from the screenshot.
              </div>
            </div>
          )}

          {ocrStep === 'preview' && (
            <div className="space-y-4">
              {ocrScreenshotUrl && (
                <img src={ocrScreenshotUrl} alt="Dashboard screenshot" className="w-full rounded-lg border" />
              )}
              <p className="text-sm text-gray-600 font-medium">Enter values from the screenshot:</p>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-gray-600">{f.label}</label>
                    <Input
                      type="number"
                      value={ocrData[f.key] ?? ''}
                      onChange={e => setOcrData(prev => ({ ...prev, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOcrStep('upload')}>Back</Button>
                <Button onClick={() => setOcrStep('confirm')}>Preview →</Button>
              </DialogFooter>
            </div>
          )}

          {ocrStep === 'confirm' && (
            <div className="space-y-4">
              {ocrScreenshotUrl && (
                <img src={ocrScreenshotUrl} alt="Dashboard screenshot" className="w-full rounded-lg border" />
              )}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Data to be saved:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {FIELDS.map(f => ocrData[f.key] != null && (
                    <div key={f.key} className="flex justify-between">
                      <span className="text-gray-500">{f.label}</span>
                      <strong>{String(ocrData[f.key])}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOcrStep('preview')}>Edit</Button>
                <Button onClick={handleConfirm} disabled={confirming}>
                  {confirming ? 'Saving…' : '✓ Confirm & Save'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Review existing pending entry ─────────────────────────────────── */}
      <Dialog open={!!reviewEntry} onOpenChange={v => !v && setReviewEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Analytics Entry</DialogTitle>
            <DialogDescription>Edit any values, then confirm to save to analytics.</DialogDescription>
          </DialogHeader>
          {reviewEntry && (
            <div className="space-y-4">
              <img src={reviewEntry.screenshot_url} alt="screenshot" className="w-full rounded-lg border" />
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map(f => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-gray-600">{f.label}</label>
                    <Input
                      type="number"
                      value={reviewData[f.key] ?? ''}
                      onChange={e => setReviewData(prev => ({ ...prev, [f.key]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { analyticsService.reject(reviewEntry!.id, '1'); setReviewEntry(null); loadData() }} className="text-red-600">
              Reject
            </Button>
            <Button onClick={handleReviewConfirm} disabled={confirming}>
              {confirming ? 'Saving…' : '✓ Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
