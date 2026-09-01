import 'server-only'

import type { FileProvider, FileProviderMetadata, FileUploadInput, FileUploadResult } from '@/lib/files/fileProvider'
import { OneDriveError, type OneDriveAuthClient, type OneDriveEnvironment, type OneDriveFetch, createOneDriveAuthClient } from '@/lib/server/oneDriveAuth'
import { normalizeOneDriveItemId } from '@/lib/server/oneDriveDestination'

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

type GraphItem = {
  id?: unknown
  name?: unknown
  size?: unknown
  webUrl?: unknown
  file?: { mimeType?: unknown } | null
  folder?: Record<string, unknown> | null
  parentReference?: { id?: unknown } | null
  '@microsoft.graph.downloadUrl'?: unknown
}

export type OneDriveGraphRequest = {
  accessToken: string
  method?: 'GET'
}

export type OneDriveGraphClient = {
  request(path: string, options: OneDriveGraphRequest): Promise<import('@/lib/server/oneDriveAuth').OneDriveHttpResponse>
}

type OneDriveOptions = {
  env?: OneDriveEnvironment
  auth?: OneDriveAuthClient
  graph?: OneDriveGraphClient
  fetchImpl?: OneDriveFetch
}

function statusOf(response: { status: number }): number {
  return response.status
}

function retryAfter(response: { headers?: { get(name: string): string | null } }): number | undefined {
  const value = response.headers?.get('retry-after')
  const parsed = value ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function responseError(response: { status: number; headers?: { get(name: string): string | null } }, kind: 'item' | 'folder'): OneDriveError {
  const status = statusOf(response)
  if (status === 401) return new OneDriveError('ONEDRIVE_REAUTH_REQUIRED')
  if (status === 403) return new OneDriveError('ONEDRIVE_PERMISSION_DENIED')
  if (status === 404) return new OneDriveError(kind === 'folder' ? 'ONEDRIVE_FOLDER_NOT_FOUND' : 'ONEDRIVE_ITEM_NOT_FOUND')
  if (status === 429) return new OneDriveError('ONEDRIVE_RATE_LIMITED', 'ONEDRIVE_RATE_LIMITED', retryAfter(response))
  if (status >= 500 && status <= 599) return new OneDriveError('ONEDRIVE_PROVIDER_UNAVAILABLE')
  return new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
}

function transportError(error: unknown): OneDriveError {
  if (error instanceof OneDriveError) return error
  if (error && typeof error === 'object' && ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String((error as { code?: unknown }).code))) {
    return new OneDriveError('ONEDRIVE_NETWORK_ERROR')
  }
  return new OneDriveError('ONEDRIVE_PROVIDER_UNAVAILABLE')
}

function idFromItem(item: GraphItem): string {
  if (typeof item.id !== 'string' || !item.id || !normalizeOneDriveItemId(item.id)) throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
  return item.id
}

function metadata(item: GraphItem): FileProviderMetadata {
  const id = idFromItem(item)
  if (typeof item.name !== 'string' || !item.name) throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
  const size = typeof item.size === 'number' && Number.isSafeInteger(item.size) ? item.size : undefined
  return {
    id,
    name: item.name,
    mime_type: typeof item.file?.mimeType === 'string' ? item.file.mimeType : undefined,
    size_bytes: size,
    parent_ids: typeof item.parentReference?.id === 'string' ? [item.parentReference.id] : [],
    kind: item.folder ? 'folder' : 'file',
    provider_metadata: {
      graph_item_id: id,
      web_url: typeof item.webUrl === 'string' ? item.webUrl : undefined,
      download_url: typeof item['@microsoft.graph.downloadUrl'] === 'string' ? item['@microsoft.graph.downloadUrl'] : undefined,
    },
  }
}

function nativeGraph(fetchImpl: OneDriveFetch): OneDriveGraphClient {
  return {
    async request(path, options) {
      return fetchImpl(`${GRAPH_BASE_URL}${path}`, {
        method: options.method ?? 'GET',
        headers: { authorization: `Bearer ${options.accessToken}`, accept: 'application/json' },
      })
    },
  }
}

export function createOneDriveFileProvider(options: OneDriveOptions = {}): FileProvider {
  const auth = options.auth ?? createOneDriveAuthClient({ env: options.env, fetchImpl: options.fetchImpl })
  const graph = options.graph ?? nativeGraph(options.fetchImpl ?? (fetch as unknown as OneDriveFetch))

  async function request(path: string, kind: 'item' | 'folder' = 'item'): Promise<import('@/lib/server/oneDriveAuth').OneDriveHttpResponse> {
    try {
      let response = await graph.request(path, { accessToken: await auth.getAccessToken() })
      if (response.status === 401) {
        await auth.refreshAccessToken()
        response = await graph.request(path, { accessToken: await auth.getAccessToken() })
      }
      if (response.status < 200 || response.status >= 300) throw responseError(response, kind)
      return response
    } catch (error) {
      throw transportError(error)
    }
  }

  async function json<T>(path: string, kind: 'item' | 'folder' = 'item'): Promise<T> {
    const response = await request(path, kind)
    try {
      return await response.json() as T
    } catch {
      throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
    }
  }

  const provider: FileProvider = {
    name: 'onedrive',
    async upload(_input: FileUploadInput): Promise<FileUploadResult> {
      void _input
      throw new OneDriveError('ONEDRIVE_OPERATION_UNSUPPORTED', 'OneDrive upload is not enabled by the current contract.')
    },
    async list(parentId) {
      const id = parentId ? normalizeOneDriveItemId(parentId) : 'root'
      const body = await json<{ value?: unknown }>(id === 'root' ? '/drive/root/children' : `/drive/items/${encodeURIComponent(id)}/children`, 'folder')
      if (!Array.isArray(body.value)) throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
      return body.value.map(item => metadata(item as GraphItem))
    },
    async getMetadata(externalFileId) {
      const id = normalizeOneDriveItemId(externalFileId)
      return metadata(await json<GraphItem>(`/drive/items/${encodeURIComponent(id)}`))
    },
    async read(externalFileId) {
      const id = normalizeOneDriveItemId(externalFileId)
      const response = await request(`/drive/items/${encodeURIComponent(id)}/content`)
      try {
        return new Uint8Array(await response.arrayBuffer())
      } catch {
        throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
      }
    },
    async getViewUrl(externalFileId) {
      const item = await this.getMetadata(externalFileId)
      const url = item.provider_metadata?.web_url
      if (typeof url !== 'string' || !url) throw new OneDriveError('ONEDRIVE_RESPONSE_INVALID')
      return url
    },
    async getDownloadUrl(externalFileId) {
      const item = await this.getMetadata(externalFileId)
      const url = item.provider_metadata?.download_url
      return typeof url === 'string' && url ? url : `${GRAPH_BASE_URL}/drive/items/${encodeURIComponent(item.id)}/content`
    },
    normalizeId(value) {
      return normalizeOneDriveItemId(value)
    },
    async delete(_externalFileId) {
      void _externalFileId
      throw new OneDriveError('ONEDRIVE_OPERATION_UNSUPPORTED', 'OneDrive delete is not enabled by the current contract.')
    },
    async healthCheck() {
      await json<GraphItem>('/drive/root')
      return { ok: true, provider: 'onedrive' }
    },
  }
  return provider
}
