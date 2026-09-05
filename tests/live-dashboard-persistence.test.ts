import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIVE_DASHBOARD_IMAGE_BUCKET,
  uploadDashboardScreenshot,
} from '@/lib/services/liveDashboardStorageService'
import { createSupabaseDashboardUpdateRepository } from '@/lib/services/supabaseDashboardUpdateService'

test('dashboard screenshot upload returns an owned durable storage reference', async () => {
  const uploads: string[] = []
  const client = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, LIVE_DASHBOARD_IMAGE_BUCKET)
        return {
          async upload(path: string) { uploads.push(path); return { data: null, error: null } },
          getPublicUrl(path: string) { return { data: { publicUrl: `https://cdn.test/${path}` } } },
        }
      },
    },
  } as never
  const result = await uploadDashboardScreenshot(
    new Blob(['screenshot'], { type: 'image/png' }) as Blob & { type: string; size: number },
    'shift-1',
    client,
  )
  assert.match(result.storagePath, /^dashboard\/shift-1\/[0-9a-f-]+\.png$/)
  assert.equal(result.screenshotUrl, `https://cdn.test/${result.storagePath}`)
  assert.deepEqual(uploads, [result.storagePath])
})

test('dashboard screenshot upload rejects provider failure without returning a reference', async () => {
  const client = {
    storage: {
      from() {
        return {
          async upload() { return { data: null, error: new Error('storage unavailable') } },
          getPublicUrl() { return { data: { publicUrl: 'https://cdn.test/should-not-exist' } } },
        }
      },
    },
  } as never
  await assert.rejects(
    () => uploadDashboardScreenshot(new Blob(['screenshot'], { type: 'image/png' }) as Blob & { type: string; size: number }, 'shift-1', client),
    /upload failed/,
  )
})

test('dashboard repository sends the durable screenshot reference to the persistence RPC', async () => {
  const calls: Array<{ name: string; payload: unknown }> = []
  const repository = createSupabaseDashboardUpdateRepository({
    rpc(name: string, payload: unknown) {
      calls.push({ name, payload })
      return {
        async single() {
          return {
            data: {
              id: 'update-1', shift_id: 'shift-1', time: '2026-09-05T03:00:00.000Z',
              revenue: 1, orders: 2, peak_viewers: 3, current_viewers: 4,
              screenshot_url: 'https://cdn.test/dashboard/shift-1/image.png',
              screenshot_storage_path: 'dashboard/shift-1/image.png',
              created_at: '2026-09-05T03:00:00.000Z', updated_at: '2026-09-05T03:00:00.000Z',
            },
            error: null,
          }
        },
      }
    },
  } as never)
  const result = await repository.create({
    shift_id: 'shift-1', time: '2026-09-05T03:00:00.000Z', revenue: 1, orders: 2,
    peak_viewers: 3, current_viewers: 4,
    screenshot_url: 'https://cdn.test/dashboard/shift-1/image.png',
    screenshot_storage_path: 'dashboard/shift-1/image.png',
  })
  assert.equal(calls[0]?.name, 'create_dashboard_update')
  assert.equal((calls[0]?.payload as { p_data: Record<string, unknown> }).p_data.screenshot_storage_path, 'dashboard/shift-1/image.png')
  assert.equal(result.screenshot_storage_path, 'dashboard/shift-1/image.png')
})

test('dashboard repository reports persistence failure instead of false success', async () => {
  const repository = createSupabaseDashboardUpdateRepository({
    rpc(name: string) {
      assert.equal(name, 'create_dashboard_update')
      return {
        async single() { return { data: null, error: new Error('database unavailable') } },
      }
    },
  } as never)
  await assert.rejects(
    () => repository.create({ shift_id: 'shift-1', time: new Date().toISOString(), revenue: 0, orders: 0, peak_viewers: 0, current_viewers: 0 }),
    /could not be persisted/,
  )
})
