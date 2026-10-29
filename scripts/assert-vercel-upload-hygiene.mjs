import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const vercel=readFileSync('.vercelignore','utf8').split(/\r?\n/).map(x=>x.trim())
const git=readFileSync('.gitignore','utf8').split(/\r?\n/).map(x=>x.trim())
for(const rule of ['.worktrees/','**/.worktrees/','.env','.env.*','test-results/','test_reports/','.migration-backup/']){
  assert.ok(vercel.includes(rule),'Missing Vercel CLI upload exclusion: '+rule)
}
assert.ok(git.includes('.worktrees/'),'Git must ignore local secondary worktrees')
assert.ok(vercel.includes('!.env.example'),'Documented nonsecret example must remain accessible')
for(const required of ['public/','components/','app/','lib/','supabase/','package.json','pnpm-lock.yaml']){
  assert.ok(!vercel.includes(required),'Do not exclude required application paths: '+required)
}
console.log('Vercel CLI packaging hygiene contract PASS (static rules only; real upload validation still required).')
