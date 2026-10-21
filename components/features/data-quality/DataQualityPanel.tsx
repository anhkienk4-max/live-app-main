'use client'
import * as React from 'react'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { pageRange } from '@/lib/utils/pagination'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import type { DataQualityIssue, DataQualitySeverity, DataQualitySource } from '@/lib/types/dataQuality'
import { recoveryActionFor } from '@/lib/utils/dataQuality'
import { useTranslation } from '@/lib/i18n'

export function DataQualityPanel({ issues,remote,filters,onFiltersChange }: { issues: DataQualityIssue[]; remote?:{total:number;totalIssues:number;counts:{error:number;warning:number;info:number};page:number;pageSize:number;setPage:(page:number)=>void;setPageSize:(size:number)=>void};filters?:{severity:DataQualitySeverity[];source:DataQualitySource[]};onFiltersChange?:(filters:{severity:DataQualitySeverity[];source:DataQualitySource[]})=>void }) {
  const { t } = useTranslation()
  const [localSeverity, setSeverity] = React.useState<DataQualitySeverity[]>([])
  const [localSource, setSource] = React.useState<DataQualitySource[]>([])
  const severity=filters?.severity??localSeverity
  const source=filters?.source??localSource
  const [page,setPage]=React.useState(1)
  const [pageSize,setPageSize]=React.useState(10)
  const filtered = issues.filter(i=> (!severity.length || severity.includes(i.severity)) && (!source.length || source.includes(i.source)))
  const counts = remote?.counts ?? {
    error: issues.filter(i=> i.severity==='error').length,
    warning: issues.filter(i=> i.severity==='warning').length,
    info: issues.filter(i=> i.severity==='info').length,
  }
  const range=pageRange(filtered.length,page,pageSize)
  const visible=remote?issues:filtered.slice((range.page-1)*pageSize,range.page*pageSize)
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{remote?.totalIssues??issues.length}</p></CardContent></Card>
        <Card className="border-red-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Error</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{counts.error}</p></CardContent></Card>
        <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Warning</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{counts.warning}</p></CardContent></Card>
        <Card className="border-blue-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Info</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-blue-600">{counts.info}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Issues</CardTitle>
          <div className="flex min-w-0 flex-wrap gap-2">
            <MultiSelectFilter label="Severity" value={severity} onChange={value=> {const next=value.filter(item=>['error','warning','info'].includes(item)) as DataQualitySeverity[];setSeverity(next);setPage(1);onFiltersChange?.({severity:next,source})}} options={(['error','warning','info'] as DataQualitySeverity[]).map(value=>({value,label:value}))} placeholder={t('all')} testId="data-quality-severity-filter" />
            <MultiSelectFilter label="Source" value={source} onChange={value=> {const next=value.filter(item=>['schedule_import','report','staffing'].includes(item)) as DataQualitySource[];setSource(next);setPage(1);onFiltersChange?.({severity,source:next})}} options={(['schedule_import','report','staffing'] as DataQualitySource[]).map(value=>({value,label:value==='schedule_import'?'import':value}))} placeholder={t('all')} testId="data-quality-source-filter" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
          {filtered.length===0 ? <p className="py-8 text-center text-sm text-muted-foreground">No issues</p> : visible.map(issue=> {
            const action = recoveryActionFor(issue)
            return (
              <div key={issue.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={issue.severity==='error'?'destructive': issue.severity==='warning'?'secondary':'outline'}>{issue.severity}</Badge>
                    <Badge variant="outline">{issue.source}</Badge>
                    <span className="text-xs text-muted-foreground">{issue.issue_code}</span>
                  </div>
                  <p className="font-medium text-sm mt-1">{issue.title}</p>
                  <p className="text-xs text-muted-foreground">{issue.message}</p>
                  {issue.related_entity_id && <p className="text-xs text-muted-foreground mt-1">{issue.related_entity_type}: {issue.related_entity_id}</p>}
                  {issue.suggested_action && <p className="text-xs mt-1">Suggested: {issue.suggested_action}</p>}
                </div>
                <Button size="sm" variant="outline" render={<Link href={action.url} />} nativeButton={false}>{action.label}</Button>
              </div>
            )
          })}
        </CardContent>
        <HistoryPagination page={remote?.page??range.page} pageSize={remote?.pageSize??pageSize} total={remote?.total??filtered.length} onPageChange={remote?.setPage??setPage} onPageSizeChange={remote?.setPageSize??(size=>{setPageSize(size);setPage(1)})} />
      </Card>
    </div>
  )
}
