'use client'
import * as React from 'react'
import { DataQualityPanel } from '@/components/features/data-quality/DataQualityPanel'
import { getAllIssues } from '@/lib/utils/dataQuality'
import { shiftService, reportService, shiftRegistrationService, scheduleImportService } from '@/lib/services/dataService'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import type { DataQualityIssue } from '@/lib/types/dataQuality'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'

export default function DataQualityPage() {
  const { currentUser } = useCurrentUser()
  const [issues, setIssues] = React.useState<DataQualityIssue[] | null>(null)

  React.useEffect(()=> {
    if (!currentUser) { setIssues([]); return }
    // permission checked BEFORE fetch — avoid loading broad data then only hiding in UI
    const canImport = hasPermission(currentUser,'shifts.import')
    const canReport = hasPermission(currentUser,'reports.review') || hasPermission(currentUser,'reports.submit')
    const canStaff = hasPermission(currentUser,'shifts.view_open') || hasPermission(currentUser,'shifts.view_assigned')
    if (!canImport && !canReport && !canStaff) { setIssues([]); return }
    void (async()=>{
      const [shifts, reports, regs, imports] = await Promise.all([
        (canStaff || canReport ? shiftService.getAll().catch(()=>[]) : Promise.resolve([] as never[])),
        (canReport ? reportService.getAll().catch(()=>[]) : Promise.resolve([] as never[])),
        (canStaff ? shiftRegistrationService.getAll().catch(()=>[]) : Promise.resolve([] as never[])),
        (canImport ? scheduleImportService.getAll().catch(()=>[]) : Promise.resolve([] as never[])),
      ])
      const lastImport = imports[0]
      const importResult = null // read-only, no heavy parsing
      const all = getAllIssues({ reports, shifts, registrations: regs, importResult, batchId: lastImport?.id })
      setIssues(all)
    })()
  }, [currentUser])

  if (!issues) return <ContentSkeleton />
  return (
    <PageShell archetype="analytics" className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <h1 className="text-2xl font-bold">Data Quality</h1>
          <p className="text-sm text-muted-foreground">Operational issues and recovery actions</p>
        </PageHeaderContent>
      </PageHeader>
      <DataQualityPanel issues={issues} />
    </PageShell>
  )
}
