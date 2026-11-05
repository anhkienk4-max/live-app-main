import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createReportArtifactRouteHandler } from '@/lib/server/reportArtifactRouteHandler'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

const leader: AuthenticatedServerUser = { id: 'auth-leader', businessUserId: 'leader-1', systemPermission: 'leader' }
const member: AuthenticatedServerUser = { id: 'auth-member', businessUserId: 'member-1', systemPermission: 'member' }
const request = (path: string, init?: RequestInit) => new Request(`https://ops.example/api/report-artifacts${path}`, init)

function clientWithArtifact(logicalCategory: string, onRead: () => void) {
  return {
    from() {
      const query = {
        select() { return query },
        eq() { return query },
        is() { return query },
        async maybeSingle() {
          onRead()
          return { data: { id: 'file-1', report_id: 'report-1', logical_category: logicalCategory }, error: null }
        },
      }
      return query
    },
  } as unknown as SupabaseClient
}

function storage() {
  let providerReads = 0
  const gateway = {
    getMetadata: async () => { providerReads += 1; throw new Error('must not read unauthorized bytes') },
    read: async () => { providerReads += 1; throw new Error('must not read unauthorized bytes') },
  } as never
  return { gateway, providerReads: () => providerReads }
}

test('Leader report artifact file reads fail before database access without Brand authority', async () => {
  let reads = 0
  const provider = storage()
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => leader,
    createClient: () => clientWithArtifact('data_report', () => { reads += 1 }),
    storage: provider.gateway,
    routingMode: 'domain_first',
  })
  const response = await handler.GET(request('?file_id=file-1'))
  assert.equal(response.status, 403)
  assert.equal(reads, 0)
  assert.equal(provider.providerReads(), 0)
})

test('Member report artifact download cannot bypass reports.export', async () => {
  let reads = 0
  const provider = storage()
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => member,
    createClient: () => clientWithArtifact('data_report', () => { reads += 1 }),
    storage: provider.gateway,
    routingMode: 'domain_first',
  })
  const response = await handler.GET(request('?file_id=file-1'))
  assert.equal(response.status, 403)
  assert.equal(reads, 1, 'only the metadata lookup may run before the report export decision')
  assert.equal(provider.providerReads(), 0)
})

test('Leader cannot generate a report artifact from a forged cross-scope report ID', async () => {
  let reads = 0
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => leader,
    createClient: () => clientWithArtifact('data_report', () => { reads += 1 }),
    storage: storage().gateway,
    routingMode: 'domain_first',
  })
  const response = await handler.POST(request('', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate_data_report', report_id: 'foreign-brand-report' }),
  }))
  assert.equal(response.status, 403)
  assert.equal(reads, 0)
})

test('Leader outside the persisted report Brand cannot upload or delete artifacts', async () => {
  const effects = { upload: 0, delete: 0, folder: 0, mutation: 0 }
  const client = {
    from(table: string) {
      const query = {
        select() { return query }, eq() { return query }, is() { return query },
        update() { effects.mutation++; return query }, insert() { effects.mutation++; return query },
        async maybeSingle() {
          const rows: Record<string, unknown> = {
            reports: { id: 'report-foreign', shift_id: 'shift-foreign', submitted_by: 'other', status: 'draft', metrics_confirmed: false },
            shifts: { id: 'shift-foreign', brand_id: 'brand-foreign', date: '2026-11-01' },
            stored_files: { id: 'file-foreign', report_id: 'report-foreign', provider: 'google_drive', external_file_id: 'drive-foreign' },
          }
          return { data: rows[table] ?? null, error: null }
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => leader,
    createClient: () => client,
    createScopeClient: async () => ({ rpc: async (name: string) => name === 'rbac_permission_decision'
      ? { data: { actor_business_user_id: 'leader-1', role: 'leader', allowed: true }, error: null }
      : { data: ['brand-owned'], error: null } }) as unknown as Pick<SupabaseClient, 'rpc'>,
    storage: {
      upload: async () => { effects.upload++; throw new Error('unexpected upload') },
      delete: async () => { effects.delete++; throw new Error('unexpected delete') },
      ensureFolder: async () => { effects.folder++; throw new Error('unexpected folder') },
    } as never,
    routingMode: 'domain_first',
  })
  const form = new FormData()
  form.set('report_id', 'report-foreign')
  form.set('file', new Blob(['synthetic'], { type: 'text/plain' }), 'source.txt')
  const upload = await handler.POST(request('', { method: 'POST', body: form }))
  assert.equal(upload.status, 404)
  assert.equal((await upload.json()).error.code, 'REPORT_ARTIFACT_NOT_FOUND')
  const deletion = await handler.DELETE(request('', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'file-foreign' }),
  }))
  assert.equal(deletion.status, 404)
  assert.equal((await deletion.json()).error.code, 'REPORT_ARTIFACT_NOT_FOUND')
  assert.deepEqual(effects, { upload: 0, delete: 0, folder: 0, mutation: 0 })

  const missingQuery = {
    select() { return missingQuery }, eq() { return missingQuery }, is() { return missingQuery },
    async maybeSingle() { return { data: null, error: null } },
  }
  const missingHandler = createReportArtifactRouteHandler({
    resolveUser: async () => leader,
    createClient: () => ({ from: () => missingQuery }) as unknown as SupabaseClient,
    storage: storage().gateway,
    routingMode: 'domain_first',
  })
  const missing = await missingHandler.POST(request('', { method: 'POST', body: form }))
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'REPORT_ARTIFACT_NOT_FOUND')
})

