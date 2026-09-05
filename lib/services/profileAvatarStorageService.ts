import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export const PROFILE_AVATAR_BUCKET = 'profile-avatars'
export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024
export const PROFILE_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

type AvatarClient = Pick<SupabaseClient, 'storage'>

const extensionByMimeType: Record<(typeof PROFILE_AVATAR_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function profileAvatarStoragePath(userId: string, mimeType: string, id = crypto.randomUUID()) {
  const extension = extensionByMimeType[mimeType as keyof typeof extensionByMimeType]
  if (!extension) throw new Error('Unsupported avatar image type.')
  if (!userId.trim()) throw new Error('Avatar owner is required.')
  return `profiles/${userId}/avatar/${id}.${extension}`
}

export async function uploadProfileAvatar(
  file: Blob & { name?: string; type: string; size: number },
  userId: string,
  client: AvatarClient = createClient(),
) {
  if (!PROFILE_AVATAR_MIME_TYPES.includes(file.type as (typeof PROFILE_AVATAR_MIME_TYPES)[number])) {
    throw new Error('Unsupported avatar image type.')
  }
  if (file.size > PROFILE_AVATAR_MAX_BYTES) throw new Error('Avatar image is too large.')
  const storagePath = profileAvatarStoragePath(userId, file.type)
  const upload = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  })
  if (upload.error) throw new Error('Avatar upload failed.')
  const { data } = client.storage.from(PROFILE_AVATAR_BUCKET).getPublicUrl(storagePath)
  if (!data.publicUrl) throw new Error('Avatar URL could not be resolved.')
  return { storagePath, avatarUrl: data.publicUrl }
}

export async function removeProfileAvatar(
  storagePath: string | undefined,
  userId: string,
  client: AvatarClient = createClient(),
) {
  if (!storagePath || !storagePath.startsWith(`profiles/${userId}/avatar/`)) return
  const result = await client.storage.from(PROFILE_AVATAR_BUCKET).remove([storagePath])
  if (result.error) throw new Error('Avatar cleanup failed.')
}
