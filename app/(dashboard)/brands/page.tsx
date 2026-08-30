import { BrandList } from '@/components/features/brands/BrandList'
import { PageShell } from '@/components/ui/archetypes'

export default function BrandsPage() {
  return (
    <PageShell archetype="directory" className="space-y-6" data-testid="brands-page">
      <BrandList />
    </PageShell>
  )
}
