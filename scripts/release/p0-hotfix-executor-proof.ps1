$ErrorActionPreference = 'Stop'

function Stop-Proof([string]$Message) {
  throw "EXECUTOR_PROOF_FAIL: $Message"
}

function Assert-Proof([bool]$Condition, [string]$Message) {
  if (-not $Condition) { Stop-Proof $Message }
}

function Add-Summary([string]$Line) {
  Write-Host $Line
  if ($env:GITHUB_STEP_SUMMARY) {
    Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Value $Line -Encoding utf8
  }
}

function New-PsqlStartInfo([string]$Database, [int]$Port) {
  $info = [System.Diagnostics.ProcessStartInfo]::new($script:PsqlPath)
  $info.UseShellExecute = $false
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.CreateNoWindow = $true
  $info.Environment['PGCONNECT_TIMEOUT'] = '3'
  foreach ($argument in @(
    '-X', '--no-password', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    '--tuples-only', '--no-align', '--host=127.0.0.1', "--port=$Port",
    '--username=postgres', "--dbname=$Database"
  )) {
    [void]$info.ArgumentList.Add($argument)
  }
  return $info
}

function Invoke-Psql([string]$Database, [string]$Sql, [int]$TimeoutSeconds = 15, [int]$Port = 5432) {
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = New-PsqlStartInfo -Database $Database -Port $Port
  $clock = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    [void]$process.Start()
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($Sql)
    $process.StandardInput.Close()

    if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
      try { $process.Kill($true) } catch { }
      [void]$process.WaitForExit(5000)
      $clock.Stop()
      return [pscustomobject]@{
        ExitCode = $null
        ErrorCode = 'PROCESS_TIMEOUT'
        Stdout = if ($stdoutTask.IsCompleted) { $stdoutTask.GetAwaiter().GetResult() } else { '' }
        Stderr = if ($stderrTask.IsCompleted) { $stderrTask.GetAwaiter().GetResult() } else { '' }
        DurationMs = $clock.ElapsedMilliseconds
      }
    }

    $process.WaitForExit()
    $clock.Stop()
    $exitCode = $process.ExitCode
    return [pscustomobject]@{
      ExitCode = $exitCode
      ErrorCode = if ($exitCode -eq 0) { $null } else { 'PROCESS_EXIT_NONZERO' }
      Stdout = $stdoutTask.GetAwaiter().GetResult()
      Stderr = $stderrTask.GetAwaiter().GetResult()
      DurationMs = $clock.ElapsedMilliseconds
    }
  }
  catch {
    $clock.Stop()
    return [pscustomobject]@{
      ExitCode = $null
      ErrorCode = 'PROCESS_START_OR_IO_ERROR'
      Stdout = ''
      Stderr = $_.Exception.GetType().Name
      DurationMs = $clock.ElapsedMilliseconds
    }
  }
  finally {
    $process.Dispose()
  }
}

function Start-PsqlSession([string]$Database, [string]$Sql, [int]$Port = 5432) {
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = New-PsqlStartInfo -Database $Database -Port $Port
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($Sql)
  $process.StandardInput.Close()
  return [pscustomobject]@{ Process = $process; StdoutTask = $stdoutTask; StderrTask = $stderrTask }
}

function Get-PsqlText([string]$Database, [string]$Sql, [int]$TimeoutSeconds = 15) {
  $result = Invoke-Psql -Database $Database -Sql $Sql -TimeoutSeconds $TimeoutSeconds
  Assert-Proof ($null -ne $result.ExitCode -and $result.ExitCode -eq 0) "read-only query failed ($($result.ErrorCode))"
  return $result.Stdout.Trim()
}

function Assert-Exit([pscustomobject]$Result, [bool]$ShouldSucceed, [string]$Label) {
  Assert-Proof ($null -ne $Result.ExitCode) "$Label returned no exit code ($($Result.ErrorCode))"
  if ($ShouldSucceed) {
    if ($Result.ExitCode -ne 0) {
      $stderr = if ($Result.Stderr) { $Result.Stderr.Trim() } else { '<empty>' }
      $stdout = if ($Result.Stdout) { $Result.Stdout.Trim() } else { '<empty>' }
      Add-Summary "$Label diagnostic: exit=$($Result.ExitCode); stderr=$stderr; stdout=$stdout"
      Stop-Proof "$Label expected exit 0; got $($Result.ExitCode)"
    }
  }
  else {
    if ($Result.ExitCode -eq 0) {
      Add-Summary "$Label diagnostic: expected failure but received exit=0; stdout=$($Result.Stdout.Trim())"
      Stop-Proof "$Label expected nonzero exit; got 0"
    }
  }
}

