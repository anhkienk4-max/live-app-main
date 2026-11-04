import { getAuthMode } from '@/lib/auth/authMode'
import { getCollectionPage, localListPage, type ListQuery, type ListPage } from '@/lib/services/operationsPageService'
import { shiftService, reportService, shiftRegistrationService } from '@/lib/services/dataService'
import { filterDataQualityIssues, getAllIssues } from '@/lib/utils/dataQuality'
import type { DataQualityIssue } from '@/lib/types/dataQuality'
export interface QualityPage extends ListPage<DataQualityIssue> { totalIssues:number; counts:{error:number;warning:number;info:number} }
export const dataQualityPageService={
  async getPage(query:ListQuery,signal?:AbortSignal):Promise<QualityPage> {
    if(getAuthMode()==='supabase')return await getCollectionPage<DataQualityIssue>('quality',query,signal) as QualityPage
    const [shifts,reports,registrations]=await Promise.all([shiftService.getAll(),reportService.getAll(),shiftRegistrationService.getAll()])
    const all=getAllIssues({shifts,reports,registrations}).sort((a,b)=>a.id.localeCompare(b.id))
    const filtered=filterDataQualityIssues(all,query.filters?.severity??[],query.filters?.qualitySources??[])
    return {...localListPage(filtered,query),totalIssues:all.length,counts:{error:all.filter(i=>i.severity==='error').length,warning:all.filter(i=>i.severity==='warning').length,info:all.filter(i=>i.severity==='info').length}}
  },
}
