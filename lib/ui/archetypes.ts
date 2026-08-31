export type PageArchetype =
  | 'command'
  | 'schedule'
  | 'queue'
  | 'workflow'
  | 'analytics'
  | 'directory'
  | 'trace'
  | 'utility'
  | 'configuration'
  | 'auth'

export type PageArchetypeContract = {
  purpose: string
  density: 'moderate' | 'focused' | 'low' | 'dense' | 'high'
  mobileActions: 'contextual' | 'queue' | 'review' | 'management' | 'utility' | 'none'
}

/** Structural defaults only; authorization remains in lib/permissions.ts and role-ux.ts. */
export const pageArchetypeContracts: Record<PageArchetype, PageArchetypeContract> = {
  command: { purpose: 'status, exceptions, and action', density: 'moderate', mobileActions: 'contextual' },
  schedule: { purpose: 'navigate context and manipulate operational records', density: 'focused', mobileActions: 'contextual' },
  queue: { purpose: 'show the next personal work item', density: 'low', mobileActions: 'queue' },
  workflow: { purpose: 'support a decision and its context', density: 'dense', mobileActions: 'review' },
  analytics: { purpose: 'compare signals and support interpretation', density: 'moderate', mobileActions: 'contextual' },
  directory: { purpose: 'browse and manage structured records', density: 'dense', mobileActions: 'management' },
  trace: { purpose: 'inspect event identity and history', density: 'high', mobileActions: 'contextual' },
  utility: { purpose: 'guide an input through validation to result', density: 'focused', mobileActions: 'utility' },
  configuration: { purpose: 'configure account and workspace settings', density: 'focused', mobileActions: 'management' },
  auth: { purpose: 'establish or recover identity', density: 'low', mobileActions: 'none' },
}

/** Route-level classification used by representative pages and future modules. */
export const pageArchetypeByRoute = {
  dashboard: 'command',
  live: 'command',
  calendar: 'schedule',
  staffing: 'schedule',
  shiftDetail: 'schedule',
  myShifts: 'queue',
  openShifts: 'queue',
  swaps: 'workflow',
  reports: 'workflow',
  reportReview: 'workflow',
  analytics: 'analytics',
  brands: 'directory',
  platforms: 'directory',
  campaigns: 'directory',
  staff: 'directory',
  audit: 'trace',
  import: 'utility',
  settings: 'configuration',
  auth: 'auth',
} as const satisfies Record<string, PageArchetype>
