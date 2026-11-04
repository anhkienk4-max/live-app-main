import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ATTENDANCE_DRIVE_FOLDER_GROUPS,
  canWriteOperationalStoragePlacement,
  type AttendanceDriveFolderGroup,
  type AttendancePhotoEventKind,
} from '@/lib/files/operationalStorageDomainMap'
import type { OperationalStoragePlacement } from '@/lib/files/operationalStoragePlacementResolver'
import type { PhotoRole } from '@/lib/utils/attendancePhotoNaming'
import { createFileStorageService } from '@/lib/services/fileStorageService'
import { createGoogleDriveFileProvider } from '@/lib/server/googleDriveFileProvider'
import { resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'
import { createOperationalStorageFolderMaterializer } from '@/lib/server/operationalStorageFolderMaterializer'
import { createOperationalStorageDomainRouteRepository } from '@/lib/server/operationalStorageRouteRepository'

const attendancePhotoRoles: PhotoRole[] = ['host', 'support', 'technical']
const attendanceDriveFolderGroups = Object.keys(ATTENDANCE_DRIVE_FOLDER_GROUPS) as AttendanceDriveFolderGroup[]

type AttendancePhotoDestination = {
  drive: ReturnType<typeof createGoogleDriveFileProvider>
  storage: ReturnType<typeof createFileStorageService>
  materialize: ReturnType<typeof createOperationalStorageFolderMaterializer>
}

export async function withAttendanceFolderCreationLock<T>(
  client: Pick<SupabaseClient, 'rpc'>,
  parentId: string,
  name: string,
  create: () => Promise<T>,
): Promise<T> {
  const lockKey = createHash('sha256').update(parentId).update('\0').update(name).digest('hex')
  const owner = randomUUID()
  const deadline = Date.now() + 55_000
  while (true) {
    const result = await client.rpc('acquire_operational_storage_folder_lock', {
      p_lock_key: lockKey, p_owner: owner, p_lease_seconds: 180,
    })
    if (result.error) throw new Error('ATTENDANCE_FOLDER_LOCK_UNAVAILABLE')
    if (result.data === true) break
    if (Date.now() >= deadline) throw new Error('ATTENDANCE_FOLDER_LOCK_TIMEOUT')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  try {
    return await create()
  } finally {
    const released = await client.rpc('release_operational_storage_folder_lock', {
      p_lock_key: lockKey, p_owner: owner,
    })
    if (released.error) console.warn('ATTENDANCE_FOLDER_LOCK_RELEASE_PENDING')
  }
}

export function createAttendancePhotoDrive(root: string) {
  if (!/^[A-Za-z0-9_-]{12,120}$/u.test(root)) throw new Error('ATTENDANCE_DRIVE_NOT_CONFIGURED')
  const env: Record<string, string | undefined> = { ...process.env, GOOGLE_DRIVE_ROOT_FOLDER_ID: root }
  const authMode = resolveGoogleDriveAuthMode(env)
  const credentialKeys = authMode === 'oauth_refresh_token'
    ? ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN']
    : ['GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_DRIVE_PRIVATE_KEY']
  if (!credentialKeys.every(key => Boolean(env[key]?.trim()))) throw new Error('ATTENDANCE_DRIVE_NOT_CONFIGURED')
  return { root, drive: createGoogleDriveFileProvider({ env }) }
}

async function createWritableDestination(client: SupabaseClient, placement: OperationalStoragePlacement): Promise<AttendancePhotoDestination> {
  if (!canWriteOperationalStoragePlacement(placement.accessClassification ?? '', placement.sensitive ?? false)) {
    throw new Error('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
  }
  const { drive } = createAttendancePhotoDrive(placement.baseFolderId)
  const health = await drive.healthCheck()
  if (!health.ok || health.root_readable !== true || health.root_can_add_children !== true) {
    throw new Error('ATTENDANCE_DRIVE_PERMISSION_DENIED')
  }
  const storage = createFileStorageService({ provider: drive })
  return {
    drive,
    storage,
    materialize: createOperationalStorageFolderMaterializer(
      (parentId, name, provider) => withAttendanceFolderCreationLock(
        client, parentId, name, () => storage.ensureFolder(parentId, name, provider),
      ),
      (folderId, provider) => storage.getMetadata(folderId, provider),
      true,
    ),
  }
}

async function persistAttendancePhotoFolder(
  client: SupabaseClient,
  input: { shiftId: string; eventKind: AttendancePhotoEventKind; role: PhotoRole; actorBusinessUserId: string },
  folder: { id: string; parentId: string; logicalPath: string; isLeaf: boolean },
) {
  if (!folder.isLeaf) return
  const { error } = await client.from('attendance_photo_drive_folders').upsert({
    shift_id: input.shiftId,
    event_kind: input.eventKind,
    operational_role: input.role,
    provider: 'google_drive',
    folder_id: folder.id,
    parent_folder_id: folder.parentId,
    logical_path: folder.logicalPath,
    last_materialized_by: input.actorBusinessUserId,
    last_verified_at: new Date().toISOString(),
  }, { onConflict: 'shift_id,event_kind,operational_role' })
  if (error) throw new Error('ATTENDANCE_DRIVE_FOLDER_REGISTRY_WRITE_FAILED')
}

export async function prepareAttendancePhotoDestination(
  client: SupabaseClient,
  input: {
    shiftId: string
    shiftDate: string
    role: PhotoRole
    eventKind: AttendancePhotoEventKind
    fileName: string
    actorBusinessUserId: string
  },
) {
  const routes = createOperationalStorageDomainRouteRepository({ client })
  const placement = await routes.resolveAttendancePhotoPlacement({
    shiftId: input.shiftId,
    shiftDate: input.shiftDate,
    operationalRole: input.role,
    eventKind: input.eventKind,
    fileName: input.fileName,
  })
  const destination = await createWritableDestination(client, placement)
  const parentId = await destination.materialize(placement, folder => persistAttendancePhotoFolder(client, {
    shiftId: input.shiftId, eventKind: input.eventKind, role: input.role,
    actorBusinessUserId: input.actorBusinessUserId,
  }, folder))
  return { ...destination, parentId, folderPath: placement.folderPath }
}

export async function materializeAttendancePhotoFolders(
  client: SupabaseClient,
  input: { shiftId: string; shiftDate: string; actorBusinessUserId: string },
) {
  const routes = createOperationalStorageDomainRouteRepository({ client })
  const destinations = new Map<string, AttendancePhotoDestination>()
  for (const eventKind of ['check_in', 'check_out'] as const) {
    for (const role of attendancePhotoRoles) {
      const placement = await routes.resolveAttendancePhotoPlacement({
        shiftId: input.shiftId,
        shiftDate: input.shiftDate,
        operationalRole: role,
        eventKind,
        fileName: 'folder-probe.jpg',
      })
      let destination = destinations.get(placement.baseFolderId)
      if (!destination) {
        destination = await createWritableDestination(client, placement)
        destinations.set(placement.baseFolderId, destination)
      }
      await destination.materialize(placement, folder => persistAttendancePhotoFolder(client, {
        shiftId: input.shiftId, eventKind, role, actorBusinessUserId: input.actorBusinessUserId,
      }, folder))
    }
  }
  for (const group of attendanceDriveFolderGroups) {
    const placement = await routes.resolveAttendanceDriveFolderPlacement({
      group, shiftId: input.shiftId, shiftDate: input.shiftDate, fileName: 'folder-probe.json',
    })
    let destination = destinations.get(placement.baseFolderId)
    if (!destination) {
      destination = await createWritableDestination(client, placement)
      destinations.set(placement.baseFolderId, destination)
    }
    await destination.materialize(placement)
  }
  return attendancePhotoRoles.length * 2 + attendanceDriveFolderGroups.length
}
