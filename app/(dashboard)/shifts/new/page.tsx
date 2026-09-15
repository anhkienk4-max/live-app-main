'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { ShiftFormWorkspace } from '@/components/features/shifts/ShiftFormWorkspace'
import { PageShell } from '@/components/ui/archetypes'
import { userService , brandService, platformService, campaignService} from '@/lib/services/dataService'
import type { Brand, Platform, Campaign, User } from '@/lib/types/database.types'

export default function NewShiftPage() {
  const router = useRouter()
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)

  const loadData = React.useCallback(async () => {
    try {
      const [loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers] = await Promise.all([
        brandService.getAll(),
        platformService.getAll(),
        campaignService.getAll(),
        userService.getAll(),
      ])
      
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadData()
  }, [loadData])

  if (loading) {
    return <PageShell archetype="schedule" className="p-8">Loading...</PageShell>
  }

  return (
    <PageShell archetype="schedule" className="p-0 max-w-none h-[calc(100vh-theme(spacing.16))] w-full">
      <ShiftFormWorkspace
        shift={null}
        duplicateFrom={null}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        templates={[]}
        onSuccess={(savedShift) => router.push('/calendar')}
        onBack={() => router.push('/calendar')}
      />
    </PageShell>
  )
}
