'use client'

/**
 * E5 - Exception-First UX shared primitives
 *
 * Small, reusable components for surfacing operational attention.
 *
 * Severity styling:
 *   critical  -> danger  (actual failure/error)
 *   warning   -> warning (pending decision / risk)
 *   attention -> warning (upcoming risk / retryable)
 *   info      -> info    (informational / waiting)
 *   success   -> success (healthy) -- used sparingly
 *
 * Accessibility:
 *   - Severity conveyed via icon + label text, NOT color alone.
 *   - alert role used for critical/warning items.
 *   - Minimal aria-live usage -- only on dynamic exception counts.
 */

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, XCircle, Clock, Info, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AttentionSeverity, OperationalAttention } from '@/lib/ui/operational-attention'

// ---------------------------------------------------------------------------
// Severity configuration
// ---------------------------------------------------------------------------

type SeverityConfig = {
  icon: React.ReactNode
  containerClass: string
  labelClass: string
  badgeVariant: 'destructive' | 'secondary' | 'danger' | 'warning' | 'info' | 'success'
  badgeClass: string
  ariaRole: 'alert' | 'status' | undefined
}

function getSeverityConfig(severity: AttentionSeverity): SeverityConfig {
  switch (severity) {
    case 'critical':
      return {
        icon: <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />,
        containerClass: 'border-danger/20 bg-danger-surface',
        labelClass: 'text-danger-foreground',
        badgeVariant: 'danger',
        badgeClass: '',
        ariaRole: 'alert',
      }
    case 'warning':
      return {
        icon: <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />,
        containerClass: 'border-warning/20 bg-warning-surface',
        labelClass: 'text-warning-foreground',
        badgeVariant: 'warning',
        badgeClass: '',
        ariaRole: 'alert',
      }
    case 'attention':
      return {
        icon: <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />,
        containerClass: 'border-warning/15 bg-warning-surface',
        labelClass: 'text-warning-foreground',
        badgeVariant: 'warning',
        badgeClass: '',
        ariaRole: undefined,
      }
    case 'info':
      return {
        icon: <Info className="h-4 w-4 shrink-0" aria-hidden="true" />,
        containerClass: 'border-info/20 bg-info-surface',
        labelClass: 'text-info-foreground',
        badgeVariant: 'info',
        badgeClass: '',
        ariaRole: 'status',
      }
    case 'success':
    default:
      return {
        icon: <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />,
        containerClass: 'border-success/20 bg-success-surface',
        labelClass: 'text-success-foreground',
        badgeVariant: 'success',
        badgeClass: '',
        ariaRole: 'status',
      }
  }
}

import { useTranslation, type TranslationKey } from '@/lib/i18n'

// ---------------------------------------------------------------------------
// AttentionItem - single row for one operational attention entry
// ---------------------------------------------------------------------------

interface AttentionItemProps {
  item: OperationalAttention
  className?: string
}

export function AttentionItem({ item, className }: AttentionItemProps) {
  const { t } = useTranslation()
  const config = getSeverityConfig(item.severity)

  const content = (
    <div className={cn('flex items-start gap-3 rounded-md border px-3 py-2.5', config.containerClass, className)}>
      <span className={cn('mt-0.5', config.labelClass)} aria-hidden="true">
        {config.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium leading-tight whitespace-normal break-words', config.labelClass)}>
          {t(item.label as TranslationKey, item.labelParams as Record<string, string | number>)}
          {item.count !== undefined && (
            <Badge className={cn('ml-2 text-[10px] py-0 px-1.5', config.badgeClass)} variant={config.badgeVariant}>
              {item.count}
            </Badge>
          )}
        </p>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-snug whitespace-normal break-words">
            {t(item.description as TranslationKey, item.descriptionParams as Record<string, string | number>)}
          </p>
        )}
      </div>
    </div>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        role={config.ariaRole}
      >
        {content}
      </Link>
    )
  }

  return <div role={config.ariaRole}>{content}</div>
}

