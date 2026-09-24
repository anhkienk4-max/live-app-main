'use client'

import * as React from 'react'
import { Shift } from '@/lib/types/database.types'
import { getShiftRoleCapacities } from '@/lib/services/dataService'
import { formatShiftTimeRange, getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { ShiftStatusBadge } from '@/components/domain/ShiftStatusBadge'
import { OperationalStatusStrip } from '@/components/ui/operational-status'
import { OperationalAttention, deriveShiftAttention } from '@/lib/ui/operational-attention'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { CalendarFilterContext } from '@/lib/utils/calendarFilters'

export interface ShiftCardProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shift: Shift
  variant?: 'compact' | 'standard' | 'expanded'
  context?: CalendarFilterContext
  isToday?: boolean
  showDate?: boolean
  selected?: boolean
}

export const ShiftCard = React.forwardRef<HTMLButtonElement, ShiftCardProps>(
  ({ shift, variant = 'standard', context, showDate, selected, className, ...props }, ref) => {
    const { t } = useTranslation()
    
    const crossesMidnight = shift.crosses_midnight

    const brands = context?.brands ?? []
    const platforms = context?.platforms ?? []
    const registrations = context?.registrations ?? []

    const brandName = brands.find(b => b.id === shift.brand_id)?.name ?? ''
    const platformName = platforms.find(p => p.id === shift.platform_id)?.name ?? ''
    const displayTitle = shift.title || (brandName + ' · ' + platformName)

    // Extract staffing names
    const hostName = shift.host_names?.[0] || t('notAssigned')
    const supportName = shift.support_id ? t('staffMatchAssigned') : t('notAssigned')
    const techName = shift.technical_id ? t('staffMatchAssigned') : t('notAssigned')

        // Determine operational attention
    const shiftRegistrations = registrations.filter(r => r.shift_id === shift.id)
    const capacities = getShiftRoleCapacities(shift, shiftRegistrations)
    let pendingCount = 0
    const staffed = { host: 0, support: 0, technical: 0 }
    const required = { host: 0, support: 0, technical: 0 }
    capacities.forEach(c => {
      pendingCount += c.pending
      if (c.role === 'host' || c.role === 'support' || c.role === 'technical') {
        staffed[c.role] = c.approved
        required[c.role] = c.required
      }
    })

    const todayDate = getCurrentBusinessDate()
    const attention: OperationalAttention[] = deriveShiftAttention({
      shiftId: shift.id,
      shiftDate: shift.date,
      shiftStatus: shift.status,
      pendingCount,
      isUpcoming: shift.date >= todayDate,
      required,
      staffed,
    })

    if (variant === 'compact') {
      return (
        <button
          ref={ref}
          className={cn(
            'w-full text-left flex items-center gap-1.5 px-1.5 py-1 text-xs rounded-sm transition-colors overflow-hidden',
            'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected && 'bg-primary/10',
            className
          )}
          {...props}
        >
          <span className='shrink-0 font-semibold'>
            {shift.start_time}{crossesMidnight ? ' +1' : ''}
          </span>
          <span className='min-w-0 flex-1 truncate whitespace-nowrap text-foreground'>
            {displayTitle}
          </span>
          <ShiftStatusBadge status={shift.status} className='shrink-0 text-micro h-4 px-1 py-0 border-none scale-90 origin-right' />
        </button>
      )
    }

    if (variant === 'expanded') {
      return (
        <button
          ref={ref}
          className={cn(
            'w-full text-left block p-4 border rounded-lg transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            selected ? 'border-primary bg-primary/[0.02]' : 'bg-card',
            className
          )}
          {...props}
        >
          <div className='flex items-center justify-between mb-2'>
            <div className='flex flex-wrap items-center gap-x-6 gap-y-2 flex-1'>
              {showDate && (
                <div className='text-sm font-semibold min-w-[110px] text-foreground'>
                  {shift.date}
                </div>
              )}
              <div className='min-w-[150px] text-sm font-semibold tracking-tight'>
                {formatShiftTimeRange(shift)}
              </div>
              <div className='text-sm font-semibold text-foreground'>{brandName}</div>
              <div className='text-sm text-muted-foreground'>{platformName}</div>
              <div className='text-sm text-muted-foreground'>
                <span className='font-medium mr-1'>{t('studio')}:</span> {shift.studio || t('notUpdated')}
              </div>
              <div className='text-sm text-muted-foreground'>
                <span className='font-medium mr-1'>{t('importHostNames')}:</span> {hostName}
              </div>
              <div className='text-sm text-muted-foreground'>
                <span className='font-medium mr-1'>{t('importAssistantNames')}:</span> {supportName}
              </div>
              <div className='text-sm text-muted-foreground'>
                <span className='font-medium mr-1'>{t('importTechnicalNames')}:</span> {techName}
              </div>
            </div>
            <div className='ml-4 shrink-0'>
              <ShiftStatusBadge status={shift.status} />
            </div>
          </div>
          {attention.length > 0 && (
            <div className='mt-3 pr-4'>
              <OperationalStatusStrip items={attention} compact />
            </div>
          )}
        </button>
      )
    }

    // Standard variant
    return (
      <button
        ref={ref}
        className={cn(
          'w-full text-left flex flex-col p-2 border rounded-md transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          selected ? 'border-primary bg-primary/[0.02]' : 'bg-card',
          className
        )}
        {...props}
      >
        <div className='flex items-start justify-between w-full gap-1 mb-1'>
          <span className='font-semibold text-mini leading-none text-foreground tracking-tight whitespace-nowrap'>
            {formatShiftTimeRange(shift)}
          </span>
          <span className='shrink-0 leading-none'>
            <ShiftStatusBadge status={shift.status} className='text-micro h-3.5 px-1 py-0 rounded-sm border-border/50' />
          </span>
        </div>
        <div className='text-mini font-semibold text-foreground truncate leading-tight'>
          {brandName}
        </div>
        <div className='text-micro text-muted-foreground truncate leading-tight mt-0.5'>
          {platformName} {shift.studio ? (' · ' + shift.studio) : ''}
        </div>
        {attention.length > 0 && (
          <div className='mt-1.5'>
             <OperationalStatusStrip items={attention} compact />
          </div>
        )}
      </button>
    )
  }
)
ShiftCard.displayName = 'ShiftCard'
