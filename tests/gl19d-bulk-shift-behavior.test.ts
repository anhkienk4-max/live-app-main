import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'

import { BulkActionsToolbar } from '../components/features/shifts/BulkActionsToolbar.tsx'
import { Button } from '../components/ui/button.tsx'
import { currentUserService, shiftService } from '../lib/services/dataService.ts'
import type { Shift } from '../lib/types/database.types.ts'

const admin = {
  id: '1',
  email: 'admin@example.test',
  full_name: 'Admin',
  role: 'admin' as const,
  system_permission: 'admin' as const,
  operational_roles: [],
  status: 'active' as const,
  account_status: 'active' as const,
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

let seed = 100
function shiftData(title: string): Omit<Shift, 'id' | 'created_at' | 'updated_at'> {
  seed += 1
  return {
    title: `${title} ${seed}`,
    date: `2035-03-${String((seed % 27) + 1).padStart(2, '0')}`,
    start_time: '09:00',
    end_time: '11:00',
    brand_id: 'b1',
    platform_id: 'p1',
    status: 'scheduled',
    registration_locked: false,
    allow_multi_role: false,
  }
}

async function withMockEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    currentUserService.bindAuthenticatedUser(admin)
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
    Object.freeze(value)
  }
  return value
}

interface UpdateCall {
  id: string
  patch: Record<string, unknown>
}

async function withUpdateSpy(run: (calls: UpdateCall[]) => Promise<void>) {
  const originalUpdate = shiftService.update.bind(shiftService)
  const calls: UpdateCall[] = []
  shiftService.update = (async (...args: Parameters<typeof shiftService.update>) => {
    calls.push({ id: args[0], patch: { ...(args[1] as Record<string, unknown>) } })
    return originalUpdate(...args)
  }) as typeof shiftService.update
  try {
    await run(calls)
  } finally {
    shiftService.update = originalUpdate as typeof shiftService.update
  }
}

interface ToastRecord {
  title?: string
  description?: string
  variant?: string
}

interface ToolbarProbe {
  toasts: ToastRecord[]
  onUpdateCalls: number
  onDeselectAllCalls: number
}

function findButtonOnClick(node: unknown, buttonType: unknown, label: string): (() => unknown) | null {
  if (!node || typeof node !== 'object') return null
  const element = node as { type?: unknown; props?: { children?: unknown; onClick?: unknown } }
  if (element.type === buttonType && element.props?.children === label && typeof element.props?.onClick === 'function') {
    return element.props.onClick as () => unknown
  }
  const children = element.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findButtonOnClick(child, buttonType, label)
      if (found) return found
    }
  } else if (children && typeof children === 'object') {
    return findButtonOnClick(children, buttonType, label)
  }
  return null
}

interface ReactClientInternals {
  H?: unknown
}

// Executes the REAL BulkActionsToolbar status handler (extracted live from the
// rendered element tree) against the REAL mock backend, recording the real
// toast payload and callback invocations. The repo has no DOM renderer, so the
// handler runs with a minimal React dispatcher exposing only useContext, which
// is the single hook the toolbar uses. Fails loudly if the pinned React
// internals shape ever changes.
async function clickMarkCompleted(shifts: Shift[]): Promise<ToolbarProbe> {
  const probe: ToolbarProbe = { toasts: [], onUpdateCalls: 0, onDeselectAllCalls: 0 }
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ReactClientInternals
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  assert.ok(
    internals && typeof internals === 'object',
    'React client internals dispatcher slot is required to execute the toolbar handler without a DOM renderer',
  )
  const previousDispatcher = internals.H
  internals.H = {
    useContext: () => ({
      toast: (payload: ToastRecord) => {
        probe.toasts.push({ ...payload })
      },
    }),
  }
  try {
    const tree = BulkActionsToolbar({
      selectedCount: shifts.length,
      onBulkDelete: () => {},
      onDeselectAll: () => {
        probe.onDeselectAllCalls += 1
      },
      shifts,
      onUpdate: async () => {
        probe.onUpdateCalls += 1
      },
    })
    const onClick = findButtonOnClick(tree, Button, 'Mark Completed')
    assert.ok(onClick, 'Mark Completed action must exist in the toolbar')
    await onClick()
  } finally {
    internals.H = previousDispatcher
  }
  return probe
}

// Mock lifecycle: scheduled -> preparing -> live -> completed. Component tests
// target 'completed', so rows must reach live first.
async function makeLive(title: string): Promise<Shift> {
  const created = await shiftService.create(shiftData(title))
  const preparing = await shiftService.update(created.id, { status: 'preparing', version: created.version })
  assert.ok(preparing)
  const live = await shiftService.update(created.id, { status: 'live', version: preparing.version })
  assert.ok(live)
  return live
}

// Returns the ORIGINAL v1 snapshot while the store row advances to live,
// so the snapshot is stale for bulk writes.
async function makeStaleCopy(title: string): Promise<Shift> {
  const created = await shiftService.create(shiftData(title))
  const preparing = await shiftService.update(created.id, { status: 'preparing', version: created.version })
  assert.ok(preparing)
  const live = await shiftService.update(created.id, { status: 'live', version: preparing.version })
  assert.ok(live)
  assert.notEqual(live.version, created.version)
  return created
}

