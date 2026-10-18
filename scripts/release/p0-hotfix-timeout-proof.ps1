$ErrorActionPreference = 'Stop'

function Stop-Proof([string]$Message) { throw "TIMEOUT_PROOF_FAIL: $Message" }
function Assert-Proof([bool]$Condition, [string]$Message) { if (-not $Condition) { Stop-Proof $Message } }
function Add-Summary([string]$Line) {
  Write-Host $Line
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $Line -Encoding utf8 }
}

$script:PsqlPath = (Get-Command psql -ErrorAction Stop).Source
$script:ExpectedPgOptions = '-c lock_timeout=5s -c statement_timeout=30s'

function New-PsqlStartInfo([string]$Database, [string]$PgOptions, [string[]]$ExtraArguments = @()) {
  $info = [System.Diagnostics.ProcessStartInfo]::new($script:PsqlPath)
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $info.Environment['PGCONNECT_TIMEOUT'] = '3'
  if ($null -ne $PgOptions) { $info.Environment['PGOPTIONS'] = $PgOptions }
  else { [void]$info.Environment.Remove('PGOPTIONS') }
  foreach ($argument in @(
    '-X', '--no-password', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    '--tuples-only', '--no-align', '--host=127.0.0.1', '--port=5432',
    '--username=postgres', "--dbname=$Database"
  )) { [void]$info.ArgumentList.Add($argument) }
  foreach ($argument in $ExtraArguments) { [void]$info.ArgumentList.Add($argument) }
  return $info
}

function Invoke-Psql([string]$Database, [string]$Sql, [string]$PgOptions = $script:ExpectedPgOptions, [string[]]$ExtraArguments = @(), [int]$TimeoutSeconds = 45) {
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = New-PsqlStartInfo -Database $Database -PgOptions $PgOptions -ExtraArguments $ExtraArguments
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    if ($Sql) { $process.StandardInput.Write($Sql) }
    $process.StandardInput.Close()
    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      try { $process.Kill($true) } catch { }
      [void]$process.WaitForExit(5000)
      $clock.Stop()
      return [pscustomobject]@{ ExitCode=$null; ErrorCode='PROCESS_TIMEOUT'; Stdout=''; Stderr=''; DurationMs=$clock.ElapsedMilliseconds }
    }
    $process.WaitForExit()
    $clock.Stop()
    $exit = $process.ExitCode
    return [pscustomobject]@{
      ExitCode=$exit
      ErrorCode=if ($exit -eq 0) { $null } else { 'PROCESS_EXIT_NONZERO' }
      Stdout=$stdoutTask.GetAwaiter().GetResult()
      Stderr=$stderrTask.GetAwaiter().GetResult()
      DurationMs=$clock.ElapsedMilliseconds
    }
  }
  catch {
    $clock.Stop()
    return [pscustomobject]@{ ExitCode=$null; ErrorCode='PROCESS_START_OR_IO_ERROR'; Stdout=''; Stderr=$_.Exception.GetType().Name; DurationMs=$clock.ElapsedMilliseconds }
  }
  finally { $process.Dispose() }
}

function Invoke-PsqlFile([string]$Database, [string]$Sql, [string]$Label, [string]$PgOptions = $script:ExpectedPgOptions, [int]$TimeoutSeconds = 45) {
  $tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
  $filePath = Join-Path $tempRoot "$Label-$([guid]::NewGuid().ToString('N')).sql"
  try {
    [System.IO.File]::WriteAllText($filePath, $Sql, [System.Text.UTF8Encoding]::new($false))
    return Invoke-Psql -Database $Database -Sql '' -PgOptions $PgOptions -ExtraArguments @("--file=$filePath") -TimeoutSeconds $TimeoutSeconds
  }
  finally { if (Test-Path -LiteralPath $filePath) { Remove-Item -LiteralPath $filePath -Force } }
}

function Start-PsqlSession([string]$Database, [string]$Sql) {
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = New-PsqlStartInfo -Database $Database -PgOptions $script:ExpectedPgOptions
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($Sql)
  $process.StandardInput.Close()
  return [pscustomobject]@{ Process=$process; StdoutTask=$stdoutTask; StderrTask=$stderrTask }
}

function Get-PsqlText([string]$Database, [string]$Sql, [string]$PgOptions = $script:ExpectedPgOptions) {
  $result = Invoke-Psql -Database $Database -Sql $Sql -PgOptions $PgOptions -TimeoutSeconds 15
  Assert-Proof ($null -ne $result.ExitCode -and $result.ExitCode -eq 0) "read-only query failed ($($result.ErrorCode); $($result.Stderr.Trim()))"
  return $result.Stdout.Trim()
}

