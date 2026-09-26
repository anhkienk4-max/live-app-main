import assert from 'node:assert/strict'
import test from 'node:test'

import type { FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { createFileStorageService } from '@/lib/services/fileStorageService'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import {
  OperationalStoragePlacementError,
  resolveOperationalStoragePlacement,
  type OperationalStoragePlacementInput,
  type OperationalStorageRoute,
} from '@/lib/files/operationalStoragePlacementResolver'
import { reportImageLogicalCategory, createReportImageRouteHandler } from '@/lib/server/reportImageRouteHandler'

const user = { id: 'auth-1', businessUserId: 'business-1', systemPermission: 'member' as const }

function routeFor(input: OperationalStoragePlacementInput): OperationalStorageRoute {
  const internal = input.executionSource === 'internal'
  return {
    id: `route-${input.provider}-${input.executionSource}`,
    provider: input.provider,
    execution_source: input.executionSource,
    brand_id: input.brandId,
    platform_id: null,
    subbrand_key: null,
    storage_profile: internal ? 'LEGACY_CATEGORY_PERIOD' : 'LEGACY_PERIOD_CATEGORY',
    root_folder_id: internal ? 'root-a' : 'root-b',
    base_folder_id: internal ? 'mars-internal-base' : 'mars-agency-base',
    folder_labels: {
      dashboard: 'DASHBOARD',
      live_visual_internal: 'VISIBILITY',
      live_visual_agency: 'VISUAL HOST',
    },
    period_naming_style: internal ? 'THANG_M_DASH_YEAR' : 'THANG_M_DOT_YEAR',
    active: true,
  }
}

function formRequest(fields: Record<string, string>, name = 'filename.png') {
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => form.set(key, value))
  form.set('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), name)
  return new Request('https://example.test/api/report-images', { method: 'POST', body: form })
}

function harness(options: {
  shift?: Record<string, unknown>
  rpcError?: { message: string }
  routeError?: string
  provider?: 'google_drive' | 'onedrive'
  existingReportImage?: Record<string, unknown>
  existingLiveImage?: Record<string, unknown>
} = {}) {
  const calls: string[] = []
  const folderNames: string[] = []
  const uploads: FileUploadInput[] = []
  const routeInputs: OperationalStoragePlacementInput[] = []
  let reportImage = options.existingReportImage ?? null
  let liveImage = options.existingLiveImage ?? null
  const report = { id: 'report-1', shift_id: 'shift-1', created_at: '2026-09-19T23:30:00-07:00', submitted_by: 'business-1', metrics_confirmed: false, status: 'draft' }
  const shift = options.shift ?? { date: '2026-10-01', brand_id: 'stg-b1', platform_id: 'stg-p1', execution_source: 'internal' }
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {}
      const query = {
        select() { return query },
        eq(column: string, value: unknown) { filters[column] = value; return query },
        maybeSingle: async () => ({
          data: table === 'reports' ? report
            : table === 'shifts' ? shift
              : table === 'report_images' ? reportImage && Object.entries(filters).every(([key, value]) => reportImage?.[key] === value) ? reportImage : null
                : table === 'live_report_images' ? liveImage && Object.entries(filters).every(([key, value]) => liveImage?.[key] === value) ? liveImage : null
                  : null,
          error: null,
        }),
      }
      return query
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push(`${name}:${JSON.stringify(args)}`)
      return { single: async () => {
        if (options.rpcError) return { data: null, error: options.rpcError }
        if (name === 'upsert_live_report_image_with_provider') {
          liveImage = { id: 'live-image-1', ...(args.p_data as Record<string, unknown>) }
          return { data: liveImage, error: null }
        }
        if (name === 'upload_report_image_with_provider') {
          reportImage = {
            id: 'report-image-1', report_id: args.p_report_id, storage_path: args.p_storage_path,
            image_type: args.p_image_type, provider: args.p_provider, external_file_id: args.p_external_file_id,
          }
          return { data: reportImage, error: null }
        }
        return { data: true, error: null }
      } }
    },
  }
  const storage = {
    async ensureFolder(parentId: string, name: string, provider: 'google_drive' | 'onedrive') {
      calls.push(`ensure:${provider}:${parentId}:${name}`)
      folderNames.push(name)
      return { provider, id: `folder-${folderNames.length}`, name, parentId }
    },
    async upload(input: FileUploadInput): Promise<FileUploadResult> {
      uploads.push(input)
      calls.push(`upload:${input.destination?.provider}:${input.name}:${input.external_parent_id}`)
      const provider = input.destination?.provider ?? 'google_drive'
      return {
        asset: {
          id: 'asset-1', provider, external_file_id: 'file-1', name: input.name, mime_type: input.mime_type,
          size_bytes: input.size_bytes, entity_type: input.entity_type, entity_id: input.entity_id,
          status: 'active', created_by: input.created_by, created_at: '2026-09-19T00:00:00.000Z',
        },
      }
    },
    async read() { return new Uint8Array() },
    async delete(reference: { provider: string; external_file_id: string }) {
      calls.push(`delete:${reference.provider}:${reference.external_file_id}`)
    },
  }
  const routeResolver = {
    async resolvePlacement(input: OperationalStoragePlacementInput) {
      routeInputs.push(input)
      if (options.routeError) throw new OperationalStoragePlacementError(options.routeError as never)
      const routeInput = options.provider === 'onedrive' ? { ...input, provider: 'onedrive' as const } : input
      return resolveOperationalStoragePlacement(routeFor(routeInput), routeInput)
    },
  }
  const handler = createReportImageRouteHandler({
    resolveUser: async () => user,
    createClient: async () => client as never,
    storage: storage as never,
    routeResolver,
  })
  return { calls, folderNames, uploads, routeInputs, handler }
}

