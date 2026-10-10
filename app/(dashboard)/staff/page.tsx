import { StaffList } from '@/components/features/staff/StaffList'
import { PageShell } from '@/components/ui/archetypes'

export default function StaffPage() {
  return (
    <PageShell archetype="directory" className="space-y-4 p-4 md:p-6" data-testid="staff-page">
      <StaffList />
    </PageShell>
  )
}
