import assert from 'node:assert/strict'
import test from 'node:test'
import {
  reportExternalSummaryService,
  ReportExternalSummaryServiceError,
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
    let capturedBody: any = null
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
              version: 1,
              workflowState: 'draft',
              replayed: false,
              reportRevisionId: null,
            },
            readback: {
              reportId: 'rep-1',
              summary: {
                ...mockSummary,
                id: '22222222-2222-2222-2222-222222222222',
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
