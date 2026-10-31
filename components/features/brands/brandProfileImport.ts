export type BrandProfileFormValues = {
  name: string
  logo_url: string
  color: string
  description: string
  category: string
  contact_person: string
  contact_email: string
  contact_phone: string
  brand_guideline: string
  tone_of_voice: string
  key_products: string
  mandatory_claims: string
  restricted_claims: string
  dos: string
  donts: string
  asset_links: string
  notes: string
}

const textLimits: Record<string, number> = {
  name: 200,
  logo_url: 1000,
  color: 32,
  description: 4000,
  category: 120,
  contact_person: 200,
  contact_email: 320,
  contact_phone: 80,
  brand_guideline: 8000,
  tone_of_voice: 2000,
  notes: 5000,
}

const listFields = new Set(['key_products', 'mandatory_claims', 'restricted_claims', 'dos', 'donts', 'asset_links'])
const allowedFields = new Set([...Object.keys(textLimits), ...listFields])

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

/** Parse a small JSON brand profile into the existing edit form only. No data is persisted here. */
export function parseBrandProfileImport(source: string): Partial<BrandProfileFormValues> {
  if (new TextEncoder().encode(source).byteLength > 64 * 1024) throw new Error('BRAND_IMPORT_TOO_LARGE')

  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error('BRAND_IMPORT_INVALID_JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('BRAND_IMPORT_INVALID_OBJECT')

  const input = parsed as Record<string, unknown>
  const unknownFields = Object.keys(input).filter(key => !allowedFields.has(key))
  if (unknownFields.length) throw new Error('BRAND_IMPORT_UNSUPPORTED_FIELDS')

  const result: Record<string, string> = {}
  for (const [field, limit] of Object.entries(textLimits)) {
    if (!(field in input)) continue
    const value = input[field]
    if (typeof value !== 'string' || value.length > limit) throw new Error('BRAND_IMPORT_INVALID_FIELD')
    if (field === 'logo_url' && value && !isHttpUrl(value)) throw new Error('BRAND_IMPORT_INVALID_URL')
    if (field === 'color' && value && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('BRAND_IMPORT_INVALID_COLOR')
    result[field] = value
  }
  for (const field of listFields) {
    if (!(field in input)) continue
    const value = input[field]
    if (!Array.isArray(value) || value.length > 100 || value.some(item => typeof item !== 'string' || item.length > 1000)) {
      throw new Error('BRAND_IMPORT_INVALID_LIST')
    }
    if (field === 'asset_links' && (value as string[]).some(item => !isHttpUrl(item))) throw new Error('BRAND_IMPORT_INVALID_URL')
    result[field] = (value as string[]).join('\n')
  }

  if (!Object.keys(result).length) throw new Error('BRAND_IMPORT_EMPTY')
  return result as Partial<BrandProfileFormValues>
}
