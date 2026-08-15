import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  brandService,
  campaignService,
  currentUserService,
  platformService,
  userService,
} from '../lib/services/dataService.ts'
import {
  createSupabaseMasterDataRepository,
  MasterDataRequestError,
  setSupabaseMasterDataRepositoryForTests,
} from '../lib/services/supabaseMasterDataService.ts'
type Row = Record<string, unknown>
type TableName = 'business_users' | 'brands' | 'platforms' | 'campaigns'

interface FakeDatabase {
  business_users: Row[]
  brands: Row[]
  platforms: Row[]
  campaigns: Row[]
}

interface FakeClientOptions {
  deniedTable?: TableName
}

class FakeQuery {
  private action: 'select' | 'insert' | 'update' = 'select'
  private payload: Row | null = null
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: { column: string; ascending: boolean } | null = null

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: TableName,
    private readonly options: FakeClientOptions,
  ) {}

  select(_columns?: string) {
    return this
  }

  insert(payload: Row) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value)
    return this
  }

  is(column: string, value: null) {
    this.filters.push(row => (row[column] ?? null) === value)
    return this
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false }
    return this
  }

  single() {
    return this.execute(true)
  }

  maybeSingle() {
    return this.execute(true)
  }

  then<TResult1 = { data: Row[] | null; error: Row | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: Row | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute(false).then(onfulfilled, onrejected)
  }

  private async execute(single: boolean) {
    if (this.options.deniedTable === this.table) {
      return {
        data: null,
        error: { code: '42501', message: `permission denied for table ${this.table}` },
      }
    }

    const rows = this.database[this.table]
    if (this.action === 'insert') {
      const now = '2026-08-14T12:00:00.000Z'
      const inserted = {
        created_at: now,
        updated_at: now,
        ...this.payload,
      }
      rows.push(inserted)
      return { data: single ? { ...inserted } : [{ ...inserted }], error: null }
    }

    const matching = rows.filter(row => this.filters.every(filter => filter(row)))
    if (this.action === 'update') {
      matching.forEach(row => Object.assign(row, this.payload, {
        updated_at: '2026-08-14T12:01:00.000Z',
      }))
    }

    const ordered = matching.map(row => ({ ...row }))
    if (this.orderBy) {
      const { column, ascending } = this.orderBy
      ordered.sort((left, right) => String(left[column] ?? '').localeCompare(String(right[column] ?? '')) * (ascending ? 1 : -1))
    }
    return { data: single ? ordered[0] ?? null : ordered, error: null }
  }
}

function fakeClient(database: FakeDatabase, options: FakeClientOptions = {}) {
  return {
    from(table: TableName) {
      return new FakeQuery(database, table, options)
    },
  } as unknown as SupabaseClient
}

function businessUser(overrides: Partial<Row> = {}): Row {
  return {
    id: '1',
    auth_user_id: '10000000-0000-4000-8000-000000000001',
    email: 'admin@livestream.com',
    full_name: 'Remote Admin',
    avatar_url: null,
    avatar_storage_path: null,
    phone: null,
    role: 'admin',
    system_permission: 'admin',
    operational_roles: [],
    department: 'Operations',
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: null,
    deleted_by: null,
    archived_at: null,
    archived_by: null,
    deletion_reason: null,
    ...overrides,
  }
}

function database(): FakeDatabase {
  return {
    business_users: [businessUser()],
    brands: [{
      id: 'remote-brand',
      name: 'Remote Brand',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      archived_at: null,
    }],
    platforms: [{
      id: 'remote-platform',
      name: 'Remote Platform',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      archived_at: null,
    }],
    campaigns: [{
      id: 'remote-campaign',
      name: 'Remote Campaign',
      brand_id: 'remote-brand',
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      deleted_at: null,
      archived_at: null,
    }],
  }
}

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
    setSupabaseMasterDataRepositoryForTests(undefined)
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('mock mode keeps the existing in-memory master-data arrays', async () => {
  await withEnvironment(async () => {
    setAuthMode('mock')
    setSupabaseMasterDataRepositoryForTests(
      createSupabaseMasterDataRepository(fakeClient(database(), { deniedTable: 'brands' })),
    )

    const loadedBrands = await brandService.getAll()
    const loadedUsers = await userService.getAll()
    assert.ok(loadedBrands.some(brand => brand.id === 'b1'))
    assert.ok(loadedUsers.some(user => user.id === '1'))
    assert.equal(loadedBrands.some(brand => brand.id === 'remote-brand'), false)
  })
})

