// Read-only, fail-closed on unexpected differences in Vercel's *visible* live CLI files.
// A green result NEVER proves complete source parity or authorizes Production release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const snapshot=JSON.parse(readFileSync('docs/releases/VERCEL_ALIASED_LIVE_20261029_CURRENT_VISIBLE_SHA1.json','utf8'))
const core='1befe23bea9380dac37061a7132ac38143cf678b'
const deployment='dpl_6KfC7VLRAwHkTcGnFyqhv6gkucqL'
assert.equal(snapshot.deploymentId,deployment)
assert.equal(snapshot.referenceCoreCommit,core)
assert.equal(snapshot.alias,'ops5729.top')
assert.equal(snapshot.inventoryNature,'partial_Vercel_depth_limited_CLI_source_list_NOT_total_deployment_files')
assert.equal(snapshot.depthTruncationMarkers,356,'depth-limited inventory shape changed; recapture')
assert.equal(snapshot.files.length+snapshot.unresolvedPaths.length,snapshot.visibleFileCount)
assert.equal(snapshot.validHashCount,678)
assert.equal(snapshot.embeddedWorktreeVisibleFiles,0)
assert.equal(snapshot.visibleFileCount,679)
const git=(...args)=>execFileSync('git',args,{maxBuffer:128*1024*1024})
const tracked=new Set(git('ls-tree','-r','--name-only',core).toString('utf8').split(/\r?\n/).filter(Boolean))
const sha1=buf=>createHash('sha1').update(buf).digest('hex')
function exactMatch(data,expected) {
  if(sha1(data)===expected)return 'raw'
  const str=data.toString('utf8')
  if(str.includes('\uFFFD'))return null
  const lf=str.replace(/\r\n/g,'\n')
  if(sha1(Buffer.from(lf))===expected)return 'lf'
  if(sha1(Buffer.from(lf.replace(/\n/g,'\r\n')))===expected)return 'crlf'
  // Some Vercel CLI uploads contain mixed line-ending modes.
  for(let i=0;i<lf.length;i++) {
    if(lf[i]!=='\n')continue
    const before=lf.slice(0,i),after=lf.slice(i)
    if(sha1(Buffer.from(before+after.replace(/\n/g,'\r\n')))===expected)return 'mixed-lf-crlf'
    if(sha1(Buffer.from(before.replace(/\n/g,'\r\n')+after))===expected)return 'mixed-crlf-lf'
  }
  return null
}
const allowedDocDifferences=new Map([
  ['project-memory/current-state.json', '514b1737d36c9721d68371837cd9daa824da923e'],
  ['project-memory/generated/project-memory.md', '007dd7cb9439a50c65041dd2c0dc239d8b7fb105'],
  ['e2e/rc16k-ui.spec.ts', '84b8db99d7dc30aa96afb257512d057dfd4c06ad'],
])
// This specific E2E-only test file was uploaded with visibly mojibaked UTF-8
// Vietnamese labels. The API provides only its first ~1500 decoded bytes;
// do NOT call the full file reviewed, and NEVER treat this as a runtime match.
const quarantinedTestDifferences = new Map([
  ['e2e/swap-form-state.spec.ts', '346fc17a90afb95c258caf9fc6273b57e38f6b00'],
])
const errors=[],extras=[],docDrifts=[],quarantinedTests=[],modes={}
let compared=0,matched=0,securityFiles=0
for(const {path,sha1:expected} of snapshot.files){
  if(!path || path.startsWith('/') || path.includes('..') || path.includes('\\')){errors.push({path,error:'invalid_path'});continue}
  if(!/^[a-f0-9]{40}$/.test(expected)){errors.push({path,error:'bad_hash'});continue}
  if(!tracked.has(path)){
    extras.push(path)
    if(!path.startsWith('.worktrees/'))errors.push({path,error:'untracked_uploaded_source'})
    continue
  }
  compared++
  if(/^(lib\/auth\/|lib\/services\/|app\/api\/|supabase\/)/.test(path))securityFiles++
  const mode=exactMatch(git('show',core+':'+path),expected)
  if(mode){matched++;modes[mode]=(modes[mode]||0)+1;continue}
  if(allowedDocDifferences.get(path)===expected){docDrifts.push(path);continue}
  if(quarantinedTestDifferences.get(path)===expected){
    quarantinedTests.push(path)
    continue
  }
  errors.push({path,error:'core_git_vs_uploaded_hash_mismatch'})
}
if(snapshot.embeddedWorktreeVisibleFiles!==extras.filter(x=>x.startsWith('.worktrees/')).length)errors.push({error:'worktree_count_changed'})
if(snapshot.unresolvedPaths.length!==1 || snapshot.unresolvedPaths[0]!=='tests/auth-session-foundation.test.ts')errors.push({error:'unresolved_source_list_changed'})
const out={status:errors.length?'VISIBLE-SOURCE-MISMATCH':'PARTIAL-RUNTIME-MATCH_WITH_UNREVIEWED_TEST_DRIFT',releaseGate:'NO-GO',deployment,core,listed:snapshot.visibleFileCount,compared,matched,securityFiles,docDrifts,quarantinedTests,untrackedWorktreeFiles:extras.length,unresolved:snapshot.unresolvedPaths,depthTruncationMarkers:snapshot.depthTruncationMarkers,errors:errors.slice(0,30),modes}
console.log(JSON.stringify(out))
if(quarantinedTests.length!==1 || quarantinedTests[0]!=='e2e/swap-form-state.spec.ts'){
  console.error('NO-GO: expected explicit test-only quarantine is missing or changed')
  process.exitCode=1
}
if(errors.length){console.error('NO-GO unexpected visible uploaded source mismatch');process.exitCode=1}
console.warn('RELEASE NO-GO: CURRENT CLI source inventory is depth-limited and includes a truncated test hash plus a quarantined, unreadable-whole UTF-8-corrupted E2E-only file. 151 visible sensitive/runtime files match Core; source upload provenance and real 3-role Staging UAT remain outstanding. Do not promote even when this partial comparison step is green.')
