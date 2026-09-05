import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { AuthIdentityProvider } from '../lib/auth/AuthIdentityProvider.tsx'
import { createAuthIdentity, mapAuthIdentityToBusinessUser } from '../lib/auth/authIdentity.ts'
import { useCurrentUser } from '../lib/hooks/useCurrentUser.ts'
import { currentUserService, userService } from '../lib/services/dataService.ts'
import type { SupabaseMasterDataRepository } from '../lib/services/supabaseMasterDataService.ts'
import { setSupabaseMasterDataRepositoryForTests } from '../lib/services/supabaseMasterDataService.ts'
import type { Shift, User } from '../lib/types/database.types.ts'
import { resolveRegistrationCta } from '../lib/utils/shiftRegistration.ts'

const formSourceUrl = new URL('../components/features/staff/StaffFormDialog.tsx', import.meta.url)

const admin: User = {
  id: 'admin-1',
  auth_user_id: 'auth-admin-1',
  email: 'admin@example.test',
  full_name: 'Admin',
  phone: '+84000000000',
  department: 'Operations',
  role: 'admin',
  system_permission: 'admin',
  operational_roles: ['host'],
  status: 'active',
  account_status: 'active',
  email_verified: true,
  auth_provider: 'email',
  join_date: '2026-09-05',
  created_at: '2026-09-05T00:00:00.000Z',
  updated_at: '2026-09-05T00:00:00.000Z',
}

function setSupabaseMode() {
  process.env.NODE_ENV = 'production'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
}

function setUpdateRepository(update: SupabaseMasterDataRepository['businessUsers']['update']) {
  setSupabaseMasterDataRepositoryForTests({
    businessUsers: { update },
  } as unknown as SupabaseMasterDataRepository)
}

function restoreEnvironment(nodeEnv: string | undefined, mockFlag: string | undefined) {
  setSupabaseMasterDataRepositoryForTests(undefined)
  currentUserService.clearAuthenticatedUser()
  if (nodeEnv === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = nodeEnv
  if (mockFlag === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
  else process.env.NEXT_PUBLIC_USE_MOCK_DATA = mockFlag
}

test('Admin self update returns the persisted user and requested operational roles', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  let requested: Partial<User> | undefined
  try {
    setSupabaseMode()
    setUpdateRepository(async (id, data) => {
      requested = data
      return id === admin.id ? { ...admin, ...data } : null
    })

    const updated = await userService.update(admin.id, {
      full_name: 'Updated Admin',
      phone: '+84111111111',
      department: 'Live Operations',
      avatar_url: 'https://example.test/admin.png',
      operational_roles: ['host', 'technical'],
    })

    assert.deepEqual(requested, {
      full_name: 'Updated Admin',
      phone: '+84111111111',
      department: 'Live Operations',
      avatar_url: 'https://example.test/admin.png',
      operational_roles: ['host', 'technical'],
    })
    assert.deepEqual(updated?.operational_roles, ['host', 'technical'])
  } finally {
    restoreEnvironment(previousNodeEnv, previousMockFlag)
  }
})

test('null or thrown update results cannot enter the success path', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    setSupabaseMode()
    setUpdateRepository(async () => null)
    assert.equal(await userService.update(admin.id, { operational_roles: ['support'] }), null)

    setUpdateRepository(async () => { throw new Error('RPC failed') })
    await assert.rejects(
      userService.update(admin.id, { operational_roles: ['support'] }),
      /RPC failed/,
    )

    const source = await readFile(formSourceUrl, 'utf8')
    const updateStart = source.indexOf('const updated = await userService.update')
    const catchStart = source.indexOf('} catch (error)')
    const updateBlock = source.slice(updateStart, catchStart)
    assert.match(updateBlock, /if \(!updated\) throw new Error\('Update denied or returned no data'\)/)
    assert.equal((updateBlock.match(/description: t\('staffUpdated'\)/g) || []).length, 1)
    assert.ok(updateBlock.indexOf("if (!updated)") < updateBlock.indexOf("description: t('staffUpdated')"))
    assert.doesNotMatch(source.slice(catchStart), /description: t\('staffUpdated'\)/)
    assert.doesNotMatch(source.slice(catchStart), /router\.refresh\(\)/)
  } finally {
    restoreEnvironment(previousNodeEnv, previousMockFlag)
  }
})

test('Admin self payload is allowlisted and refreshes current user exactly once on success', async () => {
  const source = await readFile(formSourceUrl, 'utf8')
  const selfPayload = source.match(/userService\.update\(staff\.id, isSelf \? \{([\s\S]*?)\} : payload\)/)?.[1]
  assert.ok(selfPayload)
  for (const field of ['full_name', 'phone', 'department', 'avatar_url', 'operational_roles']) {
    assert.match(selfPayload, new RegExp(`\\b${field}:`))
  }
  for (const field of ['email', 'system_permission', 'permission', 'status', 'auth_user_id', 'account_status', 'role']) {
    assert.doesNotMatch(selfPayload, new RegExp(`\\b${field}:`))
  }

  const successBlock = source.slice(source.indexOf("description: t('staffUpdated')"), source.indexOf('} else {', source.indexOf("description: t('staffUpdated')")))
  assert.equal((successBlock.match(/reloadCurrentUser\(\)/g) || []).length, 1)
  assert.equal((successBlock.match(/router\.refresh\(\)/g) || []).length, 1)
  assert.ok(successBlock.indexOf('reloadCurrentUser()') < successBlock.indexOf('router.refresh()'))
})

test('authoritative replacement reaches the current-user consumer with updated roles', () => {
  const identity = createAuthIdentity({
    id: 'auth-admin-1',
    email: admin.email,
    app_metadata: { system_permission: 'admin', business_user_id: admin.id },
    user_metadata: { full_name: admin.full_name },
  })
  assert.ok(identity)
  const replacement = mapAuthIdentityToBusinessUser(identity, [{ ...admin, operational_roles: ['support', 'technical'] }])
  assert.ok(replacement)

  function Probe() {
    const { currentUser } = useCurrentUser()
    return createElement('output', { 'data-operational-roles': currentUser?.operational_roles?.join(',') })
  }

  const markup = renderToStaticMarkup(createElement(
    AuthIdentityProvider,
    { mode: 'supabase', identity, businessUser: replacement },
    createElement(Probe),
  ))
  assert.match(markup, /data-operational-roles="support,technical"/)
})

test('calendar eligibility consumes refreshed operational roles', () => {
  const shift: Shift = {
    id: 'shift-1',
    date: '2026-09-06',
    start_time: '10:00',
    end_time: '11:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    status: 'scheduled',
    registration_locked: false,
    allow_multi_role: true,
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    created_at: '2026-09-05T00:00:00.000Z',
    updated_at: '2026-09-05T00:00:00.000Z',
  }
  const states = resolveRegistrationCta({
    shift,
    user: { ...admin, operational_roles: ['host', 'technical'] },
    registrations: [],
    now: new Date('2026-09-05T00:00:00.000Z'),
  })
  assert.deepEqual(states.map(item => [item.role, item.state]), [
    ['host', 'eligible'],
    ['support', 'not_eligible'],
    ['technical', 'eligible'],
  ])
})
