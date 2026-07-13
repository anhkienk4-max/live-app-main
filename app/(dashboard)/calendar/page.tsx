import { LazyCalendarView } from '@/lib/utils/lazyComponents'

export default function CalendarPage() {
  return (
    <div className="space-y-6" data-testid="calendar-page">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Calendar</h1>
        <p className="text-gray-600">Operational center for livestream schedule management</p>
      </div>
      <LazyCalendarView />
    </div>
  )
}
