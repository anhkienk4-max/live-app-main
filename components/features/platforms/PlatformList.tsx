'use client'

import * as React from 'react'
import { ExternalLink, Eye, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { brandService, campaignService, currentUserService, platformService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, KnowledgeStatus, Platform, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Column, DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { PageLoadError } from '@/components/ui/page-load-error'

const list = (value?: string[]) => value?.join('\n') || ''
const toList = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const formFor = (platform?: Platform | null) => ({
  name: platform?.name || '',
  icon: platform?.icon || '',
  logo_url: platform?.logo_url || '',
  platform_type: platform?.platform_type || '',
  platform_url: platform?.platform_url || '',
  status: platform?.status || 'active' as KnowledgeStatus,
  account_information: platform?.account_information || '',
  policy_notes: platform?.policy_notes || '',
  livestream_rules: list(platform?.livestream_rules),
  content_restrictions: list(platform?.content_restrictions),
  technical_requirements: list(platform?.technical_requirements),
  report_requirements: list(platform?.report_requirements),
  external_links: list(platform?.external_links),
})

export function PlatformList() {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [selected, setSelected] = React.useState<Platform | null>(null)
  const [detail, setDetail] = React.useState<Platform | null>(null)
  const [statusTarget, setStatusTarget] = React.useState<Platform | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState(formFor())
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [saving, setSaving] = React.useState(false)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedPlatforms, loadedCampaigns, loadedBrands, loadedUsers] = await Promise.all([platformService.getAll(), campaignService.getAll(), brandService.getAll(), userService.getAll()])
      setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setBrands(loadedBrands); setUsers(loadedUsers)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])
  React.useEffect(() => { void loadData() }, [loadData])
  const canManage = Boolean(currentUser && hasPermission(currentUser, 'platforms.manage'))
  const openForm = (platform?: Platform | null) => { setSelected(platform || null); setForm(formFor(platform)); setFormOpen(true) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canManage) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    if (!form.name.trim() || /(?:password|token|cookie|secret|api[_ -]?key)\s*[:=]/i.test(form.account_information)) {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
      return
    }
    const data = {
      ...form,
      name: form.name.trim(),
      logo_url: form.logo_url || undefined,
      livestream_rules: toList(form.livestream_rules),
      content_restrictions: toList(form.content_restrictions),
      technical_requirements: toList(form.technical_requirements),
      report_requirements: toList(form.report_requirements),
      external_links: toList(form.external_links),
      updated_by: currentUserService.getId(),
    }
    setSaving(true)
    try {
      if (selected) await platformService.update(selected.id, data)
      else await platformService.create(data)
      toast({ title: t('success'), description: t('save'), variant: 'success' })
      setFormOpen(false)
      await loadData()
    } catch {
      toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }
  const toggleStatus = async () => {
    if (!canManage || !statusTarget) return
    await platformService.update(statusTarget.id, { status: statusTarget.status === 'inactive' ? 'active' : 'inactive' })
    setStatusTarget(null)
    await loadData()
  }
  const columns: Column<Platform>[] = [
    { header: t('platform'), accessor: row => <div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.platform_type || '—'}</p></div> },
    { header: t('status'), accessor: row => t(row.status || 'active') },
    { header: t('platformUrl'), accessor: row => row.platform_url || '—' },
    { header: t('actions'), accessor: row => <Actions platform={row} canManage={canManage} onView={() => setDetail(row)} onEdit={() => openForm(row)} onToggle={() => setStatusTarget(row)} /> },
  ]

  if (loading) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">{t('platformKnowledge')}</h2><p className="mt-1 text-muted-foreground">{t('credentialsSafe')}</p></div>{canManage && <Button onClick={() => openForm()}><Plus className="mr-2 h-4 w-4" />{t('create')} {t('platform')}</Button>}</div>
    <DataTable data={platforms} columns={columns} searchPlaceholder={`${t('search')} ${t('platforms')}`} />

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><DialogTitle>{selected ? t('edit') : t('create')} {t('platform')}</DialogTitle><DialogDescription>{t('credentialsSafe')}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3"><Field label={`${t('platform')} *`} value={form.name} required onChange={value => setForm(current => ({ ...current, name: value }))} /><Field label={t('icon')} value={form.icon} onChange={value => setForm(current => ({ ...current, icon: value }))} /><Field label={t('logoUrl')} value={form.logo_url} onChange={value => setForm(current => ({ ...current, logo_url: value }))} /><Field label={t('platformType')} value={form.platform_type} onChange={value => setForm(current => ({ ...current, platform_type: value }))} /><Field label={t('platformUrl')} value={form.platform_url} type="url" onChange={value => setForm(current => ({ ...current, platform_url: value }))} /><label className="text-sm font-medium">{t('status')}<Select value={form.status} onValueChange={value => setForm(current => ({ ...current, status: value as KnowledgeStatus }))}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent>{(['active','inactive','draft'] as KnowledgeStatus[]).map(status => <SelectItem key={status} value={status}>{t(status)}</SelectItem>)}</SelectContent></Select></label></div>
      <div className="grid gap-4 md:grid-cols-2"><Area label={t('accountInformation')} value={form.account_information} onChange={value => setForm(current => ({ ...current, account_information: value }))} /><Area label={t('policyNotes')} value={form.policy_notes} onChange={value => setForm(current => ({ ...current, policy_notes: value }))} /><Area label={`${t('livestreamRules')} · ${t('onePerLine')}`} value={form.livestream_rules} onChange={value => setForm(current => ({ ...current, livestream_rules: value }))} /><Area label={`${t('contentRestrictions')} · ${t('onePerLine')}`} value={form.content_restrictions} onChange={value => setForm(current => ({ ...current, content_restrictions: value }))} /><Area label={`${t('technicalRequirements')} · ${t('onePerLine')}`} value={form.technical_requirements} onChange={value => setForm(current => ({ ...current, technical_requirements: value }))} /><Area label={`${t('reportRequirements')} · ${t('onePerLine')}`} value={form.report_requirements} onChange={value => setForm(current => ({ ...current, report_requirements: value }))} /><Area label={`${t('externalLinks')} · ${t('onePerLine')}`} value={form.external_links} onChange={value => setForm(current => ({ ...current, external_links: value }))} /></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>{t('cancel')}</Button><Button type="submit" disabled={saving}>{saving ? t('loading') : t('save')}</Button></DialogFooter>
    </form></DialogContent></Dialog>

    {detail && <PlatformDetail open platform={detail} campaigns={campaigns} brands={brands} users={users} canManage={canManage} onOpenChange={open => !open && setDetail(null)} onEdit={() => { openForm(detail); setDetail(null) }} />}
    <AlertDialog open={Boolean(statusTarget)} onOpenChange={open => !open && setStatusTarget(null)} title={`${t(statusTarget?.status === 'inactive' ? 'activate' : 'deactivate')} ${t('platform')}`} description={statusTarget?.name || ''} onConfirm={toggleStatus} confirmText={t(statusTarget?.status === 'inactive' ? 'activate' : 'deactivate')} variant={statusTarget?.status === 'inactive' ? 'default' : 'destructive'} />
  </>
}