$expectedMigrationHashes = @{
  'supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql' = '40572A4684F7315C26E25DEF3DB1C971EEF1F4BF49DE8851DF5DBE393E040CBC'
  'supabase/migrations/20261015154159_rc16k_member_report_read_rls.sql' = '698DB467BB1BCD1B549DCE94CB51704BB4771C814CF8AB6E23D3439564622BA7'
}
foreach ($relativePath in $expectedMigrationHashes.Keys) {
  $actualHash = (Get-FileHash -LiteralPath $relativePath -Algorithm SHA256).Hash
  Assert-Proof ($actualHash -eq $expectedMigrationHashes[$relativePath]) "migration hash mismatch: $relativePath"
  Add-Summary "Migration hash verified: $relativePath $actualHash"
}

$psqlCommand = Get-Command psql -ErrorAction Stop
$script:PsqlPath = $psqlCommand.Source
Assert-Proof ($script:PsqlPath -and (Test-Path -LiteralPath $script:PsqlPath)) 'psql executable not found'
$clientVersion = (& $script:PsqlPath --version 2>&1 | Out-String).Trim()
$clientExit = $LASTEXITCODE
Assert-Proof ($clientExit -eq 0 -and $clientVersion -match 'psql \(PostgreSQL') 'psql client version check failed'
Add-Summary "Client: $clientVersion"

$containerLines = @(& docker ps --filter 'publish=5432' --format '{{.ID}}|{{.Image}}' 2>&1)
$dockerListExit = $LASTEXITCODE
Assert-Proof ($dockerListExit -eq 0) 'Docker service-container enumeration failed'
Assert-Proof ($containerLines.Count -eq 1 -and $containerLines[0] -match '^([0-9a-f]+)\|(postgres:17[^|]*)$') 'expected exactly one PostgreSQL 17 service container publishing port 5432'
$containerId = $Matches[1]
$containerImage = $Matches[2]
$containerInspect = @(& docker inspect --format '{{.Id}}|{{.Image}}|{{.State.Status}}' $containerId 2>&1)
$inspectExit = $LASTEXITCODE
Assert-Proof ($inspectExit -eq 0 -and $containerInspect.Count -eq 1) 'Docker container inspection failed'
Assert-Proof ($containerInspect[0] -match '^([0-9a-f]+)\|sha256:([0-9a-f]{64})\|running$') 'container image digest/state assertion failed'
$containerDigest = $Matches[2]
$topLines = @(& docker top $containerId 2>&1)
$topExit = $LASTEXITCODE
Assert-Proof ($topExit -eq 0 -and ($topLines -join "`n") -match 'postgres') 'PostgreSQL process identity not found in service container'
Add-Summary "Service container: id=$containerId image=$containerImage digest=sha256:$containerDigest state=running"

$identitySql = @'
SELECT json_build_object(
  'database', current_database(),
  'port', inet_server_port(),
  'current_user', current_user,
  'server_version', current_setting('server_version'),
  'server_version_num', current_setting('server_version_num'),
  'data_directory', current_setting('data_directory'),
  'postmaster_start_time', pg_postmaster_start_time()
)::text;
'@
$identityResult = Invoke-Psql -Database 'postgres' -Sql $identitySql
Assert-Exit $identityResult $true 'target identity query'
$identity = $identityResult.Stdout.Trim() | ConvertFrom-Json
Assert-Proof ($identity.database -eq 'postgres') 'initial target database mismatch'
Assert-Proof ([int]$identity.port -eq 5432) 'target port mismatch'
Assert-Proof ($identity.current_user -eq 'postgres') 'target current_user mismatch'
Assert-Proof ([string]$identity.server_version_num -match '^17') 'target PostgreSQL major is not 17'
Assert-Proof ([string]$identity.data_directory -match '^/var/lib/postgresql/') 'unexpected PostgreSQL data directory'
Assert-Proof ($null -ne $identity.postmaster_start_time) 'postmaster start time missing'
Add-Summary "Target identity: db=$($identity.database) port=$($identity.port) user=$($identity.current_user) server=$($identity.server_version) data_directory=$($identity.data_directory) postmaster_start=$($identity.postmaster_start_time)"