test('report dashboard cutover uses shift.date, materializes folders, and uploads filename once to the exact parent', async () => {
  const h = harness()
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  const payload = await response.json() as { ok: boolean }

  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.deepEqual(h.folderNames, ['DASHBOARD', 'Tháng 10 - 2026'])
  assert.equal(h.routeInputs[0].shiftDate, '2026-10-01')
  assert.equal(h.routeInputs[0].shiftDate.includes('2026-09'), false)
  assert.deepEqual(h.uploads.map(upload => upload.name), ['filename.png'])
  assert.equal(h.uploads[0].external_parent_id, 'folder-2')
  assert.equal(h.uploads[0].logical_path, 'DASHBOARD/Tháng 10 - 2026/filename.png')
  assert.equal(h.folderNames.includes('filename.png'), false)
  assert.equal(h.calls.filter(call => call.startsWith('upload:')).length, 1)
})

test('folder materializer walks only folderSegments and storage service dispatches ensureFolder by provider', async () => {
  const folderCalls: Array<[string, string, string]> = []
  const materialize = createOperationalStorageFolderMaterializer(async (parentId, name, provider) => {
    folderCalls.push([provider, parentId, name])
    return { provider, id: `${parentId}/${name}`, name, parentId }
  })
  const input: OperationalStoragePlacementInput = {
    provider: 'google_drive', executionSource: 'internal', brandId: 'stg-b1', platformId: null,
    subbrandKey: null, shiftDate: '2026-10-01', logicalCategory: 'dashboard', fileName: 'filename.png',
  }
  const placement = resolveOperationalStoragePlacement(routeFor(input), input)
  assert.equal(await materialize(placement), 'mars-internal-base/DASHBOARD/Tháng 10 - 2026')
  assert.deepEqual(folderCalls.map(([, , name]) => name), ['DASHBOARD', 'Tháng 10 - 2026'])
  assert.equal(folderCalls.some(([, , name]) => name === placement.fileName), false)

  const dispatches: string[] = []
  const provider = (name: 'google_drive' | 'onedrive') => ({
    name,
    async ensureFolder(parentId: string, folderName: string) {
      dispatches.push(`${name}:${parentId}:${folderName}`)
      return { provider: name, id: `${name}-folder`, name: folderName, parentId }
    },
  }) as never
  const storage = createFileStorageService({
    env: { NODE_ENV: 'production', FILE_PROVIDER: 'google_drive' },
    providers: { google_drive: provider('google_drive'), onedrive: provider('onedrive') },
  })
  await storage.ensureFolder('root-a', 'DASHBOARD', 'google_drive')
  await storage.ensureFolder('root-b', 'VISUAL HOST', 'onedrive')
  assert.deepEqual(dispatches, ['google_drive:root-a:DASHBOARD', 'onedrive:root-b:VISUAL HOST'])
})

