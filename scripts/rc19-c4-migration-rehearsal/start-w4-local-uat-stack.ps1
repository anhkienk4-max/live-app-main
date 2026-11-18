param(
  [switch] $FreshDb,
  [switch] $Rebuild,
  [switch] $StayAlive,
  [int] $NextPort = 3102,
  [int] $ProxyPort = 15546,
  [string] $RuntimeConfigPath = '\\wsl.localhost\Ubuntu-24.04\home\anhkienk4\.local\share\rc19-c511-native\runtime.json',
  [string] $RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'

$nativeRoot = '/home/anhkienk4/.local/share/rc19-c511-native'
$pgPort = 55439
$marker = 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY'
$wslRoot = (& wsl.exe -d Ubuntu-24.04 -- wslpath -a $RepositoryRoot).Trim()
if ($LASTEXITCODE -ne 0 -or -not $wslRoot) {
  throw 'NATIVE_WSL_REPOSITORY_PATH_UNAVAILABLE'
}

$nativeRuntimeScript = "$wslRoot/scripts/rc19-c4-migration-rehearsal/start-c5.11-native-runtime.py"
$nativeDatabaseScript = "$wslRoot/scripts/rc19-c4-migration-rehearsal/run-c5.11-isolated-db.py"

$stateDir = Join-Path $env:LOCALAPPDATA 'rc19-w4-local-uat'
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null

function ConvertTo-Base64Url([byte[]] $Value) {
  return [Convert]::ToBase64String($Value).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function New-RoleJwt([string] $Role, [string] $Secret, [int] $TtlSeconds = 604800) {
  $header = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $claims = [ordered]@{
    iss  = 'supabase'
    aud  = 'authenticated'
    iat  = $now
    exp  = $now + $TtlSeconds
    role = $Role
  }
  $body = ConvertTo-Base64Url ([Text.Encoding]::UTF8.GetBytes(($claims | ConvertTo-Json -Compress)))
  $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
  try {
    $signature = ConvertTo-Base64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$body")))
  } finally {
    $hmac.Dispose()
  }
  return "$header.$body.$signature"
}

function Get-Sha256Hex([string] $Value) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Test-HttpOk([string] $Url, [hashtable] $Headers = @{}) {
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -TimeoutSec 3
    return ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Stop-OwnedNodeListener([int] $Port, [string[]] $AllowedCmdFragments) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $pids) {
    if ($procId -le 4) { continue }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
    if (-not $proc) { continue }
    $cmd = [string]$proc.CommandLine
    $name = [string]$proc.Name
    $matched = $false
    foreach ($frag in $AllowedCmdFragments) {
      if ($cmd -like "*$frag*") { $matched = $true; break }
    }
    if (-not $matched) {
      throw "PORT_${Port}_IN_USE_BY_UNRECOGNIZED_PROCESS: pid=$procId name=$name cmd=$cmd"
    }
    Stop-Process -Id $procId -Force -ErrorAction Stop
    Start-Sleep -Milliseconds 300
  }
}

# 1. Ensure WSL PostgreSQL 17.11 cluster on port 55439 is running
Write-Host '[1/6] Checking WSL PostgreSQL 17.11 cluster (port 55439)...'
& wsl.exe -d Ubuntu-24.04 -- pg_isready -h $nativeRoot -p $pgPort *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Starting WSL PostgreSQL 17.11 cluster...'
  $pgOpts = "-h 127.0.0.1 -p $pgPort -k $nativeRoot -c password_encryption=scram-sha-256"
  & wsl.exe -d Ubuntu-24.04 -- /usr/lib/postgresql/17/bin/pg_ctl -D "$nativeRoot/pgdata" -l "$nativeRoot/logs/pg.log" -o $pgOpts start
  if ($LASTEXITCODE -ne 0) { throw 'FAILED_TO_START_WSL_PG17' }
}