test('artifact deletion fences concurrent requests and recovers or quarantines failures', async () => {
  let status = 'none'
  let lease = ''
  let deleteCalls = 0
  let deletedAt: string | null = null
  let failFinalize = false
  let failProvider = false
  let observedTrashed = false
  let currentActor: AuthenticatedServerUser = leader
  let releaseProvider!: () => void
  let signalProvider!: () => void
  const entered = new Promise<void>(resolve => { signalProvider = resolve })
  const barrier = new Promise<void>(resolve => { releaseProvider = resolve })
  const rows: Record<string, Record<string, unknown>> = {
    stored_files: { id: 'file-1', report_id: 'report-1', shift_id: 'shift-1', provider: 'google_drive',
      external_file_id: 'drive-1', external_parent_id: 'parent-1', uploaded_by: 'leader-1' },
    reports: { id: 'report-1', shift_id: 'shift-1', submitted_by: 'leader-1', status: 'draft', metrics_confirmed: false },
    shifts: { id: 'shift-1', brand_id: 'brand-1', date: '2026-11-01' },
  }
  const db = {
    from(table: string) {
      const query = {
        select() { return query }, eq() { return query }, is() { return query },
        async maybeSingle() { return { data: rows[table] ?? null, error: null } },
      }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'rc19_record_report_artifact_delete_outcome') {
        status = args.p_success ? 'provider_deleted' : 'manual_review'
        return { data: status, error: null }
      }
      if (name === 'rc19_finalize_report_artifact_deletion') {
        if (failFinalize) { failFinalize = false; return { data: null, error: new Error('database unavailable') } }
        status = 'completed'; deletedAt = '2026-11-05'; return { data: status, error: null }
      }
      if (name === 'rc19_reconcile_report_artifact_deleted') {
        status = 'provider_deleted'; return { data: status, error: null }
      }
      throw new Error('unexpected service RPC')
    },
  } as unknown as SupabaseClient
  const scope = {
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === 'rbac_permission_decision') return { data: { actor_business_user_id: 'leader-1', role: 'leader', allowed: true }, error: null }
      if (name === 'rc19_current_leader_brand_ids') return { data: ['brand-1'], error: null }
      if (name === 'rc19_claim_report_artifact_deletion') {
        if (status === 'completed') return { data: { status }, error: null }
        if (status === 'provider_deleted' || status === 'manual_review') return { data: {
          status, operation_id: 'operation-1', lease_owner: lease, fencing_version: 1,
          provider: 'google_drive', external_file_id: 'drive-1', external_parent_id: 'parent-1',
        }, error: null }
        if (status !== 'none') return { data: { status: 'in_progress' }, error: null }
        status = 'pending'; lease = String(args.p_lease_owner)
        return { data: { status, operation_id: 'operation-1', lease_owner: lease, fencing_version: 1,
          provider: 'google_drive', external_file_id: 'drive-1', external_parent_id: 'parent-1' }, error: null }
      }
      if (name === 'rc19_begin_report_artifact_deletion') {
        status = 'provider_deleting'
        return { data: { operation_id: 'operation-1', provider: 'google_drive', external_file_id: 'drive-1', external_parent_id: 'parent-1' }, error: null }
      }
      throw new Error('unexpected authenticated RPC')
    },
  }
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => currentActor, createClient: () => db,
    createScopeClient: async () => scope as unknown as Pick<SupabaseClient, 'rpc'>,
    storage: {
      getMetadata: async () => ({ id: 'drive-1', kind: 'file', parent_ids: ['parent-1'], trashed: observedTrashed }),
      delete: async () => { deleteCalls++; signalProvider(); await barrier; if (failProvider) throw new Error('timeout') },
    } as never,
    routingMode: 'domain_first',
  })
  const deletion = () => handler.DELETE(request('', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'file-1' }) }))
  const first = deletion()
  await entered
  const second = await deletion()
  assert.equal(second.status, 409)
  assert.equal(deleteCalls, 1)
  assert.equal(deletedAt, null)
  releaseProvider()
  assert.equal((await first).status, 200)
  assert.equal((await deletion()).status, 200)
  assert.equal(deleteCalls, 1)
  assert.equal(deletedAt, '2026-11-05')

  status = 'none'; deletedAt = null; deleteCalls = 0; failFinalize = true
  assert.equal((await deletion()).status, 502)
  assert.equal(status, 'provider_deleted')
  assert.equal(deletedAt, null)
  assert.equal((await deletion()).status, 200)
  assert.equal(deleteCalls, 1)
  assert.equal(status, 'completed')

  status = 'none'; deletedAt = null; deleteCalls = 0; failProvider = true
  assert.equal((await deletion()).status, 502)
  assert.equal(status, 'manual_review')
  assert.equal(deletedAt, null)
  assert.equal((await deletion()).status, 409)
  assert.equal(deleteCalls, 1)
  currentActor = { id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }
  assert.equal((await deletion()).status, 409)
  assert.equal(status, 'manual_review')
  observedTrashed = true
  assert.equal((await deletion()).status, 200)
  assert.equal(status, 'completed')
  assert.equal(deleteCalls, 1)
})

