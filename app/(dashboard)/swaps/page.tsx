import { LazySwapRequestList } from '@/lib/utils/lazyComponents'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'
export default function SwapsPage() {
  return (
    <PageShell archetype="workflow" className="space-y-6">
      <LocalizedPageHeading title="swapsTitle" subtitle="swapsSubtitle" />
      <LazySwapRequestList />
    </PageShell>
  )
}
