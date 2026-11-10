/**
 * Brand Knowledge Base Provenance, Source Priority & Conflict Resolution
 * 
 * Issue #99 Specification:
 * - Priority #1: Notion (Primary Source)
 * - Supplementary Sources: Google Drive & APP OPS (Priority #2)
 * - Conflict Rule: If two sources conflict, mark `NEEDS_OWNER_CONFIRMATION`.
 *   DO NOT automatically select "official" info, and DO NOT auto-overwrite approved data.
 * - Architecture Rule: Do not automatically sync or mutate real Notion data; do not build a secondary database.
 */

export type BrandKnowledgeSource = 'notion' | 'google_drive' | 'app_ops'

export type ConfirmationStatus = 'confirmed' | 'NEEDS_OWNER_CONFIRMATION' | 'not_required'

export interface BrandKnowledgeSourceMetadata {
  source: BrandKnowledgeSource
  source_id: string
  source_title?: string
  source_url?: string
  retrieved_at: string
  last_modified_at?: string
  synced_by?: string
  checksum?: string
}

export interface BrandKnowledgeConflict {
  conflict_id: string
  entity_id: string // product_id or sku_id
  knowledge_type: string
  source_a: BrandKnowledgeSourceMetadata
  content_a: unknown
  source_b: BrandKnowledgeSourceMetadata
  content_b: unknown
  reason: string
  detected_at: string
  status: 'NEEDS_OWNER_CONFIRMATION'
  resolution_required: true
}

export interface BrandKnowledgeItem {
  id: string
  product_id: string
  sku_id?: string | null
  brand_id?: string
  knowledge_type: string
  content: unknown
  version: number
  status: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'retired'
  confirmation_status: ConfirmationStatus
  source_metadata: BrandKnowledgeSourceMetadata
  conflict_details?: BrandKnowledgeConflict | null
  is_approved?: boolean
  owner_id?: string
  created_at: string
  updated_at?: string
}

export interface IngestBrandKnowledgeInput {
  id?: string
  product_id: string
  sku_id?: string | null
  brand_id?: string
  knowledge_type: string
  content: unknown
  source_metadata: BrandKnowledgeSourceMetadata
  owner_id?: string
  status?: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'retired'
}

export interface IngestResult {
  action: 'created' | 'updated' | 'conflict_flagged' | 'rejected_overwrite_approved' | 'skipped_identical'
  item: BrandKnowledgeItem
  conflict?: BrandKnowledgeConflict
  message: string
}

/**
 * Source Priority definition
 * Notion is #1 (Primary).
 * Google Drive and APP OPS are #2 (Supplementary).
 */
export const BRAND_SOURCE_PRIORITY: Record<BrandKnowledgeSource, number> = {
  notion: 1,
  google_drive: 2,
  app_ops: 2,
}

/**
 * Return priority number (lower number = higher priority)
 */
export function getSourcePriority(source: BrandKnowledgeSource): number {
  return BRAND_SOURCE_PRIORITY[source] ?? 99
}

/**
 * Compute deterministic content checksum for conflict/change tracking
 */
export function computeContentChecksum(content: unknown): string {
  if (content === null || content === undefined) return 'null'
  if (typeof content === 'string') {
    return `str_${hashString(content.trim().toLowerCase())}`
  }
  try {
    const canonicalJson = JSON.stringify(content, Object.keys(content as object).sort())
    return `json_${hashString(canonicalJson)}`
  } catch {
    return `raw_${hashString(String(content))}`
  }
}

function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

/**
 * Compare two content objects for semantic equivalence
 */
export function areContentsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return false

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim()
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, idx) => areContentsEqual(item, b[idx]))
  }

  if (typeof a === 'object' && typeof b === 'object') {
    return computeContentChecksum(a) === computeContentChecksum(b)
  }

  return false
}

/**
 * Detect conflict between an existing brand knowledge record and incoming data.
 * 
 * Rules:
 * 1. If both are from the same source: not a cross-source conflict (standard version update).
 * 2. If from different sources, but contents are identical: no conflict.
 * 3. If from different sources and contents differ: CONFLICT!
 *    Mark `NEEDS_OWNER_CONFIRMATION`. Never auto-select Notion as official during conflict.
 */
