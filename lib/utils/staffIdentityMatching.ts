import type {
  OperationalRole,
  ShiftStaffIdentityMatchMethod,
  User,
} from '@/lib/types/database.types'
export type ShiftStaffIdentityMatchStatus = 'unmatched' | 'candidate' | 'ambiguous'

export interface ShiftStaffIdentityMatch {
  importedName: string
  role: OperationalRole
  status: ShiftStaffIdentityMatchStatus
  method?: Exclude<ShiftStaffIdentityMatchMethod, 'manual'>
  candidates: User[]
  suggestedUser?: User
}

const collapseWhitespace = (value: string) => value.trim().replace(/\s+/g, ' ')

export function normalizeStaffIdentityName(value: string): string {
  return collapseWhitespace(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, matched => matched === 'Đ' ? 'D' : 'd')
    .toLocaleLowerCase('vi')
}

function exactStaffIdentityName(value: string): string {
  return collapseWhitespace(value).toLocaleLowerCase('vi')
}

function eligibleUsers(users: User[], role: OperationalRole): User[] {
  return users.filter(user =>
    user.status === 'active' && user.operational_roles?.includes(role),
  )
}

function resultForCandidates(
  importedName: string,
  role: OperationalRole,
  method: 'exact' | 'normalized',
  candidates: User[],
): ShiftStaffIdentityMatch {
  if (candidates.length === 1) {
    return {
      importedName,
      role,
      status: 'candidate',
      method,
      candidates,
      suggestedUser: candidates[0],
    }
  }

  return {
    importedName,
    role,
    status: candidates.length > 1 ? 'ambiguous' : 'unmatched',
    method: candidates.length > 1 ? method : undefined,
    candidates,
  }
}

export function deriveShiftStaffIdentityMatch(
  importedName: string,
  role: OperationalRole,
  users: User[],
): ShiftStaffIdentityMatch {
  const roleUsers = eligibleUsers(users, role)
  const exactName = exactStaffIdentityName(importedName)
  const exactCandidates = roleUsers.filter(user =>
    exactStaffIdentityName(user.full_name) === exactName,
  )

  if (exactCandidates.length > 0) {
    return resultForCandidates(importedName, role, 'exact', exactCandidates)
  }

  const normalizedName = normalizeStaffIdentityName(importedName)
  const normalizedCandidates = roleUsers.filter(user =>
    normalizeStaffIdentityName(user.full_name) === normalizedName,
  )
  return resultForCandidates(importedName, role, 'normalized', normalizedCandidates)
}

export function deriveShiftStaffIdentityMatches(
  labels: Partial<Record<OperationalRole, string[]>>,
  users: User[],
): ShiftStaffIdentityMatch[] {
  return (['host', 'support', 'technical'] as OperationalRole[]).flatMap(role =>
    (labels[role] ?? []).map(importedName =>
      deriveShiftStaffIdentityMatch(importedName, role, users),
    ),
  )
}
