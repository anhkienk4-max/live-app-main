import { getAuthMode } from '@/lib/auth/authMode'
import { getCollectionPage, localListPage, type ListQuery, type ListPage } from '@/lib/services/operationsPageService'
import { shiftService, reportService, shiftRegistrationService } from '@/lib/services/dataService'
import { getAllIssues } from '@/lib/utils/dataQuality'
import type { DataQualityIssue } from '@/lib/types/dataQuality'
export interface QualityPage extends ListPage<DataQualityIssue> { totalIssues:number; counts:{error:number;warning:number;info:number} }
export const dataQualityPageService={
  async getPage(query:ListQuery,signal?:AbortSignal):Promise<QualityPage> {
    if(getAuthMode()==='supabase')return await getCollectionPage<DataQualityIssue>('quality',query,signal) as QualityPage
    const [shifts,reports,registrations]=await Promise.all([shiftService.getAll(),reportService.getAll(),shiftRegistrationService.getAll()])
    const all=getAllIssues({shifts,reports,registrations}).sort((a,b)=>a.id.localeCompare(b.id))
    const filtered=all.filter(issue=>(!query.filters?.severity||query.filters.severity==='all'||query.filters.severity===issue.severity)&&(!query.filters?.qualitySources?.length||query.filters.qualitySources.includes(issue.source)))
    return {...localListPage(filtered,query),totalIssues:all.length,counts:{error:all.filter(i=>i.severity==='error').length,warning:all.filter(i=>i.severity==='warning').length,info:all.filter(i=>i.severity==='info').length}}
  },
}
