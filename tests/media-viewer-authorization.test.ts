import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {isMediaPath,mayReadMediaShift} from '../lib/media/mediaViewerPolicy.ts'

const now=Date.parse('2026-10-21T05:00:00Z')
const view={
 viewerId:'auth-1', now,
 shift:{id:'shift-1',brand_id:'brand-1',platform_id:'tiktok',studio:'ADA HCM',
   status:'live',start_at:'2026-10-21T04:00:00Z',end_at:'2026-10-21T06:00:00Z',deleted_at:null},
 grant:{auth_user_id:'auth-1',shift_id:'shift-1',active:true,
   valid_from:'2026-10-21T04:30:00Z',valid_until:'2026-10-21T05:30:00Z'},
 route:{brand_id:'brand-1',platform_id:'tiktok',studio:'ADA HCM',active_shift_id:'shift-1',media_path:'studio_poc_01',active:true}
}
test('viewer grant requires exact authenticated user, shift and studio media binding',()=>{
  assert.equal(mayReadMediaShift(view),true)
  assert.equal(mayReadMediaShift({...view,viewerId:'other'}),false)
  assert.equal(mayReadMediaShift({...view,grant:{...view.grant,shift_id:'other'}}),false)
  assert.equal(mayReadMediaShift({...view,shift:{...view.shift,brand_id:'other'}}),false)
  assert.equal(mayReadMediaShift({...view,shift:{...view.shift,platform_id:'shopee'}}),false)
  assert.equal(mayReadMediaShift({...view,route:{...view.route,studio:'Hanoi'}}),false)
  assert.equal(mayReadMediaShift({...view,route:{...view.route,active_shift_id:'shift-2'}}),false)
  assert.equal(mayReadMediaShift({...view,grant:{...view.grant,active:false}}),false)
  assert.equal(mayReadMediaShift({...view,route:{...view.route,active:false}}),false)
  assert.equal(mayReadMediaShift({...view,shift:{...view.shift,status:'completed'}}),false)
  assert.equal(mayReadMediaShift({...view,shift:{...view.shift,deleted_at:'2026-10-21'}}),false)
})
test('schedule and grant validity are enforced, no permissive missing values',()=>{
  assert.equal(mayReadMediaShift({...view,now:Date.parse('2026-10-21T04:00:00Z')}),false)
  assert.equal(mayReadMediaShift({...view,now:Date.parse('2026-10-21T05:30:00Z')}),false)
  assert.equal(mayReadMediaShift({...view,grant:{...view.grant,valid_until:'invalid'}}),false)
  assert.equal(mayReadMediaShift({...view,shift:{...view.shift,studio:''}}),false)
})
test('media path cannot be chosen arbitrarily by user-supplied URL',()=>{
  for(const good of ['studio_poc_01','a','feed9'])assert.equal(isMediaPath(good),true)
  for(const bad of ['/all_others','../secret','HTTPS://other','Studio-One','path/child','x'.repeat(65)])
    assert.equal(isMediaPath(bad),false)
})
test('viewer API routes require authenticated SSR and do not bypass missing ACL',()=>{
  const handler=readFileSync('lib/server/mediaViewerGrantHandler.ts','utf8')
  assert.match(handler,/requireUser\(request/)
  assert.match(handler,/media_viewer_grants/)
  assert.match(handler,/media_stream_routes/)
  assert.match(handler,/mayReadMediaShift/)
  assert.doesNotMatch(handler,/createSupabaseAdminClient|SUPABASE_SERVICE_ROLE_KEY/)
})
