'use client'

import * as React from 'react'
import { brandService } from '@/lib/services/dataService'
import { Brand } from '@/lib/types/database.types'
import { DataTable, Column } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Pencil, Trash2, LayoutGrid, List } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { BrandFormDialog } from './BrandFormDialog'

export function BrandList() {
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedBrand, setSelectedBrand] = React.useState<Brand | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [viewMode, setViewMode] = React.useState<'grid' | 'table'>('grid')
  const { toast } = useToast()

  const loadBrands = React.useCallback(async () => {
    setLoading(true)
    const data = await brandService.getAll()
    setBrands(data)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    loadBrands()
  }, [loadBrands])

  const handleDelete = async (id: string) => {
    const success = await brandService.delete(id)
    if (success) {
      toast({ title: 'Success', description: 'Brand deleted successfully', variant: 'success' })
      loadBrands()
    } else {
      toast({ title: 'Error', description: 'Failed to delete brand', variant: 'destructive' })
    }
  }

  const handleEdit = (brand: Brand) => {
    setSelectedBrand(brand)
    setIsFormOpen(true)
  }

  const handleCreate = () => {
    setSelectedBrand(null)
    setIsFormOpen(true)
  }

  const columns: Column<Brand>[] = [
    {
      header: 'Brand',
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: row.color || '#2563EB' }}>
            {row.logo_url ? (
              <img src={row.logo_url} alt={row.name} className="w-8 h-8 object-contain" />
            ) : (
              <span className="text-white font-bold text-lg">{row.name[0]}</span>
            )}
          </div>
          <div>
            <p className="font-medium text-gray-900">{row.name}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Color',
      accessor: 'color',
      cell: (value) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border" style={{ backgroundColor: value || '#2563EB' }} />
          <span className="text-sm text-gray-600">{value || '#2563EB'}</span>
        </div>
      )
    },
    {
      header: 'Created',
      accessor: 'created_at',
      cell: (value) => new Date(value).toLocaleDateString()
    },
    {
      header: 'Actions',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(row)}
            data-testid={`edit-brand-${row.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteId(row.id)}
            data-testid={`delete-brand-${row.id}`}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      )
    }
  ]

  if (loading) {
    return <div className="text-center py-12">Loading brands...</div>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Brand Management</h2>
          <p className="text-gray-600 mt-1">Manage brands for your livestream operations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('table')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button onClick={handleCreate} data-testid="add-brand-btn">
            <Plus className="h-4 w-4 mr-2" />
            Add Brand
          </Button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {brands.map((brand) => (
            <Card key={brand.id} className="hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: brand.color || '#2563EB' }}
                  >
                    {brand.logo_url ? (
                      <img src={brand.logo_url} alt={brand.name} className="w-12 h-12 object-contain" />
                    ) : (
                      <span className="text-white font-bold text-2xl">{brand.name[0]}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(brand)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(brand.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold text-lg text-gray-900 mb-2">{brand.name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 rounded border" style={{ backgroundColor: brand.color || '#2563EB' }} />
                  {brand.color || '#2563EB'}
                </div>
              </CardContent>
            </Card>
          ))}
          {brands.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">
              <p className="text-lg font-medium mb-2">No brands yet</p>
              <p className="text-sm">Create your first brand to get started</p>
            </div>
          )}
        </div>
      ) : (
        <DataTable
          data={brands}
          columns={columns}
          searchPlaceholder="Search brands..."
          emptyMessage="No brands found. Add your first brand!"
        />
      )}

      <BrandFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        brand={selectedBrand}
        onSuccess={loadBrands}
      />

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete Brand"
        description="Are you sure you want to delete this brand? This action cannot be undone."
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}