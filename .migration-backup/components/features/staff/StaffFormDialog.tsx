'use client'

import * as React from 'react'
import { userService } from '@/lib/services/dataService'
import { User, UserRole } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'

interface StaffFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: User | null
  onSuccess: () => void
}

export function StaffFormDialog({ open, onOpenChange, staff, onSuccess }: StaffFormDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState({
    full_name: '',
    email: '',
    phone: '',
    department: '',
    role: 'staff' as UserRole,
    status: 'active' as 'active' | 'inactive',
    avatar_url: '',
  })
  const { toast } = useToast()

  React.useEffect(() => {
    if (staff) {
      setFormData({
        full_name: staff.full_name,
        email: staff.email,
        phone: staff.phone || '',
        department: staff.department || '',
        role: staff.role,
        status: staff.status,
        avatar_url: staff.avatar_url || '',
      })
    } else {
      setFormData({
        full_name: '',
        email: '',
        phone: '',
        department: '',
        role: 'staff',
        status: 'active',
        avatar_url: '',
      })
    }
  }, [staff, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (staff) {
        await userService.update(staff.id, formData)
        toast({ title: 'Success', description: 'Staff member updated successfully', variant: 'success' })
      } else {
        // Generate avatar URL if not provided
        const avatarUrl = formData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.email}`
        await userService.create({
          ...formData,
          avatar_url: avatarUrl,
          join_date: new Date().toISOString().split('T')[0],
        })
        toast({ title: 'Success', description: 'Staff member created successfully', variant: 'success' })
      }
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to save staff member', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{staff ? 'Edit Staff Member' : 'Add New Staff Member'}</DialogTitle>
          <DialogDescription>
            {staff ? 'Update staff member information' : 'Add a new team member to your organization'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name *</label>
              <Input
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email *</label>
              <Input
                required
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1234567890"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Input
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="Live Host"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role *</label>
              <Select value={formData.role} onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="leader">Leader</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status *</label>
              <Select value={formData.status} onValueChange={(value: 'active' | 'inactive') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : staff ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