test('agency dashboard placement is period then dashboard with the agency naming style', async () => {
  const h = harness({ shift: { date: '2026-10-01', brand_id: 'stg-b1', platform_id: 'stg-p2', execution_source: 'agency' } })
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(response.status, 200)
  assert.deepEqual(h.folderNames, ['THÁNG 10.2026', 'DASHBOARD'])
  assert.equal(h.uploads[0].logical_path, 'THÁNG 10.2026/DASHBOARD/filename.png')
})

test('proven live visual categories map to source-specific configured folders', async () => {
  assert.equal(reportImageLogicalCategory('live', 'key_visual'), 'live_visual')
  assert.equal(reportImageLogicalCategory('live', 'live_session'), 'live_visual')
  const internal = harness()
  await internal.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'live_session' }))
  assert.deepEqual(internal.folderNames, ['VISIBILITY', 'Tháng 10 - 2026'])

  const agency = harness({ shift: { date: '2026-10-01', brand_id: 'stg-b1', platform_id: 'stg-p2', execution_source: 'agency' } })
  await agency.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.deepEqual(agency.folderNames, ['THÁNG 10.2026', 'VISUAL HOST'])
})

test('NULL execution_source fails closed before route lookup or storage operations', async () => {
  const h = harness({ shift: { date: '2026-10-01', brand_id: 'stg-b1', platform_id: 'stg-p1', execution_source: null } })
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'STORAGE_EXECUTION_SOURCE_NOT_CONFIGURED')
  assert.equal(h.routeInputs.length, 0)
  assert.equal(h.folderNames.length, 0)
  assert.equal(h.uploads.length, 0)
})

test('missing and ambiguous routes fail closed without provider fallback', async () => {
  for (const routeError of ['STORAGE_ROUTE_NOT_CONFIGURED', 'STORAGE_ROUTE_AMBIGUOUS']) {
    const h = harness({ routeError })
    const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
    assert.equal((await response.json()).error.code, routeError)
    assert.equal(h.folderNames.length, 0)
    assert.equal(h.uploads.length, 0)
  }
})

test('explicit OneDrive with no route does not fall back to Google Drive', async () => {
  const h = harness({ provider: 'onedrive', routeError: 'STORAGE_ROUTE_NOT_CONFIGURED' })
  const response = await h.handler.POST(formRequest({
    kind: 'report', report_id: 'report-1', image_type: 'dashboard', provider: 'onedrive',
  }))
  assert.equal((await response.json()).error.code, 'STORAGE_ROUTE_NOT_CONFIGURED')
  assert.equal(h.uploads.length, 0)
  assert.equal(h.folderNames.length, 0)
  assert.equal(h.routeInputs[0].provider, 'onedrive')
})

test('unsupported image categories fail closed before folder materialization', async () => {
  for (const fields of [
    { kind: 'report', image_type: 'livestream' },
    { kind: 'report', image_type: 'other' },
    { kind: 'live', category: 'other' },
  ]) {
    const h = harness()
    const response = await h.handler.POST(formRequest({ ...fields, report_id: 'report-1' }))
    assert.equal((await response.json()).error.code, 'STORAGE_CATEGORY_NOT_CONFIGURED')
    assert.equal(h.routeInputs.length, 0)
    assert.equal(h.folderNames.length, 0)
    assert.equal(h.uploads.length, 0)
  }
})

test('live-image same-category replay is idempotent, while the other physical alias conflicts before side effects', async () => {
  const first = harness()
  const firstResponse = await first.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(firstResponse.status, 200)
  assert.equal(first.uploads.length, 1)
  const folderCount = first.folderNames.length

  const replay = await first.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).image.category, 'key_visual')
  assert.equal(first.uploads.length, 1)

  const crossCategory = await first.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'live_session' }))
  assert.equal(crossCategory.status, 409)
  assert.equal((await crossCategory.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.equal(first.uploads.length, 1)
  assert.equal(first.folderNames.length, folderCount)
  assert.equal(first.calls.some(call => call.startsWith('delete:')), false)
})

