# ADA OPS PWA: read-only credentialed Staging UAT, Windows PowerShell.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PreviewUrl,
  [Parameter(Mandatory=$true)][string]$ExpectedSha,
  [switch]$WithVercelBypass
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$uri = [uri]$PreviewUrl
if ($uri.Scheme -ne 'https' -or $uri.Host -notmatch '^livestream-ops-demo(?:-[a-z0-9-]+)?\.vercel\.app$' -or $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment -or $ExpectedSha -notmatch '^[a-f0-9]{40}$') {
  throw 'BLOCKED: require verified HTTPS PWA Preview URL and full commit SHA. Production is forbidden.'
}
if ($uri.Host -ne 'livestream-ops-demo-68p92v1qb-livestream2.vercel.app' -or $ExpectedSha -ne '775be57e5cd4bc6abb12387ced5cf4210f4024ca') {
  throw 'BLOCKED: target must match the approved exact SHA and Preview deployment.'
}
$names = @(
  'E2E_BASE_URL','PWA_UAT_EXPECTED_SHA','NEXT_PUBLIC_USE_MOCK_DATA',
  'E2E_VERCEL_PROTECTION_BYPASS',
  'E2E_ADMIN_EMAIL','E2E_ADMIN_PASSWORD','E2E_LEADER_EMAIL','E2E_LEADER_PASSWORD',
  'E2E_MEMBER_EMAIL','E2E_MEMBER_PASSWORD'
)
$backup = @{}
foreach ($name in $names) {
  $backup[$name] = [Environment]::GetEnvironmentVariable($name,'Process')
}
function Get-SecretInput([string]$role) {
  $secure = Read-Host "Staging $role password (hidden)" -AsSecureString
  $ptr = [IntPtr]::Zero
  try {
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    $secure.Dispose()
  }
}
try {
  $env:E2E_BASE_URL = $uri.AbsoluteUri
  $env:PWA_UAT_EXPECTED_SHA = $ExpectedSha
  $env:NEXT_PUBLIC_USE_MOCK_DATA = 'false'
  [Environment]::SetEnvironmentVariable('E2E_VERCEL_PROTECTION_BYPASS',$null,'Process')
  if ($WithVercelBypass) {
    [Environment]::SetEnvironmentVariable('E2E_VERCEL_PROTECTION_BYPASS',(Get-SecretInput 'Vercel automation bypass'),'Process')
  }
  foreach ($role in @('ADMIN','LEADER','MEMBER')) {
    $email = Read-Host "Staging $role email"
    if (-not $email) { throw "BLOCKED: missing $role identity" }
    [Environment]::SetEnvironmentVariable(('E2E_' + $role + '_EMAIL'),$email,'Process')
    [Environment]::SetEnvironmentVariable(('E2E_' + $role + '_PASSWORD'),(Get-SecretInput $role),'Process')
  }
  Push-Location (Split-Path -Parent $PSScriptRoot)
  try {
    & pnpm exec playwright test --config=playwright.pwa-functional.uat.config.ts
    $browserExit = $LASTEXITCODE
    if (Test-Path 'test-results/pwa-functional-staging.json') {
      & node scripts/validate-pwa-functional-uat.mjs test-results/pwa-functional-staging.json
      $gateExit = $LASTEXITCODE
    } else {
      $gateExit = 1
    }
    if ($browserExit -ne 0 -or $gateExit -ne 0) {
      throw "NO-GO: read-only UAT incomplete (browser exit $browserExit; evidence exit $gateExit)."
    }
    Write-Host 'Read-only functional UAT gate PASS. Mutation/RLS and owner release approval still required.'
  } finally {
    Pop-Location
  }
} finally {
  foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name,$backup[$name],'Process')
  }
}
