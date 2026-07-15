import * as React from 'react'
import { campaignService, brandService } from '@/lib/services/dataService'
import { Campaign, Brand } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, Upload, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { format } from 'date-fns'

const emptyForm = () => ({
  name: '',
  brand_id: '',
  start_date: '',
  end_date: '',
  type: '',
  notes: '',
  campaign_url: '',
  imported_from: 'manual' as Campaign['imported_from'],
})

export function CampaignList() {
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Campaign | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [formData, setFormData] = React.useState(emptyForm())
  const [importLoading, setImportLoading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  const loadData = React.useCallback(async () => {
    const [cData, bData] = await Promise.all([campaignService.getAll(), brandService.getAll()])
    setCampaigns(cData)
    setBrands(bData)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  const getBrandName = (id: string) => brands.find(b => b.id === id)?.name || 'Unknown'

  const openEdit = (c: Campaign) => {
    setSelected(c)
    setFormData({
      name: c.name,
      brand_id: c.brand_id,
      start_date: c.start_date,
      end_date: c.end_date,
      type: c.type || '',
      notes: c.notes || '',
      campaign_url: c.campaign_url || '',
      imported_from: c.imported_from || 'manual',
    })
    setIsFormOpen(true)
  }

  const openCreate = () => {
    setSelected(null)
    setFormData(emptyForm())
    setIsFormOpen(true)
  }

  const handleDelete = async (id: string) => {
    await campaignService.delete(id)
    toast({ title: 'Success', description: 'Campaign deleted', variant: 'default' })
    loadData()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (selected) {
        await campaignService.update(selected.id, formData)
        toast({ title: 'Success', description: 'Campaign updated', variant: 'default' })
      } else {
        await campaignService.create(formData)
        toast({ title: 'Success', description: 'Campaign created', variant: 'default' })
      }
      loadData()
      setIsFormOpen(false)
    } catch {
      toast({ title: 'Error', description: 'Failed to save campaign', variant: 'destructive' })
    }
  }

  /** Parse an Excel/CSV file and bulk-import campaigns */
  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

      // Expected columns: name, brand_id or brand_name, start_date, end_date, type, notes, campaign_url
      const mapped = rows.map((r: any): Omit<Campaign, 'id' | 'created_at' | 'updated_at'> => ({
        name: String(r.name || r.Name || ''),
        brand_id: String(r.brand_id || brands.find(b => b.name === (r.brand_name || r.Brand))?.id || ''),
        start_date: String(r.start_date || r['Start Date'] || ''),
        end_date: String(r.end_date || r['End Date'] || ''),
        type: String(r.type || r.Type || ''),
        notes: String(r.notes || r.Notes || ''),
        campaign_url: String(r.campaign_url || r.URL || ''),
        imported_from: 'excel',
      })).filter(r => r.name && r.brand_id)

      if (!mapped.length) {
        toast({ title: 'No Data', description: 'No valid rows found. Check column names.', variant: 'destructive' })
        return
      }

      await campaignService.importBulk(mapped)
      toast({ title: 'Imported', description: `${mapped.length} campaigns imported from Excel`, variant: 'default' })
      loadData()
    } catch (err) {
      toast({ title: 'Import Failed', description: String(err), variant: 'destructive' })
    } finally {
      setImportLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const IMPORT_COLOR: Record<string, string> = {
    manual: 'bg-gray-100 text-gray-700',
    excel: 'bg-green-100 text-green-700',
    api: 'bg-blue-100 text-blue-700',
  }

  const columns: Column<Campaign>[] = [
    {
      header: 'Campaign',
      accessor: (row) => (
        <div>
          <p className="font-medium text-gray-900">{row.name}</p>
          {row.campaign_url && (
            <a href={row.campaign_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5"
              onClick={e => e.stopPropagation()}>
              <ExternalLink className="h-3 w-3" /> {row.campaign_url}
            </a>
          )}
        </div>
      ),
    },
    { header: 'Brand', accessor: 'brand_id', cell: value => getBrandName(value) },
    { header: 'Type', accessor: 'type', cell: value => value ? <Badge variant="secondary">{value}</Badge> : '—' },
    {
      header: 'Duration',
      accessor: (row) => `${format(new Date(row.start_date), 'MMM d')} – ${format(new Date(row.end_date), 'MMM d, yyyy')}`,
    },
    {
      header: 'Source',
      accessor: 'imported_from',
      cell: value => (
        <Badge variant="outline" className={`${IMPORT_COLOR[value ?? 'manual']} border-0 text-xs capitalize`}>
          {value || 'manual'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setDeleteId(row.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="flex justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Campaign Management</h2>
          <p className="text-gray-600 mt-1">Manage marketing campaigns — create manually or import from Excel</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleExcelImport} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
            <Upload className="h-4 w-4 mr-2" />
            {importLoading ? 'Importing…' : 'Import Excel'}
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Add Campaign
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading…</div>
      ) : (
        <DataTable data={campaigns} columns={columns} searchPlaceholder="Search campaigns…" />
      )}

      {/* Columns hint for Excel import */}
      <p className="text-xs text-gray-400 mt-2">
        Excel import expects columns: <code>name, brand_id, start_date (yyyy-mm-dd), end_date, type, notes, campaign_url</code>
      </p>

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
                <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Brand *</label>
                <Select value={formData.brand_id} onValueChange={v => setFormData({ ...formData, brand_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Start Date *</label>
                <Input required type="date" value={formData.start_date} onChange={e => setFormData({ ...formData, start_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">End Date *</label>
                <Input required type="date" value={formData.end_date} onChange={e => setFormData({ ...formData, end_date: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium">Campaign Type</label>
                <Input value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} placeholder="Seasonal, Product Launch, Flash Sale…" />
              </div>
              <div>
                <label className="text-sm font-medium">Campaign URL</label>
                <Input type="url" value={formData.campaign_url} onChange={e => setFormData({ ...formData, campaign_url: e.target.value })} placeholder="https://…" />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} rows={3} />
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
        onOpenChange={open => !open && setDeleteId(null)}
        title="Delete Campaign"
        description="Are you sure you want to delete this campaign?"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}
