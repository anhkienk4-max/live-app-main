param()

$configPath = '\\wsl.localhost\Ubuntu-24.04\home\anhkienk4\.local\share\rc19-c511-native\runtime.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json

function B64Url([byte[]]$bytes) {
  [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function NewLocalJwt([string]$role, [string]$secret) {
  $header = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $exp = $now + 86400 * 30
  $claims = @{
    iss = 'supabase'
    aud = 'authenticated'
    iat = $now
    exp = $exp
    role = $role
  } | ConvertTo-Json -Compress
  $body = B64Url ([Text.Encoding]::UTF8.GetBytes($claims))
  $h = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
  try {
    $sig = B64Url ($h.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$body")))
  } finally {
    $h.Dispose()
  }
  return "$header.$body.$sig"
}

$env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:15546'
$env:SUPABASE_URL = 'http://127.0.0.1:15546'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY = NewLocalJwt 'anon' $config.local_jwt_secret
$env:SUPABASE_SECRET_KEY = NewLocalJwt 'service_role' $config.local_jwt_secret
$env:NEXT_PUBLIC_USE_MOCK_DATA = 'false'
$env:NEXT_PUBLIC_FEATURE_MY_PAYSLIP = 'true'
$env:FEATURE_MY_PAYSLIP = 'true'
$env:PORT = '3102'
$env:HOSTNAME = '127.0.0.1'

Write-Host "STARTING_NEXT on 127.0.0.1:3102 with fresh 30-day JWT"
corepack pnpm dev --hostname 127.0.0.1 --port 3102 --webpack
