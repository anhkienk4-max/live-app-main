import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pageArchetypeByRoute,
  pageArchetypeContracts,
  type PageArchetype,
} from '@/lib/ui/archetypes'

test('E2 route catalogue classifies representative operational pages by workflow', () => {
  const expected: Record<string, PageArchetype> = {
    calendar: 'schedule',
    myShifts: 'queue',
    openShifts: 'queue',
    swaps: 'workflow',
    reports: 'workflow',
    brands: 'directory',
    audit: 'trace',
    import: 'utility',
  }
  for (const [route, archetype] of Object.entries(expected)) {
    assert.equal(pageArchetypeByRoute[route as keyof typeof pageArchetypeByRoute], archetype)
  }
})

test('E2 contracts describe structure without replacing role authorization', () => {
  for (const contract of Object.values(pageArchetypeContracts)) {
    assert.ok(contract.purpose.length > 0)
    assert.ok(['moderate', 'focused', 'low', 'dense', 'high'].includes(contract.density))
    assert.ok(['contextual', 'queue', 'review', 'management', 'utility', 'none'].includes(contract.mobileActions))
  }
  assert.equal(pageArchetypeContracts.schedule.mobileActions, 'contextual')
  assert.equal(pageArchetypeContracts.queue.mobileActions, 'queue')
  assert.equal(pageArchetypeContracts.workflow.mobileActions, 'review')
})

test('E2 keeps the page archetype set finite and workflow-oriented', () => {
  assert.deepEqual(Object.keys(pageArchetypeContracts).sort(), [
    'analytics', 'auth', 'command', 'configuration', 'directory', 'queue', 'schedule', 'trace', 'utility', 'workflow',
  ])
})