# 2. Check or provision marked disposable DB + GoTrue + PostgREST
$head = (git -C $RepositoryRoot rev-parse HEAD).Trim()
$dirty = if (git -C $RepositoryRoot status --porcelain) { 'true' } else { 'false' }

$needsProvision = [bool]$FreshDb
if (-not $needsProvision) {
  if (-not (Test-Path -LiteralPath $RuntimeConfigPath)) {
    $needsProvision = $true
  } else {
    $cfg = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json
    if ($cfg.runtime_marker -ne $marker -or $cfg.pg_data_directory -ne "$nativeRoot/pgdata" -or [int]$cfg.pg_port -ne $pgPort) {
      throw 'REFUSED_UNVERIFIED_NATIVE_RUNTIME_CONFIG'
    }
    $probeAnon = New-RoleJwt 'anon' $cfg.local_jwt_secret 300
    $authOk = Test-HttpOk "http://127.0.0.1:$($cfg.auth_port)/health"
    $restOk = Test-HttpOk "http://127.0.0.1:$($cfg.rest_port)/business_users?select=id&limit=0" @{
      apikey        = $probeAnon
      Authorization = "Bearer $probeAnon"
    }
    $migOk = $false
    if ($authOk -and $restOk -and $cfg.database) {
      $dbCheck = (& wsl.exe -d Ubuntu-24.04 -- psql -h $nativeRoot -p $pgPort -U postgres -d $($cfg.database) -At -c "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20261118150000'" 2>$null).Trim()
      if ($LASTEXITCODE -eq 0 -and $dbCheck -eq '1') {
        $migOk = $true
      }
    }
    if (-not ($authOk -and $restOk -and $migOk)) {
      $needsProvision = $true
    }
  }
}

if ($needsProvision) {
  Write-Host '[2/6] Provisioning fresh marked disposable PG 17.11 database + GoTrue + PostgREST...'
  & wsl.exe -d Ubuntu-24.04 -- python3 $nativeRuntimeScript stop
  if ($LASTEXITCODE -ne 0) { throw 'NATIVE_OWNED_SERVICE_STOP_FAILED' }
  $provisionOutput = & wsl.exe -d Ubuntu-24.04 -- env `
    C511_NATIVE_PGHOST="$nativeRoot" C511_NATIVE_PGPORT="$pgPort" C511_NATIVE_PGDATA="$nativeRoot/pgdata" `
    python3 $nativeDatabaseScript $head $dirty 2>&1
  if ($LASTEXITCODE -ne 0) {
    $provisionOutput | Write-Host
    throw 'NATIVE_DATABASE_PROVISION_FAILED'
  }
  $databaseName = [regex]::Match(($provisionOutput -join "`n"), 'PASS db=([A-Za-z0-9_]+) postgres=17').Groups[1].Value
  if (-not $databaseName) {
    $provisionOutput | Write-Host
    throw 'NATIVE_DATABASE_PROVISION_OUTPUT_INVALID'
  }
  $serviceOutput = & wsl.exe -d Ubuntu-24.04 -- python3 $nativeRuntimeScript serve $databaseName 2>&1
  if ($LASTEXITCODE -ne 0) {
    $serviceOutput | Write-Host
    throw 'NATIVE_AUTH_POSTGREST_START_FAILED'
  }
} else {
  Write-Host '[2/6] Reusing healthy WSL GoTrue + PostgREST + disposable PG 17.11 DB.'
}

$config = Get-Content -LiteralPath $RuntimeConfigPath -Raw | ConvertFrom-Json
if ($config.runtime_marker -ne $marker -or $config.pg_data_directory -ne "$nativeRoot/pgdata" -or [int]$config.pg_port -ne $pgPort) {
  throw 'REFUSED_UNVERIFIED_NATIVE_RUNTIME_CONFIG_POST_START'
}

