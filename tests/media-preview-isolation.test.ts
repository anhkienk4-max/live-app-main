import assert from 'node:assert/strict'
import test from 'node:test'
import {generateKeyPairSync} from 'node:crypto'
import {loadMediaKeySettings} from '../lib/server/mediaViewerKey.ts'
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const pem=pair.privateKey.export({format:'pem',type:'pkcs8'}).toString()
const env={
 MEDIA_VIEWER_ENABLED:'true',VERCEL:'1',VERCEL_ENV:'preview',
 MEDIA_JWT_KID:'media_preview_test',
 MEDIA_JWT_ES256_PRIVATE_KEY_PEM:pem,
 MEDIA_APP_ORIGIN:'https://stage-ada.example.test',
 MEDIA_JWT_ISSUER:'https://stage-ada.example.test',
 MEDIA_PUBLIC_HLS_ORIGIN:'https://stage-media.example.test',
 NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN:'https://stage-media.example.test',
 NEXT_PUBLIC_SUPABASE_URL:'https://amagnzebmmuqiptmrjmc.supabase.co',
 SUPABASE_URL:'https://amagnzebmmuqiptmrjmc.supabase.co',
}
function read(overrides:Record<string,string>={}){
 return loadMediaKeySettings({...env,...overrides})
}
test('valid staging Preview may load scoped issuer',()=>{
 const settings=read()
 assert.equal(settings.issuer,env.MEDIA_APP_ORIGIN)
 assert.equal(settings.mediaOrigin,env.MEDIA_PUBLIC_HLS_ORIGIN)
})
test('Preview rejects production database on both sides',()=>{
 for(const key of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL']){
  assert.throws(()=>read({[key]:'https://egdjnpmoasarrttvhgds.supabase.co'}))
 }
})
test('Preview rejects mismatch between media gateway and browser origin',()=>{
 assert.throws(()=>read({NEXT_PUBLIC_MEDIA_GATEWAY_ORIGIN:'https://other.example.test'}))
 assert.throws(()=>read({MEDIA_APP_ORIGIN:'https://ops5729.top',MEDIA_JWT_ISSUER:'https://ops5729.top'}))
})
test('Preview disabled unless explicitly allowed, never mock or Vercel Production',()=>{
 assert.throws(()=>read({MEDIA_VIEWER_ENABLED:'false'}))
 assert.throws(()=>read({NEXT_PUBLIC_USE_MOCK_DATA:'true'}))
 assert.throws(()=>read({VERCEL_TARGET_ENV:'production'}))
})
