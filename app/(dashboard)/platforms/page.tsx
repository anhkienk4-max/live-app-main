import { PlatformList } from '@/components/features/platforms/PlatformList'
import { PageShell } from '@/components/ui/archetypes'

export default function PlatformsPage() {
  return (
    <PageShell archetype="directory" className="space-y-6">
      <PlatformList />
    </PageShell>
  )
}