import 'server-only'
import {createHash,createPrivateKey,createPublicKey,generateKeyPairSync,sign, type KeyObject} from 'node:crypto'
import {isMediaPath} from '@/lib/media/mediaViewerPolicy'
import {PRODUCTION_SUPABASE_REF,resolveSupabaseTarget,STAGING_SUPABASE_REF} from '@/lib/supabase/environmentIdentity'

type MediaKeySettings={
  appOrigin:string;issuer:string;mediaOrigin:string;audience:'ada-media-monitor';
  kid:string;privateKey:KeyObject
}
const GLOBAL_DEV_KEY_SLOT = '__adaDevEphemeralMediaKeyPair' as const
const noSlash=(v:string)=>v.replace(/\/$/,'')
const loopbackOrHttpsOrigin=(raw:string)=>{
  const url=new URL(raw)
  const isLoopback=url.protocol==='http:'&&(url.hostname==='127.0.0.1'||url.hostname==='localhost')
  if((url.protocol!=='https:'&&!isLoopback)||url.username||url.password||url.pathname!=='/'
    ||url.search||url.hash||raw!==noSlash(url.origin))throw new Error('MEDIA_ORIGIN_INVALID')
  return url.origin
}
const httpsOrigin=(raw:string,expectedHost?:string)=>{
  const url=new URL(raw)
  if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'
    ||url.search||url.hash||url.port||raw!==noSlash(url.origin)
    ||expectedHost&&url.hostname!==expectedHost)throw new Error('MEDIA_ORIGIN_INVALID')
  return url.origin
}
/** Loads secret lazily; importing or building the app never issues credentials. */
export function loadMediaKeySettings(env:NodeJS.ProcessEnv=process.env):MediaKeySettings{
  if(env.MEDIA_VIEWER_ENABLED!=='true')throw new Error('MEDIA_VIEWER_DISABLED')
  const privatePem=env.MEDIA_JWT_ES256_PRIVATE_KEY_PEM?.replace(/\\n/g,'\n')
  if(!privatePem||privatePem.length>10000)throw new Error('MEDIA_SIGNING_KEY_MISSING')
  const kid=env.MEDIA_JWT_KID
  if(!kid||!/^[A-Za-z0-9_-]{4,64}$/.test(kid))throw new Error('MEDIA_KID_INVALID')
  const privateKey=createPrivateKey(privatePem)
  const publicKey=createPublicKey(privateKey).export({format:'jwk'})
  if(privateKey.asymmetricKeyType!=='ec'||publicKey.crv!=='P-256')
    throw new Error('MEDIA_KEY_CURVE_INVALID')
  const appOrigin=httpsOrigin(env.MEDIA_APP_ORIGIN??'')
  const issuer=httpsOrigin(env.MEDIA_JWT_ISSUER??'')
  if(issuer!==appOrigin)throw new Error('MEDIA_ISSUER_MISMATCH')
  const mediaOrigin=httpsOrigin(env.MEDIA_PUBLIC_HLS_ORIGIN??'')
  if(mediaOrigin===appOrigin)throw new Error('MEDIA_ORIGIN_COLLISION')
  // A Preview issuer must never operate against the Production database,
  // even if a shared Vercel Preview configuration inherited Production vars.
  if(env.VERCEL_ENV==='preview'){
    if(appOrigin==='https://ops5729.top'
      ||mediaOrigin==='https://media.ops5729.top'
      ||env.MEDIA_JWT_KID?.toLowerCase().startsWith('prod'))
      throw new Error('MEDIA_PREVIEW_PROD_ISSUER_BLOCKED')
    if(env.VERCEL!=='1'||env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='preview'
      ||env.NEXT_PUBLIC_USE_MOCK_DATA==='true')
      throw new Error('MEDIA_PREVIEW_ENV_INVALID')
    const clientUrl=env.NEXT_PUBLIC_SUPABASE_URL
    const serverUrl=env.SUPABASE_URL
    if(!clientUrl||!serverUrl)
      throw new Error('MEDIA_STAGING_SUPABASE_REQUIRED')
    const clientRef=resolveSupabaseTarget(clientUrl).projectRef
    const serverRef=resolveSupabaseTarget(serverUrl).projectRef
    if(clientRef!==STAGING_SUPABASE_REF||serverRef!==STAGING_SUPABASE_REF)
      throw new Error('MEDIA_STAGING_SUPABASE_MISMATCH')
    if(env.NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN!==mediaOrigin)
      throw new Error('MEDIA_STAGING_GATEWAY_MISMATCH')
  }
  return {appOrigin,issuer,mediaOrigin,audience:'ada-media-monitor',kid,privateKey}
}
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url')
export function getPublicMediaJwks(settings:MediaKeySettings){
  const jwk=createPublicKey(settings.privateKey).export({format:'jwk'})
  return {keys:[{kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y,kid:settings.kid,use:'sig',alg:'ES256'}]}
}
export function signMediaViewerGrant({settings,path,now=Date.now()}:{
  settings:MediaKeySettings;path:string;now?:number
}){
  if(!isMediaPath(path)||!Number.isFinite(now))throw new Error('MEDIA_PATH_INVALID')
  const iat=Math.floor(now/1000),exp=iat+90
  const first=encode({alg:'ES256',typ:'JWT',kid:settings.kid})
  const second=encode({iss:settings.issuer,aud:settings.audience,iat,nbf:iat-1,
    exp,mediamtx_permissions:[{action:'read',path}]})
  const message=first+'.'+second
  const signature=sign('sha256',Buffer.from(message),{key:settings.privateKey,dsaEncoding:'ieee-p1363'})
  return {token:message+'.'+signature.toString('base64url'),
    expiresAt:new Date(exp*1000).toISOString(),
    url:settings.mediaOrigin+'/'+path+'/index.m3u8'}
}

