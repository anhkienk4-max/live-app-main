'use client'

import * as React from 'react'
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FileText,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  type BrandKnowledgeItem,
  type BrandKnowledgeSource,
  getSourcePriority,
} from '@/lib/utils/brandKnowledgeProvenance'

interface BrandKnowledgeProvenanceCardProps {
  item: BrandKnowledgeItem
  className?: string
  canResolveConflict?: boolean
  onResolve?: (decision: {
    confirmed_content: unknown
    chosen_source: BrandKnowledgeSource
    reason?: string
  }) => void
}

export function BrandKnowledgeProvenanceCard({
  item,
  className = '',
  canResolveConflict = false,
  onResolve,
}: BrandKnowledgeProvenanceCardProps) {
  const isConflict = item.confirmation_status === 'NEEDS_OWNER_CONFIRMATION' || Boolean(item.conflict_details)
  const isApproved = item.status === 'approved' || item.is_approved === true
  const source = item.source_metadata.source

  const handleResolveAction = async (decision: {
    confirmed_content: unknown
    chosen_source: BrandKnowledgeSource
    reason?: string
  }) => {
    if (onResolve) {
      onResolve(decision)
      return
    }
    try {
      const res = await fetch('/api/brand-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'knowledge.confirm_resolution',
          product_id: item.product_id,
          sku_id: item.sku_id ?? null,
          knowledge_type: item.knowledge_type,
          confirmed_content: decision.confirmed_content,
          chosen_source: decision.chosen_source,
          decision_reason: decision.reason,
          approve: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.warn('Confirmation persistence response:', data)
      }
    } catch (err) {
      console.warn('Failed to call knowledge.confirm_resolution API:', err)
    }
  }

  return (
    <div
      data-testid="brand-knowledge-provenance-card"
      className={`rounded-lg border p-3 text-xs transition-colors ${
        isConflict
          ? 'border-amber-300 bg-amber-50/50'
          : isApproved
            ? 'border-emerald-200 bg-emerald-50/30'
            : 'border-slate-200 bg-white'
      } ${className}`}
    >
      {/* Top Header: Knowledge Type, Source Badge, and Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900 uppercase tracking-wider text-[11px]">
            {item.knowledge_type}
          </span>
          <span className="text-[10px] text-slate-500">v{item.version}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Source Badge with Priority */}
          {source === 'notion' && (
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 font-medium text-[10px] flex items-center gap-1"
            >
              <FileText className="h-3 w-3" />
              Notion (Ưu tiên 1 - Chính thức)
            </Badge>
          )}

          {source === 'google_drive' && (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 font-medium text-[10px] flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Google Drive (Ưu tiên 2 - Bổ trợ)
            </Badge>
          )}

          {source === 'app_ops' && (
            <Badge
              variant="outline"
              className="bg-purple-50 text-purple-700 border-purple-200 font-medium text-[10px] flex items-center gap-1"
            >
              <Database className="h-3 w-3" />
              APP OPS (Ưu tiên 2 - Bổ trợ)
            </Badge>
          )}

          {/* Approved Protection Badge */}
          {isApproved && (
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] flex items-center gap-1"
            >
              <ShieldCheck className="h-3 w-3" />
              Đã duyệt (Bảo vệ ghi đè)
            </Badge>
          )}

          {/* Conflict Flag Badge */}
          {isConflict && (
            <Badge
              variant="destructive"
              className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] flex items-center gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              NEEDS_OWNER_CONFIRMATION
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-2 text-slate-700">
        <div className="font-medium text-slate-800">
          {typeof item.content === 'string'
            ? item.content
            : JSON.stringify(item.content, null, 2)}
        </div>
      </div>

      {/* Conflict Resolution Banner (Issue #99 Invariant) */}
      {isConflict && item.conflict_details && (
        <div
          data-testid="conflict-resolution-banner"
          className="mt-3 rounded border border-amber-300 bg-amber-100/70 p-2.5 text-xs text-amber-950 space-y-2"
        >
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
            <span>Mâu thuẫn dữ liệu đa nguồn — Cần xác nhận của Owner</span>
          </div>

          <p className="text-[11px] leading-relaxed text-amber-900">
            {item.conflict_details.reason} Hệ thống{' '}
            <strong>không tự ý chọn thông tin chính thức</strong> và không tự động ghi đè dữ liệu.
            Yêu cầu Owner xác nhận phiên bản chính xác qua API có kiểm tra quyền.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
            {/* Source A */}
            <div className="rounded bg-white/80 p-2 border border-amber-200">
              <div className="font-semibold text-slate-800 text-[10px] uppercase">
                Nguồn A: {item.conflict_details.source_a.source.toUpperCase()} (Ưu tiên{' '}
                {getSourcePriority(item.conflict_details.source_a.source)})
              </div>
              <div className="mt-1 text-slate-700">
                {typeof item.conflict_details.content_a === 'string'
                  ? item.conflict_details.content_a
                  : JSON.stringify(item.conflict_details.content_a)}
              </div>
              {canResolveConflict && (
                <button
                  type="button"
                  onClick={() =>
                    handleResolveAction({
                      confirmed_content: item.conflict_details!.content_a,
                      chosen_source: item.conflict_details!.source_a.source,
                      reason: `Xác nhận giữ theo ${item.conflict_details!.source_a.source}`,
                    })
                  }
                  className="mt-2 text-[10px] font-sans font-medium px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 transition-colors"
                >
                  Chọn nguồn A
                </button>
              )}
            </div>

            {/* Source B */}
            <div className="rounded bg-white/80 p-2 border border-amber-200">
              <div className="font-semibold text-slate-800 text-[10px] uppercase">
                Nguồn B: {item.conflict_details.source_b.source.toUpperCase()} (Ưu tiên{' '}
                {getSourcePriority(item.conflict_details.source_b.source)})
              </div>
              <div className="mt-1 text-slate-700">
                {typeof item.conflict_details.content_b === 'string'
                  ? item.conflict_details.content_b
                  : JSON.stringify(item.conflict_details.content_b)}
              </div>
              {canResolveConflict && (
                <button
                  type="button"
                  onClick={() =>
                    handleResolveAction({
                      confirmed_content: item.conflict_details!.content_b,
                      chosen_source: item.conflict_details!.source_b.source,
                      reason: `Xác nhận theo ${item.conflict_details!.source_b.source}`,
                    })
                  }
                  className="mt-2 text-[10px] font-sans font-medium px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 transition-colors"
                >
                  Chọn nguồn B
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Metadata Footer */}
      <div className="mt-2 pt-1 border-t border-border/30 flex flex-wrap items-center justify-between text-[10px] text-slate-500">
        <div>
          Nguồn:{' '}
          <span className="font-medium text-slate-600">
            {item.source_metadata.source_title || item.source_metadata.source_id}
          </span>
        </div>
        <div>
          Lấy dữ liệu:{' '}
          <span>
            {new Date(item.source_metadata.retrieved_at).toLocaleDateString('vi-VN')}
          </span>
        </div>
      </div>
    </div>
  )
}
