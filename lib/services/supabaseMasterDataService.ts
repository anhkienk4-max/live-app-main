import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthIdentity } from '@/lib/auth/authIdentity'
import { createClient } from '@/lib/supabase/client'
import type {
  Brand,
  Campaign,
  OperationalRole,
  Platform,
  User,
} from '@/lib/types/database.types'

const businessUserColumns = [
  'id',
  'email',
  'full_name',
  'avatar_url',
  'avatar_storage_path',
  'phone',
  'role',
  'system_permission',
  'operational_roles',
  'department',
  'status',
  'account_status',
  'email_verified',
  'auth_provider',
  'join_date',
  'created_at',
  'updated_at',
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

const brandColumns = [
  'id',
  'name',
  'logo_url',
  'color',
  'description',
  'category',
  'status',
  'contact_person',
  'contact_email',
  'contact_phone',
  'brand_guideline',
  'tone_of_voice',
  'key_products',
  'mandatory_claims',
  'restricted_claims',
  'dos',
  'donts',
  'asset_links',
  'notes',
  'updated_by',
  'created_at',
  'updated_at',
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

const platformColumns = [
  'id',
  'name',
  'icon',
  'logo_url',
  'platform_type',
  'platform_url',
  'status',
  'account_information',
  'policy_notes',
  'livestream_rules',
  'content_restrictions',
  'technical_requirements',
  'report_requirements',
  'external_links',
  'updated_by',
  'created_at',
  'updated_at',
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

const campaignColumns = [
  'id',
  'name',
  'brand_id',
  'start_date',
  'end_date',
  'type',
  'notes',
  'campaign_url',
  'website_url',
  'website_title',
  'website_preview_image',
  'website_embed_enabled',
  'platform_source',
  'platform_ids',
  'status',
  'owner_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'deleted_by',
  'archived_at',
  'archived_by',
  'deletion_reason',
].join(',')

type Nullable<T> = { [Key in keyof T]: T[Key] | null }
type BusinessUserRow = Nullable<User> & {
  id: string
  email: string
  full_name: string
  role: User['role']
  system_permission: NonNullable<User['system_permission']>
  operational_roles: OperationalRole[]
  status: User['status']
  account_status: NonNullable<User['account_status']>
  email_verified: boolean
  join_date: string
  created_at: string
  updated_at: string
}
type BrandRow = Nullable<Brand> & Pick<Brand, 'id' | 'name' | 'created_at' | 'updated_at'>
type PlatformRow = Nullable<Platform> & Pick<Platform, 'id' | 'name' | 'created_at' | 'updated_at'>
type CampaignRow = Nullable<Campaign> & Pick<Campaign, 'id' | 'name' | 'brand_id' | 'start_date' | 'end_date' | 'created_at' | 'updated_at'>

interface SupabaseErrorShape {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export class MasterDataRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'MASTER_DATA_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'MasterDataRequestError'
  }
}

function requestError(operation: string, error: SupabaseErrorShape): MasterDataRequestError {
  const message = error.message?.trim() || `Supabase ${operation} failed.`
  return new MasterDataRequestError(message, error.code || 'MASTER_DATA_REQUEST_FAILED')
}

function requiredData<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T {
  if (result.error) throw requestError(operation, result.error)
  if (result.data === null) {
    throw new MasterDataRequestError(
      `Supabase ${operation} returned no persisted row.`,
      'MASTER_DATA_WRITE_NOT_APPLIED',
    )
  }
  return result.data
}

function optionalData<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T | null {
  if (result.error) throw requestError(operation, result.error)
  return result.data
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  )
}

function businessUserCreatePayload(
  data: Omit<User, 'id' | 'created_at' | 'updated_at'>,
): Record<string, unknown> {
  return compactRecord({
    email: data.email,
    full_name: data.full_name,
    avatar_url: data.avatar_url,
    avatar_storage_path: data.avatar_storage_path,
    phone: data.phone,
    system_permission: data.system_permission,
    operational_roles: data.operational_roles,
    department: data.department,
    status: data.status,
    account_status: data.account_status,
    email_verified: data.email_verified,
    auth_provider: data.auth_provider,
    join_date: data.join_date,
  })
}

function businessUserUpdatePayload(data: Partial<User>): Record<string, unknown> {
  return compactRecord({
    email: data.email,
    full_name: data.full_name,
    avatar_url: data.avatar_url,
    avatar_storage_path: data.avatar_storage_path,
    phone: data.phone,
    system_permission: data.system_permission,
    operational_roles: data.operational_roles,
    department: data.department,
    status: data.status,
  })
}

function lifecycle(row: {
  deleted_at?: string | null
  deleted_by?: string | null
  archived_at?: string | null
  archived_by?: string | null
  deletion_reason?: string | null
}) {
  return {
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: row.deleted_by ?? undefined,
    archived_at: row.archived_at ?? undefined,
    archived_by: row.archived_by ?? undefined,
    deletion_reason: row.deletion_reason ?? undefined,
  }
}

function userFromRow(row: BusinessUserRow): User {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    avatar_url: row.avatar_url ?? undefined,
    avatar_storage_path: row.avatar_storage_path ?? undefined,
    phone: row.phone ?? undefined,
    role: row.role,
    system_permission: row.system_permission,
    operational_roles: [...row.operational_roles],
    department: row.department ?? undefined,
    status: row.status,
    account_status: row.account_status,
    email_verified: row.email_verified,
    auth_provider: row.auth_provider ?? undefined,
    join_date: row.join_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...lifecycle(row),
  }
}