function PlatformDetail({ open, onOpenChange, platform, campaigns, brands, users, canManage, onEdit }: { open: boolean; onOpenChange: (open: boolean) => void; platform: Platform; campaigns: Campaign[]; brands: Brand[]; users: User[]; canManage: boolean; onEdit: () => void }) {
  const { t } = useTranslation()
  const relatedCampaigns = campaigns.filter(campaign => campaign.platform_ids?.includes(platform.id) || campaign.platform_source === platform.name)
  const brandIds = new Set(relatedCampaigns.map(campaign => campaign.brand_id))
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent size="xl" className="overflow-y-auto"><DialogHeader><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3">{platform.logo_url ? <img src={platform.logo_url} alt={platform.name} className="h-14 w-14 rounded-lg border object-contain" /> : platform.icon ? <div className="flex h-14 w-14 items-center justify-center rounded-lg border text-2xl">{platform.icon}</div> : null}<div><DialogTitle className="text-2xl">{platform.name}</DialogTitle><div className="mt-2 flex gap-2"><Badge>{t(platform.status || 'active')}</Badge><Badge variant="outline">{platform.platform_type || '—'}</Badge></div></div></div>{canManage && <Button onClick={onEdit}><Pencil className="mr-2 h-4 w-4" />{t('edit')}</Button>}</div></DialogHeader><div className="grid gap-4 md:grid-cols-2">
    <Section title={t('platformUrl')}>{platform.platform_url ? <Button nativeButton={false} render={<a href={platform.platform_url} target="_blank" rel="noopener noreferrer" />} variant="link" className="h-auto p-0"><ExternalLink className="mr-1 h-3 w-3" />{platform.platform_url}</Button> : <p>—</p>}</Section>
    <Section title={t('accountInformation')}><p>{platform.account_information || '—'}</p><p className="mt-2 text-xs text-muted-foreground">{t('credentialsSafe')}</p></Section>
    <Section title={t('policyNotes')}><p>{platform.policy_notes || '—'}</p></Section>
    <ListSection title={t('livestreamRules')} items={platform.livestream_rules} /><ListSection title={t('contentRestrictions')} items={platform.content_restrictions} /><ListSection title={t('technicalRequirements')} items={platform.technical_requirements} /><ListSection title={t('reportRequirements')} items={platform.report_requirements} /><ListSection title={t('relatedCampaigns')} items={relatedCampaigns.map(campaign => campaign.name)} /><ListSection title={t('relatedBrands')} items={brands.filter(brand => brandIds.has(brand.id)).map(brand => brand.name)} />
    <Section title={t('externalLinks')}>{platform.external_links?.length ? platform.external_links.map(link => <Button key={link} nativeButton={false} render={<a href={link} target="_blank" rel="noopener noreferrer" />} variant="link" className="h-auto justify-start p-0"><ExternalLink className="mr-1 h-3 w-3" />{link}</Button>) : <p>—</p>}</Section>
    <Section title={t('lastUpdated')}><p>{new Date(platform.updated_at).toLocaleString()}</p><p>{t('updatedBy')}: {users.find(user => user.id === platform.updated_by)?.full_name || platform.updated_by || '—'}</p></Section>
  </div></DialogContent></Dialog>
}

