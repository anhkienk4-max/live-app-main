import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BRAND_SOURCE_PRIORITY,
  getSourcePriority,
  computeContentChecksum,
  areContentsEqual,
  detectBrandKnowledgeConflict,
  ingestBrandKnowledgeWithProvenance,
  resolveOwnerConfirmation,
  assertNoExternalNotionMutation,
  type BrandKnowledgeItem,
  type BrandKnowledgeSourceMetadata,
} from '../lib/utils/brandKnowledgeProvenance.ts'

test('Issue #99: Source Priority hierarchy conforms to specification', () => {
  // Notion is Priority 1 (Primary)
  assert.equal(getSourcePriority('notion'), 1)
  assert.equal(BRAND_SOURCE_PRIORITY.notion, 1)

  // Google Drive is Priority 2 (Supplementary)
  assert.equal(getSourcePriority('google_drive'), 2)
  assert.equal(BRAND_SOURCE_PRIORITY.google_drive, 2)

  // APP OPS is Priority 2 (Supplementary)
  assert.equal(getSourcePriority('app_ops'), 2)
  assert.equal(BRAND_SOURCE_PRIORITY.app_ops, 2)

  // Notion strictly has higher priority than supplementary sources
  assert.ok(getSourcePriority('notion') < getSourcePriority('google_drive'))
  assert.ok(getSourcePriority('notion') < getSourcePriority('app_ops'))
})

test('Issue #99: Checksum and semantic content equality handling', () => {
  const contentA = 'Chiết xuất 100% thảo mộc hữu cơ'
  const contentB = 'Chiết xuất 100% thảo mộc hữu cơ   ' // trailing space
  const contentC = 'Chứa thành phần hóa học bổ sung'

  assert.equal(areContentsEqual(contentA, contentB), true, 'Trims whitespace before comparing')
  assert.equal(areContentsEqual(contentA, contentC), false, 'Different text must not be equal')

  const jsonA = { claim: 'An toàn cho mẹ bầu', cert: 'FDA' }
  const jsonB = { cert: 'FDA', claim: 'An toàn cho mẹ bầu' } // reversed keys
  assert.equal(areContentsEqual(jsonA, jsonB), true, 'Deep structural equivalence ignores key ordering')

  const checksumA = computeContentChecksum(contentA)
  const checksumC = computeContentChecksum(contentC)
  assert.notEqual(checksumA, checksumC)
})

test('Issue #99: Ingesting new knowledge item from Notion creates confirmed item with metadata', () => {
  const existing: BrandKnowledgeItem[] = []
  const metadata: BrandKnowledgeSourceMetadata = {
    source: 'notion',
    source_id: 'page_notion_brand_01_collagen',
    source_title: 'Notion Brand Guideline - Collagen Pura',
    source_url: 'https://notion.so/brand01/collagen',
    retrieved_at: '2026-11-10T10:00:00Z',
  }

  const result = ingestBrandKnowledgeWithProvenance(existing, {
    product_id: 'prod-01',
    knowledge_type: 'claim',
    content: 'Tăng cường đàn hồi da sau 28 ngày sử dụng',
    source_metadata: metadata,
    status: 'draft',
  })

  assert.equal(result.action, 'created')
  assert.equal(result.item.product_id, 'prod-01')
  assert.equal(result.item.source_metadata.source, 'notion')
  assert.equal(result.item.confirmation_status, 'confirmed')
  assert.equal(result.item.version, 1)
  assert.ok(result.item.source_metadata.checksum)
})

test('Issue #99: Identical content from supplementary source does not trigger conflict', () => {
  const notionItem: BrandKnowledgeItem = {
    id: 'k-01',
    product_id: 'prod-01',
    sku_id: null,
    knowledge_type: 'claim',
    content: 'Bổ sung 5000mg Collagen peptide mỗi ngày',
    version: 1,
    status: 'pending_review',
    confirmation_status: 'confirmed',
    source_metadata: {
      source: 'notion',
      source_id: 'notion-01',
      retrieved_at: '2026-11-10T08:00:00Z',
    },
    created_at: '2026-11-10T08:00:00Z',
  }

  // Incoming from Google Drive with identical claim text
  const result = ingestBrandKnowledgeWithProvenance([notionItem], {
    product_id: 'prod-01',
    knowledge_type: 'claim',
    content: 'Bổ sung 5000mg Collagen peptide mỗi ngày ',
    source_metadata: {
      source: 'google_drive',
      source_id: 'gdrive-file-99',
      retrieved_at: '2026-11-10T09:00:00Z',
    },
  })

  assert.equal(result.action, 'skipped_identical')
  assert.equal(result.item.confirmation_status, 'confirmed')
  assert.equal(result.conflict, undefined)
})

