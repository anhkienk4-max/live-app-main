import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'
import type {
  FinalReportRecap,
  LifecycleMetadata,
  LiveReportImage,
  LiveReportImageCategory,
  NormalizedReportMetrics,
  OcrReviewData,
  Report,
  ReportImage,
  ReportImageCategory,
  ReportRevision,
  ReportStatus,
} from '@/lib/types/database.types'

type ReportRow = Record<string, unknown>
type ReportImageRow = Record<string, unknown>
type LiveReportImageRow = Record<string, unknown>

interface SupabaseErrorShape {
  code?: string
  message?: string
  details?: string
  hint?: string
}

export class ReportRequestError extends Error {
  constructor(
    message: string,
    public readonly code = 'REPORT_REQUEST_FAILED',
  ) {
    super(message)
    this.name = 'ReportRequestError'
  }
}

function requestError(operation: string, error: SupabaseErrorShape): ReportRequestError {
  const message = error.message?.trim() || `Supabase ${operation} failed.`
  return new ReportRequestError(message, error.code || 'REPORT_REQUEST_FAILED')
}

function requiredRow<T>(
  operation: string,
  result: { data: T | null; error: SupabaseErrorShape | null },
): T {
  if (result.error) throw requestError(operation, result.error)
  if (result.data === null) {
    throw new ReportRequestError(
      `Supabase ${operation} returned no persisted row.`,
      'REPORT_WRITE_NOT_APPLIED',
    )
  }
  return result.data
}

function optionalRows<T>(
  operation: string,
  result: { data: T[] | null; error: SupabaseErrorShape | null },
): T[] {
  if (result.error) throw requestError(operation, result.error)
  return result.data ?? []
}

function lifecycle(row: {
  deleted_at?: string | null
  deleted_by?: string | null
  archived_at?: string | null
  archived_by?: string | null
  deletion_reason?: string | null
}): LifecycleMetadata {
  return {
    deleted_at: row.deleted_at ?? undefined,
    deleted_by: row.deleted_by ?? undefined,
    archived_at: row.archived_at ?? undefined,
    archived_by: row.archived_by ?? undefined,
    deletion_reason: row.deletion_reason ?? undefined,
  }
}

function jsonOrNull(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return JSON.parse(value)
  return value
}

function reportFromRow(row: ReportRow): Report {
  return {
    id: row.id as string,
    shift_id: row.shift_id as string,
    revenue: Number(row.revenue ?? 0),
    orders: Number(row.orders ?? 0),
    peak_viewer: Number(row.peak_viewer ?? 0),
    average_viewer: Number(row.average_viewer ?? 0),
    likes: row.likes != null ? Number(row.likes) : undefined,
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    top_products: (row.top_products as string[] | null) ?? undefined,
    insights_good: (row.insights_good as string | null) ?? undefined,
    insights_improvement: (row.insights_improvement as string | null) ?? undefined,
    replay_url: (row.replay_url as string | null) ?? undefined,
    dashboard_url: (row.dashboard_url as string | null) ?? undefined,
    gmv: row.gmv != null ? Number(row.gmv) : undefined,
    viewers: row.viewers != null ? Number(row.viewers) : undefined,
    product_clicks: row.product_clicks != null ? Number(row.product_clicks) : undefined,
    ctr: row.ctr != null ? Number(row.ctr) : undefined,
    cvr: row.cvr != null ? Number(row.cvr) : undefined,
    average_order_value: row.average_order_value != null ? Number(row.average_order_value) : undefined,
    live_duration_minutes: row.live_duration_minutes != null ? Number(row.live_duration_minutes) : undefined,
    dashboard_platform: (row.dashboard_platform as string) as Report['dashboard_platform'],
    normalized_metrics: (jsonOrNull(row.normalized_metrics) as NormalizedReportMetrics) ?? undefined,
    platform_metrics: (jsonOrNull(row.platform_metrics) as NormalizedReportMetrics) ?? undefined,
    raw_ocr_output: (row.raw_ocr_output as string | null) ?? undefined,
    ocr_review: (jsonOrNull(row.ocr_review) as OcrReviewData) ?? undefined,
    status: (row.status as string | undefined) as ReportStatus | undefined,
    submitted_by: (row.submitted_by as string | null) ?? undefined,
    reviewed_by: (row.reviewed_by as string | null) ?? undefined,
    reviewed_at: (row.reviewed_at as string | null) ?? undefined,
    review_notes: (row.review_notes as string | null) ?? undefined,
    metrics_confirmed: row.metrics_confirmed === true,
    confirmed_at: (row.confirmed_at as string | null) ?? undefined,
    confirmed_by: (row.confirmed_by as string | null) ?? undefined,
    version_number: row.version_number != null ? Number(row.version_number) : undefined,
    updated_by: (row.updated_by as string | null) ?? undefined,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    ...lifecycle(row),
  }
}

