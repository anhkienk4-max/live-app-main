"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { RegistrationStatus } from "@/lib/types/database.types"

interface RegistrationStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: RegistrationStatus
}

const statusMapping: Record<RegistrationStatus, { variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "success" | "warning" | "danger" | "info" | "live", label: TranslationKey }> = {
  available: { variant: 'outline', label: 'available' },
  pending: { variant: 'warning', label: 'pending' },
  approved: { variant: 'success', label: 'approved' },
  rejected: { variant: 'danger', label: 'rejected' },
  cancelled: { variant: 'secondary', label: 'cancelled' },
  manually_assigned: { variant: 'info', label: 'assignedByManager' },
  removed: { variant: 'secondary', label: 'removed' },
}

export function RegistrationStatusBadge({ status, className, ...props }: RegistrationStatusBadgeProps) {
  const { t } = useTranslation()
  const mapping = statusMapping[status]

  if (!mapping) return null

  return (
    <Badge variant={mapping.variant} className={cn("capitalize", className)} {...props}>
      {t(mapping.label)}
    </Badge>
  )
}
