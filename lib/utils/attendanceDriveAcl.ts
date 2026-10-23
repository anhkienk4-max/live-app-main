/**
 * Permission audit for the operator-approved employee check-in folder.
 * The default rejects any public/domain grant. A separately configured,
 * explicit operator acceptance can permit that EXISTING exposure, but never
 * an unreadable, incomplete or malformed ACL.
 *
 * IMPORTANT: accepted public access does NOT make employee images private.
 */
export type AttendanceDrivePermission = {
  type?: string | null
  role?: string | null
}

export type AttendanceDriveAclStatus = {
  publicAccess: boolean
}

export class AttendanceDriveAclError extends Error {
  constructor(readonly code: 'ATTENDANCE_DRIVE_ACL_PUBLIC'|'ATTENDANCE_DRIVE_ACL_UNVERIFIED') {
    super(code)
    this.name='AttendanceDriveAclError'
  }
}

export function assertPrivateAttendanceDrivePermissions(
  permissions: AttendanceDrivePermission[],
  complete: boolean,
  allowPublicAccess=false,
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
      if(!['owner','organizer','fileOrganizer','writer','commenter','reader'].includes(permission.role)) {
        throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
      }
      publicAccess=true
      continue
    }
    if(!['user','group'].includes(permission.type) ||
      !['owner','organizer','fileOrganizer','writer','commenter','reader'].includes(permission.role)) {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
  }
  if(publicAccess&&!allowPublicAccess)
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_PUBLIC')
  return {publicAccess}
}
