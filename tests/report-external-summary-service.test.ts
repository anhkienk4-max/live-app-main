import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reportExternalSummaryService,
  ReportExternalSummaryServiceError,
  resolveSecureUuid,
  summaryOperationSlot,
  pendingKeyFor,
  clearPendingKey,
} from '../lib/services/reportExternalSummaryService.ts'

const mockSummary = {
  id: '9a0e98c5-90ef-4f44-8baa-733f47fa237e',
  content: 'Operational summary text',
  workflowState: 'draft' as const,
  version: 1,
  createdBy: 'user-admin',
  updatedBy: 'user-admin',
  submittedBy: null,
  submittedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  createdAt: '2026-11-26T08:00:00Z',
  updatedAt: '2026-11-26T08:00:00Z',
}

test('reportExternalSummaryService.getSummary requires reportId', async () => {
  await assert.rejects(
    () => reportExternalSummaryService.getSummary(''),
    (err: ReportExternalSummaryServiceError) => {
      assert.equal(err.code, 'REPORT_EXTERNAL_SUMMARY_QUERY_INVALID')
      assert.equal(err.status, 400)
      return true
    }
  )
})

test('reportExternalSummaryService.saveDraft invokes executeWorkflow with save_draft payload', async () => {
  const originalFetch = globalThis.fetch
  try {
    let capturedUrl = ''
    let capturedBody: Record<string, unknown> | null = null
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url
      capturedBody = JSON.parse(init?.body as string)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mutation: {
              reportId: 'rep-1',
              summaryId: mockSummary.id,
              version: 1,
              workflowState: 'draft',
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-1',
              summary: mockSummary,
            },
          },
        }),
      } as Response
    }) as typeof fetch

    const result = await reportExternalSummaryService.saveDraft({
      reportId: 'rep-1',
      summaryId: null,
      content: 'Operational summary text',
      expectedVersion: 0,
      idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
    })

    assert.equal(capturedUrl, '/api/reports/external-operational-summary')
    assert.equal(capturedBody.action, 'save_draft')
    assert.equal(capturedBody.reportId, 'rep-1')
    assert.equal(capturedBody.content, 'Operational summary text')
    assert.equal(result.mutation.summaryId, mockSummary.id)
    assert.equal(result.readback.summary?.content, 'Operational summary text')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reportExternalSummaryService.reject requires review reason', async () => {
  await assert.rejects(
    () =>
      reportExternalSummaryService.reject({
        reportId: 'rep-1',
        summaryId: mockSummary.id,
        expectedVersion: 1,
        reason: '   ',
      }),
    (err: ReportExternalSummaryServiceError) => {
      assert.equal(err.code, 'REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID')
      assert.equal(err.status, 400)
      return true
    }
  )
})

test('reportExternalSummaryService fails closed when readback summary id mismatches mutation receipt', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mutation: {
              reportId: 'rep-1',
              summaryId: '11111111-1111-1111-1111-111111111111',
              version: 2,
              workflowState: 'submitted',
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-1',
              summary: {
                ...mockSummary,
                id: '22222222-2222-2222-2222-222222222222',
                version: 2,
                workflowState: 'submitted',
              },
            },
          },
        }),
      } as Response
    }) as typeof fetch

    await assert.rejects(
      () =>
        reportExternalSummaryService.executeWorkflow({
          action: 'submit',
          reportId: 'rep-1',
          summaryId: '11111111-1111-1111-1111-111111111111',
          content: null,
          expectedVersion: 1,
          reason: null,
          idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
        }),
      (err: ReportExternalSummaryServiceError) => {
        assert.equal(err.code, 'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID')
        assert.equal(err.status, 502)
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reportExternalSummaryService fails closed when readback summary is missing', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mutation: {
              reportId: 'rep-1',
              summaryId: '11111111-1111-1111-1111-111111111111',
              version: 1,
              workflowState: 'draft',
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-1',
              summary: null,
            },
          },
        }),
      } as Response
    }) as typeof fetch

    await assert.rejects(
      () =>
        reportExternalSummaryService.executeWorkflow({
          action: 'save_draft',
          reportId: 'rep-1',
          summaryId: null,
          content: 'Test content',
          expectedVersion: 0,
          reason: null,
          idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
        }),
      (err: ReportExternalSummaryServiceError) => {
        assert.equal(err.code, 'REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED')
        assert.equal(err.status, 503)
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reportExternalSummaryService fails closed when mutation workflow state does not match action', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mutation: {
              reportId: 'rep-1',
              summaryId: mockSummary.id,
              version: 2,
              workflowState: 'draft', // Expected 'approved' for approve action
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-1',
              summary: {
                ...mockSummary,
                version: 2,
                workflowState: 'draft',
              },
            },
          },
        }),
      } as Response
    }) as typeof fetch

    await assert.rejects(
      () =>
        reportExternalSummaryService.executeWorkflow({
          action: 'approve',
          reportId: 'rep-1',
          summaryId: mockSummary.id,
          content: null,
          expectedVersion: 1,
          reason: null,
          idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
        }),
      (err: ReportExternalSummaryServiceError) => {
        assert.equal(err.code, 'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID')
        assert.equal(err.status, 502)
        return true
      }
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reportExternalSummaryService preserves idempotency key on network failure so retry re-sends it', async () => {
  const originalFetch = globalThis.fetch
  const slot = summaryOperationSlot('rep-network-1', 'save_draft', null)
  let attempt = 0
  const keysSent: string[] = []

  try {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      attempt++
      const body = JSON.parse(init?.body as string)
      keysSent.push(body.idempotencyKey)
      if (attempt === 1) {
        throw new Error('ECONNRESET connection lost')
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            mutation: {
              reportId: 'rep-network-1',
              summaryId: mockSummary.id,
              version: 1,
              workflowState: 'draft',
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-network-1',
              summary: {
                ...mockSummary,
                id: mockSummary.id,
                version: 1,
                workflowState: 'draft',
              },
            },
          },
        }),
      } as Response
    }) as typeof fetch

    // Attempt 1 fails with network error
    await assert.rejects(
      () =>
        reportExternalSummaryService.saveDraft({
          reportId: 'rep-network-1',
          summaryId: null,
          content: 'Draft content',
          expectedVersion: null,
        }),
      (err: ReportExternalSummaryServiceError) => {
        assert.equal(err.code, 'NETWORK_ERROR')
        return true
      }
    )

    // Key must be preserved in pending slot
    const preservedKey = pendingKeyFor(slot)
    assert.ok(preservedKey, 'Pending key should remain recorded after network error')
    assert.equal(keysSent[0], preservedKey)

    // Attempt 2 succeeds using the preserved key
    const successResult = await reportExternalSummaryService.saveDraft({
      reportId: 'rep-network-1',
      summaryId: null,
      content: 'Draft content',
      expectedVersion: null,
    })

    assert.equal(attempt, 2)
    assert.equal(keysSent[1], keysSent[0], 'Retry must send the identical idempotency key')
    assert.equal(successResult.mutation.summaryId, mockSummary.id)

    // Key must now be cleared after successful execution
    assert.equal(pendingKeyFor(slot), null, 'Pending key should be cleared after verified success')
  } finally {
    globalThis.fetch = originalFetch
    clearPendingKey(slot, keysSent[0] || '')
  }
})

test('resolveSecureUuid returns valid UUID and does not use temp-key fallback', () => {
  const uuid = resolveSecureUuid()
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  assert.notEqual(uuid, 'temp-key')
})
