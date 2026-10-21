#!/usr/bin/env node
// CI ONLY: mount ACTUAL AdaHlsPlayer React through temporary Next dev page; synthetic backend+MediaMTX.
// Two isolated browser contexts, NOT two physical networks and NOT actual OBS.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createServer as createHttpServer} from 'node:http'
import {connect} from 'node:net'
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateKeyPairSync,sign} from 'node:crypto'
import {once} from 'node:events'
import {chromium} from '@playwright/test'

const dir=mkdtempSync(join(tmpdir(),'ada-browser-hls-'))
const base='tests/fixtures/hls-ci/'
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const kid='test-browser-ephemeral'
const issuer='https://ops5729.top',aud='ada-media-monitor',path='studio_poc_01'
const mediaOrigin='https://media.ops5729.top:8886'
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(action,scope=path,ttl=90){
  const now=Math.floor(Date.now()/1000)
  const message=b64({alg:'ES256',typ:'JWT',kid})+'.'+b64({
    iss:issuer,aud,iat:now,nbf:now-1,exp:now+ttl,
    mediamtx_permissions:[{action,path:scope}]
  })
  return message+'.'+sign('sha256',Buffer.from(message),
    {key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
}
const pause=t=>new Promise(r=>setTimeout(r,t))
const opened=port=>new Promise(resolve=>{
  const c=connect({port,host:'127.0.0.1'})
  c.once('connect',()=>{c.end();resolve(true)})
  c.once('error',()=>resolve(false))
  c.setTimeout(350,()=>{c.destroy();resolve(false)})
})
async function waitUntil(predicate,ms,description){
  const deadline=Date.now()+ms
  while(Date.now()<deadline){
    try{if(await predicate())return}catch{/* retry */}
    await pause(400)
  }
  throw new Error('TIMEOUT: '+description)
}
let jwks,guard,nginx,media,encoder,browser,nextServer
let blockRenewal=false,grantCount=0
const fixturePage='app/visual-qa/media-react-ci/page.tsx'
const configPath='next.config.ts'
let originalNextConfig=null
const logs={}
function start(name,cmd,args,opts={}){
  const p=spawn(cmd,args,opts)
  logs[name]=''
  p.stdout?.on('data',x=>{logs[name]+=x.toString()})
  p.stderr?.on('data',x=>{logs[name]+=x.toString()})
  return p
}
try{
  for(const exe of ['docker','ffmpeg','openssl']){
    const result=spawnSync(exe,[exe==='docker'?'--version':exe==='openssl'?'version':'-version'],{encoding:'utf8'})
    assert.equal(result.status,0,exe+' must be installed')
  }
  const key=join(dir,'key.pem'),cert=join(dir,'cert.pem'),config=join(dir,'mediamtx.yml')
  const certStatus=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,'-out',cert,'-days','1','-subj','/CN=ops5729.top',
    '-addext','subjectAltName=DNS:ops5729.top,DNS:media.ops5729.top'],{encoding:'utf8'})
  assert.equal(certStatus.status,0,'ephemeral TLS certificate')
  const jwksBody=JSON.stringify({keys:[{
    ...publicKey.export({format:'jwk'}),kid,use:'sig',alg:'ES256'
  }]})
  jwks=createHttpServer((request,response)=>{
    if(request.url!=='/jwks'){response.writeHead(404).end();return}
    response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(jwksBody)
  })
  jwks.listen(0,'127.0.0.1')
  await once(jwks,'listening')
  const jwksPort=jwks.address().port

  let mediamtxConf=readFileSync(base+'mediamtx.yml','utf8')
  const replacements=[
    ['authJWTJWKS: https://ops5729.top/api/media/jwks',
      'authJWTJWKS: http://127.0.0.1:'+jwksPort+'/jwks'],
    ['rtmpsAddress: :1936','rtmpsAddress: 127.0.0.1:1936'],
    ['hlsAddress: :8888','hlsAddress: 127.0.0.1:8888'],
    ['hlsAllowOrigins: ["https://ops5729.top"]',
      'hlsAllowOrigins: ["https://ops5729.top:8899"]'],
    ['rtmpServerKey: /etc/letsencrypt/live/media.ops5729.top/privkey.pem','rtmpServerKey: '+key],
    ['rtmpServerCert: /etc/letsencrypt/live/media.ops5729.top/fullchain.pem','rtmpServerCert: '+cert]
  ]
  for(const [from,to] of replacements){
    assert.equal(mediamtxConf.split(from).length,2,'MediaMTX config anchor changed: '+from)
    mediamtxConf=mediamtxConf.replace(from,to)
  }
  writeFileSync(config,mediamtxConf)
  guard=start('guard',process.execPath,[base+'hls-auth-guard.mjs'],{
    env:{...process.env,MEDIA_AUTH_JWKS_URL:'http://127.0.0.1:'+jwksPort+'/jwks',
      MEDIA_AUTH_ISSUER:issuer,MEDIA_AUTH_AUDIENCE:aud,MEDIA_AUTH_PATHS:path,
      MEDIA_AUTH_PORT:'9191',MEDIA_POC_LOCAL_ONLY:'true'}
  })
  await waitUntil(()=>opened(9191),12000,'JWT verifier loopback')

  let nginxConf=readFileSync(base+'nginx-hls.conf.example','utf8')
  nginxConf=nginxConf.replace('listen 443 ssl;','listen 127.0.0.1:8886 ssl;')
    .replace('ssl_certificate /etc/letsencrypt/live/media.ops5729.top/fullchain.pem;',
      'ssl_certificate '+cert+';')
    .replace('ssl_certificate_key /etc/letsencrypt/live/media.ops5729.top/privkey.pem;',
      'ssl_certificate_key '+key+';')
    .replace(/https:\/\/ops5729\.top/g,'https://ops5729.top:8899')
  const nginxPath=join(dir,'nginx.conf')
  writeFileSync(nginxPath,nginxConf)
  nginx=start('nginx','docker',['run','--rm','--network','host',
    '-v',dir+':'+dir+':ro','-v',nginxPath+':/etc/nginx/conf.d/default.conf:ro',
    'nginx:1.28.0-alpine'])
  await waitUntil(()=>opened(8886),35000,'Nginx HTTPS')
  media=start('mediamtx','docker',['run','--rm','--network','host','--read-only',
    '-v',dir+':'+dir+':ro','bluenviron/mediamtx:1.20.0',config])
  await waitUntil(async()=>await opened(1936)&&await opened(8888),35000,'MediaMTX ports')
  encoder=start('ffmpeg','ffmpeg',['-nostdin','-hide_banner','-loglevel','warning',
    '-re','-f','lavfi','-i','testsrc2=size=320x180:rate=15',
    '-re','-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
    '-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-g','30',
    '-pix_fmt','yuv420p','-b:v','350k','-c:a','aac','-b:a','64k','-f','flv',
    'rtmps://127.0.0.1:1936/'+path+'?token='+encodeURIComponent(jwt('publish'))])
  // Do not confuse an HLS startup 404 with a cookie/auth error: MediaMTX
  // may accept the RTMPS connection before FFmpeg publishes the first keyframe.
  await waitUntil(()=>logs.mediamtx.includes('stream is available and online'),35000,
    'FFmpeg published tracks to MediaMTX path')
  await pause(4500) // allow the HLS muxer to produce multiple fMP4 segments.
  console.log('PASS RTMPS path online and HLS initial media segments warmed')
  // Test-only route is materialized in CI checkout, NOT committed or deployed.
  // Real Next App Router compiles the production AdaHlsPlayer React component.
  mkdirSync('app/visual-qa/media-react-ci',{recursive:true})
  writeFileSync(fixturePage,"'use client'\n"+
    "import * as React from 'react'\n"+
    "import {AdaHlsPlayer} from '@/components/features/live/AdaHlsPlayer'\n"+
    "export default function TestView(){\n"+
    " const [id,setId]=React.useState('shift-browser-ci')\n"+
    " const [live,setLive]=React.useState(true)\n"+
    " return <main><h1>ADA CI React media viewer</h1>\n"+
    " <button data-testid='switch-shift' onClick={()=>setId('another-shift')}>Switch shift</button>\n"+
    " <button data-testid='end-shift' onClick={()=>setLive(false)}>End shift</button>\n"+
    " <AdaHlsPlayer key={id+String(live)} shiftId={id} isLive={live}/>\n"+
    " </main> }\n")
  originalNextConfig=readFileSync(configPath,'utf8')
  assert.ok(originalNextConfig.includes('allowedDevOrigins: ["127.0.0.1"]'))
  writeFileSync(configPath,originalNextConfig.replace('allowedDevOrigins: ["127.0.0.1"]',
    'allowedDevOrigins: ["127.0.0.1", "ops5729.top"]'))
  nextServer=start('next',process.execPath,[
    'node_modules/next/dist/bin/next','dev','-p','8899','-H','127.0.0.1',
    '--experimental-https','--experimental-https-key',key,
    '--experimental-https-cert',cert
  ],{env:{...process.env,NODE_ENV:'development',
    NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_ANON_KEY:'',
    NEXT_PUBLIC_MEDIA_PLAYER_UI_ENABLED:'true',
    NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN:mediaOrigin}})
  await waitUntil(()=>opened(8899),45000,'ephemeral Next HTTPS with real React route')
  browser=await chromium.launch({
    headless:true,
    args:['--host-resolver-rules=MAP ops5729.top 127.0.0.1, MAP media.ops5729.top 127.0.0.1']
  })
  const contexts=[], pages=[]
  const mediaRequests=[]
  // page.route mocks only viewer-grant HTTP; media flows to real Nginx/MediaMTX.
  // This is NOT a signed-in business-user staging deployment.
  for(let i=0;i<2;i++){
    const ctx=await browser.newContext({ignoreHTTPSErrors:true})
    contexts.push(ctx)
    await ctx.route('**/api/media/viewer-grant',async route=>{
      const req=route.request()
      let data=null
      try{data=req.postDataJSON()}catch{/* malformed request denied */}
      const valid=!blockRenewal&&req.method()==='POST'&&data?.shiftId==='shift-browser-ci'
      if(!valid){
        return route.fulfill({status:403,contentType:'application/json',
          headers:{'cache-control':'no-store'},body:JSON.stringify({ok:false})})
      }
      grantCount++
      return route.fulfill({status:200,contentType:'application/json',
        headers:{'cache-control':'no-store'},
        body:JSON.stringify({ok:true,shiftId:'shift-browser-ci',
          mediaUrl:mediaOrigin+'/'+path+'/index.m3u8',
          token:jwt('read'),expiresAt:new Date(Date.now()+90_000).toISOString()})})
    })
    const page=await ctx.newPage()
    page.on('pageerror',error=>console.error('REACT_PAGE_ERROR',i,error.message.slice(0,400)))
    page.on('requestfailed',request=>{
      if(request.url().includes('media.ops5729.top:8886'))console.error('REACT_MEDIA_REQUEST_FAILED',i,new URL(request.url()).pathname,request.failure()?.errorText)
    })
    page.on('request',async request=>{
      if(!request.url().includes('media.ops5729.top:8886'))return
      const headers=await request.allHeaders()
      if(request.method()!=='OPTIONS'){
        mediaRequests.push({viewer:i,pathname:new URL(request.url()).pathname,
          bearer:(headers.authorization??'').startsWith('Bearer ')})
      }
    })
    pages.push(page)
    await page.goto('https://ops5729.top:8899/visual-qa/media-react-ci',
      {waitUntil:'domcontentloaded',timeout:60000})
    await page.getByTestId('start-protected-hls').waitFor({timeout:35000})
    assert.equal(mediaRequests.filter(x=>x.viewer===i).length,0,
      'Media requested before explicit start click')
    await page.getByTestId('start-protected-hls').click()
  }
  console.log('PASS two independent HTTPS browser contexts reached isolated ADA fixture')
  for(const [index,page] of pages.entries()){
    try{
      await page.waitForFunction(()=>{
        const video=document.querySelector('[data-testid="protected-hls-video"]')
        return video&&video.videoWidth>0&&video.currentTime>0.8&&!video.paused
      },null,{timeout:24000})
    }catch(error){
      const info=await page.evaluate(()=>{
        const v=document.querySelector('[data-testid="protected-hls-video"]')
        return {status:document.querySelector('[data-testid="protected-hls-status"]')?.textContent,
          paused:v?.paused,readyState:v?.readyState,currentTime:v?.currentTime,
          networkState:v?.networkState,videoWidth:v?.videoWidth,srcPresent:Boolean(v?.src),
          mediaRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('media.ops5729.top')).length}
      }).catch(e=>({error:String(e)}))
      console.error('REACT_VIEWER_FAILURE_DIAGNOSTIC',JSON.stringify({index,info,
        observedMediaRequests:mediaRequests.filter(m=>m.viewer===index).length}))
      throw error
    }
    const result=await page.evaluate(()=>{
      const video=document.querySelector('[data-testid="protected-hls-video"]')
      return {width:video.videoWidth,currentTime:video.currentTime,muted:video.muted,
        status:document.querySelector('[data-testid="protected-hls-status"]')?.textContent}
    })
    assert.ok(result.width>0&&result.currentTime>0.8,'No actual React player frames')
    assert.equal(result.muted,true,'Video should initially start muted')
    console.log('PASS real ADA React viewer '+(index+1)+' decodedWidth='+result.width+
      ' playbackSeconds='+result.currentTime.toFixed(2))
  }
  await waitUntil(()=>mediaRequests.filter(m=>m.bearer&&m.pathname.endsWith('.mp4')).length>=2,7000,
    'browser Authorization on actual fMP4 resource requests')
  assert.ok(mediaRequests.filter(x=>!x.bearer).length===0,
    'Protected browser media request missing Bearer: '+JSON.stringify(mediaRequests))
  assert.ok(mediaRequests.some(x=>x.pathname.endsWith('.m3u8')),
    'missing browser manifest HTTPS request')
  console.log('PASS real Chromium HLS.js attached Bearer to all captured media requests')
  // Need the actual component's periodic entitlement recheck (<=20 sec).
  blockRenewal=true
  for(const [index,page] of pages.entries()){
    await page.getByTestId('protected-hls-status').getByText(
      /Không có quyền xem ca này/
    ).waitFor({timeout:27000})
    const stopped=await page.evaluate(()=>{
      const video=document.querySelector('[data-testid="protected-hls-video"]')
      return {paused:video.paused,src:video.getAttribute('src'),
        status:document.querySelector('[data-testid="protected-hls-status"]')?.textContent}
    })
    assert.ok(stopped.paused&&stopped.src===null,
      'React player did not fail closed: '+JSON.stringify(stopped))
    console.log('PASS real React viewer '+(index+1)+' revoked and cleared video')
  }
  assert.ok(grantCount>=4,'React grant revalidation not observed')
  // Switching a shift after a revoked session must not leak old requests.
  await pages[0].getByTestId('switch-shift').click()
  await pages[0].getByTestId('protected-hls-status').getByText(
    /Chưa kết nối nguồn OBS bảo mật/
  ).waitFor({timeout:12000})
  console.log('PASS React shift switch clears media and grants')
  console.log('PASS ACTUAL REACT PLAYER AGAINST ISOLATED GATEWAY (NOT STAGING USER OR TWO NETWORKS)')
  for(const ctx of contexts)await ctx.close()
}catch(error){
  console.error('FAIL browser protected HLS: '+(error?.stack??error))
  for(const [name,log] of Object.entries(logs))console.error('LOG '+name+': '+log.slice(-2200))
  process.exitCode=1
}finally{
  await browser?.close().catch(()=>{})
  encoder?.kill('SIGTERM')
  media?.kill('SIGTERM')
  nginx?.kill('SIGTERM')
  guard?.kill('SIGTERM')
  nextServer?.kill('SIGTERM')
  await new Promise(done=>jwks?jwks.close(done):done())
  await pause(350)
  rmSync('app/visual-qa/media-react-ci',{recursive:true,force:true})
  if(originalNextConfig!==null)writeFileSync(configPath,originalNextConfig)
  rmSync(dir,{recursive:true,force:true})
}