test('legacy artifact without a parent is quarantined without provider I/O', async () => {
  let providerCalls = 0
  let claims = 0
  const rows: Record<string, Record<string, unknown>> = {
    stored_files: { id: 'legacy-file', report_id: 'report-1', shift_id: 'shift-1',
      provider: 'google_drive', external_file_id: 'drive-legacy', external_parent_id: null, uploaded_by: 'leader-1' },
    reports: { id: 'report-1', shift_id: 'shift-1', submitted_by: 'leader-1', status: 'draft', metrics_confirmed: false },
    shifts: { id: 'shift-1', brand_id: 'brand-1', date: '2026-11-01' },
  }
  const db = {
    from(table: string) {
      const query = { select() { return query }, eq() { return query }, is() { return query },
        async maybeSingle() { return { data: rows[table] ?? null, error: null } } }
      return query
    },
  } as unknown as SupabaseClient
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => leader, createClient: () => db,
    createScopeClient: async () => ({ rpc: async (name: string) => {
      if (name === 'rbac_permission_decision') return { data: { actor_business_user_id: 'leader-1', role: 'leader', allowed: true }, error: null }
      if (name === 'rc19_claim_report_artifact_deletion') { claims++; return { data: { status: 'manual_review' }, error: null } }
      return { data: ['brand-1'], error: null }
    } }) as unknown as Pick<SupabaseClient, 'rpc'>,
    storage: {
      getMetadata: async () => { providerCalls++; throw new Error('unexpected provider read') },
      delete: async () => { providerCalls++; throw new Error('unexpected provider delete') },
    } as never,
    routingMode: 'domain_first',
  })
  const response = await handler.DELETE(request('', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'legacy-file' }) }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_ARTIFACT_LEGACY_REVIEW_REQUIRED')
  assert.equal(claims, 1)
  assert.equal(providerCalls, 0)
})

