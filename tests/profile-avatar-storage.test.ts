import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROFILE_AVATAR_BUCKET,
  PROFILE_AVATAR_MAX_BYTES,
  removeProfileAvatar,
  uploadProfileAvatar,
} from '@/lib/services/profileAvatarStorageService'

function storageDouble(options: { uploadError?: boolean; removeError?: boolean } = {}) {
  const uploads: string[] = []
  const removals: string[][] = []
  return {
    uploads,
    removals,
    client: {
      storage: {
        from(bucket: string) {
          assert.equal(bucket, PROFILE_AVATAR_BUCKET)
          return {
            async upload(path: string) {
              uploads.push(path)
              return { data: null, error: options.uploadError ? new Error('provider failed') : null }
            },
            getPublicUrl(path: string) {
              return { data: { publicUrl: `https://cdn.test/${path}` } }
            },
            async remove(paths: string[]) {
              removals.push(paths)
              return { data: null, error: options.removeError ? new Error('provider failed') : null }
            },
          }
        },
      },
    } as never,
  }
}

test('profile avatars upload to an owned durable path and resolve a stable URL', async () => {
  const storage = storageDouble()
  const result = await uploadProfileAvatar(
    new Blob(['avatar'], { type: 'image/png' }) as Blob & { name?: string; type: string; size: number },
    'business-user-1',
    storage.client,
  )
  assert.match(result.storagePath, /^profiles\/business-user-1\/avatar\/[0-9a-f-]+\.png$/)
  assert.equal(result.avatarUrl, `https://cdn.test/${result.storagePath}`)
  assert.deepEqual(storage.uploads, [result.storagePath])
})

test('profile avatar validation rejects unsupported and oversized files before upload', async () => {
  const storage = storageDouble()
  await assert.rejects(
    () => uploadProfileAvatar(new Blob(['x'], { type: 'image/gif' }) as never, 'business-user-1', storage.client),
    /Unsupported avatar image type/,
  )
  const oversized = { type: 'image/png', size: PROFILE_AVATAR_MAX_BYTES + 1 } as Blob & { name?: string; type: string; size: number }
  await assert.rejects(() => uploadProfileAvatar(oversized, 'business-user-1', storage.client), /too large/)
  assert.deepEqual(storage.uploads, [])
})

test('profile avatar upload failure is surfaced and owned cleanup cannot target another user', async () => {
  const failed = storageDouble({ uploadError: true })
  await assert.rejects(
    () => uploadProfileAvatar(new Blob(['x'], { type: 'image/webp' }) as never, 'business-user-1', failed.client),
    /Avatar upload failed/,
  )
  const storage = storageDouble()
  await removeProfileAvatar('profiles/other-user/avatar/old.png', 'business-user-1', storage.client)
  assert.deepEqual(storage.removals, [])
  await removeProfileAvatar('profiles/business-user-1/avatar/old.png', 'business-user-1', storage.client)
  assert.deepEqual(storage.removals, [['profiles/business-user-1/avatar/old.png']])
})
