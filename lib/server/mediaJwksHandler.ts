import 'server-only'
import {loadLiveSessionMediaSettings,loadMediaKeySettings,getPublicMediaJwks,type MediaSigningSettings} from '@/lib/server/mediaViewerKey'
export function createMediaJwksHandler(options:{settings?:()=>MediaSigningSettings}={}){
  return {async GET():Promise<Response>{
    try{
      const resolveSettings = options.settings ?? (
        process.env.MEDIA_DEV_EPHEMERAL_KEY_ENABLED==='true' && !process.env.VERCEL_ENV && process.env.VERCEL!=='1' && process.env.NODE_ENV!=='production'
          ? loadLiveSessionMediaSettings
          : loadMediaKeySettings
      )
      const settings=resolveSettings()
      return Response.json(getPublicMediaJwks(settings),{
        headers:{'Cache-Control':'public, max-age=15, must-revalidate',
          'X-Content-Type-Options':'nosniff'},
      })
    }catch{
      return Response.json({error:{code:'MEDIA_UNAVAILABLE'}},{
        status:503,headers:{'Cache-Control':'no-store'}})
    }
  }}
}
