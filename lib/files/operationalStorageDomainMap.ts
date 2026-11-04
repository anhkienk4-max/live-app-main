import registry from '@/docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json'
import routeMap from '@/docs/storage/ADA_OPS_STORAGE_ROUTE_MAP_V1.json'
import type { OperationalFileCategory } from '@/lib/files/operationalFileCatalog'

export const ADA_OPS_ROOT_ID = registry.app_root_folder_id
export const ADA_OPS_REPORT_ROOT_PATH = '00_ADA_OPS_PLATFORM/03_LIVE_REPORTS'
export const ADA_OPS_REPORT_ROOT_ID = routeMap.report_root_id
export const REPORT_ARTIFACT_GROUPS = Object.keys(routeMap.report_artifact_groups) as Array<keyof typeof routeMap.report_artifact_groups>
export type ReportArtifactGroup = keyof typeof routeMap.report_artifact_groups
export type AttendancePhotoEventKind = 'check_in' | 'check_out'
export const ATTENDANCE_DRIVE_FOLDER_GROUPS = {
  late_no_show: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/03_LATE_NO_SHOW_EVIDENCE',
  review_corrections: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/04_REVIEW_AND_CORRECTIONS',
  manifest_checksums: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/05_FILE_MANIFESTS_CHECKSUMS',
  check_in_events: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/01_CHECKIN_EVENT_SNAPSHOTS',
  check_out_events: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/02_CHECKOUT_EVENT_SNAPSHOTS',
  review_decisions: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/03_REVIEW_DECISION_SNAPSHOTS',
  approved_actual_hours: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/04_APPROVED_ACTUAL_HOURS_SNAPSHOTS',
  reconciliation_audit: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/05_RECONCILIATION_AUDIT',
  exports: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/02_CHECKIN_CHECKOUT_EVENTS/06_EXPORTS',
} as const
export type AttendanceDriveFolderGroup = keyof typeof ATTENDANCE_DRIVE_FOLDER_GROUPS

const attendancePhotoPaths: Record<AttendancePhotoEventKind, string> = {
  check_in: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/01_CHECKIN_PHOTOS',
  check_out: '00_ADA_OPS_PLATFORM/08_HR_RESTRICTED_PENDING_ACCESS/01_ATTENDANCE_PRIVATE_EVIDENCE/02_CHECKOUT_PHOTOS',
}

export type DomainFolderRoute = {
  path: string
  folderId: string
  parentFolderId: string
  rootFolderId: string
  accessClassification: string
  sensitive: boolean
  requiresSubtype: boolean
}

export function canWriteOperationalStoragePlacement(classification: string, sensitive: boolean): boolean {
  if (classification === 'restricted_verified') return true
  return !sensitive && (classification === 'shared' || classification === 'pending_restriction_no_sensitive_upload')
}

const registryFolders = new Map(registry.folders.map(folder => [folder.path, folder]))
const categoryRoutes = routeMap.standard_category_routes as Record<OperationalFileCategory, {
  domain_folder_id: string
  path: string
  app_root_id: string
  sensitive: boolean
  requires_subtype: boolean
}>

export function domainFolderAncestors(path: string): string[] {
  const segments = path.split('/')
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'))
}

export function domainFolderForPath(path: string): DomainFolderRoute {
  const folder = registryFolders.get(path)
  if (!folder) throw new Error('STORAGE_ROUTE_CONFIG_INVALID')
  return {
    path: folder.path,
    folderId: folder.id,
    parentFolderId: folder.parent_id,
    rootFolderId: ADA_OPS_ROOT_ID,
    accessClassification: folder.access_classification,
    sensitive: false,
    requiresSubtype: false,
  }
}

export function domainFolderForCategory(category: OperationalFileCategory): DomainFolderRoute {
  const route = categoryRoutes[category]
  const folder = route?.path ? domainFolderForPath(route.path) : null
  if (!route || !folder || folder.folderId !== route.domain_folder_id || route.app_root_id !== ADA_OPS_ROOT_ID) {
    throw new Error('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return {
    ...folder,
    rootFolderId: route.app_root_id,
    sensitive: route.sensitive,
    requiresSubtype: route.requires_subtype,
  }
}

export function domainFolderForReportGroup(group: ReportArtifactGroup): DomainFolderRoute {
  const folder = domainFolderForPath(ADA_OPS_REPORT_ROOT_PATH)
  if (folder.folderId !== ADA_OPS_REPORT_ROOT_ID
    || !routeMap.report_subfolders.includes(routeMap.report_artifact_groups[group])) {
    throw new Error('STORAGE_ROUTE_CONFIG_INVALID')
  }
  return {
    ...folder,
    rootFolderId: ADA_OPS_ROOT_ID,
    sensitive: true,
    requiresSubtype: true,
  }
}

export function domainFolderForAttendancePhoto(eventKind: AttendancePhotoEventKind): DomainFolderRoute {
  return { ...domainFolderForPath(attendancePhotoPaths[eventKind]), sensitive: true, requiresSubtype: true }
}

export function domainFolderForAttendanceGroup(group: AttendanceDriveFolderGroup): DomainFolderRoute {
  return { ...domainFolderForPath(ATTENDANCE_DRIVE_FOLDER_GROUPS[group]), sensitive: true, requiresSubtype: true }
}

export function reportArtifactGroupFolder(group: ReportArtifactGroup): string {
  return routeMap.report_artifact_groups[group]
}
