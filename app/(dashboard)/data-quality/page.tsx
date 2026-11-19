'use client'
import * as React from 'react'
import { DataQualityPanel } from '@/components/features/data-quality/DataQualityPanel'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { dataQualityPageService,type QualityPage } from '@/lib/services/dataQualityPageService'
import { PageLoadError } from '@/components/ui/page-load-error'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import type { DataQualitySeverity, DataQualitySource } from '@/lib/types/dataQuality'

export default function DataQualityPage() {
  const [filters,setFilters]=React.useState<{severity:DataQualitySeverity[];source:DataQualitySource[]}>({severity:[],source:[]})
  const list=usePagedList(dataQualityPageService,'quality',{severity:filters.severity,qualitySources:filters.source},10)
  const metadata=list.result as QualityPage|undefined
  if(list.error)return <PageLoadError error={list.error} onRetry={()=>void list.reload()} />
  if(list.loading)return <ContentSkeleton />
  if(!metadata || !Number.isFinite(metadata.totalIssues) || !metadata.counts || !['error','warning','info'].every(key=>Number.isFinite(metadata.counts[key as keyof typeof metadata.counts]))) {
    return <PageLoadError error={new Error('Data quality totals are unavailable.')} onRetry={()=>void list.reload()} />
  }
  return (
    <PageShell archetype="analytics" className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <h1 className="text-2xl font-bold">Data Quality</h1>
          <p className="text-sm text-muted-foreground">Operational issues and recovery actions</p>
        </PageHeaderContent>
      </PageHeader>
      <DataQualityPanel issues={list.items} remote={{total:list.total,totalIssues:metadata.totalIssues,counts:metadata.counts,page:list.page,pageSize:list.pageSize,setPage:list.setPage,setPageSize:list.setPageSize}}
        filters={filters} onFiltersChange={value=>{setFilters(value);list.reset()}} />
    </PageShell>
  )
}
