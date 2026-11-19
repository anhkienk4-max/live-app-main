#!/usr/bin/env node
/**
 * RC19 W4 Gate G11 — Real Google Drive Upload / Readback / Checksum / ACL Verifier
 *
 * Uses the exact same Google Drive environment variables as production:
 *   - GOOGLE_DRIVE_ROOT_FOLDER_ID
 *   - GOOGLE_DRIVE_AUTH_MODE ('oauth_refresh_token' default | 'service_account')
 *   - OAuth mode: GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN
 *   - Service account mode: GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY
 *
 * Fails closed (exit code 2) without leaking secret values when credentials are missing.
 */

import { createHash, randomBytes } from 'node:crypto'
import { Readable } from 'node:stream'
import { google } from 'googleapis'

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder'

// Minimal valid 1x1 transparent PNG
const SYNTHETIC_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

function normalizeFolderId(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return ''
  const match = value.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : value
}

function getMissingEnvVars(env) {
  const mode = String(env.GOOGLE_DRIVE_AUTH_MODE ?? '').trim().toLowerCase() || 'oauth_refresh_token'
  const missing = []
  if (!normalizeFolderId(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)) {
    missing.push('GOOGLE_DRIVE_ROOT_FOLDER_ID')
  }
  if (mode === 'oauth_refresh_token') {
    for (const key of ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN']) {
      if (!String(env[key] ?? '').trim()) missing.push(key)
    }
  } else if (mode === 'service_account') {
    for (const key of ['GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_DRIVE_PRIVATE_KEY']) {
      if (!String(env[key] ?? '').trim()) missing.push(key)
    }
  } else {
    throw new Error(`ATTENDANCE_DRIVE_UNSUPPORTED_AUTH_MODE:${mode}`)
  }
  return { mode, missing }
}

function createAuth(env, mode) {
  if (mode === 'oauth_refresh_token') {
    const auth = new google.auth.OAuth2(
      env.GOOGLE_DRIVE_CLIENT_ID.trim(),
      env.GOOGLE_DRIVE_CLIENT_SECRET.trim(),
    )
    auth.setCredentials({ refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN.trim() })
    return auth
  }
  const key = env.GOOGLE_DRIVE_PRIVATE_KEY.trim().replace(/\\n/g, '\n')
  if (!key.includes('BEGIN PRIVATE KEY') || !key.includes('END PRIVATE KEY')) {
    throw new Error('GOOGLE_DRIVE_AUTH_FAILED: invalid GOOGLE_DRIVE_PRIVATE_KEY format')
  }
  return new google.auth.JWT({
    email: env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL.trim(),
    key,
    scopes: [GOOGLE_DRIVE_SCOPE],
  })
}

