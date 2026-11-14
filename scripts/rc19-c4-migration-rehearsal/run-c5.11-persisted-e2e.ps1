param(
  [Parameter(Mandatory = $true)] [string] $RepositoryRoot,
  [Parameter(Mandatory = $true)] [string] $RuntimeConfigPath,
  [ValidateRange(1, 16)] [int] $TestConcurrency = 4
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
if ($config.auth_port) { $env:C511_AUTH_PORT = [string]$config.auth_port } else { $env:C511_AUTH_PORT = '15543' }
if ($config.rest_port) { $env:C511_REST_PORT = [string]$config.rest_port } else { $env:C511_REST_PORT = '15542' }
$env:C511_AUTH_USERS_BEFORE = if ($null -ne $config.auth_users) { [string]$config.auth_users } else { '0' }
$env:C511_STORAGE_OBJECTS_BEFORE = if ($null -ne $config.storage_objects) { [string]$config.storage_objects } else { '0' }
function Get-CanonicalSha256([string] $Path) {
  $content = [IO.File]::ReadAllText($Path) -replace "`r`n?", "`n"
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($content))) -replace '-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}
$env:C511_MIGRATION_SHA256 = Get-CanonicalSha256 $migrationPath
$env:C512_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql')
$env:C515_SECONDS_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql')
$env:C515_APPROVAL_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql')
$env:C515_OT_CANCELLATION_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql')
$env:C515_LIVE_CANCELLATION_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261111000000_rc19_c515_live_cancellation_transition.sql')
$env:C511_SOURCE_SHA = (git -C $RepositoryRoot rev-parse HEAD).Trim()
$env:C511_WORKTREE_DIRTY = if (git -C $RepositoryRoot status --porcelain) { 'true' } else { 'false' }
$env:C6_MIGRATION_SHA256 = Get-CanonicalSha256 (Join-Path $RepositoryRoot 'supabase/migrations/20261112130000_rc19_c6_import_source_reconciliation.sql')
$env:FEATURE_SELF_ATTENDANCE_PHOTO = 'true'
$env:FILE_STORAGE_ENABLED = 'true'
$env:FEATURE_SELF_ATTENDANCE_REVIEW = 'true'
Push-Location $RepositoryRoot
try {
  node scripts/run-final-regression.mjs --exclude-postgres17 "--test-concurrency=$TestConcurrency"
  exit $LASTEXITCODE
} finally {
  Pop-Location
  $identity = @($config.database_identity -split '\|')
  if ($identity.Count -eq 6 -and $identity[1] -eq $config.database -and $identity[2] -eq 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY') {
    foreach ($runtime in @(
      @{ name = $config.auth_container; pattern = '^c511_auth_[a-f0-9]{10}$'; image = '^public\.ecr\.aws/supabase/gotrue:'; port = '9999/tcp'; envKey = 'GOTRUE_DB_DATABASE_URL' },
      @{ name = $config.rest_container; pattern = '^c511_rest_[a-f0-9]{10}$'; image = '^public\.ecr\.aws/supabase/postgrest:'; port = '3000/tcp'; envKey = 'PGRST_DB_URI' }
    )) {
      if ($runtime.name -notmatch $runtime.pattern) { continue }
      $container = docker inspect $runtime.name 2>$null | ConvertFrom-Json | Select-Object -First 1
      if (-not $container -or $container.Config.Image -notmatch $runtime.image) { continue }
      $databaseUri = ($container.Config.Env | Where-Object { $_.StartsWith("$($runtime.envKey)=") } | Select-Object -First 1) -replace "^$($runtime.envKey)=", ''
      $bound = @($container.HostConfig.PortBindings.PSObject.Properties[$runtime.port].Value)
      if (-not $databaseUri -or ([Uri]$databaseUri).AbsolutePath.TrimStart('/') -ne $config.database -or
          $bound.Count -ne 1 -or $bound[0].HostIp -ne '127.0.0.1') { continue }
      if ($container.State.Running) { docker stop --time 1 $runtime.name | Out-Null }
    }
  }
  @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'C511_BASE_URL', 'C511_ANON_KEY',
    'C511_SERVICE_ROLE_KEY', 'C511_TEST_PASSWORD', 'C511_DATABASE', 'C511_EVIDENCE_DIR', 'C511_AUTH_PORT', 'C511_REST_PORT',
    'C511_AUTH_USERS_BEFORE', 'C511_STORAGE_OBJECTS_BEFORE',
    'C511_POSTGRES_VERSION', 'C511_MIGRATION_SHA256', 'C512_MIGRATION_SHA256', 'C511_SOURCE_SHA', 'C511_WORKTREE_DIRTY', 'C6_MIGRATION_SHA256',
    'C515_SECONDS_MIGRATION_SHA256', 'C515_APPROVAL_MIGRATION_SHA256', 'C515_OT_CANCELLATION_MIGRATION_SHA256', 'C515_LIVE_CANCELLATION_MIGRATION_SHA256',
    'FEATURE_SELF_ATTENDANCE_PHOTO', 'FILE_STORAGE_ENABLED', 'FEATURE_SELF_ATTENDANCE_REVIEW') | ForEach-Object {
      Remove-Item "Env:$($_)" -ErrorAction SilentlyContinue
    }
}
