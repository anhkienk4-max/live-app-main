#!/usr/bin/env node
// ADA Media PoC per-request authorization sidecar.
// Deliberately local-only. No video bytes are handled by this process.
import { createServer } from 'node:http'
import { createPublicKey, verify } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const allowedPath=/^[a-z][a-z0-9_]{0,63}$/
const encodedPart=/^[A-Za-z0-9_-]+$/
const tokenPattern=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const decode=part=>{
  if(!encodedPart.test(part)||part.length>8000)throw new Error('JWT_ENCODING_INVALID')
  return JSON.parse(Buffer.from(part,'base64url').toString('utf8'))
}
const equalText=(value,expected)=>typeof value==='string'&&value===expected
const isValidTime=(value)=>Number.isSafeInteger(value)&&value>0
const parseMediaPath=uri=>{
  if(typeof uri!=='string'||uri.length>2048||uri.includes('\\')||uri.includes('%')
    ||/[\u0000-\u001f]/.test(uri))return null
  const pathname=uri.split('?',1)[0]
  if(pathname.includes('//')||pathname.includes('..'))return null
  const segments=pathname.split('/').filter(Boolean)
  if(segments.length<1||!allowedPath.test(segments[0]))return null
  return segments[0]
}

export function authorizeMediaRequest({authorization,originalUri,method,publicJwks,issuer,audience,paths,now=Math.floor(Date.now()/1000)}){
  if(method!=='GET'&&method!=='HEAD')return false
  const path=parseMediaPath(originalUri)
  if(!path||!paths.has(path))return false
  const match=typeof authorization==='string' ? authorization.match(tokenPattern) : null
  if(!match||match[1].length>4096)return false
  try{
    const [h,p,s]=match[1].split('.')
    const header=decode(h),claims=decode(p)
    if(!header||header.alg!=='ES256'||header.typ!=='JWT'||!equalText(header.kid,header.kid)
      ||typeof header.kid!=='string'||header.kid.length>100||!claims)return false
    if(!equalText(claims.iss,issuer)||claims.aud!==audience
      ||!isValidTime(claims.exp)||!isValidTime(claims.nbf)
      ||!isValidTime(claims.iat)||claims.exp<=now||claims.nbf>now+5||claims.iat>now+5
      ||claims.exp-claims.iat>300)return false
    const permissions=claims.mediamtx_permissions
    if(!Array.isArray(permissions)||permissions.length!==1
      ||permissions[0]?.action!=='read'||permissions[0]?.path!==path)return false
    const keys=publicJwks?.keys
    if(!Array.isArray(keys)||keys.length>20)return false
    const key=keys.find(k=>k?.kid===header.kid&&k?.kty==='EC'&&k?.crv==='P-256'
      &&k?.alg==='ES256'&&k?.use!=='enc'
      &&typeof k.x==='string'&&typeof k.y==='string'
      &&!('d' in k))
    if(!key)return false
    const signingInput=h+'.'+p
    const sig=Buffer.from(s,'base64url')
    if(sig.length!==64)return false
    return verify('sha256',Buffer.from(signingInput),{
      key:createPublicKey({key:{kty:'EC',crv:'P-256',x:key.x,y:key.y},format:'jwk'}),
      dsaEncoding:'ieee-p1363',
    },sig)
  }catch{return false}
}

export function createMediaAuthGuard({
  jwksUrl,issuer,audience,paths,fetchImpl=fetch,now=()=>Date.now(),
  allowHttpLocal=false,
}){
  if(typeof issuer!=='string'||!issuer.startsWith('https://')||typeof audience!=='string'
    ||audience.length<3||!(paths instanceof Set)||!paths.size
    ||[...paths].some(p=>!allowedPath.test(p)))throw new Error('INVALID_MEDIA_AUTH_CONFIGURATION')
  const url=new URL(jwksUrl)
  if(url.protocol!=='https:'&&!(allowHttpLocal&&url.protocol==='http:'
    &&['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('JWKS_TLS_REQUIRED')
  let cache=null,cacheUntil=0,inflight=null
  const readKeys=async()=>{
    if(cache&&now()<cacheUntil)return cache
    if(!inflight){
      inflight=(async()=>{
        const controller=new AbortController()
        const timer=setTimeout(()=>controller.abort(),3000)
        try{
          const response=await fetchImpl(url,{signal:controller.signal,redirect:'error'})
          if(!response.ok)throw new Error('JWKS_UNAVAILABLE')
          const text=await response.text()
          if(text.length>20000)throw new Error('JWKS_TOO_LARGE')
          const data=JSON.parse(text)
          if(!Array.isArray(data?.keys)||data.keys.length<1||data.keys.length>20)throw new Error('JWKS_INVALID')
          cache=data;cacheUntil=now()+15000
          return cache
        }finally{clearTimeout(timer)}
      })().finally(()=>{inflight=null})
    }
    return inflight
  }
  return createServer(async(req,res)=>{
    // Only Nginx on the same host may call this loopback auth endpoint.
    if(req.method!=='GET'||req.url!=='/verify'){
      res.writeHead(403,{'cache-control':'no-store'}).end()
      return
    }
    const authorization=req.headers.authorization
    const originalUri=req.headers['x-original-uri']
    const method=req.headers['x-request-method']
    // Reject malformed/no Bearer before touching the JWKS endpoint.
    if(typeof authorization!=='string'||!tokenPattern.test(authorization)
      ||!parseMediaPath(originalUri)){
      res.writeHead(403,{'cache-control':'no-store'}).end()
      return
    }
    let permitted=false
    try{
      permitted=authorizeMediaRequest({
        authorization,originalUri,method,
        publicJwks:await readKeys(),issuer,audience,paths,
        now:Math.floor(now()/1000),
      })
    }catch{/* fail-closed if JWKS unavailable */}
    res.writeHead(permitted?204:403,{'cache-control':'no-store'}).end()
  })
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===fileURLToPath(new URL('file://'+process.argv[1]))){
  const paths=new Set((process.env.MEDIA_AUTH_PATHS??'').split(',').filter(Boolean))
  const port=Number(process.env.MEDIA_AUTH_PORT??9191)
  const server=createMediaAuthGuard({
    jwksUrl:process.env.MEDIA_AUTH_JWKS_URL,
    issuer:process.env.MEDIA_AUTH_ISSUER,
    audience:process.env.MEDIA_AUTH_AUDIENCE,
    paths,
    allowHttpLocal:process.env.MEDIA_POC_LOCAL_ONLY==='true',
  })
  if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('BAD_MEDIA_AUTH_PORT')
  server.listen(port,'127.0.0.1',()=>console.log('Media HLS authorization guard listening on loopback'))
}
