'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import { Copy, ExternalLink, Eye, FileSpreadsheet, Maximize2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { brandService, campaignService, currentUserService, platformService, reportService, shiftService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, CampaignStatus, DeletionImpact, Platform, Report, Shift, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Column, DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { refreshCollection } from '@/lib/utils/scopedRefresh'

type CampaignForm = { name: string; brand_id: string; start_date: string; end_date: string; type: string; notes: string; campaign_url: string; website_title: string; website_preview_image: string; website_embed_enabled: boolean; platform_source: string; status: CampaignStatus; owner_id: string }
type ImportRow = CampaignForm & { row: number; errors: string[] }
const emptyForm = (): CampaignForm => ({ name: '', brand_id: '', start_date: '', end_date: '', type: '', notes: '', campaign_url: '', website_title: '', website_preview_image: '', website_embed_enabled: false, platform_source: '', status: 'draft', owner_id: '' })
const formFor = (campaign?: Campaign | null): CampaignForm => campaign ? {
  name: campaign.name, brand_id: campaign.brand_id, start_date: campaign.start_date, end_date: campaign.end_date, type: campaign.type || '', notes: campaign.notes || '', campaign_url: campaign.website_url || campaign.campaign_url || '', website_title: campaign.website_title || '', website_preview_image: campaign.website_preview_image || '', website_embed_enabled: Boolean(campaign.website_embed_enabled), platform_source: campaign.platform_source || '', status: campaign.status || 'draft', owner_id: campaign.owner_id || '',
} : emptyForm()