function reportImageFromRow(row: ReportImageRow): ReportImage {
  return {
    id: row.id as string,
    report_id: row.report_id as string,
    image_url: row.image_url as string,
    storage_path: (row.storage_path as string | null) ?? undefined,
    original_name: (row.original_name as string | null) ?? undefined,
    mime_type: (row.mime_type as string | null) ?? undefined,
    size_bytes: row.size_bytes != null ? Number(row.size_bytes) : undefined,
    image_type: row.image_type as ReportImageCategory,
    uploaded_by: (row.uploaded_by as string | null) ?? undefined,
    created_at: row.created_at as string,
    ...lifecycle(row),
  }
}

function liveReportImageFromRow(row: LiveReportImageRow): LiveReportImage {
  return {
    id: row.id as string,
    report_id: (row.report_id as string | null) ?? undefined,
    category: (row.category ? (row.category as string) : 'other') as LiveReportImageCategory,
    title: (row.title as string | null) ?? undefined,
    description: (row.description as string | null) ?? undefined,
    captured_at: (row.captured_at as string | null) ?? undefined,
    file_url: row.file_url as string,
    thumbnail_url: (row.thumbnail_url as string | null) ?? undefined,
    file_name: row.file_name as string,
    mime_type: row.mime_type as string,
    size_bytes: Number(row.size_bytes ?? 0),
    sort_order: Number(row.sort_order ?? 0),
    is_cover: row.is_cover === true,
    uploaded_by: (row.uploaded_by as string | null) ?? undefined,
    created_at: row.created_at as string,
  }
}

function sortedLiveImages(rows: LiveReportImageRow[]): LiveReportImage[] {
  return rows
    .map(row => liveReportImageFromRow(row))
    .sort((a, b) =>
      Number(b.is_cover) - Number(a.is_cover)
      || a.sort_order - b.sort_order,
    )
}

export interface CreateReportPayload {
  shift_id: string
  revenue?: number
  orders?: number
  peak_viewer?: number
  average_viewer?: number
  likes?: number
  comments?: number
  shares?: number
  top_products?: string[]
  insights_good?: string
  insights_improvement?: string
  final_recap?: FinalReportRecap
  replay_url?: string
  dashboard_url?: string
  gmv?: number
  viewers?: number
  product_clicks?: number
  ctr?: number
  cvr?: number
  average_order_value?: number
  live_duration_minutes?: number
  dashboard_platform?: string
  normalized_metrics?: NormalizedReportMetrics
  platform_metrics?: NormalizedReportMetrics
  raw_ocr_output?: string
  ocr_review?: OcrReviewData
  status?: string
  submitted_by?: string
}

export type ReportPatch = Partial<Omit<Report, 'id' | 'created_at' | 'updated_at' | 'revisions'>>

export interface UploadReportImagePayload {
  report_id: string
  storage_path: string
  image_url: string
  original_name?: string
  mime_type?: string
  size_bytes?: number
  image_type: ReportImageCategory
  uploaded_by: string
}

export interface LiveReportImagePayload {
  report_id: string
  category: LiveReportImageCategory
  title?: string
  description?: string
  captured_at?: string
  file_url: string
  thumbnail_url?: string
  file_name: string
  mime_type: string
  size_bytes: number
  sort_order: number
  is_cover: boolean
}

export interface SupabaseReportRepository {
  getAll(): Promise<Report[]>
  getAllIncludingArchived(): Promise<Report[]>
  getById(id: string): Promise<Report | null>
  getByShift(shiftId: string): Promise<Report | null>
  getConfirmed(): Promise<Report[]>
  getReportRevisions(reportId: string): Promise<ReportRevision[]>

  create(data: CreateReportPayload): Promise<Report>
  update(id: string, patch: ReportPatch, reason: string | null, event: string): Promise<Report | null>
  startReview(id: string): Promise<Report | null>
  rejectReview(id: string, notes: string): Promise<Report | null>
  reopen(id: string, reason: string): Promise<Report | null>
  resetOcr(id: string, reason: string): Promise<Report | null>
  recordOcrRun(id: string, review: OcrReviewData, rerun: boolean): Promise<Report | null>
  removeDraft(id: string, reason: string): Promise<boolean>
  archive(id: string, reason: string): Promise<Report | null>
  restore(id: string, reason: string): Promise<Report | null>

