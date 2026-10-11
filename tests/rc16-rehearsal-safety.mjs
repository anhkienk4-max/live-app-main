import assert from 'node:assert/strict'

export function assertIsolatedContainer(info, major) {
  assert.ok(['16', '17'].includes(major), 'Unsupported PostgreSQL major')
  assert.equal(info.Config.Image, `postgres:${major}-alpine`)
  assert.equal(info.HostConfig.NetworkMode, 'none', 'Rehearsal requires network none')
  assert.equal(Object.keys(info.HostConfig.PortBindings ?? {}).length, 0, 'No published ports')
  assert.equal((info.Mounts ?? []).filter(m => m.Type === 'bind').length, 0, 'No host bind mounts')
}

export function assertIsolatedCI(env) {
  assert.equal(env.CI, 'true')
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Loopback writes require disposable GitHub CI')
  assert.equal(env.PGHOST, 'localhost')
  assert.equal(env.PGPORT, '5432')
  assert.equal(env.PGDATABASE, 'postgres')
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGHOSTADDR', 'PGOPTIONS']) {
    assert.ok(!env[key], 'PostgreSQL routing overrides are forbidden')
  }
}
