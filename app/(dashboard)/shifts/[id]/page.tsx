'use client'

import React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ShiftDetailWorkspace } from '@/components/features/shifts/ShiftDetailWorkspace'
import { PageShell } from '@/components/ui/archetypes'
import { shiftService, userService , brandService, platformService, campaignService} from '@/lib/services/dataService'
import type { Shift, Brand, Platform, Campaign, User } from '@/lib/types/database.types'

export default function ShiftDetailPage() {
  const params = useParams()
  const id = params?.id
  const router = useRouter()
  const [shift, setShift] = React.useState<Shift | null>(null)
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  const loadData = React.useCallback(async () => {
    if (!id || typeof id !== 'string') return
    try {
      const [loadedShift, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers] = await Promise.all([
        shiftService.getById(id),
        brandService.getAll(),
        platformService.getAll(),
        campaignService.getAll(),
        userService.getAll(),
      ])
      
      if (!loadedShift) {
        setError(true)
        setLoading(false)
        return
      }

      setShift(loadedShift)
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void loadData() })
    return () => window.cancelAnimationFrame(frame)
  }, [loadData])

  if (loading) {
    return <PageShell archetype="schedule" className="p-8">Loading...</PageShell>
  }

  if (error || !shift) {
    return <PageShell archetype="schedule" className="p-8 text-destructive">Shift not found or an error occurred.</PageShell>
  }

  return (
    <PageShell archetype="schedule" className="p-0 max-w-none h-[calc(100vh-theme(spacing.16))] w-full">
      <ShiftDetailWorkspace
        shift={shift}
        brands={brands}
        platforms={platforms}
        campaigns={campaigns}
        users={users}
        onUpdate={loadData}
        onBack={() => router.push('/calendar')}
        onEdit={() => router.push(`/shifts/${params.id}/edit`)}
        onDelete={() => router.push('/calendar')}
      />
    </PageShell>
  )
}