test('admin backfills a legacy parent only after the exact approved folder chain is verified', async () => {
  let wrongParent = true
  let backfills = 0
  let providerDeletes = 0
  const rows: Record<string, Record<string, unknown>> = {
    stored_files: { id: 'legacy-file', report_id: 'report-1', shift_id: 'shift-1',
      provider: 'google_drive', external_file_id: 'drive-legacy', external_parent_id: null,
      folder_path: 'metrics_snapshot', file_name: 'legacy.xlsx', uploaded_by: 'leader-1' },
    reports: { id: 'report-1', shift_id: 'shift-1', submitted_by: 'leader-1', status: 'draft', metrics_confirmed: false },
    shifts: { id: 'shift-1', brand_id: 'brand-1', platform_id: 'platform-1', date: '2026-11-01' },
  }
  const db = {
    from(table: string) {
      const query = { select() { return query }, eq() { return query }, is() { return query },
        async maybeSingle() { return { data: rows[table] ?? null, error: null } } }
      return query
    },
    async rpc(name: string, args: Record<string, unknown>) {
      assert.equal(name, 'rc19_backfill_report_artifact_parent')
      assert.equal(args.p_external_parent_id, 'leaf')
      assert.equal(args.p_actor_business_user_id, 'admin-1')
      backfills++
      return { data: 'retryable_failure', error: null }
    },
  } as unknown as SupabaseClient
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }),
    createClient: () => db,
    createScopeClient: async () => ({ rpc: async () => ({ data: {
      status: 'manual_review', operation_id: 'operation-legacy', fencing_version: 1,
    }, error: null }) }) as unknown as Pick<SupabaseClient, 'rpc'>,
    domainRouteResolver: {
      async resolveReportArtifactGroupPlacement(input) {
        return { provider: 'google_drive', storageProfile: 'REPORT_ARTIFACT_GROUP', rootFolderId: 'root',
          baseFolderId: 'base', expectedBaseParentId: 'root', folderSegments: [input.group],
          folderPath: input.group, fileName: input.fileName, logicalCategory: 'data_report',
          accessClassification: 'restricted_verified', sensitive: true }
      },
      async resolveDomainCategoryPlacement() { throw new Error('unexpected route') },
    },
    storage: {
      async getMetadata(reference: { external_file_id: string }) {
        if (reference.external_file_id === 'drive-legacy') return { id: 'drive-legacy', name: 'legacy.xlsx', kind: 'file', parent_ids: ['leaf'] }
        if (reference.external_file_id === 'leaf') return { id: 'leaf', name: 'metrics_snapshot', kind: 'folder', parent_ids: [wrongParent ? 'other' : 'base'] }
        if (reference.external_file_id === 'base') return { id: 'base', name: 'base', kind: 'folder', parent_ids: ['root'] }
        return { id: reference.external_file_id, name: 'other', kind: 'folder', parent_ids: ['root'] }
      },
      async delete() { providerDeletes++ },
    } as never,
    routingMode: 'domain_first',
  })
  const deletion = () => handler.DELETE(request('', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'legacy-file' }) }))
  assert.equal((await deletion()).status, 409)
  assert.equal(backfills, 0)
  wrongParent = false
  const verified = await deletion()
  assert.equal(verified.status, 409)
  assert.equal((await verified.json()).error.code, 'REPORT_ARTIFACT_PARENT_VERIFIED_RETRY')
  assert.equal(backfills, 1)
  assert.equal(providerDeletes, 0)
})

test('pending deletion is hidden from artifact list and readback', async () => {
  let providerReads = 0
  const files = [
    { id: 'file-pending', report_id: 'report-1', logical_category: 'data_source', deleted_at: null },
    { id: 'file-active', report_id: 'report-1', logical_category: 'data_source', deleted_at: null },
  ]
  const db = {
    from(table: string) {
      const filters: Array<(row: Record<string, unknown>) => boolean> = []
      const rows = (): Record<string, unknown>[] => {
        if (table === 'stored_files') return files.filter(row => filters.every(filter => filter(row)))
        if (table === 'reports') return [{ id: 'report-1', shift_id: 'shift-1', submitted_by: 'admin-1' }]
        if (table === 'shifts') return [{ id: 'shift-1', brand_id: 'brand-1', date: '2026-11-01' }]
        if (table === 'rc19_report_artifact_deletions') return [{ stored_file_id: 'file-pending', operation_id: 'op-1' }]
          .filter(row => filters.every(filter => filter(row)))
        return []
      }
      const query = {
        select() { return query },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
        is(key: string, value: unknown) { filters.push(row => (row[key] ?? null) === value); return query },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
        order() { return query },
        async maybeSingle() { return { data: rows()[0] ?? null, error: null } },
        then(resolve: (value: unknown) => void, reject?: (reason: unknown) => void) {
          return Promise.resolve({ data: rows(), error: null }).then(resolve, reject)
        },
      }
      return query
    },
  } as unknown as SupabaseClient
  const handler = createReportArtifactRouteHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }),
    createClient: () => db,
    storage: { getMetadata: async () => { providerReads++; throw new Error('unexpected provider read') } } as never,
    routingMode: 'domain_first',
  })
  const list = await handler.GET(request('?report_id=report-1'))
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).files.map((file: { id: string }) => file.id), ['file-active'])
  const read = await handler.GET(request('?file_id=file-pending'))
  assert.equal(read.status, 404)
  assert.equal(providerReads, 0)
})
