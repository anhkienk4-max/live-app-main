import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyRc19ProductionUatHost,
  RC19_PRODUCTION_ORIGIN,
  RC19_PRODUCTION_SUPABASE_REF,
} from '../lib/uat/rc19ProductionUatHostPolicy.ts'

test('Production UAT allows only the exact Production application origin', () => {
  assert.equal(classifyRc19ProductionUatHost(new URL(`${RC19_PRODUCTION_ORIGIN}/reports`)), null)
  for (const address of [
    'http://ops5729.top/',
    'https://www.ops5729.top/',
    'https://assets.ops5729.top/file.png',
    'https://livestream-ops-demo-abcdefghi-livestream2.vercel.app/login',
    'https://another-project.vercel.app/api/data',
  ]) {
    assert.equal(classifyRc19ProductionUatHost(new URL(address)), 'UNAUTHORIZED_APP_HOST')
  }
})

test('Production UAT allows only the pinned Production Supabase origin', () => {
  assert.equal(classifyRc19ProductionUatHost(new URL(`https://${RC19_PRODUCTION_SUPABASE_REF}.supabase.co/auth/v1/token`)), null)
  for (const address of [
    'https://amagnzebmmuqiptmrjmc.supabase.co/auth/v1/token',
    'http://egdjnpmoasarrttvhgds.supabase.co/auth/v1/token',
    'https://egdjnpmoasarrttvhgds.supabase.co:8443/auth/v1/token',
  ]) {
    assert.equal(classifyRc19ProductionUatHost(new URL(address)), 'UNAUTHORIZED_SUPABASE_PROJECT')
  }
})

test('only static font hosts are allowed outside Production app and Supabase origins', () => {
  for (const address of ['https://fonts.googleapis.com/css2?family=Inter', 'https://fonts.gstatic.com/s/inter.woff2']) {
    assert.equal(classifyRc19ProductionUatHost(new URL(address)), null)
  }
  for (const address of [
    'http://fonts.googleapis.com/css2?family=Inter',
    'https://fonts.googleapis.com:8443/css2?family=Inter',
    'https://cdn.example.com/static/logo.svg',
  ]) {
    assert.equal(classifyRc19ProductionUatHost(new URL(address)), 'UNAUTHORIZED_EXTERNAL_HOST')
  }
})
