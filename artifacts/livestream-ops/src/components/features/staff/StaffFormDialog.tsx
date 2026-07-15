import * as React from 'react'
import { userService } from '@/lib/services/dataService'
import { User, SystemPermission, OperationalRole } from '@/lib/types/database.types'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'

const OPERATIONAL_ROLES: { value: OperationalRole; label: string; color: string }[] = [
  { value: 'host', label: 'Host', color: 'bg-blue-100 text-blue-700' },
  { value: 'support', label: 'Support', color: 'bg-green-100 text-green-700' },
  { value: 'technical', label: 'Technical', color: 'bg-purple-100 text-purple-700' },
]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: User | null
  onSuccess: () => void
}

export function StaffFormDialog({ open, onOpenChange, staff, onSuccess }: Props) {
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState({
    full_name: '',
    email: '',
    phone: '',
    department: '',
    permission: 'member' as SystemPermission,
    operational_roles: [] as OperationalRole[],
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
        permission: staff.permission,
        operational_roles: staff.operational_roles || [],
        status: staff.status,
        avatar_url: staff.avatar_url || '',
      })
    } else {
      setFormData({
        full_name: '', email: '', phone: '', department: '',
        permission: 'member', operational_roles: [], status: 'active', avatar_url: '',
      })
    }
  }, [staff, open])

  const toggleRole = (role: OperationalRole) => {
    setFormData(prev => ({
      ...prev,
      operational_roles: prev.operational_roles.includes(role)
        ? prev.operational_roles.filter(r => r !== role)
        : [...prev.operational_roles, role],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...formData,
        role: formData.permission,
        avatar_url: formData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.email}`,
        join_date: staff?.join_date || new Date().toISOString().split('T')[0],
      }
      if (staff) {
        await userService.update(staff.id, payload)
        toast({ title: 'Success', description: 'Staff member updated', variant: 'default' })
      } else {
        await userService.create(payload)
        toast({ title: 'Success', description: 'Staff member created', variant: 'default' })
      }
      onSuccess()
      onOpenChange(false)
    } catch {
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

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name *</label>
              <Input required value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })} placeholder="Jane Doe" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email *</label>
              <Input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="jane@example.com" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} placeholder="+84 90 000 0000" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <Input value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} placeholder="Live Host" />
            </div>
          </div>

          {/* System Permission */}
          <div className="space-y-2">
            <label className="text-sm font-medium">System Permission *</label>
            <p className="text-xs text-gray-500">Controls what this person can access and manage in the system.</p>
            <Select value={formData.permission} onValueChange={(v: SystemPermission) => setFormData({ ...formData, permission: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin — full access, system configuration</SelectItem>
                <SelectItem value="leader">Leader — manage shifts, approve swaps, view reports</SelectItem>
                <SelectItem value="member">Member — register for shifts, submit reports</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Operational Roles */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Operational Roles</label>
              <p className="text-xs text-gray-500 mt-0.5">Which shift roles this person can perform. A staff member may have multiple roles.</p>
            </div>
            <div className="flex gap-4">
              {OPERATIONAL_ROLES.map(r => (
                <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={formData.operational_roles.includes(r.value)}
                    onCheckedChange={() => toggleRole(r.value)}
                  />
                  <Badge variant="outline" className={`${r.color} border-0`}>{r.label}</Badge>
                </label>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status *</label>
            <Select value={formData.status} onValueChange={(v: 'active' | 'inactive') => setFormData({ ...formData, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : staff ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
