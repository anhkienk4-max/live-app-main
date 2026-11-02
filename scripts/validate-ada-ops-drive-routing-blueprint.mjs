import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json', import.meta.url), 'utf8'))
const map = JSON.parse(readFileSync(new URL('../docs/storage/ADA_OPS_STORAGE_ROUTE_MAP_V1.json', import.meta.url), 'utf8'))
const folders = registry.folders
assert.equal(folders.length, 93, 'Expected 93 verified physical folders')
assert.equal(new Set(folders.map(x => x.id)).size, folders.length, 'Duplicate Google Drive folder IDs')
const byId = new Map(folders.map(x => [x.id, x]))
assert.equal(registry.app_root_folder_id, map.new_data_root_id)
assert.equal(registry.root_folder_id, map.historical_root_id)
for (const folder of folders) {
  assert.ok(folder.id && folder.path && folder.parent_id, 'Missing path, id or parent')
  assert.ok(byId.has(folder.parent_id) || folder.parent_id === registry.root_folder_id,
    'Folder parent does not exist in registry: ' + folder.path)
  assert.ok(folder.path.startsWith('00_ADA_OPS_PLATFORM'))
}
const categories = Object.values(map.standard_category_routes)
assert.equal(categories.length, 15, 'Expected 15 operational file categories')
for (const category of categories) {
  assert.ok(byId.has(category.domain_folder_id), 'Unregistered category target')
  assert.ok(category.path.startsWith('00_ADA_OPS_PLATFORM/'), 'Category outside app root')
}
assert.equal(map.report_subfolders.length, 9, 'Expected 9 report folder classes')
assert.equal(new Set(map.report_subfolders).size, 9, 'Duplicate report evidence folder name')
assert.ok(byId.has(map.report_root_id), 'Report root is missing')
assert.ok(registry.routing_policy.report_assets.includes('LEGACY READ-ONLY'),
  'Legacy reports must remain read-only for new app writes')
assert.equal(map.production_active_routes_last_verified, 0,
  'Blueprint must not claim Production routes activated')
console.log('PASS: 93 unique verified folder IDs; 15 mapped categories; 9 report classes; no Production activation claim')
