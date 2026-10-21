import assert from 'node:assert/strict'
import test from 'node:test'
import {generateKeyPairSync,sign} from 'node:crypto'
import {authorizeMediaRequest,createMediaAuthGuard} from '../infra/media-poc/hls-auth-guard.mjs'

const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const jwk={...publicKey.export({format:'jwk'}),kid:'test-001',alg:'ES256',use:'sig'}
const publicJwks={keys:[jwk]}
const path='studio_poc_01',issuer='https://ops5729.top',audience='ada-media-monitor'
const now=Math.floor(Date.now()/1000),paths=new Set([path])
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
const token=(action='read',scope=path,overrides={})=>{
  const header=b64({alg:'ES256',kid:'test-001',typ:'JWT'})
  const payload=b64({iss:issuer,aud:audience,iat:now,nbf:now-1,exp:now+120,
    mediamtx_permissions:[{action,path:scope}],...overrides})
  const data=header+'.'+payload
  return data+'.'+sign('sha256',Buffer.from(data),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')
}
const verify=(uri,tok,method='GET')=>authorizeMediaRequest({
  authorization:tok&&'Bearer '+tok,originalUri:uri,method,publicJwks,
  issuer,audience,paths,now,
})

test('JWT grants one exact HLS path for playlist, init fragment and segment',()=>{
  const t=token()
  for(const uri of ['/studio_poc_01/index.m3u8',
    '/studio_poc_01/hls/stream.m3u8',
    '/studio_poc_01/abc_init.mp4?session=abc-123',
    '/studio_poc_01/chunk.m4s?session=abc-123']){
    assert.equal(verify(uri,t),true,uri)
  }
})

test('JWT scope and signature fail closed on every media resource',()=>{
  const uri='/studio_poc_01/abc_init.mp4?session=abc'
  assert.equal(verify(uri,null),false)
  assert.equal(verify(uri,token('publish')),false)
  assert.equal(verify(uri,token('read','other_studio')),false)
  assert.equal(verify(uri,token('read',path,{exp:now-30})),false)
  assert.equal(verify(uri,token('read',path,{aud:'different-audience'})),false)
  assert.equal(verify(uri,token('read',path,{iss:'https://evil.example'})),false)
  assert.equal(verify(uri,token('read',path,{mediamtx_permissions:[
    {action:'read',path},{action:'read',path:'other_studio'}]})),false)
  const original=token(),parts=original.split('.')
  const signature=parts[2]
  const tampered=parts[0]+'.'+parts[1]+'.'+(signature[0]==='A'?'B':'A')+signature.slice(1)
  assert.equal(verify(uri,tampered),false)
  assert.equal(verify(uri,token(),'POST'),false)
  assert.equal(verify('/other_studio/index.m3u8',token()),false)
  for(const bad of ['/studio_poc_01/%2e%2e/x','/studio_poc_01//x',
    '/studio_poc_01/../x','/','/studio_poc_01\\hidden']){
    assert.equal(verify(bad,token()),false,bad)
  }
})

test('localhost auth sidecar denies by default and only allows valid token on exact path',async()=>{
  let hits=0
  const sidecar=createMediaAuthGuard({
    jwksUrl:'https://keys.example.test/jwks',issuer,audience,paths,
    fetchImpl:async()=>{hits++;return Response.json(publicJwks)},
  })
  await new Promise(resolve=>sidecar.listen(0,'127.0.0.1',resolve))
  try{
    const url='http://127.0.0.1:'+sidecar.address().port+'/verify'
    const issue=async(t,uri='/studio_poc_01/frag.m4s')=>{
      const headers={'X-Original-URI':uri,'X-Request-Method':'GET'}
      if(t)headers.Authorization='Bearer '+t
      return (await fetch(url,{headers})).status
    }
    assert.equal(await issue(null),403)
    assert.equal(hits,0,'deny anonymous without network lookup')
    assert.equal(await issue(token()),204)
    assert.equal(await issue(token('read','another')),403)
    assert.equal(await issue(token(),'/other_stream/frag.m4s'),403)
    assert.equal(hits,1,'cache JWKS for multiple fragment requests')
  }finally{await new Promise(resolve=>sidecar.close(resolve))}
})
