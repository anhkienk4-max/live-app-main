import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const view = readFileSync(new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url), 'utf8')
const api = readFileSync(new URL('../lib/server/brandCatalogHandler.ts', import.meta.url), 'utf8')

test('missing Brand-01 schema maps to an explicit unavailable state with safe navigation', () => {
  assert.match(api, /BRAND01_SCHEMA_NOT_INSTALLED/)
  assert.match(view, /error === 'BRAND01_SCHEMA_NOT_INSTALLED'/)
  assert.match(view, /data-testid="brand-catalog-schema-pending"/)
  assert.match(view, /brandCatalogSchemaPendingTitle/)
  assert.match(view, /brandCatalogSchemaPendingBody/)
  assert.match(view, /href="\/brands"/)
  assert.match(view, /href="\/admin"/)
})
