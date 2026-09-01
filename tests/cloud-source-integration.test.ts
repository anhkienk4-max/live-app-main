import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'

import { fetchCloudFileSource } from '@/lib/services/applicationFileSourceClient'
import {
  createApplicationFileSourceService,
  type ApplicationFileSourceService,
} from '@/lib/services/applicationFileSourceService'
import { parseScheduleTabularData } from '@/lib/utils/excelUtils'
import { AuthorizationError, type AuthenticatedServerUser } from '@/lib/server/authGuards'
import { createApplicationFileSourcePostHandler } from '@/lib/server/applicationFileSourceRouteHandler'
import { CloudFileIngestionError } from '@/lib/services/cloudFileIngestionService'

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PNG_MIME = 'image/png'

function normalizedFile(overrides: Partial<{
  sourceType: 'google_drive' | 'onedrive'
  providerResourceId: string
  filename: string
  mimeType: string
  content: Uint8Array
}> = {}) {
  const content = overrides.content || new Uint8Array([1, 2, 3])
  return {
    sourceType: overrides.sourceType || 'google_drive' as const,
    providerResourceId: overrides.providerResourceId || 'file-1',
    filename: overrides.filename || 'schedule.xlsx',
    mimeType: overrides.mimeType || XLSX_MIME,
    size: content.byteLength,
    content,
  }
}

const member: AuthenticatedServerUser = {
  id: 'member-1',
  systemPermission: 'member',
}

const admin: AuthenticatedServerUser = {
  id: 'admin-1',
  systemPermission: 'admin',
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost/api/file-sources/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function serviceReturning(result = normalizedFile()): ApplicationFileSourceService {
  return {
    async ingest() {
      return result
    },
  }
}

test('application source route authorizes the workflow and returns only safe normalized file headers', async () => {
  let authorizationPurpose = ''
  let receivedSource = ''
  const handler = createApplicationFileSourcePostHandler({
    resolveUser: async () => admin,
    sourceService: {
      async ingest(source, purpose) {
        receivedSource = `${source.type}:${source.resource}`
        authorizationPurpose = purpose
        return normalizedFile({
          sourceType: 'onedrive',
          providerResourceId: 'item-1!drive',
          filename: 'evidence Ã©xport.xlsx',
          content: new Uint8Array([7, 8]),
        })
      },
    },
  })

  const response = await handler(jsonRequest({
    purpose: 'schedule_import',
    provider: 'onedrive',
    resource: 'item-1!drive',
  }))

  assert.equal(response.status, 200)
  assert.equal(authorizationPurpose, 'schedule_import')
  assert.equal(receivedSource, 'onedrive:item-1!drive')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('x-file-provider'), 'onedrive')
  assert.equal(response.headers.get('x-file-resource-id'), 'item-1!drive')
  assert.equal(response.headers.get('x-file-name'), encodeURIComponent('evidence Ã©xport.xlsx'))
  assert.equal(response.headers.has('authorization'), false)
  assert.equal(response.headers.has('x-provider-metadata'), false)
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [7, 8])
})

test('application source route uses existing permission guards for schedule and report workflows', async () => {
  const handler = createApplicationFileSourcePostHandler({
    resolveUser: async () => member,
    sourceService: serviceReturning(normalizedFile({ mimeType: PNG_MIME, filename: 'evidence.png' })),
  })

  const scheduleResponse = await handler(jsonRequest({
    purpose: 'schedule_import',
    provider: 'google_drive',
    resource: 'file-1',
  }))
  assert.equal(scheduleResponse.status, 403)
  assert.equal((await scheduleResponse.json()).error.code, 'PERMISSION_DENIED')

  const reportResponse = await handler(jsonRequest({
    purpose: 'report',
    provider: 'google_drive',
    resource: 'file-1',
  }))
  assert.equal(reportResponse.status, 200)
})

test('application source route maps provider-neutral ingestion failures without leaking provider details', async () => {
  const handler = createApplicationFileSourcePostHandler({
    authorize: async () => undefined,
    sourceService: {
      async ingest() {
        throw new CloudFileIngestionError('CLOUD_INGESTION_PERMISSION_DENIED', 'provider token must not escape')
      },
    },
  })
  const response = await handler(jsonRequest({
    purpose: 'report',
    provider: 'google_drive',
    resource: 'file-1',
  }))

  assert.equal(response.status, 403)
  const payload = await response.json()
  assert.deepEqual(payload.error, {
    code: 'CLOUD_INGESTION_PERMISSION_DENIED',
    message: 'The cloud file is not accessible.',
  })
  assert.doesNotMatch(JSON.stringify(payload), /provider token must not escape/)
})

