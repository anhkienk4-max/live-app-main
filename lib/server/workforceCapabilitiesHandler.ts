import 'server-only'
import { isFeatureEnabled, type FeatureFlag } from '@/lib/flags'
import { authorizationErrorResponse, isAuthorizationError, requireUser,
  type ServerUserResolver } from '@/lib/server/authGuards'

export function createWorkforceCapabilitiesHandler(options:{
  resolveUser?:ServerUserResolver
  enabled?:(flag:FeatureFlag)=>boolean
  createScopeClient?:()=>Promise<{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown,error:unknown}>}>
}={}) {
  return {async GET(request:Request):Promise<Response>{
    try{
      const user=await requireUser(request,options.resolveUser)
      const enabled=options.enabled??isFeatureEnabled
      const workforce=enabled('actual_staffing')
      const supervisor=user.systemPermission==='admin'||user.systemPermission==='leader'
      let teamScopeAvailable=user.systemPermission==='admin'
      if(workforce&&user.systemPermission==='leader'){
        if(user.businessUserId){
          try{
            const scopeClient=options.createScopeClient
              ?await options.createScopeClient()
              :await (await import('@/lib/supabase/server')).createClient()
            const scope=await scopeClient.rpc('rc19_current_leader_brand_ids',{p_scope_key:'workforce.read'})
            teamScopeAvailable=!scope.error&&Array.isArray(scope.data)
              &&scope.data.length>0&&scope.data.every(id=>typeof id==='string'&&id.trim().length>0)
          }catch{
            teamScopeAvailable=false
          }
        }
      }
      return Response.json({ok:true,capabilities:{
        actual_staffing:workforce&&supervisor,
        self_attendance_review:enabled('self_attendance_review')&&supervisor,
        team_performance:workforce&&teamScopeAvailable,
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
