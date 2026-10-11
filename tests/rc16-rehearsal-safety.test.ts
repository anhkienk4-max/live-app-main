import test from 'node:test'
import assert from 'node:assert/strict'
import { assertIsolatedContainer, assertIsolatedCI } from './rc16-rehearsal-safety.mjs'
import { readFileSync } from 'node:fs'

const info = { Config: { Image: 'postgres:17-alpine' }, HostConfig: { NetworkMode: 'none', PortBindings: {} }, Mounts: [] }
test('PG17 rehearsal permits only an isolated container', () => {
  assert.doesNotThrow(() => assertIsolatedContainer(info, '17'))
  for (const candidate of [
    { ...info, Config: { Image: 'postgres:16-alpine' } },
    { ...info, HostConfig: { ...info.HostConfig, NetworkMode: 'bridge' } },
    { ...info, HostConfig: { ...info.HostConfig, PortBindings: { '5432/tcp': [] } } },
    { ...info, Mounts: [{ Type: 'bind' }] },
  ]) assert.throws(() => assertIsolatedContainer(candidate, '17'))
})
test('synthetic fixture manifest has independently reconciled minutes, rounding and active totals', () => {
  const manifest = JSON.parse(readFileSync('tests/fixtures/rc16f_synthetic_uat.json', 'utf8'))
  for (const f of manifest.fixtures.filter(f => f.start)) {
    assert.equal((Date.parse(f.end)-Date.parse(f.start))/60000, f.actual_minutes)
    assert.equal(Math.round(100000*((f.payable_minutes-f.ot_minutes)+f.ot_minutes*1.5)/60), f.gross_vnd)
  }
  assert.equal(manifest.fixtures.reduce((n, f) => n+(f.final_net_vnd ?? 0), 0), manifest.period.net_vnd)
  assert.equal(manifest.fixtures.find(f => f.id==='UNKNOWN').gross_vnd, null)
  const checklist = readFileSync(manifest.checklist, 'utf8')
  assert.equal((checklist.match(/^\| [APWS]\d\d \|/gm) ?? []).length, 37)
})
test('CI loopback rehearsal rejects local CI flags and routing overrides', () => {
  const env = { CI: 'true', GITHUB_ACTIONS: 'true', PGHOST: 'localhost', PGPORT: '5432', PGDATABASE: 'postgres' }
  assert.doesNotThrow(() => assertIsolatedCI(env))
  for (const override of [{ GITHUB_ACTIONS: '' }, { PGHOST: 'db.example.com' }, { PGHOSTADDR: '1.2.3.4' }, { PGOPTIONS: '-c search_path=other' }, { PGSERVICE: 'cloud' }]) {
    assert.throws(() => assertIsolatedCI({ ...env, ...override }))
  }
})