function brandFromRow(row: BrandRow): Brand {
  return {
    id: row.id,
    name: row.name,
    logo_url: row.logo_url ?? undefined,
    color: row.color ?? undefined,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    status: row.status ?? undefined,
    contact_person: row.contact_person ?? undefined,
    contact_email: row.contact_email ?? undefined,
    contact_phone: row.contact_phone ?? undefined,
    brand_guideline: row.brand_guideline ?? undefined,
    tone_of_voice: row.tone_of_voice ?? undefined,
    key_products: row.key_products ?? undefined,
    mandatory_claims: row.mandatory_claims ?? undefined,
    restricted_claims: row.restricted_claims ?? undefined,
    dos: row.dos ?? undefined,
    donts: row.donts ?? undefined,
    asset_links: row.asset_links ?? undefined,
    notes: row.notes ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...lifecycle(row),
  }
}

function platformFromRow(row: PlatformRow): Platform {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? undefined,
    logo_url: row.logo_url ?? undefined,
    platform_type: row.platform_type ?? undefined,
    platform_url: row.platform_url ?? undefined,
    status: row.status ?? undefined,
    account_information: row.account_information ?? undefined,
    policy_notes: row.policy_notes ?? undefined,
    livestream_rules: row.livestream_rules ?? undefined,
    content_restrictions: row.content_restrictions ?? undefined,
    technical_requirements: row.technical_requirements ?? undefined,
    report_requirements: row.report_requirements ?? undefined,
    external_links: row.external_links ?? undefined,
    updated_by: row.updated_by ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...lifecycle(row),
  }
}

function campaignFromRow(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    brand_id: row.brand_id,
    start_date: row.start_date,
    end_date: row.end_date,
    type: row.type ?? undefined,
    notes: row.notes ?? undefined,
    campaign_url: row.campaign_url ?? undefined,
    website_url: row.website_url,
    website_title: row.website_title,
    website_preview_image: row.website_preview_image,
    website_embed_enabled: row.website_embed_enabled ?? false,
    platform_source: row.platform_source ?? undefined,
    platform_ids: row.platform_ids ?? undefined,
    status: row.status ?? undefined,
    owner_id: row.owner_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...lifecycle(row),
  }
}

function brandPayload(data: Partial<Brand>): Record<string, unknown> {
  return compactRecord({
    name: data.name,
    logo_url: data.logo_url,
    color: data.color,
    description: data.description,
    category: data.category,
    status: data.status,
    contact_person: data.contact_person,
    contact_email: data.contact_email,
    contact_phone: data.contact_phone,
    brand_guideline: data.brand_guideline,
    tone_of_voice: data.tone_of_voice,
    key_products: data.key_products,
    mandatory_claims: data.mandatory_claims,
    restricted_claims: data.restricted_claims,
    dos: data.dos,
    donts: data.donts,
    asset_links: data.asset_links,
    notes: data.notes,
  })
}