$identitySql = "SELECT current_setting('server_version_num')||'|'||current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database();"
$dbIdentity = (& wsl.exe -d Ubuntu-24.04 -- psql -h $nativeRoot -p $pgPort -U postgres -d $($config.database) -At -c $identitySql).Trim()
if ($LASTEXITCODE -ne 0 -or $dbIdentity -notmatch "^17\d+\|$($config.database)\|$marker$") {
  throw "REFUSED_TARGET_DB_MARKER_MISMATCH: $dbIdentity"
}

$authPort = [int]$config.auth_port
$restPort = [int]$config.rest_port

# 3. Mint or reuse 7-day local HS256 JWTs (strictly kept out of Git)
$tokensPath = Join-Path $stateDir 'tokens.json'
$secretSha = Get-Sha256Hex $config.local_jwt_secret
$nowSec = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$anonJwt = $null
$serviceRoleJwt = $null
if (Test-Path -LiteralPath $tokensPath) {
  try {
    $savedTokens = Get-Content -LiteralPath $tokensPath -Raw | ConvertFrom-Json
    if ($savedTokens.jwt_secret_sha256 -eq $secretSha -and [long]$savedTokens.exp -gt ($nowSec + 86400)) {
      $anonJwt = [string]$savedTokens.anon_jwt
      $serviceRoleJwt = [string]$savedTokens.service_role_jwt
    }
  } catch {}
}
if (-not $anonJwt -or -not $serviceRoleJwt) {
  $expSec = $nowSec + 604800
  $anonJwt = New-RoleJwt 'anon' $config.local_jwt_secret 604800
  $serviceRoleJwt = New-RoleJwt 'service_role' $config.local_jwt_secret 604800
  ([ordered]@{
    jwt_secret_sha256 = $secretSha
    exp               = $expSec
    anon_jwt          = $anonJwt
    service_role_jwt  = $serviceRoleJwt
  } | ConvertTo-Json) | Set-Content -LiteralPath $tokensPath -Encoding utf8
}

# 4. Restart local CORS proxy on 127.0.0.1:$ProxyPort
Write-Host "[3/6] Starting local Supabase CORS proxy on http://127.0.0.1:$ProxyPort..."
Stop-OwnedNodeListener -Port $ProxyPort -AllowedCmdFragments @('rc19-w4-local-proxy-15546.mjs', 'local-supabase-cors-proxy.mjs')
$proxyScript = Join-Path $PSScriptRoot 'local-supabase-cors-proxy.mjs'
$proxyOut = Join-Path $stateDir 'cors-proxy.log'
$proxyErr = Join-Path $stateDir 'cors-proxy.err.log'
$nodeExe = (Get-Command node).Source

