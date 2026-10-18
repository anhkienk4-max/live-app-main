import assert from 'node:assert/strict'
import test from 'node:test'
import type { DashboardUpdate } from '../lib/types/database.types.ts'
import { reportSnapshotImport } from '../lib/utils/reportSnapshotImport.ts'

const snapshot = {
  id: 'snapshot-1', shift_id: 'shift-1', time: '2026-10-19T10:00:00Z',
  dashboard_platform: 'tiktok_shop', normalized_metrics: { gmv: 120, comments: 3, sales: 999, shares: null },
  revenue: 120, orders: 2, peak_viewers: 10, current_viewers: 5,
  created_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z',
} as DashboardUpdate

test('imports only finite metrics from one authorized shift and preserves provenance', () => {
  const result = reportSnapshotImport(snapshot, 'shift-1', 'tiktok_shop', 'user-1', '2026-10-19T11:00:00Z')
  assert.deepEqual(result.values, { gmv: 120, comments: 3 })
  assert.equal(result.review.source_snapshot?.id, 'snapshot-1')
  assert.equal(result.review.metrics.gmv?.confirmed_by, 'user-1')
  assert.equal(result.review.metrics.gmv?.source, 'imported')
  assert.equal(result.review.status, 'review_required')
})

test('rejects a cross-shift, cross-platform, deleted, or empty snapshot', () => {
  assert.throws(() => reportSnapshotImport(snapshot, 'shift-2', 'tiktok_shop', 'user-1'))
  assert.throws(() => reportSnapshotImport(snapshot, 'shift-1', 'shopee_live', 'user-1'))
  assert.throws(() => reportSnapshotImport({ ...snapshot, deleted_at: '2026-10-19T11:00:00Z' }, 'shift-1', 'tiktok_shop', 'user-1'))
  assert.throws(() => reportSnapshotImport({ ...snapshot, normalized_metrics: {} }, 'shift-1', 'tiktok_shop', 'user-1'))
})
