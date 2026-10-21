/**
 * Client-side defense-in-depth for ADA Monitor's HLS.js transport.
 * The server RLS + gateway JWT sidecar are authoritative. This guards against
 * accidentally forwarding Bearer credentials to a different media origin.
 */
export type ProtectedMediaGrant = {
  readonly shiftId: string
  readonly mediaUrl: string
  readonly token: string
  readonly expiresAtMs: number
  readonly mediaOrigin: string
  readonly pathPrefix: string
}
const tokenPattern=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
const pathPattern=/^\/([a-z][a-z0-9_]{0,63})\/index\.m3u8$/

export function parseProtectedMediaGrant(
  payload:unknown,shiftId:string,expectedMediaOrigin:string,now=Date.now(),
):ProtectedMediaGrant{
  if(!payload||typeof payload!=='object')throw new Error('MEDIA_GRANT_INVALID')
  const grant=payload as Record<string,unknown>
  if(grant.ok!==true||grant.shiftId!==shiftId||typeof grant.token!=='string'
    ||grant.token.length>4096||!tokenPattern.test(grant.token)
    ||typeof grant.mediaUrl!=='string'||typeof grant.expiresAt!=='string')
    throw new Error('MEDIA_GRANT_INVALID')
  let allowed:URL,url:URL
  try{
    allowed=new URL(expectedMediaOrigin)
    url=new URL(grant.mediaUrl)
  }catch{throw new Error('MEDIA_ORIGIN_INVALID')}
  if(allowed.protocol!=='https:'||allowed.username||allowed.password
    ||allowed.pathname!=='/'||allowed.search||allowed.hash
    ||expectedMediaOrigin!==allowed.origin||url.origin!==allowed.origin
    ||url.username||url.password||url.search||url.hash)
    throw new Error('MEDIA_ORIGIN_INVALID')
  const match=pathPattern.exec(url.pathname)
  if(!match)throw new Error('MEDIA_PATH_INVALID')
  const exp=Date.parse(grant.expiresAt)
  if(!Number.isFinite(now)||!Number.isFinite(exp)
    ||exp<=now+10_000||exp>now+120_000)throw new Error('MEDIA_GRANT_EXPIRED')
  return {shiftId,mediaUrl:url.href,token:grant.token,
    expiresAtMs:exp,mediaOrigin:allowed.origin,pathPrefix:'/'+match[1]+'/'}
}

export function mediaAuthorizationHeader(
  sourceUrl:string,grant:ProtectedMediaGrant,now=Date.now(),
):string{
  if(now>=grant.expiresAtMs-2_000)throw new Error('MEDIA_GRANT_EXPIRED')
  let url:URL
  try{url=new URL(sourceUrl,grant.mediaUrl)}
  catch{throw new Error('MEDIA_RESOURCE_REJECTED')}
  if(url.origin!==grant.mediaOrigin||url.protocol!=='https:'
    ||url.username||url.password||url.hash
    ||!url.pathname.startsWith(grant.pathPrefix)
    ||url.pathname.includes('..')
    ||[...url.searchParams.keys()].some(k=>/^(token|auth|jwt|access_token)$/i.test(k)))
    throw new Error('MEDIA_RESOURCE_REJECTED')
  return 'Bearer '+grant.token
}
export function nextMediaGrantCheckDelay(grant:ProtectedMediaGrant,now=Date.now()):number{
  // Revalidate entitlement every <=20 s. Tokens expire in <=90 s,
  // but a previously issued token cannot be instantly revoked at the gateway.
  return Math.max(0,Math.min(20_000,grant.expiresAtMs-now-25_000))
}
