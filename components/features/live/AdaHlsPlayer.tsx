'use client'

import * as React from 'react'
import { Play, Square, RefreshCw, Volume2, VolumeX, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mediaAuthorizationHeader, nextMediaGrantCheckDelay,
  parseProtectedMediaGrant, type ProtectedMediaGrant } from '@/lib/media/hlsPlayerSecurity'

type PlayerStatus='idle'|'connecting'|'buffering'|'playing'|'reconnecting'|'denied'|'offline'|'unavailable'|'unsupported'
const statusText:Record<PlayerStatus,string>={
  idle:'Chưa kết nối nguồn OBS bảo mật',
  connecting:'Đang kiểm tra quyền xem ca và kết nối video…',
  buffering:'Đang tải hình ảnh livestream…',
  playing:'Đang xem nguồn OBS được cấp quyền',
  reconnecting:'Mất kết nối tạm thời, đang thử khôi phục…',
  denied:'Không có quyền xem ca này hoặc quyền đã hết hiệu lực.',
  offline:'Nguồn OBS chưa phát, mất kết nối hoặc đã kết thúc.',
  unavailable:'Chức năng video nội bộ chưa được cấu hình trên máy chủ.',
  unsupported:'Trình duyệt chưa hỗ trợ HLS.js. Dùng Edge hoặc Chrome trên máy tính.',
}
const isError=(s:PlayerStatus)=>['denied','offline','unavailable','unsupported'].includes(s)
const gateEnabled=process.env.NEXT_PUBLIC_MEDIA_PLAYER_UI_ENABLED==='true'
const mediaGatewayOrigin=process.env.NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN??''

async function fetchMediaGrant(shiftId:string,signal:AbortSignal):Promise<ProtectedMediaGrant>{
  const response=await fetch('/api/media/viewer-grant',{
    method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({shiftId}),signal,
  })
  if(!response.ok){
    if(response.status===401||response.status===403)throw new Error('MEDIA_PERMISSION_DENIED')
    if(response.status===503)throw new Error('MEDIA_UNAVAILABLE')
    throw new Error('MEDIA_SOURCE_ERROR')
  }
  return parseProtectedMediaGrant(await response.json(),shiftId,mediaGatewayOrigin)
}
function errorStatus(error:unknown):PlayerStatus{
  const code=error instanceof Error?error.message:''
  if(code==='MEDIA_PERMISSION_DENIED'||code==='MEDIA_GRANT_EXPIRED')return 'denied'
  if(code==='MEDIA_UNAVAILABLE'||code==='MEDIA_ORIGIN_INVALID'||code==='MEDIA_GRANT_INVALID')
    return 'unavailable'
  return 'offline'
}

/**
 * Private OBS->RTMPS->MediaMTX->HTTPS HLS viewer. No third-party iframe,
 * publisher credential, recording, background auto-connect or file upload.
 * Every HLS resource is authorized independently by the HTTPS gateway.
 */
