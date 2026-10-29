export function storageResourceRegistryDatabaseErrorResponse(error: unknown): Response | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = String(error.code)
  const responses: Record<string, { status: number; error: string }> = {
    '42P01': { status: 503, error: 'STORAGE_RESOURCE_REGISTRY_NOT_INSTALLED' },
    PGRST202: { status: 503, error: 'STORAGE_RESOURCE_REGISTRY_NOT_INSTALLED' },
    PGRST205: { status: 503, error: 'STORAGE_RESOURCE_REGISTRY_NOT_INSTALLED' },
    '23505': { status: 409, error: 'RESOURCE_DUPLICATE' },
    '23503': { status: 400, error: 'STORAGE_RESOURCE_SCOPE_INVALID' },
    '23514': { status: 400, error: 'STORAGE_RESOURCE_CONSTRAINT_FAILED' },
    '22023': { status: 400, error: 'STORAGE_RESOURCE_INPUT_INVALID' },
    '22P02': { status: 400, error: 'STORAGE_RESOURCE_INPUT_INVALID' },
    '42501': { status: 403, error: 'FORBIDDEN' },
    P0002: { status: 404, error: 'STORAGE_RESOURCE_NOT_FOUND' },
    PGRST116: { status: 404, error: 'STORAGE_RESOURCE_NOT_FOUND' },
  }
  const mapped = responses[code]
  return mapped
    ? Response.json({ ok: false, error: mapped.error }, { status: mapped.status, headers: { 'Cache-Control': 'no-store' } })
    : null
}
