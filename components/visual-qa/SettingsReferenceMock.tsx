'use client'

import React, { useState, useMemo, useEffect } from 'react'
import {
  SlidersHorizontal,
  ShieldCheck,
  Bot,
  Plug,
  UserCog,
  RotateCcw,
  Check,
  AlertTriangle,
  Lock,
  Unlock,
  Clock,
  Users,
  RefreshCw,
  Search,
  Save,
  FileText,
  Database,
  Calendar,
  Bell,
  Globe,
  ArrowRight,
  X,
  ChevronRight,
  Info,
  Radio,
  Server,
  Key,
  Layers,
  Sparkles,
  Sliders,
} from 'lucide-react'
import { AdminSystemReferenceShell } from '@/components/visual-qa/AdminSystemReferenceShell'
import {
  OperationalSettings,
  PersonalSettings,
  OperationalRole,
  SystemPermission,
} from '@/lib/types/database.types'

// ============================================================================
// CANONICAL STATE REGISTRY (WAVE 13 — 33 STATES + RESPONSIVE)
// ============================================================================

export type SettingsScenarioState =
  | '01-main-workspace'
  | '02-operational-settings'
  | '03-registration-rules'
  | '04-registration-cutoff'
  | '05-staffing-capacity'
  | '06-multi-role-rules'
  | '07-swap-rules'
  | '08-shift-schedule-defaults'
  | '09-system-settings'
  | '10-maintenance-mode'
  | '11-audit-retention'
  | '12-ocr-configuration'
  | '13-ocr-thresholds'
  | '14-personal-preferences'
  | '15-calendar-preferences'
  | '16-locale-date-time'
  | '17-notification-preferences'
  | '18-integrations-overview'
  | '19-connected-integration'
  | '20-disconnected-integration'
  | '21-admin-full-access'
  | '22-leader-scoped-view'
  | '23-member-personal-settings'
  | '24-permission-denied'
  | '25-unsaved-changes'
  | '26-save-confirmation'
  | '27-save-success'
  | '28-save-error'
  | '29-optimistic-concurrency-conflict'
  | '30-loading'
  | '31-refreshing'
  | '32-empty-unsupported'
  | '33-long-content-stress'

export interface StateOption {
  id: SettingsScenarioState
  num: string
  label: string
  category: 'OPERATIONAL' | 'SYSTEM' | 'PERSONAL' | 'ROLES' | 'LIFECYCLE'
}

export const SETTINGS_STATES: StateOption[] = [
  { id: '01-main-workspace', num: '01', label: 'Không gian cài đặt tổng thể (Control Plane)', category: 'OPERATIONAL' },
  { id: '02-operational-settings', num: '02', label: 'Tổng quan cài đặt vận hành (Operational Settings)', category: 'OPERATIONAL' },
  { id: '03-registration-rules', num: '03', label: 'Quy tắc đăng ký ca & phê duyệt (Registration Rules)', category: 'OPERATIONAL' },
  { id: '04-registration-cutoff', num: '04', label: 'Cấu hình thời gian đóng đăng ký (Cutoff Hours)', category: 'OPERATIONAL' },
  { id: '05-staffing-capacity', num: '05', label: 'Hạn ngạch nhân sự mặc định (Staffing Capacity)', category: 'OPERATIONAL' },
  { id: '06-multi-role-rules', num: '06', label: 'Ràng buộc một vai trò / ca (Multi-Role Blocked)', category: 'OPERATIONAL' },
  { id: '07-swap-rules', num: '07', label: 'Chính sách đổi ca & phê duyệt (Swap Rules)', category: 'OPERATIONAL' },
  { id: '08-shift-schedule-defaults', num: '08', label: 'Cấu hình lịch trình & ca làm việc mặc định', category: 'OPERATIONAL' },
  { id: '09-system-settings', num: '09', label: 'Tổng quan tham số hệ thống (System Settings)', category: 'SYSTEM' },
  { id: '10-maintenance-mode', num: '10', label: 'Chế độ bảo trì hệ thống (Maintenance Mode)', category: 'SYSTEM' },
  { id: '11-audit-retention', num: '11', label: 'Thời hạn lưu trữ nhật ký kiểm toán (Audit Retention)', category: 'SYSTEM' },
  { id: '12-ocr-configuration', num: '12', label: 'Cấu hình công cụ nhận diện OCR (Tesseract / Vision)', category: 'SYSTEM' },
  { id: '13-ocr-thresholds', num: '13', label: 'Ngưỡng giới hạn & timeout OCR (Rate Limits)', category: 'SYSTEM' },
  { id: '14-personal-preferences', num: '14', label: 'Tùy chọn tài khoản cá nhân (Personal Preferences)', category: 'PERSONAL' },
  { id: '15-calendar-preferences', num: '15', label: 'Tùy chọn hiển thị lịch & mật độ (Calendar)', category: 'PERSONAL' },
  { id: '16-locale-date-time', num: '16', label: 'Định dạng ngày giờ, ngôn ngữ & múi giờ', category: 'PERSONAL' },
  { id: '17-notification-preferences', num: '17', label: 'Tùy chọn nhận thông báo cá nhân', category: 'PERSONAL' },
  { id: '18-integrations-overview', num: '18', label: 'Danh mục dịch vụ tích hợp (Integrations)', category: 'SYSTEM' },
  { id: '19-connected-integration', num: '19', label: 'Chi tiết dịch vụ đã kết nối (Supabase Live)', category: 'SYSTEM' },
  { id: '20-disconnected-integration', num: '20', label: 'Chi tiết dịch vụ chưa kết nối (OpenAI Vision)', category: 'SYSTEM' },
  { id: '21-admin-full-access', num: '21', label: 'Giao diện toàn quyền Quản trị viên (Admin View)', category: 'ROLES' },
  { id: '22-leader-scoped-view', num: '22', label: 'Giao diện phân quyền Trưởng nhóm (Leader View)', category: 'ROLES' },
  { id: '23-member-personal-settings', num: '23', label: 'Giao diện cá nhân Nhân viên (Member View)', category: 'ROLES' },
  { id: '24-permission-denied', num: '24', label: 'Từ chối truy cập cấu hình hệ thống (403 Forbidden)', category: 'ROLES' },
  { id: '25-unsaved-changes', num: '25', label: 'Trạng thái có thay đổi chưa lưu (Dirty State)', category: 'LIFECYCLE' },
  { id: '26-save-confirmation', num: '26', label: 'Hộp thoại xác nhận lưu thay đổi (Confirmation)', category: 'LIFECYCLE' },
  { id: '27-save-success', num: '27', label: 'Thông báo lưu cài đặt thành công (Save Success)', category: 'LIFECYCLE' },
  { id: '28-save-error', num: '28', label: 'Thông báo lỗi xác thực dữ liệu (Validation Error)', category: 'LIFECYCLE' },
  { id: '29-optimistic-concurrency-conflict', num: '29', label: 'Xung đột phiên bản đồng thời (Version Conflict)', category: 'LIFECYCLE' },
  { id: '30-loading', num: '30', label: 'Trạng thái đang tải cấu hình (Loading Skeleton)', category: 'LIFECYCLE' },
  { id: '31-refreshing', num: '31', label: 'Trạng thái đang đồng bộ máy chủ (Refreshing)', category: 'LIFECYCLE' },
  { id: '32-empty-unsupported', num: '32', label: 'Trạng thái chưa khởi tạo cấu hình (Unconfigured)', category: 'LIFECYCLE' },
  { id: '33-long-content-stress', num: '33', label: 'Kiểm thử tải nội dung dài & đa tùy chọn (Stress)', category: 'LIFECYCLE' },
]

// ============================================================================
// CANONICAL PRODUCTION SETTINGS FIXTURES (100% PERSISTENCE PARITY)
// ============================================================================

