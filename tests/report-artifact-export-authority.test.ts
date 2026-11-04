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