test('Supabase mode routes directory and master-data reads without mock fallback', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const remoteDatabase = database()
    const repository = createSupabaseMasterDataRepository(fakeClient(remoteDatabase))
    setSupabaseMasterDataRepositoryForTests(repository)

    assert.deepEqual((await userService.getAll()).map(user => user.id), ['1'])
    assert.deepEqual((await brandService.getAll()).map(brand => brand.id), ['remote-brand'])
    assert.deepEqual((await platformService.getAll()).map(platform => platform.id), ['remote-platform'])
    assert.deepEqual((await campaignService.getAll()).map(campaign => campaign.id), ['remote-campaign'])
    assert.equal((await brandService.getById('b1')), null)
    await assert.rejects(
      userService.create({
        email: 'blocked@example.test',
        full_name: 'Blocked User',
        role: 'staff',
        system_permission: 'member',
        operational_roles: [],
        status: 'active',
        account_status: 'active',
        email_verified: true,
        auth_provider: 'email',
        join_date: '2026-08-14',
      }),
      /read-only cutover/,
    )
  })
})

test('Admin create, update, archive and restore persist through the Supabase repository', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const remoteDatabase = database()
    const repository = createSupabaseMasterDataRepository(fakeClient(remoteDatabase))
    setSupabaseMasterDataRepositoryForTests(repository)
    const admin = (await repository.businessUsers.getById('1'))!
    currentUserService.bindAuthenticatedUser(admin)

    const brand = await brandService.create({ name: 'Persisted Brand', status: 'active' })
    assert.ok(remoteDatabase.brands.some(row => row.id === brand.id))
    assert.equal((await brandService.update(brand.id, { notes: 'persisted' }, '1'))?.notes, 'persisted')
    assert.ok((await brandService.archive(brand.id, '1', 'test'))?.archived_at)
    assert.equal((await brandService.restore(brand.id, '1', 'test'))?.archived_at, undefined)

    const platform = await platformService.create({ name: 'Persisted Platform', status: 'active' })
    assert.equal((await platformService.update(platform.id, { policy_notes: 'persisted' }, '1'))?.policy_notes, 'persisted')
    assert.ok((await platformService.archive(platform.id, '1', 'test'))?.archived_at)
    assert.equal((await platformService.restore(platform.id, '1', 'test'))?.archived_at, undefined)

    const campaign = await campaignService.create({
      name: 'Persisted Campaign',
      brand_id: brand.id,
      start_date: '2026-08-01',
      end_date: '2026-08-31',
      status: 'draft',
    })
    assert.equal((await campaignService.update(campaign.id, { notes: 'persisted' }, '1'))?.notes, 'persisted')
    assert.ok((await campaignService.archive(campaign.id, '1', 'test'))?.archived_at)
    assert.equal((await campaignService.restore(campaign.id, '1', 'test'))?.archived_at, undefined)
  })
})

test('permission and RLS failures surface and never fall back to mock rows', async () => {
  await withEnvironment(async () => {
    setAuthMode('supabase')
    const remoteDatabase = database()
    const deniedRepository = createSupabaseMasterDataRepository(
      fakeClient(remoteDatabase, { deniedTable: 'brands' }),
    )
    setSupabaseMasterDataRepositoryForTests(deniedRepository)

    await assert.rejects(
      brandService.getAll(),
      (error: unknown) => error instanceof MasterDataRequestError
        && error.code === '42501'
        && /permission denied/.test(error.message),
    )

    const member = (await createSupabaseMasterDataRepository(fakeClient({
      ...remoteDatabase,
      business_users: [businessUser({
        id: '3',
        auth_user_id: '10000000-0000-4000-8000-000000000003',
        email: 'member@example.test',
        full_name: 'Remote Member',
        role: 'staff',
        system_permission: 'member',
      })],
    })).businessUsers.getById('3'))!
    currentUserService.bindAuthenticatedUser(member)
    await assert.rejects(
      brandService.create({ name: 'Forbidden Brand' }),
      /Only Admin/,
    )
    assert.equal(remoteDatabase.brands.some(row => row.name === 'Forbidden Brand'), false)
  })
})
