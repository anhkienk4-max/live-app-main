import assert from 'node:assert/strict'
import test from 'node:test'

import { countProductsWithMedia } from '../components/features/brand-catalog/BrandCatalogWorkspace.tsx'

test('Catalog image / Key Visual KPI counts qualifying products once', () => {
  const products = [{ id: 'both' }, { id: 'kv-only' }, { id: 'none' }]
  const catalog = {
    skus: [],
    campaignSkus: [],
    resourceLinks: [
      { id: 'image-link', resource_id: 'image', relation_type: 'resource', product_id: 'both' },
      { id: 'duplicate-image-link', resource_id: 'image', relation_type: 'resource', product_id: 'both' },
      { id: 'kv-link', resource_id: 'kv', relation_type: 'resource', product_id: 'both' },
      { id: 'kv-only-link', resource_id: 'kv-only', relation_type: 'resource', product_id: 'kv-only' },
    ],
    resources: [
      { id: 'image', title: 'Image', canonical_url: '', provider: '', resource_type: 'image', verification_status: 'verified' },
      { id: 'kv', title: 'Key visual', canonical_url: '', provider: '', resource_type: 'kv', verification_status: 'verified' },
      { id: 'kv-only', title: 'Key visual', canonical_url: '', provider: '', resource_type: 'kv', verification_status: 'verified' },
    ],
  }

  assert.equal(countProductsWithMedia(products, catalog), 2)
})
