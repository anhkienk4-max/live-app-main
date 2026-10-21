#!/usr/bin/env node
// MediaMTX synthetic smoke only: ephemeral JWT/TLS and test-pattern stream.
// No studio credentials, TikTok connection, real media, or production writes.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { connect } from 'node:net'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync, sign as signEs256 } from 'node:crypto'
import { once } from 'node:events'

const dir=mkdtempSync(join(tmpdir(),'ada-mediapoc-'))
const kp=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const kid='test-only-ephemeral'
const jwk={...kp.publicKey.export({format:'jwk'}),kid,use:'sig',alg:'ES256'}
const iss='https://ops5729.top',aud='ada-media-monitor',path='studio_poc_01'
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt=(action,scope=path,delta=180)=>{
  const now=Math.floor(Date.now()/1000)
  const signed=enc({alg:'ES256',typ:'JWT',kid})+'.'+enc({
    iss,aud,iat:now,nbf:now-1,exp:now+delta,
    mediamtx_permissions:[{action,path:scope}]
  })
  return signed+'.'+signEs256('sha256',Buffer.from(signed),{key:kp.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
}
const server=createServer((req,res)=>{
  if(req.url!=='/jwks'){res.writeHead(404).end();return}
  res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({keys:[jwk]}))
})
let media,encoder,medialog='',encodelog=''
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const connectable=port=>new Promise(resolve=>{
  const c=connect({host:'127.0.0.1',port})
  c.once('connect',()=>{c.end();resolve(true)})
  c.once('error',()=>resolve(false))
  c.setTimeout(300,()=>{c.destroy();resolve(false)})
})
const request=async (url,token)=>{
  const ctl=new AbortController(),tid=setTimeout(()=>ctl.abort(),3500)
  try{return await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{},redirect:'manual',signal:ctl.signal})}
  finally{clearTimeout(tid)}
}
async function retry(fn,ms){
  const deadline=Date.now()+ms
  let reason
  while(Date.now()<deadline){
    try{const result=await fn();if(result)return result}catch(err){reason=err}
    await sleep(400)
  }
  throw new Error('Timeout: '+(reason?.message??'not ready'))
}
async function deny(url,token,what){
  const res=await request(url,token)
  assert.ok([401,403].includes(res.status),what+': expected 401/403, got '+res.status)
  console.log('PASS',what,res.status)
}
try{
  for(const bin of ['docker','ffmpeg','openssl']){
    const p=spawnSync(bin,[bin==='docker'?'--version':bin==='openssl'?'version':'-version'],{encoding:'utf8'})
    if(p.error||p.status!==0)throw new Error('Missing '+bin)
  }
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const jwksPort=server.address().port
  const key=join(dir,'key.pem'),cert=join(dir,'cert.pem'),config=join(dir,'mediamtx.yml')
  const tls=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{encoding:'utf8'})
  assert.equal(tls.status,0,'Synthetic certificate generation failed')
  let text=readFileSync('infra/media-poc/mediamtx.yml','utf8')
  for(const [old,newValue] of [
    ['authJWTJWKS: https://ops5729.top/api/media/jwks','authJWTJWKS: http://127.0.0.1:'+jwksPort+'/jwks'],
    ['rtmpsAddress: :1936','rtmpsAddress: 127.0.0.1:1936'],
    ['hlsAddress: :8888','hlsAddress: 127.0.0.1:8888'],
    ['rtmpServerKey: /etc/letsencrypt/live/media.ops5729.top/privkey.pem','rtmpServerKey: '+key],
    ['rtmpServerCert: /etc/letsencrypt/live/media.ops5729.top/fullchain.pem','rtmpServerCert: '+cert],
  ]){assert.equal(text.split(old).length,2,'Changed config anchor '+old);text=text.replace(old,newValue)}
  writeFileSync(config,text)
  media=spawn('docker',['run','--rm','--network','host','--read-only','--name','ada-media-smoke-'+process.pid,'-v',dir+':'+dir+':ro','bluenviron/mediamtx:1.20.0',config])
  media.stdout.on('data',x=>medialog+=x.toString())
  media.stderr.on('data',x=>medialog+=x.toString())
  await retry(async()=>await connectable(1936)&&await connectable(8888),35000)
  console.log('PASS real MediaMTX starts with JWT/RTMPS and host-loopback HLS')
  encoder=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','warning',
    '-re','-f','lavfi','-i','testsrc2=size=320x180:rate=15',
    '-re','-f','lavfi','-i','sine=frequency=440:sample_rate=44100',
    '-c:v','libx264','-preset','ultrafast','-tune','zerolatency','-g','30',
    '-pix_fmt','yuv420p','-b:v','350k','-c:a','aac','-b:a','64k','-f','flv',
    'rtmps://127.0.0.1:1936/'+path+'?token='+encodeURIComponent(jwt('publish'))
  ])
  encoder.stderr.on('data',x=>encodelog+=x.toString())
  const origin='http://127.0.0.1:8888/'+path+'/'
  const manifest=origin+'index.m3u8',reader=jwt('read')
  const playlist=await retry(async()=>{
    if(encoder.exitCode!==null)throw new Error('FFmpeg stopped: '+encodelog.slice(-700))
    const res=await request(manifest,reader)
    if(res.ok){const s=await res.text();if(s.includes('#EXTINF'))return s}
    return null
  },50000)
  assert.match(playlist,/#EXTM3U/)
  console.log('PASS synthetic video+audio publishes over RTMPS and HLS playlist loads with a viewer JWT')
  await deny(manifest,null,'anonymous playlist')
  await deny(manifest,jwt('read','another_studio'),'cross-studio playlist')
  await deny(manifest,jwt('publish'),'publisher-token cannot read playlist')
  await deny(manifest,jwt('read',path,-60),'expired viewer playlist')
  const resources=[...playlist.matchAll(/URI="([^"]+)"/g)].map(a=>a[1])
    .concat(playlist.split('\n').filter(x=>x&&!x.startsWith('#')).map(x=>x.trim()))
  const unique=[...new Set(resources)].filter(x=>x&&!/^https?:\/\//.test(x))
  assert.ok(unique.length>0,'Missing HLS init/media resources')
  for(const item of unique.slice(0,3)){
    const child=new URL(item,origin).toString()
    await deny(child,null,'anonymous HLS segment '+item)
    await deny(child,jwt('read','another_studio'),'cross-studio HLS segment '+item)
    const authorized=await request(child,reader)
    assert.equal(authorized.status,200,'Authorized segment '+item)
    console.log('PASS protected segment',item)
  }
  console.log('PASS SYNTHETIC MEDIA POC; NOT PHYSICAL OBS UAT')
}catch(err){
  console.error('FAIL MediaMTX synthetic smoke: '+(err?.message??err))
  console.error('Gateway diagnostic tail: '+medialog.slice(-1900))
  console.error('Encoder diagnostic tail: '+encodelog.slice(-1000))
  process.exitCode=1
}finally{
  encoder?.kill('SIGTERM')
  media?.kill('SIGTERM')
  server.close()
  rmSync(dir,{recursive:true,force:true})
}
