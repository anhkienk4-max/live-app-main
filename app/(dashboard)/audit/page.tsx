import { AuditHistory } from '@/components/features/audit/AuditHistory'
import { PageShell } from '@/components/ui/archetypes'

export default function AuditPage() {
  return (
    <PageShell archetype="directory" className="space-y-6">
      <AuditHistory />
    </PageShell>
  )
}
