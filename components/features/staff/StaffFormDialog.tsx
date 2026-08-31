'use client'

import * as React from 'react'
import { userService } from '@/lib/services/dataService'
import { User, UserRole, OperationalRole, SystemPermission } from '@/lib/types/database.types'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/components/ui/toast'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'

interface StaffFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: User | null
  onSuccess: () => void
}

interface StaffFormData {
  full_name: string
  email: string
  phone: string
  department: string
  role: UserRole
  system_permission: SystemPermission
  operational_roles: OperationalRole[]
  status: 'active' | 'inactive'
  avatar_url: string
}

export function StaffFormDialog({ open, onOpenChange, staff, onSuccess }: StaffFormDialogProps) {
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState<StaffFormData>({
    full_name: '',
    email: '',
    phone: '',
    department: '',
    role: 'staff' as UserRole,
    system_permission: 'member' as SystemPermission,
    operational_roles: [] as OperationalRole[],
    status: 'active' as 'active' | 'inactive',
    avatar_url: '',
  })
  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const isSelf = Boolean(staff && currentUser?.id === staff.id)

  React.useEffect(() => {
    const nextFormData: StaffFormData = staff ? {
        full_name: staff.full_name,
        email: staff.email,
        phone: staff.phone || '',
        department: staff.department || '',
        role: staff.role,
        system_permission: staff.system_permission || (staff.role === 'staff' ? 'member' : staff.role),
        operational_roles: staff.operational_roles || [],
        status: staff.status,
        avatar_url: staff.avatar_url || '',
      } : {
        full_name: '',
        email: '',
        phone: '',
        department: '',
        role: 'staff',
        system_permission: 'member',
        operational_roles: [],
        status: 'active',
        avatar_url: '',
      }
    const frame = window.requestAnimationFrame(() => setFormData(nextFormData))
    return () => window.cancelAnimationFrame(frame)
  }, [staff, open])

  const toggleOperationalRole = (role: OperationalRole) => {
    setFormData(current => ({
      ...current,
      operational_roles: current.operational_roles.includes(role)
        ? current.operational_roles.filter(item => item !== role)
        : [...current.operational_roles, role],
    }))
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!currentUser || !hasPermission(currentUser, 'staff.manage')) {
      toast({ title: t('error'), description: t('permissionDenied'), variant: 'destructive' })
      return
    }
    try {
      const normalizedEmail = formData.email.trim().toLowerCase()
      const existing = await userService.getAll()
      if (!formData.full_name.trim() || !normalizedEmail || existing.some(user => user.id !== staff?.id && user.email.toLowerCase() === normalizedEmail)) {
        toast({ title: t('error'), description: t('validationError'), variant: 'destructive' })
        return
      }
      setLoading(true)
      const payload = { ...formData, full_name: formData.full_name.trim(), email: normalizedEmail }
      if (staff) {
        await userService.update(staff.id, isSelf ? {
          full_name: payload.full_name,
          phone: payload.phone,
          department: payload.department,
          avatar_url: payload.avatar_url,
        } : payload)
        toast({ title: t('success'), description: t('staffUpdated'), variant: 'success' })
      } else {
        // Generate avatar URL if not provided
        const avatarUrl = formData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${normalizedEmail}`
        await userService.create({
          ...payload,
          avatar_url: avatarUrl,
          join_date: new Date().toISOString().split('T')[0],
        })
        toast({ title: t('success'), description: t('staffCreated'), variant: 'success' })
      }
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? `${t('staffSaveFailed')} (${error.message})`
        : t('staffSaveFailed')
      console.error('Staff save failed', error)
      toast({ title: t('error'), description: message, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{staff ? t('editStaff') : t('addNewStaff')}</DialogTitle>
          <DialogDescription>
            {staff ? t('updateStaffInfo') : t('addStaffInfo')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('fullName')} *</label>
              <Input
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('email')} *</label>
              <Input
                required
                type="email"
                disabled={isSelf}
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="john@example.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('phone')}</label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1234567890"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('department')}</label>
              <Input
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="Live Host"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('systemPermissions')} *</label>
              <Select disabled={isSelf} value={formData.system_permission} onValueChange={(value: SystemPermission) => setFormData({ ...formData, system_permission: value, role: value === 'member' ? 'staff' : value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{t('memberSettings')}</SelectItem>
                  <SelectItem value="leader">{t('leaderSettings')}</SelectItem>
                  <SelectItem value="admin">{t('adminSettings')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('status')} *</label>
              <Select disabled={isSelf} value={formData.status} onValueChange={(value: 'active' | 'inactive') => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('active')}</SelectItem>
                  <SelectItem value="inactive">{t('inactive')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('operationalRoles')}</label>
            <div className="flex flex-wrap gap-4 rounded-lg border p-3">
              {(['host', 'support', 'technical'] as OperationalRole[]).map(role => (
                <label key={role} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox checked={formData.operational_roles.includes(role)} onCheckedChange={() => toggleOperationalRole(role)} />
                  {t(role)}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('loading') : staff ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
