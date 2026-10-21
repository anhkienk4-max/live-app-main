#!/usr/bin/env node
/**
 * Fail-closed staging-only renderer for the MediaMTX + Nginx reference configs.
 * Zero network calls, zero service start, zero DB writes, zero secrets output.
 * Output is a reviewed config bundle, NOT a deployment.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIP } from 'node:net'

export const STAGING_SUPABASE_URL='https://amagnzebmmuqiptmrjmc.supabase.co'
const PRODUCTION_APP='https://ops5729.top'
const PRODUCTION_MEDIA='https://media.ops5729.top'
const DNS=/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
const STREAM=/^[a-z][a-z0-9_]{0,63}$/

function fail(code){throw new Error(code)}
function strictOrigin(raw, code){
  if(typeof raw!=='string'||raw.length>250||raw.trim()!==raw)fail(code)
  let url
  try{url=new URL(raw)}catch{fail(code)}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'
    ||url.search||url.hash||url.origin!==raw||!DNS.test(url.hostname)
    ||isIP(url.hostname)!==0)fail(code)
  return url
}
function exactlyOnce(text,from,to,code){
  if(text.split(from).length!==2)fail('TEMPLATE_DRIFT_'+code)
  return text.replace(from,to)
}
function assertNoWildcardCors(text){
  if(/Access-Control-Allow-Origin\s+["']\*/i.test(text)||/hlsAllowOrigins:\s*\[\s*["']\*/.test(text))
    fail('WILDCARD_MEDIA_CORS_FORBIDDEN')
}
export function renderMediaStagingConfigs(input,templates){
  if(input?.MEDIA_STAGING_TARGET!=='staging')fail('STAGING_TARGET_REQUIRED')
  if(input.MEDIA_STAGING_SUPABASE_URL!==STAGING_SUPABASE_URL)fail('STAGING_SUPABASE_REF_MISMATCH')
  const app=strictOrigin(input.MEDIA_STAGING_APP_ORIGIN,'STAGING_APP_ORIGIN_INVALID')
  const media=strictOrigin(input.MEDIA_STAGING_MEDIA_ORIGIN,'STAGING_MEDIA_ORIGIN_INVALID')
  if(app.origin===PRODUCTION_APP||media.origin===PRODUCTION_MEDIA||app.origin===media.origin
    ||app.hostname===media.hostname)fail('STAGING_ORIGIN_ISOLATION_FAILED')
  if(input.MEDIA_STAGING_PATH!=='studio_poc_01')fail('STAGING_SINGLE_STUDIO_PATH_REQUIRED')
  if(!STREAM.test(input.MEDIA_STAGING_PATH))fail('STAGING_PATH_INVALID')
  if(input.MEDIA_STAGING_EXPECTED_VERCEL_ENV!=='preview')fail('STAGING_PREVIEW_REQUIRED')
  if(input.VERCEL_ENV==='production'||input.VERCEL_TARGET_ENV==='production')fail('STAGING_ON_PRODUCTION_FORBIDDEN')
  if(!templates||Object.values(templates).some(x=>typeof x!=='string'))fail('MEDIA_CONFIG_TEMPLATE_REQUIRED')

  const certificate='/etc/letsencrypt/live/'+media.hostname+'/fullchain.pem'
  const privateCertificate='/etc/letsencrypt/live/'+media.hostname+'/privkey.pem'
  let mt=templates.mediamtx,ng=templates.nginx,compose=templates.compose
  for(const [from,to,tag] of [
    ['authJWTJWKS: https://ops5729.top/api/media/jwks',
      'authJWTJWKS: '+app.origin+'/api/media/jwks','JWKS'],
    ['authJWTIssuer: https://ops5729.top','authJWTIssuer: '+app.origin,'ISSUER'],
    ['hlsAllowOrigins: ["https://ops5729.top"]',
      'hlsAllowOrigins: ["'+app.origin+'"]','MEDIA_CORS'],
    ['rtmpServerKey: /etc/letsencrypt/live/media.ops5729.top/privkey.pem',
      'rtmpServerKey: '+privateCertificate,'RTMPS_KEY_PATH'],
    ['rtmpServerCert: /etc/letsencrypt/live/media.ops5729.top/fullchain.pem',
      'rtmpServerCert: '+certificate,'RTMPS_CERT_PATH'],
  ])mt=exactlyOnce(mt,from,to,tag)
  for(const [from,to,tag] of [
    ['server_name media.ops5729.top;','server_name '+media.hostname+';','NGINX_HOST'],
    ['ssl_certificate /etc/letsencrypt/live/media.ops5729.top/fullchain.pem;',
      'ssl_certificate '+certificate+';','NGINX_CERT'],
    ['ssl_certificate_key /etc/letsencrypt/live/media.ops5729.top/privkey.pem;',
      'ssl_certificate_key '+privateCertificate+';','NGINX_KEY'],
    ['add_header Access-Control-Allow-Origin "https://ops5729.top" always;',
      'add_header Access-Control-Allow-Origin "'+app.origin+'" always;','NGINX_CORS'],
  ])ng=exactlyOnce(ng,from,to,tag)
  assertNoWildcardCors(mt)
  assertNoWildcardCors(ng)

  // Defense in depth: reject removal of the per-resource auth boundary.
  for(const invariant of ['auth_request /__ada_media_auth;',
    'proxy_pass http://127.0.0.1:9191/verify;',
    'proxy_pass http://127.0.0.1:8888;',
    'add_header Access-Control-Allow-Credentials "true" always;',
    'proxy_cache off;']){
    if(!ng.includes(invariant))fail('STAGING_NGINX_AUTH_GUARD_MISSING')
  }
  for(const invariant of ['authMethod: jwt','authJWTExclude: []',
    'rtmpEncryption: strict','hlsDirectory: ""','record: false',
    'studio_poc_01:','webrtc: false','rtsp: false']){
    if(!mt.includes(invariant))fail('STAGING_MEDIAMTX_SECURITY_GUARD_MISSING')
  }
  if(!compose.includes('"127.0.0.1:8888:8888/tcp"')||!compose.includes('read_only: true')
    ||/["']8888:8888\/tcp["']/.test(compose))fail('STAGING_COMPOSE_EXPOSURE_FORBIDDEN')
  // Preserve canonical compose; let the operator REVIEW AND ALLOWLIST RTMPS 1936.
  // The renderer does not touch iptables, expose a network or create any service.
  return Object.freeze({
    nginx:ng,mediamtx:mt,compose,
    manifest:{
      mode:'staging-only',app_origin:app.origin,
      media_origin:media.origin,supabase_project_ref:'amagnzebmmuqiptmrjmc',
      media_path:input.MEDIA_STAGING_PATH,
      jwks_origin:app.origin,
      ports:{https:'443',rtmps:'1936 (firewall allowlist mandatory)',
        hls:'127.0.0.1:8888',auth:'127.0.0.1:9191'},
      authorized:false,deployed:false,external_uat:false,
      cautions:['Reference bundle only, not a DNS/TLS/provisioning script',
        'Do not enable media without an approved preview deployment, isolated JWKS signer and explicit grants',
        'Do not start production OBS, do not auto-seed users or routes'],
    }
  })
}
export function renderFromRepository(input,root='.'){
  return renderMediaStagingConfigs(input,{
    nginx:readFileSync(join(root,'infra/media-poc/nginx-hls.conf.example'),'utf8'),
    mediamtx:readFileSync(join(root,'infra/media-poc/mediamtx.yml'),'utf8'),
    compose:readFileSync(join(root,'infra/media-poc/compose.yaml'),'utf8'),
  })
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3||process.argv[2]!=='--render-reviewed-files')
      fail('USAGE_RENDER_REVIEWED_FILES_ONLY')
    const directory=process.env.MEDIA_STAGING_CONFIG_OUTPUT
    if(!directory||!directory.startsWith('/tmp/ada-media-staging-')
      ||directory.includes('..')||directory.length>200)fail('REVIEW_OUTPUT_PATH_REQUIRED')
    const result=renderFromRepository(process.env)
    mkdirSync(directory,{recursive:true,mode:0o700})
    for(const [filename,content] of [
      ['nginx-hls.conf',result.nginx],['mediamtx.yml',result.mediamtx],
      ['compose.yaml',result.compose],
      ['review-manifest.json',JSON.stringify(result.manifest,null,2)+'\n'],
    ])writeFileSync(join(directory,filename),content,{mode:0o600,flag:'wx'})
    console.log('PASS staging-only reference media configs written for operator review (NOT DEPLOYED)')
  }catch(error){
    console.error(error?.message||'STAGING_CONFIG_RENDER_FAILED')
    process.exitCode=1
  }
}
