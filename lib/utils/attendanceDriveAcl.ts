/** Reports existing Drive sharing without treating it as ADA Ops write authorization. */
export type AttendanceDrivePermission = {
  type?: string | null
  role?: string | null
}

export type AttendanceDriveAclStatus = {
  publicAccess: boolean
}

export class AttendanceDriveAclError extends Error {
  constructor(readonly code: 'ATTENDANCE_DRIVE_ACL_UNVERIFIED') {
    super(code)
    this.name='AttendanceDriveAclError'
  }
}

export function inspectAttendanceDrivePermissions(
  permissions: AttendanceDrivePermission[],
  complete: boolean,
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
  return {publicAccess}
}
