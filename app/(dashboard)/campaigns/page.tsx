import { CampaignList } from '@/components/features/campaigns/CampaignList'

export default function CampaignsPage() {
  return (
    <div className="space-y-6" data-testid="campaigns-page">
      <CampaignList />
    </div>
  )
}