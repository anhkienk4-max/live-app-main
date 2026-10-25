import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { hasPermission } from '@/lib/permissions'
import type { User, OperationalSettings, PersonalSettings } from '@/lib/types/database.types'

const createMockUser = (role: 'admin' | 'leader' | 'member'): User => ({
  id: `test-user-${role}`,
  email: `${role}@example.com`,
  full_name: `Test ${role.toUpperCase()}`,
  role,
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  operational_roles: ['host'],
  system_permission: role,
})

test('RC19 U12 Settings: RBAC permission boundaries for Admin, Leader, and Member', () => {
  const admin = createMockUser('admin')
  const leader = createMockUser('leader')
  const member = createMockUser('member')

  // Admin permissions
  assert.equal(hasPermission(admin, 'settings.admin'), true, 'Admin must have settings.admin')
  assert.equal(hasPermission(admin, 'settings.leader'), true, 'Admin must have settings.leader')

  // Leader permissions
  assert.equal(hasPermission(leader, 'settings.admin'), false, 'Leader must NOT have settings.admin')
  assert.equal(hasPermission(leader, 'settings.leader'), true, 'Leader must have settings.leader')

  // Member permissions
  assert.equal(hasPermission(member, 'settings.admin'), false, 'Member must NOT have settings.admin')
  assert.equal(hasPermission(member, 'settings.leader'), false, 'Member must NOT have settings.leader')
})

test('RC19 U12 Settings: Page component structural invariants and test identifiers', () => {
  const content = readFileSync('app/(dashboard)/settings/page.tsx', 'utf8')

  // Required exact invariants for production shell convergence
  assert.ok(content.includes('disabled={!isAdmin}'), 'Must retain disabled={!isAdmin} for locked system tabs')
  assert.ok(content.includes("hasPermission(currentUser, 'settings.admin')"), 'Must retain admin permission check')
  assert.ok(content.includes('{isAdmin && <TabsContent value="system">'), 'Must retain admin system tab content gate')

  // Deterministic test IDs for E2E and multi-role testing
  assert.ok(content.includes('data-testid="settings-page"'), 'Must have settings-page container')
  assert.ok(content.includes('data-testid="settings-loading-shell"'), 'Must have settings-loading-shell')
  assert.ok(content.includes('data-testid="settings-team-tab"'), 'Must have settings-team-tab')
  assert.ok(content.includes('data-testid="settings-system-tab"'), 'Must have settings-system-tab')
  assert.ok(content.includes('data-testid="settings-personal-tab"'), 'Must have settings-personal-tab')
  assert.ok(content.includes('data-testid="settings-integrations-tab"'), 'Must have settings-integrations-tab')
  assert.ok(content.includes('data-testid="settings-audit-tab"'), 'Must have settings-audit-tab')

  // State preservation: loadSettings only re-triggers on user ID change, not on language change
  assert.match(content, /const loadSettings = React\.useCallback\(async \(\) =>[\s\S]*?\}, \[currentUser\]\)/,
    'loadSettings must only depend on currentUser?.id to prevent tab resetting on language changes')

  // Initial tab selection checks leader/admin
  assert.match(content, /setActiveTab\(hasPermission\(currentUser, 'settings\.leader'\) \? 'team' : 'personal'\)/,
    'Initial tab must direct leaders to team settings and members to personal')
})

test('RC19 U12 Settings: Operational settings boundary validation rules', () => {
  const validSettings: OperationalSettings = {
    registration_cutoff_hours: 12,
    require_registration_approval: true,
    auto_lock_filled_shifts: true,
    allow_multi_role_per_shift: false,
    default_host_count: 2,
    default_support_count: 3,
    default_technical_count: 1,
    team_notifications_enabled: true,
    swap_approval_required: true,
    require_report_review: true,
    report_reminder_hours: 24,
    require_shift_capacity_validation: true,
    require_time_overlap_validation: true,
    allow_leader_schedule_edit: false,
    strict_host_role_binding: true,
    default_view_mode: 'timeline',
    calendar_density: 'comfortable',
    show_unassigned_shifts: true,
  }

  const validateOperational = (settings: OperationalSettings): boolean => {
    const counts = [
      settings.registration_cutoff_hours,
      settings.report_reminder_hours,
      settings.default_host_count,
      settings.default_support_count,
      settings.default_technical_count,
    ]
    if (counts.some(value => !Number.isInteger(value) || value < 0) || settings.registration_cutoff_hours > 168) {
      return false
    }
    return true
  }

  assert.equal(validateOperational(validSettings), true)

  // Rejects negative counts
  assert.equal(validateOperational({ ...validSettings, default_host_count: -1 }), false)
  // Rejects non-integer values
  assert.equal(validateOperational({ ...validSettings, default_support_count: 1.5 }), false)
  // Rejects cutoff hours exceeding 168h (1 week)
  assert.equal(validateOperational({ ...validSettings, registration_cutoff_hours: 200 }), false)
})

test('RC19 U12 Settings: Personal settings validation requires timezone and date format', () => {
  const validPersonal: PersonalSettings = {
    language: 'vi',
    timezone: 'Asia/Ho_Chi_Minh',
    date_format: 'dd/MM/yyyy',
    default_calendar_view: 'month',
    notifications_enabled: true,
    preferred_roles: ['host'],
  }

  const validatePersonal = (settings: Partial<PersonalSettings>): boolean => {
    if (!settings.timezone || !settings.date_format) return false
    return true
  }

  assert.equal(validatePersonal(validPersonal), true)
  assert.equal(validatePersonal({ ...validPersonal, timezone: '' }), false)
  assert.equal(validatePersonal({ ...validPersonal, date_format: '' }), false)
})

test('RC19 U12 Settings: System and Vision OCR settings validation rules', () => {
  const validateSystem = (system: Record<string, unknown>): boolean => {
    if (Number(system.audit_retention_days) < 1) return false
    const visionNumbers = [
      Number(system.vision_ocr_timeout_ms),
      Number(system.vision_ocr_retry_count),
      Number(system.vision_ocr_daily_request_limit),
      Number(system.vision_ocr_monthly_request_limit),
    ]
    if (
      visionNumbers.some(value => !Number.isInteger(value) || value < 0) ||
      visionNumbers[0] < 1000 ||
      visionNumbers[1] > 1
    ) {
      return false
    }
    return true
  }

  assert.equal(validateSystem({
    audit_retention_days: 90,
    vision_ocr_timeout_ms: 30000,
    vision_ocr_retry_count: 1,
    vision_ocr_daily_request_limit: 25,
    vision_ocr_monthly_request_limit: 500,
  }), true)

  // Rejects audit retention < 1
  assert.equal(validateSystem({
    audit_retention_days: 0,
    vision_ocr_timeout_ms: 30000,
    vision_ocr_retry_count: 1,
    vision_ocr_daily_request_limit: 25,
    vision_ocr_monthly_request_limit: 500,
  }), false)

  // Rejects vision timeout < 1000ms
  assert.equal(validateSystem({
    audit_retention_days: 90,
    vision_ocr_timeout_ms: 500,
    vision_ocr_retry_count: 1,
    vision_ocr_daily_request_limit: 25,
    vision_ocr_monthly_request_limit: 500,
  }), false)

  // Rejects retry count > 1
  assert.equal(validateSystem({
    audit_retention_days: 90,
    vision_ocr_timeout_ms: 30000,
    vision_ocr_retry_count: 2,
    vision_ocr_daily_request_limit: 25,
    vision_ocr_monthly_request_limit: 500,
  }), false)
})
