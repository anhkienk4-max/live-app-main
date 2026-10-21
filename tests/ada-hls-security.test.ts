import assert from 'node:assert/strict'
import test from 'node:test'
import {parseProtectedMediaGrant,mediaAuthorizationHeader,nextMediaGrantCheckDelay}
 from '../lib/media/hlsPlayerSecurity.ts'
const now=Date.parse('2026-10-21T06:00:00Z')
const token='ZXlK.eyJhY3Rpb24iOiJyZWFkIn0.U0lHTkVE'
const origin='https://media.ops5729.top'
const response={ok:true,shiftId:'shift-A',token,
 mediaUrl:origin+'/studio_poc_01/index.m3u8',
 expiresAt:new Date(now+90_000).toISOString()}
const read=(override:Record<string,unknown>={})=>
 parseProtectedMediaGrant({...response,...override},'shift-A',origin,now)

test('grant is bound to one shift and expected HTTPS media origin',()=>{
 const grant=read()
 assert.equal(grant.pathPrefix,'/studio_poc_01/')
 assert.equal(grant.expiresAtMs,now+90_000)
 assert.equal(nextMediaGrantCheckDelay(grant,now),20_000)
 assert.throws(()=>read({shiftId:'shift-B'}),/MEDIA_GRANT_INVALID/)
 assert.throws(()=>read({mediaUrl:'https://tiktok.com/studio_poc_01/index.m3u8'}),/MEDIA_ORIGIN_INVALID/)
 assert.throws(()=>read({mediaUrl:origin+'/some/path/index.m3u8'}),/MEDIA_PATH_INVALID/)
 assert.throws(()=>read({mediaUrl:origin+'/studio_poc_01/index.m3u8?token=x'}))
})

test('playlist, init and media segments all receive Bearer',()=>{
 const grant=read()
 for(const resource of ['index.m3u8','stream.m3u8','abc_init.mp4?session=A',
   'abc_seg0.mp4?session=A','abc.m4s?session=A']){
  const url=new URL(resource,grant.mediaUrl).href
  assert.equal(mediaAuthorizationHeader(url,grant,now),'Bearer '+token)
 }
})

test('Authorization is never forwarded to other origins, streams or token-query URLs',()=>{
 const grant=read()
 for(const url of ['https://example.com/studio_poc_01/seg0.mp4',
   'https://media.ops5729.top/studio_other/seg0.mp4',
   'http://media.ops5729.top/studio_poc_01/seg0.mp4',
   'https://media.ops5729.top/studio_poc_01/index.m3u8?jwt=x',
   'https://media.ops5729.top/studio_poc_01/../studio_other/seg0.mp4']){
  assert.throws(()=>mediaAuthorizationHeader(url,grant,now),/MEDIA_RESOURCE_REJECTED/)
 }
 assert.throws(()=>mediaAuthorizationHeader(grant.mediaUrl,grant,now+89_000),/MEDIA_GRANT_EXPIRED/)
})

test('invalid, short or expired JWT grants fail before any media requests',()=>{
 assert.throws(()=>read({expiresAt:new Date(now-1).toISOString()}),/MEDIA_GRANT_EXPIRED/)
 assert.throws(()=>read({expiresAt:new Date(now+4000).toISOString()}),/MEDIA_GRANT_EXPIRED/)
 assert.throws(()=>read({token:'x'.repeat(5000)}),/MEDIA_GRANT_INVALID/)
 assert.throws(()=>read({mediaUrl:'javascript:alert(1)'}))
 assert.throws(()=>parseProtectedMediaGrant(response,'shift-A','http://localhost:8888',now))
})
