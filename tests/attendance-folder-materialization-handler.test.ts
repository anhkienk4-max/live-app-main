import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAttendanceFolderMaterializationHandler } from '@/lib/server/attendanceFolderMaterializationHandler'
import { withAttendanceFolderCreationLock } from '@/lib/server/attendancePhotoDrive'
import type { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

function createClient(shifts: Array<{ id: string; date: string; created_by: string | null }>) {
  let shiftIds: string[] = []
  const query = {
    select: () => query,
    in: (_field: string, ids: string[]) => { shiftIds = ids; return query },
    is: () => query,
    then: (resolve: (value: { data: typeof shifts; error: null }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: shifts.filter(shift => shiftIds.includes(shift.id)), error: null }).then(resolve, reject),
  }
  const client = (() => ({ from: () => query })) as unknown as typeof createSupabaseAdminClient
  return client
}

test('attendance folders are materialized only for authorized persisted shifts and request IDs are deduplicated', async () => {
  const shifts = [{ id: 'shift-a', date: '2026-11-04', created_by: 'leader-a' }]
  let writes = 0
  const dependencies = {
    resolveUser: async () => ({ id: 'auth-leader', businessUserId: 'leader-a', systemPermission: 'leader' as const }),
    createClient: createClient(shifts),
    materialize: async () => { writes += 1; return 6 },
  }
  const handler = createAttendanceFolderMaterializationHandler(dependencies)
  const body = JSON.stringify({ shift_ids: ['shift-a', 'shift-a'] })
  const request = () => new Request('https://app.test/api/operational-storage/attendance-folders', {
    method: 'POST', headers: { origin: 'https://app.test' }, body,
  })
  const first = await handler(request())
  const second = await handler(request())
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(writes, 2, 'One materialization runs per request after duplicate IDs are removed')

  const foreignHandler = createAttendanceFolderMaterializationHandler({
    ...dependencies,
    resolveUser: async () => ({ id: 'auth-leader-b', businessUserId: 'leader-b', systemPermission: 'leader' as const }),
  })
  const denied = await foreignHandler(request())
  assert.equal(denied.status, 403)
  assert.equal(writes, 2, 'A forged shift ID must be denied before any Drive call')
})

test('separate app instances serialize Drive folder creation through the service-only DB lease', async () => {
  const leases = new Map<string, string>()
  const client = {
    async rpc(name: string, args: { p_lock_key: string; p_owner?: string }) {
      if (name === 'acquire_operational_storage_folder_lock') {
        if (leases.has(args.p_lock_key)) return { data: false, error: null }
        leases.set(args.p_lock_key, args.p_owner!)
        return { data: true, error: null }
      }
      assert.equal(name, 'release_operational_storage_folder_lock')
      if (leases.get(args.p_lock_key) === args.p_owner) leases.delete(args.p_lock_key)
      return { data: true, error: null }
    },
  } as never
  let folderExists = false
  let createCount = 0
  const create = async () => {
    if (!folderExists) {
      createCount += 1
      await new Promise(resolve => setTimeout(resolve, 20))
      folderExists = true
    }
    return 'drive-folder-id'
  }
  const results = await Promise.all([
    withAttendanceFolderCreationLock(client, 'drive-parent', 'same-folder', create),
    withAttendanceFolderCreationLock(client, 'drive-parent', 'same-folder', create),
  ])
  assert.deepEqual(results, ['drive-folder-id', 'drive-folder-id'])
  assert.equal(createCount, 1)
  assert.equal(leases.size, 0)

  const migration = readFileSync(new URL('../supabase/migrations/20261103195519_rc19_c2_resource_public_and_app_edit.sql', import.meta.url), 'utf8')
  assert.match(migration, /alter table public\.operational_storage_folder_locks enable row level security/i)
  assert.match(migration, /grant execute on function public\.acquire_operational_storage_folder_lock\(text, uuid, integer\) to service_role/i)
  assert.match(migration, /revoke all on function public\.acquire_operational_storage_folder_lock\(text, uuid, integer\) from public, anon, authenticated/i)
})
