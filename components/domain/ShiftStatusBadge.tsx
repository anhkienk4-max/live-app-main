"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ShiftStatus } from "@/lib/types/database.types"

interface ShiftStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: ShiftStatus
}

const statusMapping: Record<ShiftStatus, { variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "success" | "warning" | "danger" | "info" | "live", label: TranslationKey }> = {
  scheduled: { variant: 'outline', label: 'scheduled' },
  preparing: { variant: 'info', label: 'preparing' },
  live: { variant: 'live', label: 'liveStatus' },
  paused: { variant: 'warning', label: 'paused' },
  completed: { variant: 'secondary', label: 'completed' },
  cancelled: { variant: 'secondary', label: 'cancelled' },
}

export function ShiftStatusBadge({ status, className, ...props }: ShiftStatusBadgeProps) {
  const { t } = useTranslation()
  const mapping = statusMapping[status]

  if (!mapping) return null

  return (
    <Badge variant={mapping.variant} className={cn("capitalize", className)} {...props}>
      {t(mapping.label)}
    </Badge>
  )
}
