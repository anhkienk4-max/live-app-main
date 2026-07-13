'use client'

import { ShiftFormDialog } from './ShiftFormDialog'
import { Brand, Platform, Campaign, User } from '@/lib/types/database.types'

interface ShiftFormModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  onSuccess: () => void
}

export function ShiftFormModal({
  open,
  onOpenChange,
  brands,
  platforms,
  campaigns,
  users,
  onSuccess
}: ShiftFormModalProps) {
  return (
    <ShiftFormDialog
      open={open}
      onOpenChange={onOpenChange}
      shift={null}
      duplicateFrom={null}
      brands={brands}
      platforms={platforms}
      campaigns={campaigns}
      users={users}
      templates={[]}
      onSuccess={onSuccess}
    />
  )
}