$runToken = '{0}_{1}' -f $env:GITHUB_RUN_ID, $env:GITHUB_RUN_ATTEMPT
$database = "p0_executor_$runToken"
Assert-Proof ($database -match '^p0_executor_[0-9]+_[0-9]+$') 'synthetic database name is invalid'
$createDb = Invoke-Psql -Database 'postgres' -Sql "CREATE DATABASE $database;"
Assert-Exit $createDb $true 'synthetic database creation'

$markerName = "executor_marker_$runToken"
$markerSql = "CREATE TABLE public.$markerName(marker text PRIMARY KEY); INSERT INTO public.$markerName VALUES ('$runToken');"
$markerResult = Invoke-Psql -Database $database -Sql $markerSql
Assert-Exit $markerResult $true 'synthetic target marker creation'
$dbIdentity = Get-PsqlText -Database $database -Sql $identitySql
$dbIdentityObject = $dbIdentity | ConvertFrom-Json
Assert-Proof ($dbIdentityObject.database -eq $database) 'connected database does not match the unique synthetic database'
$markerResult = Get-PsqlText -Database $database -Sql "SELECT marker FROM public.$markerName;"
Assert-Proof ($markerResult -eq $runToken) 'synthetic target marker mismatch'
Add-Summary "Unique database marker: PASS ($database / $markerName)"

$lockTimeout = '5s'
$statementTimeout = '30s'
$successTable = "executor_success_$runToken"
$successSql = @"
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '$lockTimeout';
SET LOCAL statement_timeout = '$statementTimeout';
CREATE TABLE public.$successTable(id integer PRIMARY KEY);
INSERT INTO public.$successTable VALUES (17);
COMMIT;
"@
$success = Invoke-Psql -Database $database -Sql $successSql
Assert-Exit $success $true 'successful atomic transaction'
$successCount = Get-PsqlText -Database $database -Sql "SELECT count(*)::text FROM public.$successTable WHERE id=17;"
Assert-Proof ($successCount -eq '1') 'committed transaction data was not present'
Add-Summary "Transaction A commit: PASS exit=$($success.ExitCode) row_count=$successCount"

$failedTable = "executor_rollback_$runToken"
$failureSql = @"
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '$lockTimeout';
SET LOCAL statement_timeout = '$statementTimeout';
CREATE TABLE public.$failedTable(id integer);
SELECT 1 / 0;
COMMIT;
"@
$failure = Invoke-Psql -Database $database -Sql $failureSql
Assert-Exit $failure $false 'ON_ERROR_STOP SQL failure'
Assert-Proof ($failure.Stderr -match 'division by zero') 'SQL failure stderr did not identify the injected error'
$rollbackPresent = Get-PsqlText -Database $database -Sql "SELECT to_regclass('public.$failedTable') IS NULL;"
Assert-Proof ($rollbackPresent -eq 't') 'failed transaction left partial DDL behind'
Add-Summary "Transaction B failure: PASS psql_exit=$($failure.ExitCode) rollback=confirmed"

$statementTable = "executor_statement_timeout_$runToken"
$statementSql = @"
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '$lockTimeout';
SET LOCAL statement_timeout = '$statementTimeout';
CREATE TABLE public.$statementTable(id integer);
SELECT pg_sleep(35);
COMMIT;
"@
$statementFailure = Invoke-Psql -Database $database -Sql $statementSql -TimeoutSeconds 45
Assert-Exit $statementFailure $false 'statement timeout injection'
Assert-Proof ($statementFailure.Stderr -match 'statement timeout') 'statement timeout diagnostic missing from stderr'
Assert-Proof ($statementFailure.DurationMs -ge 25000 -and $statementFailure.DurationMs -lt 45000) 'statement timeout duration outside expected 30s window'
$statementRollback = Get-PsqlText -Database $database -Sql "SELECT to_regclass('public.$statementTable') IS NULL;"
Assert-Proof ($statementRollback -eq 't') 'statement-timeout transaction did not roll back'
Add-Summary "Statement timeout: PASS configured=$statementTimeout psql_exit=$($statementFailure.ExitCode) elapsed_ms=$($statementFailure.DurationMs) rollback=confirmed"

