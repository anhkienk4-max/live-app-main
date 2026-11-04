import 'server-only'
import { isFeatureEnabled, type FeatureFlag } from '@/lib/flags'
import { authorizationErrorResponse, isAuthorizationError, requireUser,
  type ServerUserResolver } from '@/lib/server/authGuards'

export function createWorkforceCapabilitiesHandler(options:{
  resolveUser?:ServerUserResolver
  enabled?:(flag:FeatureFlag)=>boolean
}={}) {
  return {async GET(request:Request):Promise<Response>{
    try{
      const user=await requireUser(request,options.resolveUser)
      const enabled=options.enabled??isFeatureEnabled
      const workforce=enabled('actual_staffing')
      const supervisor=user.systemPermission==='admin'||user.systemPermission==='leader'
      return Response.json({ok:true,capabilities:{
        actual_staffing:workforce&&supervisor,
        self_attendance_review:enabled('self_attendance_review')&&supervisor,
        team_performance:workforce&&supervisor,
        own_performance:workforce&&Boolean(user.businessUserId),
        payroll:user.systemPermission==='admin'&&enabled('payroll'),
      }},{headers:{'Cache-Control':'no-store'}})
    }catch(e){
      if(isAuthorizationError(e))return authorizationErrorResponse(e)
      return Response.json({ok:false,error:{code:'WORKFORCE_CAPABILITIES_FAILED'}},
        {status:500,headers:{'Cache-Control':'no-store'}})
    }
  }}
}
