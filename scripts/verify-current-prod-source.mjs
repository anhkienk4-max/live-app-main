import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const manifest=JSON.parse(readFileSync('docs/releases/VERCEL_CURRENT_PROD_1609DB_SHA1_20261028.json','utf8'))
assert.equal(manifest.referenceCommit,'1609db684de290e2a49f4c790f8ecdf3d1e9e461')
assert.equal(manifest.deploymentId,'dpl_12GW7ZnV1gw2KmQpXmJtHFBAbKbA')
assert.ok(manifest.files.length>=600)
const base=manifest.referenceCommit
const git=(...args)=>execFileSync('git',args,{maxBuffer:128*1024*1024})
const tracked=new Set(git('ls-tree','-r','--name-only',base).toString('utf8').split(/\r?\n/).filter(Boolean))
const digest=data=>createHash('sha1').update(data).digest('hex')
function exactHashMatch(data,expected){
  if(digest(data)===expected)return 'raw'
  const text=data.toString('utf8')
  if(text.includes('\uFFFD'))return null
  const lf=text.replace(/\r\n/g,'\n')
  if(digest(Buffer.from(lf))===expected)return 'lf'
  if(digest(Buffer.from(lf.replace(/\n/g,'\r\n')))===expected)return 'crlf'
  for(let i=0;i<lf.length;i++){
    if(lf[i]!=='\n')continue
    const before=lf.slice(0,i),after=lf.slice(i)
    if(digest(Buffer.from(before+after.replace(/\n/g,'\r\n')))===expected)return 'mixed-lf-crlf'
    if(digest(Buffer.from(before.replace(/\n/g,'\r\n')+after))===expected)return 'mixed-crlf-lf'
  }
  return null
}
const ephemeral=p=>p.startsWith('supabase/.temp/')||p.startsWith('test-results/')||p.startsWith('test_reports/')||p==='tsconfig.tsbuildinfo'
const errors=[],temp=[],modes={}
// Exact byte mismatches confined to generated project-memory metadata in the
// immutable CLI upload. These are not executable app code; do not count them as
// proof of complete source parity. Any other mismatch remains a hard FAIL.
const knownDocDrift = new Map([
  ['project-memory/current-state.json','ba6b971e33563b61d5e823272496d8fe05173db0'],
  ['project-memory/generated/project-memory.md','8cc11c8ece944df917da672c9cda8c4dbee46fab'],
])
const recordedDocDrift=[]
let trackedFiles=0,matched=0
for(const {path,sha1} of manifest.files){
  if(!path||path.startsWith('/')||path.includes('..')||path.includes('\\')){errors.push({path,reason:'unsafe'});continue}
  if(!tracked.has(path)){if(ephemeral(path))temp.push(path);else errors.push({path,reason:'untracked_source'});continue}
  trackedFiles++
  const mode=exactHashMatch(git('show',base+':'+path),sha1)
  if(!mode){
    if(knownDocDrift.get(path)===sha1){recordedDocDrift.push({path,uploadSha1:sha1});continue}
    errors.push({path,reason:'hash_mismatch'});continue
  }
  matched++;modes[mode]=(modes[mode]??0)+1
}
console.log(JSON.stringify({listed:manifest.files.length,trackedFiles,matched,temporaryFiles:temp.length,documentaryDrift:recordedDocDrift.length,failures:errors.length,modes,completeness:'partial inventory only'}))
if(recordedDocDrift.length!==knownDocDrift.size){console.error('NO-GO unexpected metadata drift count');process.exitCode=1}
if(recordedDocDrift.length)console.warn('SOURCE NOT FULLY IDENTICAL: two generated metadata files differ; staging release requires separate approval: '+JSON.stringify(recordedDocDrift))
if(errors.length){console.error('NO-GO executable/tracked source mismatch: '+JSON.stringify(errors.slice(0,50)));process.exitCode=1}