export function CampaignList() {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileRef = React.useRef<HTMLInputElement>(null)
  const previewImageRef = React.useRef<HTMLInputElement>(null)
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [selected, setSelected] = React.useState<Campaign | null>(null)
  const [detail, setDetail] = React.useState<Campaign | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [deleteImpact, setDeleteImpact] = React.useState<DeletionImpact | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<CampaignForm>(emptyForm())
  const [importRows, setImportRows] = React.useState<ImportRow[]>([])
  const [importOpen, setImportOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const loadData = React.useCallback(async () => {
    const [loadedCampaigns, loadedBrands, loadedPlatforms, loadedShifts, loadedReports, loadedUsers] = await Promise.all([
      campaignService.getAll(), brandService.getAll(), platformService.getAll(), shiftService.getAll(), reportService.getAll(), userService.getAll(),
    ])
    setCampaigns(loadedCampaigns); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setShifts(loadedShifts); setReports(loadedReports); setUsers(loadedUsers); setLoading(false)
  }, [])
  React.useEffect(() => { void loadData() }, [loadData])
  const refreshCampaigns = React.useCallback(() => refreshCollection(campaignService, setCampaigns), [])
  const canManage = Boolean(currentUser && hasPermission(currentUser, 'campaigns.manage'))
  const canEdit = Boolean(currentUser && (canManage || hasPermission(currentUser, 'campaigns.edit_operational')))
  const openForm = (campaign?: Campaign | null) => { setSelected(campaign || null); setForm(formFor(campaign)); setFormOpen(true) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if ((!selected && !canManage) || (selected && !canEdit)) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (!form.name.trim() || !form.brand_id || !form.start_date || !form.end_date || form.end_date < form.start_date) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    if (form.campaign_url && !safeWebUrl(form.campaign_url)) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    const editable = { ...form, owner_id: form.owner_id || currentUserService.getId(), campaign_url: form.campaign_url || undefined, website_url: form.campaign_url || null, website_title: form.website_title || null, website_preview_image: form.website_preview_image || null, platform_source: form.platform_source || undefined }
    const data = selected && !canManage
      ? { ...editable, name: selected.name, brand_id: selected.brand_id, start_date: selected.start_date, end_date: selected.end_date }
      : editable
    setSaving(true)
    try {
      if (selected) await campaignService.update(selected.id, data)
      else await campaignService.create(data)
      toast({ title: t('success'), description: t('save'), variant: 'success' })
      setFormOpen(false)
      await refreshCampaigns()
    } catch {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  const requestArchive = (campaign: Campaign) => {
    const relatedShifts = shifts.filter(shift => shift.campaign_id === campaign.id)
    const relatedShiftIds = new Set(relatedShifts.map(shift => shift.id))
    const relatedReports = reports.filter(report => relatedShiftIds.has(report.shift_id))
    setDeleteId(campaign.id)
    setDeleteImpact({
      entity_type: 'campaign',
      entity_id: campaign.id,
      entity_name: campaign.name,
      action: 'archive',
      consequence: 'The campaign will be archived and removed from default lists. Existing shifts, reports and analytics history remain intact.',
      reversible: true,
      related_records: [
        ...(relatedShifts.length ? [{ entity_type: 'shift', entity_id: '*', entity_name: 'Related shifts', count: relatedShifts.length }] : []),
        ...(relatedReports.length ? [{ entity_type: 'report', entity_id: '*', entity_name: 'Related reports', count: relatedReports.length }] : []),
      ],
    })
  }
  const archive = async (reason: string) => {
    if (!canManage || !currentUser || !deleteId) return
    try {
      await campaignService.archive(deleteId, currentUser.id, reason)
      toast({ title: 'Campaign archived', variant: 'success' })
      await refreshCampaigns()
    } catch (error) {
      toast({ title: 'Archive failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' })
      throw error
    }
  }
  const parseImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[workbook.SheetNames[0]], { defval: '' })
    setImportRows(rows.map((row, index) => {
      const brandName = String(row.Brand || '').trim()
      const brandId = brands.find(brand => brand.name.toLowerCase() === brandName.toLowerCase())?.id || ''
      const candidate: ImportRow = {
        row: index + 2,
        name: String(row['Campaign Name'] || row.Campaign || '').trim(),
        brand_id: brandId,
        start_date: normalizeDate(row['Start Date']),
        end_date: normalizeDate(row['End Date']),
        type: String(row.Type || '').trim(),
        notes: String(row.Notes || '').trim(),
        campaign_url: String(row.Website || row['Website URL'] || row['Campaign URL'] || row['Landing Page'] || row['Link chiến dịch'] || row['URL chiến dịch'] || '').trim(),
        website_title: String(row['Website Title'] || '').trim(),
        website_preview_image: String(row['Preview Image'] || row['Website Preview'] || '').trim(),
        website_embed_enabled: false,
        platform_source: String(row.Platform || '').trim(),
        status: (String(row.Status || 'draft').toLowerCase() as CampaignStatus),
        owner_id: users.find(user => user.email.toLowerCase() === String(row['Owner Email'] || '').toLowerCase())?.id || '',
        errors: [],
      }
      if (!candidate.name) candidate.errors.push('Campaign name is required.')
      if (!candidate.brand_id) candidate.errors.push(`Brand "${brandName}" was not found.`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.start_date)) candidate.errors.push('Start date is invalid.')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.end_date) || candidate.end_date < candidate.start_date) candidate.errors.push('End date is invalid.')
      if (!['draft','active','completed','cancelled'].includes(candidate.status)) candidate.errors.push('Status is invalid.')
      if (candidate.campaign_url && !safeWebUrl(candidate.campaign_url)) candidate.errors.push('Website URL is invalid.')
      return candidate
    }))
    setImportOpen(true)
    event.target.value = ''
  }
  const confirmImport = async () => {
    if (!canManage || importRows.some(row => row.errors.length)) return
    for (const row of importRows) {
      const { errors: _errors, row: _row, ...data } = row
      await campaignService.create({ ...data, owner_id: data.owner_id || currentUserService.getId() })
    }
    setImportOpen(false)
    setImportRows([])
    await refreshCampaigns()
  }
  const columns: Column<Campaign>[] = [
    { header: t('campaign'), accessor: row => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{brands.find(brand => brand.id === row.brand_id)?.name || '—'}</p></div> },
    { header: t('dateRange'), accessor: row => `${row.start_date} → ${row.end_date}` },
    { header: t('status'), accessor: row => t(row.status || 'draft') },
    { header: t('owner'), accessor: row => users.find(user => user.id === row.owner_id)?.full_name || '—' },
    { header: 'Website Preview', accessor: row => {
      const url = row.website_url || row.campaign_url
      return url ? <a href={safeWebUrl(url) || '#'} target="_blank" rel="noopener noreferrer" className="flex max-w-56 items-center gap-2 rounded border p-2 hover:bg-muted">
        {row.website_preview_image ? <img src={row.website_preview_image} alt="" className="h-10 w-16 rounded object-cover" /> : <ExternalLink className="h-4 w-4 shrink-0" />}
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{row.website_title || row.name}</span><span className="block truncate text-xs text-muted-foreground">{safeDomain(url)}</span></span>
      </a> : '—'
    } },
    { header: t('actions'), accessor: row => <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={t('viewDetails')} onClick={() => setDetail(row)}><Eye className="h-4 w-4" /></Button>{canEdit && <Button variant="ghost" size="icon" aria-label={t('edit')} onClick={() => openForm(row)}><Pencil className="h-4 w-4" /></Button>}{canManage && <Button variant="ghost" size="icon" aria-label="Archive campaign" title="Archive campaign" onClick={() => requestArchive(row)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}</div> },
  ]

  if (loading) return <ContentSkeleton />
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">{t('campaigns')}</h2><p className="mt-1 text-muted-foreground">{t('campaignPreviewHelp')}</p></div>{canManage && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => fileRef.current?.click()}><FileSpreadsheet className="mr-2 h-4 w-4" />{t('importExcel')}</Button><input ref={fileRef} className="sr-only" type="file" accept=".xlsx,.xls" onChange={parseImport} /><Button onClick={() => openForm()}><Plus className="mr-2 h-4 w-4" />{t('create')} {t('campaign')}</Button></div>}</div>
    <DataTable data={campaigns} columns={columns} searchPlaceholder={`${t('search')} ${t('campaigns')}`} />

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><DialogTitle>{selected ? t('edit') : t('create')} {t('campaign')}</DialogTitle><DialogDescription>{t('campaignPreviewHelp')}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2"><Field label={`${t('campaign')} *`} value={form.name} required disabled={Boolean(selected && !canManage)} onChange={value => setForm(current => ({ ...current, name: value }))} /><label className="text-sm font-medium">{t('brand')}<Select disabled={Boolean(selected && !canManage)} value={form.brand_id} onValueChange={value => setForm(current => ({ ...current, brand_id: value }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{brands.map(brand => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent></Select></label><Field label={t('startDate')} value={form.start_date} required disabled={Boolean(selected && !canManage)} type="date" onChange={value => setForm(current => ({ ...current, start_date: value }))} /><Field label={t('endDate')} value={form.end_date} required disabled={Boolean(selected && !canManage)} type="date" onChange={value => setForm(current => ({ ...current, end_date: value }))} /><Field label={t('type')} value={form.type} onChange={value => setForm(current => ({ ...current, type: value }))} /><Field label={t('platform')} value={form.platform_source} onChange={value => setForm(current => ({ ...current, platform_source: value }))} /><label className="text-sm font-medium">{t('status')}<Select value={form.status} onValueChange={value => setForm(current => ({ ...current, status: value as CampaignStatus }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{(['draft','active','completed','cancelled'] as CampaignStatus[]).map(status => <SelectItem key={status} value={status}>{t(status)}</SelectItem>)}</SelectContent></Select></label><label className="text-sm font-medium">{t('owner')}<Select value={form.owner_id || 'none'} onValueChange={value => setForm(current => ({ ...current, owner_id: value === 'none' ? '' : value }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">—</SelectItem>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.full_name}</SelectItem>)}</SelectContent></Select></label>
        <div className="md:col-span-2"><Field label="Website URL" value={form.campaign_url} type="url" onChange={value => setForm(current => ({ ...current, campaign_url: value }))} /></div>
        <Field label="Website title" value={form.website_title} onChange={value => setForm(current => ({ ...current, website_title: value }))} />
        <label className="text-sm font-medium">Preview image
          <div className="mt-1 flex gap-2"><Input readOnly value={form.website_preview_image} placeholder="Upload an image" /><Button type="button" variant="outline" onClick={() => previewImageRef.current?.click()}>Change</Button>{form.website_preview_image && <Button type="button" variant="ghost" onClick={() => setForm(current => ({ ...current, website_preview_image: '' }))}>Remove</Button>}</div>
          <input ref={previewImageRef} className="sr-only" type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) setForm(current => ({ ...current, website_preview_image: URL.createObjectURL(file) })); event.target.value = '' }} />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium md:col-span-2"><input type="checkbox" checked={form.website_embed_enabled} onChange={event => setForm(current => ({ ...current, website_embed_enabled: event.target.checked }))} />Enable embedded preview (falls back to screenshot)</label>
        <label className="text-sm font-medium md:col-span-2">{t('notes')}<Textarea className="mt-1" value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} /></label>
      </div>
      {form.campaign_url && <CampaignUrlPreview url={form.campaign_url} title={form.website_title} previewImage={form.website_preview_image} embedEnabled={form.website_embed_enabled} />}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>{t('cancel')}</Button><Button type="submit" disabled={saving}>{saving ? t('loading') : selected ? t('save') : t('create')}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    {detail && <CampaignDetail open campaign={detail} brands={brands} platforms={platforms} shifts={shifts} reports={reports} users={users} canManage={canEdit} onOpenChange={open => !open && setDetail(null)} onEdit={() => { openForm(detail); setDetail(null) }} />}
    <Dialog open={importOpen} onOpenChange={setImportOpen}><DialogContent size="xl"><DialogHeader><DialogTitle>{t('importPreview')}</DialogTitle><DialogDescription>{t('correctRows')}</DialogDescription></DialogHeader><div className="max-h-96 overflow-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">#</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('dateRange')}</th><th className="p-2">{t('status')}</th></tr></thead><tbody>{importRows.map(row => <tr className="border-b align-top" key={row.row}><td className="p-2">{row.row}</td><td className="p-2">{row.name}</td><td className="p-2">{brands.find(brand => brand.id === row.brand_id)?.name || '—'}</td><td className="p-2">{row.start_date} → {row.end_date}</td><td className="p-2">{row.errors.length ? row.errors.map(error => <p className="text-xs text-red-700" key={error}>{error}</p>) : <Badge className="bg-green-100 text-green-800">{t('confirmed')}</Badge>}</td></tr>)}</tbody></table></div><DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)}>{t('cancel')}</Button><Button onClick={confirmImport} disabled={!importRows.length || importRows.some(row => row.errors.length > 0)}>{t('confirmImport')} ({importRows.length})</Button></DialogFooter></DialogContent></Dialog>
    <LifecycleActionDialog open={Boolean(deleteId)} onOpenChange={open => { if (!open) { setDeleteId(null); setDeleteImpact(null) } }} title="Archive campaign" impact={deleteImpact} confirmText="Archive" onConfirm={archive} />
  </>
}

