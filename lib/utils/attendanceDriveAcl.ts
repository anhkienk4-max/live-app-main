/**
 * Attendance photographs include identifiable workers and exact work shifts.
 * A folder with link-public or domain-wide grants is NOT an acceptable evidence
 * destination, even when the current OAuth actor has canAddChildren=true.
 *
 * This pure check is shared by production preflight and source regression.
 */
export type AttendanceDrivePermission = {
  type?: string | null
  role?: string | null
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
): void {
  if(!complete || !Array.isArray(permissions) || permissions.length===0) {
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
  }
  for(const permission of permissions) {
    if(!permission || typeof permission!=='object' ||
      typeof permission.type!=='string' || typeof permission.role!=='string') {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
    if(permission.type==='anyone' || permission.type==='domain') {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_PUBLIC')
    }
    if(!['user','group'].includes(permission.type) ||
      !['owner','organizer','fileOrganizer','writer','commenter','reader'].includes(permission.role)) {
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
  }
}
