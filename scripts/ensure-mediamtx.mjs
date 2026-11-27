#!/usr/bin/env node
/**
 * RC19 W4: Hardened Pinned MediaMTX Setup Utility
 *
 * Pins MediaMTX v1.21.4 and verifies official platform archive SHA-256 before extraction.
 * Fails closed on any checksum mismatch.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir, platform as osPlatform, arch as osArch } from 'node:os'
import { spawnSync } from 'node:child_process'

export const PINNED_MEDIAMTX_VERSION = 'v1.21.4'

export const APPROVED_CHECKSUMS = {
  'linux-x64': {
    archive: 'mediamtx_v1.21.4_linux_amd64.tar.gz',
    sha256: 'be0c05d9c8af8338116977e7f1c3fcb409fbf882075e5ab075cf8baad76a59d2',
    binName: 'mediamtx',
    format: 'tar.gz',
  },
  'linux-arm64': {
    archive: 'mediamtx_v1.21.4_linux_arm64v8.tar.gz',
    sha256: '579471131efcfc0c4c478a5b28d0ee54e17812f8648358498f3c7515b637d442',
    binName: 'mediamtx',
    format: 'tar.gz',
  },
  'win32-x64': {
    archive: 'mediamtx_v1.21.4_windows_amd64.zip',
    sha256: '835645b2700ffce4d2b6cb04bfa0aadce95335da6dfc0d7c2114e6da585734f8',
    binName: 'mediamtx.exe',
    format: 'zip',
  },
  'darwin-x64': {
    archive: 'mediamtx_v1.21.4_darwin_amd64.tar.gz',
    sha256: 'c7855ce1eebaa21f647976865d1dffb8d9609fb58376483015b67a54a02c0b43',
    binName: 'mediamtx',
    format: 'tar.gz',
  },
  'darwin-arm64': {
    archive: 'mediamtx_v1.21.4_darwin_arm64.tar.gz',
    sha256: '4b8f0f0322c3664d6db8ef9aa158a17dfa4bfbfdf0115dd8a65ebfc82c6109e9',
    binName: 'mediamtx',
    format: 'tar.gz',
  },
}

export function findExistingMediaMtxBinary() {
  if (process.env.MEDIAMTX_PATH && existsSync(process.env.MEDIAMTX_PATH)) {
    return process.env.MEDIAMTX_PATH
  }
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which'
    const res = spawnSync(whichCmd, ['mediamtx'], { encoding: 'utf8' })
    const trimmed = res.stdout?.trim()?.split('\n')[0]?.trim()
    if (trimmed && existsSync(trimmed)) {
      return trimmed
    }
  } catch {}
  const tempDir = process.env.TEMP || tmpdir()
  const candidates = [
    join(tempDir, 'mediamtx'),
    join(tempDir, 'mediamtx.exe'),
    join(tempDir, `mediamtx-${PINNED_MEDIAMTX_VERSION}`, 'mediamtx'),
    join(tempDir, `mediamtx-${PINNED_MEDIAMTX_VERSION}`, 'mediamtx.exe'),
    '/usr/local/bin/mediamtx',
    '/usr/bin/mediamtx',
    'C:\\TEMP\\mediamtx.exe',
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

export async function ensureMediaMtxBinary() {
  const existing = findExistingMediaMtxBinary()
  if (existing) {
    return existing
  }

  const plat = osPlatform()
  const arch = osArch()
  const key = `${plat}-${arch}`
  const spec = APPROVED_CHECKSUMS[key]

  if (!spec) {
    throw new Error(`MediaMTX automatic setup is unsupported on platform/arch: ${key}. Set MEDIAMTX_PATH manually.`)
  }

  const tempDir = process.env.TEMP || tmpdir()
  const targetDir = join(tempDir, `mediamtx-${PINNED_MEDIAMTX_VERSION}`)
  const targetBin = join(targetDir, spec.binName)

  if (existsSync(targetBin)) {
    return targetBin
  }

  mkdirSync(targetDir, { recursive: true })

  const downloadUrl = `https://github.com/bluenviron/mediamtx/releases/download/${PINNED_MEDIAMTX_VERSION}/${spec.archive}`
  const archivePath = join(targetDir, spec.archive)

  console.log(`[MediaMTX Setup] Downloading pinned ${PINNED_MEDIAMTX_VERSION} from ${downloadUrl}...`)

  const response = await fetch(downloadUrl)
  if (!response.ok) {
    throw new Error(`Failed to download MediaMTX from ${downloadUrl}: HTTP ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // SHA256 checksum verification
  const hash = createHash('sha256').update(buffer).digest('hex')
  if (hash.toLowerCase() !== spec.sha256.toLowerCase()) {
    throw new Error(
      `CHECKSUM_MISMATCH: Downloaded MediaMTX archive SHA-256 (${hash}) does not match approved checksum (${spec.sha256}). Failing closed!`
    )
  }

  console.log(`[MediaMTX Setup] Checksum verified (${hash}). Extracting...`)
  writeFileSync(archivePath, buffer)

  if (spec.format === 'tar.gz') {
    const tarRes = spawnSync('tar', ['-xzf', archivePath, '-C', targetDir], { encoding: 'utf8' })
    if (tarRes.status !== 0) {
      throw new Error(`Failed to extract tar archive: ${tarRes.stderr}`)
    }
  } else if (spec.format === 'zip') {
    const zipRes = spawnSync('tar', ['-xf', archivePath, '-C', targetDir], { encoding: 'utf8' })
    if (zipRes.status !== 0) {
      throw new Error(`Failed to extract zip archive: ${zipRes.stderr}`)
    }
  }

  try {
    unlinkSync(archivePath)
  } catch {}

  if (plat !== 'win32' && existsSync(targetBin)) {
    chmodSync(targetBin, 0o755)
  }

  if (!existsSync(targetBin)) {
    throw new Error(`MediaMTX binary missing after extraction at: ${targetBin}`)
  }

  console.log(`[MediaMTX Setup] Successfully installed verified MediaMTX at ${targetBin}`)
  return targetBin
}

// CLI entrypoint
if (process.argv[1]?.endsWith('ensure-mediamtx.mjs')) {
  ensureMediaMtxBinary()
    .then(bin => {
      console.log(`MediaMTX binary ready: ${bin}`)
      process.exit(0)
    })
    .catch(err => {
      console.error(err.message)
      process.exit(1)
    })
}
