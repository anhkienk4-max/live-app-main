

import * as React from 'react'
import { platformService } from '@/lib/services/dataService'
import { Platform } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'

export function PlatformList() {
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Platform | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [formData, setFormData] = React.useState({ name: '', icon: '' })
  const { toast } = useToast()

  const loadPlatforms = React.useCallback(async () => {
    const data = await platformService.getAll()
    setPlatforms(data)
    setLoading(false)
  }, [])

  React.useEffect(() => { loadPlatforms() }, [loadPlatforms])

  const handleDelete = async (id: string) => {
    const success = await platformService.delete(id)
    if (success) {
      toast({ title: 'Success', description: 'Platform deleted', variant: 'default' })
      loadPlatforms()
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (selected) {
        await platformService.update(selected.id, formData)
        toast({ title: 'Success', description: 'Platform updated', variant: 'default' })
      } else {
        await platformService.create(formData)
        toast({ title: 'Success', description: 'Platform created', variant: 'default' })
      }
      loadPlatforms()
      setIsFormOpen(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save platform', variant: 'destructive' })
    }
  }

  const columns: Column<Platform>[] = [
    { header: 'Platform Name', accessor: 'name' },
    { header: 'Icon', accessor: 'icon' },
    { header: 'Created', accessor: 'created_at', cell: (value) => new Date(value).toLocaleDateString() },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => { setSelected(row); setFormData({ name: row.name, icon: row.icon || '' }); setIsFormOpen(true) }}>
            <Pencil className="h-4 w-4" />
          </Button>
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
          <h2 className="text-2xl font-bold">Platform Management</h2>
          <p className="text-gray-600 mt-1">Manage livestream platforms</p>
        </div>
        <Button onClick={() => { setSelected(null); setFormData({ name: '', icon: '' }); setIsFormOpen(true) }}>
          <Plus className="h-4 w-4 mr-2" /> Add Platform
        </Button>
      </div>

      {loading ? <div className="text-center py-12">Loading...</div> : (
        <DataTable data={platforms} columns={columns} searchPlaceholder="Search platforms..." />
      )}

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit' : 'Add'} Platform</DialogTitle>
            <DialogDescription>Platform information</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name *</label>
              <Input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Icon</label>
              <Input value={formData.icon} onChange={(e) => setFormData({ ...formData, icon: e.target.value })} />
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
        title="Delete Platform"
        description="Are you sure?"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}