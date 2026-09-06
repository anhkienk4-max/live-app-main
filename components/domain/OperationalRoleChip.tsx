"use client"

import * as React from "react"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Mic, Headphones, Wrench } from "lucide-react"
import type { OperationalRole } from "@/lib/types/database.types"

interface OperationalRoleChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  role: OperationalRole
}

const roleMapping: Record<OperationalRole, { label: TranslationKey, icon: React.ElementType }> = {
  host: { label: 'host', icon: Mic },
  support: { label: 'support', icon: Headphones },
  technical: { label: 'technical', icon: Wrench },
}

export function OperationalRoleChip({ role, className, ...props }: OperationalRoleChipProps) {
  const { t } = useTranslation()
  const mapping = roleMapping[role]

  if (!mapping) return null
  const Icon = mapping.icon

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-foreground border border-border", className)} {...props}>
      <Icon className="h-3 w-3 text-muted-foreground" />
      {t(mapping.label)}
    </span>
  )
}