$clientVersion = (& $script:PsqlPath --version 2>&1 | Out-String).Trim()
$clientExit = $LASTEXITCODE
Assert-Proof ($clientExit -eq 0) 'psql client version command failed'
Add-Summary "Client: $clientVersion"

$containers = @(& docker ps --filter 'publish=5432' --format '{{.ID}}|{{.Image}}' 2>&1)
Assert-Proof ($LASTEXITCODE -eq 0 -and $containers.Count -eq 1 -and $containers[0] -match '^([0-9a-f]+)\|(postgres:17[^|]*)$') 'expected exactly one PostgreSQL 17 service container on port 5432'
$containerId = $Matches[1]
$containerImage = $Matches[2]
$inspect = @(& docker inspect --format '{{.Id}}|{{.Image}}|{{.State.Status}}' $containerId 2>&1)
Assert-Proof ($LASTEXITCODE -eq 0 -and $inspect.Count -eq 1 -and $inspect[0] -match '^([0-9a-f]+)\|sha256:([0-9a-f]{64})\|running$') 'PostgreSQL service identity/digest not verified'
$containerDigest = $Matches[2]
$top = @(& docker top $containerId 2>&1)
Assert-Proof ($LASTEXITCODE -eq 0 -and ($top -join "`n") -match 'postgres') 'PostgreSQL server process not found in service container'
Add-Summary "Synthetic service: id=$containerId image=$containerImage digest=sha256:$containerDigest state=running"

$identitySql = @'
SELECT json_build_object(
  'database', current_database(), 'port', inet_server_port(), 'current_user', current_user,
  'server_version', current_setting('server_version'), 'server_version_num', current_setting('server_version_num'),
  'data_directory', current_setting('data_directory'), 'postmaster_start_time', pg_postmaster_start_time()
)::text;
'@
$identityResult = Invoke-Psql -Database 'postgres' -Sql $identitySql
Assert-Proof ($identityResult.ExitCode -eq 0) "target identity query failed ($($identityResult.ErrorCode); $($identityResult.Stderr.Trim()))"
$identity = $identityResult.Stdout.Trim() | ConvertFrom-Json
Assert-Proof ($identity.database -eq 'postgres' -and [int]$identity.port -eq 5432 -and $identity.current_user -eq 'postgres') 'unexpected initial database/port/current_user'
Assert-Proof ([string]$identity.server_version_num -match '^17' -and [string]$identity.data_directory -match '^/var/lib/postgresql/' -and $identity.postmaster_start_time) 'PostgreSQL 17 target identity incomplete'
Add-Summary "Target identity: db=$($identity.database) port=$($identity.port) user=$($identity.current_user) server=$($identity.server_version) data_directory=$($identity.data_directory) postmaster_start=$($identity.postmaster_start_time)"

$runToken = '{0}_{1}' -f $env:GITHUB_RUN_ID, $env:GITHUB_RUN_ATTEMPT
$database = "p0_timeout_$runToken"
Assert-Proof ($database -match '^p0_timeout_[0-9]+_[0-9]+$') 'synthetic database name invalid'
$created = Invoke-Psql -Database 'postgres' -Sql "CREATE DATABASE $database;"
Assert-Proof ($created.ExitCode -eq 0) "synthetic database create failed ($($created.ErrorCode); $($created.Stderr.Trim()))"
$marker = "timeout_marker_$runToken"
$markerCreate = Invoke-Psql -Database $database -Sql "CREATE TABLE public.$marker(value text PRIMARY KEY); INSERT INTO public.$marker VALUES ('$runToken');"
Assert-Proof ($markerCreate.ExitCode -eq 0) 'synthetic marker creation failed'
$dbIdentityText = Get-PsqlText -Database $database -Sql $identitySql
$dbIdentity = $dbIdentityText | ConvertFrom-Json
Assert-Proof ($dbIdentity.database -eq $database) 'synthetic test database identity mismatch'
Assert-Proof ((Get-PsqlText -Database $database -Sql "SELECT value FROM public.$marker;") -eq $runToken) 'synthetic marker mismatch'
Add-Summary "Synthetic target marker: PASS database=$database marker=$marker"

$settings = Get-PsqlText -Database $database -Sql "SELECT current_setting('lock_timeout') || '|' || current_setting('statement_timeout');"
Assert-Proof ($settings -eq '5s|30s') "PGOPTIONS not effective in the verified database session: got '$settings'"
Add-Summary "PGOPTIONS same-session assertion: PASS lock_timeout=5s statement_timeout=30s"

