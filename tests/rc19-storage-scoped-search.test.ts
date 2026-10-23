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
 assert.match(view,/Đang xác minh và tải danh sách file theo ngữ cảnh/)
 assert.match(view,/Tham chiếu provider, chưa xác minh checksum nội dung/)
 assert.match(api,/integrity_status: row\.integrity_status === 'sha256_verified'/)
})
