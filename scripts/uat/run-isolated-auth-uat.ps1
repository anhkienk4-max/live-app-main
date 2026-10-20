$ErrorActionPreference = 'Stop'
$previousTelemetrySetting = $env:SUPABASE_TELEMETRY_DISABLED
$env:SUPABASE_TELEMETRY_DISABLED = '1'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$releaseSha = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the local release candidate SHA.' }
$pnpmExecutable = if ($env:OS -eq 'Windows_NT') { 'pnpm.cmd' } else { 'pnpm' }
$tempRoot = [IO.Path]::GetTempPath()

$runId = [Guid]::NewGuid().ToString('N')
$projectId = "ada-uat-$($runId.Substring(0, 12))"
$runRoot = Join-Path $tempRoot "ada-ops-auth-uat-$runId"
$supabaseRoot = Join-Path $runRoot 'supabase'
$migrationsRoot = Join-Path $supabaseRoot 'migrations'
$credentialFile = Join-Path $runRoot 'credentials.json'
$evidenceRoot = Join-Path $runRoot 'evidence'
$playwrightOutput = Join-Path $evidenceRoot 'playwright-output'
$nextEnvBackup = Join-Path $runRoot 'next-env.d.ts'
$nextEnvBefore = $null
$stackStarted = $false
$locationPushed = $false
$testsPassed = $false

function Invoke-NativeCaptured([string] $File, [string[]] $Arguments) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $File @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousPreference
  }
  [pscustomobject]@{ Output = @($output); ExitCode = $exitCode }
}

function Invoke-Checked([string] $File, [string[]] $Arguments, [string] $Failure) {
  $native = Invoke-NativeCaptured $File $Arguments
  foreach ($line in $native.Output) {
    $value = [string]$line
    if ($value -match '^\[ENV GUARD\]|^\{"authUsers"|^UAT_SEED_STAGE=|^UAT_BASELINE_REPRODUCTION=|^Running \d+ tests|^\s*(ok|x)\s+\d+|^\s*\d+ (passed|failed|skipped)') {
      Write-Host $value
      Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value $value
    }
    if ($native.ExitCode -ne 0 -and $value -match 'Error:|AuthApiError|PostgrestError|code:|details:|hint:|message:|at .*isolated-authenticated-uat\.spec\.ts|at .*seed-isolated-auth\.mjs') {
      $secrets = @($env:UAT_SUPABASE_ANON_KEY, $env:UAT_SUPABASE_SERVICE_KEY) | Where-Object { $_ }
      if (Test-Path -LiteralPath $credentialFile) {
        $secrets += (Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json | ForEach-Object { @($_.email, $_.password) })
      }
      foreach ($secret in $secrets) { if ($secret) { $value = $value.Replace([string]$secret, '[REDACTED]') } }
      Write-Host "UAT_DIAGNOSTIC=$value"
    }
  }
  if ($native.ExitCode -ne 0) {
    $secrets = @($env:UAT_SUPABASE_ANON_KEY, $env:UAT_SUPABASE_SERVICE_KEY) | Where-Object { $_ }
    if (Test-Path -LiteralPath $credentialFile) {
      $secrets += (Get-Content -LiteralPath $credentialFile -Raw | ConvertFrom-Json | ForEach-Object { @($_.email, $_.password) })
    }
    $safeLines = foreach ($line in $native.Output) {
      $value = [string]$line
      foreach ($secret in $secrets) { if ($secret) { $value = $value.Replace([string]$secret, '[REDACTED]') } }
      if ($value -notmatch '(?i)authorization|bearer|cookie|password|access_token|refresh_token|service.role|anon.key') { $value }
    }
    Set-Content -LiteralPath (Join-Path $evidenceRoot 'command-failure.log') -Value $safeLines
    foreach ($line in $safeLines) { Write-Host "UAT_FAILURE=$line" }
    throw "$Failure (exit $($native.ExitCode))"
  }
}

