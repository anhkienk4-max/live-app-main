'use client'
import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { DataQualityIssue, DataQualitySeverity, DataQualitySource } from '@/lib/types/dataQuality'
import { recoveryActionFor } from '@/lib/utils/dataQuality'
import { useTranslation } from '@/lib/i18n'

export function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  const { t } = useTranslation()
  const [severity, setSeverity] = React.useState<DataQualitySeverity | 'all'>('all')
  const [source, setSource] = React.useState<DataQualitySource | 'all'>('all')
  const filtered = issues.filter(i=> (severity==='all' || i.severity===severity) && (source==='all' || i.source===source))
  const counts = {
    error: issues.filter(i=> i.severity==='error').length,
    warning: issues.filter(i=> i.severity==='warning').length,
    info: issues.filter(i=> i.severity==='info').length,
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{issues.length}</p></CardContent></Card>
        <Card className="border-red-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Error</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-red-600">{counts.error}</p></CardContent></Card>
        <Card className="border-amber-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Warning</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-amber-600">{counts.warning}</p></CardContent></Card>
        <Card className="border-blue-200"><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Info</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-blue-600">{counts.info}</p></CardContent></Card>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Issues</CardTitle>
          <div className="flex gap-2">
            <Select value={severity} onValueChange={v=> setSeverity(v as never)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem><SelectItem value="error">error</SelectItem><SelectItem value="warning">warning</SelectItem><SelectItem value="info">info</SelectItem></SelectContent></Select>
            <Select value={source} onValueChange={v=> setSource(v as never)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem><SelectItem value="schedule_import">import</SelectItem><SelectItem value="report">report</SelectItem><SelectItem value="staffing">staffing</SelectItem></SelectContent></Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
          {filtered.length===0 ? <p className="py-8 text-center text-sm text-muted-foreground">No issues</p> : filtered.map(issue=> {
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
      </Card>
    </div>
  )
}
