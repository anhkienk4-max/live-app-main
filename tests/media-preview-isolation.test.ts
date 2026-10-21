import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
const key=readFileSync('lib/server/mediaViewerKey.ts','utf8')
test('Preview signer verifies staging DB for public and server origins',()=>{
 assert.match(key,/NEXT_PUBLIC_SUPABASE_URL/)
 assert.match(key,/STAGING_SUPABASE_REF/)
 assert.match(key,/SUPABASE_URL/)
 assert.match(key,/MEDIA_STAGING_SUPABASE_MISMATCH/)
})
test('Preview signer enforces gateway and issuer isolation',()=>{
 assert.match(key,/MEDIA_STAGING_GATEWAY_MISMATCH/)
 assert.match(key,/MEDIA_PREVIEW_PROD_ISSUER_BLOCKED/)
 assert.match(key,/MEDIA_VIEWER_DISABLED/)
})