function Invoke-IsolatedPsql([string] $SqlPath) {
  $query = Invoke-NativeCaptured 'docker' @('ps', '--filter', "label=com.docker.compose.project=$projectId", '--format', '{{.ID}}|{{.Names}}')
  if ($query.ExitCode -ne 0) { throw 'Unable to locate the isolated Supabase database container.' }
  $databaseContainers = @($query.Output | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^([^|]+)\|supabase_db_' })
  if ($databaseContainers.Count -ne 1) { throw 'Expected exactly one database container for the isolated Supabase project.' }
  $containerId = ($databaseContainers[0] -split '\|', 2)[0]
  $containerPath = "/tmp/$([IO.Path]::GetFileName($SqlPath))"
  $copy = Invoke-NativeCaptured 'docker' @('cp', $SqlPath, "${containerId}:$containerPath")
  if ($copy.ExitCode -ne 0) { throw 'Unable to copy SQL into the isolated database container.' }
  Invoke-NativeCaptured 'docker' @('exec', $containerId, 'psql', '-X', '-q', '-t', '-A', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $containerPath)
}

try {
  Push-Location $repoRoot
  $locationPushed = $true
  New-Item -ItemType Directory -Path $migrationsRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot 'next-env.d.ts') -Destination $nextEnvBackup
  $nextEnvBefore = (Get-FileHash -LiteralPath (Join-Path $repoRoot 'next-env.d.ts') -Algorithm SHA256).Hash
  Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Filter '*.sql' |
    Where-Object Name -notin @('20261015154159_rc16k_member_report_read_rls.sql', '20261019000000_live_dashboard_snapshot_binding.sql') |
    Copy-Item -Destination $migrationsRoot
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "RELEASE_SHA=$releaseSha"
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "MIGRATION_COPY_COUNT=$((Get-ChildItem -LiteralPath $migrationsRoot -Filter '*.sql').Count)"
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'MIGRATION_TEMP_PATCH=20261011092015_rc15_shift_rpc_compatibility.sql production-definition guard bypassed only for empty local database; source file unchanged'
  $overlayMigration = Join-Path $repoRoot 'supabase/migrations/20261015154159_rc16k_member_report_read_rls.sql'
  $overlayHash = (Get-FileHash -LiteralPath $overlayMigration -Algorithm SHA256).Hash

  $basePort = $null
  foreach ($candidate in 55420..55820 | Where-Object { $_ % 20 -eq 0 }) {
    $ports = @($candidate..($candidate + 9))
    if ($env:OS -eq 'Windows_NT') {
      $listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $ports -contains $_.LocalPort }
    } else {
      $listening = @($ports | Where-Object {
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $_)
        try { $listener.Start(); $false } catch { $true } finally { $listener.Stop() }
      })
    }
    if (-not $listening) { $basePort = $candidate; break }
  }
  if (-not $basePort) { throw 'No free loopback port block is available for isolated Supabase.' }

  $config = Get-Content (Join-Path $repoRoot 'supabase/config.toml') -Raw
  $config = $config.Replace('project_id = "live-app-main"', "project_id = `"$projectId`"")
  foreach ($mapping in @(
    @{ From = 'port = 54321'; To = "port = $($basePort + 1)" },
    @{ From = 'port = 54322'; To = "port = $($basePort + 2)" },
    @{ From = 'shadow_port = 54320'; To = "shadow_port = $basePort" },
    @{ From = 'port = 54329'; To = "port = $($basePort + 9)" },
    @{ From = 'port = 54323'; To = "port = $($basePort + 3)" },
    @{ From = 'port = 54324'; To = "port = $($basePort + 4)" },
    @{ From = 'port = 54327'; To = "port = $($basePort + 7)" }
  )) { $config = $config.Replace($mapping.From, $mapping.To) }
  Set-Content -LiteralPath (Join-Path $supabaseRoot 'config.toml') -Value $config -NoNewline

  $guardPath = Join-Path $migrationsRoot '20261011092015_rc15_shift_rpc_compatibility.sql'
  $migration = Get-Content $guardPath -Raw
  $guardPattern = '(?s)do \$rpc_guard\$.*?\$rpc_guard\$;'
  $guardMatches = [regex]::Matches($migration, $guardPattern)
  if ($guardMatches.Count -ne 1 -or $migration -notmatch 'RC15_SHIFT_RPC_DEFINITION_DRIFT') {
    throw 'Expected RC15 production-definition guard was not found uniquely in the temporary migration copy.'
  }
  # The guard compares the pre-existing Production schema, so it does not apply to this empty local database.
  $replacement = "do `$rpc_guard`$ begin raise notice 'isolated empty database: production definition guard is not applicable'; end `$rpc_guard`$;"
  $migration = [regex]::Replace($migration, $guardPattern, $replacement, 1)
  Set-Content -LiteralPath $guardPath -Value $migration -NoNewline

  $stackStarted = $true
  Write-Host 'UAT_STAGE=starting_local_supabase'
  $start = Invoke-NativeCaptured $pnpmExecutable @('dlx', 'supabase@2.120.0', '--workdir', $runRoot, 'start', '--exclude', 'studio,edge-runtime,logflare,vector,supavisor')
  if ($start.ExitCode -ne 0) {
    $diagnostics = @($start.Output | ForEach-Object { [string]$_ } |
      Where-Object { $_ -match '(?i)error|failed|migration|postgres|container|port' -and $_ -notmatch '(?i)key|token|secret|password|authorization|bearer|cookie' } |
      Select-Object -Last 20)
    Set-Content -LiteralPath (Join-Path $evidenceRoot 'supabase-start-failure.log') -Value $diagnostics
    $diagnostics | ForEach-Object { Write-Host "UAT_START_FAILURE=$_" }
    throw "Supabase Local failed to start or apply its isolated migration copy (exit $($start.ExitCode))."
  }

  Write-Host 'UAT_STAGE=seeding_synthetic_auth_and_data'
  $statusResult = Invoke-NativeCaptured $pnpmExecutable @('dlx', 'supabase@2.120.0', '--workdir', $runRoot, 'status', '-o', 'json')
  if ($statusResult.ExitCode -ne 0) { throw 'Unable to read isolated Supabase Local status.' }
  $statusLines = @($statusResult.Output | ForEach-Object { [string]$_ })
  $jsonStart = -1
  $jsonEnd = -1
  for ($index = 0; $index -lt $statusLines.Count; $index++) {
    if ($jsonStart -lt 0 -and $statusLines[$index].Trim() -eq '{') { $jsonStart = $index }
    if ($statusLines[$index].Trim() -eq '}') { $jsonEnd = $index }
  }
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) { throw 'Supabase Local returned no parseable status object.' }
  $statusOutput = $statusLines[$jsonStart..$jsonEnd]
  $status = ($statusOutput -join "`n") | ConvertFrom-Json
  $localTarget = [Uri]$status.API_URL
  if ($localTarget.Scheme -ne 'http' -or $localTarget.Host -notin @('127.0.0.1', 'localhost')) {
    throw 'Supabase CLI returned a non-loopback target; refusing to seed.'
  }

  $env:UAT_SUPABASE_URL = $status.API_URL
  $env:UAT_SUPABASE_ANON_KEY = $status.ANON_KEY
  $env:UAT_SUPABASE_SERVICE_KEY = $status.SERVICE_ROLE_KEY
  $env:UAT_CREDENTIALS_FILE = $credentialFile
  $env:UAT_EVIDENCE_DIR = $evidenceRoot
  $env:UAT_RELEASE_CANDIDATE_SHA = $releaseSha
  $env:NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  $env:NEXT_PUBLIC_SUPABASE_URL = $status.API_URL
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $status.ANON_KEY
  $env:SUPABASE_URL = $status.API_URL
  $env:SUPABASE_SECRET_KEY = $status.SERVICE_ROLE_KEY

  Invoke-Checked 'node' @((Join-Path $repoRoot 'scripts/uat/seed-isolated-auth.mjs')) 'Synthetic local UAT seeding failed.'
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "BASELINE_READ_REPRODUCTION=baseline-report-read-reproduction.json; migration excluded before this probe"

  $migrationBody = Get-Content -LiteralPath $overlayMigration -Raw
  $migrationBody = [regex]::Replace($migrationBody, '(?im)^\s*begin;\s*', '', 1)
  $migrationBody = [regex]::Replace($migrationBody, '(?im)^\s*commit;\s*$', '', 1)
  $rollbackSql = [string]::Concat(
    'begin; savepoint rc16k_report_read;', [Environment]::NewLine,
    $migrationBody, [Environment]::NewLine,
    'rollback to savepoint rc16k_report_read;', [Environment]::NewLine,
    'do $rollback_assert$ begin ',
    'if to_regprocedure(''private.can_read_report(text,text)'') is not null then raise exception ''ROLLBACK_LEFT_REPORT_HELPER''; end if; ',
    'if (select qual like ''%can_read_report%'' from pg_policies where schemaname=''public'' and tablename=''reports'' and policyname=''reports_active_select'') then raise exception ''ROLLBACK_LEFT_REPORT_POLICY''; end if; ',
    'if (select pg_get_functiondef(''public.get_report_revisions(text)''::regprocedure) like ''%can_read_report%'') then raise exception ''ROLLBACK_LEFT_REPORT_REVISION_RPC''; end if; ',
    'raise notice ''REPORT_RLS_ROLLBACK_SAVEPOINT=PASS''; end $rollback_assert$; commit;'
  )
  $rollbackPath = Join-Path $runRoot 'report-read-rollback-rehearsal.sql'
  Set-Content -LiteralPath $rollbackPath -Value $rollbackSql -NoNewline
  $rollback = Invoke-IsolatedPsql $rollbackPath
  if ($rollback.ExitCode -ne 0 -or -not (($rollback.Output -join "`n") -match 'REPORT_RLS_ROLLBACK_SAVEPOINT=PASS')) { throw 'Migration transactional rollback rehearsal failed.' }
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'MIGRATION_ROLLBACK=PASS; candidate DDL applied inside a savepoint, rolled back, and baseline policy/function state restored'

  Copy-Item -LiteralPath $overlayMigration -Destination $migrationsRoot
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "FORWARD_MIGRATION_SHA256=$overlayHash"
  Invoke-Checked $pnpmExecutable @('dlx', 'supabase@2.120.0', '--workdir', $runRoot, 'migration', 'up', '--local', '--include-all', '--yes') 'Forward-only report read migration rehearsal failed.'
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'FORWARD_MIGRATION_REHEARSAL=applied through Supabase CLI migration history on isolated local database'
  # Rehearse M2 compensation before M3 depends on its read helper.
  # A savepoint restores scoped M2 security before applying M3 and running UAT.
  $compensatingRollbackPath = Join-Path $repoRoot 'scripts/uat/report-read-compensating-rollback.sql'
  $compensatingBody = Get-Content -LiteralPath $compensatingRollbackPath -Raw
  $compensatingBody = [regex]::Replace($compensatingBody, '(?im)^\s*begin;\s*', '', 1)
  $compensatingBody = [regex]::Replace($compensatingBody, '(?im)^\s*commit;\s*$', '', 1)
  $compensatingSql = @(
    'begin;'
    'savepoint rc16k_compensating_read;'
    $compensatingBody
    'rollback to savepoint rc16k_compensating_read;'
    'do $compensation_restored$'
    'begin'
    '  if to_regprocedure(''private.can_read_report(text,text)'') is null then raise exception ''REPORT_HELPER_NOT_RESTORED''; end if;'
    '  if not exists (select 1 from pg_policies where schemaname = ''public'' and tablename = ''reports'' and policyname = ''reports_active_select'' and qual like ''%can_read_report%'') then raise exception ''REPORT_SCOPED_READ_NOT_RESTORED''; end if;'
    '  if not pg_get_functiondef(''public.get_report_revisions(text)''::regprocedure) like ''%can_read_report%'' then raise exception ''REVISION_RPC_SCOPE_NOT_RESTORED''; end if;'
    '  if not has_function_privilege(''authenticated'', ''private.can_read_report(text,text)'', ''EXECUTE'') or has_function_privilege(''anon'', ''private.can_read_report(text,text)'', ''EXECUTE'') or has_function_privilege(''service_role'', ''private.can_read_report(text,text)'', ''EXECUTE'') then raise exception ''REPORT_HELPER_ACL_NOT_RESTORED''; end if;'
    '  if exists (select 1 from pg_policies where schemaname = ''public'' and tablename = ''dashboard_updates'' and policyname = ''dashboard_updates_scoped_read'') then raise exception ''LIVE_SNAPSHOT_APPLIED_BEFORE_COMPENSATION''; end if;'
    '  raise notice ''REPORT_RLS_COMPENSATION_RESTORED=PASS'';'
    'end;'
    '$compensation_restored$;'
    'commit;'
  ) -join [Environment]::NewLine
  $compensatingPath = Join-Path $runRoot 'report-read-compensation-rehearsal.sql'
  Set-Content -LiteralPath $compensatingPath -Value $compensatingSql -NoNewline
  $compensatingRollback = Invoke-IsolatedPsql $compensatingPath
  $compensatingText = $compensatingRollback.Output -join [Environment]::NewLine
  if ($compensatingRollback.ExitCode -ne 0 -or $compensatingText -notmatch 'REPORT_RLS_COMPENSATING_ROLLBACK=PASS' -or $compensatingText -notmatch 'REPORT_RLS_COMPENSATION_RESTORED=PASS') {
    $rollbackDiagnostics = @('PSQL_EXIT_CODE=' + $compensatingRollback.ExitCode) + @($compensatingRollback.Output | ForEach-Object { [string]$_ }) |
      Where-Object { $_ -notmatch '(?i)authorization|bearer|cookie|password|access_token|refresh_token|service.role|anon.key' }
    Set-Content -LiteralPath (Join-Path $evidenceRoot 'migration-compensating-rollback-failure.log') -Value $rollbackDiagnostics
    foreach ($line in $rollbackDiagnostics) { Write-Host "UAT_ROLLBACK_FAILURE=$line" }
    throw 'Pre-Live-Snapshot M2 compensating rollback rehearsal failed.'
  }
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'migration-compensating-rollback.log') -Value $compensatingRollback.Output
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'M2_COMPENSATION=PASS; pre-M3 compensation verified then reverted in savepoint; scoped M2 RLS retained for M3 and UAT'
  Copy-Item -LiteralPath (Join-Path $repoRoot 'supabase/migrations/20261019000000_live_dashboard_snapshot_binding.sql') -Destination $migrationsRoot
  Invoke-Checked $pnpmExecutable @('dlx', 'supabase@2.120.0', '--workdir', $runRoot, 'migration', 'up', '--local', '--yes') 'Live snapshot migration rehearsal failed.'
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'LIVE_SNAPSHOT_MIGRATION=applied after report read-RLS on isolated local database'

  $postconditionsSql = @'
