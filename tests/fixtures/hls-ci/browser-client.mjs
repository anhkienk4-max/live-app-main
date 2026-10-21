// Isolated real-Chromium HLS transport fixture. It imports the same client
// Authorization policy as AdaHlsPlayer, but does NOT replace React UI E2E.
import {parseProtectedMediaGrant,mediaAuthorizationHeader} from '/policy.mjs'
window.__stats={state:'starting',manifest:false,segments:0,errors:[],grants:0}
const video=document.getElementById('viewer')
let hls=null,activeGrant=null,timer,alive=true
function stop(reason){
  alive=false
  clearInterval(timer)
  if(hls){hls.destroy();hls=null}
  activeGrant=null
  video.pause()
  video.removeAttribute('src')
  video.load()
  window.__stats.state=reason
}
async function renew(){
  const response=await fetch('/api/media/viewer-grant',{
    method:'POST',headers:{'content-type':'application/json'},
    credentials:'same-origin',body:JSON.stringify({shiftId:'shift-browser-ci'})
  })
  if(!response.ok){stop('denied');return}
  const next=parseProtectedMediaGrant(await response.json(),
    'shift-browser-ci','https://media.ops5729.top:8886')
  if(activeGrant&&next.mediaUrl!==activeGrant.mediaUrl){stop('route-changed');return}
  activeGrant=next
  window.__stats.grants++
}
try{
  await renew()
  if(!alive)throw new Error('initial grant denied')
  if(!Hls.isSupported())throw new Error('Chromium MediaSource is unavailable')
  hls=new Hls({
    lowLatencyMode:false,liveSyncDurationCount:3,maxBufferLength:12,
    xhrSetup:(xhr,url)=>{
      if(!activeGrant)throw new Error('MEDIA_GRANT_EXPIRED')
      xhr.withCredentials=false
      xhr.setRequestHeader('Authorization',mediaAuthorizationHeader(url,activeGrant))
    }
  })
  hls.on(Hls.Events.MEDIA_ATTACHED,()=>hls.loadSource(activeGrant.mediaUrl))
  hls.on(Hls.Events.MANIFEST_PARSED,()=>{
    window.__stats.manifest=true
    void video.play().catch(e=>window.__stats.errors.push(String(e)))
  })
  hls.on(Hls.Events.FRAG_LOADED,()=>window.__stats.segments++)
  hls.on(Hls.Events.ERROR,(_ev,data)=>{
    if(data.response?.code===401||data.response?.code===403){stop('gateway-denied');return}
    if(data.fatal){window.__stats.errors.push(String(data.details));stop('fatal')}
  })
  hls.attachMedia(video)
  timer=setInterval(()=>{if(alive)void renew().catch(()=>stop('refresh-failed'))},4000)
  window.__stats.state='streaming'
}catch(e){
  window.__stats.errors.push(String(e))
  stop('failed')
}