  getReportImages(reportId: string): Promise<ReportImage[]>
  uploadReportImage(data: UploadReportImagePayload): Promise<ReportImage>
  getReportImageById(id: string): Promise<ReportImage | null>
  removeReportImage(id: string): Promise<boolean>

  getLiveReportImages(reportId: string): Promise<LiveReportImage[]>
  getLiveReportImageById(id: string): Promise<LiveReportImage | null>
  upsertLiveReportImage(data: LiveReportImagePayload): Promise<LiveReportImage>
  updateLiveReportImageMetadata(
    id: string,
    patch: Pick<LiveReportImage, 'category' | 'title' | 'description' | 'captured_at'>,
  ): Promise<LiveReportImage>
  setLiveReportImageCover(reportId: string, imageId: string): Promise<void>
  reorderLiveReportImages(reportId: string, orderedIds: readonly string[]): Promise<void>
  removeLiveReportImage(id: string): Promise<boolean>

  uploadBlob(fileUrl: string, storagePath: string, mimeType?: string): Promise<{ storagePath: string; publicUrl: string }>
}

export function createSupabaseReportRepository(client: SupabaseClient): SupabaseReportRepository {
  const bucket = 'report-images'

  const selectReports = () => client.from('reports').select('*')
  const selectReportImages = () => client.from('report_images').select('*')
  const selectLiveReportImages = () => client.from('live_report_images').select('*')

  return {
    async getAll() {
      const result = await selectReports()
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
      return optionalRows('report read', result)
        .map(row => reportFromRow(row as ReportRow))
    },

    async getAllIncludingArchived() {
      const result = await selectReports().order('updated_at', { ascending: false })
      return optionalRows('report archived read', result)
        .map(row => reportFromRow(row as ReportRow))
    },

    async getById(id) {
      const result = await selectReports().eq('id', id).maybeSingle()
      if (result.error) throw requestError('report lookup', result.error)
      return result.data ? reportFromRow(result.data as ReportRow) : null
    },

    async getByShift(shiftId) {
      const result = await selectReports()
        .eq('shift_id', shiftId)
        .is('deleted_at', null)
        .is('archived_at', null)
        .maybeSingle()
      if (result.error) throw requestError('report by shift lookup', result.error)
      return result.data ? reportFromRow(result.data as ReportRow) : null
    },

    async getConfirmed() {
      const result = await selectReports()
        .eq('metrics_confirmed', true)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
      return optionalRows('report confirmed read', result)
        .map(row => reportFromRow(row as ReportRow))
    },

    async getReportRevisions(reportId) {
      const result = await client.rpc('get_report_revisions', { p_report_id: reportId })
      if (result.error) throw requestError('report revision read', result.error)
      return (result.data ?? []).map((row: Record<string, unknown>) => ({
        version: Number(row.version),
        created_at: row.created_at as string,
        created_by: (row.created_by as string | null) ?? undefined,
        status: (row.status as string | null) ?? undefined,
        reason: (row.reason as string | null) ?? undefined,
        event: row.event as ReportRevision['event'],
        metrics: jsonOrNull(row.metrics) as ReportRevision['metrics'],
        ocr_review: (jsonOrNull(row.ocr_review) as OcrReviewData) ?? undefined,
        final_recap: (jsonOrNull(row.final_recap) as FinalReportRecap) ?? undefined,
        image_references: (row.image_references as string[] | null) ?? [],
      }))
    },

    async create(data) {
      const payload: Record<string, unknown> = {
        shift_id: data.shift_id,
        revenue: data.revenue,
        orders: data.orders,
        peak_viewer: data.peak_viewer,
        average_viewer: data.average_viewer,
        likes: data.likes,
        comments: data.comments,
        shares: data.shares,
        top_products: data.top_products,
        insights_good: data.insights_good,
        insights_improvement: data.insights_improvement,
        final_recap: data.final_recap,
        replay_url: data.replay_url,
        dashboard_url: data.dashboard_url,
        gmv: data.gmv,
        viewers: data.viewers,
        product_clicks: data.product_clicks,
        ctr: data.ctr,
        cvr: data.cvr,
        average_order_value: data.average_order_value,
        live_duration_minutes: data.live_duration_minutes,
        dashboard_platform: data.dashboard_platform,
        normalized_metrics: data.normalized_metrics,
        platform_metrics: data.platform_metrics,
        raw_ocr_output: data.raw_ocr_output,
        ocr_review: data.ocr_review,
        status: data.status,
      }
      const filtered = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
      const result = await client.rpc('create_report', { p_data: filtered }).single()
      return reportFromRow(requiredRow('report create', result) as unknown as ReportRow)
    },

    async update(id, patch, reason, event) {
      const result = await client.rpc('update_report', {
        p_report_id: id,
        p_patch: patch as unknown as Record<string, unknown>,
        p_reason: reason ?? null,
        p_event: event,
      }).single()
      if (result.error) throw requestError('report update', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async startReview(id) {
      const result = await client.rpc('start_report_review', {
        p_report_id: id,
      }).single()
      if (result.error) throw requestError('report start review', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async rejectReview(id, notes) {
      const result = await client.rpc('reject_report_review', {
        p_report_id: id,
        p_notes: notes ?? null,
      }).single()
      if (result.error) throw requestError('report reject review', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async reopen(id, reason) {
      const result = await client.rpc('reopen_report', {
        p_report_id: id,
        p_reason: reason ?? null,
      }).single()
      if (result.error) throw requestError('report reopen', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async resetOcr(id, reason) {
      const result = await client.rpc('reset_report_ocr', {
        p_report_id: id,
        p_reason: reason ?? null,
      }).single()
      if (result.error) throw requestError('report reset ocr', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async recordOcrRun(id, review, rerun) {
      const result = await client.rpc('record_report_ocr_run', {
        p_report_id: id,
        p_review: review as unknown as Record<string, unknown>,
        p_rerun: rerun,
      }).single()
      if (result.error) throw requestError('report ocr run', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async removeDraft(id, reason) {
      const result = await client.rpc('soft_delete_report', {
        p_report_id: id,
        p_reason: reason ?? null,
      }).single()
      if (result.error) throw requestError('report soft delete', result.error)
      return result.data !== null
    },

    async archive(id, reason) {
      const result = await client.rpc('archive_report', {
        p_report_id: id,
        p_reason: reason ?? null,
      }).single()
      if (result.error) throw requestError('report archive', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async restore(id, reason) {
      const result = await client.rpc('restore_report', {
        p_report_id: id,
        p_reason: reason ?? null,
      }).single()
      if (result.error) throw requestError('report restore', result.error)
      return result.data ? reportFromRow(result.data as unknown as ReportRow) : null
    },

    async getReportImages(reportId) {
      const result = await selectReportImages()
        .eq('report_id', reportId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      return optionalRows('report image read', result)
        .map(row => reportImageFromRow(row as ReportImageRow))
    },

    async getReportImageById(id) {
      const result = await selectReportImages().eq('id', id).maybeSingle()
      if (result.error) throw requestError('report image lookup', result.error)
      return result.data ? reportImageFromRow(result.data as ReportImageRow) : null
    },

    async uploadReportImage(data) {
      const { storagePath, publicUrl } = await this.uploadBlob(
        data.image_url,
        data.storage_path,
        data.mime_type,
      )
      const result = await client.rpc('upload_report_image', {
        p_report_id: data.report_id,
        p_storage_path: storagePath,
        p_image_url: publicUrl,
        p_original_name: data.original_name ?? null,
        p_mime_type: data.mime_type ?? null,
        p_size_bytes: data.size_bytes ?? 0,
        p_image_type: data.image_type,
      }).single()
      if (result.error) throw requestError('report image upload', result.error)
      return reportImageFromRow(
        (result.data ?? {
          id: '',
          report_id: data.report_id,
          image_url: publicUrl,
          storage_path: storagePath,
          created_at: new Date().toISOString(),
        }) as ReportImageRow,
      )
    },

    async removeReportImage(id) {
      const image = await this.getReportImageById(id)
      if (!image) return false

      if (image.storage_path) {
        const { error } = await client.storage
          .from(bucket)
          .remove([image.storage_path])
        if (error) throw requestError('report image storage delete', error)
      }

      const result = await client.rpc('remove_report_image', {
        p_image_id: id,
      }).single()
      if (result.error) throw requestError('report image remove', result.error)
      return (result.data as unknown as boolean) === true
    },

    async getLiveReportImages(reportId) {
      const result = await selectLiveReportImages()
        .eq('report_id', reportId)
        .order('sort_order', { ascending: true })
      return sortedLiveImages(optionalRows('live report image read', result) as LiveReportImageRow[])
    },

    async getLiveReportImageById(id) {
      const result = await selectLiveReportImages().eq('id', id).maybeSingle()
      if (result.error) throw requestError('live report image lookup', result.error)
      return result.data ? liveReportImageFromRow(result.data as LiveReportImageRow) : null
    },

    async upsertLiveReportImage(data) {
      const { publicUrl } = await this.uploadBlob(
        data.file_url,
        `live/${data.report_id}/${data.file_name}`,
        data.mime_type,
      )
      const payload: Record<string, unknown> = {
        report_id: data.report_id,
        category: data.category,
        title: data.title,
        description: data.description,
        captured_at: data.captured_at,
        file_url: publicUrl,
        thumbnail_url: data.thumbnail_url,
        file_name: data.file_name,
        mime_type: data.mime_type,
        size_bytes: data.size_bytes,
        sort_order: data.sort_order,
        is_cover: data.is_cover,
      }
      const filtered = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
      const result = await client.rpc('upsert_live_report_image', {
        p_data: filtered,
      }).single()
      if (result.error) throw requestError('live report image upsert', result.error)
      return liveReportImageFromRow(result.data as unknown as LiveReportImageRow)
    },

    async updateLiveReportImageMetadata(id, patch) {
      const result = await client.rpc('update_live_report_image_metadata', {
        p_image_id: id,
        p_category: patch.category,
        p_title: patch.title ?? null,
        p_description: patch.description ?? null,
        p_captured_at: patch.captured_at ?? null,
      }).single()
      if (result.error) throw requestError('live report image metadata update', result.error)
      return result.data
        ? liveReportImageFromRow(result.data as LiveReportImageRow)
        : ({ id, ...patch } as unknown as LiveReportImage)
    },

    async setLiveReportImageCover(reportId, imageId) {
      const result = await client.rpc('set_live_report_image_cover', {
        p_report_id: reportId,
        p_image_id: imageId,
      })
      if (result.error) throw requestError('live report image cover', result.error)
    },

    async reorderLiveReportImages(reportId, orderedIds) {
      const result = await client.rpc('reorder_live_report_images', {
        p_report_id: reportId,
        p_ordered_ids: orderedIds as string[],
      })
      if (result.error) throw requestError('live report image reorder', result.error)
    },

    async removeLiveReportImage(id) {
      const result = await selectLiveReportImages().eq('id', id).maybeSingle()
      if (result.error) throw requestError('live report image lookup', result.error)
      const image = result.data as LiveReportImageRow | null
      if (!image) return false

      const storagePath = `live/${image.report_id}/${image.file_name}`
      const { error: storageError } = await client.storage
        .from(bucket)
        .remove([storagePath])
      if (storageError) throw requestError('live report image storage delete', storageError)

      const deleteResult = await client.rpc('remove_live_report_image', {
        p_image_id: id,
      }).single()
      if (deleteResult.error) throw requestError('live report image remove', deleteResult.error)
      return (deleteResult.data as unknown as boolean) === true
    },

    async uploadBlob(fileUrl, storagePath, mimeType) {
      const blob = await fetchBlobFromUrl(fileUrl)
      const { error } = await client.storage
        .from(bucket)
        .upload(storagePath, blob, {
          contentType: mimeType,
          upsert: false,
        })
      if (error) throw requestError('report image storage upload', error)

      const { data: publicUrlData } = client.storage.from(bucket).getPublicUrl(storagePath)
      const publicUrl = publicUrlData?.publicUrl ?? fileUrl
      return { storagePath, publicUrl }
    },
  }
}

async function fetchBlobFromUrl(fileUrl: string): Promise<Blob> {
  if (typeof fetch === 'function') {
    const response = await fetch(fileUrl)
    if (!response.ok) throw new ReportRequestError(`Failed to fetch image from ${fileUrl}`)
    return await response.blob()
  }
  if (typeof window !== 'undefined' && (window as unknown as { fetch?: typeof fetch }).fetch) {
    const response = await (window as unknown as { fetch: typeof fetch }).fetch(fileUrl)
    if (!response.ok) throw new ReportRequestError(`Failed to fetch image from ${fileUrl}`)
    return await response.blob()
  }
  throw new ReportRequestError('No fetch implementation available for image upload.')
}

let browserRepository: SupabaseReportRepository | null = null
let testRepository: SupabaseReportRepository | undefined

export function getSupabaseReportRepository(): SupabaseReportRepository {
  if (testRepository) return testRepository
  if (!browserRepository) browserRepository = createSupabaseReportRepository(createClient())
  return browserRepository
}

export function setSupabaseReportRepositoryForTests(
  repository: SupabaseReportRepository | undefined,
): void {
  testRepository = repository
}
