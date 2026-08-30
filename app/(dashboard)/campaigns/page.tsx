import { CampaignList } from '@/components/features/campaigns/CampaignList'
import { PageShell } from '@/components/ui/archetypes'

export default function CampaignsPage() {
  return (
    <PageShell archetype="directory" className="space-y-6" data-testid="campaigns-page">
      <CampaignList />
    </PageShell>
  )
}