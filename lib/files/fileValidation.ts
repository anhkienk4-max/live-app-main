import type { FileUploadInput } from './fileProvider'

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

export const ALLOWED_FILE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
])

const EXECUTABLE_EXTENSIONS = /\.(?:exe|dll|bat|cmd|com|msi|sh|ps1|js|mjs|cjs|jar|php|py|rb|scr|vbs)$/i

export function sanitizeFileName(value: unknown): string {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\ufeff]/gi, '')
    .replace(/[\\/]+/g, '-')
    .replace(/\.\.+/g, '.')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
  const safe = normalized.replace(/[^\p{L}\p{N}._ ()-]/gu, '-').replace(/-+/g, '-')
  return safe.replace(/^[-.]+/, '').slice(0, 180) || 'unnamed-file'
}

export function validateFileUploadInput(input: FileUploadInput): void {
  if (!input || typeof input !== 'object') throw new Error('FILE_INPUT_INVALID')
  const name = sanitizeFileName(input.name)
  if (name === 'unnamed-file') throw new Error('FILE_NAME_INVALID')
  if (!ALLOWED_FILE_MIME_TYPES.has(String(input.mime_type ?? '').toLowerCase())) throw new Error('FILE_MIME_NOT_ALLOWED')
  if (!Number.isSafeInteger(input.size_bytes) || input.size_bytes <= 0 || input.size_bytes > MAX_FILE_SIZE_BYTES) {
    throw new Error('FILE_SIZE_INVALID')
  }
  if (EXECUTABLE_EXTENSIONS.test(name)) throw new Error('FILE_EXECUTABLE_NOT_ALLOWED')
  if (!String(input.entity_id ?? '').trim() || !String(input.created_by ?? '').trim() || !String(input.logical_path ?? '').trim()) throw new Error('FILE_METADATA_INVALID')
  if (input.checksum_sha256 && !/^[a-f0-9]{64}$/i.test(input.checksum_sha256)) throw new Error('FILE_CHECKSUM_INVALID')
}

export function assertMetadataContainsNoBinary(value: Record<string, unknown>): void {
  const forbidden = new Set(['content', 'body', 'data', 'bytes', 'buffer', 'base64'])
  for (const key of Object.keys(value)) {
    if (forbidden.has(key.toLowerCase())) throw new Error('FILE_METADATA_BINARY_FORBIDDEN')
  }
}
