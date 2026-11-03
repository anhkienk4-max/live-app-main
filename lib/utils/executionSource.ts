export type ExecutionSource = 'internal' | 'agency'
export type AgencyCode = 'ada' | 'snap' | 'live_ai'

export class ExecutionSourceError extends Error {
  readonly code = 'EXECUTION_SOURCE_INVALID'

  constructor() {
    super('EXECUTION_SOURCE_INVALID')
    this.name = 'ExecutionSourceError'
  }
}

export function agencyDisplayLabel(code?: AgencyCode | null): string {
  switch (code) {
    case 'ada': return 'ADA'
    case 'snap': return 'SNAP'
    case 'live_ai': return 'Live AI'
    default: return ''
  }
}

export function executionSourceForAgency(code?: AgencyCode | null): ExecutionSource | undefined {
  if (!code) return undefined
  return code === 'ada' ? 'internal' : 'agency'
}

export function executionSourceDisplayLabel(source: ExecutionSource | null | undefined, language: 'en' | 'vi' = 'en'): string {
  if (source === 'internal') return language === 'vi' ? 'Nội bộ' : 'Internal'
  if (source === 'agency') return language === 'vi' ? 'Bên ngoài' : 'External'
  return ''
}

export function normalizeAgencyCode(value: unknown): AgencyCode | null {
  if (!value) return null
  const text = String(value)
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (['ada', 'ada group', 'cong ty ada'].includes(text)) return 'ada'
  if (['snap', 'snap live', 'snaplive'].includes(text)) return 'snap'
  if (['live ai', 'live_ai', 'liveai', 'ai'].includes(text)) return 'live_ai'
  return null
}

export function normalizeStudio(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/gu, ' ')
    : ''
}

export function resolveExecutionSource(input: {
  explicit?: unknown
  studio?: unknown
}): ExecutionSource {
  if (typeof input.explicit === 'string' && input.explicit.trim()) {
    const explicit = input.explicit
      .normalize('NFKC')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLocaleLowerCase('en-US')
    if (['internal', 'noi bo'].includes(explicit)) return 'internal'
    if (['agency', 'external', 'ben ngoai'].includes(explicit)) return 'agency'
    throw new ExecutionSourceError()
  }
  if (input.explicit !== undefined && input.explicit !== null && typeof input.explicit !== 'string') {
    throw new ExecutionSourceError()
  }

  const studio = normalizeStudio(input.studio)
  return /(^|[^\p{L}\p{N}_])agency(?=$|[^\p{L}\p{N}_])/u.test(studio)
    ? 'agency'
    : 'internal'
}