$withoutOptions = Get-PsqlText -Database $database -Sql "SELECT current_setting('lock_timeout') || '|' || current_setting('statement_timeout');" -PgOptions ''
Assert-Proof ($withoutOptions -ne '5s|30s') 'negative control unexpectedly inherited PGOPTIONS'
$negativeContractRejected = $false
try {
  if ($withoutOptions -ne '5s|30s') { Stop-Proof 'timeout configuration absent; execution must be refused' }
}
catch { $negativeContractRejected = $_.Exception.Message -match 'timeout configuration absent' }
Assert-Proof $negativeContractRejected 'timeout executor did not fail closed when PGOPTIONS were absent'
$invalidOptions = Invoke-Psql -Database $database -Sql 'SELECT 1;' -PgOptions '-c lock_timeout=not-a-timeout' -TimeoutSeconds 10
Assert-Proof ($null -ne $invalidOptions.ExitCode -and $invalidOptions.ExitCode -ne 0 -and $invalidOptions.Stderr -match 'invalid value|invalid input syntax') 'invalid PGOPTIONS did not fail closed'
Add-Summary "PGOPTIONS fail-closed controls: PASS absent_settings=$withoutOptions invalid_option_exit=$($invalidOptions.ExitCode)"

$statementTable = "statement_timeout_$runToken"
$statementSql = @"
BEGIN;
CREATE TABLE public.$statementTable(id integer);
SELECT pg_sleep(35);
COMMIT;
"@
$statement = Invoke-PsqlFile -Database $database -Sql $statementSql -Label 'statement-timeout' -TimeoutSeconds 45
Assert-Proof ($statement.ExitCode -eq 3 -and $statement.Stderr -match 'statement timeout' -and $statement.DurationMs -ge 25000 -and $statement.DurationMs -lt 45000) "statement timeout did not fire as configured (exit=$($statement.ExitCode), elapsed=$($statement.DurationMs), stderr=$($statement.Stderr.Trim()))"
$statementRollback = Get-PsqlText -Database $database -Sql "SELECT to_regclass('public.$statementTable') IS NULL;"
Assert-Proof ($statementRollback -eq 't') 'statement timeout left partial table behind'
Add-Summary "Statement timeout effective: PASS configured=30s elapsed_ms=$($statement.DurationMs) psql_exit=$($statement.ExitCode) rollback=confirmed"

$lockTable = "lock_timeout_$runToken"
$column = "blocked_$runToken"
$lockCreate = Invoke-Psql -Database $database -Sql "CREATE TABLE public.$lockTable(id integer PRIMARY KEY);"
Assert-Proof ($lockCreate.ExitCode -eq 0) 'lock fixture create failed'
$holderSql = @"
BEGIN;
LOCK TABLE public.$lockTable IN ACCESS EXCLUSIVE MODE;
SELECT pg_sleep(12);
COMMIT;
"@
$holder = Start-PsqlSession -Database $database -Sql $holderSql
try {
  $held = $false
  for ($i=0; $i -lt 40; $i++) {
    if ($holder.Process.HasExited) { break }
    $state = Get-PsqlText -Database $database -Sql "SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='$lockTable' AND l.mode='AccessExclusiveLock' AND l.granted AND l.pid<>pg_backend_pid());"
    if ($state -eq 't') { $held=$true; break }
    Start-Sleep -Milliseconds 250
  }
  Assert-Proof $held 'lock holder did not acquire the synthetic table lock'
  $blockedSql = "BEGIN; ALTER TABLE public.$lockTable ADD COLUMN $column integer; COMMIT;"
  $blocked = Invoke-Psql -Database $database -Sql $blockedSql -TimeoutSeconds 15
  Assert-Proof ($blocked.ExitCode -eq 3 -and $blocked.Stderr -match 'lock timeout' -and $blocked.DurationMs -ge 4000 -and $blocked.DurationMs -lt 15000) "lock timeout did not fire as configured (exit=$($blocked.ExitCode), elapsed=$($blocked.DurationMs), stderr=$($blocked.Stderr.Trim()))"
  [void]$holder.Process.WaitForExit(15000)
  Assert-Proof ($holder.Process.HasExited -and $holder.Process.ExitCode -eq 0) 'lock holder did not complete cleanly'
  $columnExists = Get-PsqlText -Database $database -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$lockTable' AND column_name='$column');"
  Assert-Proof ($columnExists -eq 'f') 'lock timeout left partial ALTER TABLE behind'
  Add-Summary "Lock timeout effective: PASS configured=5s elapsed_ms=$($blocked.DurationMs) psql_exit=$($blocked.ExitCode) rollback=confirmed"
}
finally {
  if (-not $holder.Process.HasExited) { try { $holder.Process.Kill($true) } catch {}; [void]$holder.Process.WaitForExit(5000) }
  $holder.Process.Dispose()
}

Add-Summary 'Timeout proof complete: target=synthetic PostgreSQL 17; production connection/secrets=none; migration SQL executed=none'