test('application source route rejects malformed input before authorization or provider access', async () => {
  let calls = 0
  const handler = createApplicationFileSourcePostHandler({
    authorize: async () => { calls += 1 },
    sourceService: {
      async ingest() {
        calls += 1
        return normalizedFile()
      },
    },
  })
  const response = await handler(jsonRequest({ purpose: 'report', provider: '', resource: 'file-1' }))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'CLOUD_INGESTION_INVALID_REQUEST')
  assert.equal(calls, 0)
})

test('client helper converts the route response to a File while retaining safe provenance', async () => {
  let requestBody: unknown
  const result = await fetchCloudFileSource(
    { type: 'google_drive', resource: 'https://drive.google.com/file/d/file-1/view' },
    'report',
    async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(new Uint8Array([9, 10]), {
        status: 200,
        headers: {
          'Content-Type': PNG_MIME,
          'X-File-Name': encodeURIComponent('evidence.png'),
          'X-File-Resource-Id': 'file-1',
        },
      })
    },
  )

  assert.deepEqual(requestBody, {
    purpose: 'report',
    provider: 'google_drive',
    resource: 'https://drive.google.com/file/d/file-1/view',
  })
  assert.equal(result.file.name, 'evidence.png')
  assert.equal(result.file.type, PNG_MIME)
  assert.equal(result.sourceType, 'google_drive')
  assert.equal(result.providerResourceId, 'file-1')
  assert.deepEqual([...new Uint8Array(await result.file.arrayBuffer())], [9, 10])
})

test('local, Google Drive, and OneDrive schedule sources converge on the existing parser', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Date', 'Start time', 'End time', 'Brand', 'Platform', 'Campaign', 'Shift title', 'Studio'],
    ['2026-09-10', '10:00', '13:00', 'TechGear Pro', 'TikTok Shop', 'Flash Sale Week', 'Cloud imported shift', 'Studio A'],
  ]), 'Schedule')
  const content = new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const maps = {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['TikTok Shop', 'platform-1']]),
    campaigns: new Map([['Flash Sale Week', 'campaign-1']]),
  }
  const ingestion = {
    async ingest(request: { provider: string }) {
      return {
        provider: request.provider as 'google_drive' | 'onedrive',
        providerResourceId: `${request.provider}-file-1`,
        filename: 'schedule.xlsx',
        mimeType: XLSX_MIME,
        size: content.byteLength,
        metadata: { id: `${request.provider}-file-1`, name: 'schedule.xlsx', mime_type: XLSX_MIME, size_bytes: content.byteLength, kind: 'file' as const },
        content,
      }
    },
  }
  const sourceService = createApplicationFileSourceService(ingestion)
  const local = parseScheduleTabularData(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer, 'array', maps)
  const cloud = await Promise.all((['google_drive', 'onedrive'] as const).map(async type => {
    const file = await sourceService.ingest({ type, resource: `${type}-file-1` }, 'schedule_import', XLSX_MIME)
    return parseScheduleTabularData(file.content.buffer.slice(file.content.byteOffset, file.content.byteOffset + file.content.byteLength) as ArrayBuffer, 'array', maps)
  }))

  assert.equal(local.success, true)
  assert.deepEqual(cloud[0], local)
  assert.deepEqual(cloud[1], local)
})

test('report cloud files are normalized for the same File/OCR evidence path as local files', async () => {
  const localFile = new File([new Uint8Array([1, 2])], 'local.png', { type: PNG_MIME })
  const service = serviceReturning(normalizedFile({ mimeType: PNG_MIME, filename: 'cloud.png', content: new Uint8Array([1, 2]) }))
  const cloud = await service.ingest({ type: 'onedrive', resource: 'item-1!drive' }, 'report', PNG_MIME)
  const cloudFile = new File([cloud.content], cloud.filename, { type: cloud.mimeType })

  assert.equal(localFile.type, cloudFile.type)
  assert.equal(localFile.size, cloudFile.size)
  assert.deepEqual([...new Uint8Array(await localFile.arrayBuffer())], [...new Uint8Array(await cloudFile.arrayBuffer())])
})

test('application source adapter rejects unsupported providers without fallback', async () => {
  const service = createApplicationFileSourceService({
    async ingest() {
      throw new Error('provider should not be called')
    },
  })
  await assert.rejects(
    service.ingest({ type: 'dropbox' as 'google_drive', resource: 'file-1' }, 'report'),
    (error: unknown) => error instanceof CloudFileIngestionError && error.code === 'CLOUD_INGESTION_PROVIDER_UNSUPPORTED',
  )
})

test('authorization errors remain standardized at the route boundary', async () => {
  const handler = createApplicationFileSourcePostHandler({
    authorize: async () => { throw new AuthorizationError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.') },
    sourceService: serviceReturning(),
  })
  const response = await handler(jsonRequest({ purpose: 'report', provider: 'onedrive', resource: 'file-1' }))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, 'AUTHENTICATION_REQUIRED')
})