function CampaignDetail({ open, onOpenChange, campaign, brands, platforms, shifts, reports, users, canManage, onEdit }: { open: boolean; onOpenChange: (open: boolean) => void; campaign: Campaign; brands: Brand[]; platforms: Platform[]; shifts: Shift[]; reports: Report[]; users: User[]; canManage: boolean; onEdit: () => void }) {
  const { t } = useTranslation()
  const relatedShifts = shifts.filter(shift => shift.campaign_id === campaign.id)
  const shiftIds = new Set(relatedShifts.map(shift => shift.id))
  const relatedReports = reports.filter(report => shiftIds.has(report.shift_id))
  const websiteUrl = campaign.website_url || campaign.campaign_url
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><div className="flex items-start justify-between gap-3"><div><DialogTitle className="text-2xl">{campaign.name}</DialogTitle><div className="mt-2 flex gap-2"><Badge>{t(campaign.status || 'draft')}</Badge><Badge variant="outline">{brands.find(brand => brand.id === campaign.brand_id)?.name || '—'}</Badge></div></div>{canManage && <Button onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />{t('edit')}</Button>}</div></DialogHeader><div className="grid gap-4 md:grid-cols-2"><Section title={t('brand')}><p>{brands.find(brand => brand.id === campaign.brand_id)?.name || '—'}</p></Section><Section title={t('dateRange')}><p>{campaign.start_date} → {campaign.end_date}</p></Section><Section title={t('owner')}><p>{users.find(user => user.id === campaign.owner_id)?.full_name || '—'}</p></Section><Section title={t('relatedPlatforms')}><p>{platforms.filter(platform => campaign.platform_ids?.includes(platform.id) || platform.name === campaign.platform_source).map(platform => platform.name).join(', ') || campaign.platform_source || '—'}</p></Section><Section title={t('relatedShifts')}><p>{relatedShifts.length}</p></Section><Section title={t('relatedReports')}><p>{relatedReports.length}</p></Section><Section title={t('confirmedRevenue')}><p>{formatCurrency(relatedReports.filter(report => report.metrics_confirmed).reduce((sum, report) => sum + report.revenue, 0))}</p></Section><Section title="Website"><p className="font-medium">{campaign.website_title || campaign.name}</p><p className="break-all text-sm text-muted-foreground">{websiteUrl || '—'}</p></Section><Section title={t('notes')}><p>{campaign.notes || '—'}</p></Section></div>{websiteUrl && <CampaignUrlPreview url={websiteUrl} title={campaign.website_title || campaign.name} previewImage={campaign.website_preview_image || ''} embedEnabled={Boolean(campaign.website_embed_enabled)} />}</DialogContent></Dialog>
}

