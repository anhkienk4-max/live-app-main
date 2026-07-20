'use client'

import * as React from 'react'
import { Eye, LayoutGrid, List, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { brandService, campaignService, platformService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, Platform, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Column, DataTable } from '@/components/ui/data-table'
import { useToast } from '@/components/ui/toast'
import { BrandDetailDialog } from './BrandDetailDialog'
import { BrandFormDialog } from './BrandFormDialog'

export function BrandList() {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedBrand, setSelectedBrand] = React.useState<Brand | null>(null)
  const [detailBrand, setDetailBrand] = React.useState<Brand | null>(null)
  const [statusTarget, setStatusTarget] = React.useState<Brand | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [viewMode, setViewMode] = React.useState<'grid' | 'table'>('grid')

  const loadData = React.useCallback(async () => {
    const [loadedBrands, loadedCampaigns, loadedPlatforms, loadedUsers] = await Promise.all([
      brandService.getAll(), campaignService.getAll(), platformService.getAll(), userService.getAll(),
    ])
    setBrands(loadedBrands); setCampaigns(loadedCampaigns); setPlatforms(loadedPlatforms); setUsers(loadedUsers); setLoading(false)
  }, [])
  React.useEffect(() => { void loadData() }, [loadData])
  const canManage = Boolean(currentUser && hasPermission(currentUser, 'brands.manage'))
  const edit = (brand: Brand) => { setSelectedBrand(brand); setFormOpen(true) }
  const toggleStatus = async () => {
    if (!statusTarget) return
    if (!canManage) return
    const status = statusTarget.status === 'inactive' ? 'active' : 'inactive'
    await brandService.update(statusTarget.id, { status })
    toast({ title: t('success'), description: t(status === 'active' ? 'activate' : 'deactivate'), variant: 'success' })
    setStatusTarget(null)
    await loadData()
  }
  const actions = (brand: Brand) => <div className="flex gap-1"><Button variant="ghost" size="icon" aria-label={t('viewDetails')} onClick={() => setDetailBrand(brand)}><Eye className="h-4 w-4" /></Button>{canManage && <><Button variant="ghost" size="icon" aria-label={t('edit')} onClick={() => edit(brand)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" aria-label={t(brand.status === 'inactive' ? 'activate' : 'deactivate')} onClick={() => setStatusTarget(brand)}>{brand.status === 'inactive' ? <Power className="h-4 w-4 text-green-600" /> : <PowerOff className="h-4 w-4 text-amber-600" />}</Button></>}</div>
  const columns: Column<Brand>[] = [
    { header: t('brand'), accessor: row => <div className="flex items-center gap-3">{row.logo_url ? <img src={row.logo_url} alt={row.name} className="h-10 w-10 rounded border object-contain" /> : <div className="h-10 w-10 rounded" style={{ backgroundColor: row.color }} />}<div><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.category || '—'}</p></div></div> },
    { header: t('status'), accessor: row => t(row.status || 'active') },
    { header: t('lastUpdated'), accessor: row => new Date(row.updated_at).toLocaleDateString() },
    { header: t('actions'), accessor: actions },
  ]

  if (loading) return <div className="py-12 text-center">{t('loading')}</div>
  return <>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold">{t('brandKnowledge')}</h2><p className="mt-1 text-muted-foreground">{t('description')}</p></div><div className="flex gap-2"><div className="flex rounded-lg border"><Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}><LayoutGrid className="h-4 w-4" /></Button><Button variant={viewMode === 'table' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('table')}><List className="h-4 w-4" /></Button></div>{canManage && <Button onClick={() => { setSelectedBrand(null); setFormOpen(true) }}><Plus className="mr-2 h-4 w-4" />{t('create')} {t('brand')}</Button>}</div></div>
    {viewMode === 'table' ? <DataTable data={brands} columns={columns} searchPlaceholder={`${t('search')} ${t('brands')}`} /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{brands.map(brand => <Card key={brand.id}><CardContent className="space-y-4 pt-5"><div className="flex items-start justify-between">{brand.logo_url ? <img src={brand.logo_url} alt={brand.name} className="h-16 w-16 rounded-lg border object-contain" /> : <div className="h-16 w-16 rounded-lg" style={{ backgroundColor: brand.color }} />}{actions(brand)}</div><div><h3 className="text-lg font-semibold">{brand.name}</h3><p className="text-sm text-muted-foreground">{brand.category || '—'} · {t(brand.status || 'active')}</p></div><p className="line-clamp-3 text-sm">{brand.description || '—'}</p><Button className="w-full" variant="outline" onClick={() => setDetailBrand(brand)}>{t('viewDetails')}</Button></CardContent></Card>)}</div>}
    <BrandFormDialog open={formOpen} onOpenChange={setFormOpen} brand={selectedBrand} onSuccess={loadData} />
    {detailBrand && <BrandDetailDialog open brand={detailBrand} campaigns={campaigns} platforms={platforms} users={users} onOpenChange={open => !open && setDetailBrand(null)} onEdit={() => { edit(detailBrand); setDetailBrand(null) }} />}
    <AlertDialog open={Boolean(statusTarget)} onOpenChange={open => !open && setStatusTarget(null)} title={`${t(statusTarget?.status === 'inactive' ? 'activate' : 'deactivate')} ${t('brand')}`} description={statusTarget?.name || ''} onConfirm={toggleStatus} confirmText={t(statusTarget?.status === 'inactive' ? 'activate' : 'deactivate')} variant={statusTarget?.status === 'inactive' ? 'default' : 'destructive'} />
  </>
}
