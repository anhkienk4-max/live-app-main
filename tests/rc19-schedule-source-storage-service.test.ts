import assert from 'node:assert/strict'
import test from 'node:test'
import {
  uploadScheduleSourceFile,
  verifyScheduleSourceFile,
  downloadScheduleSourceFile,
  type ScheduleSourceFileReceipt,
} from '@/lib/services/scheduleSourceStorageService'

const originalEnv = { ...process.env }

function resetEnv() {
  process.env = { ...originalEnv }
}

function mockFile(): File {
  return new File(['test,data\n1,2'], 'test.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

test('Mock mode: uploadScheduleSourceFile returns mock verified receipt in explicit mock mode', async () => {
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'

  const file = mockFile()
  const receipt = await uploadScheduleSourceFile('batch-123', file)

  assert.equal(receipt.id, 'mock-source-batch-123')
  assert.equal(receipt.batch_id, 'batch-123')
  assert.equal(receipt.provider, 'google_drive')
  assert.equal(receipt.reconciliation_status, 'provider_verified')
  assert.equal(receipt.file_name, 'test.xlsx')

  // Mock mode verify succeeds for mock source id
  await assert.doesNotReject(() => verifyScheduleSourceFile('mock-source-batch-123'))

  // Mock mode download returns blob
  const blob = await downloadScheduleSourceFile('mock-source-batch-123')
  assert.ok(blob instanceof Blob)
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

  resetEnv()
})

test('Mock mode: verifyScheduleSourceFile rejects unknown non-mock file IDs', async () => {
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'

  await assert.rejects(
    () => verifyScheduleSourceFile('unknown-file-id'),
    /SCHEDULE_SOURCE_VERIFY_FAILED/,
  )

  await assert.rejects(
    () => downloadScheduleSourceFile('unknown-file-id'),
    /SCHEDULE_SOURCE_DOWNLOAD_FAILED/,
  )

  resetEnv()
})

test('Supabase mode: fails closed on HTTP 401 Unauthorized without creating fake receipt', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

  const mockFetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: { code: 'UNAUTHORIZED' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = mockFile()
  await assert.rejects(
    () => uploadScheduleSourceFile('batch-sec-401', file, mockFetcher),
    (err: Error) => {
      assert.equal(err.message, 'UNAUTHORIZED')
      return true
    },
  )

  resetEnv()
})

test('Supabase mode: fails closed on HTTP 404 Not Found without creating fake receipt', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key'

  const mockFetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: { code: 'SCHEDULE_SOURCE_BATCH_NOT_FOUND' } }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = mockFile()
  await assert.rejects(
    () => uploadScheduleSourceFile('batch-sec-404', file, mockFetcher),
    (err: Error) => {
      assert.equal(err.message, 'SCHEDULE_SOURCE_BATCH_NOT_FOUND')
      return true
    },
  )

  resetEnv()
})

test('Supabase mode: fails closed on network timeout or fetch failure', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'

  const timeoutFetcher: typeof fetch = async () => {
    throw new TypeError('Network connection timed out')
  }

  const file = mockFile()
  await assert.rejects(
    () => uploadScheduleSourceFile('batch-timeout', file, timeoutFetcher),
    /Network connection timed out/,
  )

  resetEnv()
})

test('Supabase mode: fails closed on missing / invalid response configuration', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'

  // Server returns 500 error or malformed payload
  const errorFetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: { code: 'INTERNAL_SERVER_ERROR' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = mockFile()
  await assert.rejects(
    () => uploadScheduleSourceFile('batch-500', file, errorFetcher),
    (err: Error) => {
      assert.equal(err.message, 'INTERNAL_SERVER_ERROR')
      return true
    },
  )

  resetEnv()
})

test('Supabase mode: verifyScheduleSourceFile calls endpoint and fails closed when verification fails', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'

  const failedVerifyFetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ ok: false, error: { code: 'SCHEDULE_SOURCE_VERIFY_FAILED' } }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await assert.rejects(
    () => verifyScheduleSourceFile('550e8400-e29b-41d4-a716-446655440000', failedVerifyFetcher),
    /SCHEDULE_SOURCE_VERIFY_FAILED/,
  )

  resetEnv()
})

test('Supabase mode: verifyScheduleSourceFile succeeds when server returns verified', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'

  let calledUrl = ''
  const successVerifyFetcher: typeof fetch = async (input) => {
    calledUrl = String(input)
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  await verifyScheduleSourceFile('550e8400-e29b-41d4-a716-446655440000', successVerifyFetcher)
  assert.ok(calledUrl.includes('file_id=550e8400-e29b-41d4-a716-446655440000'))
  assert.ok(calledUrl.includes('verify_only=true'))

  resetEnv()
})

test('Supabase mode: uploadScheduleSourceFile returns verified receipt when server responds 200 ok', async () => {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://production.supabase.co'

  const expectedReceipt: ScheduleSourceFileReceipt = {
    id: 'real-source-file-123',
    batch_id: 'batch-success',
    provider: 'google_drive',
    external_file_id: 'drive-file-abc',
    external_parent_id: 'drive-folder-xyz',
    file_name: 'test.xlsx',
    mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size_bytes: 1024,
    checksum_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    reconciliation_status: 'provider_verified',
  }

  const successFetcher: typeof fetch = async () => {
    return new Response(JSON.stringify({ ok: true, file: expectedReceipt }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const file = mockFile()
  const result = await uploadScheduleSourceFile('batch-success', file, successFetcher)
  assert.deepEqual(result, expectedReceipt)

  resetEnv()
})
