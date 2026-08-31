'use client'

import * as React from 'react'
import { Plus, Upload } from 'lucide-react'
import { CalendarView } from '@/components/features/calendar/CalendarView'
import { ImportHistoryPanel, ScheduleImportPanel } from '@/components/features/calendar/ScheduleImportPanel'
import { ShiftRegistrationBoard } from '@/components/features/calendar/ShiftRegistrationBoard'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { PrioritizedAction } from '@/lib/ui/action-priority'
import { BottomActionBar, ResponsiveActions } from '@/components/ui/mobile-actions'

const calendarTabs = ['calendar', 'open', 'mine', 'import', 'history'] as const
type CalendarTab = typeof calendarTabs[number]

function isCalendarTab(value: string | null): value is CalendarTab {
  return value !== null && (calendarTabs as readonly string[]).includes(value)
}

export function CalendarWorkspace() {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryTab = searchParams.get('tab')
  const initialTab = isCalendarTab(queryTab) ? queryTab : 'calendar'
  const [tab, setTab] = React.useState<CalendarTab>(initialTab)
  const [createRequest, setCreateRequest] = React.useState(0)

  React.useEffect(() => {
    const action = searchParams.get('action')
    if (!action) return
    let handled = false
    if (action === 'create' && hasPermission(currentUser, 'shifts.assign_staff')) {
      setTab('calendar')
      setCreateRequest(v => v + 1)
      handled = true
    } else if (action === 'import' && hasPermission(currentUser, 'shifts.import')) {
      setTab('import')
      handled = true
    }
    if (!handled && action !== 'create' && action !== 'import') return
    const next = new URLSearchParams(searchParams.toString())
    next.delete('action')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, pathname, router, currentUser])
  const actions: PrioritizedAction[] = []
  if (hasPermission(currentUser, 'shifts.assign_staff')) {
    actions.push({
      key: 'newShift',
      tier: 'primary',
      label: t('newShift'),
      icon: <Plus />,
      onClick: () => { setTab('calendar'); setCreateRequest(value => value + 1) }
    })
  }
  if (hasPermission(currentUser, 'shifts.import')) {
    actions.push({
      key: 'import',
      tier: 'secondary',
      label: t('importSchedule'),
      icon: <Upload />,
      onClick: () => setTab('import')
    })
  }

  return (
    <Tabs value={isCalendarTab(queryTab) ? queryTab : tab} onValueChange={value => {
      if (!isCalendarTab(String(value))) return
      setTab(String(value) as CalendarTab)
      if (isCalendarTab(queryTab)) {
        const next = new URLSearchParams(searchParams.toString())
        next.delete('tab')
        const qs = next.toString()
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
      }
    }} className="min-w-0 w-full">
      <div className="flex flex-wrap justify-end gap-2 hidden md:flex">
        <ResponsiveActions actions={actions} collapseAt="md" />
      </div>
      <BottomActionBar actions={actions} showBelow="md" />
      <div className="max-w-full overflow-x-auto pb-1">
        <TabsList className="h-auto w-max min-w-full flex-nowrap justify-start sm:min-w-0">
          <TabsTrigger className="!flex-none px-3 py-1.5" value="calendar">{t('shiftCalendar')}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-1.5" value="open">{t('openShifts')}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-1.5" value="mine">{t('myShifts')}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-1.5" value="import">{t('importSchedule')}</TabsTrigger>
          <TabsTrigger className="!flex-none px-3 py-1.5" value="history">{t('importHistory')}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="min-w-0 w-full" value="calendar"><CalendarView createRequest={createRequest} /></TabsContent>
      <TabsContent className="min-w-0 w-full" value="open"><ShiftRegistrationBoard mode="open" /></TabsContent>
      <TabsContent className="min-w-0 w-full" value="mine"><ShiftRegistrationBoard mode="mine" /></TabsContent>
      <TabsContent className="min-w-0 w-full" value="import"><ScheduleImportPanel /></TabsContent>
      <TabsContent className="min-w-0 w-full" value="history"><ImportHistoryPanel /></TabsContent>
    </Tabs>
  )
}