function Actions({ platform, canManage, onView, onEdit, onToggle }: { platform: Platform; canManage: boolean; onView: () => void; onEdit: () => void; onToggle: () => void }) { const { t } = useTranslation(); return <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={`${t('viewDetails')} ${platform.name}`} onClick={onView}><Eye className="h-4 w-4" /></Button>{canManage && <><Button variant="ghost" size="icon" aria-label={t('edit')} onClick={onEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={t(platform.status === 'inactive' ? 'activate' : 'deactivate')} onClick={onToggle}>{platform.status === 'inactive' ? <Power className="h-4 w-4 text-green-600" /> : <PowerOff className="h-4 w-4 text-amber-600" />}</Button></>}</div> }
function Field({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) { return <label className="text-sm font-medium">{label}<Input className="mt-1" value={value} required={required} type={type} onChange={event => onChange(event.target.value)} /></label> }
function Area({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-medium">{label}<Textarea className="mt-1" rows={3} value={value} onChange={event => onChange(event.target.value)} /></label> }
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <Card><CardContent className="space-y-1 pt-5"><h3 className="mb-2 font-semibold">{title}</h3>{children}</CardContent></Card> }
function ListSection({ title, items }: { title: string; items?: string[] }) { return <Section title={title}>{items?.length ? <ul className="list-disc space-y-1 pl-5">{items.map(item => <li key={item}>{item}</li>)}</ul> : <p>—</p>}</Section> }