export function detectBrandKnowledgeConflict(
  existing: BrandKnowledgeItem,
  incoming: {
    product_id: string
    sku_id?: string | null
    knowledge_type: string
    content: unknown
    source_metadata: BrandKnowledgeSourceMetadata
  },
): BrandKnowledgeConflict | null {
  // Same source -> internal version progression, not an inter-source divergence
  if (existing.source_metadata.source === incoming.source_metadata.source) {
    return null
  }

  // If semantic contents are equivalent, no conflict
  if (areContentsEqual(existing.content, incoming.content)) {
    return null
  }

  // Cross-source divergence detected!
  const conflictId = `conflict-${existing.id}-${Date.now().toString(36)}`
  const sourceAName = existing.source_metadata.source.toUpperCase()
  const sourceBName = incoming.source_metadata.source.toUpperCase()

  return {
    conflict_id: conflictId,
    entity_id: existing.sku_id || existing.product_id,
    knowledge_type: existing.knowledge_type,
    source_a: existing.source_metadata,
    content_a: existing.content,
    source_b: incoming.source_metadata,
    content_b: incoming.content,
    reason: `Mâu thuẫn dữ liệu giữa ${sourceAName} (Độ ưu tiên ${getSourcePriority(existing.source_metadata.source)}) và ${sourceBName} (Độ ưu tiên ${getSourcePriority(incoming.source_metadata.source)}).`,
    detected_at: new Date().toISOString(),
    status: 'NEEDS_OWNER_CONFIRMATION',
    resolution_required: true,
  }
}

/**
 * Ingest Brand Knowledge with strict provenance, conflict detection, and approved data protection.
 * 
 * Invariants:
 * - Approved data (`is_approved = true` or `status = 'approved'`) MUST NEVER be automatically overwritten.
 * - Divergent sources MUST trigger `NEEDS_OWNER_CONFIRMATION`.
 * - Notion is Priority #1, but does NOT override approved data or bypass Owner confirmation on conflict.
 */
