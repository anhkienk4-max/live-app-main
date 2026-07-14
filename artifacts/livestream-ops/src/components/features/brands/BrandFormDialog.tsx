

import * as React from 'react'
import { brandService } from '@/lib/services/dataService'
import { Brand } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'

interface BrandFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand: Brand | null
  onSuccess: () => void
}

export function BrandFormDialog({ open, onOpenChange, brand, onSuccess }: BrandFormDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState({
    name: '',
    logo_url: '',
    color: '#2563EB',
  })
  const { toast } = useToast()

  React.useEffect(() => {
    if (brand) {
      setFormData({
        name: brand.name,
        logo_url: brand.logo_url || '',
        color: brand.color || '#2563EB',
      })
    } else {
      setFormData({
        name: '',
        logo_url: '',
        color: '#2563EB',
      })
    }
  }, [brand, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (brand) {
        await brandService.update(brand.id, formData)
        toast({ title: 'Success', description: 'Brand updated successfully', variant: 'default' })
      } else {
        // Generate logo URL if not provided
        const logoUrl = formData.logo_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${formData.name}`
        await brandService.create({ ...formData, logo_url: logoUrl })
        toast({ title: 'Success', description: 'Brand created successfully', variant: 'default' })
      }
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save brand', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? 'Edit Brand' : 'Add New Brand'}</DialogTitle>
          <DialogDescription>
            {brand ? 'Update brand information' : 'Create a new brand for your livestream operations'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Brand Name *</label>
            <Input
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="TechGear Pro"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Brand Color *</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                className="w-12 h-10 rounded border cursor-pointer"
              />
              <Input
                value={formData.color}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                placeholder="#2563EB"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Logo URL (optional)</label>
            <Input
              value={formData.logo_url}
              onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
            <p className="text-xs text-gray-500">Leave empty to auto-generate</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : brand ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}