import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const api=readFileSync(new URL('../lib/server/operationalFileRouteHandler.ts',import.meta.url),'utf8')
const view=readFileSync(new URL('../components/features/storage/OperationalFileWorkspace.tsx',import.meta.url),'utf8')
test('server applies authorized scope and category/provider/filename search before pagination',()=>{
 assert.match(api,/\.eq\('scope_key', scope\.scope_key\)/)
 assert.match(api,/\.eq\('provider', provider_filter\)/)
 assert.match(api,/\.ilike\('file_name', '%' \+ escaped \+ '%'\)/)
 assert.match(api,/\.range\(\(page - 1\) \* pageSize, page \* pageSize - 1\)/)
 assert.match(api,/search: z\.string\(\)\.trim\(\)\.max\(128\)/)
})
test('page data is keyed to actor, storage scope, applied filters, and pagination',()=>{
 assert.match(view,/\[actorKey,requestKey,filter,providerFilter,appliedSearch,page,pageSize\]/)
 assert.match(view,/loadedKey===listKey/)
 assert.match(view,/setLoadedKey\(listKey\)/)
 assert.match(view,/provider_filter: providerFilter, search: appliedSearch/)
})
test('search does not auto-query each keystroke; reports real integrity wording, not fake provider verification',()=>{
 assert.match(view,/const applySearch = \(\) =>/)
 assert.match(view,/value=\{searchDraft\}/)
 assert.match(view,/onClick=\{applySearch\}/)
 assert.match(view,/Đang xác minh danh sách file/)
 assert.match(view,/Tham chiếu provider, chưa xác minh checksum nội dung/)
 assert.match(api,/integrity_status: row\.integrity_status === 'sha256_verified'/)
})

test('Catalog exposes only active Storage Route count, not provider parent-folder metadata',()=>{
 assert.match(api,/active_route_count: activeRouteCount\.error \? null : activeRouteCount\.count \?\? null/)
 assert.match(api,/select\('id', \{ count: 'exact', head: true \}\)\.eq\('active', true\)/)
 assert.match(view,/catalog\?\.active_route_count === 0/)
 assert.match(view,/Không tự tạo folder thay thế/)
})

test('physical Storage tree is withheld when no verified active route exists',()=>{
 assert.match(view,/catalog\?\.active_route_count != null && catalog\.active_route_count > 0 \? \(/)
 assert.match(view,/data-testid="storage-physical-tree-unavailable"/)
 assert.match(view,/storagePhysicalTreePendingBody/)
 assert.match(view,/storageLogicalTreeBody/)
})

test('UX feedback distinguishes incomplete scope, actual fetch error and empty page',()=>{
  const feedback=readFileSync(new URL('../components/ui/list-feedback.tsx',import.meta.url),'utf8')
  assert.match(view,/const \[listError,setListError\]/)
  assert.match(view,/setLoadedKey\(''\)/)
  assert.match(view,/setListError\(\{[\s\S]*?key:listKey/)
  assert.match(view,/listError\?\.key===listKey/)
  assert.match(view,/hasCompleteScope \? <ListFeedback kind="empty"/)
  assert.match(view,/listFailure \? <ListFeedback kind="error"/)
  assert.match(view,/!listReady \? <ListFeedback kind="loading"/)
  assert.match(view,/listReady && <HistoryPagination/)
  assert.match(feedback,/role=\{kind==='error'\?'alert':'status'\}/)
  assert.match(feedback,/onClick=\{onRetry\}>Thử lại/)
})
