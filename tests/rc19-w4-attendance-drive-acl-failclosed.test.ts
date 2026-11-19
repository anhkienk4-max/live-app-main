import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createAttendanceFolderMaterializationHandler } from '@/lib/server/attendanceFolderMaterializationHandler'
import { inspectAttendanceDriveRoot, verifyAttendanceDriveWriteAcl } from '@/lib/server/attendanceDriveAcl'
import { prepareAttendancePhotoDestination } from '@/lib/server/attendancePhotoDrive'
import { createSelfAttendancePhotoPostHandler } from '@/lib/server/selfAttendancePhotoHandler'
import {
  AttendanceDriveAclError,
  assertPrivateAttendanceDriveAcl,
  inspectAttendanceDrivePermissions,
} from '@/lib/utils/attendanceDriveAcl'

const SYNTHETIC_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

const FULL_RESTRICTED_CHAIN = [
  {
    folder_path: '00_ADA_OPS_PLATFORM',
    folder_id: '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh',
    parent_folder_id: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    access_classification: 'restricted_verified',
    active: true,
    verified_created: true,
  },
  {
    folder_path: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS',
    folder_id: '1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN',
    parent_folder_id: '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh',
    access_classification: 'restricted_verified',
    active: true,
    verified_created: true,
  },
  {
    folder_path: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE',
    folder_id: '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG',
    parent_folder_id: '1OUgQGcZsC3ZIEI5u8x57A1hUQJkidbwN',
    access_classification: 'restricted_verified',
    active: true,
    verified_created: true,
  },
  {
    folder_path: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/01_CHECKIN_PHOTOS',
    folder_id: '1-CdyoEbNj0eFuwVd72sJPoqBxla4cF4m',
    parent_folder_id: '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG',
    access_classification: 'restricted_verified',
    active: true,
    verified_created: true,
  },
  {
    folder_path: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/02_CHECKOUT_PHOTOS',
    folder_id: '14UbygcI5M5GYEjfkkoxR91tWxyLSqYwd',
    parent_folder_id: '1w1Ip1M6BoJgzbdoqO6o8HJPM0deaxgkG',
    access_classification: 'restricted_verified',
    active: true,
    verified_created: true,
  },
]

function createRestrictedChainSupabaseStub(options: { insertCountRef?: { count: number } } = {}) {
  const shiftRow = {
    id: 'shift-w4-acl-1',
    date: '2026-11-19',
    brand_id: 'brand-a',
    platform_id: 'tiktok',
    agency_code: 'ada',
    execution_source: 'internal',
  }
  return {
    from(table: string) {
      let inPaths: string[] = []
      const chain: Record<string, unknown> = {
        select() { return chain },
        eq() { return chain },
        is() { return chain },
        in(_col: string, values: string[]) {
          inPaths = values
          return chain
        },
        insert() {
          if (options.insertCountRef) options.insertCountRef.count += 1
          return chain
        },
        single: async () => ({ data: null, error: null }),
        maybeSingle: async () => {
          if (table === 'shifts') return { data: shiftRow, error: null }
          return { data: null, error: null }
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (err: unknown) => unknown) {
          const data = table === 'operational_storage_domain_folders'
            ? FULL_RESTRICTED_CHAIN.filter(row => inPaths.includes(row.folder_path))
            : []
          return Promise.resolve({ data, error: null }).then(resolve, reject)
        },
      }
      return chain
    },
  } as never
}