test('Issue #99: Conflicting content across sources triggers NEEDS_OWNER_CONFIRMATION without auto-deciding', () => {
  const driveItem: BrandKnowledgeItem = {
    id: 'k-02',
    product_id: 'prod-02',
    sku_id: null,
    knowledge_type: 'restriction',
    content: 'Không sử dụng cho phụ nữ có thai dưới 3 tháng',
    version: 1,
    status: 'draft',
    confirmation_status: 'confirmed',
    source_metadata: {
      source: 'google_drive',
      source_id: 'gdrive-doc-44',
      retrieved_at: '2026-11-10T07:00:00Z',
    },
    created_at: '2026-11-10T07:00:00Z',
  }

  // Incoming from Notion with differing content
  const result = ingestBrandKnowledgeWithProvenance([driveItem], {
    product_id: 'prod-02',
    knowledge_type: 'restriction',
    content: 'Chỉ định an toàn cho mọi đối tượng phụ nữ mang thai',
    source_metadata: {
      source: 'notion',
      source_id: 'notion-page-77',
      retrieved_at: '2026-11-10T10:00:00Z',
    },
  })

  // RULE CHECK: Even though Notion is Priority #1, system CANNOT silently choose Notion as official!
  assert.equal(result.action, 'conflict_flagged')
  assert.equal(result.item.confirmation_status, 'NEEDS_OWNER_CONFIRMATION')
  assert.ok(result.conflict, 'Conflict payload must be generated')
  assert.equal(result.conflict?.status, 'NEEDS_OWNER_CONFIRMATION')
  assert.equal(result.conflict?.resolution_required, true)
  assert.equal(result.conflict?.source_a.source, 'google_drive')
  assert.equal(result.conflict?.source_b.source, 'notion')
  assert.match(result.conflict!.reason, /Mâu thuẫn dữ liệu giữa GOOGLE_DRIVE.*và NOTION/i)
})

test('Issue #99: Approved data CANNOT be overwritten automatically even by Priority 1 source', () => {
  const approvedItem: BrandKnowledgeItem = {
    id: 'k-03-approved',
    product_id: 'prod-03',
    sku_id: null,
    knowledge_type: 'ingredient',
    content: '100% Niacinamide tinh khiết 10% và Kẽm 1%',
    version: 2,
    status: 'approved',
    is_approved: true,
    confirmation_status: 'confirmed',
    source_metadata: {
      source: 'app_ops',
      source_id: 'app-ops-record-12',
      retrieved_at: '2026-11-01T00:00:00Z',
    },
    created_at: '2026-11-01T00:00:00Z',
  }

  // Incoming differing content from Notion
  const result = ingestBrandKnowledgeWithProvenance([approvedItem], {
    product_id: 'prod-03',
    knowledge_type: 'ingredient',
    content: 'Niacinamide 15% nồng độ cao',
    source_metadata: {
      source: 'notion',
      source_id: 'notion-page-88',
      retrieved_at: '2026-11-10T11:00:00Z',
    },
  })

  // STRICT RULE: Approved data must be preserved. Overwrite rejected, flagged for Owner confirmation.
  assert.equal(result.action, 'rejected_overwrite_approved')
  assert.equal(result.item.content, '100% Niacinamide tinh khiết 10% và Kẽm 1%', 'Original content remains intact')
  assert.equal(result.item.confirmation_status, 'NEEDS_OWNER_CONFIRMATION')
  assert.ok(result.conflict)
  assert.match(result.message, /Từ chối tự động ghi đè dữ liệu đã được phê duyệt/i)
})

test('Issue #99: Owner explicit resolution clears NEEDS_OWNER_CONFIRMATION and updates version', () => {
  const conflictedItem: BrandKnowledgeItem = {
    id: 'k-conflicted',
    product_id: 'prod-04',
    sku_id: null,
    knowledge_type: 'claim',
    content: 'Content from Drive',
    version: 1,
    status: 'draft',
    confirmation_status: 'NEEDS_OWNER_CONFIRMATION',
    source_metadata: {
      source: 'google_drive',
      source_id: 'drive-1',
      retrieved_at: '2026-11-10T00:00:00Z',
    },
    conflict_details: {
      conflict_id: 'conf-1',
      entity_id: 'prod-04',
      knowledge_type: 'claim',
      source_a: { source: 'google_drive', source_id: 'drive-1', retrieved_at: '2026-11-10T00:00:00Z' },
      content_a: 'Content from Drive',
      source_b: { source: 'notion', source_id: 'notion-1', retrieved_at: '2026-11-10T01:00:00Z' },
      content_b: 'Content from Notion Official',
      reason: 'Conflict between Drive and Notion',
      detected_at: '2026-11-10T01:05:00Z',
      status: 'NEEDS_OWNER_CONFIRMATION',
      resolution_required: true,
    },
    created_at: '2026-11-10T00:00:00Z',
  }

  const resolved = resolveOwnerConfirmation(conflictedItem, {
    confirmed_content: 'Content from Notion Official (Verified by Brand Manager)',
    chosen_source: 'notion',
    confirmed_by: 'owner-user-01',
    approve: true,
    reason: 'Owner validated with Brand representative directly',
  })

  assert.equal(resolved.confirmation_status, 'confirmed')
  assert.equal(resolved.conflict_details, null)
  assert.equal(resolved.version, 2)
  assert.equal(resolved.status, 'approved')
  assert.equal(resolved.is_approved, true)
  assert.equal(resolved.source_metadata.source, 'notion')
  assert.equal(resolved.content, 'Content from Notion Official (Verified by Brand Manager)')
})

test('Issue #99: Architectural safeguard prevents direct mutation of external Notion', () => {
  assert.doesNotThrow(() => assertNoExternalNotionMutation('read_sync'))

  process.env.NOTION_WRITE_ENABLED = 'true'
  try {
    assert.throws(
      () => assertNoExternalNotionMutation('mutate_notion_api'),
      /Direct external Notion mutation is strictly forbidden/i,
    )
  } finally {
    delete process.env.NOTION_WRITE_ENABLED
  }
})