// ---------------------------------------------------------------------------
// AttentionBanner - compact strip for high-urgency items (critical/warning)
// ---------------------------------------------------------------------------

interface AttentionBannerProps {
  item: OperationalAttention
  actionLabel?: string
  className?: string
}

export function AttentionBanner({ item, actionLabel, className }: AttentionBannerProps) {
  const { t } = useTranslation()
  const config = getSeverityConfig(item.severity)

  const translateParams = (params?: Record<string, string | number | string[]>) => {
    if (!params) return undefined
    const newParams: Record<string, string | number> = {}
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        newParams[key] = value.map(v => t(v as TranslationKey)).join(', ')
      } else {
        newParams[key] = value
      }
    }
    return newParams
  }

  const labelParams = translateParams(item.labelParams)
  const descriptionParams = translateParams(item.descriptionParams)

  return (
    <div
      className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border px-4 py-3 items-start', config.containerClass, className)}
      role={config.ariaRole}
    >
      <div className="flex items-start sm:items-center gap-2 min-w-0">
        <span className={cn('shrink-0', config.labelClass)}>{config.icon}</span>
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold leading-tight whitespace-normal break-words', config.labelClass)}>
            {t(item.label as TranslationKey, labelParams)}
            {item.count !== undefined && (
              <Badge className={cn('ml-2 text-[10px] py-0 px-1.5', config.badgeClass)} variant={config.badgeVariant}>
                {item.count}
              </Badge>
            )}
          </p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 whitespace-normal break-words">
              {t(item.description as TranslationKey, descriptionParams)}
            </p>
          )}
        </div>
      </div>
      {item.href && actionLabel && (
        <Button
          size="sm"
          variant="outline"
          render={<Link href={item.href} />}
          nativeButton={false}
          className={cn('shrink-0 h-8 text-xs', config.labelClass, 'border-current/30 hover:bg-current/5')}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// OperationalStatusStrip - list of attention items stacked vertically
// ---------------------------------------------------------------------------

interface OperationalStatusStripProps {
  items: OperationalAttention[]
  /** Max items to show (overflow collapsed). Default: all */
  maxVisible?: number
  className?: string
  /** If true, renders only banners (compact). Default: false (items) */
  compact?: boolean
}

export function OperationalStatusStrip({
  items,
  maxVisible,
  className,
  compact = false,
}: OperationalStatusStripProps) {
  const { t } = useTranslation()
  const visible = maxVisible !== undefined ? items.slice(0, maxVisible) : items

  if (visible.length === 0) return null

  return (
    <div className={cn('flex flex-col gap-2', className)} aria-label={t('operationalStatusAriaLabel')}>
      {visible.map(item =>
        compact ? (
          <AttentionBanner key={item.key} item={item} />
        ) : (
          <AttentionItem key={item.key} item={item} />
        )
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// HealthyState - calm display when no exceptions present
// ---------------------------------------------------------------------------

interface HealthyStateProps {
  message: string
  description?: string
  className?: string
}

export function HealthyState({ message, description, className }: HealthyStateProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border border-success/20 bg-success-surface px-3 py-2.5',
        className,
      )}
      role="status"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-success-foreground">{message}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExceptionSection - titled section wrapping operational status
// ---------------------------------------------------------------------------

interface ExceptionSectionProps {
  title: string
  items: OperationalAttention[]
  healthyMessage?: string
  healthyDescription?: string
  /** When true, shows the healthy state even if items is empty. Default: true */
  showHealthy?: boolean
  className?: string
}

export function ExceptionSection({
  title,
  items,
  healthyMessage,
  healthyDescription,
  showHealthy = true,
  className,
}: ExceptionSectionProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      {items.length > 0 ? (
        <OperationalStatusStrip items={items} />
      ) : showHealthy && healthyMessage ? (
        <HealthyState message={healthyMessage} description={healthyDescription} />
      ) : null}
    </div>
  )
}
