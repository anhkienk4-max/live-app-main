import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'

export interface StaffingLabel {
  id: string
  name: string
  isUnassigned: boolean
  isImportedOnly: boolean
  avatarUrl?: string
}

const isStaffed = (registration: ShiftRegistration) =>
  registration.status === 'approved' || registration.status === 'manually_assigned'

export function resolveStaffingLabels(
  shift: Shift,
  registrations: ShiftRegistration[],
  users: User[],
  t: (key: string) => string
): StaffingLabel[] {
  const approved = registrations.filter(isStaffed)
  
  const labels: StaffingLabel[] = approved.map(r => {
    if (r.user_id) {
      const u = users.find(u => u.id === r.user_id)
      return {
        id: `reg-${r.id}`,
        name: u?.full_name || t('unknownUser'),
        isUnassigned: false,
        isImportedOnly: false,
        avatarUrl: u?.avatar_url
      }
    }
    return {
      id: `reg-${r.id}`,
      name: r.imported_name || t('unassigned'),
      isUnassigned: !r.imported_name,
      isImportedOnly: !!r.imported_name,
    }
  })

  const requiredCount = (shift.required_host_count ?? 1) + (shift.required_support_count ?? 0) + (shift.required_technical_count ?? 0)
  const missingCount = Math.max(0, requiredCount - approved.length)
  
  if (missingCount > 0 && shift.host_names?.length) {
    const assignedImported = new Set(approved.map(r => r.imported_name).filter(Boolean))
    for (const name of shift.host_names) {
      if (!assignedImported.has(name)) {
        labels.push({
          id: `imp-${name}`,
          name,
          isUnassigned: false,
          isImportedOnly: true,
        })
        if (labels.length >= requiredCount) break
      }
    }
  }

  while (labels.length < requiredCount) {
    labels.push({
      id: `unassigned-${labels.length}`,
      name: t('unassigned'),
      isUnassigned: true,
      isImportedOnly: false,
    })
  }

  return labels
}

export function resolveStaffingLabelsForRole(
  shift: Shift,
  registrations: ShiftRegistration[],
  users: User[],
  role: 'host' | 'support' | 'technical',
  t: (key: string) => string
): StaffingLabel[] {
  const roleRegistrations = registrations.filter(r => r.operational_role === role)
  const approved = roleRegistrations.filter(isStaffed)
  
  const labels: StaffingLabel[] = []
  const authoritativeNames = new Set<string>()

  // 1. Add authoritative assignments (approved registrations)
  for (const r of approved) {
    let name: string
    let isImportedOnly = false
    if (r.user_id) {
      const u = users.find(u => u.id === r.user_id)
      name = u?.full_name || t('unknownUser')
    } else {
      name = r.imported_name || t('unassigned')
      isImportedOnly = !!r.imported_name
    }
    if (!authoritativeNames.has(name)) {
      authoritativeNames.add(name)
      const label: StaffingLabel = {
        id: `reg-${r.id}`,
        name,
        isUnassigned: false,
        isImportedOnly,
      }
      if (r.user_id) {
        const u = users.find(u => u.id === r.user_id)
        if (u?.avatar_url) label.avatarUrl = u.avatar_url
      }
      labels.push(label)
    }
  }

  const requiredCount = role === 'host' ? (shift.required_host_count ?? 1) : role === 'support' ? (shift.required_support_count ?? 0) : (shift.required_technical_count ?? 0)
  const roleImportedNames = role === 'host' ? shift.host_names : role === 'support' ? shift.assistant_names : shift.technical_names

  // 2. Keep all imported display metadata that is not already authoritative.
  if (roleImportedNames?.length) {
    for (const name of roleImportedNames) {
      if (!authoritativeNames.has(name)) {
        authoritativeNames.add(name)
        labels.push({
          id: `imp-${name}`,
          name,
          isUnassigned: false,
          isImportedOnly: true,
        })
      }
    }
  }

  // 3. Pad with unassigned if still below required count
  while (labels.length < requiredCount) {
    labels.push({
      id: `unassigned-${role}-${labels.length}`,
      name: t('unassigned'),
      isUnassigned: true,
      isImportedOnly: false,
    })
  }

  return labels
}
