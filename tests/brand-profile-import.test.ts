import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBrandProfileImport } from '../components/features/brands/brandProfileImport.ts'

test('brand profile JSON imports only editable canonical fields into form values', () => {
  const imported = parseBrandProfileImport(JSON.stringify({
    name: 'Northwind',
    description: 'Verified brand notes',
    key_products: ['SKU A', 'SKU B'],
    asset_links: ['https://example.com/guide.pdf'],
  }))

  assert.deepEqual(imported, {
    name: 'Northwind',
    description: 'Verified brand notes',
    key_products: 'SKU A\nSKU B',
    asset_links: 'https://example.com/guide.pdf',
  })
})

test('brand profile import rejects identity, permission, status and unsafe URL fields', () => {
  assert.throws(() => parseBrandProfileImport('{"name":"Northwind","id":"forged"}'), /BRAND_IMPORT_UNSUPPORTED_FIELDS/)
  assert.throws(() => parseBrandProfileImport('{"asset_links":["javascript:alert(1)"]}'), /BRAND_IMPORT_INVALID_URL/)
  assert.throws(() => parseBrandProfileImport('{"logo_url":"https://user:pass@example.com/logo.png"}'), /BRAND_IMPORT_INVALID_URL/)
})

test('brand profile import rejects invalid JSON, unsupported types and oversized input', () => {
  assert.throws(() => parseBrandProfileImport('{'), /BRAND_IMPORT_INVALID_JSON/)
  assert.throws(() => parseBrandProfileImport('{"dos":"not-an-array"}'), /BRAND_IMPORT_INVALID_LIST/)
  assert.throws(() => parseBrandProfileImport(' '.repeat(64 * 1024 + 1)), /BRAND_IMPORT_TOO_LARGE/)
})