export function ingestBrandKnowledgeWithProvenance(
  existingItems: BrandKnowledgeItem[],
  input: IngestBrandKnowledgeInput,
): IngestResult {
  assertNoExternalNotionMutation('ingestBrandKnowledge')

  const existingIndex = existingItems.findIndex(
    item =>
      item.product_id === input.product_id &&
      (item.sku_id ?? null) === (input.sku_id ?? null) &&
      item.knowledge_type === input.knowledge_type,
  )

  const checksum = computeContentChecksum(input.content)
  const metadataWithChecksum: BrandKnowledgeSourceMetadata = {
    ...input.source_metadata,
    checksum,
    retrieved_at: input.source_metadata.retrieved_at || new Date().toISOString(),
  }

  // 1. New knowledge record
  if (existingIndex === -1) {
    const newItem: BrandKnowledgeItem = {
      id: input.id || `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      product_id: input.product_id,
      sku_id: input.sku_id ?? null,
      brand_id: input.brand_id,
      knowledge_type: input.knowledge_type,
      content: input.content,
      version: 1,
      status: input.status || 'draft',
      confirmation_status: 'confirmed',
      source_metadata: metadataWithChecksum,
      is_approved: input.status === 'approved',
      owner_id: input.owner_id || 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    return {
      action: 'created',
      item: newItem,
      message: `Khởi tạo kiến thức mới từ nguồn ${input.source_metadata.source.toUpperCase()}.`,
    }
  }

  const existing = existingItems[existingIndex]

  // 2. Identical content check
  if (areContentsEqual(existing.content, input.content)) {
    return {
      action: 'skipped_identical',
      item: existing,
      message: 'Dữ liệu trùng khớp hoàn toàn với bản ghi hiện có, không có thay đổi.',
    }
  }

  // 3. Approved data protection guard (STRICT RULE)
  const isExistingApproved = existing.status === 'approved' || existing.is_approved === true
  if (isExistingApproved) {
    // Cannot auto-overwrite approved data even with Priority 1 Notion
    const conflict = detectBrandKnowledgeConflict(existing, {
      product_id: input.product_id,
      sku_id: input.sku_id,
      knowledge_type: input.knowledge_type,
      content: input.content,
      source_metadata: metadataWithChecksum,
    })

    const flaggedItem: BrandKnowledgeItem = {
      ...existing,
      confirmation_status: 'NEEDS_OWNER_CONFIRMATION',
      conflict_details: conflict || {
        conflict_id: `conflict-approved-${existing.id}`,
        entity_id: existing.sku_id || existing.product_id,
        knowledge_type: existing.knowledge_type,
        source_a: existing.source_metadata,
        content_a: existing.content,
        source_b: metadataWithChecksum,
        content_b: input.content,
        reason: 'Không cho phép tự động ghi đè dữ liệu đã phê duyệt (Approved). Cần Owner xác nhận phê duyệt phiên bản mới.',
        detected_at: new Date().toISOString(),
        status: 'NEEDS_OWNER_CONFIRMATION',
        resolution_required: true,
      },
      updated_at: new Date().toISOString(),
    }

    return {
      action: 'rejected_overwrite_approved',
      item: flaggedItem,
      conflict: flaggedItem.conflict_details ?? undefined,
      message: 'Từ chối tự động ghi đè dữ liệu đã được phê duyệt (Approved). Đã đánh dấu NEEDS_OWNER_CONFIRMATION.',
    }
  }

  // 4. Cross-source conflict detection
  const conflict = detectBrandKnowledgeConflict(existing, {
    product_id: input.product_id,
    sku_id: input.sku_id,
    knowledge_type: input.knowledge_type,
    content: input.content,
    source_metadata: metadataWithChecksum,
  })

  if (conflict) {
    const conflictedItem: BrandKnowledgeItem = {
      ...existing,
      confirmation_status: 'NEEDS_OWNER_CONFIRMATION',
      conflict_details: conflict,
      updated_at: new Date().toISOString(),
    }

    return {
      action: 'conflict_flagged',
      item: conflictedItem,
      conflict,
      message: 'Phát hiện mâu thuẫn giữa các nguồn kiến thức. Đã đánh dấu NEEDS_OWNER_CONFIRMATION. Không tự động chọn nguồn chính thức.',
    }
  }

  // 5. Normal update from same source (version bump)
  const updatedItem: BrandKnowledgeItem = {
    ...existing,
    content: input.content,
    version: existing.version + 1,
    source_metadata: metadataWithChecksum,
    status: input.status || 'draft',
    confirmation_status: 'confirmed',
    conflict_details: null,
    is_approved: false,
    updated_at: new Date().toISOString(),
  }

  return {
    action: 'updated',
    item: updatedItem,
    message: `Cập nhật phiên bản v${updatedItem.version} từ nguồn ${input.source_metadata.source.toUpperCase()}.`,
  }
}

/**
 * Owner resolution for flagged conflicts.
 * Only explicit Owner intervention can clear NEEDS_OWNER_CONFIRMATION.
 */
export function resolveOwnerConfirmation(
  item: BrandKnowledgeItem,
  decision: {
    confirmed_content: unknown
    chosen_source: BrandKnowledgeSource
    confirmed_by: string
    approve?: boolean
    reason?: string
  },
): BrandKnowledgeItem {
  if (item.confirmation_status !== 'NEEDS_OWNER_CONFIRMATION' && !item.conflict_details) {
    return item
  }

  const checksum = computeContentChecksum(decision.confirmed_content)
  const updatedMetadata: BrandKnowledgeSourceMetadata = {
    source: decision.chosen_source,
    source_id: item.conflict_details?.source_b.source_id || item.source_metadata.source_id,
    source_title: item.conflict_details?.source_b.source_title || item.source_metadata.source_title,
    retrieved_at: new Date().toISOString(),
    synced_by: decision.confirmed_by,
    checksum,
  }

  return {
    ...item,
    content: decision.confirmed_content,
    version: item.version + 1,
    source_metadata: updatedMetadata,
    confirmation_status: 'confirmed',
    conflict_details: null,
    status: decision.approve ? 'approved' : 'draft',
    is_approved: Boolean(decision.approve),
    updated_at: new Date().toISOString(),
  }
}

/**
 * Architectural Safeguard:
 * Prohibits any write / mutate operations against real Notion servers.
 * Prevents creation of secondary databases.
 */
export function assertNoExternalNotionMutation(operationName: string): void {
  // Strict guard: APP OPS never issues POST/PATCH/DELETE to real Notion databases
  if (process.env.NOTION_WRITE_ENABLED === 'true') {
    throw new Error(`VIOLATION: Direct external Notion mutation is strictly forbidden by Issue #99 architectural guard in ${operationName}.`)
  }
}
