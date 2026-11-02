import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { sanitizeFileName } from '@/lib/files/fileValidation'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { authorizationErrorResponse, isAuthorizationError, requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { fileStorageService, createFileStorageService } from '@/lib/services/fileStorageService'
import { createClient } from '@/lib/supabase/server'

type StorageGateway = Pick<ReturnType<typeof createFileStorageService>, 'getMetadata' | 'read'>

function errorResponse(code: string, status: number) {
  return Response.json({ ok: false, error: { code } }, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function createDashboardScreenshotRouteHandler(deps: {
  resolveUser?: ServerUserResolver
  createUserClient?: () => Promise<SupabaseClient>
  createAdminClient?: () => SupabaseClient
  storage?: StorageGateway
} = {}) {
  const userClientFactory = deps.createUserClient ?? createClient
  const adminClientFactory = deps.createAdminClient ?? createSupabaseAdminClient
  const storage = deps.storage ?? fileStorageService

  return {
    async GET(request: Request) {
      try {
        await requireUser(request, deps.resolveUser)
        const params = new URL(request.url).searchParams
        const fileId = z.string().trim().min(1).max(120).safeParse(params.get('file_id'))
        if (!params.has('file_id')) {
          const legacyPath = z.string().max(256).regex(/^dashboard\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?:\.(?:png|jpg|jpeg|webp))?$/u)
            .safeParse(params.get('storage_path'))
          if (!legacyPath.success) return errorResponse('DASHBOARD_SCREENSHOT_REQUEST_INVALID', 400)
          const userClient = await userClientFactory()
          const linked = await userClient.from('dashboard_updates').select('id')
            .eq('screenshot_storage_path', legacyPath.data).is('deleted_at', null).limit(1).maybeSingle()
          if (linked.error || !linked.data) return errorResponse('DASHBOARD_SCREENSHOT_NOT_FOUND', 404)
          const stored = await userClient.storage.from('live-dashboard-images').download(legacyPath.data)
          if (stored.error || !stored.data || stored.data.size > 10 * 1024 * 1024) {
            return errorResponse('DASHBOARD_SCREENSHOT_READ_FAILED', stored.data?.size ? 413 : 502)
          }
          const extensionMime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
          const mimeType = stored.data.type || extensionMime[legacyPath.data.split('.').at(-1)?.toLowerCase() ?? '']
          if (!mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
            return errorResponse('DASHBOARD_SCREENSHOT_REFERENCE_INVALID', 409)
          }
          return new Response(stored.data, {
            headers: {
              'Cache-Control': 'private, no-store',
              'Content-Type': mimeType,
              'Content-Disposition': `inline; filename="${sanitizeFileName(legacyPath.data.split('/').at(-1) || 'snapshot')}"`,
              'X-Content-Type-Options': 'nosniff',
            },
          })
        }
        if (!fileId.success) return errorResponse('DASHBOARD_SCREENSHOT_REQUEST_INVALID', 400)

        const userClient = await userClientFactory()
        const fileResult = await adminClientFactory().from('operational_files')
          .select('id,shift_id,category,provider,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256,deleted_at')
          .eq('id', fileId.data).is('deleted_at', null).maybeSingle()
        if (fileResult.error) return errorResponse('DASHBOARD_SCREENSHOT_READ_FAILED', 502)
        const row = fileResult.data as Record<string, unknown> | null
        if (!row || row.category !== 'live_snapshot' || typeof row.shift_id !== 'string') {
          return errorResponse('DASHBOARD_SCREENSHOT_NOT_FOUND', 404)
        }

        const linked = await userClient.from('dashboard_updates').select('id')
          .eq('shift_id', row.shift_id).eq('screenshot_file_id', fileId.data)
          .is('deleted_at', null).limit(1).maybeSingle()
        if (linked.error || !linked.data) return errorResponse('DASHBOARD_SCREENSHOT_NOT_FOUND', 404)

        if (row.provider !== 'google_drive' || typeof row.external_file_id !== 'string'
          || typeof row.external_parent_id !== 'string'
          || typeof row.checksum_sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.checksum_sha256)
          || !['image/png', 'image/jpeg', 'image/webp'].includes(String(row.mime_type))) {
          return errorResponse('DASHBOARD_SCREENSHOT_REFERENCE_INVALID', 409)
        }

        const reference = { provider: 'google_drive' as const, external_file_id: row.external_file_id }
        const metadata = await storage.getMetadata(reference)
        if (metadata.kind !== 'file' || !metadata.parent_ids?.includes(row.external_parent_id)) {
          return errorResponse('DASHBOARD_SCREENSHOT_REFERENCE_STALE', 409)
        }
        const bytes = await storage.read(reference)
        if (bytes.byteLength !== Number(row.size_bytes)
          || createHash('sha256').update(bytes).digest('hex') !== row.checksum_sha256) {
          return errorResponse('DASHBOARD_SCREENSHOT_READBACK_MISMATCH', 502)
        }

        return new Response(bytes as BodyInit, {
          headers: {
            'Cache-Control': 'private, no-store',
            'Content-Type': String(row.mime_type),
            'Content-Disposition': `inline; filename="${sanitizeFileName(row.file_name)}"`,
            'X-Content-Type-Options': 'nosniff',
          },
        })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return errorResponse('DASHBOARD_SCREENSHOT_READ_FAILED', 502)
      }
    },
  }
}
