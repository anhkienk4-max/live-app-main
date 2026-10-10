import { AuditHistory } from '@/components/features/audit/AuditHistory'
import { PageShell } from '@/components/ui/archetypes'

export default function AuditPage() {
  return (
    <PageShell archetype="directory" className="space-y-4 p-4 md:p-6">
      <AuditHistory />
    </PageShell>
  )
}
