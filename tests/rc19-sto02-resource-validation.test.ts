import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyResourceVerificationError, validateCanonicalResourceReference } from '@/lib/files/storageResourceValidation'

test('accepts canonical HTTPS references for supported providers', () => {
  assert.deepEqual(validateCanonicalResourceReference('google_drive', 'https://drive.google.com/drive/folders/abc_123', 'abc_123'), {
    canonicalId: 'abc_123', canonicalUrl: 'https://drive.google.com/drive/folders/abc_123',
  })
  assert.equal(validateCanonicalResourceReference('onedrive', 'https://tenant.sharepoint.com/sites/team/Shared%20Documents', 'item-id!1').canonicalId, 'item-id!1')
})

test('rejects non-provider hosts, unsafe protocols, credentials, query capability links, and path traversal', () => {
  const rejected: Array<[ 'google_drive' | 'onedrive', string ]> = [
    ['google_drive', 'http://drive.google.com/drive/folders/id'],
    ['google_drive', 'https://drive.google.com.attacker.example/drive/folders/id'],
    ['google_drive', 'https://user:pass@drive.google.com/drive/folders/id'],
    ['google_drive', 'https://drive.google.com/drive/folders/id?token=secret'],
    ['google_drive', 'https://drive.google.com/drive/%2e%2e/folders/id'],
    ['google_drive', 'https://drive.google.com/drive/../folders/id'],
    ['google_drive', 'https://127.0.0.1/private'],
    ['onedrive', 'https://1drv.ms/abc?e=secret'],
  ]
  for (const [provider, url] of rejected) assert.throws(() => validateCanonicalResourceReference(provider, url, 'valid_id'))
  assert.throws(() => validateCanonicalResourceReference('onedrive', 'https://tenant.sharepoint.com/sites/team/file', '../id'))
  assert.throws(() => validateCanonicalResourceReference('google_drive', 'https://drive.google.com/drive/folders/path-id', 'different-id'))
})

test('distinguishes provider missing-resource results from verification transport or permission errors', () => {
  assert.equal(classifyResourceVerificationError(new Error('GOOGLE_DRIVE_FILE_NOT_FOUND')), 'broken')
  assert.equal(classifyResourceVerificationError(new Error('ONEDRIVE_ITEM_NOT_FOUND')), 'broken')
  assert.equal(classifyResourceVerificationError(new Error('ONEDRIVE_PERMISSION_DENIED')), 'verification_error')
})
