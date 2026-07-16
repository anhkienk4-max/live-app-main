'use client'

import * as React from 'react'
import { campaignService, brandService } from '@/lib/services/dataService'
import { Campaign, Brand } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { format } from 'date-fns'

export function CampaignList() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Campaign | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [formData, setFormData] = React.useState({
    name: '',
    brand_id: '',
    start_date: '',
    end_date: '',
    type: '',
    notes: '',
    campaign_url: '',
    platform_source: ''
  })
  const { toast } = useToast()

  const loadData = React.useCallback(async () => {
    const [campaignsData, brandsData] = await Promise.all([
      campaignService.getAll(),
      brandService.getAll()
    ])
    setCampaigns(campaignsData)
    setBrands(brandsData)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const handleDelete = async (id: string) => {
    const success = await campaignService.delete(id)
    if (success) {
      toast({ title: 'Success', description: 'Campaign deleted', variant: 'success' })
      loadData()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (selected) {
        await campaignService.update(selected.id, formData)
        toast({ title: 'Success', description: 'Campaign updated', variant: 'success' })
      } else {
        await campaignService.create(formData)
        toast({ title: 'Success', description: 'Campaign created', variant: 'success' })
      }
      loadData()
      setIsFormOpen(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save campaign', variant: 'destructive' })
    }
  }

  const getBrandName = (brandId: string) => brands.find(b => b.id === brandId)?.name || 'Unknown'

  const columns: Column<Campaign>[] = [
    { header: 'Campaign Name', accessor: 'name', cell: (value) => <span className="font-medium">{value}</span> },
    { header: 'Brand', accessor: 'brand_id', cell: (value) => getBrandName(value) },
    { header: 'Type', accessor: 'type', cell: (value) => value ? <Badge variant="secondary">{value}</Badge> : '—' },
    { 
      header: 'Duration', 
      accessor: (row) => `${format(new Date(row.start_date), 'MMM d')} - ${format(new Date(row.end_date), 'MMM d, yyyy')}` 
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => {
            setSelected(row)
            setFormData({
              name: row.name,
              brand_id: row.brand_id,
              start_date: row.start_date,
              end_date: row.end_date,
              type: row.type || '',
              notes: row.notes || '',
              campaign_url: row.campaign_url || '',
              platform_source: row.platform_source || ''
            })
            setIsFormOpen(true)
          }}>
            <Pencil className="h-4 w-4" />
          </Button>
          {row.campaign_url && <Button asChild variant="ghost" size="icon"><a href={row.campaign_url} target="_blank" rel="noopener noreferrer" aria-label="Open campaign"><ExternalLink className="h-4 w-4" /></a></Button>}
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}>
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      )
    }
  ]

  return (
    <>
      <div className="flex justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Campaign Management</h2>
          <p className="text-gray-600 mt-1">Manage marketing campaigns</p>
        </div>
        <Button onClick={() => {
          setSelected(null)
          setFormData({ name: '', brand_id: '', start_date: '', end_date: '', type: '', notes: '', campaign_url: '', platform_source: '' })
          setIsFormOpen(true)
        }}>
          <Plus className="h-4 w-4 mr-2" /> Add Campaign
        </Button>
      </div>

      {loading ? <div className="text-center py-12">Loading...</div> : (
        <DataTable data={campaigns} columns={columns} searchPlaceholder="Search campaigns..." />
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit' : 'Create'} Campaign</DialogTitle>
            <DialogDescription>Campaign information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Campaign Name *</label>
                <Input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Brand *</label>
                <Select required value={formData.brand_id} onValueChange={(value) => setFormData({ ...formData, brand_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map(brand => (
                      <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input required type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">End Date *</label>
                <Input required type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Campaign Type</label>
                <Input value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })} placeholder="e.g., Seasonal, Product Launch, Flash Sale" />
              </div>
              <div>
                <label className="text-sm font-medium">Platform Source</label>
                <Input value={formData.platform_source} onChange={(e) => setFormData({ ...formData, platform_source: e.target.value })} placeholder="TikTok Shop" />
              </div>
              <div>
                <label className="text-sm font-medium">Campaign URL</label>
                <Input type="url" value={formData.campaign_url} onChange={(e) => setFormData({ ...formData, campaign_url: e.target.value })} placeholder="https://..." />
              </div>
              {formData.campaign_url && <CampaignUrlPreview url={formData.campaign_url} />}
              <div className="col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit">{selected ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Campaign"
        description="Are you sure?"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        variant="destructive"
      />
    </>
  )
}

function CampaignUrlPreview({ url }: { url: string }) {
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => setFailed(false), [url])
  return <div className="col-span-2 rounded-lg border bg-muted/30 p-3 text-sm"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">Campaign URL preview</p><p className="mt-1 text-muted-foreground">Some platforms prevent embedding. The external link remains available as a fallback.</p></div><Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open Campaign</a></Button></div>{!failed && <iframe title="Campaign URL preview" src={url} className="mt-3 h-56 w-full rounded border bg-white" sandbox="allow-scripts allow-same-origin allow-popups" onError={() => setFailed(true)} />}{failed && <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-amber-800">This platform blocked the embedded preview. Open the campaign in a new tab.</p>}</div>
}