$lockTable = "executor_lock_$runToken"
$alteredColumn = "blocked_$runToken"
$lockSetup = Invoke-Psql -Database $database -Sql "CREATE TABLE public.$lockTable(id integer PRIMARY KEY);"
Assert-Exit $lockSetup $true 'lock fixture creation'
$holderSql = @"
\set ON_ERROR_STOP on
BEGIN;
LOCK TABLE public.$lockTable IN ACCESS EXCLUSIVE MODE;
SELECT pg_sleep(10);
COMMIT;
"@
$holder = Start-PsqlSession -Database $database -Sql $holderSql
try {
  $lockHeld = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($holder.Process.HasExited) { break }
    $lockState = Get-PsqlText -Database $database -Sql "SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid=l.relation WHERE c.relname='$lockTable' AND l.mode='AccessExclusiveLock' AND l.granted AND l.pid<>pg_backend_pid());"
    if ($lockState -eq 't') { $lockHeld = $true; break }
    Start-Sleep -Milliseconds 250
  }
  Assert-Proof $lockHeld 'session A did not acquire the expected synthetic table lock'
  $lockFailureSql = @"
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '$lockTimeout';
SET LOCAL statement_timeout = '$statementTimeout';
ALTER TABLE public.$lockTable ADD COLUMN $alteredColumn integer;
COMMIT;
"@
  $lockFailure = Invoke-Psql -Database $database -Sql $lockFailureSql -TimeoutSeconds 15
  Assert-Exit $lockFailure $false 'lock timeout injection'
  Assert-Proof ($lockFailure.Stderr -match 'lock timeout') 'lock timeout diagnostic missing from stderr'
  Assert-Proof ($lockFailure.DurationMs -ge 4000 -and $lockFailure.DurationMs -lt 15000) 'lock timeout duration outside expected 5s window'
  $holder.Process.WaitForExit(15000) | Out-Null
  Assert-Proof $holder.Process.HasExited 'session A exceeded its bounded lifetime'
  $holderExit = $holder.Process.ExitCode
  Assert-Proof ($holderExit -eq 0) "session A lock holder failed with exit $holderExit"
  $columnPresent = Get-PsqlText -Database $database -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='$lockTable' AND column_name='$alteredColumn');"
  Assert-Proof ($columnPresent -eq 'f') 'lock-timeout transaction left the ALTER TABLE change behind'
  Add-Summary "Lock timeout: PASS configured=$lockTimeout psql_exit=$($lockFailure.ExitCode) elapsed_ms=$($lockFailure.DurationMs) rollback=confirmed"
}
finally {
  if (-not $holder.Process.HasExited) {
    try { $holder.Process.Kill($true) } catch { }
    [void]$holder.Process.WaitForExit(5000)
  }
  $holder.Process.Dispose()
}

$connectionFailure = Invoke-Psql -Database $database -Sql 'SELECT 1;' -Port 1 -TimeoutSeconds 5
Assert-Exit $connectionFailure $false 'connection failure injection'
Assert-Proof ($connectionFailure.ErrorCode -eq 'PROCESS_EXIT_NONZERO') 'connection failure was incorrectly classified as success'
Add-Summary "Connection failure propagation: PASS psql_exit=$($connectionFailure.ExitCode)"

$killedProcess = Invoke-Psql -Database $database -Sql 'SELECT pg_sleep(30);' -TimeoutSeconds 1
Assert-Proof ($null -eq $killedProcess.ExitCode -and $killedProcess.ErrorCode -eq 'PROCESS_TIMEOUT') 'killed/timed-out process was not reported as failure'
Add-Summary 'Process termination propagation: PASS error_code=PROCESS_TIMEOUT exit=UNKNOWN (fail-closed)'

$outputContract = Invoke-Psql -Database $database -Sql "SELECT 'STDOUT_PROBE'; SELECT 1 / 0;"
Assert-Exit $outputContract $false 'separate stdout/stderr and exit-code contract'
Assert-Proof ($outputContract.Stdout -match 'STDOUT_PROBE' -and $outputContract.Stderr -match 'division by zero') 'stdout/stderr were mixed or lost'
Assert-Proof ($outputContract.ErrorCode -eq 'PROCESS_EXIT_NONZERO') 'native exit code was lost by the PowerShell wrapper'
Add-Summary "PowerShell process contract: PASS result_type=$($outputContract.GetType().FullName) stdout_stderr_separate=True exit=$($outputContract.ExitCode)"

Add-Summary "Timeout values exercised: lock_timeout=$lockTimeout; statement_timeout=$statementTimeout"
Add-Summary "Executor proof complete: synthetic database=$database; Production connections/secrets=none; migration SQL executed=none"
