param(
  [Parameter(Mandatory = $true)] [string] $RepositoryRoot,
  [Parameter(Mandatory = $true)] [string] $RuntimeConfigPath
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json

$migrationPath = Join-Path $RepositoryRoot 'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $config.anon_key
$env:SUPABASE_URL = 'http://127.0.0.1'
$env:SUPABASE_SECRET_KEY = $config.service_role_key
$env:C511_BASE_URL = 'http://c511.local'
$env:C511_ANON_KEY = $config.anon_key
$env:C511_SERVICE_ROLE_KEY = $config.service_role_key
$env:C511_TEST_PASSWORD = $config.test_password
$env:C511_DATABASE = $config.database
$env:C511_EVIDENCE_DIR = Join-Path $RepositoryRoot 'scripts/rc19-c4-migration-rehearsal/evidence/c5.12-local-pg1711/e2e'
$env:C511_POSTGRES_VERSION = $config.database_identity.Split('|')[0]
$env:C511_MIGRATION_SHA256 = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C512_MIGRATION_SHA256 = (Get-FileHash -LiteralPath (Join-Path $RepositoryRoot 'supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C515_SECONDS_MIGRATION_SHA256 = (Get-FileHash -LiteralPath (Join-Path $RepositoryRoot 'supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C515_APPROVAL_MIGRATION_SHA256 = (Get-FileHash -LiteralPath (Join-Path $RepositoryRoot 'supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C515_OT_CANCELLATION_MIGRATION_SHA256 = (Get-FileHash -LiteralPath (Join-Path $RepositoryRoot 'supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C515_LIVE_CANCELLATION_MIGRATION_SHA256 = (Get-FileHash -LiteralPath (Join-Path $RepositoryRoot 'supabase/migrations/20261111000000_rc19_c515_live_cancellation_transition.sql') -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C511_SOURCE_SHA = (git -C $RepositoryRoot rev-parse HEAD).Trim()
$env:FEATURE_SELF_ATTENDANCE_PHOTO = 'true'
$env:FILE_STORAGE_ENABLED = 'true'
$env:FEATURE_SELF_ATTENDANCE_REVIEW = 'true'
Push-Location $RepositoryRoot
try {
  node scripts/run-final-regression.mjs --exclude-postgres17
  exit $LASTEXITCODE
} finally {
  Pop-Location
  @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'C511_BASE_URL', 'C511_ANON_KEY',
    'C511_SERVICE_ROLE_KEY', 'C511_TEST_PASSWORD', 'C511_DATABASE', 'C511_EVIDENCE_DIR',
    'C511_POSTGRES_VERSION', 'C511_MIGRATION_SHA256', 'C512_MIGRATION_SHA256', 'C511_SOURCE_SHA',
    'C515_SECONDS_MIGRATION_SHA256', 'C515_APPROVAL_MIGRATION_SHA256', 'C515_OT_CANCELLATION_MIGRATION_SHA256', 'C515_LIVE_CANCELLATION_MIGRATION_SHA256',
    'FEATURE_SELF_ATTENDANCE_PHOTO', 'FILE_STORAGE_ENABLED', 'FEATURE_SELF_ATTENDANCE_REVIEW') | ForEach-Object {
      Remove-Item "Env:$($_)" -ErrorAction SilentlyContinue
    }
}
