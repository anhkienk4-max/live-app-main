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
let trackedFiles=0,matched=0
for(const {path,sha1} of manifest.files){
  if(!path||path.startsWith('/')||path.includes('..')||path.includes('\\')){errors.push({path,reason:'unsafe'});continue}
  if(!tracked.has(path)){if(ephemeral(path))temp.push(path);else errors.push({path,reason:'untracked_source'});continue}
  trackedFiles++
  const mode=exactHashMatch(git('show',base+':'+path),sha1)
  if(!mode){errors.push({path,reason:'hash_mismatch'});continue}
  matched++;modes[mode]=(modes[mode]??0)+1
}
console.log(JSON.stringify({listed:manifest.files.length,trackedFiles,matched,temporaryFiles:temp.length,failures:errors.length,modes,completeness:'partial inventory only'}))
if(errors.length){console.error('NO-GO source mismatch: '+JSON.stringify(errors.slice(0,50)));process.exitCode=1}
