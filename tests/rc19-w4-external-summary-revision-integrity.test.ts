import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ReportExternalProjectionSchema,
  ReportRevisionSnapshotResponseSchema,
} from '../lib/types/reportRevisionSnapshot.ts'

test('historical revision A preserves approved summary A even when current workflow approves summary B', () => {
  // Revision A snapshot with approved summary A
  const revisionASnapshot = {
    kind: 'revision' as const,
    reportId: 'rep-hist-001',
    revisionId: 'rev-001',
    revisionVersion: 1,
    createdAt: '2026-11-20T10:00:00Z',
    audience: 'external' as const,
    externalProjection: {
      schemaVersion: 1 as const,
      reportId: 'rep-hist-001',
      revisionVersion: 1,
      status: 'confirmed' as const,
      metrics: {
        revenue: 10000000,
        orders: 150,
        peakViewer: 420,
        averageViewer: 250,
        gmv: 10000000,
        viewers: 420,
        productClicks: 85,
        ctr: 0.12,
        cvr: 0.05,
        averageOrderValue: 66666,
        liveDurationMinutes: 180,
        dashboardPlatform: 'tiktok',
      },
      operationalSummary: {
        version: 1,
        content: 'Summary A: Operational highlights for shift on 2026-11-20.',
      },
    },
  }

  // Revision B snapshot created later with approved summary B
  const revisionBSnapshot = {
    kind: 'revision' as const,
    reportId: 'rep-hist-001',
    revisionId: 'rev-002',
    revisionVersion: 2,
    createdAt: '2026-11-21T15:00:00Z',
    audience: 'external' as const,
    externalProjection: {
      ...revisionASnapshot.externalProjection,
      revisionVersion: 2,
      operationalSummary: {
        version: 2,
        content: 'Summary B: Updated highlights approved subsequently.',
      },
    },
  }

  const parsedA = ReportRevisionSnapshotResponseSchema.safeParse(revisionASnapshot)
  const parsedB = ReportRevisionSnapshotResponseSchema.safeParse(revisionBSnapshot)

  assert.ok(parsedA.success, 'Revision A must parse cleanly')
  assert.ok(parsedB.success, 'Revision B must parse cleanly')

  if (parsedA.data.audience === 'external' && parsedB.data.audience === 'external') {
    // Revision A MUST retain summary A
    assert.equal(parsedA.data.externalProjection.operationalSummary?.content, 'Summary A: Operational highlights for shift on 2026-11-20.')
    assert.equal(parsedA.data.externalProjection.operationalSummary?.version, 1)

    // Revision B has summary B
    assert.equal(parsedB.data.externalProjection.operationalSummary?.content, 'Summary B: Updated highlights approved subsequently.')
    assert.equal(parsedB.data.externalProjection.operationalSummary?.version, 2)

    // Immutability invariant: Revision A is not contaminated by revision B
    assert.notEqual(parsedA.data.externalProjection.operationalSummary?.content, parsedB.data.externalProjection.operationalSummary?.content)
  } else {
    assert.fail('Audience must be external')
  }
})

test('correction-requested revision omits unapproved summary content while prior revisions remain intact', () => {
  // Revision 1: Approved summary
  const rev1 = {
    schemaVersion: 1 as const,
    reportId: 'rep-hist-002',
    revisionVersion: 1,
    status: 'confirmed' as const,
    metrics: { revenue: 5000000, orders: 80, peakViewer: 200, averageViewer: 120, gmv: 5000000, viewers: 200, productClicks: 50, ctr: 0.1, cvr: 0.04, averageOrderValue: 62500, liveDurationMinutes: 120, dashboardPlatform: 'shopee' },
    operationalSummary: { version: 1, content: 'Approved summary v1' },
  }

  // Revision 2: Correction requested -> operationalSummary must be null
  const rev2CorrectionRequested = {
    schemaVersion: 1 as const,
    reportId: 'rep-hist-002',
    revisionVersion: 2,
    status: 'in_review' as const,
    metrics: rev1.metrics,
    operationalSummary: null,
  }

  const parseRev1 = ReportExternalProjectionSchema.safeParse(rev1)
  const parseRev2 = ReportExternalProjectionSchema.safeParse(rev2CorrectionRequested)

  assert.ok(parseRev1.success)
  assert.ok(parseRev2.success)

  assert.equal(parseRev1.data.operationalSummary?.content, 'Approved summary v1')
  assert.equal(parseRev2.data.operationalSummary, null, 'Correction-requested revision must have null operationalSummary')
})

test('missing projection fails closed when audience is external', () => {
  const invalidExternalResponse = {
    kind: 'revision',
    reportId: 'rep-hist-003',
    revisionId: 'rev-003',
    revisionVersion: 1,
    createdAt: '2026-11-20T10:00:00Z',
    audience: 'external',
    // Missing externalProjection
  }

  const result = ReportRevisionSnapshotResponseSchema.safeParse(invalidExternalResponse)
  assert.equal(result.success, false, 'Missing externalProjection must fail closed')
})

test('external projection strictly omits internal personnel identities and notes', () => {
  const externalWithLeakedNotes = {
    schemaVersion: 1,
    reportId: 'rep-004',
    revisionVersion: 1,
    status: 'confirmed',
    metrics: { revenue: 100, orders: 1, peakViewer: 10, averageViewer: 5, gmv: 100, viewers: 10, productClicks: 2, ctr: 0.2, cvr: 0.1, averageOrderValue: 100, liveDurationMinutes: 60, dashboardPlatform: 'tiktok' },
    operationalSummary: { version: 1, content: 'Safe text' },
    // Unauthorized field
    rawNotes: [{ note: 'internal only', author: 'staff-1' }],
    reviewedBy: 'admin-user-id',
  }

  const result = ReportExternalProjectionSchema.safeParse(externalWithLeakedNotes)
  assert.equal(result.success, false, 'External projection schema must be strict and reject unauthorized internal fields')
})
