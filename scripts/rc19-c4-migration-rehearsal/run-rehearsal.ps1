$ErrorActionPreference = 'Stop'
$expectedSha = '240a0d51b49863167be252d94545ea7c5ab2ac9a'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$head = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($head -ne $expectedSha) { throw "REFUSED_WRONG_SOURCE_SHA:$head" }
$migration = Join-Path $repoRoot 'supabase\migrations\20261103195519_rc19_c2_resource_public_and_app_edit.sql'
$expectedMigrationHash = '1B16C0ADD91917C8188195D913E589D7618D8F27233F350DC55819C2B66BE9DC'
$actualMigrationHash = (Get-FileHash -LiteralPath $migration -Algorithm SHA256).Hash
if ($actualMigrationHash -ne $expectedMigrationHash) { throw 'REFUSED_MIGRATION_CHECKSUM_MISMATCH' }
$wslRepo = (& wsl.exe --distribution Ubuntu-24.04 --exec wslpath -a $repoRoot).Trim()
if ($LASTEXITCODE -ne 0 -or -not $wslRepo.StartsWith('/mnt/c/')) { throw 'REFUSED_UNEXPECTED_WSL_PATH' }
$wslScript = "$wslRepo/scripts/rc19-c4-migration-rehearsal/reproduce-storage-resource-collision.sh"
$bashCommand = "RC19_C4_SOURCE_SHA=$head bash '$wslScript'"
& wsl.exe --distribution Ubuntu-24.04 --exec /bin/bash -lc $bashCommand
if ($LASTEXITCODE -ne 0) { throw "REHEARSAL_HARNESS_FAILED:$LASTEXITCODE" }