function platformPayload(data: Partial<Platform>): Record<string, unknown> {
  return compactRecord({
    name: data.name,
    icon: data.icon,
    logo_url: data.logo_url,
    platform_type: data.platform_type,
    platform_url: data.platform_url,
    status: data.status,
    account_information: data.account_information,
    policy_notes: data.policy_notes,
    livestream_rules: data.livestream_rules,
    content_restrictions: data.content_restrictions,
    technical_requirements: data.technical_requirements,
    report_requirements: data.report_requirements,
    external_links: data.external_links,
  })
}

function campaignPayload(data: Partial<Campaign>): Record<string, unknown> {
  return compactRecord({
    name: data.name,
    brand_id: data.brand_id,
    start_date: data.start_date,
    end_date: data.end_date,
    type: data.type,
    notes: data.notes,
    campaign_url: data.campaign_url,
    website_url: data.website_url,
    website_title: data.website_title,
    website_preview_image: data.website_preview_image,
    website_embed_enabled: data.website_embed_enabled,
    platform_source: data.platform_source,
    platform_ids: data.platform_ids,
    status: data.status,
    owner_id: data.owner_id,
  })
}

export interface SupabaseMasterDataRepository {
  businessUsers: {
    getAll(includeDeleted?: boolean): Promise<User[]>
    getById(id: string): Promise<User | null>
    getByAuthIdentity(identity: AuthIdentity): Promise<User | null>
    create(data: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User>
    update(id: string, data: Partial<User>): Promise<User | null>
    approvePendingAccount(id: string): Promise<User | null>
    rejectPendingAccount(id: string): Promise<User | null>
    archive(id: string, reason: string): Promise<User | null>
    restore(id: string, reason: string): Promise<User | null>
  }
  brands: {
    getAll(includeArchived?: boolean): Promise<Brand[]>
    getById(id: string): Promise<Brand | null>
    create(id: string, data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>, actorId: string): Promise<Brand>
    update(id: string, data: Partial<Brand>, actorId: string): Promise<Brand | null>
    archive(id: string, actorId: string, reason: string): Promise<Brand | null>
    restore(id: string, actorId: string): Promise<Brand | null>
  }
  platforms: {
    getAll(includeArchived?: boolean): Promise<Platform[]>
    getById(id: string): Promise<Platform | null>
    create(id: string, data: Omit<Platform, 'id' | 'created_at' | 'updated_at'>, actorId: string): Promise<Platform>
    update(id: string, data: Partial<Platform>, actorId: string): Promise<Platform | null>
    archive(id: string, actorId: string, reason: string): Promise<Platform | null>
    restore(id: string, actorId: string): Promise<Platform | null>
  }
  campaigns: {
    getAll(includeArchived?: boolean): Promise<Campaign[]>
    getById(id: string): Promise<Campaign | null>
    getByBrand(brandId: string): Promise<Campaign[]>
    create(id: string, data: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign>
    update(id: string, data: Partial<Campaign>): Promise<Campaign | null>
    removeWebsitePreview(id: string): Promise<Campaign | null>
    archive(id: string, actorId: string, reason: string): Promise<Campaign | null>
    restore(id: string): Promise<Campaign | null>
  }
}

export function createSupabaseMasterDataRepository(
  client: SupabaseClient,
): SupabaseMasterDataRepository {
  const activeRows = <T extends { is(column: string, value: null): T }>(query: T) =>
    query.is('deleted_at', null).is('archived_at', null)

  const updateOne = async <TRow>(
    table: 'brands' | 'platforms' | 'campaigns',
    id: string,
    payload: Record<string, unknown>,
    columns: string,
    map: (row: TRow) => Brand | Platform | Campaign,
  ) => {
    const existing = await client.from(table).select('id').eq('id', id).maybeSingle()
    if (existing.error) throw requestError(`${table} lookup`, existing.error)
    if (!existing.data) return null

    const result = await client.from(table)
      .update(payload)
      .eq('id', id)
      .select(columns)
      .maybeSingle()
    const row = requiredData(`${table} update`, result)
    return map(row as TRow)
  }

  return {
    businessUsers: {
      async getAll(includeDeleted = false) {
        let query = client.from('business_users')
          .select(businessUserColumns)
          .order('full_name', { ascending: true })
        if (!includeDeleted) query = query.is('deleted_at', null).is('archived_at', null)
        const result = await query
        return requiredData('business user directory read', result)
          .map(row => userFromRow(row as unknown as BusinessUserRow))
      },
      async getById(id) {
        const result = await client.from('business_users')
          .select(businessUserColumns)
          .eq('id', id)
          .maybeSingle()
        const row = optionalData('business user lookup', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async getByAuthIdentity(identity) {
        const result = await client.from('business_users')
          .select(businessUserColumns)
          .eq('id', identity.business_user_id)
          .eq('auth_user_id', identity.auth_user_id)
          .eq('status', 'active')
          .eq('account_status', 'active')
          .is('archived_at', null)
          .is('deleted_at', null)
          .maybeSingle()
        const row = optionalData('authenticated business user lookup', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async create(data) {
        const result = await client
          .rpc('create_staff_member', { p_data: businessUserCreatePayload(data) })
          .single()
        return userFromRow(requiredData('staff create', result) as unknown as BusinessUserRow)
      },
      async update(id, data) {
        const result = await client
          .rpc('update_staff_member', { p_user_id: id, p_data: businessUserUpdatePayload(data) })
          .maybeSingle()
        const row = optionalData('staff update', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async approvePendingAccount(id) {
        const result = await client.rpc('approve_staff_account', { p_user_id: id }).maybeSingle()
        const row = optionalData('staff account approval', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async rejectPendingAccount(id) {
        const result = await client.rpc('reject_staff_account', { p_user_id: id }).maybeSingle()
        const row = optionalData('staff account rejection', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async archive(id, reason) {
        const result = await client.rpc('archive_staff_member', {
          p_user_id: id,
          p_reason: reason,
        }).maybeSingle()
        const row = optionalData('staff archive', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
      async restore(id, reason) {
        const result = await client.rpc('restore_staff_member', {
          p_user_id: id,
          p_reason: reason,
        }).maybeSingle()
        const row = optionalData('staff restore', result)
        return row ? userFromRow(row as unknown as BusinessUserRow) : null
      },
    },
    brands: {
      async getAll(includeArchived = false) {
        let query = client.from('brands').select(brandColumns).order('name', { ascending: true })
        if (!includeArchived) query = activeRows(query)
        const result = await query
        return requiredData('brand read', result).map(row => brandFromRow(row as unknown as BrandRow))
      },
      async getById(id) {
        const result = await client.from('brands').select(brandColumns).eq('id', id).maybeSingle()
        const row = optionalData('brand lookup', result)
        return row ? brandFromRow(row as unknown as BrandRow) : null
      },
      async create(id, data, actorId) {
        const result = await client.from('brands')
          .insert({ id, ...brandPayload(data), updated_by: actorId })
          .select(brandColumns)
          .single()
        return brandFromRow(requiredData('brand create', result) as unknown as BrandRow)
      },
      async update(id, data, actorId) {
        return updateOne<BrandRow>('brands', id, {
          ...brandPayload(data),
          updated_by: actorId,
        }, brandColumns, brandFromRow) as Promise<Brand | null>
      },
      async archive(id, actorId, reason) {
        return updateOne<BrandRow>('brands', id, {
          status: 'inactive',
          archived_at: new Date().toISOString(),
          archived_by: actorId,
          deletion_reason: reason,
          updated_by: actorId,
        }, brandColumns, brandFromRow) as Promise<Brand | null>
      },
      async restore(id, actorId) {
        return updateOne<BrandRow>('brands', id, {
          status: 'active',
          archived_at: null,
          archived_by: null,
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null,
          updated_by: actorId,
        }, brandColumns, brandFromRow) as Promise<Brand | null>
      },
    },
    platforms: {
      async getAll(includeArchived = false) {
        let query = client.from('platforms').select(platformColumns).order('name', { ascending: true })
        if (!includeArchived) query = activeRows(query)
        const result = await query
        return requiredData('platform read', result).map(row => platformFromRow(row as unknown as PlatformRow))
      },
      async getById(id) {
        const result = await client.from('platforms').select(platformColumns).eq('id', id).maybeSingle()
        const row = optionalData('platform lookup', result)
        return row ? platformFromRow(row as unknown as PlatformRow) : null
      },
      async create(id, data, actorId) {
        const result = await client.from('platforms')
          .insert({ id, ...platformPayload(data), updated_by: actorId })
          .select(platformColumns)
          .single()
        return platformFromRow(requiredData('platform create', result) as unknown as PlatformRow)
      },
      async update(id, data, actorId) {
        return updateOne<PlatformRow>('platforms', id, {
          ...platformPayload(data),
          updated_by: actorId,
        }, platformColumns, platformFromRow) as Promise<Platform | null>
      },
      async archive(id, actorId, reason) {
        return updateOne<PlatformRow>('platforms', id, {
          status: 'inactive',
          archived_at: new Date().toISOString(),
          archived_by: actorId,
          deletion_reason: reason,
          updated_by: actorId,
        }, platformColumns, platformFromRow) as Promise<Platform | null>
      },
      async restore(id, actorId) {
        return updateOne<PlatformRow>('platforms', id, {
          status: 'active',
          archived_at: null,
          archived_by: null,
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null,
          updated_by: actorId,
        }, platformColumns, platformFromRow) as Promise<Platform | null>
      },
    },
    campaigns: {
      async getAll(includeArchived = false) {
        let query = client.from('campaigns')
          .select(campaignColumns)
          .order('start_date', { ascending: false })
        if (!includeArchived) query = activeRows(query)
        const result = await query
        return requiredData('campaign read', result).map(row => campaignFromRow(row as unknown as CampaignRow))
      },
      async getById(id) {
        const result = await client.from('campaigns').select(campaignColumns).eq('id', id).maybeSingle()
        const row = optionalData('campaign lookup', result)
        return row ? campaignFromRow(row as unknown as CampaignRow) : null
      },
      async getByBrand(brandId) {
        const result = await activeRows(client.from('campaigns')
          .select(campaignColumns)
          .eq('brand_id', brandId))
          .order('start_date', { ascending: false })
        return requiredData('campaign brand read', result)
          .map(row => campaignFromRow(row as unknown as CampaignRow))
      },
      async create(id, data) {
        const result = await client.from('campaigns')
          .insert({ id, ...campaignPayload(data) })
          .select(campaignColumns)
          .single()
        return campaignFromRow(requiredData('campaign create', result) as unknown as CampaignRow)
      },
      async update(id, data) {
        return updateOne<CampaignRow>(
          'campaigns', id, campaignPayload(data), campaignColumns, campaignFromRow,
        ) as Promise<Campaign | null>
      },
      async removeWebsitePreview(id) {
        return updateOne<CampaignRow>('campaigns', id, {
          website_url: null,
          campaign_url: null,
          website_preview_image: null,
          website_embed_enabled: false,
        }, campaignColumns, campaignFromRow) as Promise<Campaign | null>
      },
      async archive(id, actorId, reason) {
        return updateOne<CampaignRow>('campaigns', id, {
          status: 'cancelled',
          archived_at: new Date().toISOString(),
          archived_by: actorId,
          deletion_reason: reason,
        }, campaignColumns, campaignFromRow) as Promise<Campaign | null>
      },
      async restore(id) {
        return updateOne<CampaignRow>('campaigns', id, {
          status: 'draft',
          archived_at: null,
          archived_by: null,
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null,
        }, campaignColumns, campaignFromRow) as Promise<Campaign | null>
      },
    },
  }
}

let browserRepository: SupabaseMasterDataRepository | null = null
let testRepository: SupabaseMasterDataRepository | undefined

export function getSupabaseMasterDataRepository(): SupabaseMasterDataRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseMasterDataRepository(createClient())
  return browserRepository
}

export function setSupabaseMasterDataRepositoryForTests(
  repository: SupabaseMasterDataRepository | undefined,
): void {
  testRepository = repository
}
