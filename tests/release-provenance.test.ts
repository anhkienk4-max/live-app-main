import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'
import { createReleaseProvenanceHandler } from '@/lib/server/releaseProvenanceHandler'

const admin:AuthenticatedServerUser={id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin'}
const request=()=>new Request('https://ops.example/api/internal/release-provenance')

test('Admin provenance response binds build SHA, workflow run and Vercel deployment without secrets',async()=>{
  const response=await createReleaseProvenanceHandler({
    resolveUser:async()=>admin,
    env:{
      RC19_BUILD_COMMIT_SHA:'A'.repeat(40),
      RC19_BUILD_WORKFLOW_RUN_ID:'42580721243',
      VERCEL_DEPLOYMENT_ID:'dpl_AbC_123',
      VERCEL_ENV:'production',
      SUPABASE_SECRET_KEY:'must-not-be-returned',
    },
  })(request())
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{
    ok:true,provenance_status:'complete',build_commit_sha:'a'.repeat(40),
    deployment_id:'dpl_AbC_123',build_workflow_run_id:'42580721243',
    vercel_environment:'production',
  })
})

test('Vercel Git SHA fallback remains incomplete without a deployment ID',async()=>{
  const response=await createReleaseProvenanceHandler({
    resolveUser:async()=>admin,
    env:{VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},
  })(request())
  assert.deepEqual(await response.json(),{
    ok:true,provenance_status:'incomplete',build_commit_sha:'b'.repeat(40),
    deployment_id:null,build_workflow_run_id:null,vercel_environment:null,
  })
})

test('Invalid provenance values are omitted and non-admin actors are denied',async()=>{
  const env={RC19_BUILD_COMMIT_SHA:'not-a-sha',VERCEL_GIT_COMMIT_SHA:'c'.repeat(39),
    VERCEL_DEPLOYMENT_ID:'deployment-secret',RC19_BUILD_WORKFLOW_RUN_ID:'../../run'}
  const invalidResponse=await createReleaseProvenanceHandler({resolveUser:async()=>admin,env})(request())
  assert.equal((await invalidResponse.json()).provenance_status,'incomplete')

  const denied=await createReleaseProvenanceHandler({
    resolveUser:async()=>({...admin,id:'auth-member',systemPermission:'member'}),env,
  })(request())
  assert.equal(denied.status,403)
})