function CampaignUrlPreview({ url, title, previewImage, embedEnabled = false }: { url: string; title?: string; previewImage?: string; embedEnabled?: boolean }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const frameRef = React.useRef<HTMLDivElement>(null)
  const timeoutRef = React.useRef<number | null>(null)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    setFailed(false)
    timeoutRef.current = window.setTimeout(() => setFailed(true), 8000)
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    }
  }, [refreshKey, url])
  const clearPreviewTimeout = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }
  let safeUrl: string | null = null
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') safeUrl = parsed.toString()
  } catch {
    safeUrl = null
  }
  const copyUrl = async () => {
    if (!safeUrl) return
    try {
      await navigator.clipboard.writeText(safeUrl)
      toast({ title: t('success'), description: t('copyUrl'), variant: 'success' })
    } catch {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
    }
  }
  const openFullscreen = async () => {
    try {
      await frameRef.current?.requestFullscreen()
    } catch {
      toast({ title: t('error'), description: t('previewUnavailable'), variant: 'destructive' })
    }
  }
  return <div ref={frameRef} className="space-y-3 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">{title || t('embeddedPreview')}</p><p className="text-xs text-muted-foreground">{safeUrl ? safeDomain(safeUrl) : t('previewUnavailable')}</p></div><div className="flex flex-wrap gap-2">{embedEnabled && <Button type="button" variant="outline" size="sm" disabled={!safeUrl} onClick={() => setRefreshKey(key => key + 1)}><RefreshCw className="mr-1 h-4 w-4" />{t('refreshPreview')}</Button>}<Button type="button" variant="outline" size="sm" disabled={!safeUrl} onClick={copyUrl}><Copy className="mr-1 h-4 w-4" />{t('copyUrl')}</Button><Button type="button" variant="outline" size="sm" disabled={!safeUrl} onClick={openFullscreen}><Maximize2 className="mr-1 h-4 w-4" />{t('fullscreenPreview')}</Button>{safeUrl && <Button nativeButton={false} render={<a href={safeUrl} target="_blank" rel="noopener noreferrer" />} variant="outline" size="sm"><ExternalLink className="mr-1 h-4 w-4" />{t('openExternalPage')}</Button>}</div></div>
    {previewImage && (!embedEnabled || failed) && <img src={previewImage} alt={title || 'Website preview'} className="max-h-[420px] w-full rounded border object-contain" />}
    {safeUrl && embedEnabled && !failed ? <><iframe key={`${safeUrl}-${refreshKey}`} title={title || t('embeddedPreview')} src={safeUrl} className="h-80 w-full rounded border bg-white" sandbox="allow-scripts allow-popups allow-forms" referrerPolicy="no-referrer" onLoad={clearPreviewTimeout} onError={() => { clearPreviewTimeout(); setFailed(true) }} /><p className="text-xs text-muted-foreground">{t('iframeFallback')}</p></> : !previewImage && <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-900"><p className="font-medium">{t('previewUnavailable')}</p><p className="mt-1 text-sm">{t('iframeFallback')}</p>{safeUrl && <Button nativeButton={false} render={<a href={safeUrl} target="_blank" rel="noopener noreferrer" />} className="mt-3" size="sm">{t('openExternalPage')}</Button>}</div>}
  </div>
}

function Field({ label, value, onChange, required = false, type = 'text', disabled = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; disabled?: boolean }) { return <label className="text-sm font-medium">{label}<Input className="mt-1" value={value} required={required} disabled={disabled} type={type} onChange={event => onChange(event.target.value)} /></label> }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardContent className="pt-5"><h3 className="mb-2 font-semibold">{title}</h3>{children}</CardContent></Card> }
function normalizeDate(value: unknown) { if (value instanceof Date) return value.toISOString().slice(0, 10); if (typeof value === 'number') { const parsed = XLSX.SSF.parse_date_code(value); return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : '' } return String(value || '').trim() }
function safeWebUrl(value: string): string | null { try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null } catch { return null } }
function safeDomain(value: string): string { try { return new URL(value).hostname } catch { return '' } }