export function signMediaPublishGrant({settings,path,sub,now=Date.now()}:{
  settings:MediaKeySettings;path:string;sub?:string;now?:number
}){
  if(!isMediaPath(path)||!Number.isFinite(now))throw new Error('MEDIA_PATH_INVALID')
  const iat=Math.floor(now/1000),exp=iat+90
  const first=encode({alg:'ES256',typ:'JWT',kid:settings.kid})
  const second=encode({iss:settings.issuer,aud:settings.audience,...(sub?{sub}:{}),iat,nbf:iat-1,
    exp,mediamtx_permissions:[{action:'publish',path}]})
  const message=first+'.'+second
  const signature=sign('sha256',Buffer.from(message),{key:settings.privateKey,dsaEncoding:'ieee-p1363'})
  return {token:message+'.'+signature.toString('base64url'),
    expiresAt:new Date(exp*1000).toISOString(),
    whipUrl:settings.mediaOrigin+'/'+path+'/whip'}
}

export function deterministicShiftMediaPath(shiftId:string):string{
  const sanitized=shiftId.trim().toLowerCase().replace(/[^a-z0-9_]+/g,'_').slice(0,40).replace(/^_+|_+$/g,'')||'room'
  const suffix=createHash('md5').update(shiftId).digest('hex').slice(0,8)
  return `shift_${sanitized}_${suffix}`
}

export function loadLiveSessionMediaSettings(env:NodeJS.ProcessEnv=process.env):MediaKeySettings{
  if(env.MEDIA_VIEWER_ENABLED==='true'&&env.MEDIA_DEV_EPHEMERAL_KEY_ENABLED!=='true'){
    return loadMediaKeySettings(env)
  }
  const canUseDevEphemeral=
    env.MEDIA_DEV_EPHEMERAL_KEY_ENABLED==='true'
    &&env.VERCEL!=='1'
    &&!env.VERCEL_ENV
    &&env.NODE_ENV!=='production'
  if(!canUseDevEphemeral){
    return loadMediaKeySettings(env)
  }
  for(const urlKey of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL'] as const){
    const rawUrl=env[urlKey]
    if(rawUrl&&resolveSupabaseTarget(rawUrl).projectRef===PRODUCTION_SUPABASE_REF){
      throw new Error('MEDIA_DEV_PROD_TARGET_FORBIDDEN')
    }
  }
  const configuredPem=env.MEDIA_JWT_ES256_PRIVATE_KEY_PEM?.replace(/\\n/g,'\n')
  let activePair:{kid:string;privateKey:KeyObject}
  if(configuredPem){
    const privateKey=createPrivateKey(configuredPem)
    const jwk=createPublicKey(privateKey).export({format:'jwk'})
    if(privateKey.asymmetricKeyType!=='ec'||jwk.crv!=='P-256'){
      throw new Error('MEDIA_KEY_CURVE_INVALID')
    }
    const kid=env.MEDIA_JWT_KID
    if(!kid||!/^[A-Za-z0-9_-]{4,64}$/.test(kid)){
      throw new Error('MEDIA_KID_INVALID')
    }
    activePair={kid,privateKey}
  }else{
    const globalScope=globalThis as unknown as Record<string,{kid:string;privateKey:KeyObject}|undefined>
    if(!globalScope[GLOBAL_DEV_KEY_SLOT]){
      const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
      globalScope[GLOBAL_DEV_KEY_SLOT]={kid:'ada-dev-ephemeral-p256',privateKey:pair.privateKey}
    }
    activePair=globalScope[GLOBAL_DEV_KEY_SLOT]!
  }
  const appOrigin=loopbackOrHttpsOrigin(env.MEDIA_APP_ORIGIN??env.NEXT_PUBLIC_APP_ORIGIN??'http://127.0.0.1:3210')
  const mediaOrigin=loopbackOrHttpsOrigin(env.MEDIA_ORIGIN??env.NEXT_PUBLIC_MEDIA_ORIGIN??'http://127.0.0.1:8898')
  if(mediaOrigin===appOrigin)throw new Error('MEDIA_ORIGIN_COLLISION')
  return {
    appOrigin,
    issuer:appOrigin,
    mediaOrigin,
    audience:'ada-media-monitor',
    kid:activePair.kid,
    privateKey:activePair.privateKey,
  }
}

export type MediaSigningSettings=ReturnType<typeof loadMediaKeySettings>
