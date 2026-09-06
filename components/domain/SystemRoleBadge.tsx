"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Shield, User, Briefcase } from "lucide-react"
import { useTranslation, type TranslationKey } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { SystemPermission } from "@/lib/types/database.types"

interface SystemRoleBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  role: SystemPermission
}

const roleMapping: Record<SystemPermission, { variant: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link" | "success" | "warning" | "danger" | "info" | "live", label: TranslationKey, icon: React.ElementType }> = {
  admin: { variant: 'default', label: 'admin', icon: Shield },
  leader: { variant: 'secondary', label: 'leader', icon: Briefcase },
  member: { variant: 'secondary', label: 'member', icon: User },
}

export function SystemRoleBadge({ role, className, ...props }: SystemRoleBadgeProps) {
  const { t } = useTranslation()
  const mapping = roleMapping[role]

  if (!mapping) return null
  const Icon = mapping.icon

  return (
    <Badge variant={mapping.variant} className={cn("flex w-fit items-center gap-1", className)} {...props}>
      <Icon className="h-3 w-3" />
      <span>{t(mapping.label)}</span>
    </Badge>
  )
}
