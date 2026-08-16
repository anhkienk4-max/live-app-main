/**
 * Minimal environment-based feature flags.
 *
 * Flags gate unfinished UI/workflows. They are NOT an authorization boundary —
 * DB/RLS/RPC remain authoritative. Production defaults to OFF for every
 * feature listed here; set the env var to "true" only for staging/QA or after a
 * feature is production-ready.
 */
export type FeatureFlag =
  | 'import_batch_management'
  | 'staff_management_writes'
  | 'actual_staffing'
  | 'payroll'
  | 'notifications'
  | 'reports_v2'
  | 'platform_ingestion'

const FLAG_ENV: Record<FeatureFlag, string> = {
  import_batch_management: 'FEATURE_IMPORT_BATCH',
  staff_management_writes: 'FEATURE_STAFF_MANAGEMENT_WRITES',
  actual_staffing: 'FEATURE_ACTUAL_STAFFING',
  payroll: 'FEATURE_PAYROLL',
  notifications: 'FEATURE_NOTIFICATIONS',
  reports_v2: 'FEATURE_REPORTS_V2',
  platform_ingestion: 'FEATURE_PLATFORM_INGESTION',
}

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  import_batch_management: false,
  staff_management_writes: false,
  actual_staffing: false,
  payroll: false,
  notifications: false,
  reports_v2: false,
  platform_ingestion: false,
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envName = FLAG_ENV[flag]
  const raw = process.env[envName]?.trim().toLowerCase()
  if (raw === 'true') return true
  if (raw === 'false') return false
  return DEFAULT_FLAGS[flag]
}
