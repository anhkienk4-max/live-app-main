import { LazyCalendarView } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'

export default function CalendarPage() {
  return (
    <div className="space-y-6" data-testid="calendar-page">
      <LocalizedPageHeading title="calendar" subtitle="calendarSubtitle" />
      <LazyCalendarView />
    </div>
  )
}
