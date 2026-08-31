'use client'

import * as React from 'react'
import { Shift, Brand, Platform, Campaign, User, DashboardUpdate, OperationalRole, ShiftRegistration, Report } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { dashboardUpdateService, isStaffedRegistration, reportService } from '@/lib/services/dataService'
import { format, parseISO } from 'date-fns'
import { Clock, DollarSign, TrendingUp, Users, ExternalLink, Camera, Plus, Upload, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { DashboardUpdateModal } from './DashboardUpdateModal'
import { formatDuration, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { DeletionImpact } from '@/lib/types/database.types'
import { useToast } from '@/components/ui/toast'
import { hasPermission } from '@/lib/permissions'
import { ReportFormModal } from '@/components/features/reports/ReportFormModal'
import { ReportDetailModal } from '@/components/features/reports/ReportDetailModal'
import { commonReportMetricKeys, platformMetricKeys } from '@/lib/utils/ocrMetrics'
import { ReportMetricKey } from '@/lib/types/database.types'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { ResponsiveActions, BottomActionBar } from '@/components/ui/mobile-actions'
import type { PrioritizedAction } from '@/lib/ui/action-priority'

interface LiveSessionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shift: Shift
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  onUpdate: () => void
}

export function LiveSessionModal({ 
  open, 
  onOpenChange, 
  shift, 
  brands, 
  platforms, 
  campaigns, 
  users, 
  registrations,
  onUpdate 
}: LiveSessionModalProps) {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const { toast } = useToast()
  const [updates, setUpdates] = React.useState<DashboardUpdate[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [reportLoading, setReportLoading] = React.useState(true)
  const [renderedAt] = React.useState(() => Date.now())
  const [showUpdate, setShowUpdate] = React.useState(false)
  const [removeTarget, setRemoveTarget] = React.useState<DashboardUpdate | null>(null)
  const [report, setReport] = React.useState<Report | null>(null)
  const [showReportForm, setShowReportForm] = React.useState(false)
  const [showReportDetail, setShowReportDetail] = React.useState(false)
  const [showAllSnapshotMetrics, setShowAllSnapshotMetrics] = React.useState(false)
  const [snapshotPage, setSnapshotPage] = React.useState(1)
  const [snapshotPageSize, setSnapshotPageSize] = React.useState(10)

  const loadUpdates = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      setUpdates(await dashboardUpdateService.getByShift(shift.id))
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }

  const loadReport = async () => {
    setReportLoading(true)
    try {
      setReport(await reportService.getByShift(shift.id))
    } catch (error) {
      setLoadError(error)
    } finally {
      setReportLoading(false)
    }
  }

  React.useEffect(() => {
    if (open && shift) {
      queueMicrotask(() => { void Promise.all([loadUpdates(), loadReport()]) })
    }
  }, [open, shift])

  const getBrandName = (id: string) => brands.find((b: Brand) => b.id === id)?.name || 'Unknown'
  const getBrandColor = (id: string) => brands.find((b: Brand) => b.id === id)?.color || '#2563EB'
  const getPlatformName = (id: string) => platforms.find((p: Platform) => p.id === id)?.name || 'Unknown'
  const getCampaignName = (id?: string) => id ? campaigns.find((c: Campaign) => c.id === id)?.name || 'N/A' : 'N/A'
  const getUserName = (id?: string) => id ? users.find((u: User) => u.id === id)?.full_name || 'Unassigned' : 'Unassigned'
  const roleNames = (role: OperationalRole) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    const ids = new Set([
      ...(assignment ? [assignment] : []),
      ...registrations.filter(registration => registration.shift_id === shift.id && registration.operational_role === role && isStaffedRegistration(registration)).map(registration => registration.user_id),
    ])
    return [...ids].map(getUserName).join(', ') || '—'
  }
  const statusLabel = shift.status === 'live' ? t('liveStatus') : t(shift.status)

  const orderedUpdates = [...updates].sort((left, right) => left.time.localeCompare(right.time))
  const visibleUpdates = orderedUpdates.slice((snapshotPage - 1) * snapshotPageSize, snapshotPage * snapshotPageSize)
  const latestUpdate = orderedUpdates.length > 0 ? orderedUpdates[orderedUpdates.length - 1] : null
  const totalRevenue = latestUpdate?.revenue ?? null
  const totalOrders = latestUpdate?.orders ?? null
  const peakViewers = updates.length > 0 ? Math.max(...updates.map(u => u.peak_viewers)) : null
  const removeImpact: DeletionImpact | null = removeTarget ? {
    entity_type: 'live_snapshot',
    entity_id: removeTarget.id,
    entity_name: `Live snapshot · ${format(parseISO(removeTarget.time), 'dd/MM/yyyy HH:mm')}`,
    action: 'delete',
    consequence: 'The unconfirmed snapshot will be permanently removed. Snapshots referenced by a confirmed report cannot be deleted.',
    reversible: false,
    related_records: [{ entity_type: 'shift', entity_id: shift.id, entity_name: shift.title || shift.date }],
  } : null

  const removeSnapshot = async (reason: string) => {
    if (!currentUser || !removeTarget) return
    try {
      await dashboardUpdateService.remove(removeTarget.id, currentUser.id, reason)
      setUpdates(current => current.filter(update => update.id !== removeTarget.id))
      toast({ title: 'Snapshot deleted', variant: 'success' })
      setRemoveTarget(null)
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  const headerActions: PrioritizedAction[] = []
  if (['preparing', 'live', 'paused'].includes(shift.status)) {
    headerActions.push({
      key: 'add-update',
      label: 'Add Update',
      icon: <Plus className="mr-2 h-4 w-4" />,
      onClick: () => setShowUpdate(true),
      tier: 'primary',
      testId: `open-live-dashboard-update-${shift.id}`,
    })
    headerActions.push({
      key: 'upload-snapshot',
      label: 'Upload Snapshot',
      icon: <Upload className="mr-2 h-4 w-4" />,
      onClick: () => setShowUpdate(true),
      tier: 'secondary',
    })
  }
  if (currentUser && hasPermission(currentUser, 'reports.submit') && !reportLoading) {
    if (report) {
      headerActions.push({
        key: 'view-report',
        label: report.status === 'confirmed' ? 'Xem báo cáo' : report.status === 'reopened' ? 'Tiếp tục chỉnh sửa' : 'Tiếp tục báo cáo',
        onClick: () => setShowReportDetail(true),
        tier: 'secondary',
      })
    } else {
      headerActions.push({
        key: 'create-report',
        label: 'Tạo báo cáo',
        onClick: () => setShowReportForm(true),
        tier: 'secondary',
        testId: 'open-final-report-modal',
      })
    }
  }

  const elapsed = shift.start_at && shift.status === 'live'
    ? formatDuration(Math.max(0, Math.floor((renderedAt - new Date(shift.start_at).getTime()) / 60000)))
    : null
  const needsAttention = shift.status === 'live' && !latestUpdate
  const attentionLabel = needsAttention ? t('liveAttentionMissingUpdate') : t('liveHealthy')

  return (<>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="h-[calc(100vh-1rem)] overflow-y-auto sm:h-auto sm:max-h-[92vh] flex flex-col p-0">
        <div className="flex-1 overflow-y-auto p-6 pb-24 sm:pb-6">
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-3 sm:pr-8 mb-4">
            <div>
              <DialogTitle className="text-2xl">{getBrandName(shift.brand_id)} - Live Session</DialogTitle>
              <div className="text-sm text-gray-600 mt-1">{format(new Date(`${shift.date}T00:00:00`), 'MMMM d, yyyy')} • {formatShiftTimeRange(shift)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'} className={shift.status === 'live' ? 'animate-pulse' : ''}>
                {shift.status === 'live' && <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-ping"></span>}
                {statusLabel}
              </Badge>
              <div className="hidden sm:block">
                <ResponsiveActions actions={headerActions} />
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="live-session-summary">
          <div><p className="text-xs font-medium text-muted-foreground">{t('liveSessionIdentity')}</p><p className="font-semibold">{shift.title || getBrandName(shift.brand_id)}</p><p className="text-xs text-muted-foreground">{getBrandName(shift.brand_id)} · {getPlatformName(shift.platform_id)} · {getCampaignName(shift.campaign_id)}</p></div>
          <div><p className="text-xs font-medium text-muted-foreground">{t('liveSessionState')}</p><p className="font-semibold">{statusLabel}</p><p className="text-xs text-muted-foreground">{t('liveShiftState')}: {t(shift.status)}</p></div>
          <div><p className="text-xs font-medium text-muted-foreground">{t('liveSessionHealth')}</p><p className={needsAttention ? 'font-semibold text-amber-700' : 'font-semibold text-emerald-700'}>{attentionLabel}</p><p className="text-xs text-muted-foreground">{latestUpdate ? `${t('liveLastUpdated')}: ${format(new Date(latestUpdate.time), 'dd/MM/yyyy HH:mm')}` : t('liveNoCapture')}</p></div>
          <div><p className="text-xs font-medium text-muted-foreground">{t('liveStartedAt')}</p><p className="font-semibold">{format(new Date(shift.start_at || `${shift.date}T${shift.start_time}`), 'dd/MM/yyyy HH:mm')}</p><p className="text-xs text-muted-foreground">{elapsed ? `${t('liveElapsed')}: ${elapsed}` : formatShiftTimeRange(shift)}</p></div>
        </div>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="updates">Updates ({updates.length})</TabsTrigger>
            <TabsTrigger value="info">Details</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t('livePrimaryMetrics')}</h3><span className={needsAttention ? 'text-xs font-medium text-amber-700' : 'text-xs font-medium text-emerald-700'}>{attentionLabel}</span></div>
            {/* Live Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('revenue')}</div>
                      <div className="text-2xl font-bold text-green-600">{totalRevenue == null ? t('notAvailable') : formatCurrency(totalRevenue)}</div>
                    </div>
                    <DollarSign className="h-8 w-8 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('orders')}</div>
                      <div className="text-2xl font-bold">{totalOrders == null ? t('notAvailable') : totalOrders.toLocaleString()}</div>
                    </div>
                    <TrendingUp className="h-8 w-8 text-blue-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('peakViewers')}</div>
                      <div className="text-2xl font-bold">{peakViewers == null ? t('notAvailable') : peakViewers.toLocaleString()}</div>
                    </div>
                    <Users className="h-8 w-8 text-purple-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600">{t('currentViewers')}</div>
                      <div className="text-2xl font-bold">{latestUpdate == null ? t('notAvailable') : latestUpdate.current_viewers.toLocaleString()}</div>
                    </div>
                    <Users className="h-8 w-8 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card data-testid="live-staffing-summary"><CardContent className="pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{t('liveStaffing')}</h3><span className="text-xs text-muted-foreground">{t('liveAssigned')}</span></div><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">{t('host')}</p><p className="font-medium">{roleNames('host')}</p></div><div><p className="text-xs text-muted-foreground">{t('support')}</p><p className="font-medium">{roleNames('support')}</p></div><div><p className="text-xs text-muted-foreground">{t('technical')}</p><p className="font-medium">{roleNames('technical')}</p></div></div></CardContent></Card>

            {/* Live Link */}
            {shift.live_link && (
              <Card className="border-2" style={{ borderColor: getBrandColor(shift.brand_id) }}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-600 mb-1">Live Stream Link</div>
                      <div className="font-mono text-sm text-blue-600">{shift.live_link}</div>
                    </div>
                    <Button size="sm" onClick={() => window.open(shift.live_link, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Live
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Product Notes */}
            {shift.product_notes && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-gray-600 mb-2">Product Notes</div>
                  <div className="text-sm">{shift.product_notes}</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="updates" className="space-y-4">
            <div className="flex justify-end"><div className="inline-flex rounded-lg border p-1"><Button size="sm" variant={!showAllSnapshotMetrics ? 'secondary' : 'ghost'} onClick={() => setShowAllSnapshotMetrics(false)}>Chỉ số có dữ liệu</Button><Button size="sm" variant={showAllSnapshotMetrics ? 'secondary' : 'ghost'} onClick={() => setShowAllSnapshotMetrics(true)}>Tất cả chỉ số</Button></div></div>
            {loadError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert" data-testid="live-session-load-error">{t('liveLoadError')}</div>
            ) : loading ? (
              <div className="text-center py-12 text-gray-600">Loading updates...</div>
            ) : updates.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <Camera className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <div className="text-lg font-medium text-gray-600">No Dashboard Updates Yet</div>
                  <div className="text-sm text-gray-500 mt-2">Updates will appear here as staff submits them every 30 minutes</div>
                </div>
              </Card>
            ) : (
              <div className="space-y-4">
                {visibleUpdates.map((update, index) => (
                  <Card key={update.id}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="font-semibold">Cập nhật trong phiên live #{(snapshotPage - 1) * snapshotPageSize + index + 1}</div>
                          <div className="text-sm text-gray-600">{format(parseISO(update.time), 'h:mm a')}</div>
                        </div>
                        <div className="flex flex-wrap gap-2"><Badge variant="outline">Not confirmed</Badge><Badge variant="secondary">{format(parseISO(update.time), 'MMM d')}</Badge>{currentUser && (currentUser.id === update.created_by || currentUser.role === 'admin') && <Button size="icon-sm" variant="ghost" aria-label="Delete live snapshot" title="Delete live snapshot" onClick={() => setRemoveTarget(update)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div>
                      </div>
                      <SnapshotPlatformMetrics update={update} showAll={showAllSnapshotMetrics} />
                      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <SnapshotMetric label={t('revenue')} value={formatCurrency(update.revenue)} />
                        <SnapshotMetric label={t('gmv')} value={formatCurrency(update.gmv ?? update.revenue)} />
                        <SnapshotMetric label={t('orders')} value={update.orders.toLocaleString()} />
                        <SnapshotMetric label={t('currentViewers')} value={update.current_viewers.toLocaleString()} />
                        <SnapshotMetric label={t('peakViewers')} value={update.peak_viewers.toLocaleString()} />
                        <SnapshotMetric label={t('totalViews')} value={update.total_views?.toLocaleString() ?? t('notAvailable')} />
                        <SnapshotMetric label={t('engagement')} value={`${update.likes?.toLocaleString() ?? t('notAvailable')} / ${update.comments?.toLocaleString() ?? t('notAvailable')}`} />
                        <SnapshotMetric label={t('metricShares')} value={update.shares?.toLocaleString() ?? t('notAvailable')} />
                      </div>
                      {update.screenshot_url && (
                        <img src={update.screenshot_url} alt="Dashboard Screenshot" className="w-full h-40 object-cover rounded-lg mb-4" />
                      )}
                      {update.notes && (
                        <div className="text-sm bg-gray-50 p-3 rounded-lg">{update.notes}</div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                <HistoryPagination page={snapshotPage} pageSize={snapshotPageSize} total={updates.length} onPageChange={setSnapshotPage} onPageSizeChange={size => { setSnapshotPageSize(size); setSnapshotPage(1) }} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Brand</div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBrandColor(shift.brand_id) }}></div>
                      <div className="font-medium">{getBrandName(shift.brand_id)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Platform</div>
                    <div className="font-medium">{getPlatformName(shift.platform_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Campaign</div>
                    <div className="font-medium">{getCampaignName(shift.campaign_id)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Date</div>
                    <div className="font-medium">{format(new Date(shift.date), 'MMMM d, yyyy')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Time</div>
                    <div className="font-medium">{formatShiftTimeRange(shift)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Status</div>
                    <Badge variant={shift.status === 'live' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-semibold mb-4">Team</div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Host</div>
                    <div className="font-medium">{roleNames('host')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Support</div>
                    <div className="font-medium">{roleNames('support')}</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Technical</div>
                    <div className="font-medium">{roleNames('technical')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeline">
            <Card><CardContent className="space-y-3 pt-6">
              {[
                { id: `created-${shift.id}`, time: shift.created_at, label: t('shiftCreated') },
                ...updates.map(update => ({ id: update.id, time: update.time, label: t('dashboardUpdateSubmitted') })),
                ...(shift.status === 'completed' ? [{ id: `completed-${shift.id}`, time: shift.updated_at, label: t('shiftCompleted') }] : []),
              ].sort((left, right) => right.time.localeCompare(left.time)).map(item => (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-blue-600" /><span className="font-medium">{item.label}</span></div>
                  <span className="text-xs text-muted-foreground">{format(new Date(item.time), 'dd/MM/yyyy HH:mm')}</span>
                </div>
              ))}
            </CardContent></Card>
          </TabsContent>
        </Tabs>
        </div>
        <BottomActionBar 
          actions={headerActions} 
          alwaysVisible={false}
          showBelow="sm"
          className="absolute"
        />
      </DialogContent>
    </Dialog>
    {showUpdate && <DashboardUpdateModal open shift={shift} platformName={platforms.find(platform => platform.id === shift.platform_id)?.name} onOpenChange={setShowUpdate} onSuccess={() => { void loadUpdates(); onUpdate() }} />}
    {showReportForm && <ReportFormModal open onOpenChange={setShowReportForm} completedShifts={[shift]} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onSuccess={() => { setShowReportForm(false); void loadReport(); onUpdate() }} />}
    {showReportDetail && report && <ReportDetailModal open report={report} shift={shift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={setShowReportDetail} onUpdated={() => { setShowReportDetail(false); void loadReport(); onUpdate() }} />}
    <LifecycleActionDialog open={Boolean(removeTarget)} onOpenChange={open => !open && setRemoveTarget(null)} title="Delete live snapshot" impact={removeImpact} confirmText="Delete" onConfirm={removeSnapshot} />
  </>)
}

function SnapshotMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="text-xs text-gray-600">{label}</div><div className="font-bold">{value}</div></div>
}

function SnapshotPlatformMetrics({ update, showAll }: { update: DashboardUpdate; showAll: boolean }) {
  const platform = update.dashboard_platform || 'other'
  const allowed = [...commonReportMetricKeys, ...platformMetricKeys[platform]]
  const groups: Array<{ title: string; keys: ReportMetricKey[] }> = [
    { title: 'Sales & Orders', keys: ['sales', 'revenue', 'gmv', 'orders', 'buyers', 'items_sold', 'average_basket_size', 'gpm', 'estimated_gmv'] },
    { title: 'Viewers & Traffic', keys: ['total_views', 'total_viewers', 'engaged_viewers', 'peak_concurrent_viewers', 'pcu', 'current_viewers', 'impressions', 'average_view_duration_seconds'] },
    { title: 'Engagement', keys: ['comments', 'comment_rate', 'likes', 'shares', 'new_followers'] },
    { title: 'Product Funnel', keys: ['add_to_cart', 'product_clicks', 'sku_orders'] },
    { title: 'Conversion', keys: ['ctr', 'live_ctr', 'click_rate', 'click_to_order_rate', 'conversion_rate', 'ctor', 'roi_gmv_max'] },
    { title: 'Platform-specific metrics', keys: ['advertising_cost', 'gmv_per_hour', 'live_duration_seconds'] },
  ]
  const values = update.normalized_metrics || {}
  const visibleGroups = groups.map(group => ({
    ...group,
    keys: group.keys.filter(key => allowed.includes(key) && (showAll || values[key] != null && values[key] !== '')),
  })).filter(group => group.keys.length)
  if (!visibleGroups.length) return null
  return <div className="mb-4 space-y-3 rounded-lg bg-muted/30 p-3">{visibleGroups.map(group => <div key={group.title}><p className="mb-2 text-xs font-semibold">{group.title}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{group.keys.map(key => <SnapshotMetric key={key} label={key.replaceAll('_', ' ')} value={formatSnapshotValue(key, values[key])} />)}</div></div>)}</div>
}

function formatSnapshotValue(key: ReportMetricKey, value: string | number | null | undefined) {
  if (value == null || value === '') return 'N/A'
  if (typeof value === 'string') return value
  if (['revenue', 'gmv', 'sales', 'gpm', 'estimated_gmv', 'average_basket_size', 'average_order_value', 'advertising_cost', 'gmv_per_hour'].includes(key)) return formatCurrency(value)
  if (['ctr', 'live_ctr', 'click_rate', 'click_to_order_rate', 'conversion_rate', 'ctor', 'comment_rate'].includes(key)) return `${value.toLocaleString()}%`
  if (key.includes('duration')) return `${value.toLocaleString()} s`
  return value.toLocaleString()
}
