import 'server-only'
import {loadMediaKeySettings,getPublicMediaJwks,type MediaSigningSettings} from '@/lib/server/mediaViewerKey'
export function createMediaJwksHandler(options:{settings?:()=>MediaSigningSettings}={}){
  return {async GET():Promise<Response>{
    try{
      const settings=(options.settings??loadMediaKeySettings)()
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