export function AdaHlsPlayer({shiftId,isLive}:{shiftId:string;isLive:boolean}){
  const videoRef=React.useRef<HTMLVideoElement|null>(null)
  const hlsRef=React.useRef<null|{destroy():void;startLoad(startPosition?:number):void}>(null)
  const grantRef=React.useRef<ProtectedMediaGrant|null>(null)
  const requestRef=React.useRef<AbortController|null>(null)
  const renewalRef=React.useRef<ReturnType<typeof setTimeout>|null>(null)
  const reconnectRef=React.useRef<ReturnType<typeof setTimeout>|null>(null)
  const generationRef=React.useRef(0)
  const mountedRef=React.useRef(true)
  const [status,setStatus]=React.useState<PlayerStatus>('idle')
  const [audioOn,setAudioOn]=React.useState(false)

  const teardown=React.useCallback(()=>{
    generationRef.current++
    requestRef.current?.abort()
    requestRef.current=null
    if(renewalRef.current){clearTimeout(renewalRef.current);renewalRef.current=null}
    if(reconnectRef.current){clearTimeout(reconnectRef.current);reconnectRef.current=null}
    hlsRef.current?.destroy()
    hlsRef.current=null
    grantRef.current=null // JWT never enters React state, URL, storage or logs.
    const video=videoRef.current
    if(video){
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  },[])
  React.useEffect(()=>{
    mountedRef.current=true
    return ()=>{mountedRef.current=false;teardown()}
  },[teardown])
  React.useEffect(()=>{
    teardown() // shifting source ends the previous local HLS authorization.
  },[shiftId,isLive,teardown])

  const stop=React.useCallback((next:PlayerStatus='idle')=>{
    teardown()
    if(mountedRef.current){setStatus(next);setAudioOn(false)}
  },[teardown])

  const connect=React.useCallback(async()=>{
    if(!gateEnabled||!isLive||status==='connecting'||status==='buffering'
      ||status==='playing'||status==='reconnecting')return
    teardown()
    const run=generationRef.current
    setStatus('connecting')
    const controller=new AbortController()
    requestRef.current=controller
    const current=()=>mountedRef.current&&generationRef.current===run
    const renew=async():Promise<void>=>{
      if(!current())return
      const previous=grantRef.current
      const fresh=await fetchMediaGrant(shiftId,controller.signal)
      if(!current())return
      if(previous&&fresh.mediaUrl!==previous.mediaUrl){
        stop('denied')
        return
      }
      grantRef.current=fresh
      renewalRef.current=setTimeout(()=>{
        void renew().catch((cause:unknown)=>{
          if(current())stop(errorStatus(cause))
        })
      },nextMediaGrantCheckDelay(fresh))
    }
    try{
      await renew()
      if(!current()||!grantRef.current)return
      const {default:Hls}=await import('hls.js')
      if(!current())return
      if(!Hls.isSupported()){stop('unsupported');return}
      const video=videoRef.current
      if(!video){stop('offline');return}
      video.muted=true
      const hls=new Hls({
        lowLatencyMode:false,liveSyncDurationCount:3,maxBufferLength:12,backBufferLength:6,
        xhrSetup:(xhr,url)=>{
          const grant=grantRef.current
          if(!current()||!grant)throw new Error('MEDIA_GRANT_EXPIRED')
          const bearer=mediaAuthorizationHeader(url,grant)
          xhr.withCredentials=false
          xhr.setRequestHeader('Authorization',bearer)
        },
      })
      hlsRef.current=hls
      let triedRecovery=false
      hls.on(Hls.Events.MEDIA_ATTACHED,()=>{
        if(current()&&grantRef.current)hls.loadSource(grantRef.current.mediaUrl)
      })
      hls.on(Hls.Events.MANIFEST_PARSED,()=>{
        if(!current())return
        setStatus('buffering')
        void video.play().catch(()=>{
          if(current())setStatus('buffering')
        })
      })
      hls.on(Hls.Events.ERROR,(_event,data)=>{
        if(!current())return
        if(data.response?.code===401||data.response?.code===403){
          stop('denied')
          return
        }
        if(!data.fatal)return
        if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&!triedRecovery){
          triedRecovery=true
          setStatus('reconnecting')
          reconnectRef.current=setTimeout(()=>{
            if(current()&&grantRef.current)hls.startLoad(-1)
          },1800)
          return
        }
        stop('offline')
      })
      hls.attachMedia(video)
    }catch(cause){
      if(current())stop(errorStatus(cause))
    }
  },[isLive,shiftId,status,stop,teardown])

  if(!gateEnabled||!isLive)return null
  const busy=['connecting','buffering','reconnecting'].includes(status)
  const running=['connecting','buffering','playing','reconnecting'].includes(status)
  return <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3"
    data-testid="ada-hls-player" aria-label="Nguồn video OBS bảo mật theo ca">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4 w-4 text-slate-600" />Nguồn OBS bảo mật
        </h4>
        <p className="mt-1 text-xs text-slate-500">
          Chỉ xem ca được cấp quyền. Nguồn video độc lập với TikTok LIVE Studio.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? <Button variant="outline" size="sm" type="button" onClick={()=>stop()}
          data-testid="stop-protected-hls"><Square className="mr-2 h-4 w-4" />Dừng xem</Button>
          : <Button type="button" size="sm" onClick={()=>void connect()}
            data-testid="start-protected-hls">
            {isError(status)?<RefreshCw className="mr-2 h-4 w-4"/>:<Play className="mr-2 h-4 w-4"/>}
            {isError(status)?'Thử kết nối lại':'Xem nguồn OBS'}
          </Button>}
        {running&&<Button variant="outline" size="sm" type="button"
          onClick={()=>setAudioOn(prev=>!prev)} data-testid="toggle-protected-hls-audio">
          {audioOn?<Volume2 className="mr-2 h-4 w-4"/>:<VolumeX className="mr-2 h-4 w-4"/>}
          {audioOn?'Tắt tiếng':'Bật tiếng'}
        </Button>}
      </div>
    </div>
    <p className={'mt-2 text-xs '+(isError(status)?'text-amber-800':'text-slate-600')}
      role={isError(status)?'alert':'status'} data-testid="protected-hls-status">
      {busy&&<RefreshCw className="mr-1 inline h-3 w-3 animate-spin" />}
      {statusText[status]}
    </p>
    <video ref={videoRef} playsInline controls autoPlay muted={!audioOn}
      onPlaying={()=>{if(mountedRef.current&&grantRef.current)setStatus('playing')}}
      onWaiting={()=>{if(mountedRef.current&&grantRef.current)setStatus('buffering')}}
      className={'mt-3 max-h-[560px] w-full rounded-lg bg-black object-contain '+(running?'':'hidden')}
      data-testid="protected-hls-video" aria-label="Livestream nội bộ từ OBS" />
    <p className="mt-2 text-xs text-slate-500">
      Video có thể trễ vài giây. Không ghi hình, không tải file về Drive.
      Safari/iPhone chưa hỗ trợ nguồn bảo mật này; dùng Edge/Chrome máy tính.
    </p>
  </section>
}
