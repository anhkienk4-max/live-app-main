#!/usr/bin/env node
// CI ONLY: signed synthetic FFmpeg video through MediaMTX + Nginx + Chromium.
// Two isolated browser contexts, NOT two physical networks and NOT actual OBS.
import assert from 'node:assert/strict'
import {spawn,spawnSync} from 'node:child_process'
import {createServer as createHttpsServer} from 'node:https'
import {createServer as createHttpServer} from 'node:http'
import {connect} from 'node:net'
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {generateKeyPairSync,sign} from 'node:crypto'
import {once} from 'node:events'
import ts from 'typescript'
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
let jwks,app,guard,nginx,media,encoder,browser
let blockRenewal=false,grantCount=0
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
  const policy=readFileSync('lib/media/hlsPlayerSecurity.ts','utf8')
  const compiled=ts.transpileModule(policy,{compilerOptions:{
    module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022
  }}).outputText
  const hlsjs=readFileSync('node_modules/hls.js/dist/hls.min.js')
  const browserClient=readFileSync(base+'browser-client.mjs')
  const html='<!doctype html><html><head><meta charset="UTF-8"></head><body>'
    +'<video id="viewer" muted controls autoplay playsinline></video>'
    +'<script src="/hls.min.js"></script><script type="module" src="/browser-client.mjs"></script>'
    +'</body></html>'
  app=createHttpsServer({key:readFileSync(key),cert:readFileSync(cert)},async(req,res)=>{
    const route=new URL(req.url,'https://ops5729.top')
    const send=(status,type,body)=>res.writeHead(status,{
      'Content-Type':type,'Cache-Control':'no-store'
    }).end(body)
    if(route.pathname==='/')return send(200,'text/html',html)
    if(route.pathname==='/hls.min.js')return send(200,'application/javascript',hlsjs)
    if(route.pathname==='/policy.mjs')return send(200,'text/javascript',compiled)
    if(route.pathname==='/browser-client.mjs')return send(200,'text/javascript',browserClient)
    if(route.pathname==='/api/media/viewer-grant'&&req.method==='POST'){
      let requestBody=''
      for await(const part of req)requestBody+=part
      const requested=JSON.parse(requestBody||'{}')
      if(blockRenewal||requested.shiftId!=='shift-browser-ci'){
        return send(403,'application/json',JSON.stringify({ok:false}))
      }
      grantCount++
      return send(200,'application/json',JSON.stringify({
        ok:true,shiftId:'shift-browser-ci',
        mediaUrl:mediaOrigin+'/'+path+'/index.m3u8',token:jwt('read'),
        expiresAt:new Date(Date.now()+90_000).toISOString()
      }))
    }
    return send(404,'text/plain','not found')
  })
  app.listen(8899,'127.0.0.1')
  await once(app,'listening')

  browser=await chromium.launch({
    headless:true,
    args:['--host-resolver-rules=MAP ops5729.top 127.0.0.1, MAP media.ops5729.top 127.0.0.1']
  })
  const contexts=[], pages=[]
  const mediaRequests=[]
  for(let i=0;i<2;i++){
    const ctx=await browser.newContext({ignoreHTTPSErrors:true})
    contexts.push(ctx)
    const page=await ctx.newPage()
    page.on('response',async response=>{
      if(!response.url().includes('media.ops5729.top:8886'))return
      if(response.status()===302||response.status()===404){
        const h=await response.allHeaders()
        console.log('MEDIA_REDIRECT_DIAG',JSON.stringify({viewer:i,status:response.status(),
          location:h.location??null,setCookiePresent:Boolean(h['set-cookie']),
          allowCredentials:h['access-control-allow-credentials']??null,
          resource:new URL(response.url()).pathname+new URL(response.url()).search}))
      }
    })
    page.on('request',async request=>{
      if(!request.url().includes('media.ops5729.top:8886'))return
      try{
        const headers=await request.allHeaders()
        const pathname=new URL(request.url()).pathname
        if(request.url().includes('cookieCheck=1'))console.log('MEDIA_COOKIE_DIAG',JSON.stringify({viewer:i,
          cookiePresent:Boolean(headers.cookie),bearerPresent:Boolean(headers.authorization),
          requestOrigin:headers.origin??null}))
        if(request.method()!=='OPTIONS'){
          mediaRequests.push({viewer:i,pathname,
            bearer:(headers.authorization??'').startsWith('Bearer ')})
        }
      }catch{/* request may close while capturing */}
    })
    pages.push(page)
    await page.goto('https://ops5729.top:8899',{waitUntil:'load',timeout:18000})
  }
  console.log('PASS two independent HTTPS browser contexts reached isolated ADA fixture')
  for(const [index,page] of pages.entries()){
    await page.waitForFunction(()=>{
      const s=window.__stats
      return s?.manifest&&s.segments>=2||['failed','fatal','gateway-denied','denied'].includes(s?.state)
    },null,{timeout:60000})
    await page.waitForFunction(()=>{
      const v=document.querySelector('video')
      return v&&v.videoWidth>0&&v.currentTime>0.8&&!v.paused
    },null,{timeout:18000})
    const result=await page.evaluate(()=>({
      stats:window.__stats,
      width:document.querySelector('video').videoWidth,
      currentTime:document.querySelector('video').currentTime
    }))
    if(!result.stats.manifest){
      const cookieNames=(await contexts[index].cookies(mediaOrigin)).map(c=>c.name)
      console.log('MEDIA_COOKIE_JAR',JSON.stringify({viewer:index,cookieNames}))
    }
    assert.ok(result.stats.manifest,'viewer '+index+' HLS manifest: '+JSON.stringify(result))
    assert.ok(result.stats.segments>=2,'viewer '+index+' media segments: '+JSON.stringify(result))
    console.log('PASS independent viewer '+(index+1)+' manifest+segments; decodedWidth='+result.width
      +' playbackSeconds='+result.currentTime.toFixed(2))
  }
  await waitUntil(()=>mediaRequests.filter(m=>m.bearer&&m.pathname.endsWith('.mp4')).length>=2,7000,
    'browser Authorization on actual fMP4 resource requests')
  assert.ok(mediaRequests.filter(x=>!x.bearer).length===0,
    'Protected browser media request missing Bearer: '+JSON.stringify(mediaRequests))
  assert.ok(mediaRequests.some(x=>x.pathname.endsWith('.m3u8')),
    'missing browser manifest HTTPS request')
  console.log('PASS real Chromium HLS.js attached Bearer to all captured media requests')
  // Trigger entitlement revocation; both contexts recheck and stop/clear video.
  blockRenewal=true
  for(const [index,page] of pages.entries()){
    await page.waitForFunction(()=>window.__stats?.state==='denied',null,{timeout:13000})
    const stopped=await page.evaluate(()=>({
      status:window.__stats.state,paused:document.querySelector('video').paused,
      src:document.querySelector('video').getAttribute('src')
    }))
    assert.equal(stopped.status,'denied')
    assert.equal(stopped.paused,true)
    assert.equal(stopped.src,null)
    console.log('PASS viewer '+(index+1)+' denied after entitlement revocation')
  }
  assert.ok(grantCount>=4,'periodic grant revalidation not observed')
  console.log('PASS BROWSER HLS SECURITY HARNESS (2 contexts, NOT 2 networks, NOT REAL OBS)')
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
  await new Promise(done=>app?app.close(done):done())
  await new Promise(done=>jwks?jwks.close(done):done())
  await pause(350)
  rmSync(dir,{recursive:true,force:true})
}
