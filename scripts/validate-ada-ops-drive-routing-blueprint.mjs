import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const registry = JSON.parse(readFileSync(new URL('../docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json', import.meta.url), 'utf8'))
const map = JSON.parse(readFileSync(new URL('../docs/storage/ADA_OPS_STORAGE_ROUTE_MAP_V1.json', import.meta.url), 'utf8'))
const folders = registry.folders
assert.equal(folders.length, registry.folder_count_registered_static, 'Static registry count mismatch; dynamic folders are created on demand')
assert.equal(registry.folder_count_baseline + registry.folder_count_additional, folders.length, 'Baseline and additional inventory counts must match the static registry')
assert.equal(new Set(folders.map(x => x.id)).size, folders.length, 'Duplicate Google Drive folder IDs')
assert.equal(new Set(folders.map(x => x.path)).size, folders.length, 'Duplicate Google Drive folder paths')
const byId = new Map(folders.map(x => [x.id, x]))
const byPath = new Map(folders.map(x => [x.path, x]))
assert.equal(registry.app_root_folder_id, map.new_data_root_id)
assert.equal(registry.root_folder_id, map.historical_root_id)
assert.match(map.source_code_compatibility, /^IMPLEMENTED_IN_STORAGE_BRANCH;/u)
const pendingAclFolders = folders.filter(x => x.access_classification === 'restricted_pending_app_acl_verification')
assert.equal(pendingAclFolders.length, registry.folder_count_additional, 'Additional physical folders must retain pending ACL status')
for (const folder of folders) {
  assert.ok(folder.id && folder.path && folder.parent_id, 'Missing path, id or parent')
  const parentPath = folder.path.includes('/') ? folder.path.slice(0, folder.path.lastIndexOf('/')) : null
  const expectedParent = parentPath ? byPath.get(parentPath)?.id : registry.root_folder_id
  assert.equal(folder.parent_id, expectedParent, 'Folder parent ID does not match path: ' + folder.path)
  assert.equal(folder.url, `https://drive.google.com/drive/folders/${folder.id}`, 'Folder URL must identify its registered ID')
  assert.ok(folder.path.startsWith('00_ADA_OPS_PLATFORM'))
}
const domainRoots = folders.filter(folder => /^00_ADA_OPS_PLATFORM\/\d{2}_[A-Z0-9_]+$/u.test(folder.path))
assert.equal(domainRoots.length, 13, 'Expected the thirteen domain roots')
const categories = Object.values(map.standard_category_routes)
assert.equal(categories.length, 15, 'Expected 15 operational file categories')
for (const category of categories) {
  assert.ok(byId.has(category.domain_folder_id), 'Unregistered category target')
  assert.ok(category.path.startsWith('00_ADA_OPS_PLATFORM/'), 'Category outside app root')
}
for (const category of ['schedule_source', 'live_snapshot', 'staffing_document', 'acceptance_document', 'payment_document', 'system_export']) {
  assert.equal(map.standard_category_routes[category]?.sensitive, true, 'Sensitive category must fail closed: ' + category)
}
assert.equal(map.report_subfolders.length, 9, 'Expected 9 report folder classes')
assert.equal(new Set(map.report_subfolders).size, 9, 'Duplicate report evidence folder name')
assert.ok(byId.has(map.report_root_id), 'Report root is missing')
assert.ok(registry.routing_policy.report_assets.includes('LEGACY READ-ONLY'),
  'Legacy reports must remain read-only for new app writes')
assert.equal(map.production_active_routes_last_verified, 0,
  'Blueprint must not claim Production routes activated')
console.log(`PASS: ${registry.folder_count_baseline} baseline + ${registry.folder_count_additional} additional physical folder IDs; 13 domains; 15 mapped categories; 9 report classes; dynamic folders remain on demand; no Production activation claim`)
