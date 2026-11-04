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
