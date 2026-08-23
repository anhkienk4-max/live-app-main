import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SwapRequestList } from '../components/features/swaps/SwapRequestList.tsx'
import { ReportsList } from '../components/features/reports/ReportsList.tsx'
import { ToastProvider } from '../components/ui/toast.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'
import { currentUserService, reportService, swapRequestService } from '../lib/services/dataService.ts'
import { setSupabaseReportRepositoryForTests, type SupabaseReportRepository } from '../lib/services/supabaseReportService.ts'
import type { User } from '../lib/types/database.types.ts'

const storage = new Map<string, string>()
const storageApi = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value) },
  removeItem: (key: string) => { storage.delete(key) },
  clear: () => { storage.clear() },
}
const mockWindow = {
  localStorage: storageApi,
  sessionStorage: storageApi,
  crypto: globalThis.crypto,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => true,
}
Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true })

const adminUser = (): User => ({
  id: '1',
  email: 'admin@livestream.com',
  full_name: 'Admin',
  role: 'admin',
  system_permission: 'admin',
  operational_roles: [],
  status: 'active',
  account_status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

function setAuthMode(mode: 'mock' | 'supabase') {
  process.env.NODE_ENV = mode === 'mock' ? 'development' : 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = mode === 'mock' ? 'true' : 'false'
}

async function withEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

function renderSwapList() {
  return renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(ToastProvider, null, createElement(SwapRequestList)),
  ))
}

function renderReportsList() {
  return renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(ToastProvider, null, createElement(ReportsList)),
  ))
}

test('SwapRequestList shows safe-degradation message in Supabase mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())
    const markup = renderSwapList()
    assert.match(markup, /Shift Swap is temporarily unavailable while shared persistence is being upgraded/)
  })
})

test('SwapRequestList keeps normal UI in mock mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    currentUserService.bindAuthenticatedUser(adminUser())
    const markup = renderSwapList()
    assert.doesNotMatch(markup, /temporarily unavailable/)
  })
})

test('ReportService no longer shows safe-degradation in Supabase mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())

    // ReportsList does not gate on Supabase mode — it renders the normal UI.
    const markup = renderReportsList()
    assert.doesNotMatch(markup, /temporarily unavailable/)
  })
})

test('ReportsList keeps normal UI in mock mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    currentUserService.bindAuthenticatedUser(adminUser())
    const markup = renderReportsList()
    assert.doesNotMatch(markup, /temporarily unavailable/)
  })
})

test('swapRequestService mutations fail closed in Supabase mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())

    await assert.rejects(
      swapRequestService.create({
        shift_id: 'shift-1',
        requester_id: '1',
        operational_role: 'host',
        replacement_staff_id: '2',
        reason: 'schedule conflict',
      }),
      /Shift Swap is temporarily unavailable/,
    )
    await assert.rejects(swapRequestService.approve('swap-1', '1'), /Shift Swap is temporarily unavailable/)
    await assert.rejects(swapRequestService.reject('swap-1', '1'), /Shift Swap is temporarily unavailable/)
    await assert.rejects(swapRequestService.cancel('swap-1', '1', 'reason'), /Shift Swap is temporarily unavailable/)
  })
})

test('reportService mutations route to Supabase repository in Supabase mode', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    currentUserService.bindAuthenticatedUser(adminUser())

    const calls: string[] = []
    const fakeRepository: SupabaseReportRepository = {
      getAll: () => { calls.push('getAll'); return Promise.resolve([]) },
      getAllIncludingArchived: () => { calls.push('getAllIncludingArchived'); return Promise.resolve([]) },
      getById: () => { calls.push('getById'); return Promise.resolve(null) },
      getByShift: () => { calls.push('getByShift'); return Promise.resolve(null) },
      getConfirmed: () => { calls.push('getConfirmed'); return Promise.resolve([]) },
      getReportRevisions: () => { calls.push('getReportRevisions'); return Promise.resolve([]) },
      create: () => { calls.push('create'); return Promise.resolve({ id: 'r1', shift_id: 'shift-1', status: 'draft', metrics_confirmed: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never) },
      update: () => { calls.push('update'); return Promise.resolve(null) },
      startReview: () => { calls.push('startReview'); return Promise.resolve(null) },
      rejectReview: () => { calls.push('rejectReview'); return Promise.resolve(null) },
      reopen: () => { calls.push('reopen'); return Promise.resolve(null) },
      resetOcr: () => { calls.push('resetOcr'); return Promise.resolve(null) },
      recordOcrRun: () => { calls.push('recordOcrRun'); return Promise.resolve(null) },
      removeDraft: () => { calls.push('removeDraft'); return Promise.resolve(true) },
      archive: () => { calls.push('archive'); return Promise.resolve(null) },
      restore: () => { calls.push('restore'); return Promise.resolve(null) },
      getReportImages: () => { calls.push('getReportImages'); return Promise.resolve([]) },
      uploadReportImage: () => { calls.push('uploadReportImage'); return Promise.resolve({} as never) },
      getReportImageById: () => { calls.push('getReportImageById'); return Promise.resolve(null) },
      removeReportImage: () => { calls.push('removeReportImage'); return Promise.resolve(true) },
      getLiveReportImages: () => { calls.push('getLiveReportImages'); return Promise.resolve([]) },
      getLiveReportImageById: () => { calls.push('getLiveReportImageById'); return Promise.resolve(null) },
      upsertLiveReportImage: () => { calls.push('upsertLiveReportImage'); return Promise.resolve({} as never) },
      updateLiveReportImageMetadata: () => { calls.push('updateLiveReportImageMetadata'); return Promise.resolve({} as never) },
      setLiveReportImageCover: () => { calls.push('setLiveReportImageCover'); return Promise.resolve() },
      reorderLiveReportImages: () => { calls.push('reorderLiveReportImages'); return Promise.resolve() },
      removeLiveReportImage: () => { calls.push('removeLiveReportImage'); return Promise.resolve(true) },
      uploadBlob: () => { calls.push('uploadBlob'); return Promise.resolve({ storagePath: '', publicUrl: '' }) },
    }

    setSupabaseReportRepositoryForTests(fakeRepository)
    try {
      await reportService.create({
        shift_id: 'shift-1',
        submitted_by: '1',
        revenue: 0,
        orders: 0,
        peak_viewer: 0,
        average_viewer: 0,
        comments: 0,
        shares: 0,
      } as never)
      assert.ok(calls.includes('create'))

      await reportService.update('r1', { revenue: 100 } as never, '1', 'adjust', 'save')
      assert.ok(calls.includes('update'))

      await reportService.archive('r1', '1', 'test')
      assert.ok(calls.includes('archive'))

      await reportService.removeDraft('r1', '1', 'test')
      assert.ok(calls.includes('removeDraft'))

      await reportService.getReportRevisions('r1')
      assert.ok(calls.includes('getReportRevisions'))
    } finally {
      setSupabaseReportRepositoryForTests(undefined)
    }
  })
})