test('live-image category collision is symmetric when live_session exists first', async () => {
  const h = harness()
  const first = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'live_session' }))
  assert.equal(first.status, 200)
  const folderCount = h.folderNames.length

  const conflict = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.equal(h.uploads.length, 1)
  assert.equal(h.folderNames.length, folderCount)
})

test('live-image provider mismatch conflicts without cross-provider fallback', async () => {
  const googleFirst = harness()
  const uploaded = await googleFirst.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(uploaded.status, 200)
  const folderCount = googleFirst.folderNames.length

  const oneDriveRequest = await googleFirst.handler.POST(formRequest({
    kind: 'live', report_id: 'report-1', category: 'key_visual', provider: 'onedrive',
  }))
  assert.equal(oneDriveRequest.status, 409)
  assert.equal((await oneDriveRequest.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.deepEqual(googleFirst.uploads.map(upload => upload.destination?.provider), ['google_drive'])
  assert.equal(googleFirst.folderNames.length, folderCount)

  const onedriveFirst = harness()
  const oneDriveUpload = await onedriveFirst.handler.POST(formRequest({
    kind: 'live', report_id: 'report-1', category: 'key_visual', provider: 'onedrive',
  }))
  assert.equal(oneDriveUpload.status, 200)
  const googleRequest = await onedriveFirst.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(googleRequest.status, 409)
  assert.equal((await googleRequest.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.deepEqual(onedriveFirst.uploads.map(upload => upload.destination?.provider), ['onedrive'])
})

test('legacy provider-less live metadata cannot satisfy a routed provider replay', async () => {
  const input: OperationalStoragePlacementInput = {
    provider: 'google_drive', executionSource: 'internal', brandId: 'stg-b1', platformId: 'stg-p1',
    subbrandKey: null, shiftDate: '2026-10-01', logicalCategory: 'live_visual', fileName: 'filename.png',
  }
  const placement = resolveOperationalStoragePlacement(routeFor(input), input)
  const h = harness({ existingLiveImage: {
    id: 'legacy-live-image', report_id: 'report-1', category: 'key_visual',
    file_url: [...placement.folderSegments, placement.fileName].join('/'), provider: null, external_file_id: null,
  } })
  const response = await h.handler.POST(formRequest({ kind: 'live', report_id: 'report-1', category: 'key_visual' }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.equal(h.folderNames.length, 0)
  assert.equal(h.uploads.length, 0)
})

test('dashboard same-provider replay is idempotent and provider mismatch conflicts', async () => {
  const h = harness()
  const first = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(first.status, 200)
  const folderCount = h.folderNames.length
  const replay = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  assert.equal(replay.status, 200)
  assert.equal(h.uploads.length, 1)

  const mismatch = await h.handler.POST(formRequest({
    kind: 'report', report_id: 'report-1', image_type: 'dashboard', provider: 'onedrive',
  }))
  assert.equal(mismatch.status, 409)
  assert.equal((await mismatch.json()).error.code, 'REPORT_IMAGE_FILE_NAME_CONFLICT')
  assert.deepEqual(h.uploads.map(upload => upload.destination?.provider), ['google_drive'])
  assert.equal(h.folderNames.length, folderCount)
})

test('metadata failure cleans up only the uploaded file, not materialized folders', async () => {
  const h = harness({ rpcError: { message: 'sensitive database error detail' } })
  const response = await h.handler.POST(formRequest({ kind: 'report', report_id: 'report-1', image_type: 'dashboard' }))
  const payload = await response.json()
  assert.equal(response.status, 502)
  assert.equal(payload.error.code, 'REPORT_IMAGE_STORAGE_FAILED')
  assert.doesNotMatch(JSON.stringify(payload), /sensitive database error detail/)
  assert.deepEqual(h.calls.filter(call => call.startsWith('delete:')), ['delete:google_drive:file-1'])
  assert.equal(h.folderNames.includes('filename.png'), false)
})
