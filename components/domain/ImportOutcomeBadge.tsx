"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ScheduleImportRowOutcome } from "@/lib/types/database.types"

interface ImportOutcomeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: ScheduleImportRowOutcome
  label?: React.ReactNode
}

const statusMapping: Record<ScheduleImportRowOutcome, { variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "success" | "warning" | "danger" | "info" | "live", labelKey: TranslationKey }> = {
  pending: { variant: 'outline', labelKey: 'pending' },
  imported: { variant: 'success', labelKey: 'importedResult' },
  warning: { variant: 'warning', labelKey: 'importStatusWarning' },
  validation_failed: { variant: 'danger', labelKey: 'importValidationFailed' },
  duplicate_skipped: { variant: 'secondary', labelKey: 'importDuplicateSkipped' },
  retryable: { variant: 'warning', labelKey: 'importStatusRetryable' }
}

export function ImportOutcomeBadge({ status, label, className, ...props }: ImportOutcomeBadgeProps) {
  const { t } = useTranslation()
  const mapping = statusMapping[status]
  
  if (!mapping) return null
  
  return (
    <Badge variant={mapping.variant} className={cn("capitalize", className)} {...props}>
      {label || t(mapping.labelKey)}
    </Badge>
  )
}
