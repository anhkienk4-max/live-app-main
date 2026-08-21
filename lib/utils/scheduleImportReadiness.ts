export type MasterDataState = 'loading' | 'ready' | 'error'

export interface MasterImportGate {
  allowed: boolean
  message: string | null
}

export function importGate(state: MasterDataState): MasterImportGate {
  if (state === 'loading') {
    return {
      allowed: false,
      message: 'Master data is still loading. Import is disabled until it finishes.',
    }
  }
  if (state === 'error') {
    return {
      allowed: false,
      message: 'Master data failed to load. Import is disabled.',
    }
  }
  return { allowed: true, message: null }
}

export function parseWhenMastersReady<T>(state: MasterDataState, parse: () => T): T | null {
  const gate = importGate(state)
  return gate.allowed ? parse() : null
}