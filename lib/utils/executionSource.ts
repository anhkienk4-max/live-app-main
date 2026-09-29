export type ExecutionSource = 'internal' | 'agency'

export class ExecutionSourceError extends Error {
  readonly code = 'EXECUTION_SOURCE_INVALID'

  constructor() {
    super('EXECUTION_SOURCE_INVALID')
    this.name = 'ExecutionSourceError'
  }
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
    const explicit = input.explicit.trim().toLocaleLowerCase('en-US')
    if (explicit === 'internal' || explicit === 'agency') return explicit
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
