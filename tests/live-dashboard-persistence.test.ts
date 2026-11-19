import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LIVE_DASHBOARD_IMAGE_MAX_BYTES,
  uploadDashboardScreenshot,
} from '@/lib/services/liveDashboardStorageService'
import { createSupabaseDashboardUpdateRepository, dashboardUpdateFromRow } from '@/lib/services/supabaseDashboardUpdateService'

test('dashboard screenshot uploads through operational Drive storage and returns a private readback URL', async () => {
  let captured: FormData | undefined
  const result = await uploadDashboardScreenshot(
    new Blob(['screenshot'], { type: 'image/png' }) as Blob & { type: string; size: number },
    'shift-1',
    async (url, init) => {
      assert.equal(url, '/api/operational-files')
      assert.equal(init?.method, 'POST')
      captured = init?.body as FormData
      return Response.json({ ok: true, file: { id: 'file-1', provider: 'google_drive' } })
    },
  )
  assert.equal(captured?.get('shift_id'), 'shift-1')
  assert.equal(captured?.get('category'), 'live_snapshot')
  assert.equal(captured?.get('provider'), 'google_drive')
  assert.equal((captured?.get('file') as File).name, 'dashboard-snapshot.png')
  assert.equal(result.fileId, 'file-1')
  assert.equal(result.storagePath, 'dashboard/shift-1/file-1.png')
  assert.equal(result.screenshotUrl, '/api/dashboard-screenshots?file_id=file-1')
})

test('dashboard screenshot upload rejects invalid type, oversize image, and provider failures', async () => {
  await assert.rejects(
    () => uploadDashboardScreenshot(new Blob(['x'], { type: 'image/svg+xml' }) as Blob & { type: string; size: number }, 'shift-1'),
    /Unsupported dashboard image type/,
  )
  await assert.rejects(
    () => uploadDashboardScreenshot({ type: 'image/png', size: LIVE_DASHBOARD_IMAGE_MAX_BYTES + 1 } as Blob & { type: string; size: number }, 'shift-1'),
    /too large/,
  )
  await assert.rejects(
    () => uploadDashboardScreenshot(new Blob(['x'], { type: 'image/png' }) as Blob & { type: string; size: number }, 'shift-1',
      async () => Response.json({ ok: false }, { status: 502 })),
    /upload failed/,
  )
})

test('dashboard repository sends the Drive file reference to the protected persistence RPC', async () => {
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
              screenshot_url: '/api/dashboard-screenshots?file_id=file-1',
              screenshot_storage_path: 'dashboard/shift-1/file-1', screenshot_file_id: 'file-1',
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
    screenshot_url: '/api/dashboard-screenshots?file_id=file-1',
    screenshot_storage_path: 'dashboard/shift-1/file-1', screenshot_file_id: 'file-1',
  })
  const data = (calls[0]?.payload as { p_data: Record<string, unknown> }).p_data
  assert.equal(calls[0]?.name, 'create_dashboard_update')
  assert.equal(data.screenshot_file_id, 'file-1')
  assert.equal(result.screenshot_file_id, 'file-1')
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

test('legacy screenshot rows reload through the authenticated dashboard screenshot route', () => {
  const update = dashboardUpdateFromRow({
    id: 'update-legacy', shift_id: 'shift-1', time: '2026-09-05T03:00:00.000Z',
    created_at: '2026-09-05T03:00:00.000Z', updated_at: '2026-09-05T03:00:00.000Z',
    screenshot_url: 'https://project.supabase.co/storage/v1/object/public/live-dashboard-images/dashboard/shift-1/old.png',
    screenshot_storage_path: 'dashboard/shift-1/old.png', screenshot_file_id: null,
  })
  assert.equal(update.screenshot_url, '/api/dashboard-screenshots?storage_path=dashboard%2Fshift-1%2Fold.png')
})
