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

export function CalendarWorkspace() {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const [tab, setTab] = React.useState('calendar')
  const [createRequest, setCreateRequest] = React.useState(0)
  return (
    <Tabs value={tab} onValueChange={value => setTab(String(value))} className="min-w-0 w-full">
      <div className="flex flex-wrap justify-end gap-2">
        {hasPermission(currentUser, 'shifts.assign_staff') && <Button onClick={() => { setTab('calendar'); setCreateRequest(value => value + 1) }}><Plus className="mr-2 h-4 w-4" />{t('newShift')}</Button>}
        {hasPermission(currentUser, 'shifts.import') && <Button variant="outline" onClick={() => setTab('import')}><Upload className="mr-2 h-4 w-4" />{t('importSchedule')}</Button>}
      </div>
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