$env:LOCAL_PROXY_PORT = [string]$ProxyPort
$env:LOCAL_AUTH_PORT = [string]$authPort
$env:LOCAL_REST_PORT = [string]$restPort
$env:LOCAL_APP_ORIGIN = "http://127.0.0.1:$NextPort"
$proxyProc = Start-Process -FilePath $nodeExe -ArgumentList @("`"$proxyScript`"") `
  -WorkingDirectory $RepositoryRoot -RedirectStandardOutput $proxyOut -RedirectStandardError $proxyErr `
  -WindowStyle Hidden -PassThru

$proxyHealthy = $false
for ($i = 0; $i -lt 25; $i++) {
  if ((Test-HttpOk "http://127.0.0.1:$ProxyPort/health") -and
      (Test-HttpOk "http://127.0.0.1:$ProxyPort/auth/v1/health") -and
      (Test-HttpOk "http://127.0.0.1:$ProxyPort/rest/v1/business_users?select=id&limit=0" @{
        apikey        = $anonJwt
        Authorization = "Bearer $anonJwt"
      })) {
    $proxyHealthy = $true
    break
  }
  Start-Sleep -Milliseconds 300
}
if (-not $proxyHealthy) {
  throw "CORS_PROXY_HEALTH_FAILED_ON_PORT_$ProxyPort"
}

# 5. Provision deterministic multi-role UAT users + synthetic Brand/Platform/Shift fixtures
Write-Host '[4/6] Seeding deterministic UAT accounts (Admin, Reviewer, Leader, Member Host/Support) + synthetic fixtures...'
$uatUsers = @(
  @{ id = 'w4_admin_uat';          email = 'w4.admin@c511.invalid';          name = 'W4 UAT Admin';          role = 'admin';  perm = 'admin';  ops = '{}' }
  @{ id = 'w4_reviewer_uat';       email = 'w4.reviewer@c511.invalid';       name = 'W4 UAT Reviewer';       role = 'admin';  perm = 'admin';  ops = '{}' }
  @{ id = 'w4_leader_uat';         email = 'w4.leader@c511.invalid';         name = 'W4 UAT Leader Brand A'; role = 'leader'; perm = 'leader'; ops = '{}' }
  @{ id = 'w4_member_host_uat';    email = 'w4.member.host@c511.invalid';    name = 'W4 UAT Member Host';    role = 'staff';  perm = 'member'; ops = '{host}' }
  @{ id = 'w4_member_support_uat'; email = 'w4.member.support@c511.invalid'; name = 'W4 UAT Member Support'; role = 'staff';  perm = 'member'; ops = '{support}' }
)

$adminHeaders = @{
  apikey         = $serviceRoleJwt
  Authorization  = "Bearer $serviceRoleJwt"
  'Content-Type' = 'application/json'
}

$existingAuthResp = Invoke-RestMethod -Uri "http://127.0.0.1:$ProxyPort/auth/v1/admin/users?per_page=1000" -Headers $adminHeaders -Method Get -TimeoutSec 10
$existingByEmail = @{}
foreach ($u in @($existingAuthResp.users)) {
  if ($u.email) { $existingByEmail[$u.email.ToLowerInvariant()] = $u }
}

foreach ($u in $uatUsers) {
  $emailKey = $u.email.ToLowerInvariant()
  $appMeta = @{
    business_user_id  = $u.id
    system_permission = $u.perm
  }
  if ($existingByEmail.ContainsKey($emailKey)) {
    $authId = [string]$existingByEmail[$emailKey].id
    $updatePayload = @{
      password      = $config.test_password
      email_confirm = $true
      user_metadata = @{ full_name = $u.name }
      app_metadata  = $appMeta
    } | ConvertTo-Json -Compress
    Invoke-RestMethod -Uri "http://127.0.0.1:$ProxyPort/auth/v1/admin/users/$authId" -Headers $adminHeaders -Method Put -Body $updatePayload -TimeoutSec 10 | Out-Null
    $u['auth_user_id'] = $authId
  } else {
    $createPayload = @{
      email         = $u.email
      password      = $config.test_password
      email_confirm = $true
      user_metadata = @{ full_name = $u.name }
      app_metadata  = $appMeta
    } | ConvertTo-Json -Compress
    $created = Invoke-RestMethod -Uri "http://127.0.0.1:$ProxyPort/auth/v1/admin/users" -Headers $adminHeaders -Method Post -Body $createPayload -TimeoutSec 10
    $u['auth_user_id'] = [string]$created.id
  }
}

$userSqlLines = foreach ($u in $uatUsers) {
  @"
INSERT INTO public.business_users (
  id, auth_user_id, email, full_name, role, system_permission, operational_roles,
  status, account_status, email_verified, auth_provider
) VALUES (
  '$($u.id)', '$($u.auth_user_id)'::uuid, '$($u.email)', '$($u.name)',
  '$($u.role)', '$($u.perm)', '$($u.ops)'::text[],
  'active', 'active', true, 'email'
)
ON CONFLICT (id) DO UPDATE SET
  auth_user_id = EXCLUDED.auth_user_id,
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  system_permission = EXCLUDED.system_permission,
  operational_roles = EXCLUDED.operational_roles,
  status = 'active',
  account_status = 'active',
  email_verified = true,
  deleted_at = NULL,
  archived_at = NULL;
"@
}

$adminAuthId = [string]$uatUsers[0]['auth_user_id']
$adminClaimsJson = ([ordered]@{ sub = $adminAuthId; role = 'authenticated' } | ConvertTo-Json -Compress)

$seedSql = @"
BEGIN;
$($userSqlLines -join "`n")

SELECT set_config('request.jwt.claim.sub', '$adminAuthId', true);
SELECT set_config('request.jwt.claims', '$adminClaimsJson', true);

SELECT public.sync_staff_auth_metadata(id)
FROM public.business_users
WHERE id IN ('w4_admin_uat', 'w4_reviewer_uat', 'w4_leader_uat', 'w4_member_host_uat', 'w4_member_support_uat');

INSERT INTO public.brands (id, name, status)
VALUES
  ('brand_w4_uat_a', 'W4 UAT Brand A', 'active'),
  ('brand_w4_uat_b', 'W4 UAT Brand B', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL, archived_at = NULL;

INSERT INTO public.platforms (id, name, status)
VALUES ('platform_w4_uat_shopee', 'W4 UAT Shopee', 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL, archived_at = NULL;

INSERT INTO public.rc19_leader_brand_scopes (
  leader_business_user_id, brand_id, scope_key, status, valid_from, version, granted_by, updated_by
)
SELECT
  'w4_leader_uat',
  'brand_w4_uat_a',
  scope_key,
  'active',
  now() - interval '1 day',
  1,
  'w4_admin_uat',
  'w4_admin_uat'
FROM unnest(ARRAY[
  'shifts.read', 'shifts.manage', 'staff.read', 'staff.manage',
  'workforce.read', 'reports.read', 'reports.submit', 'reports.review'
]) AS scope_key
ON CONFLICT (leader_business_user_id, brand_id, scope_key) DO UPDATE SET
  status = 'active',
  revoked_at = NULL,
  valid_until = NULL,
  updated_by = 'w4_admin_uat';

INSERT INTO public.shifts (
  id, date, start_time, end_time, timezone, brand_id, platform_id, title, studio,
  host_id, support_id, required_host_count, required_support_count, required_technical_count,
  registration_locked, status, updated_by
) VALUES
  (
    'shift_w4_uat_brand_a_01',
    (CURRENT_DATE + 2),
    TIME '10:00:00',
    TIME '12:00:00',
    'Asia/Ho_Chi_Minh',
    'brand_w4_uat_a',
    'platform_w4_uat_shopee',
    'W4 UAT Brand A Livestream Shift',
    'Studio A',
    'w4_member_host_uat',
    'w4_member_support_uat',
    1, 1, 0,
    false, 'scheduled', 'w4_admin_uat'
  ),
  (
    'shift_w4_uat_brand_b_01',
    (CURRENT_DATE + 3),
    TIME '14:00:00',
    TIME '16:00:00',
    'Asia/Ho_Chi_Minh',
    'brand_w4_uat_b',
    'platform_w4_uat_shopee',
    'W4 UAT Brand B Isolated Shift',
    'Studio B',
    NULL,
    NULL,
    1, 1, 0,
    false, 'scheduled', 'w4_admin_uat'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shift_registrations (
  id, shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at, version
) VALUES
  (
    'reg_w4_uat_host_01',
    'shift_w4_uat_brand_a_01',
    'w4_member_host_uat',
    'host',
    'approved',
    'manual_assignment',
    now(),
    'w4_admin_uat',
    now(),
    1
  ),
  (
    'reg_w4_uat_support_01',
    'shift_w4_uat_brand_a_01',
    'w4_member_support_uat',
    'support',
    'approved',
    'manual_assignment',
    now(),
    'w4_admin_uat',
    now(),
    1
  )
ON CONFLICT (id) DO NOTHING;
COMMIT;
"@

$seedOutput = $seedSql | & wsl.exe -d Ubuntu-24.04 -- psql -h $nativeRoot -p $pgPort -U postgres -d $($config.database) -X -v ON_ERROR_STOP=1 2>&1
if ($LASTEXITCODE -ne 0) {
  $seedOutput | Write-Host
  throw 'SYNTHETIC_UAT_SEED_FAILED'
}

# 6. Build (if needed) and launch Next.js candidate server on http://127.0.0.1:$NextPort
Write-Host "[5/6] Preparing Next.js candidate server on http://127.0.0.1:$NextPort..."
Stop-OwnedNodeListener -Port $NextPort -AllowedCmdFragments @('next', 'next-server', 'start')

$env:VERCEL = ''
$env:VERCEL_ENV = ''
$env:NODE_ENV = 'production'
$env:NEXT_PUBLIC_APP_ENV = 'local'
$env:NEXT_PUBLIC_USE_MOCK_DATA = 'false'
$env:NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:$ProxyPort"
$env:SUPABASE_URL = "http://127.0.0.1:$ProxyPort"
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $anonJwt
$env:SUPABASE_SECRET_KEY = $serviceRoleJwt
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleJwt
$env:NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:$NextPort"
if (-not $env:FEATURE_SELF_ATTENDANCE_PHOTO) { $env:FEATURE_SELF_ATTENDANCE_PHOTO = 'false' }
if (-not $env:FILE_STORAGE_ENABLED) { $env:FILE_STORAGE_ENABLED = 'false' }
$env:FEATURE_IMPORT_BATCH = 'true'
$env:FEATURE_STAFF_MANAGEMENT_WRITES = 'true'
$env:FEATURE_ACTUAL_STAFFING = 'true'
$env:FEATURE_SELF_ATTENDANCE_REVIEW = 'true'
$env:FEATURE_PAYROLL = 'true'
$env:FEATURE_MY_PAYSLIP = 'true'
$env:FEATURE_NOTIFICATIONS = 'true'
$env:FEATURE_REPORTS_V2 = 'true'
$env:FEATURE_PLATFORM_INGESTION = 'true'
$env:NODE_OPTIONS = '--max-old-space-size=6144'

$anonShaPrefix = (Get-Sha256Hex $anonJwt).Substring(0, 16)
$stampPath = Join-Path $RepositoryRoot '.next\w4-local-build-stamp.json'
$buildIdPath = Join-Path $RepositoryRoot '.next\BUILD_ID'
$needBuild = [bool]$Rebuild -or -not (Test-Path -LiteralPath $buildIdPath) -or -not (Test-Path -LiteralPath $stampPath)
if (-not $needBuild) {
  try {
    $stamp = Get-Content -LiteralPath $stampPath -Raw | ConvertFrom-Json
    if ($stamp.head -ne $head -or $stamp.supabase_url -ne $env:NEXT_PUBLIC_SUPABASE_URL -or $stamp.anon_sha_prefix -ne $anonShaPrefix) {
      $needBuild = $true
    }
  } catch {
    $needBuild = $true
  }
}

Push-Location $RepositoryRoot
try {
  if ($needBuild) {
    Write-Host 'Running Next.js production build for local loopback proxy...'
    & $nodeExe --import ./tests/typescript-alias-loader.mjs scripts/check-runtime-environment.ts build
    if ($LASTEXITCODE -ne 0) { throw 'CHECK_RUNTIME_ENV_BUILD_FAILED' }
    & (Join-Path $RepositoryRoot 'node_modules\.bin\next.cmd') build
    if ($LASTEXITCODE -ne 0) { throw 'NEXT_BUILD_FAILED' }
    ([ordered]@{
      head            = $head
      supabase_url    = $env:NEXT_PUBLIC_SUPABASE_URL
      anon_sha_prefix = $anonShaPrefix
      built_at_utc    = [DateTime]::UtcNow.ToString('o')
    } | ConvertTo-Json) | Set-Content -LiteralPath $stampPath -Encoding utf8
  } else {
    Write-Host 'Existing .next build matches current HEAD and loopback Supabase proxy; skipping rebuild.'
  }

  & $nodeExe --import ./tests/typescript-alias-loader.mjs scripts/check-runtime-environment.ts runtime
  if ($LASTEXITCODE -ne 0) { throw 'CHECK_RUNTIME_ENV_RUNTIME_FAILED' }
} finally {
  Pop-Location
}

$nextOut = Join-Path $stateDir 'next.log'
$nextErr = Join-Path $stateDir 'next.err.log'
$nextCli = Join-Path $RepositoryRoot 'node_modules\next\dist\bin\next'
$nextProc = Start-Process -FilePath $nodeExe -ArgumentList @("`"$nextCli`"", 'start', '-H', '127.0.0.1', '-p', [string]$NextPort) `
  -WorkingDirectory $RepositoryRoot -RedirectStandardOutput $nextOut -RedirectStandardError $nextErr `
  -WindowStyle Hidden -PassThru

Write-Host "[6/6] Waiting for http://127.0.0.1:$NextPort/login health..."
$nextHealthy = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-HttpOk "http://127.0.0.1:$NextPort/login") {
    $nextHealthy = $true
    break
  }
  Start-Sleep -Milliseconds 500
}
if (-not $nextHealthy) {
  throw "NEXT_HEALTH_FAILED_ON_PORT_$NextPort (check $nextErr)"
}

# Write sanitized health metadata (ZERO secrets/passwords/JWTs)
$healthFile = Join-Path $RepositoryRoot 'scripts\rc19-c4-migration-rehearsal\evidence\w4-final-integration-20261118\local-uat-runtime-health.json'
New-Item -ItemType Directory -Force -Path (Split-Path $healthFile -Parent) | Out-Null
$healthPayload = [ordered]@{
  status            = 'HEALTHY'
  timestamp_utc     = [DateTime]::UtcNow.ToString('o')
  git_head          = $head
  postgres          = [ordered]@{
    host            = '127.0.0.1'
    port            = $pgPort
    database        = $config.database
    database_marker = $marker
    identity        = $dbIdentity
  }
  services          = [ordered]@{
    gotrue          = "http://127.0.0.1:$authPort/health"
    postgrest       = "http://127.0.0.1:$restPort/"
    cors_proxy      = "http://127.0.0.1:$ProxyPort/health"
    next_app        = "http://127.0.0.1:$NextPort/login"
  }
  pids              = [ordered]@{
    cors_proxy_pid  = $proxyProc.Id
    next_app_pid    = $nextProc.Id
  }
  seeded_uat_users  = ($uatUsers | ForEach-Object {
    [ordered]@{
      id                = $_.id
      email             = $_.email
      role              = $_.role
      system_permission = $_.perm
    }
  })
  credentials_note  = 'Passwords and local JWT secret reside strictly in WSL runtime.json (chmod 0600); never stored in repository.'
}
$healthPayload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $healthFile -Encoding utf8

Write-Host "LOCAL_UAT_STACK_READY http://127.0.0.1:$NextPort (db=$($config.database) proxy=http://127.0.0.1:$ProxyPort)"

if ($StayAlive) {
  Write-Host 'Daemon mode (-StayAlive): monitoring local CORS proxy and Next.js server...'
  try {
    while ($true) {
      if ($proxyProc.HasExited) { throw "CORS_PROXY_EXITED_UNEXPECTEDLY exit=$($proxyProc.ExitCode)" }
      if ($nextProc.HasExited) { throw "NEXT_APP_EXITED_UNEXPECTEDLY exit=$($nextProc.ExitCode)" }
      Start-Sleep -Seconds 2
    }
  } finally {
    if (-not $nextProc.HasExited) { Stop-Process -Id $nextProc.Id -Force -ErrorAction SilentlyContinue }
    if (-not $proxyProc.HasExited) { Stop-Process -Id $proxyProc.Id -Force -ErrorAction SilentlyContinue }
  }
}