export interface CanonicalSettingsPayload {
  // Operational Settings (public.system_settings & GL-19C)
  operational: OperationalSettings
  // System-level Settings (dataService systemSettings)
  system: {
    export_include_metadata: boolean
    export_file_format: string
    import_duplicate_warning: boolean
    import_allow_public_csv: boolean
    brand_default_status: string
    platform_default_status: string
    campaign_default_status: string
    localization_default: string
    audit_enabled: boolean
    audit_retention_days: number
    maintenance_mode: boolean
    ocr_provider: string
    vision_ocr_enabled: boolean
    vision_ocr_provider: string
    vision_ocr_provider_configured: boolean
    vision_ocr_default_mode: string
    vision_ocr_model: string
    vision_ocr_timeout_ms: number
    vision_ocr_retry_count: number
    vision_ocr_allow_tiktok: boolean
    vision_ocr_allow_shopee: boolean
    vision_ocr_daily_request_limit: number
    vision_ocr_monthly_request_limit: number
    vision_ocr_diagnostics_retention: boolean
    integration_mode: string
    supabase_connection_status: string
  }
  // Personal Settings (PersonalSettings)
  personal: PersonalSettings
}

export const INITIAL_SETTINGS: CanonicalSettingsPayload = {
  operational: {
    registration_cutoff_hours: 6,
    auto_lock_filled_shifts: true,
    allow_multi_role_per_shift: false,
    require_registration_approval: true,
    team_notifications_enabled: true,
    swap_approval_required: true,
    require_report_review: true,
    report_reminder_hours: 12,
    default_host_count: 1,
    default_support_count: 1,
    default_technical_count: 1,
    require_shift_capacity_validation: true,
    require_time_overlap_validation: true,
    allow_leader_schedule_edit: false,
    strict_host_role_binding: true,
    default_view_mode: 'timeline',
    calendar_density: 'comfortable',
    show_unassigned_shifts: true,
  },
  system: {
    export_include_metadata: true,
    export_file_format: 'xlsx',
    import_duplicate_warning: true,
    import_allow_public_csv: true,
    brand_default_status: 'active',
    platform_default_status: 'active',
    campaign_default_status: 'draft',
    localization_default: 'en',
    audit_enabled: true,
    audit_retention_days: 90,
    maintenance_mode: false,
    ocr_provider: 'tesseract.js',
    vision_ocr_enabled: false,
    vision_ocr_provider: 'disabled',
    vision_ocr_provider_configured: false,
    vision_ocr_default_mode: 'local',
    vision_ocr_model: 'openai-not-configured',
    vision_ocr_timeout_ms: 30000,
    vision_ocr_retry_count: 0,
    vision_ocr_allow_tiktok: true,
    vision_ocr_allow_shopee: true,
    vision_ocr_daily_request_limit: 25,
    vision_ocr_monthly_request_limit: 500,
    vision_ocr_diagnostics_retention: false,
    integration_mode: 'mock',
    supabase_connection_status: 'connected',
  },
  personal: {
    language: 'vi',
    timezone: 'Asia/Ho_Chi_Minh',
    date_format: 'dd/MM/yyyy',
    notifications_enabled: true,
    default_calendar_view: 'month',
    preferred_roles: ['host'],
  },
}

