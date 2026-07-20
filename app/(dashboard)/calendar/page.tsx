import { CalendarWorkspace } from '@/components/features/calendar/CalendarWorkspace'
import { LocalizedPageHeading } from '@/lib/i18n'

export default function CalendarPage() {
  return (
    <div className="min-w-0 space-y-6" data-testid="calendar-page">
      <LocalizedPageHeading title="calendar" subtitle="calendarSubtitle" />
      <CalendarWorkspace />
    </div>
  )
}