async function main() {
  const env = process.env
  const featureFlags = {
    FEATURE_SELF_ATTENDANCE_PHOTO: env.FEATURE_SELF_ATTENDANCE_PHOTO ?? null,
    FILE_STORAGE_ENABLED: env.FILE_STORAGE_ENABLED ?? null,
  }

  let config
  try {
    config = getMissingEnvVars(env)
  } catch (err) {
    console.error(JSON.stringify({
      status: 'BLOCKED',
      code: 'ATTENDANCE_DRIVE_NOT_CONFIGURED',
      reason: err instanceof Error ? err.message : String(err),
      feature_flags: featureFlags,
    }, null, 2))
    process.exit(2)
  }

  if (config.missing.length > 0) {
    console.error(JSON.stringify({
      status: 'BLOCKED',
      code: 'ATTENDANCE_DRIVE_NOT_CONFIGURED',
      auth_mode: config.mode,
      missing_env_vars: config.missing,
      feature_flags: featureFlags,
    }, null, 2))
    process.exit(2)
  }

  const rootFolderId = normalizeFolderId(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)
  const auth = createAuth(env, config.mode)
  const drive = google.drive({ version: 'v3', auth })

  const rootResp = await drive.files.get({
    fileId: rootFolderId,
    fields: 'id,name,mimeType,trashed,driveId,capabilities(canAddChildren,canEdit)',
    supportsAllDrives: true,
  })
  const root = rootResp.data
  if (root.mimeType !== DRIVE_FOLDER_MIME || root.trashed) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_INVALID: root is not an active folder')
  }
  if (!root.capabilities?.canAddChildren) {
    throw new Error('GOOGLE_DRIVE_FOLDER_NOT_WRITABLE: capabilities.canAddChildren is false')
  }
  if (config.mode === 'service_account' && !root.driveId) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_INVALID: service_account requires Shared Drive root')
  }

  const permResp = await drive.permissions.list({
    fileId: rootFolderId,
    fields: 'permissions(id,type,role,domain,allowFileDiscovery)',
    supportsAllDrives: true,
  })
  const permissions = permResp.data.permissions ?? []
  const publicPermissions = permissions.filter((p) => p.type === 'anyone')
  if (publicPermissions.length > 0) {
    throw new Error(`GOOGLE_DRIVE_PERMISSION_DENIED: unsafe public ACL (type=anyone count=${publicPermissions.length})`)
  }

  const expectedSha256 = createHash('sha256').update(SYNTHETIC_PNG_BYTES).digest('hex')
  const expectedMd5 = createHash('md5').update(SYNTHETIC_PNG_BYTES).digest('hex')
  const probeName = `rc19-w4-g11-probe-${Date.now()}-${randomBytes(4).toString('hex')}.png`

  let uploadedId = null
  try {
    const uploadResp = await drive.files.create({
      requestBody: {
        name: probeName,
        mimeType: 'image/png',
        parents: [rootFolderId],
      },
      media: {
        mimeType: 'image/png',
        body: Readable.from(SYNTHETIC_PNG_BYTES),
      },
      fields: 'id,name,mimeType,size,md5Checksum,parents,createdTime',
      supportsAllDrives: true,
    })
    uploadedId = uploadResp.data.id
    if (!uploadedId) {
      throw new Error('GOOGLE_DRIVE_UPLOAD_FAILED: missing uploaded file id')
    }

    const metaResp = await drive.files.get({
      fileId: uploadedId,
      fields: 'id,name,mimeType,size,md5Checksum,parents,trashed',
      supportsAllDrives: true,
    })
    const meta = metaResp.data
    if (meta.trashed || !meta.parents?.includes(rootFolderId)) {
      throw new Error('GOOGLE_DRIVE_RESPONSE_INVALID: uploaded metadata mismatch or outside root')
    }
    if (meta.md5Checksum && meta.md5Checksum !== expectedMd5) {
      throw new Error(`GOOGLE_DRIVE_CHECKSUM_MISMATCH: expected md5=${expectedMd5} got=${meta.md5Checksum}`)
    }

    const bytesResp = await drive.files.get(
      { fileId: uploadedId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' },
    )
    const readBackBuf = Buffer.from(bytesResp.data)
    const actualSha256 = createHash('sha256').update(readBackBuf).digest('hex')
    if (actualSha256 !== expectedSha256) {
      throw new Error(`GOOGLE_DRIVE_READBACK_MISMATCH: expected sha256=${expectedSha256} got=${actualSha256}`)
    }

    await drive.files.update({
      fileId: uploadedId,
      requestBody: { trashed: true },
      fields: 'id,trashed',
      supportsAllDrives: true,
    })
    uploadedId = null

    console.log(JSON.stringify({
      status: 'PASS',
      auth_mode: config.mode,
      root_folder_id: root.id,
      root_folder_name: root.name,
      shared_drive_id: root.driveId ?? null,
      acl_permission_count: permissions.length,
      acl_public_anyone_count: publicPermissions.length,
      acl_summary: permissions.map((p) => ({ type: p.type, role: p.role, domain: p.domain ?? null })),
      probe_name: probeName,
      expected_sha256: expectedSha256,
      actual_sha256: actualSha256,
      expected_md5: expectedMd5,
      drive_md5: meta.md5Checksum ?? null,
      cleanup_trashed: true,
      feature_flags: featureFlags,
    }, null, 2))
  } finally {
    if (uploadedId) {
      await drive.files.update({
        fileId: uploadedId,
        requestBody: { trashed: true },
        fields: 'id,trashed',
        supportsAllDrives: true,
      }).catch(() => {})
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({
    status: 'FAILED',
    error: err instanceof Error ? err.message : String(err),
  }, null, 2))
  process.exit(1)
})