export type SettingsNavigationTab =
  | 'operational'
  | 'system'
  | 'ocr'
  | 'integrations'
  | 'personal'
  | 'roles'

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SettingsReferenceMock() {
  const [activeState, setActiveState] = useState<SettingsScenarioState>('01-main-workspace')
  const [activeNavTab, setActiveNavTab] = useState<SettingsNavigationTab>('operational')
  const [showQaBanner, setShowQaBanner] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<'supabase' | 'vision_ocr' | 'tesseract' | 'onedrive' | null>('supabase')

  // Settings form state
  const [formData, setFormData] = useState<CanonicalSettingsPayload>(INITIAL_SETTINGS)
  const [initialData] = useState<CanonicalSettingsPayload>(INITIAL_SETTINGS)
  const [isDirty, setIsDirty] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [saveToast, setSaveToast] = useState<'success' | 'error' | null>(null)
  const [selectedCutoff, setSelectedCutoff] = useState<number>(6)

  // Sync state from query parameters on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const stateParam = params.get('state') as SettingsScenarioState | null
    if (stateParam && SETTINGS_STATES.some(s => s.id === stateParam)) {
      setActiveState(stateParam)
    }
    if (params.get('qa') === '1') {
      setShowQaBanner(true)
    }
  }, [])

  // Update tabs & controls according to scenario state
  useEffect(() => {
    if (['01-main-workspace', '02-operational-settings'].includes(activeState)) {
      setActiveNavTab('operational')
      setIsDirty(false)
    } else if (['03-registration-rules', '04-registration-cutoff'].includes(activeState)) {
      setActiveNavTab('operational')
      if (activeState === '04-registration-cutoff') {
        setSelectedCutoff(12)
        setIsDirty(true)
      }
    } else if (['05-staffing-capacity', '06-multi-role-rules', '07-swap-rules', '08-shift-schedule-defaults'].includes(activeState)) {
      setActiveNavTab('operational')
    } else if (['09-system-settings', '10-maintenance-mode', '11-audit-retention'].includes(activeState)) {
      setActiveNavTab('system')
    } else if (['12-ocr-configuration', '13-ocr-thresholds'].includes(activeState)) {
      setActiveNavTab('ocr')
    } else if (['14-personal-preferences', '15-calendar-preferences', '16-locale-date-time', '17-notification-preferences'].includes(activeState)) {
      setActiveNavTab('personal')
    } else if (['18-integrations-overview', '19-connected-integration', '20-disconnected-integration'].includes(activeState)) {
      setActiveNavTab('integrations')
      if (activeState === '18-integrations-overview') setSelectedIntegration(null)
      if (activeState === '19-connected-integration') setSelectedIntegration('supabase')
      if (activeState === '20-disconnected-integration') setSelectedIntegration('vision_ocr')
    } else if (['21-admin-full-access', '22-leader-scoped-view', '23-member-personal-settings', '24-permission-denied'].includes(activeState)) {
      if (activeState === '23-member-personal-settings') setActiveNavTab('personal')
      else if (activeState === '24-permission-denied') setActiveNavTab('operational')
      else setActiveNavTab('operational')
    } else if (activeState === '25-unsaved-changes') {
      setActiveNavTab('operational')
      setIsDirty(true)
    } else if (activeState === '26-save-confirmation') {
      setActiveNavTab('operational')
      setShowConfirmModal(true)
    } else if (activeState === '27-save-success') {
      setActiveNavTab('operational')
      setSaveToast('success')
    } else if (activeState === '28-save-error') {
      setActiveNavTab('operational')
      setSaveToast('error')
    } else if (activeState === '29-optimistic-concurrency-conflict') {
      setActiveNavTab('operational')
    }
  }, [activeState])

  // Current simulated user permission
  const currentActor: { name: string; email: string; role: SystemPermission; title: string } = useMemo(() => {
    if (activeState === '22-leader-scoped-view') {
      return { name: 'Trần Thị B', email: 'leader@ada.com', role: 'leader', title: 'Trưởng nhóm Vận hành (Operational Leader)' }
    }
    if (activeState === '23-member-personal-settings' || activeState === '24-permission-denied') {
      return { name: 'Lê Văn C', email: 'host.c@ada.com', role: 'member', title: 'Host Livestream (Operational Member)' }
    }
    return { name: 'Nguyễn Văn A', email: 'admin@ada.com', role: 'admin', title: 'Quản trị viên Hệ thống (System Admin)' }
  }, [activeState])

  const canEditOperational = currentActor.role === 'admin' || currentActor.role === 'leader'
  const canEditSystem = currentActor.role === 'admin'

  return (
    <div data-testid="settings-reference-mock" className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Optional QA Controller Bar (Rendered only when ?qa=1 is present) */}
      {showQaBanner && (
        <aside
          data-qa-controller="true"
          className="border-b border-indigo-200 bg-indigo-950 px-4 py-2.5 text-white shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 font-bold text-[10px]">
                QA
              </span>
              <strong className="tracking-wide">WAVE 13 — SETTINGS CONTROLLER</strong>
              <span className="rounded bg-indigo-800 px-2 py-0.5 font-mono text-[10px] text-indigo-200">
                {activeState}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="qa-scenario-selector" className="text-indigo-200 text-[11px]">
                Kịch bản QA:
              </label>
              <select
                id="qa-scenario-selector"
                value={activeState}
                onChange={e => {
                  const val = e.target.value as SettingsScenarioState
                  setActiveState(val)
                  const url = new URL(window.location.href)
                  url.searchParams.set('state', val)
                  window.history.pushState({}, '', url.toString())
                }}
                className="rounded border border-indigo-700 bg-indigo-900 px-2.5 py-1 text-xs text-white focus:outline-hidden"
              >
                {SETTINGS_STATES.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.num}] {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>
      )}

      {/* Main APP OPS Shell */}
      <AdminSystemReferenceShell
        active="Settings"
        searchPlaceholder="Tìm kiếm tham số cấu hình, quy tắc vận hành, thời gian cutoff..."
      >
        <div className="space-y-4">
          {/* Top Control Plane Header */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Cấu hình Hệ thống & Vận hành</h1>
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 font-mono">
                  system_settings
                </span>
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 font-mono">
                  GL-19C Authoritative
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bảng điều khiển tập trung các tham số ràng buộc nghiệp vụ ca làm việc, hạn ngạch nhân sự, bảo mật và tích hợp.
              </p>
            </div>

            {/* Current Actor Role Badge & Actions */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-2xs">
                <span className={`h-2 w-2 rounded-full ${
                  currentActor.role === 'admin' ? 'bg-purple-600' : currentActor.role === 'leader' ? 'bg-blue-600' : 'bg-emerald-600'
                }`} />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-slate-800 block">{currentActor.name}</span>
                  <span className="text-[10px] text-slate-500 uppercase font-mono">{currentActor.role}</span>
                </div>
              </div>

              {/* Save & Reset Actions */}
              {canEditOperational && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(initialData)
                      setIsDirty(false)
                      setSelectedCutoff(6)
                    }}
                    disabled={!isDirty}
                    className={`flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium ${
                      isDirty ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Hoàn tác
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    disabled={!isDirty}
                    className={`flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold text-white shadow-2xs ${
                      isDirty ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-400 cursor-not-allowed'
                    }`}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Lưu cài đặt
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <nav className="flex space-x-1 border-b border-slate-200 bg-slate-100/60 p-1 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveNavTab('operational')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeNavTab === 'operational'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Cấu hình Vận hành (Operational)
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('system')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeNavTab === 'system'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Hệ thống & Bảo trì (System)
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('ocr')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeNavTab === 'ocr'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              Nhận diện OCR & AI (Vision)
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('integrations')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeNavTab === 'integrations'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Plug className="h-3.5 w-3.5" />
              Dịch vụ Tích hợp (Integrations)
            </button>
            <button
              type="button"
              onClick={() => setActiveNavTab('personal')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                activeNavTab === 'personal'
                  ? 'bg-white text-blue-700 font-bold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCog className="h-3.5 w-3.5" />
              Tùy chọn Cá nhân (Personal)
            </button>
          </nav>

          {/* Toast / Notification Banners */}
          {saveToast === 'success' && (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" />
                <strong>Đã cập nhật cài đặt vận hành thành công vào cơ sở dữ liệu.</strong>
                <span className="font-mono text-[10px] text-emerald-700">RPC: update_operational_settings · Status: 200 OK</span>
              </div>
              <button type="button" onClick={() => setSaveToast(null)} className="text-emerald-700 hover:text-emerald-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {saveToast === 'error' && (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 shadow-2xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <strong>Lỗi kiểm tra ràng buộc:</strong>
                <span>Thời gian đóng đăng ký không được nhỏ hơn 0 giờ. Hạn ngạch nhân sự phải nằm trong khoảng 0 đến 100.</span>
              </div>
              <button type="button" onClick={() => setSaveToast(null)} className="text-red-700 hover:text-red-900">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {activeState === '25-unsaved-changes' && (
            <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <strong>Có thay đổi chưa được lưu:</strong>
                <span>Thời gian đóng đăng ký (registration_cutoff_hours) đã thay đổi từ 6h sang 12h.</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsDirty(false)}
                  className="rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={() => setSaveToast('success')}
                  className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-2xs"
                >
                  Lưu ngay
                </button>
              </div>
            </div>
          )}

          {/* Optimistic Concurrency Conflict Banner (State 29) */}
          {activeState === '29-optimistic-concurrency-conflict' && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-2xs space-y-2">
              <div className="flex items-center gap-2 text-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-sm">Xung đột ghi đè đồng thời (Optimistic Concurrency Conflict)</h3>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Cài đặt vận hành vừa được cập nhật bởi quản trị viên khác lúc <span className="font-mono font-bold">14:32:05</span>.
                Phiên bản dự kiến của bạn không khớp với phiên bản máy chủ hiện tại.
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white">
                  Tải lại dữ liệu mới nhất từ máy chủ
                </button>
                <button type="button" className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800">
                  Xem chi tiết khác biệt (Diff)
                </button>
              </div>
            </div>
          )}

          {/* Permission Denied (State 24) */}
          {activeState === '24-permission-denied' && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-5 shadow-2xs space-y-3">
              <div className="flex items-center gap-2 text-red-950">
                <Lock className="h-5 w-5 text-red-600" />
                <h2 className="font-bold text-sm">Quyền hạn tài khoản thành viên (Member RLS Denied · 403 Forbidden)</h2>
              </div>
              <p className="text-xs text-red-800 leading-relaxed">
                Chính sách bảo mật RLS và hàm RPC <code>update_operational_settings</code> chỉ cho phép tài khoản có quyền
                <span className="font-bold"> admin</span> hoặc <span className="font-bold"> leader</span> thực hiện cấu hình vận hành và tham số hệ thống.
                Tài khoản <span className="font-mono text-red-900 font-bold">{currentActor.email}</span> (Member) chỉ được phép xem và chỉnh sửa Tùy chọn cá nhân (Personal Settings).
              </p>
              <div className="pt-2 border-t border-red-200/60 flex items-center justify-between text-[11px] text-red-700">
                <span>Mã lỗi: ERR_SETTINGS_PERMISSION_DENIED (HTTP 403)</span>
                <button
                  type="button"
                  onClick={() => setActiveNavTab('personal')}
                  className="rounded bg-red-700 px-3 py-1 font-semibold text-white"
                >
                  Chuyển tới Tùy chọn cá nhân
                </button>
              </div>
            </div>
          )}

          {/* Loading Skeleton (State 30) */}
          {activeState === '30-loading' && (
            <div className="space-y-4 animate-pulse">
              <div className="h-28 rounded-lg bg-slate-200" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-44 rounded-lg bg-slate-200" />
                <div className="h-44 rounded-lg bg-slate-200" />
              </div>
              <div className="h-64 rounded-lg bg-slate-200" />
            </div>
          )}

          {/* Refreshing Banner (State 31) */}
          {activeState === '31-refreshing' && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs text-blue-800">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <span>Đang đồng bộ tham số cài đặt mới nhất từ cơ sở dữ liệu Supabase...</span>
            </div>
          )}

          {/* Empty / Unconfigured State (State 32) */}
          {activeState === '32-empty-unsupported' && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Sliders className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Hệ thống chưa thiết lập tham số ban đầu</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Bảng <code>system_settings</code> chưa có bản ghi mặc định. Nhấp nút bên dưới để áp dụng cấu hình tiêu chuẩn GL-19C.
              </p>
              <button
                type="button"
                onClick={() => setFormData(INITIAL_SETTINGS)}
                className="rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                Khởi tạo Cấu hình Mặc định (Seed GL-19C)
              </button>
            </div>
          )}

          {/* TAB 1: OPERATIONAL SETTINGS */}
          {activeNavTab === 'operational' && activeState !== '30-loading' && activeState !== '32-empty-unsupported' && (
            <div className="space-y-4">
              {/* Highlight callout for specific operational states */}
              {activeState === "02-operational-settings" && (<div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 shadow-2xs"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Sliders className="h-4 w-4 text-blue-600" /><strong>Tổng quan Thiết lập Vận hành (Operational Settings Overview · GL-19C):</strong></div><span className="font-mono text-[10px] bg-blue-200/80 px-2 py-0.5 rounded text-blue-900 font-semibold">OPERATIONAL_OVERVIEW</span></div><p className="mt-1 text-slate-600 text-[11px]">Toàn bộ 17 tham số nghiệp vụ ràng buộc ca livestream: thời hạn cutoff, duyệt đăng ký, khóa ca đầy, chặn đa vai trò, hạn ngạch Host/Support/Technical và kiểm tra xung đột thời gian.</p></div>)}
              {activeState === "03-registration-rules" && (<div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 shadow-2xs"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-sky-600" /><strong>Tiêu điểm: Quy tắc Đăng ký ca & Phê duyệt (Registration Gates):</strong></div><span className="font-mono text-[10px] bg-sky-200 px-2 py-0.5 rounded text-sky-900 font-semibold">REGISTRATION_RULES</span></div><p className="mt-1 text-slate-600 text-[11px]">Kiểm soát chặt chẽ quy trình đăng ký ca tự phục vụ của nhân sự: thời hạn cutoff, yêu cầu quản lý phê duyệt và cơ chế tự động khóa ca khi đủ chỉ tiêu.</p></div>)}
              {activeState === "08-shift-schedule-defaults" && (<div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 shadow-2xs"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-teal-600" /><strong>Tiêu điểm: Cấu hình Lịch trình & Ca làm việc mặc định (Shift Scheduling Defaults):</strong></div><span className="font-mono text-[10px] bg-teal-200 px-2 py-0.5 rounded text-teal-900 font-semibold">SCHEDULE_DEFAULTS</span></div><p className="mt-1 text-slate-600 text-[11px]">Các quy tắc ngăn ngừa trùng lịch, cho phép trưởng nhóm biên tập thời gian ca và đánh dấu nổi bật các ca làm việc chưa đủ nhân sự.</p></div>)}
              {activeState === "21-admin-full-access" && (<div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 shadow-2xs"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-purple-600" /><strong>Chế độ Quản trị viên Toàn quyền (Admin Full Access):</strong></div><span className="font-mono text-[10px] bg-purple-200 px-2 py-0.5 rounded text-purple-900 font-semibold">ROLE_ADMIN_VERIFIED</span></div><p className="mt-1 text-slate-600 text-[11px]">Tài khoản Quản trị viên (Admin) có toàn quyền chỉnh sửa và lưu trữ trên toàn bộ các phân hệ cài đặt: Vận hành, Hệ thống, OCR, Dịch vụ tích hợp và Nhật ký kiểm toán.</p></div>)}
              {activeState === "22-leader-scoped-view" && (<div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 shadow-2xs"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Info className="h-4 w-4 text-blue-600" /><strong>Chế độ Phân quyền Trưởng nhóm (Leader Scoped View):</strong></div><span className="font-mono text-[10px] bg-blue-200 px-2 py-0.5 rounded text-blue-900 font-semibold">ROLE_LEADER_SCOPED</span></div><p className="mt-1 text-slate-600 text-[11px]">Tài khoản Trưởng nhóm (Leader) được ủy quyền chỉnh sửa các tham số Vận hành (Operational). Cài đặt Hệ thống và Dịch vụ tích hợp ở chế độ Chỉ đọc (Read-only).</p></div>)}
              {activeState === '04-registration-cutoff' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <strong>Cấu hình thời gian đóng đăng ký ca (Registration Cutoff Hours):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Xác định khoảng thời gian tối thiểu (tính bằng giờ) trước khi ca bắt đầu mà nhân sự không còn được phép tự đăng ký hoặc hủy đăng ký.
                  </p>
                </div>
              )}

              {activeState === '05-staffing-capacity' && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    <strong>Hạn ngạch nhân sự mặc định cho ca tạo mới (Default Staffing Quotas):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Áp dụng tự động cho ca tạo thủ công và ca nhập khẩu từ bảng tính khi không chỉ định số lượng chi tiết.
                  </p>
                </div>
              )}

              {activeState === '06-multi-role-rules' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600" />
                    <strong>Quy tắc ràng buộc vai trò (Multi-Role Enforcement):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Khi bật chế độ chặn đa vai trò (<code>allow_multi_role_per_shift = false</code>), một nhân sự chỉ được giữ tối đa một vai trò (Host, Support hoặc Technical) trong cùng một ca phát sóng.
                  </p>
                </div>
              )}

              {activeState === '07-swap-rules' && (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-indigo-600" />
                    <strong>Chính sách đổi ca & thẩm quyền phê duyệt (Swap Approval Policy):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Yêu cầu mọi đề xuất đổi ca giữa hai nhân sự sau khi đôi bên đồng thuận phải được Trưởng nhóm (Leader) hoặc Quản trị viên (Admin) phê duyệt trước khi ghi sổ lịch làm việc.
                  </p>
                </div>
              )}

              {/* Grid of Operational Control Groups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: Registration Rules */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-blue-600" />
                        Quy tắc Đăng ký Ca & Phê duyệt
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">SETTINGS-001 · SETTINGS-004</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      system_settings
                    </span>
                  </header>

                  {/* Cutoff Hours */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                      <span>Thời gian đóng đăng ký trước ca (Giờ)</span>
                      <span className="font-mono text-blue-600 font-bold">{selectedCutoff} giờ</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {[2, 4, 6, 12, 24, 48].map((hours) => (
                        <button
                          key={hours}
                          type="button"
                          onClick={() => {
                            setSelectedCutoff(hours)
                            setIsDirty(true)
                          }}
                          className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors ${
                            selectedCutoff === hours
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {hours}h
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Tham số: <code>registration_cutoff_hours</code>. Nhân viên không thể tự đăng ký khi còn ít hơn khoảng thời gian này.
                    </span>
                  </div>

                  {/* Approval Required Toggle */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Yêu cầu Trưởng nhóm phê duyệt</strong>
                      <span className="text-[10px] text-slate-500">
                        Đăng ký mới chuyển về trạng thái <code>pending</code> chờ duyệt trước khi chính thức ghi nhận vào danh sách phân công.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.require_registration_approval}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, require_registration_approval: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Auto-Lock Filled Shifts */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Tự động khóa ca khi đủ người</strong>
                      <span className="text-[10px] text-slate-500">
                        Khóa tiếp nhận đăng ký mới khi các chỉ tiêu Host, Support và Technical đã được phê duyệt đủ 100%.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.auto_lock_filled_shifts}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, auto_lock_filled_shifts: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Card 2: Staffing Capacity Defaults */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-600" />
                        Hạn ngạch Nhân sự Mặc định
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">SETTINGS-009 · SETTINGS-011</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      0 – 100 người
                    </span>
                  </header>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-slate-200 p-2.5 bg-slate-50/40 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">Host chính</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.operational.default_host_count}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            operational: { ...prev.operational, default_host_count: Number(e.target.value) }
                          }))
                          setIsDirty(true)
                        }}
                        className="mt-1 w-full text-center rounded border border-slate-200 py-1 text-sm font-bold text-slate-900 font-mono"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">default_host_count</span>
                    </div>

                    <div className="rounded-md border border-slate-200 p-2.5 bg-slate-50/40 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">Trợ trì (Support)</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.operational.default_support_count}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            operational: { ...prev.operational, default_support_count: Number(e.target.value) }
                          }))
                          setIsDirty(true)
                        }}
                        className="mt-1 w-full text-center rounded border border-slate-200 py-1 text-sm font-bold text-slate-900 font-mono"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">default_support_count</span>
                    </div>

                    <div className="rounded-md border border-slate-200 p-2.5 bg-slate-50/40 text-center">
                      <span className="text-[10px] font-bold text-slate-500 block uppercase">Kỹ thuật (Tech)</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formData.operational.default_technical_count}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            operational: { ...prev.operational, default_technical_count: Number(e.target.value) }
                          }))
                          setIsDirty(true)
                        }}
                        className="mt-1 w-full text-center rounded border border-slate-200 py-1 text-sm font-bold text-slate-900 font-mono"
                      />
                      <span className="text-[9px] text-slate-400 block mt-1">default_technical_count</span>
                    </div>
                  </div>

                  {/* Multi-role rule */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Chặn kiêm nhiệm đa vai trò trong ca</strong>
                      <span className="text-[10px] text-slate-500">
                        Ngăn cản nhân viên cùng lúc giữ cả vai trò Host và Support trong 1 ca làm việc đơn.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={!formData.operational.allow_multi_role_per_shift}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, allow_multi_role_per_shift: !e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Strict Host Binding */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Ràng buộc chứng chỉ Host nghiêm ngặt</strong>
                      <span className="text-[10px] text-slate-500">
                        Chỉ cho phép nhân viên có phân loại chuyên môn Host được chỉ định vào vị trí Host chính.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.strict_host_role_binding}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, strict_host_role_binding: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Card 3: Swap & Schedule Rules */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-emerald-600" />
                        Chính sách Đổi Ca & Xác thực
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">SETTINGS-006 · SETTINGS-012</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Validation Engine
                    </span>
                  </header>

                  {/* Swap approval */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Bắt buộc duyệt đổi ca cấp quản lý</strong>
                      <span className="text-[10px] text-slate-500">
                        Sau khi đôi bên đồng thuận, yêu cầu phải có chữ ký số của Leader trước khi cập nhật lịch làm việc.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.swap_approval_required}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, swap_approval_required: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Shift Capacity Validation */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Kiểm tra vượt hạn ngạch sức chứa ca</strong>
                      <span className="text-[10px] text-slate-500">
                        Chặn hành vi gán nhân sự vượt quá tổng số slot cho phép của từng phân loại vai trò.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.require_shift_capacity_validation}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, require_shift_capacity_validation: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Time Overlap Validation */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Kiểm tra trùng lặp thời gian ca</strong>
                      <span className="text-[10px] text-slate-500">
                        Bảo đảm 1 nhân viên không bị xếp lịch vào 2 ca phát sóng có khoảng thời gian chồng lấn nhau.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.require_time_overlap_validation}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, require_time_overlap_validation: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Card 4: Reports & Schedule Permissions */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-600" />
                        Báo cáo & Phân quyền Lịch
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">SETTINGS-007 · SETTINGS-014</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Auditable
                    </span>
                  </header>

                  {/* Report review */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Yêu cầu xét duyệt báo cáo doanh thu</strong>
                      <span className="text-[10px] text-slate-500">
                        Báo cáo kết thúc ca phát sóng phải được kiểm duyệt doanh thu và đối soát trước khi chốt số liệu.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.require_report_review}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, require_report_review: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Leader schedule edit */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Cho phép Leader chỉnh sửa lịch trực tiếp</strong>
                      <span className="text-[10px] text-slate-500">
                        Khi tắt, chỉ Admin mới được thay đổi thời gian ca sau khi lịch đã được xuất bản chính thức.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.operational.allow_leader_schedule_edit}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, allow_leader_schedule_edit: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Report Reminder Hours */}
                  <div className="space-y-1 pt-1">
                    <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                      <span>Nhắc nhở nộp báo cáo sau ca (Giờ)</span>
                      <span className="font-mono text-amber-700 font-bold">{formData.operational.report_reminder_hours}h</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={48}
                      value={formData.operational.report_reminder_hours}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          operational: { ...prev.operational, report_reminder_hours: Number(e.target.value) }
                        }))
                        setIsDirty(true)
                      }}
                      className="w-full accent-amber-600"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>1h</span>
                      <span>12h (Mặc định)</span>
                      <span>24h</span>
                      <span>48h</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SYSTEM & MAINTENANCE SETTINGS */}
          {activeNavTab === 'system' && activeState !== '30-loading' && activeState !== '32-empty-unsupported' && (
            <div className="space-y-4">
              {/* Highlight callout for Maintenance mode */}
              {activeState === '10-maintenance-mode' && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-xs text-red-950 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-red-600" />
                    <strong className="text-sm">Chế độ Bảo trì Hệ thống Toàn diện (Maintenance Mode Active)</strong>
                  </div>
                  <p className="text-xs text-red-800 leading-relaxed">
                    Khi bật chế độ bảo trì, toàn bộ truy cập từ tài khoản Leader và Member sẽ bị tạm dừng.
                    Mọi tác vụ kiểm toán, báo cáo và đăng ký ca sẽ được bảo lưu an toàn. Chỉ tài khoản Quản trị viên (Admin) mới có quyền truy cập tiếp tục.
                  </p>
                </div>
              )}

              {/* Highlight callout for Audit Retention */}
              {activeState === '11-audit-retention' && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-purple-600" />
                    <strong>Chính sách lưu trữ nhật ký kiểm toán (Audit Log Retention Policy):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Nhật ký được bảo vệ ở cấp kiến trúc (Append-Only), nghiêm cấm UPDATE/DELETE thủ công. Thời hạn lưu trữ cấu hình số ngày lưu trữ bản ghi trước khi lưu trữ lạnh.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* System Control Panel */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-slate-700" />
                        Trạng thái Hệ thống & Vận hành Cốt lõi
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">system_settings · Admin Only</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Privileged
                    </span>
                  </header>

                  {/* Maintenance Mode Switch */}
                  <div className="flex items-center justify-between rounded-md border border-red-100 bg-red-50/40 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-red-950">Chế độ Bảo trì (Maintenance Mode)</strong>
                      <span className="text-[10px] text-slate-500">
                        Khóa truy cập cho toàn bộ người dùng thông thường để thực hiện nâng cấp schema hoặc sao lưu.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={activeState === '10-maintenance-mode' || formData.system.maintenance_mode}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          system: { ...prev.system, maintenance_mode: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    />
                  </div>

                  {/* Audit Enabled */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Kích hoạt Nhật ký Kiểm toán (Persistent Audit)</strong>
                      <span className="text-[10px] text-slate-500">
                        Bảo đảm 100% các biến động ca, nhân sự, cấu hình đều được ghi nhận vào <code>audit_logs</code>.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.system.audit_enabled}
                      disabled
                      className="h-4 w-4 rounded border-slate-300 text-blue-600"
                    />
                  </div>

                  {/* Audit Retention Days */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                      <span>Thời hạn lưu trữ nhật ký kiểm toán</span>
                      <span className="font-mono text-purple-700 font-bold">{formData.system.audit_retention_days} ngày</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {[30, 60, 90, 180, 365].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              system: { ...prev.system, audit_retention_days: days }
                            }))
                            setIsDirty(true)
                          }}
                          className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors ${
                            formData.system.audit_retention_days === days
                              ? 'border-purple-600 bg-purple-50 text-purple-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Import & Export System Defaults */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Tiêu chuẩn Xuất nhập Lô & Dữ liệu
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">Schedule Import & Export Port</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Standard
                    </span>
                  </header>

                  {/* Export metadata */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Đính kèm siêu dữ liệu khi xuất Excel</strong>
                      <span className="text-[10px] text-slate-500">
                        Bao gồm mã số định danh ca, phiên bản revision và thông tin người tạo trong file XLSX.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.system.export_include_metadata}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          system: { ...prev.system, export_include_metadata: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Duplicate Warning */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Cảnh báo ca trùng lặp khi nhập khẩu</strong>
                      <span className="text-[10px] text-slate-500">
                        Hiển thị cảnh báo màu hổ phách khi phát hiện ca trùng lặp cùng nhãn hàng, ngày và khung giờ.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.system.import_duplicate_warning}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          system: { ...prev.system, import_duplicate_warning: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>

                  {/* Public CSV Import */}
                  <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                    <div className="pr-4">
                      <strong className="block text-xs text-slate-800">Hỗ trợ nhập Google Sheets qua URL CSV công khai</strong>
                      <span className="text-[10px] text-slate-500">
                        Cho phép nạp dữ liệu lịch trực tiếp từ URL xuất bản Google Sheets đã kiểm định.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.system.import_allow_public_csv}
                      onChange={e => {
                        setFormData(prev => ({
                          ...prev,
                          system: { ...prev.system, import_allow_public_csv: e.target.checked }
                        }))
                        setIsDirty(true)
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OCR & VISION CONFIGURATION */}
          {activeNavTab === 'ocr' && activeState !== '30-loading' && activeState !== '32-empty-unsupported' && (
            <div className="space-y-4">
              {/* Highlight Callouts */}
              {activeState === '12-ocr-configuration' && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-sky-600" />
                    <strong>Cấu hình bộ xử lý nhận diện ký tự quang học (OCR Processing Engines):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Hệ thống hỗ trợ 2 cơ chế: Nhận diện nội bộ (Tesseract.js Client/Server) và Mô hình đa phương thức Vision AI (OpenAI API Contract).
                  </p>
                </div>
              )}

              {activeState === '13-ocr-thresholds' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <strong>Ngưỡng giới hạn cuộc gọi & thời gian chờ (Rate Limits & Timeout):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Giới hạn số lượt gọi Vision AI tối đa 25 lượt/ngày và 500 lượt/tháng để kiểm soát chi phí API. Timeout xử lý tối đa 30,000ms.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Engine Selection */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Bot className="h-4 w-4 text-sky-600" />
                        Động cơ OCR Mặc định
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">ocr_provider · imageOcrService</span>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-mono text-emerald-800 font-bold">
                      ACTIVE: tesseract.js
                    </span>
                  </header>

                  <div className="space-y-2">
                    <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/60 flex items-start justify-between">
                      <div>
                        <strong className="text-xs text-slate-900 block">Tesseract.js Engine (Local / Safe)</strong>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Xử lý hoàn toàn tại biên, không gửi ảnh biên bản livestream lên đám mây của bên thứ ba. Phù hợp cho xử lý doanh thu bảo mật.
                        </p>
                        <span className="inline-block mt-2 rounded bg-slate-200 px-2 py-0.5 text-[9px] font-mono text-slate-700">
                          Production Default
                        </span>
                      </div>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                        ✓
                      </span>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3 bg-white flex items-start justify-between">
                      <div>
                        <strong className="text-xs text-slate-900 block">OpenAI Vision OCR (Cloud Assisted)</strong>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Sử dụng mô hình GPT-4o Vision để nhận diện các hóa đơn và biên bản doanh thu TikTok/Shopee phức tạp.
                        </p>
                        <span className="inline-block mt-2 rounded bg-amber-100 px-2 py-0.5 text-[9px] font-mono text-amber-800">
                          {formData.system.vision_ocr_enabled ? 'Configured' : 'Disabled (Requires API Key)'}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.system.vision_ocr_enabled}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            system: { ...prev.system, vision_ocr_enabled: e.target.checked }
                          }))
                          setIsDirty(true)
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 mt-1"
                      />
                    </div>
                  </div>

                  {/* Platform Support Switches */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <span className="text-xs font-semibold text-slate-800 block">Nền tảng hỗ trợ nhận diện hóa đơn</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs">
                        <input
                          type="checkbox"
                          checked={formData.system.vision_ocr_allow_tiktok}
                          onChange={e => {
                            setFormData(prev => ({
                              ...prev,
                              system: { ...prev.system, vision_ocr_allow_tiktok: e.target.checked }
                            }))
                            setIsDirty(true)
                          }}
                          className="h-3.5 w-3.5 rounded text-blue-600"
                        />
                        <span>TikTok Live Shop</span>
                      </label>
                      <label className="flex items-center gap-2 rounded border border-slate-200 p-2 text-xs">
                        <input
                          type="checkbox"
                          checked={formData.system.vision_ocr_allow_shopee}
                          onChange={e => {
                            setFormData(prev => ({
                              ...prev,
                              system: { ...prev.system, vision_ocr_allow_shopee: e.target.checked }
                            }))
                            setIsDirty(true)
                          }}
                          className="h-3.5 w-3.5 rounded text-blue-600"
                        />
                        <span>Shopee Live</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Rate Limits & Thresholds */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-600" />
                        Ngưỡng Giới hạn & Kiểm soát Chi phí
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">Quota Enforcement</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Rate Guard
                    </span>
                  </header>

                  <div className="space-y-3 text-xs">
                    <div>
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>Hạn mức gọi Vision hàng ngày (Daily Quota)</span>
                        <span className="font-mono text-blue-700">{formData.system.vision_ocr_daily_request_limit} cuộc gọi</span>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={100}
                        value={formData.system.vision_ocr_daily_request_limit}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            system: { ...prev.system, vision_ocr_daily_request_limit: Number(e.target.value) }
                          }))
                          setIsDirty(true)
                        }}
                        className="w-full accent-blue-600 mt-1"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>Hạn mức gọi Vision hàng tháng (Monthly Quota)</span>
                        <span className="font-mono text-blue-700">{formData.system.vision_ocr_monthly_request_limit} cuộc gọi</span>
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={2000}
                        step={50}
                        value={formData.system.vision_ocr_monthly_request_limit}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            system: { ...prev.system, vision_ocr_monthly_request_limit: Number(e.target.value) }
                          }))
                          setIsDirty(true)
                        }}
                        className="w-full accent-blue-600 mt-1"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-semibold text-slate-800">
                        <span>Thời gian chờ tối đa (Timeout)</span>
                        <span className="font-mono text-amber-700">{formData.system.vision_ocr_timeout_ms / 1000}s ({formData.system.vision_ocr_timeout_ms}ms)</span>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {[15000, 30000, 45000, 60000].map(ms => (
                          <button
                            key={ms}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                system: { ...prev.system, vision_ocr_timeout_ms: ms }
                              }))
                              setIsDirty(true)
                            }}
                            className={`flex-1 rounded border py-1 font-mono text-[11px] ${
                              formData.system.vision_ocr_timeout_ms === ms
                                ? 'border-amber-600 bg-amber-50 font-bold text-amber-800'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            {ms / 1000}s
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: INTEGRATIONS OVERVIEW & DETAIL */}
          {activeNavTab === 'integrations' && activeState !== '30-loading' && activeState !== '32-empty-unsupported' && (
            <div className="space-y-4">
              {/* Production Integrations Disclosure Banner */}
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800 flex items-center gap-2">
                    <Plug className="h-4 w-4 text-indigo-600" />
                    Danh mục Dịch vụ Tích hợp Thực tế (Authoritative Integrations Inventory)
                  </h3>
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-mono text-indigo-700 font-bold">
                    Cơ sở dữ liệu: Supabase · File: OneDrive · OCR: Tesseract
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Phân loại trung thực: Dịch vụ có mã lệnh và bảng cơ sở dữ liệu xác thực (Fully Backed) vs Dịch vụ hỗ trợ luồng nhập khẩu (Partially Backed).
                  Hệ thống không giả định các kết nối mạng ảo không tồn tại trong backend.
                </p>
              </div>

              {/* Integrations Table & Inspector Drawer */}
              <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-4">
                {/* List of Real Integrations */}
                <div className="rounded-lg border border-slate-200 bg-white shadow-2xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-500">
                        <th className="px-3 py-2.5">Dịch vụ</th>
                        <th className="px-3 py-2.5">Phân loại</th>
                        <th className="px-3 py-2.5">Trạng thái kết nối</th>
                        <th className="px-3 py-2.5 text-right">Chi tiết</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {/* 1. Supabase Core DB */}
                      <tr
                        onClick={() => setSelectedIntegration('supabase')}
                        className={`cursor-pointer transition-colors ${
                          selectedIntegration === 'supabase' ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <strong className="block text-slate-900">Supabase Platform</strong>
                          <span className="text-[10px] text-slate-500 font-mono">PostgreSQL + Auth + RLS</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                            FULLY_BACKED
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Đang kết nối (Connected)
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] text-blue-600">
                          Xem ➔
                        </td>
                      </tr>

                      {/* 2. Tesseract.js OCR */}
                      <tr
                        onClick={() => setSelectedIntegration('tesseract')}
                        className={`cursor-pointer transition-colors ${
                          selectedIntegration === 'tesseract' ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <strong className="block text-slate-900">Tesseract.js Engine</strong>
                          <span className="text-[10px] text-slate-500 font-mono">Optical Character Recognition</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                            FULLY_BACKED
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Sẵn sàng (Local Engine)
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] text-blue-600">
                          Xem ➔
                        </td>
                      </tr>

                      {/* 3. OpenAI Vision */}
                      <tr
                        onClick={() => setSelectedIntegration('vision_ocr')}
                        className={`cursor-pointer transition-colors ${
                          selectedIntegration === 'vision_ocr' ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <strong className="block text-slate-900">OpenAI Vision OCR</strong>
                          <span className="text-[10px] text-slate-500 font-mono">GPT-4o Multimodal Ingestion</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                            FULLY_BACKED
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-slate-500 text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Chưa kết nối (Disabled)
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] text-blue-600">
                          Xem ➔
                        </td>
                      </tr>

                      {/* 4. Microsoft OneDrive / Graph API */}
                      <tr
                        onClick={() => setSelectedIntegration('onedrive')}
                        className={`cursor-pointer transition-colors ${
                          selectedIntegration === 'onedrive' ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2.5">
                          <strong className="block text-slate-900">Microsoft OneDrive</strong>
                          <span className="text-[10px] text-slate-500 font-mono">Schedule Ingestion File Source</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="rounded bg-sky-100 text-sky-800 px-1.5 py-0.5 text-[9px] font-bold">
                            PARTIALLY_BACKED
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            Đã liên kết (Folder Sync)
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-[10px] text-blue-600">
                          Xem ➔
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Detail Panel */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
                  <header className="border-b border-slate-100 pb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Chi tiết Tích hợp Dịch vụ
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                      {selectedIntegration === 'supabase' && 'Supabase Cloud (PostgreSQL 15)'}
                      {selectedIntegration === 'tesseract' && 'Tesseract OCR (WASM + Worker)'}
                      {selectedIntegration === 'vision_ocr' && 'OpenAI Vision API Contract'}
                      {selectedIntegration === 'onedrive' && 'Microsoft Graph OneDrive Sync'}
                      {!selectedIntegration && 'Tổng quan Dịch vụ Tích hợp (Chọn dịch vụ xem chi tiết)'}
                    </h3>
                  </header>

                  {!selectedIntegration && (<div className="rounded-lg border border-dashed border-slate-200 p-8 text-center space-y-2.5"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Plug className="h-5 w-5" /></div><p className="text-xs font-medium text-slate-600 max-w-xs mx-auto">Chọn một dịch vụ trong danh mục bên trái để xem thông tin kết nối chi tiết, nhật ký kiểm toán và trạng thái đồng bộ thời gian thực.</p><span className="inline-block rounded bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-mono text-emerald-700 font-semibold">4/6 DỊCH VỤ HOẠT ĐỘNG BÌNH THƯỜNG</span></div>)}

                  {selectedIntegration === 'supabase' && (
                    <div className="space-y-2 text-xs">
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Địa chỉ Endpoint:</span>
                        <code className="font-mono text-[10px] text-slate-800 font-bold block truncate">
                          https://ops-livestream.supabase.co
                        </code>
                      </div>
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Quyền hạn truy cập:</span>
                        <span className="text-[11px] text-slate-700 font-medium block">
                          Anon Key + User JWT Token (Không bao giờ để lộ Service Role)
                        </span>
                      </div>
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Độ trễ phản hồi (Latency):</span>
                        <span className="text-[11px] font-mono font-bold text-emerald-700 block">
                          24ms (Vùng ap-southeast-1)
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedIntegration === 'vision_ocr' && (
                    <div className="space-y-2 text-xs">
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Trạng thái cấu hình API:</span>
                        <span className="text-[11px] text-red-600 font-semibold block">
                          Chưa cấu hình API Key (OPENAI_API_KEY_NOT_SET)
                        </span>
                      </div>
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Mô hình chỉ định:</span>
                        <code className="font-mono text-[10px] text-slate-800 block">
                          gpt-4o-2024-08-06
                        </code>
                      </div>
                      <button
                        type="button"
                        className="w-full rounded bg-blue-600 py-1.5 text-xs font-semibold text-white shadow-2xs"
                      >
                        Thiết lập Khóa bảo mật API
                      </button>
                    </div>
                  )}

                  {selectedIntegration === 'tesseract' && (
                    <div className="space-y-2 text-xs">
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Ngôn ngữ nạp sẵn:</span>
                        <span className="text-[11px] text-slate-800 font-semibold block">
                          Tiếng Việt (vie) + Tiếng Anh (eng)
                        </span>
                      </div>
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Chế độ vận hành:</span>
                        <span className="text-[11px] text-emerald-700 font-semibold block">
                          Web Worker cách ly (Zero main-thread blocking)
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedIntegration === 'onedrive' && (
                    <div className="space-y-2 text-xs">
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Thư mục theo dõi:</span>
                        <code className="font-mono text-[10px] text-slate-800 block">
                          /Apps/LivestreamOps/Imports/WeeklySchedule
                        </code>
                      </div>
                      <div className="rounded bg-slate-50 p-2.5 space-y-1">
                        <span className="text-[10px] text-slate-400 block">Đồng bộ tự động:</span>
                        <span className="text-[11px] text-emerald-700 font-semibold block">
                          Đang hoạt động (Kích hoạt mỗi 15 phút)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PERSONAL PREFERENCES */}
          {activeNavTab === 'personal' && activeState !== '30-loading' && activeState !== '32-empty-unsupported' && (
            <div className="space-y-4">
              {/* Highlight callouts for personal settings */}
              {activeState === '15-calendar-preferences' && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <strong>Tùy chọn hiển thị Lịch cá nhân (Calendar Personal Preferences):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Cấu hình chế độ xem lịch mặc định (Tháng, Tuần, Ngày, Danh sách) và mật độ hiển thị theo sở thích người dùng.
                  </p>
                </div>
              )}

              {activeState === '16-locale-date-time' && (
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs text-purple-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-purple-600" />
                    <strong>Định dạng Ngôn ngữ, Ngày tháng & Múi giờ:</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Chuẩn hóa thời gian vận hành theo múi giờ Việt Nam (UTC+07:00 Asia/Ho_Chi_Minh) và định dạng ngày dd/MM/yyyy.
                  </p>
                </div>
              )}

              {activeState === '17-notification-preferences' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-600" />
                    <strong>Kênh thông báo cá nhân (Personal Notification Preferences):</strong>
                  </div>
                  <p className="mt-1 text-slate-600 text-[11px]">
                    Tùy chỉnh nhận thông báo ca làm việc, nhắc nhở nộp báo cáo và kết quả đổi ca.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Profile & Locale */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <UserCog className="h-4 w-4 text-slate-700" />
                        Hồ sơ & Định dạng Khu vực
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">PersonalSettings · Client Scoped</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      {currentActor.email}
                    </span>
                  </header>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">Ngôn ngữ hiển thị (Language)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              personal: { ...prev.personal, language: 'vi' }
                            }))
                            setIsDirty(true)
                          }}
                          className={`rounded border py-1.5 font-medium text-xs ${
                            formData.personal.language === 'vi'
                              ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
                              : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          Tiếng Việt (Vietnamese)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              personal: { ...prev.personal, language: 'en' }
                            }))
                            setIsDirty(true)
                          }}
                          className={`rounded border py-1.5 font-medium text-xs ${
                            formData.personal.language === 'en'
                              ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
                              : 'border-slate-200 text-slate-600'
                          }`}
                        >
                          English
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">Múi giờ vận hành (Timezone)</label>
                      <select
                        value={formData.personal.timezone}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            personal: { ...prev.personal, timezone: e.target.value }
                          }))
                          setIsDirty(true)
                        }}
                        className="w-full rounded border border-slate-200 p-2 text-xs text-slate-800 font-mono"
                      >
                        <option value="Asia/Ho_Chi_Minh">(UTC+07:00) Asia/Ho_Chi_Minh (Hà Nội, TP.HCM)</option>
                        <option value="UTC">(UTC+00:00) UTC (Universal Coordinated Time)</option>
                        <option value="Asia/Singapore">(UTC+08:00) Asia/Singapore</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">Định dạng ngày (Date Format)</label>
                      <select
                        value={formData.personal.date_format}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            personal: { ...prev.personal, date_format: e.target.value }
                          }))
                          setIsDirty(true)
                        }}
                        className="w-full rounded border border-slate-200 p-2 text-xs text-slate-800 font-mono"
                      >
                        <option value="dd/MM/yyyy">DD/MM/YYYY (25/09/2026 - Tiêu chuẩn VN)</option>
                        <option value="MM/dd/yyyy">MM/DD/YYYY (09/25/2026 - Tiêu chuẩn Mỹ)</option>
                        <option value="yyyy-MM-dd">YYYY-MM-DD (2026-09-25 - Tiêu chuẩn ISO)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Calendar & Preferences */}
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-2xs space-y-3.5">
                  <header className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-blue-600" />
                        Giao diện Lịch & Thông báo
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">Display Preferences</span>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                      Sync
                    </span>
                  </header>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">Chế độ xem lịch mặc định (Default View)</label>
                      <div className="grid grid-cols-4 gap-2">
                        {(['month', 'week', 'day', 'list'] as const).map(view => (
                          <button
                            key={view}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                personal: { ...prev.personal, default_calendar_view: view }
                              }))
                              setIsDirty(true)
                            }}
                            className={`rounded border py-1.5 font-medium text-xs capitalize ${
                              formData.personal.default_calendar_view === view
                                ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold'
                                : 'border-slate-200 text-slate-600'
                            }`}
                          >
                            {view === 'month' ? 'Tháng' : view === 'week' ? 'Tuần' : view === 'day' ? 'Ngày' : 'Danh sách'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50/60 p-3">
                      <div className="pr-4">
                        <strong className="block text-xs text-slate-800">Nhận thông báo hệ thống (Notifications)</strong>
                        <span className="text-[10px] text-slate-500">
                          Bật nhận thông báo âm thanh và pop-up in-app khi có cập nhật ca hoặc thay đổi phân công.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={formData.personal.notifications_enabled}
                        onChange={e => {
                          setFormData(prev => ({
                            ...prev,
                            personal: { ...prev.personal, notifications_enabled: e.target.checked }
                          }))
                          setIsDirty(true)
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </div>

                    {/* Preferred Operational Roles */}
                    <div>
                      <label className="font-semibold text-slate-800 block mb-1">Vai trò chuyên môn mong muốn</label>
                      <div className="flex gap-2">
                        {(['host', 'support', 'technical'] as OperationalRole[]).map(role => {
                          const isSelected = formData.personal.preferred_roles.includes(role)
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                const nextRoles = isSelected
                                  ? formData.personal.preferred_roles.filter(r => r !== role)
                                  : [...formData.personal.preferred_roles, role]
                                setFormData(prev => ({
                                  ...prev,
                                  personal: { ...prev.personal, preferred_roles: nextRoles }
                                }))
                                setIsDirty(true)
                              }}
                              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize border ${
                                isSelected
                                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                                  : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              {role === 'host' ? 'Host chính' : role === 'support' ? 'Trợ trì (Support)' : 'Kỹ thuật'}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Long Content Stress Test (State 33) */}
          {activeState === '33-long-content-stress' && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
              <header className="border-b border-slate-100 pb-2 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Kiểm thử độ giãn nở dữ liệu & tham số dài (Stress Test)</h3>
                  <span className="text-[10px] text-slate-400">Đảm bảo không vỡ layout tại độ phân giải 1440x1024 và 1280x900</span>
                </div>
                <span className="rounded bg-purple-100 text-purple-800 px-2 py-0.5 text-[10px] font-bold font-mono">
                  STRESS_50_PARAMS
                </span>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs max-h-96 overflow-y-auto pr-2">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div key={i} className="rounded border border-slate-200 p-2.5 bg-slate-50/60 space-y-1">
                    <span className="font-mono text-[10px] text-slate-400 font-bold block truncate">
                      config_parameter_extended_long_key_index_{String(i + 1).padStart(3, '0')}
                    </span>
                    <strong className="text-slate-800 block truncate">
                      Giá trị cấu hình nâng cao #{i + 1} phục vụ kiểm thử tải giao diện
                    </strong>
                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      <span className="text-slate-500 font-mono">Type: boolean</span>
                      <span className="text-emerald-700 font-bold">Enabled</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </AdminSystemReferenceShell>

      {/* Save Confirmation Modal (State 26) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <header className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Save className="h-4 w-4 text-blue-600" />
                Xác nhận Áp dụng Cài đặt Vận hành
              </h3>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="text-xs text-slate-600 space-y-2">
              <p>
                Bạn đang chuẩn bị cập nhật các tham số vận hành vào bảng <code>system_settings</code>. Thay đổi này sẽ ảnh hưởng tới toàn bộ ca làm việc:
              </p>
              <div className="rounded bg-slate-50 p-3 font-mono text-[11px] space-y-1 border border-slate-200">
                <div className="flex justify-between">
                  <span>registration_cutoff_hours:</span>
                  <span className="font-bold text-blue-700">{selectedCutoff}h</span>
                </div>
                <div className="flex justify-between">
                  <span>require_registration_approval:</span>
                  <span className="font-bold text-blue-700">{String(formData.operational.require_registration_approval)}</span>
                </div>
                <div className="flex justify-between">
                  <span>allow_multi_role_per_shift:</span>
                  <span className="font-bold text-blue-700">{String(formData.operational.allow_multi_role_per_shift)}</span>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 italic">
                * Thao tác sẽ tạo 1 bản ghi kiểm toán tương ứng trong <code>audit_logs</code> với action <code>update</code>.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="rounded-md border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false)
                  setIsDirty(false)
                  setSaveToast('success')
                }}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700"
              >
                Xác nhận lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
