param(
  [Parameter(Mandatory = $true)] [string] $RepositoryRoot,
  [Parameter(Mandatory = $true)] [string] $RuntimeConfigPath,
  [ValidateRange(1, 16)] [int] $TestConcurrency = 4,
  [switch] $PersistedOnly,
  [switch] $KeepRuntime
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json

if (-not $config.database_container) { throw 'C511_DATABASE_CONTAINER_IDENTITY_REQUIRED' }
$identitySql = "select current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'')||'|'||(select count(*) from auth.users)||'|'||(select count(*) from storage.objects) from pg_database where datname=current_database();"
$identityOutput = & docker exec $config.database_container psql -X -U postgres -d $config.database -Atc $identitySql
if ($LASTEXITCODE -ne 0) { throw 'C511_DATABASE_IDENTITY_QUERY_FAILED' }
$identity = [string]$identityOutput
$identityParts = @($identity -split '\|')
if ($identityParts.Count -ne 5 -or $identityParts[1] -ne $config.database -or
    $identityParts[2] -notlike '*CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY*' -or
    $identityParts[3] -notmatch '^\d+$' -or $identityParts[4] -notmatch '^\d+$' -or
    [int]$identityParts[0] -lt 170000 -or [int]$identityParts[0] -ge 180000) {
  throw 'C511_DATABASE_IDENTITY_OR_VERSION_MISMATCH'
}

function ConvertTo-Base64Url([byte[]] $Bytes) {
  return [Convert]::ToBase64String($Bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function New-LocalJwt([string] $Role) {
  $issuedAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $claims = @{ iss = 'supabase'; aud = 'authenticated'; iat = $issuedAt; exp = $issuedAt + 3600; role = $Role } | ConvertTo-Json -Compress
  $payload = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes($claims))
  $unsigned = "$header.$payload"
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes([string]$config.local_jwt_secret))
  try { $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($unsigned))) }
  finally { $hmac.Dispose() }
  return "$unsigned.$signature"
}

$anonKey = New-LocalJwt 'anon'
$serviceRoleKey = New-LocalJwt 'service_role'
$probe = Invoke-WebRequest -UseBasicParsing -SkipHttpErrorCheck -Uri "http://127.0.0.1:$($config.rest_port)/business_users?select=id&limit=0" -Headers @{ apikey = $anonKey; Authorization = "Bearer $anonKey" } -TimeoutSec 10
$probeReady = $probe.StatusCode -eq 200
if (-not $probeReady -and $probe.StatusCode -in @(401, 403)) {
  try {
    $probeBody = $probe.Content | ConvertFrom-Json
    $probeReady = $probeBody.code -eq '42501' -and $probeBody.message -like '*permission denied*'
  } catch { $probeReady = $false }
}
if (-not $probeReady) { throw 'C511_POSTGREST_FRESH_JWT_READINESS_FAILED' }

$migrationPath = Join-Path $RepositoryRoot 'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anonKey
$env:SUPABASE_URL = 'http://127.0.0.1'
$env:SUPABASE_SECRET_KEY = $serviceRoleKey
$env:C511_BASE_URL = 'http://c511.local'
$env:C511_ANON_KEY = $anonKey
$env:C511_SERVICE_ROLE_KEY = $serviceRoleKey
$env:C511_LOCAL_JWT_SECRET = [string]$config.local_jwt_secret
$env:C511_TEST_PASSWORD = $config.test_password
$env:C511_DATABASE = $config.database
$env:C511_EVIDENCE_DIR = Join-Path $RepositoryRoot 'scripts/rc19-c4-migration-rehearsal/evidence/c5.12-local-pg1711/e2e'
$env:C511_POSTGRES_VERSION = $config.database_identity.Split('|')[0]
if ($config.auth_port) { $env:C511_AUTH_PORT = [string]$config.auth_port } else { $env:C511_AUTH_PORT = '15543' }
if ($config.rest_port) { $env:C511_REST_PORT = [string]$config.rest_port } else { $env:C511_REST_PORT = '15542' }
$env:C511_AUTH_USERS_BEFORE = $identityParts[3]
$env:C511_STORAGE_OBJECTS_BEFORE = $identityParts[4]
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
  if ($PersistedOnly) {
    node --conditions=react-server --import ./tests/typescript-alias-loader.mjs --test "--test-concurrency=$TestConcurrency" tests/rc19-c511-persisted-e2e.test.ts
  } else {
    node scripts/run-final-regression.mjs --exclude-postgres17 "--test-concurrency=$TestConcurrency"
  }
  exit $LASTEXITCODE
} finally {
  Pop-Location
  if (-not $KeepRuntime) {
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
  }
  @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'C511_BASE_URL', 'C511_ANON_KEY',
    'C511_SERVICE_ROLE_KEY', 'C511_LOCAL_JWT_SECRET', 'C511_TEST_PASSWORD', 'C511_DATABASE', 'C511_EVIDENCE_DIR', 'C511_AUTH_PORT', 'C511_REST_PORT',
    'C511_AUTH_USERS_BEFORE', 'C511_STORAGE_OBJECTS_BEFORE',
    'C511_POSTGRES_VERSION', 'C511_MIGRATION_SHA256', 'C512_MIGRATION_SHA256', 'C511_SOURCE_SHA', 'C511_WORKTREE_DIRTY', 'C6_MIGRATION_SHA256',
    'C515_SECONDS_MIGRATION_SHA256', 'C515_APPROVAL_MIGRATION_SHA256', 'C515_OT_CANCELLATION_MIGRATION_SHA256', 'C515_LIVE_CANCELLATION_MIGRATION_SHA256',
    'FEATURE_SELF_ATTENDANCE_PHOTO', 'FILE_STORAGE_ENABLED', 'FEATURE_SELF_ATTENDANCE_REVIEW') | ForEach-Object {
      Remove-Item "Env:$($_)" -ErrorAction SilentlyContinue
    }
}
