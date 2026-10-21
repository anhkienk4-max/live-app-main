import 'server-only'
import {z} from 'zod'
import type {SupabaseClient} from '@supabase/supabase-js'
import {requireUser,authorizationErrorResponse,isAuthorizationError,type ServerUserResolver} from '@/lib/server/authGuards'
import {readJsonBody,RequestBodyError,consumeRateLimit,rateLimitResponse} from '@/lib/server/apiSecurity'
import {loadMediaKeySettings,signMediaViewerGrant,type MediaSigningSettings} from '@/lib/server/mediaViewerKey'
import {mayReadMediaShift,type MediaGrant,type MediaRoute,type MediaShift} from '@/lib/media/mediaViewerPolicy'

const bodySchema=z.object({shiftId:z.string().trim().min(1).max(120)}).strict()
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','Vary':'Cookie'}
const response=(code:string,status:number)=>Response.json({ok:false,error:{code}},{status,headers})
type Dependencies={
  resolveUser?:ServerUserResolver
  createClient?:()=>Promise<SupabaseClient>
  settings?:()=>MediaSigningSettings
  now?:()=>number
}
/** NEVER uses service_role: grants AND routes must pass caller's Supabase RLS. */
export function createMediaViewerGrantHandler(options:Dependencies={}){
  return {async POST(request:Request):Promise<Response>{
    try{
      const user=await requireUser(request,options.resolveUser)
      const settings=(options.settings??loadMediaKeySettings)()
      const origin=request.headers.get('origin')
      if(origin!==settings.appOrigin||new URL(request.url).origin!==settings.appOrigin)
        return response('MEDIA_ORIGIN_DENIED',403)
      const parsed=bodySchema.safeParse(await readJsonBody(request,1024))
      if(!parsed.success)return response('MEDIA_REQUEST_INVALID',400)
      const now=(options.now??Date.now)()
      const limit=consumeRateLimit({key:'media-viewer:'+user.id,limit:15,windowMs:60_000,now})
      if(!limit.allowed)return rateLimitResponse(limit.resetAt)
      const db=options.createClient?await options.createClient():await (await import('@/lib/supabase/server')).createClient()
      const {shiftId}=parsed.data
      const [s,g]=await Promise.all([
        db.from('shifts').select('id,brand_id,platform_id,studio,status,start_at,end_at,deleted_at')
          .eq('id',shiftId).limit(2),
        db.from('media_viewer_grants').select('auth_user_id,shift_id,active,valid_from,valid_until')
          .eq('auth_user_id',user.id).eq('shift_id',shiftId).eq('active',true).limit(2)
      ])
      if(s.error||g.error)return response('MEDIA_ACL_UNAVAILABLE',503)
      if(s.data?.length!==1||g.data?.length!==1)return response('MEDIA_PERMISSION_DENIED',403)
      const shift=s.data[0] as MediaShift, grant=g.data[0] as MediaGrant
      if(!shift.studio?.trim())return response('MEDIA_ROUTE_NOT_CONFIGURED',403)
      const r=await db.from('media_stream_routes')
        .select('brand_id,platform_id,studio,media_path,active')
        .eq('brand_id',shift.brand_id).eq('platform_id',shift.platform_id)
        .eq('studio',shift.studio).eq('active',true).limit(2)
      if(r.error)return response('MEDIA_ACL_UNAVAILABLE',503)
      if(r.data?.length!==1)return response('MEDIA_ROUTE_NOT_CONFIGURED',403)
      const route=r.data[0] as MediaRoute
      if(!mayReadMediaShift({viewerId:user.id,shift,grant,route,now}))
        return response('MEDIA_PERMISSION_DENIED',403)
      const credential=signMediaViewerGrant({settings,path:route.media_path,now})
      return Response.json({ok:true,shiftId,mediaUrl:credential.url,
        token:credential.token,expiresAt:credential.expiresAt},
        {headers})
    }catch(error){
      if(isAuthorizationError(error))return authorizationErrorResponse(error)
      if(error instanceof RequestBodyError)
        return response(error.code,error.status)
      return response('MEDIA_UNAVAILABLE',503)
    }
  }}
}