test('Limited Access permissions distinguish metadata view with disabled inheritance from public content access', () => {
  // Public content grant without Limited Access fails closed
  const publicStatus = inspectAttendanceDrivePermissions([{ type: 'user', role: 'owner' }, { type: 'anyone', role: 'reader', view: null }], true, { inheritedPermissionsDisabled: false })
  assert.equal(publicStatus.publicAccess, true)
  assert.throws(
    () => assertPrivateAttendanceDriveAcl(publicStatus),
    (err: unknown) => err instanceof AttendanceDriveAclError && err.code === 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED',
  )

  // Metadata view WITHOUT inheritedPermissionsDisabled=true must NOT be treated as safe
  const metadataUnprotected = inspectAttendanceDrivePermissions(
    [{ type: 'user', role: 'owner' }, { type: 'anyone', role: 'reader', view: 'metadata' }],
    true,
    { inheritedPermissionsDisabled: false },
  )
  assert.equal(metadataUnprotected.publicAccess, true)
  assert.throws(() => assertPrivateAttendanceDriveAcl(metadataUnprotected), /ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED/)

  // Direct anyone grant (view !== 'metadata') even when inheritedPermissionsDisabled=true still fails closed
  const directPublic = inspectAttendanceDrivePermissions(
    [{ type: 'user', role: 'owner' }, { type: 'anyone', role: 'reader', view: 'published' }],
    true,
    { inheritedPermissionsDisabled: true },
  )
  assert.equal(directPublic.publicAccess, true)
  assert.throws(() => assertPrivateAttendanceDriveAcl(directPublic), /ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED/)

  // Google Drive Limited Access: inheritedPermissionsDisabled=true AND view='metadata' only -> safe
  const limitedAccessSafe = inspectAttendanceDrivePermissions(
    [{ type: 'user', role: 'owner' }, { type: 'anyone', role: 'reader', view: 'metadata' }],
    true,
    { inheritedPermissionsDisabled: true },
  )
  assert.equal(limitedAccessSafe.publicAccess, false)
  assert.doesNotThrow(() => assertPrivateAttendanceDriveAcl(limitedAccessSafe))

  // Empty, incomplete, or unknown permission sets stay ATTENDANCE_DRIVE_ACL_UNVERIFIED
  assert.throws(() => inspectAttendanceDrivePermissions([], true), /ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
  assert.throws(() => inspectAttendanceDrivePermissions([{ type: 'user', role: 'owner' }], false), /ATTENDANCE_DRIVE_ACL_UNVERIFIED/)
})

test('verifyAttendanceDriveWriteAcl queries Drive Limited Access fields and blocks inherited public access', async () => {
  const folderId = '14UbygcI5M5GYEjfkkoxR91tWxyLSqYwd'
  const limitedClient = {
    files: {
      get: async () => ({
        data: { id: folderId, trashed: false, inheritedPermissionsDisabled: true },
      }),
    },
    permissions: {
      list: async () => ({
        data: {
          permissions: [
            { type: 'user', role: 'owner', view: null, inheritedPermissionsDisabled: true },
            { type: 'anyone', role: 'reader', view: 'metadata', inheritedPermissionsDisabled: true },
          ],
        },
      }),
    },
  }
  const safe = await inspectAttendanceDriveRoot(folderId, { GOOGLE_DRIVE_ROOT_FOLDER_ID: folderId }, limitedClient)
  assert.deepEqual(safe, { publicAccess: false })
  await assert.doesNotReject(() => verifyAttendanceDriveWriteAcl(folderId, { GOOGLE_DRIVE_ROOT_FOLDER_ID: folderId }, limitedClient))

  const publicInheritedClient = {
    files: {
      get: async () => ({
        data: { id: folderId, trashed: false, inheritedPermissionsDisabled: false },
      }),
    },
    permissions: {
      list: async () => ({
        data: {
          permissions: [
            { type: 'user', role: 'owner' },
            {
              type: 'anyone',
              role: 'reader',
              permissionDetails: [{ inherited: true, inheritedFrom: '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh', role: 'reader', permissionType: 'anyone' }],
            },
          ],
        },
      }),
    },
  }
  await assert.rejects(
    () => verifyAttendanceDriveWriteAcl(folderId, { GOOGLE_DRIVE_ROOT_FOLDER_ID: folderId }, publicInheritedClient),
    (err: unknown) => err instanceof AttendanceDriveAclError && err.code === 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED',
  )

  const trashedFolderClient = {
    files: { get: async () => ({ data: { id: folderId, trashed: true } }) },
    permissions: { list: async () => ({ data: { permissions: [{ type: 'user', role: 'owner' }] } }) },
  }
  await assert.rejects(
    () => verifyAttendanceDriveWriteAcl(folderId, { GOOGLE_DRIVE_ROOT_FOLDER_ID: folderId }, trashedFolderClient),
    (err: unknown) => err instanceof AttendanceDriveAclError && err.code === 'ATTENDANCE_DRIVE_ACL_UNVERIFIED',
  )
})

test('prepareAttendancePhotoDestination fails closed on BOTH check_in and check_out when Drive ACL is public even if DB says restricted_verified', async () => {
  const client = createRestrictedChainSupabaseStub()
  const checkedFolders: string[] = []
  const healthyDriveFactory = (root: string) => ({
    root,
    drive: {
      healthCheck: async () => ({ ok: true, provider: 'google_drive', root_readable: true, root_can_add_children: true }),
    } as never,
  })
  const denyPublicAcl = async (rootId: string) => {
    checkedFolders.push(rootId)
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED')
  }

  for (const eventKind of ['check_in', 'check_out'] as const) {
    await assert.rejects(
      () => prepareAttendancePhotoDestination(client, {
        shiftId: 'shift-w4-acl-1',
        shiftDate: '2026-11-19',
        role: 'host',
        eventKind,
        fileName: 'photo.jpg',
        actorBusinessUserId: 'staff-1',
      }, { createDrive: healthyDriveFactory, verifyWriteAcl: denyPublicAcl }),
      (err: unknown) => err instanceof AttendanceDriveAclError && err.code === 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED',
    )
  }
  assert.deepEqual(checkedFolders, [
    '1-CdyoEbNj0eFuwVd72sJPoqBxla4cF4m',
    '14UbygcI5M5GYEjfkkoxR91tWxyLSqYwd',
  ])
})

test('POST /api/workforce/self-attendance-photo returns 503 with zero uploads/DB writes when Drive ACL blocks write', async () => {
  const prevPhoto = process.env.FEATURE_SELF_ATTENDANCE_PHOTO
  const prevStorage = process.env.FILE_STORAGE_ENABLED
  process.env.FEATURE_SELF_ATTENDANCE_PHOTO = 'true'
  process.env.FILE_STORAGE_ENABLED = 'true'
  const insertCounter = { count: 0 }
  try {
    const post = createSelfAttendancePhotoPostHandler({
      authorize: async () => ({ id: 'auth-staff-1', businessUserId: 'staff-1', systemPermission: 'member' }),
      createAdmin: () => createRestrictedChainSupabaseStub({ insertCountRef: insertCounter }),
      createSession: async () => ({
        rpc: async () => ({
          data: {
            shift_id: 'shift-w4-acl-1',
            staff_id: 'staff-1',
            staff_name: 'Host A',
            role: 'host',
            date: '2026-11-19',
            start_time: '09:00',
            end_time: '11:00',
            start_at: '2026-11-19T02:00:00Z',
            end_at: '2026-11-19T04:00:00Z',
            brand: 'BrandA',
            platform: 'TikTok',
            studio: 'Studio 1',
            title: 'Live 1',
          },
          error: null,
        }),
      }) as never,
      prepareDestination: async () => {
        throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED')
      },
    })

    const form = new FormData()
    form.set('shift_id', 'shift-w4-acl-1')
    form.set('role', 'host')
    form.set('event_kind', 'check_out')
    form.set('request_id', '11111111-1111-4111-8111-111111111111')
    form.set('capture_source', 'camera')
    form.set('file', new File([SYNTHETIC_PNG_BYTES], 'probe.png', { type: 'image/png' }))

    const res = await post(new Request('https://app.test/api/workforce/self-attendance-photo', {
      method: 'POST',
      headers: { origin: 'https://app.test' },
      body: form,
    }))
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.deepEqual(body, { ok: false, error: { code: 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED' } })
    assert.equal(insertCounter.count, 0)
  } finally {
    if (prevPhoto === undefined) delete process.env.FEATURE_SELF_ATTENDANCE_PHOTO
    else process.env.FEATURE_SELF_ATTENDANCE_PHOTO = prevPhoto
    if (prevStorage === undefined) delete process.env.FILE_STORAGE_ENABLED
    else process.env.FILE_STORAGE_ENABLED = prevStorage
  }
})

test('folder materialization and photo correction routes fail closed 503 on AttendanceDriveAclError', async () => {
  const matHandler = createAttendanceFolderMaterializationHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }),
    createClient: () => ({
      from: () => {
        const q: Record<string, unknown> = {
          select: () => q,
          in: () => q,
          is: () => q,
          then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
            Promise.resolve({ data: [{ id: 'shift-1', date: '2026-11-19', created_by: 'admin-1' }], error: null }).then(resolve),
        }
        return q
      },
    }) as never,
    materialize: async () => {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED')
    },
  })
  const matRes = await matHandler(new Request('https://app.test/api/operational-storage/attendance-folders', {
    method: 'POST',
    headers: { origin: 'https://app.test', 'content-type': 'application/json' },
    body: JSON.stringify({ shift_ids: ['shift-1'] }),
  }))
  assert.equal(matRes.status, 503)
  assert.deepEqual(await matRes.json(), { ok: false, error: { code: 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED' } })

  const correctionSrc = readFileSync(new URL('../lib/server/selfAttendancePhotoCorrectionHandler.ts', import.meta.url), 'utf8')
  assert.match(correctionSrc, /await prepareAttendancePhotoDestination\(admin,/)
  assert.match(correctionSrc, /if\(error instanceof AttendanceDriveAclError\)return fail\(error\.code,503\)/)
})
