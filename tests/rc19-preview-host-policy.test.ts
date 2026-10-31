import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyRc19PreviewHost } from '../lib/uat/rc19PreviewHostPolicy.ts'

const preview = 'https://livestream-ops-demo-abcdefghi-livestream2.vercel.app'

test('RC19 UAT rejects direct Production and its subdomains for reads and writes', () => {
  for (const address of [
    'https://ops5729.top/',
    'https://ops5729.top/api/operations/collection',
    'https://assets.ops5729.top/file.png',
  ]) {
    assert.equal(classifyRc19PreviewHost(new URL(address), preview), 'PRODUCTION_APP_HOST')
  }
})

test('RC19 UAT rejects other Vercel Preview or deployment hosts', () => {
  for (const address of [
    'https://livestream-ops-demo-zzzzzzzzz-livestream2.vercel.app/login',
    'https://another-project.vercel.app/api/data',
  ]) {
    assert.equal(classifyRc19PreviewHost(new URL(address), preview), 'FOREIGN_VERCEL_PREVIEW')
  }
})

test('RC19 UAT allows the immutable approved Preview and approved Staging Supabase host', () => {
  for (const address of [
    preview + '/login',
    'https://amagnzebmmuqiptmrjmc.supabase.co/auth/v1/token?grant_type=password',
    'https://fonts.googleapis.com/css2?family=Inter',
  ]) {
    assert.equal(classifyRc19PreviewHost(new URL(address), preview), null)
  }
})

test('an alternate scheme or port is not the approved Vercel Preview origin', () => {
  assert.equal(
    classifyRc19PreviewHost(new URL('http://livestream-ops-demo-abcdefghi-livestream2.vercel.app/'), preview),
    'FOREIGN_VERCEL_PREVIEW',
  )
})
