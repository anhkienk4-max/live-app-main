import { ShiftList } from '@/components/features/shifts/ShiftList'
import { PageShell } from '@/components/ui/archetypes'

export default function ShiftsPage() {
  return (
    <PageShell archetype="directory" className="space-y-6" data-testid="shifts-page">
      <ShiftList />
    </PageShell>
  )
}
