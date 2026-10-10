import { SystemPermission } from '@/lib/types/database.types'
import type { TranslationKey } from '@/lib/i18n'

export type RoleLensConfig = {
  roleLabelKey: TranslationKey
  scopeLabelKey: TranslationKey
  defaultDashboardTab?: string
  defaultCalendarTab: string
  defaultReportsTab: string
  showActionQueue: boolean
  showGlobalMetrics: boolean
  showFinancials: boolean
}

export const ROLE_LENS_CONFIG: Record<SystemPermission, RoleLensConfig> = {
  admin: {
    roleLabelKey: 'roleAdmin',
    scopeLabelKey: 'scopeGlobal',
    defaultDashboardTab: undefined,
    defaultCalendarTab: 'calendar',
    defaultReportsTab: 'all',
    showActionQueue: true,
    showGlobalMetrics: true,
    showFinancials: true,
  },
  leader: {
    roleLabelKey: 'roleLeader',
    scopeLabelKey: 'scopeTeam',
    defaultDashboardTab: undefined,
    defaultCalendarTab: 'open',
    defaultReportsTab: 'all',
    showActionQueue: true,
    showGlobalMetrics: false,
    showFinancials: false,
  },
  member: {
    roleLabelKey: 'roleMember',
    scopeLabelKey: 'scopePersonal',
    defaultDashboardTab: undefined,
    defaultCalendarTab: 'mine',
    defaultReportsTab: 'mine',
    showActionQueue: false,
    showGlobalMetrics: false,
    showFinancials: false,
  },
}

export function getRoleLens(systemPermission: SystemPermission | undefined | null): RoleLensConfig | null {
  if (!systemPermission || !ROLE_LENS_CONFIG[systemPermission]) {
    return null
  }
  return ROLE_LENS_CONFIG[systemPermission]
}