test('GL-19D bulk issues exactly one versioned update per selected row', async () => {
  await withMockEnvironment(async () => {
    const first = await shiftService.create(shiftData('CallCount A'))
    const second = await shiftService.create(shiftData('CallCount B'))
    const secondPreparing = await shiftService.update(second.id, { status: 'preparing', version: second.version })
    assert.ok(secondPreparing)
    const third = await shiftService.create(shiftData('CallCount C'))
    const thirdPreparing = await shiftService.update(third.id, { status: 'preparing', version: third.version })
    assert.ok(thirdPreparing)
    const thirdBack = await shiftService.update(third.id, { status: 'scheduled', version: thirdPreparing.version })
    assert.ok(thirdBack)
    const rows = [first, secondPreparing, thirdBack]
    assert.notEqual(rows[0].version, rows[1].version)
    assert.notEqual(rows[1].version, rows[2].version)
    assert.notEqual(rows[0].version, rows[2].version)
    await withUpdateSpy(async calls => {
      const result = await shiftService.bulkUpdateStatus(rows, 'cancelled')
      assert.equal(result.succeeded, 3)
      assert.equal(result.failed, 0)
      assert.equal(calls.length, rows.length)
      const seen = new Map(calls.map(call => [call.id, call.patch]))
      assert.equal(seen.size, rows.length)
      for (const row of rows) {
        const patch = seen.get(row.id)
        assert.ok(patch, `expected an update attempt for row ${row.id}`)
        assert.equal(patch.status, 'cancelled')
        assert.equal(patch.version, row.version)
      }
    })
  })
})

test('GL-19D bulk never mutates caller-owned shift objects', async () => {
  await withMockEnvironment(async () => {
    const inputs = [
      { ...(await shiftService.create(shiftData('Frozen A'))) },
      { ...(await shiftService.create(shiftData('Frozen B'))) },
    ]
    deepFreeze(inputs)
    const before = JSON.stringify(inputs)
    const result = await shiftService.bulkUpdateStatus(inputs, 'cancelled')
    assert.equal(result.failed, 0)
    assert.equal(JSON.stringify(inputs), before)
    for (const outcome of result.outcomes) {
      assert.ok(!inputs.some(input => (outcome as unknown) === (input as unknown)))
    }
    assert.equal((await shiftService.getById(inputs[0].id))?.status, 'cancelled')
    assert.equal((await shiftService.getById(inputs[1].id))?.status, 'cancelled')
  })
})

test('GL-19D partial failure emits exact feedback, preserves selection, refreshes once', async () => {
  await withMockEnvironment(async () => {
    const good = await makeLive('PartialGood')
    const stale = await makeStaleCopy('PartialStale')
    const versionlessRow = await makeLive('PartialNoVersion')
    const probe = await clickMarkCompleted([good, stale, { ...versionlessRow, version: undefined }])
    assert.equal(probe.toasts.length, 1)
    const [feedback] = probe.toasts
    assert.equal(feedback.variant, 'destructive')
    assert.equal(feedback.title, 'Partial update')
    assert.ok(feedback.description?.includes('Updated 1 of 3 shifts'))
    assert.ok(feedback.description?.includes('2 failed'))
    assert.ok(feedback.description?.includes('(1 version conflict)'))
    assert.ok(feedback.description?.includes(stale.title))
    assert.ok(feedback.description?.includes(versionlessRow.title))
    assert.equal(probe.toasts.filter(toast => toast.variant === 'success').length, 0)
    assert.equal(probe.onDeselectAllCalls, 0)
    assert.equal(probe.onUpdateCalls, 1)
    assert.equal((await shiftService.getById(good.id))?.status, 'completed')
    assert.equal((await shiftService.getById(stale.id))?.status, 'live')
  })
})

test('GL-19D full success clears selection and refreshes once', async () => {
  await withMockEnvironment(async () => {
    const first = await makeLive('Clear A')
    const second = await makeLive('Clear B')
    const probe = await clickMarkCompleted([first, second])
    assert.equal(probe.toasts.length, 1)
    assert.equal(probe.toasts[0].variant, 'success')
    assert.equal(probe.toasts[0].title, 'Success')
    assert.ok(probe.toasts[0].description?.includes('Updated 2 shifts'))
    assert.equal(probe.onDeselectAllCalls, 1)
    assert.equal(probe.onUpdateCalls, 1)
  })
})

test('GL-19D full failure preserves selection, reports Action failed, refreshes once', async () => {
  await withMockEnvironment(async () => {
    const stale = await makeStaleCopy('FullFailStale')
    const versionlessRow = await makeLive('FullFailNoVersion')
    const direct = await shiftService.bulkUpdateStatus([stale, { ...versionlessRow, version: undefined }], 'completed')
    assert.equal(direct.succeeded, 0)
    assert.equal(direct.failed, 2)
    assert.ok(direct.outcomes.every(outcome => !outcome.success && typeof outcome.error_message === 'string'))
    const probe = await clickMarkCompleted([stale, { ...versionlessRow, version: undefined }])
    assert.equal(probe.toasts.length, 1)
    assert.equal(probe.toasts[0].variant, 'destructive')
    assert.equal(probe.toasts[0].title, 'Action failed')
    assert.equal(probe.toasts.filter(toast => toast.variant === 'success').length, 0)
    assert.equal(probe.onDeselectAllCalls, 0)
    assert.equal(probe.onUpdateCalls, 1)
  })
})

test('GL-19D authoritative refresh fires exactly once for every outcome', async () => {
  await withMockEnvironment(async () => {
    const successProbe = await clickMarkCompleted([await makeLive('RefreshOk')])
    assert.equal(successProbe.onUpdateCalls, 1)
    const stale = await makeStaleCopy('RefreshStale')
    const partialProbe = await clickMarkCompleted([await makeLive('RefreshGood'), stale])
    assert.equal(partialProbe.onUpdateCalls, 1)
    const versionlessRow = await makeLive('RefreshNoVersion')
    const failureProbe = await clickMarkCompleted([{ ...versionlessRow, version: undefined }])
    assert.equal(failureProbe.onUpdateCalls, 1)
  })
})
