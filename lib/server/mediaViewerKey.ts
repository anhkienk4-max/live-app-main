import 'server-only'
import {createPrivateKey,createPublicKey,sign, type KeyObject} from 'node:crypto'
import {isMediaPath} from '@/lib/media/mediaViewerPolicy'
import {resolveSupabaseTarget,STAGING_SUPABASE_REF,PRODUCTION_SUPABASE_REF} from '@/lib/supabase/environmentIdentity'

type MediaKeySettings={
  appOrigin:string;issuer:string;mediaOrigin:string;audience:'ada-media-monitor';
  kid:string;privateKey:KeyObject
}
const noSlash=(v:string)=>v.replace(/\/$/,'')
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
    if(clientRef!==STAGING_SUPABASE_REF||serverRef!==STAGING_SUPABASE_REF
      ||clientRef===PRODUCTION_SUPABASE_REF)
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
export type MediaSigningSettings=ReturnType<typeof loadMediaKeySettings>
