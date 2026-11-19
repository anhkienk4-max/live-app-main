/** Reports existing Drive sharing without treating it as ADA Ops write authorization. */
export type AttendanceDrivePermissionDetail = {
  inherited?: boolean | null
  inheritedFrom?: string | null
  permissionType?: string | null
  role?: string | null
}

export type AttendanceDrivePermission = {
  type?: string | null
  role?: string | null
  view?: string | null
  inheritedPermissionsDisabled?: boolean | null
  permissionDetails?: AttendanceDrivePermissionDetail[] | null
}

export type AttendanceDriveAclStatus = {
  publicAccess: boolean
}

export type AttendanceDriveAclErrorCode =
  | 'ATTENDANCE_DRIVE_ACL_UNVERIFIED'
  | 'ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED'

export class AttendanceDriveAclError extends Error {
  constructor(readonly code: AttendanceDriveAclErrorCode) {
    super(code)
    this.name='AttendanceDriveAclError'
  }
}

const VALID_DRIVE_ROLES = new Set([
  'owner',
  'organizer',
  'fileOrganizer',
  'writer',
  'commenter',
  'reader',
  'publishedReader',
])

export function inspectAttendanceDrivePermissions(
  permissions: AttendanceDrivePermission[],
  complete: boolean,
  options?: { inheritedPermissionsDisabled?: boolean | null },
): AttendanceDriveAclStatus {
  if(!complete || !Array.isArray(permissions) || permissions.length===0) {
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
  }
  let publicAccess=false
  for(const permission of permissions) {
    if(!permission || typeof permission!=='object' ||
      typeof permission.type!=='string' || typeof permission.role!=='string') {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
    if(permission.type==='anyone' || permission.type==='domain') {
      if(!VALID_DRIVE_ROLES.has(permission.role)) {
        throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
      }
      // Under Google Drive Limited Access, a metadata-view entry on a folder with
      // inheritedPermissionsDisabled=true exposes existence/metadata only, not content.
      if(permission.view==='metadata' && options?.inheritedPermissionsDisabled===true) {
        continue
      }
      publicAccess=true
      continue
    }
    if(!['user','group'].includes(permission.type) || !VALID_DRIVE_ROLES.has(permission.role)) {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
  }
  return {publicAccess}
}

/** Fail-closed guard for sensitive Attendance Drive write paths. */
export function assertPrivateAttendanceDriveAcl(status: AttendanceDriveAclStatus): void {
  if (status.publicAccess) {
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_PUBLIC_ACCESS_BLOCKED')
  }
}
