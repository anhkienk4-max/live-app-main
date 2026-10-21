import assert from 'node:assert/strict'
import test from 'node:test'
import {renderFromRepository,renderMediaStagingConfigs,STAGING_SUPABASE_URL}
 from '../scripts/render-media-staging-config.mjs'
const input={
 MEDIA_STAGING_TARGET:'staging',
 MEDIA_STAGING_SUPABASE_URL:STAGING_SUPABASE_URL,
 MEDIA_STAGING_APP_ORIGIN:'https://ada-ci-staging.example.test',
 MEDIA_STAGING_MEDIA_ORIGIN:'https://media-ci-staging.example.test',
 MEDIA_STAGING_PATH:'studio_poc_01',
 MEDIA_STAGING_EXPECTED_VERCEL_ENV:'preview',
 VERCEL_ENV:'preview'
}
test('rendered staging gateway binds exact preview JWKS issuer, HTTPS host and allowed CORS',()=>{
 const result=renderFromRepository(input)
 assert.match(result.mediamtx,/^authJWTIssuer: https:\/\/ada-ci-staging\.example\.test$/m)
 assert.match(result.mediamtx,/^authJWTJWKS: https:\/\/ada-ci-staging\.example\.test\/api\/media\/jwks$/m)
 assert.match(result.mediamtx,/^hlsAllowOrigins: \["https:\/\/ada-ci-staging\.example\.test"\]$/m)
 assert.match(result.nginx,/server_name media-ci-staging\.example\.test;/)
 assert.match(result.nginx,/Access-Control-Allow-Origin "https:\/\/ada-ci-staging\.example\.test"/)
 assert.match(result.nginx,/auth_request \/__ada_media_auth;/)
 assert.match(result.nginx,/proxy_pass http:\/\/127\.0\.0\.1:9191\/verify;/)
 assert.match(result.nginx,/proxy_pass http:\/\/127\.0\.0\.1:8888;/)
 assert.match(result.nginx,/Access-Control-Allow-Credentials "true"/)
 assert.match(result.compose,/"127\.0\.0\.1:8888:8888\/tcp"/)
 assert.equal(result.manifest.authorized,false)
 assert.equal(result.manifest.deployed,false)
 assert.equal(result.manifest.external_uat,false)
 assert.doesNotMatch(result.mediamtx,/^authJWTIssuer: https:\/\/ops5729\.top$/m)
 assert.doesNotMatch(result.nginx,/server_name media\.ops5729\.top;/)
})
test('staging renderer refuses production Supabase project, production origins and mismatched host',()=>{
 for(const invalid of [
  {MEDIA_STAGING_SUPABASE_URL:'https://egdjnpmoasarrttvhgds.supabase.co'},
  {MEDIA_STAGING_SUPABASE_URL:'https://evil.example'},
  {MEDIA_STAGING_TARGET:'production'},
  {MEDIA_STAGING_APP_ORIGIN:'https://ops5729.top'},
  {MEDIA_STAGING_MEDIA_ORIGIN:'https://media.ops5729.top'},
  {MEDIA_STAGING_MEDIA_ORIGIN:input.MEDIA_STAGING_APP_ORIGIN},
  {VERCEL_ENV:'production'},
  {VERCEL_TARGET_ENV:'production'},
  {MEDIA_STAGING_EXPECTED_VERCEL_ENV:'production'},
  {MEDIA_STAGING_PATH:'all_others'},
  {MEDIA_STAGING_PATH:'../../admin'},
 ]){
  assert.throws(()=>renderFromRepository({...input,...invalid}),JSON.stringify(invalid))
 }
})
test('staging renderer rejects wildcard CORS, path/credential injection and insecure origins',()=>{
 for(const origin of [
  'http://ada-ci-staging.example.test',
  'https://user:password@ada-ci-staging.example.test',
  'https://ada-ci-staging.example.test/path',
  'https://ada-ci-staging.example.test:443',
  'https://ada-ci-staging.example.test/',
  'https://ada-ci-staging.example.test?token=oops',
  'https://*.example.test',
  'https://site.example.test\nfoo',
  'https://localhost',
 ])assert.throws(()=>renderFromRepository({...input,MEDIA_STAGING_APP_ORIGIN:origin}),origin)
 for(const origin of [
  'http://media-ci-staging.example.test',
  'https://media-ci-staging.example.test:8443',
  'https://127.0.0.1',
  'https://media-ci-staging.example.test/',
 ])assert.throws(()=>renderFromRepository({...input,MEDIA_STAGING_MEDIA_ORIGIN:origin}),origin)
})
test('drift or removal of per-request media guard fails closed',()=>{
 const templates={
  nginx:'bad auth_request removed',
  mediamtx:'authMethod: jwt',
  compose:'ports: []'
 }
 assert.throws(()=>renderMediaStagingConfigs(input,templates),/TEMPLATE_DRIFT/)
 const real=renderFromRepository(input)
 assert.throws(()=>renderMediaStagingConfigs(input,{
  nginx:real.nginx.replace('auth_request /__ada_media_auth;','auth_request off;'),
  mediamtx:real.mediamtx,compose:real.compose
 }),/TEMPLATE_DRIFT|STAGING_NGINX_AUTH_GUARD_MISSING/)
})
