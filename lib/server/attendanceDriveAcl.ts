import 'server-only'

import { google } from 'googleapis'
import { createGoogleDriveAuth, type GoogleDriveEnvironment } from '@/lib/server/googleDriveAuth'
import { inspectAttendanceDrivePermissions, AttendanceDriveAclError,
  type AttendanceDrivePermission, type AttendanceDriveAclStatus } from '@/lib/utils/attendanceDriveAcl'

type PermissionPage = {
  permissions?: AttendanceDrivePermission[] | null
  nextPageToken?: string | null
}
type DrivePermissionsClient = {
  permissions: {
    list(options:{
      fileId:string
      fields:string
      pageSize:number
      pageToken?:string
      supportsAllDrives:boolean
    }):Promise<{data:PermissionPage}>
  }
}

/** Read-only ACL inventory under the same runtime identity; this never changes Drive sharing. */
export async function inspectAttendanceDriveRoot(
  rootId:string,
  env:GoogleDriveEnvironment=process.env,
  client?:DrivePermissionsClient,
):Promise<AttendanceDriveAclStatus> {
  if(!/^[A-Za-z0-9_-]{12,120}$/.test(rootId))
    throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
  const drive=client??(google.drive({
    version:'v3',
    auth:createGoogleDriveAuth(env).auth as Parameters<typeof google.drive>[0]['auth'],
  }) as unknown as DrivePermissionsClient)
  const all:AttendanceDrivePermission[]=[]
  let pageToken:string|undefined
  const visited=new Set<string>()
  let complete=false
  for(let page=0;page<10;page++){
    let data:PermissionPage
    try {
      const response=await drive.permissions.list({
        fileId:rootId,fields:'nextPageToken,permissions(type,role)',
        pageSize:100,pageToken,supportsAllDrives:true,
      })
      data=response.data
    }catch{
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    }
    if(!data || !Array.isArray(data.permissions) || data.permissions.length>100)
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    all.push(...data.permissions)
    if(!data.nextPageToken){complete=true;break}
    if(visited.has(data.nextPageToken))
      throw new AttendanceDriveAclError('ATTENDANCE_DRIVE_ACL_UNVERIFIED')
    visited.add(data.nextPageToken)
    pageToken=data.nextPageToken
  }
  return inspectAttendanceDrivePermissions(all,complete)
}
