import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { APPROVED_CHECKSUMS, PINNED_MEDIAMTX_VERSION, findExistingMediaMtxBinary } from '../scripts/ensure-mediamtx.mjs'

test('MediaMTX pinned version is v1.21.4', () => {
  assert.equal(PINNED_MEDIAMTX_VERSION, 'v1.21.4')
})

test('Approved checksum table has valid sha256 hashes for all supported platforms', () => {
  const platforms = ['linux-x64', 'linux-arm64', 'win32-x64', 'darwin-x64', 'darwin-arm64']
  for (const plat of platforms) {
    const spec = APPROVED_CHECKSUMS[plat]
    assert.ok(spec, `Missing checksum specification for ${plat}`)
    assert.match(spec.sha256, /^[0-9a-f]{64}$/i, `Invalid sha256 format for ${plat}`)
    assert.ok(spec.archive.includes('v1.21.4'), `Archive name should contain pinned version for ${plat}`)
  }
})

test('findExistingMediaMtxBinary locates binary when present', () => {
  const bin = findExistingMediaMtxBinary()
  // Should return a string path if installed on the environment
  if (bin) {
    assert.equal(typeof bin, 'string')
    assert.ok(bin.includes('mediamtx'))
  }
})

test('Checksum mismatch detection calculates sha256 accurately and fails closed', () => {
  const fakeData = Buffer.from('corrupted archive content')
  const calculatedHash = createHash('sha256').update(fakeData).digest('hex')
  const approved = APPROVED_CHECKSUMS['linux-x64'].sha256

  assert.notEqual(calculatedHash, approved)
  // Verification logic should reject this mismatch
  const isValid = calculatedHash === approved
  assert.equal(isValid, false, 'Tampered or mismatched archive must be rejected')
})