do $report_read_assert$
begin
  if exists (
    select 1 from (values
      ('reports'::text), ('report_revisions'), ('report_images'), ('live_report_images')
    ) as expected(table_name)
    join pg_class relation on relation.oid = format('public.%I', expected.table_name)::regclass
    where not relation.relrowsecurity
  ) then raise exception 'REPORT_FAMILY_RLS_DISABLED'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='reports' and cmd='SELECT' and roles @> array['authenticated'::name]) <> 2
    then raise exception 'REPORT_SELECT_POLICY_COUNT_DRIFT'; end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='report_revisions' and cmd='SELECT' and roles @> array['authenticated'::name]) <> 1
    or (select count(*) from pg_policies where schemaname='public' and tablename='report_images' and cmd='SELECT' and roles @> array['authenticated'::name]) <> 1
    or (select count(*) from pg_policies where schemaname='public' and tablename='live_report_images' and cmd='SELECT' and roles @> array['authenticated'::name]) <> 1
    then raise exception 'REPORT_CHILD_SELECT_POLICY_COUNT_DRIFT'; end if;
  if not has_function_privilege('authenticated', 'private.can_read_report(text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'private.can_read_report(text,text)', 'EXECUTE')
    or has_function_privilege('service_role', 'private.can_read_report(text,text)', 'EXECUTE')
    then raise exception 'REPORT_SCOPE_HELPER_GRANTS_DRIFT'; end if;
  if not has_function_privilege('authenticated', 'public.get_report_revisions(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_report_revisions(text)', 'EXECUTE')
    then raise exception 'REPORT_REVISION_RPC_GRANTS_DRIFT'; end if;
  if exists (
    select 1 from pg_proc function
    where function.oid in ('private.can_read_report(text,text)'::regprocedure, 'public.get_report_revisions(text)'::regprocedure)
      and (not function.prosecdef or function.proconfig is distinct from array['search_path=""']::text[] or pg_get_userbyid(function.proowner) is null)
  ) then raise exception 'REPORT_READ_FUNCTION_SECURITY_DRIFT'; end if;
end;
$report_read_assert$;
select json_build_object(
  'migration_version', (select version from supabase_migrations.schema_migrations where version='20261015154159'),
  'report_rls_enabled', (select relrowsecurity from pg_class where oid='public.reports'::regclass),
  'report_select_policies', (select json_agg(json_build_object('name', policyname, 'roles', roles, 'definition', qual)) from pg_policies where schemaname='public' and tablename='reports' and cmd='SELECT'),
  'revision_rpc_owner', (select pg_get_userbyid(proowner) from pg_proc where oid='public.get_report_revisions(text)'::regprocedure),
  'revision_rpc_acl', (select proacl from pg_proc where oid='public.get_report_revisions(text)'::regprocedure),
  'revision_rpc_security_definer', (select prosecdef from pg_proc where oid='public.get_report_revisions(text)'::regprocedure),
  'revision_rpc_search_path', (select proconfig from pg_proc where oid='public.get_report_revisions(text)'::regprocedure),
  'helper_acl', (select proacl from pg_proc where oid='private.can_read_report(text,text)'::regprocedure),
  'revision_rpc_authenticated_execute', has_function_privilege('authenticated', 'public.get_report_revisions(text)', 'EXECUTE'),
  'revision_rpc_anon_execute', has_function_privilege('anon', 'public.get_report_revisions(text)', 'EXECUTE')
) as report_read_postconditions;
'@
  $postconditionsPath = Join-Path $runRoot 'report-read-postconditions.sql'
  Set-Content -LiteralPath $postconditionsPath -Value $postconditionsSql -NoNewline
  $postconditions = Invoke-IsolatedPsql $postconditionsPath
  if ($postconditions.ExitCode -ne 0) { throw 'Migration policy/grant/owner postconditions failed.' }
  Set-Content -LiteralPath (Join-Path $evidenceRoot 'migration-postconditions.json') -Value $postconditions.Output
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value 'MIGRATION_POSTCONDITIONS=PASS; policy set, RLS, grants, owner, SECURITY DEFINER, and search_path asserted'

  Invoke-Checked 'node' @('--import', './tests/typescript-alias-loader.mjs', 'scripts/check-runtime-environment.ts', 'development') 'Local Supabase environment validation failed.'
  $playwrightArguments = @('exec', 'playwright', 'test', '--config=playwright.isolated-auth-uat.config.ts')
  if ($env:UAT_TEST_GREP) { $playwrightArguments += @('--grep', $env:UAT_TEST_GREP) }
  Invoke-Checked $pnpmExecutable $playwrightArguments 'Authenticated isolated Playwright UAT failed.'

  $testsPassed = $true

  Write-Host "UAT_SHA=$releaseSha"
  Write-Host "UAT_EVIDENCE=$evidenceRoot"
} finally {
  foreach ($name in @('UAT_SUPABASE_URL', 'UAT_SUPABASE_ANON_KEY', 'UAT_SUPABASE_SERVICE_KEY', 'UAT_CREDENTIALS_FILE', 'UAT_EVIDENCE_DIR', 'UAT_RELEASE_CANDIDATE_SHA', 'NEXT_PUBLIC_USE_MOCK_DATA', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY')) {
    Remove-Item "Env:\$name" -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $credentialFile) { Remove-Item -LiteralPath $credentialFile -Force }
  if ($stackStarted) {
    $null = Invoke-NativeCaptured $pnpmExecutable @('dlx', 'supabase@2.120.0', '--workdir', $runRoot, 'stop', '--no-backup')
  }
  $containerQuery = Invoke-NativeCaptured 'docker' @('ps', '-aq', '--filter', "label=com.docker.compose.project=$projectId")
  $stackContainers = if ($containerQuery.ExitCode -eq 0) { @($containerQuery.Output | Where-Object { $_ }) } else { @() }
  if ($stackContainers.Count -gt 0) { $null = Invoke-NativeCaptured 'docker' (@('rm', '-f') + $stackContainers) }
  $volumeQuery = Invoke-NativeCaptured 'docker' @('volume', 'ls', '-q', '--filter', "label=com.docker.compose.project=$projectId")
  $stackVolumes = if ($volumeQuery.ExitCode -eq 0) { @($volumeQuery.Output | Where-Object { $_ }) } else { @() }
  if ($stackVolumes.Count -gt 0) { $null = Invoke-NativeCaptured 'docker' (@('volume', 'rm') + $stackVolumes) }
  if (Test-Path -LiteralPath $playwrightOutput) {
    $resolvedOutput = (Resolve-Path -LiteralPath $playwrightOutput).Path
    if (-not $resolvedOutput.StartsWith($runRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove Playwright output outside the isolated UAT run root.' }
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
  }
  $remainingContainerQuery = Invoke-NativeCaptured 'docker' @('ps', '-aq', '--filter', "label=com.docker.compose.project=$projectId")
  $remainingContainers = if ($remainingContainerQuery.ExitCode -eq 0) { @($remainingContainerQuery.Output | Where-Object { $_ }) } else { @('DOCKER_UNAVAILABLE') }
  $remainingVolumeQuery = Invoke-NativeCaptured 'docker' @('volume', 'ls', '-q', '--filter', "label=com.docker.compose.project=$projectId")
  $remainingVolumes = if ($remainingVolumeQuery.ExitCode -eq 0) { @($remainingVolumeQuery.Output | Where-Object { $_ }) } else { @('DOCKER_UNAVAILABLE') }
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "CLEANUP_REMAINING_CONTAINERS=$($remainingContainers.Count)"
  Add-Content -LiteralPath (Join-Path $evidenceRoot 'uat-run.log') -Value "CLEANUP_REMAINING_VOLUMES=$($remainingVolumes.Count)"
  $nextEnvPath = Join-Path $repoRoot 'next-env.d.ts'
  if ($nextEnvBefore -and (Test-Path -LiteralPath $nextEnvPath)) {
    $nextEnvCurrent = (Get-FileHash -LiteralPath $nextEnvPath -Algorithm SHA256).Hash
    $generatedNextEnv = (Get-Content -LiteralPath $nextEnvPath -Raw) -match '\.next/dev/types/routes\.d\.ts'
    if ($nextEnvCurrent -ne $nextEnvBefore -and $generatedNextEnv) {
      Copy-Item -LiteralPath $nextEnvBackup -Destination $nextEnvPath -Force
    } elseif ($nextEnvCurrent -ne $nextEnvBefore) {
      Write-Warning 'next-env.d.ts changed unexpectedly; preserved it for manual review.'
    }
  }
  if ($locationPushed) { Pop-Location }
  if ($null -eq $previousTelemetrySetting) {
    Remove-Item Env:SUPABASE_TELEMETRY_DISABLED -ErrorAction SilentlyContinue
  } else {
    $env:SUPABASE_TELEMETRY_DISABLED = $previousTelemetrySetting
  }
  if (Test-Path -LiteralPath $evidenceRoot) {
    $evidenceState = if ($testsPassed) { 'pass' } else { 'failed' }
    $durableEvidence = Join-Path $repoRoot "docs/release/evidence/uat-security-$($releaseSha.Substring(0, 7))-$evidenceState-$runId"
    New-Item -ItemType Directory -Path $durableEvidence -Force | Out-Null
    Copy-Item -Path (Join-Path $evidenceRoot '*') -Destination $durableEvidence -Recurse
    $manifest = Get-ChildItem -LiteralPath $durableEvidence -File |
      Where-Object Name -ne 'manifest.sha256' |
      ForEach-Object { "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash )  $($_.Name)" }
    Set-Content -LiteralPath (Join-Path $durableEvidence 'manifest.sha256') -Value $manifest
    Write-Host "UAT_DURABLE_EVIDENCE=$durableEvidence"
  }
  if (Test-Path -LiteralPath $runRoot) {
    $resolvedRunRoot = (Resolve-Path -LiteralPath $runRoot).Path
    $resolvedTemp = (Resolve-Path -LiteralPath $tempRoot).Path
    if (-not $resolvedRunRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to remove UAT temporary files outside the Temp directory.' }
    Remove-Item -LiteralPath $resolvedRunRoot -Recurse -Force
  }
}
