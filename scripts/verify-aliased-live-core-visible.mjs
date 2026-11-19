// Read-only, fail-closed on unexpected differences in Vercel's *visible* live CLI files.
// A green result NEVER proves complete source parity or authorizes Production release.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const snapshot=JSON.parse(readFileSync('docs/releases/VERCEL_ALIASED_LIVE_20261029_VISIBLE_SHA1.json','utf8'))
const core='1befe23bea9380dac37061a7132ac38143cf678b'
const deployment='dpl_5eqzn3dHR9pKnnna8MvBY2F7AnMX'
assert.equal(snapshot.deploymentId,deployment)
assert.equal(snapshot.referenceCoreCommit,core)
assert.equal(snapshot.alias,'ops5729.top')
assert.equal(snapshot.inventoryNature,'partial_Vercel_depth_limited_CLI_source_list_NOT_total_deployment_files')
assert.ok(snapshot.depthTruncationMarkers>=600,'inventory completeness caveat removed')
assert.equal(snapshot.files.length+snapshot.unresolvedPaths.length,snapshot.visibleFileCount)
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
  ['project-memory/current-state.json', 'e18f6cf5f188e0ecfc794d0bb5d828e4de7ec473'],
  ['project-memory/generated/project-memory.md', '4fa49f5ed2aaa592e19703110bd0323231b94055'],
])
const errors=[],extras=[],docDrifts=[],modes={}
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
  errors.push({path,error:'core_git_vs_uploaded_hash_mismatch'})
}
if(snapshot.embeddedWorktreeVisibleFiles!==extras.filter(x=>x.startsWith('.worktrees/')).length)errors.push({error:'worktree_count_changed'})
if(snapshot.unresolvedPaths.length!==1 || snapshot.unresolvedPaths[0]!=='e2e/rc16k-ui.spec.ts')errors.push({error:'unresolved_source_list_changed'})
const out={status:errors.length?'VISIBLE-SOURCE-MISMATCH':'VISIBLE-COMPARISON-ONLY',deployment,core,listed:snapshot.visibleFileCount,compared,matched,securityFiles,docDrifts,untrackedWorktreeFiles:extras.length,unresolved:snapshot.unresolvedPaths,depthTruncationMarkers:snapshot.depthTruncationMarkers,errors:errors.slice(0,30),modes}
console.log(JSON.stringify(out))
if(errors.length){console.error('NO-GO unexpected visible uploaded source mismatch');process.exitCode=1}
console.warn('RELEASE NO-GO: Vercel source file listing is incomplete due to depth limits, includes an uploaded nested worktree, and contains an unresolved truncated hash. A successful comparison attests ONLY checked visible files; independent complete Git SHA/deploy attestation and real Staging role UAT remain required.')
