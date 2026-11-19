param(
  [string] $RuntimeConfigPath = '\\wsl.localhost\Ubuntu-24.04\home\anhkienk4\.local\share\rc19-c511-native\runtime.json',
  [string] $RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json
$nativeRoot = '/home/anhkienk4/.local/share/rc19-c511-native'
if ($config.runtime_marker -ne 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY' -or
    $config.pg_data_directory -ne "$nativeRoot/pgdata" -or $config.pg_port -ne 55439) {
  throw 'REFUSED_UNVERIFIED_NATIVE_C511_RUNTIME_CONFIG'
}

$wslRoot = (& wsl.exe -d Ubuntu-24.04 -- wslpath -a $RepositoryRoot).Trim()
if ($LASTEXITCODE -ne 0 -or -not $wslRoot) { throw 'NATIVE_WSL_REPOSITORY_PATH_UNAVAILABLE' }
$nativeRuntimeScript = "$wslRoot/scripts/rc19-c4-migration-rehearsal/start-c5.11-native-runtime.py"
$nativeDatabaseScript = "$wslRoot/scripts/rc19-c4-migration-rehearsal/run-c5.11-isolated-db.py"
$head = (git -C $RepositoryRoot rev-parse HEAD).Trim()
$dirty = if (git -C $RepositoryRoot status --porcelain) { 'true' } else { 'false' }

& wsl.exe -d Ubuntu-24.04 -- python3 $nativeRuntimeScript stop
if ($LASTEXITCODE -ne 0) { throw 'NATIVE_OWNED_SERVICE_STOP_FAILED' }
$provisionOutput = & wsl.exe -d Ubuntu-24.04 -- env `
  C511_NATIVE_PGHOST="$nativeRoot" C511_NATIVE_PGPORT=55439 C511_NATIVE_PGDATA="$nativeRoot/pgdata" `
  python3 $nativeDatabaseScript $head $dirty 2>&1
if ($LASTEXITCODE -ne 0) { $provisionOutput | Write-Output; throw 'NATIVE_DATABASE_PROVISION_FAILED' }
$databaseName = [regex]::Match(($provisionOutput -join "`n"), 'PASS db=([A-Za-z0-9_]+) postgres=17').Groups[1].Value
if (-not $databaseName) { $provisionOutput | Write-Output; throw 'NATIVE_DATABASE_PROVISION_OUTPUT_INVALID' }
$serviceOutput = & wsl.exe -d Ubuntu-24.04 -- python3 $nativeRuntimeScript serve $databaseName 2>&1
if ($LASTEXITCODE -ne 0) { $serviceOutput | Write-Output; throw 'NATIVE_AUTH_POSTGREST_START_FAILED' }
$serviceOutput | Write-Output
$config = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json
$identity = @($config.database_identity -split '\|')
if ($identity.Count -ne 6 -or $identity[1] -ne $config.database -or
    $config.database -ne $databaseName -or $identity[2] -ne $config.runtime_marker -or
    $identity[2] -ne 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY' -or
    $identity[3] -ne '0' -or $identity[4] -ne '0' -or $identity[0] -notmatch '^17' -or
    $config.ports_loopback_only -ne $true -or
    $config.auth_url -notmatch '^http://127\.0\.0\.1:' -or
    $config.rest_url -notmatch '^http://127\.0\.0\.1:' -or
    $config.auth_port -eq $config.rest_port -or
    $config.auth_port -in @(15542, 15543) -or $config.rest_port -in @(15542, 15543)) {
  throw 'REFUSED_UNVERIFIED_NATIVE_C511_RUNTIME_CONFIG'
}

function ConvertTo-Base64Url([byte[]] $Value) {
  return [Convert]::ToBase64String($Value).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function New-RoleJwt([string] $Role, [string] $Secret) {
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $claims = [ordered]@{ iss = 'supabase'; aud = 'authenticated'; iat = $now; exp = $now + 3600; role = $Role }
  $body = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes(($claims | ConvertTo-Json -Compress)))
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
  try { $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$body"))) }
  finally { $hmac.Dispose() }
  return "$header.$body.$signature"
}

$env:C511_BASE_URL = 'http://c511.local'
$env:C511_ANON_KEY = New-RoleJwt 'anon' $config.local_jwt_secret
$env:C511_SERVICE_ROLE_KEY = New-RoleJwt 'service_role' $config.local_jwt_secret
$env:C511_LOCAL_JWT_SECRET = $config.local_jwt_secret
$env:C511_TEST_PASSWORD = $config.test_password
$env:C511_DATABASE = $config.database
$env:C511_EVIDENCE_DIR = Join-Path $RepositoryRoot 'scripts/rc19-c4-migration-rehearsal/evidence/c5.12-local-pg1711/e2e'
$env:C511_POSTGRES_VERSION = $identity[0]
$env:C511_AUTH_PORT = [string]$config.auth_port
$env:C511_REST_PORT = [string]$config.rest_port
$env:C511_AUTH_USERS_BEFORE = '0'
$env:C511_STORAGE_OBJECTS_BEFORE = '0'
$env:C511_RUNTIME_KIND = 'native-wsl'
$env:C511_SOURCE_SHA = "$head+dirty-candidate"
$env:C511_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql') -Algorithm SHA256).Hash.ToLower()
$env:C512_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261109131324_rc19_c512_attendance_photo_review.sql') -Algorithm SHA256).Hash.ToLower()
$env:C515_SECONDS_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261110115529_rc19_c515_payroll_second_precision.sql') -Algorithm SHA256).Hash.ToLower()
$env:C515_APPROVAL_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261110130000_rc19_c515_payroll_approval_hold.sql') -Algorithm SHA256).Hash.ToLower()
$env:C515_OT_CANCELLATION_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261110140000_rc19_c515_overtime_cancellation_approvals.sql') -Algorithm SHA256).Hash.ToLower()
$env:C515_LIVE_CANCELLATION_MIGRATION_SHA256 = (Get-FileHash (Join-Path $RepositoryRoot 'supabase/migrations/20261111000000_rc19_c515_live_cancellation_transition.sql') -Algorithm SHA256).Hash.ToLower()
$env:FEATURE_SELF_ATTENDANCE_PHOTO = 'true'
$env:FILE_STORAGE_ENABLED = 'true'
$env:FEATURE_SELF_ATTENDANCE_REVIEW = 'true'
New-Item -ItemType Directory -Force -Path $env:C511_EVIDENCE_DIR | Out-Null
$log = Join-Path $env:C511_EVIDENCE_DIR ('native-c511-e2e-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '.tap.log')

Push-Location $RepositoryRoot
try {
  node --conditions=react-server --import ./tests/typescript-alias-loader.mjs --test --test-concurrency=1 tests/rc19-c511-persisted-e2e.test.ts 2>&1 | Tee-Object -FilePath $log
  $code = $LASTEXITCODE
} finally {
  Pop-Location
  @('C511_BASE_URL','C511_ANON_KEY','C511_SERVICE_ROLE_KEY','C511_LOCAL_JWT_SECRET','C511_TEST_PASSWORD',
    'C511_DATABASE','C511_EVIDENCE_DIR','C511_POSTGRES_VERSION','C511_AUTH_PORT','C511_REST_PORT',
    'C511_AUTH_USERS_BEFORE','C511_STORAGE_OBJECTS_BEFORE','C511_RUNTIME_KIND',
    'C511_SOURCE_SHA','C511_MIGRATION_SHA256','C512_MIGRATION_SHA256','C515_SECONDS_MIGRATION_SHA256',
    'C515_APPROVAL_MIGRATION_SHA256','C515_OT_CANCELLATION_MIGRATION_SHA256','C515_LIVE_CANCELLATION_MIGRATION_SHA256',
    'FEATURE_SELF_ATTENDANCE_PHOTO','FILE_STORAGE_ENABLED','FEATURE_SELF_ATTENDANCE_REVIEW') | ForEach-Object {
      Remove-Item "Env:$($_)" -ErrorAction SilentlyContinue
    }
}
Write-Output "C511_TEST_EXIT=$code"
Write-Output "C511_TEST_LOG=$log"
exit $code
