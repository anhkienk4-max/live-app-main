import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import path from 'node:path'

const manifest = JSON.parse(readFileSync('docs/releases/VERCEL_CLI_RC19_SOURCE_SHA1_MANIFEST_20261028.json','utf8'))
assert.equal(manifest.referenceCommit,'1b96f38a17768e96b92f23056efba4b61cc76f84')
assert.equal(manifest.deploymentId,'dpl_EDJnc6158sDV6gyHq5jfAMZE9rMZ')
assert.ok(manifest.files.length>=500,'Vercel file-list coverage unexpectedly low')
const hash = input => createHash('sha1').update(input).digest('hex')
const mismatch=[]
let matches=0
for(const file of manifest.files){
 if(!file.path || file.path.startsWith('/') || file.path.includes('..') || file.path.includes('\\')) { mismatch.push({file:file.path,reason:'unsafe_path'});continue }
 const full=path.resolve(process.cwd(),file.path)
 if(!full.startsWith(process.cwd()+path.sep) || !existsSync(full)){ mismatch.push({file:file.path,reason:'missing'});continue }
 const data=readFileSync(full)
 const direct=hash(data)
 const asString=data.toString('utf8')
 const crlf=hash(Buffer.from(asString.replace(/\r?\n/g,'\r\n'),'utf8'))
 if(direct===file.sha1||crlf===file.sha1)matches++
 else mismatch.push({file:file.path,reason:'sha1_mismatch'})
}
console.log(JSON.stringify({reference:manifest.referenceCommit,verifiedFiles:matches,listedFiles:manifest.files.length,failures:mismatch.length,coverage:'partial source inventory; Vercel API truncates other paths'}))
if(mismatch.length){
 console.error('NO-GO production source mismatch sample:',JSON.stringify(mismatch.slice(0,30)))
 process.exitCode=1
}
