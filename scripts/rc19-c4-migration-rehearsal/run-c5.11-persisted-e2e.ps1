param(
  [Parameter(Mandatory = $true)] [string] $RepositoryRoot,
  [Parameter(Mandatory = $true)] [string] $RuntimeConfigPath
)

$ErrorActionPreference = 'Stop'
$configJson = & wsl.exe -e python3 -c "import pathlib; print(pathlib.Path('$RuntimeConfigPath').read_text())"
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_RUNTIME_CONFIG_UNAVAILABLE' }
$config = ($configJson -join "`n") | ConvertFrom-Json

$migrationPath = Join-Path $RepositoryRoot 'supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql'
$env:NEXT_PUBLIC_SUPABASE_URL = 'http://c511.local'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $config.anon_key
$env:C511_BASE_URL = 'http://c511.local'
$env:C511_ANON_KEY = $config.anon_key
$env:C511_SERVICE_ROLE_KEY = $config.service_role_key
$env:C511_TEST_PASSWORD = $config.test_password
$env:C511_DATABASE = $config.database
$env:C511_EVIDENCE_DIR = Join-Path $RepositoryRoot 'scripts/rc19-c4-migration-rehearsal/evidence/c5.11-local-pg1711/e2e'
$env:C511_POSTGRES_VERSION = $config.database_identity.Split('|')[0]
$env:C511_MIGRATION_SHA256 = (Get-FileHash -LiteralPath $migrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
$env:C511_SOURCE_SHA = (git -C $RepositoryRoot rev-parse HEAD).Trim()
$env:NODE_OPTIONS = '--conditions=react-server'

Push-Location $RepositoryRoot
try {
  node --import ./tests/typescript-alias-loader.mjs --test tests/rc19-c511-persisted-e2e.test.ts
  exit $LASTEXITCODE
} finally {
  Pop-Location
  @('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'C511_BASE_URL', 'C511_ANON_KEY',
    'C511_SERVICE_ROLE_KEY', 'C511_TEST_PASSWORD', 'C511_DATABASE', 'C511_EVIDENCE_DIR',
    'C511_POSTGRES_VERSION', 'C511_MIGRATION_SHA256', 'C511_SOURCE_SHA', 'NODE_OPTIONS') | ForEach-Object {
      Remove-Item "Env:$($_)" -ErrorAction SilentlyContinue
    }
}
