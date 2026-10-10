'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Shield,
  Lock,
  Mail,
  User,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Building,
  Phone,
  Clock,
  Sparkles,
  Globe,
  XCircle,
  RotateCcw,
  FileText,
  Layers,
  ShieldCheck,
  Check,
  X,
  ExternalLink,
  Info,
  Calendar,
  Sliders,
  ChevronRight
} from 'lucide-react'

// ============================================================================
// CANONICAL STATE REGISTRY (WAVE 14 — 33 STATES + RESPONSIVE)
// ============================================================================

export type AuthScenarioState =
  | '01-login-default'
  | '02-login-validating'
  | '03-login-invalid-credentials'
  | '04-login-validation-errors'
  | '05-login-password-visibility'
  | '06-login-authenticated-redirect'
  | '07-session-expired-notice'
  | '08-signed-out-notice'
  | '09-identity-unavailable-blocked'
  | '10-account-request-default'
  | '11-account-request-validation'
  | '12-account-request-submitting'
  | '13-account-request-submitted-success'
  | '14-account-request-conflict-ratelimit'
  | '15-approval-pending-gate'
  | '16-approval-granted-access'
  | '17-approval-rejected-gate'
  | '18-account-inactive-archived-blocked'
  | '19-email-verification-pending'
  | '20-email-verification-success'
  | '21-auth-code-error-expired'
  | '22-forgot-password-default'
  | '23-forgot-password-submitting'
  | '24-forgot-password-sent-non-enumerating'
  | '25-reset-password-default'
  | '26-reset-password-validation'
  | '27-reset-password-success'
  | '28-reset-password-token-expired'
  | '29-admin-review-provisioning-modal'
  | '30-unauthorized-access-denied'
  | '31-locale-vietnamese-auth'
  | '32-stress-long-content'
  | '33-responsive-1280x900'

export interface AuthStateDefinition {
  id: AuthScenarioState
  num: string
  label: string
  category: 'login' | 'register' | 'gate' | 'verify' | 'recovery' | 'reset' | 'admin_review' | 'guard' | 'locale' | 'stress' | 'responsive'
  description: string
}

export const AUTH_STATES: AuthStateDefinition[] = [
  { id: '01-login-default', num: '01', label: 'Login Workspace Mặc định', category: 'login', description: 'Giao diện đăng nhập chuẩn: Email, Mật khẩu, Ghi nhớ, Quên mật khẩu, Liên kết yêu cầu tài khoản' },
  { id: '02-login-validating', num: '02', label: 'Login Đang xác thực (In-flight)', category: 'login', description: 'Trạng thái gửi yêu cầu đăng nhập: Nút vô hiệu hóa, Spinner hiển thị, Chặn thao tác trùng lặp' },
  { id: '03-login-invalid-credentials', num: '03', label: 'Login Thông tin không hợp lệ', category: 'login', description: 'Thông báo lỗi xác thực: Email hoặc mật khẩu không chính xác từ Supabase GoTrue Auth' },
  { id: '04-login-validation-errors', num: '04', label: 'Login Lỗi kiểm tra biểu mẫu', category: 'login', description: 'Cảnh báo trường bắt buộc: Email trống hoặc định dạng không đúng, Mật khẩu để trống' },
  { id: '05-login-password-visibility', num: '05', label: 'Login Hiển thị mật khẩu', category: 'login', description: 'Tính năng bật/tắt hiển thị mật khẩu bằng icon Eye/EyeOff an toàn' },
  { id: '06-login-authenticated-redirect', num: '06', label: 'Login Chuyển hướng thành công', category: 'login', description: 'Xác thực thành công: Chỉ báo chuyển hướng về Dashboard theo query param ?next=...' },
  { id: '07-session-expired-notice', num: '07', label: 'Phiên làm việc hết hạn', category: 'login', description: 'Query reason=session_expired: Cảnh báo phiên đăng nhập đã hết hạn, yêu cầu đăng nhập lại' },
  { id: '08-signed-out-notice', num: '08', label: 'Đăng xuất thành công', category: 'login', description: 'Query reason=signed_out: Thông báo màu xanh xác nhận người dùng đã đăng xuất an toàn' },
  { id: '09-identity-unavailable-blocked', num: '09', label: 'Hồ sơ nhân sự chưa liên kết', category: 'login', description: 'Lỗi authIdentityUnavailable: Tài khoản xác thực chưa được gán hồ sơ nhân sự hoạt động' },
  { id: '10-account-request-default', num: '10', label: 'Yêu cầu tài khoản (Mặc định)', category: 'register', description: 'Biểu mẫu gửi yêu cầu truy cập: Họ tên, Email công việc, Số điện thoại (tùy chọn), Phòng ban' },
  { id: '11-account-request-validation', num: '11', label: 'Yêu cầu tài khoản - Lỗi kiểm tra', category: 'register', description: 'Lỗi validation khi nộp form: Họ tên thiếu, Email sai cú pháp, thông báo hỗ trợ người dùng' },
  { id: '12-account-request-submitting', num: '12', label: 'Yêu cầu tài khoản - Đang gửi', category: 'register', description: 'Biểu mẫu gửi yêu cầu đang xử lý qua RPC submit_account_request với spinner loading' },
  { id: '13-account-request-submitted-success', num: '13', label: 'Yêu cầu tài khoản - Đã tiếp nhận', category: 'register', description: 'Màn hình thành công: Yêu cầu đã chuyển tới Quản trị viên để xét duyệt và phân quyền' },
  { id: '14-account-request-conflict-ratelimit', num: '14', label: 'Yêu cầu tài khoản - Giới hạn tần suất', category: 'register', description: 'Lỗi ACCOUNT_REQUEST_RATE_LIMITED hoặc Email đã tồn tại trong danh sách yêu cầu' },
  { id: '15-approval-pending-gate', num: '15', label: 'Cổng chặn: Chờ Admin phê duyệt', category: 'gate', description: 'Người dùng có tài khoản nhưng yêu cầu đang ở trạng thái pending, chưa được phê duyệt' },
  { id: '16-approval-granted-access', num: '16', label: 'Cổng chặn: Đã duyệt & Gửi lời mời', category: 'gate', description: 'Tài khoản đã được Admin duyệt, trạng thái provisioning_status=invited kèm hướng dẫn kích hoạt' },
  { id: '17-approval-rejected-gate', num: '17', label: 'Cổng chặn: Yêu cầu bị từ chối', category: 'gate', description: 'Yêu cầu bị từ chối kèm lý do chính thức (rejection_reason) và kênh khiếu nại/liên hệ' },
  { id: '18-account-inactive-archived-blocked', num: '18', label: 'Cổng chặn: Tài khoản ngừng hoạt động', category: 'gate', description: 'Nhân sự ở trạng thái inactive hoặc archived bị hệ thống chặn truy cập vận hành' },
  { id: '19-email-verification-pending', num: '19', label: 'Xác thực Email: Đang chờ gửi OTP', category: 'verify', description: 'Thông báo xác thực email: Yêu cầu người dùng kiểm tra hòm thư trước khi kích hoạt tài khoản' },
  { id: '20-email-verification-success', num: '20', label: 'Xác thực Email: Thành công', category: 'verify', description: 'Thẻ xác nhận email hợp lệ, cho phép tiếp tục quy trình thiết lập hồ sơ hoặc đăng nhập' },
  { id: '21-auth-code-error-expired', num: '21', label: 'Liên kết xác thực đã hết hạn', category: 'verify', description: 'Màn hình chuẩn /auth/auth-code-error: Token xác thực hoặc lời mời đã hết hạn / không hợp lệ' },
  { id: '22-forgot-password-default', num: '22', label: 'Quên mật khẩu (Mặc định)', category: 'recovery', description: 'Biểu mẫu gửi yêu cầu đặt lại mật khẩu qua email được liên kết trong hệ thống' },
  { id: '23-forgot-password-submitting', num: '23', label: 'Quên mật khẩu - Đang xử lý', category: 'recovery', description: 'Tiến trình gọi API resetPasswordForEmail với spinner và chặn nhấn trùng lặp' },
  { id: '24-forgot-password-sent-non-enumerating', num: '24', label: 'Quên mật khẩu - Đã gửi (Non-enumerating)', category: 'recovery', description: 'Bảo mật chống dò email: Thông báo thành công chung ngay cả khi email không tồn tại' },
  { id: '25-reset-password-default', num: '25', label: 'Đặt lại mật khẩu mới', category: 'reset', description: 'Biểu mẫu nhập mật khẩu mới và xác nhận mật khẩu (yêu cầu tối thiểu 8 ký tự)' },
  { id: '26-reset-password-validation', num: '26', label: 'Đặt lại mật khẩu - Lỗi khớp mật khẩu', category: 'reset', description: 'Cảnh báo lỗi: Mật khẩu dưới 8 ký tự hoặc xác nhận mật khẩu không trùng khớp' },
  { id: '27-reset-password-success', num: '27', label: 'Đặt lại mật khẩu - Cập nhật thành công', category: 'reset', description: 'Mật khẩu đã được cập nhật thành công qua updateUser, cung cấp nút quay lại Đăng nhập' },
  { id: '28-reset-password-token-expired', num: '28', label: 'Đặt lại mật khẩu - Token hết hạn', category: 'reset', description: 'Lỗi token khôi phục hết hạn hoặc đã được sử dụng, yêu cầu tạo yêu cầu mới' },
  { id: '29-admin-review-provisioning-modal', num: '29', label: 'Admin Quản lý Yêu cầu & Cấp phát', category: 'admin_review', description: 'Liên kết Auth ↔ People: Admin duyệt yêu cầu, nhập lý do từ chối, hoặc cấp phát (provision) tài khoản' },
  { id: '30-unauthorized-access-denied', num: '30', label: 'Bảo vệ Route - Quyền hạn không đủ', category: 'guard', description: 'Màn hình 403 Forbidden: Phân tách rõ SystemPermission (Admin/Leader/Member) và OperationalRole' },
  { id: '31-locale-vietnamese-auth', num: '31', label: 'Đa ngôn ngữ: Tiếng Việt hoàn chỉnh', category: 'locale', description: 'Giao diện đăng nhập và hướng dẫn bằng Tiếng Việt theo chuẩn i18n của APP OPS' },
  { id: '32-stress-long-content', num: '32', label: 'Kiểm thử độ dài nội dung (Stress Test)', category: 'stress', description: 'Xử lý email 120 ký tự, họ tên dài, lý do từ chối nhiều đoạn văn không làm vỡ layout' },
  { id: '33-responsive-1280x900', num: '33', label: 'Kiểm tra Responsive 1280×900', category: 'responsive', description: 'Xác minh hiển thị trên màn hình 1280×900: Hai cột cân đối, không tràn thanh cuộn ngang' }
]

export function AuthReferenceMock() {
  const searchParams = useSearchParams()
  const stateFromUrl = searchParams.get('state') as AuthScenarioState | null
  const showQaBanner = searchParams.get('qa') === '1'

  const [activeState, setActiveState] = useState<AuthScenarioState>(
    stateFromUrl && AUTH_STATES.some(s => s.id === stateFromUrl) ? stateFromUrl : '01-login-default'
  )

  useEffect(() => {
    if (stateFromUrl && AUTH_STATES.some(s => s.id === stateFromUrl)) {
      setActiveState(stateFromUrl)
    }
  }, [stateFromUrl])

  // Form input states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)

  // Account request fields
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')

  // Password reset fields
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Admin review modal fields (State 29)
  const [rejectionReason, setRejectionReason] = useState('Định biên nhân sự khối Vận hành Livestream quý 4/2026 đã đủ chỉ tiêu phân bổ.')

  // Sync inputs with activeState
  useEffect(() => {
    if (activeState === '01-login-default') {
      setEmail('admin@livestreamops.com')
      setPassword('••••••••••••')
      setShowPassword(false)
    } else if (activeState === '02-login-validating') {
      setEmail('leader@livestreamops.com')
      setPassword('OpsLeader2026!')
      setShowPassword(false)
    } else if (activeState === '03-login-invalid-credentials') {
      setEmail('wrong.user@livestreamops.com')
      setPassword('InvalidPass123')
      setShowPassword(false)
    } else if (activeState === '04-login-validation-errors') {
      setEmail('')
      setPassword('')
      setShowPassword(false)
    } else if (activeState === '05-login-password-visibility') {
      setEmail('host.talent@livestreamops.com')
      setPassword('P@ssw0rd2026!Secured')
      setShowPassword(true)
    } else if (activeState === '06-login-authenticated-redirect') {
      setEmail('admin@livestreamops.com')
      setPassword('••••••••••••')
      setShowPassword(false)
    } else if (activeState === '07-session-expired-notice') {
      setEmail('technical.operator@livestreamops.com')
      setPassword('')
      setShowPassword(false)
    } else if (activeState === '08-signed-out-notice') {
      setEmail('admin@livestreamops.com')
      setPassword('')
      setShowPassword(false)
    } else if (activeState === '09-identity-unavailable-blocked') {
      setEmail('unlinked.staff@livestreamops.com')
      setPassword('ValidPass123!')
      setShowPassword(false)
    } else if (activeState === '10-account-request-default') {
      setFullName('Nguyễn Văn Tuấn')
      setEmail('tuan.nguyen@livestreamops.com')
      setPhone('0912345678')
      setDepartment('Phòng Kỹ thuật & Phát sóng (Technical)')
    } else if (activeState === '11-account-request-validation') {
      setFullName('')
      setEmail('invalid-email-format')
      setPhone('0900')
      setDepartment('')
    } else if (activeState === '12-account-request-submitting') {
      setFullName('Trần Thị Mai')
      setEmail('mai.tran@livestreamops.com')
      setPhone('0987654321')
      setDepartment('Phòng Biên tập & MC (Host)')
    } else if (activeState === '22-forgot-password-default') {
      setEmail('host.c@livestreamops.com')
    } else if (activeState === '23-forgot-password-submitting') {
      setEmail('admin@livestreamops.com')
    } else if (activeState === '24-forgot-password-sent-non-enumerating') {
      setEmail('requested.user@livestreamops.com')
    } else if (activeState === '25-reset-password-default') {
      setNewPassword('SecureNewPass2026#')
      setConfirmPassword('SecureNewPass2026#')
    } else if (activeState === '26-reset-password-validation') {
      setNewPassword('short')
      setConfirmPassword('different')
    } else if (activeState === '31-locale-vietnamese-auth') {
      setEmail('nguyen.kien@livestreamops.com')
      setPassword('••••••••••••')
      setShowPassword(false)
    } else if (activeState === '32-stress-long-content') {
      setEmail('nguyen.hoang.anh.kien.livestream.operations.enterprise.testing@vietnam-broadcast-multimedia-conglomerate.vn')
      setPassword('UltraExtremelyLongPasswordStringExceedingNormalLimitsForTesting1234567890!@#$%^&*()')
      setFullName('Nguyễn Hoàng Anh Kiên - Chuyên viên Giám sát Kỹ thuật Phát sóng Trực tiếp Cao cấp')
      setDepartment('Ban Điều phối Livestream Thương mại Điện tử Đa nền tảng TikTok Shop, Shopee Live, Lazada Studio Miền Nam')
      setShowPassword(false)
    }
  }, [activeState])

  const stateDef = useMemo(() => {
    return AUTH_STATES.find(s => s.id === activeState) || AUTH_STATES[0]
  }, [activeState])

  return (
    <div
      data-testid="auth-reference-mock"
      className="min-h-screen bg-slate-100 text-slate-900 font-sans flex flex-col"
    >
      {/* Optional QA Controller Bar (Rendered only when ?qa=1 is present) */}
      {showQaBanner && (
        <aside
          data-qa-controller="true"
          className="border-b border-indigo-900 bg-indigo-950 px-4 py-2 text-white shadow-sm shrink-0 z-50"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 font-bold text-[10px]">
                QA
              </span>
              <strong className="tracking-wide text-white">WAVE 14 — AUTH CONTROLLER</strong>
              <span className="rounded bg-indigo-900 border border-indigo-700 px-2 py-0.5 font-mono text-[10px] text-indigo-200">
                {activeState}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="qa-auth-selector" className="text-indigo-200 text-[11px]">
                Kịch bản QA:
              </label>
              <select
                id="qa-auth-selector"
                value={activeState}
                onChange={e => {
                  const val = e.target.value as AuthScenarioState
                  setActiveState(val)
                  const url = new URL(window.location.href)
                  url.searchParams.set('state', val)
                  window.history.pushState({}, '', url.toString())
                }}
                className="rounded border border-indigo-700 bg-indigo-900 px-2.5 py-1 text-xs text-white focus:outline-hidden"
              >
                {AUTH_STATES.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.num}] {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </aside>
      )}

      {/* Main Two-Column Auth Layout */}
      <div className="flex-1 flex flex-col lg:flex-row w-full overflow-hidden">
        {/* ================================================================= */}
        {/* LEFT COLUMN: BRAND COMMAND CENTER (High-Fi Dark Hero Surface)     */}
        {/* ================================================================= */}
        <div className="relative hidden w-full lg:flex lg:w-1/2 flex-col justify-between bg-zinc-950 p-10 text-white overflow-hidden border-r border-zinc-800">
          {/* Subtle background tech pattern */}
          <div className="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] opacity-40 pointer-events-none" />
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Brand Header */}
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-600/30 text-white">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xl tracking-tight text-white">LiveStream Ops</span>
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-blue-400 border border-blue-500/30">
                    ENTERPRISE
                  </span>
                </div>
                <p className="text-xs text-zinc-400 font-medium">Hệ thống Quản trị & Điều phối Vận hành Trực tiếp</p>
              </div>
            </div>

            {/* Architectural Provenance Badges */}
            <div className="mt-8 flex flex-wrap gap-2 text-[11px] font-mono">
              <div className="flex items-center gap-1.5 rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                <span>Auth: Supabase GoTrue + RLS</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400"></span>
                <span>Role: SystemPermission</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-md bg-zinc-900 border border-zinc-800 px-2.5 py-1 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400"></span>
                <span>Audit: Wave 12 Lineage</span>
              </div>
            </div>
          </div>

          {/* Middle Feature Highlights / Telemetry */}
          <div className="relative z-10 my-8 space-y-4 max-w-lg">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-4 backdrop-blur-xs">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-blue-400" /> Tiêu chuẩn Bảo mật & Cấp quyền
                </span>
                <span className="rounded bg-emerald-950 border border-emerald-800 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                  COMPLIANT
                </span>
              </div>

              <div className="space-y-2.5 text-xs text-zinc-300">
                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Phân tách Hệ thống vs Nghiệp vụ:</strong> SystemPermission (<code className="text-blue-300">admin</code>, <code className="text-blue-300">leader</code>, <code className="text-blue-300">member</code>) tách bạch với OperationalRole (<code className="text-purple-300">host</code>, <code className="text-purple-300">support</code>, <code className="text-purple-300">technical</code>).
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Cơ chế Duyệt & Cấp phát 2 bước:</strong> Đăng ký tài khoản bắt buộc qua Admin phê duyệt và RPC <code className="text-amber-300">provision_account_request</code> trước khi cấp quyền truy cập.
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-white">Chống Dò quét Email (Non-Enumerating):</strong> Yêu cầu khôi phục mật khẩu trả về phản hồi đồng nhất nhằm bảo vệ danh tính nhân sự trước các cuộc tấn công brute-force.
                  </div>
                </div>
              </div>
            </div>

            {/* Current Scenario Visual Context Badge */}
            <div className="rounded-lg border border-blue-900/40 bg-blue-950/20 p-3 text-xs text-blue-200 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 text-blue-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">Kịch bản: [{stateDef.num}] {stateDef.label}</p>
                <p className="text-[11px] text-zinc-400 truncate">{stateDef.description}</p>
              </div>
            </div>
          </div>

          {/* Bottom Quote & Version */}
          <div className="relative z-10 border-t border-zinc-800/80 pt-6">
            <blockquote className="space-y-1.5">
              <p className="text-xs text-zinc-400 italic">
                &ldquo;The command center for live operational excellence. Streamlined, real-time, and resilient.&rdquo;
              </p>
              <footer className="text-[11px] font-mono text-zinc-400">
                LiveStream Ops Core Platform • GL-19C Authority
              </footer>
            </blockquote>
          </div>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: INTERACTIVE FORM & STATE DISPLAY (Clean Light Area)  */}
        {/* ================================================================= */}
        <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-12 bg-white overflow-y-auto">
          <div className="w-full max-w-md space-y-6">

            {/* Top State Provenance Bar */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-slate-600">
                <Lock className="h-3.5 w-3.5 text-blue-600" />
                <span>Cổng Xác thực An toàn</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-mono text-slate-600">
                  {stateDef.id}
                </span>
                <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 font-mono">
                  STATE {stateDef.num}/33
                </span>
              </div>
            </div>

            {/* ============================================================= */}
            {/* SUB-FLOW 1: LOGIN FLOW (01 to 09, 31, 32, 33)                 */}
            {/* ============================================================= */}
            {(stateDef.category === 'login' || stateDef.category === 'locale' || stateDef.category === 'stress' || stateDef.category === 'responsive') && (
              <div className="space-y-5" data-testid="login-view-container">
                {/* Header */}
                <div className="space-y-1 text-left">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {activeState === '31-locale-vietnamese-auth' ? 'Đăng nhập hệ thống' : 'Đăng nhập LiveStream Ops'}
                  </h1>
                  <p className="text-sm text-slate-500">
                    {activeState === '31-locale-vietnamese-auth'
                      ? 'Nhập tài khoản được cấp phát để truy cập không gian làm việc'
                      : 'Sign in to access your livestream operational workspace'}
                  </p>
                </div>

                {/* State-specific Notice & Alert Banners */}
                {activeState === '03-login-invalid-credentials' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800" data-testid="login-error-alert">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Xác thực không thành công</strong>
                      <p className="text-xs text-red-700 mt-0.5">Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại thông tin hoặc đặt lại mật khẩu.</p>
                    </div>
                  </div>
                )}

                {activeState === '06-login-authenticated-redirect' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-800" data-testid="login-redirect-alert">
                    <Loader2 className="h-5 w-5 text-blue-600 shrink-0 animate-spin mt-0.5" />
                    <div>
                      <strong className="font-semibold">Xác thực thành công (System Admin)</strong>
                      <p className="text-xs text-blue-700 mt-0.5">Đang kiểm tra quyền hạn RLS và chuyển hướng tới <code className="bg-blue-100 px-1 rounded font-mono">/calendar</code>...</p>
                    </div>
                  </div>
                )}

                {activeState === '07-session-expired-notice' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800" data-testid="session-expired-alert">
                    <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Phiên làm việc đã hết hạn</strong>
                      <p className="text-xs text-amber-700 mt-0.5">Thời hạn phiên làm việc an toàn (7 ngày) đã kết thúc. Vui lòng đăng nhập lại để tiếp tục điều phối ca phát sóng.</p>
                    </div>
                  </div>
                )}

                {activeState === '08-signed-out-notice' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-sm text-emerald-800" data-testid="signed-out-alert">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Đã đăng xuất an toàn</strong>
                      <p className="text-xs text-emerald-700 mt-0.5">Phiên làm việc và token xác thực cục bộ đã được dọn sạch hoàn toàn.</p>
                    </div>
                  </div>
                )}

                {activeState === '09-identity-unavailable-blocked' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800" data-testid="identity-unavailable-alert">
                    <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Chưa liên kết hồ sơ nhân sự (authIdentityUnavailable)</strong>
                      <p className="text-xs text-rose-700 mt-0.5">Tài khoản xác thực này chưa được liên kết với bản ghi nhân sự hợp lệ trong bảng <code className="bg-rose-100 px-1 rounded font-mono">public.users</code>. Hãy liên hệ Quản trị viên để được cấp phát.</p>
                    </div>
                  </div>
                )}

                {/* Login Form */}
                <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                  {/* Email Field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Email công việc <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        disabled={activeState === '02-login-validating' || activeState === '06-login-authenticated-redirect'}
                        placeholder="name@company.com"
                        className={`w-full pl-9 pr-3 py-2 text-sm rounded-md border ${
                          activeState === '04-login-validation-errors'
                            ? 'border-red-400 bg-red-50/30 text-red-900 focus:border-red-500 focus:ring-red-200'
                            : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-100'
                        } focus:outline-hidden focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all`}
                      />
                    </div>
                    {activeState === '04-login-validation-errors' && (
                      <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3" /> Vui lòng nhập địa chỉ email hợp lệ
                      </p>
                    )}
                  </div>

                  {/* Password Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700">
                        Mật khẩu truy cập <span className="text-red-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setActiveState('22-forgot-password-default')}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        Quên mật khẩu?
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        disabled={activeState === '02-login-validating' || activeState === '06-login-authenticated-redirect'}
                        placeholder="••••••••••••"
                        className={`w-full pl-9 pr-10 py-2 text-sm rounded-md border ${
                          activeState === '04-login-validation-errors'
                            ? 'border-red-400 bg-red-50/30 text-red-900 focus:border-red-500 focus:ring-red-200'
                            : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-blue-100'
                        } focus:outline-hidden focus:ring-2 disabled:bg-slate-100 disabled:cursor-not-allowed transition-all`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4 text-blue-600" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {activeState === '04-login-validation-errors' && (
                      <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                        <AlertCircle className="h-3 w-3" /> Vui lòng nhập mật khẩu của bạn
                      </p>
                    )}
                    {activeState === '05-login-password-visibility' && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                        <Check className="h-3 w-3" /> Chế độ hiển thị văn bản rõ (Show Password) đang bật
                      </p>
                    )}
                  </div>

                  {/* Remember Me Checkbox */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span className="text-xs text-slate-600">Ghi nhớ thiết bị an toàn</span>
                    </label>
                    <span className="text-[11px] text-slate-400">7 ngày hiệu lực</span>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={activeState === '02-login-validating' || activeState === '06-login-authenticated-redirect'}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm hover:shadow transition-all disabled:bg-blue-400 disabled:cursor-not-allowed"
                  >
                    {activeState === '02-login-validating' ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang xác thực thông tin...</span>
                      </>
                    ) : activeState === '06-login-authenticated-redirect' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Đã đăng nhập thành công</span>
                      </>
                    ) : (
                      <>
                        <span>Đăng nhập Bàn làm việc</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Account Request & Bottom Links */}
                <div className="pt-4 border-t border-slate-200 text-center space-y-3 text-xs">
                  <p className="text-slate-600">
                    Chưa có tài khoản nhân sự?{' '}
                    <button
                      type="button"
                      onClick={() => setActiveState('10-account-request-default')}
                      className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Gửi yêu cầu cấp tài khoản
                    </button>
                  </p>

                  {/* Quick Roles for Demo / Testing */}
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-left space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Tài khoản thử nghiệm (Demo Roles):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => { setEmail('admin@livestreamops.com'); setPassword('AdminPass2026!'); }}
                        className="rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-mono"
                      >
                        Admin
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmail('leader@livestreamops.com'); setPassword('LeaderPass2026!'); }}
                        className="rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-mono"
                      >
                        Leader
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEmail('host.talent@livestreamops.com'); setPassword('MemberPass2026!'); }}
                        className="rounded bg-white border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 font-mono"
                      >
                        Member (Host)
                      </button>
                    </div>
                  </div>

                  {/* Language switch */}
                  <div className="flex items-center justify-center gap-1.5 text-slate-400 text-[11px]">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Ngôn ngữ hệ thống:</span>
                    <button
                      type="button"
                      onClick={() => setActiveState(activeState === '31-locale-vietnamese-auth' ? '01-login-default' : '31-locale-vietnamese-auth')}
                      className="font-semibold text-slate-700 hover:text-blue-600 underline"
                    >
                      {activeState === '31-locale-vietnamese-auth' ? 'Tiếng Việt (Đang bật)' : 'English / Tiếng Việt'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 2: ACCOUNT REQUEST / REGISTER (10 to 14)             */}
            {/* ============================================================= */}
            {stateDef.category === 'register' && (
              <div className="space-y-5" data-testid="register-view-container">
                <div className="space-y-1 text-left">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Yêu cầu cấp tài khoản
                  </h1>
                  <p className="text-sm text-slate-500">
                    Gửi yêu cầu gia nhập hệ thống LiveStream Ops để được Quản trị viên xét duyệt
                  </p>
                </div>

                {activeState === '14-account-request-conflict-ratelimit' && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-800" data-testid="ratelimit-alert">
                    <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-semibold">Giới hạn tần suất gửi yêu cầu</strong>
                      <p className="text-xs text-red-700 mt-0.5">Địa chỉ IP hoặc email này đã gửi quá nhiều yêu cầu trong thời gian ngắn (ACCOUNT_REQUEST_RATE_LIMITED). Vui lòng thử lại sau.</p>
                    </div>
                  </div>
                )}

                {activeState === '13-account-request-submitted-success' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-4" data-testid="request-success-card">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-emerald-900">Đã tiếp nhận yêu cầu thành công</h2>
                      <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                        Thông tin của bạn đã được ghi nhận trong danh sách chờ duyệt của Quản trị viên. Chúng tôi sẽ gửi email kích hoạt ngay khi hồ sơ được phê duyệt.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-200 p-3 text-left text-xs space-y-1.5 font-mono text-slate-600">
                      <div><strong className="text-slate-800">Mã yêu cầu:</strong> #REQ-2026-0914</div>
                      <div><strong className="text-slate-800">Email:</strong> {email || 'tuan.nguyen@livestreamops.com'}</div>
                      <div><strong className="text-slate-800">Trạng thái:</strong> <span className="text-amber-600 font-semibold">pending_review</span></div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Quay lại trang Đăng nhập
                    </button>
                  </div>
                ) : (
                  <form className="space-y-3.5" onSubmit={e => e.preventDefault()}>
                    {/* Full Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Họ và tên nhân sự <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <User className="h-4 w-4" />
                        </div>
                        <input
                          type="text"
                          value={fullName}
                          onChange={e => setFullName(e.target.value)}
                          disabled={activeState === '12-account-request-submitting'}
                          placeholder="Nguyễn Văn A"
                          className={`w-full pl-9 pr-3 py-2 text-sm rounded-md border ${
                            activeState === '11-account-request-validation'
                              ? 'border-red-400 bg-red-50/30 text-red-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          } focus:outline-hidden focus:ring-2 focus:ring-blue-100`}
                        />
                      </div>
                      {activeState === '11-account-request-validation' && (
                        <p className="text-xs text-red-600 mt-1">Họ tên không được để trống</p>
                      )}
                    </div>

                    {/* Email */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Email công việc <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          disabled={activeState === '12-account-request-submitting'}
                          placeholder="name@company.com"
                          className={`w-full pl-9 pr-3 py-2 text-sm rounded-md border ${
                            activeState === '11-account-request-validation'
                              ? 'border-red-400 bg-red-50/30 text-red-900'
                              : 'border-slate-300 bg-white text-slate-900'
                          } focus:outline-hidden focus:ring-2 focus:ring-blue-100`}
                        />
                      </div>
                      {activeState === '11-account-request-validation' && (
                        <p className="text-xs text-red-600 mt-1">Email sai định dạng (thiếu @domain)</p>
                      )}
                    </div>

                    {/* Phone (Optional) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Số điện thoại <span className="text-slate-400 font-normal">(Không bắt buộc)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Phone className="h-4 w-4" />
                        </div>
                        <input
                          type="tel"
                          value={phone}
                          onChange={e => setPhone(e.target.value)}
                          disabled={activeState === '12-account-request-submitting'}
                          placeholder="0912 345 678"
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    {/* Department (Optional) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700">
                        Phòng ban / Bộ phận dự kiến <span className="text-slate-400 font-normal">(Không bắt buộc)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Building className="h-4 w-4" />
                        </div>
                        <input
                          type="text"
                          value={department}
                          onChange={e => setDepartment(e.target.value)}
                          disabled={activeState === '12-account-request-submitting'}
                          placeholder="Ví dụ: Livestream Host, Technical, Support..."
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <div className="rounded bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-500">
                      <Info className="h-3.5 w-3.5 inline mr-1 text-blue-600" />
                      Admin sẽ xem xét thông tin và phân quyền vai trò (Host / Support / Technical) trước khi tạo tài khoản chính thức.
                    </div>

                    <button
                      type="submit"
                      disabled={activeState === '12-account-request-submitting'}
                      className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all disabled:bg-blue-400"
                    >
                      {activeState === '12-account-request-submitting' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Đang gửi yêu cầu xét duyệt...</span>
                        </>
                      ) : (
                        <>
                          <span>Gửi yêu cầu cấp tài khoản</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    <div className="pt-3 text-center text-xs text-slate-600">
                      Đã có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => setActiveState('01-login-default')}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        Đăng nhập ngay
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 3: APPROVAL ACCESS GATE (15 to 18)                   */}
            {/* ============================================================= */}
            {stateDef.category === 'gate' && (
              <div className="space-y-5" data-testid="gate-view-container">
                {activeState === '15-approval-pending-gate' && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                      <Clock className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-amber-900">Tài khoản đang chờ phê duyệt</h2>
                      <p className="text-xs text-amber-700 max-w-sm mx-auto">
                        Tài khoản của bạn đã được ghi nhận trong hệ thống nhưng đang ở trạng thái <strong className="font-semibold">Chờ Quản trị viên duyệt (Pending Approval)</strong>.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-amber-200 p-3.5 text-left text-xs space-y-1.5 text-slate-600">
                      <div className="flex justify-between">
                        <span>Email xác thực:</span>
                        <strong className="text-slate-800 font-mono">mai.tran@livestreamops.com</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Ngày nộp yêu cầu:</span>
                        <span className="font-mono text-slate-700">2026-10-04 14:30</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tiến trình cấp phát:</span>
                        <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold font-mono">
                          NOT_STARTED
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Sau khi Admin phê duyệt và cấp phát quyền, bạn sẽ nhận được thông báo kích hoạt qua email.
                    </p>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-all"
                    >
                      Quay lại trang Đăng nhập
                    </button>
                  </div>
                )}

                {activeState === '16-approval-granted-access' && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-emerald-900">Tài khoản đã được phê duyệt!</h2>
                      <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                        Quản trị viên đã phê duyệt yêu cầu cấp tài khoản của bạn và phát hành thư mời kích hoạt.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-200 p-3.5 text-left text-xs space-y-2 text-slate-600">
                      <div className="flex justify-between">
                        <span>Vai trò hệ thống:</span>
                        <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[10px] font-bold font-mono">
                          SystemPermission: Member
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Vai trò vận hành:</span>
                        <span className="rounded bg-purple-100 text-purple-800 px-1.5 py-0.5 text-[10px] font-bold font-mono">
                          OperationalRole: Host (Livestream)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Trạng thái cấp phát:</span>
                        <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold font-mono">
                          provisioning_status: invited
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('25-reset-password-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Kích hoạt & Đặt mật khẩu đầu tiên
                    </button>
                  </div>
                )}

                {activeState === '17-approval-rejected-gate' && (
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                      <XCircle className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-red-900">Yêu cầu truy cập bị từ chối</h2>
                      <p className="text-xs text-red-700 max-w-sm mx-auto">
                        Rất tiếc, yêu cầu cấp tài khoản của bạn đã bị từ chối bởi người quản trị.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-red-200 p-3.5 text-left text-xs space-y-2 text-slate-700">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                        Lý do từ chối chính thức (rejection_reason):
                      </span>
                      <blockquote className="rounded bg-slate-50 p-2.5 border-l-2 border-red-500 text-xs text-slate-800 italic">
                        &ldquo;Định biên nhân sự khối Vận hành Livestream quý 4/2026 đã đủ chỉ tiêu phân bổ. Hồ sơ của bạn được lưu trữ cho đợt tuyển bổ sung tiếp theo.&rdquo;
                      </blockquote>
                      <div className="text-[11px] text-slate-500 pt-1">
                        Người xét duyệt: <strong className="text-slate-700">Admin Quản trị Vận hành</strong> • 2026-10-05 09:15
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveState('10-account-request-default')}
                        className="flex-1 py-2 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                      >
                        Gửi lại yêu cầu khác
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveState('01-login-default')}
                        className="flex-1 py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
                      >
                        Về trang Đăng nhập
                      </button>
                    </div>
                  </div>
                )}

                {activeState === '18-account-inactive-archived-blocked' && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center mx-auto">
                      <Lock className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-slate-900">Tài khoản nhân sự đã ngừng hoạt động</h2>
                      <p className="text-xs text-slate-600 max-w-sm mx-auto">
                        Hồ sơ nhân sự của bạn đã chuyển sang trạng thái <strong className="text-slate-800 font-mono">inactive</strong> hoặc <strong className="text-slate-800 font-mono">archived</strong>.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-slate-200 p-3.5 text-left text-xs space-y-2 text-slate-600">
                      <div className="flex justify-between">
                        <span>Nhân sự:</span>
                        <strong className="text-slate-800 font-medium">Lê Văn Hùng (Staff ID: #STF-088)</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Trạng thái hồ sơ:</span>
                        <span className="rounded bg-slate-200 text-slate-800 px-1.5 py-0.5 text-[10px] font-mono font-bold">
                          status: archived (soft-deleted)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Chính sách truy cập:</span>
                        <span className="text-red-600 font-medium">Đã thu hồi phiên đăng nhập & RLS</span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">
                      Nếu đây là sự nhầm lẫn, vui lòng liên hệ Bộ phận Nhân sự hoặc Quản trị viên để được khôi phục hồ sơ theo quy trình.
                    </p>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-all"
                    >
                      Quay lại trang Đăng nhập
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 4: EMAIL VERIFICATION (19 to 21)                     */}
            {/* ============================================================= */}
            {stateDef.category === 'verify' && (
              <div className="space-y-5" data-testid="verify-view-container">
                {activeState === '19-email-verification-pending' && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                      <Mail className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-blue-950">Kiểm tra hộp thư xác thực</h2>
                      <p className="text-xs text-blue-700 max-w-sm mx-auto">
                        Chúng tôi đã gửi liên kết xác minh tài khoản tới địa chỉ <strong className="text-blue-950 font-mono">host.talent@livestreamops.com</strong>.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-blue-200 p-3 text-xs text-slate-600 space-y-2 text-left">
                      <p className="font-semibold text-slate-800">Các bước tiếp theo:</p>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-600">
                        <li>Mở hòm thư điện tử của bạn và tìm email từ LiveStream Ops.</li>
                        <li>Nhấp vào nút &ldquo;Xác thực tài khoản&rdquo; trong thư.</li>
                        <li>Quay lại màn hình này để hoàn tất thiết lập mật khẩu.</li>
                      </ol>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveState('20-email-verification-success')}
                        className="flex-1 py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
                      >
                        Mô phỏng: Đã xác thực
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveState('01-login-default')}
                        className="flex-1 py-2 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                      >
                        Về Đăng nhập
                      </button>
                    </div>
                  </div>
                )}

                {activeState === '20-email-verification-success' && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-emerald-950">Email đã được xác thực thành công</h2>
                      <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                        Địa chỉ email của bạn đã được xác minh trên hệ thống Supabase Auth.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Tiến hành Đăng nhập
                    </button>
                  </div>
                )}

                {activeState === '21-auth-code-error-expired' && (
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-4" data-testid="auth-code-error-card">
                    <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-red-950">Liên kết xác thực đã hết hạn</h2>
                      <p className="text-xs text-red-700 max-w-sm mx-auto">
                        Mã xác thực hoặc token trong liên kết mời/khôi phục đã hết hạn hoặc đã được sử dụng trước đó (/auth/auth-code-error).
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-red-200 p-3 text-xs text-slate-700 text-left space-y-1">
                      <p className="font-semibold text-slate-900">Hướng dẫn khắc phục:</p>
                      <p className="text-slate-600">
                        Vui lòng yêu cầu gửi lại liên kết khôi phục mật khẩu mới hoặc liên hệ Quản trị viên để gửi lại thư mời kích hoạt tài khoản.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveState('22-forgot-password-default')}
                        className="flex-1 py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
                      >
                        Yêu cầu liên kết mới
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveState('01-login-default')}
                        className="flex-1 py-2 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                      >
                        Về trang Đăng nhập
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 5: PASSWORD RECOVERY (22 to 24)                       */}
            {/* ============================================================= */}
            {stateDef.category === 'recovery' && (
              <div className="space-y-5" data-testid="recovery-view-container">
                <div className="space-y-1 text-left">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Đặt lại mật khẩu
                  </h1>
                  <p className="text-sm text-slate-500">
                    Nhập email tài khoản của bạn để nhận liên kết khôi phục an toàn
                  </p>
                </div>

                {activeState === '24-forgot-password-sent-non-enumerating' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <Mail className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-emerald-950">Đã gửi hướng dẫn khôi phục</h2>
                      <p className="text-xs text-emerald-800 max-w-sm mx-auto">
                        Nếu địa chỉ email này tồn tại trên hệ thống LiveStream Ops, một liên kết đặt lại mật khẩu đã được gửi đến hòm thư của bạn.
                      </p>
                    </div>

                    <div className="rounded-lg bg-white border border-emerald-200 p-3 text-xs text-slate-600 text-left space-y-1">
                      <span className="font-semibold text-slate-800 block">Cơ chế Bảo mật Chống rà quét (Non-Enumerating):</span>
                      <p className="text-[11px] text-slate-600">
                        Để bảo vệ danh tính nhân sự, hệ thống luôn hiển thị thông báo thành công đồng nhất bất kể email có tồn tại hay không.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Quay lại trang Đăng nhập
                    </button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Email đăng ký tài khoản <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          type="email"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          disabled={activeState === '23-forgot-password-submitting'}
                          placeholder="name@company.com"
                          className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={activeState === '23-forgot-password-submitting'}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all disabled:bg-blue-400"
                    >
                      {activeState === '23-forgot-password-submitting' ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Đang gửi liên kết khôi phục...</span>
                        </>
                      ) : (
                        <>
                          <span>Gửi liên kết khôi phục mật khẩu</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>

                    <div className="pt-2 text-center text-xs">
                      <button
                        type="button"
                        onClick={() => setActiveState('01-login-default')}
                        className="font-medium text-slate-600 hover:text-blue-600 inline-flex items-center gap-1"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" /> Quay lại trang Đăng nhập
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 6: RESET PASSWORD (25 to 28)                         */}
            {/* ============================================================= */}
            {stateDef.category === 'reset' && (
              <div className="space-y-5" data-testid="reset-view-container">
                <div className="space-y-1 text-left">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Thiết lập mật khẩu mới
                  </h1>
                  <p className="text-sm text-slate-500">
                    Cập nhật mật khẩu bảo mật mới cho tài khoản LiveStream Ops của bạn
                  </p>
                </div>

                {activeState === '28-reset-password-token-expired' && (
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-red-950">Mã đặt lại mật khẩu đã hết hạn</h2>
                      <p className="text-xs text-red-700 max-w-sm mx-auto">
                        Liên kết đặt lại mật khẩu này đã hết hạn hiệu lực hoặc đã được sử dụng. Vui lòng tạo yêu cầu khôi phục mới.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('22-forgot-password-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Yêu cầu liên kết mới
                    </button>
                  </div>
                )}

                {activeState === '27-reset-password-success' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 text-center space-y-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-emerald-950">Mật khẩu đã được cập nhật thành công</h2>
                      <p className="text-xs text-emerald-700 max-w-sm mx-auto">
                        Mật khẩu mới đã được đồng bộ với hệ thống xác thực. Bạn có thể sử dụng mật khẩu này để đăng nhập ngay bây giờ.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveState('01-login-default')}
                      className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                    >
                      Đăng nhập ngay
                    </button>
                  </div>
                ) : (
                  activeState !== '28-reset-password-token-expired' && (
                    <form className="space-y-4" onSubmit={e => e.preventDefault()}>
                      {/* New Password */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Mật khẩu mới <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Lock className="h-4 w-4" />
                          </div>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Tối thiểu 8 ký tự"
                            className={`w-full pl-9 pr-3 py-2 text-sm rounded-md border ${
                              activeState === '26-reset-password-validation'
                                ? 'border-red-400 bg-red-50/30'
                                : 'border-slate-300 bg-white'
                            } focus:outline-hidden focus:ring-2 focus:ring-blue-100`}
                          />
                        </div>
                        {activeState === '26-reset-password-validation' && (
                          <p className="text-xs text-red-600 mt-1">Mật khẩu phải có ít nhất 8 ký tự</p>
                        )}
                      </div>

                      {/* Confirm Password */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-semibold text-slate-700">
                          Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                            <Lock className="h-4 w-4" />
                          </div>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Nhập lại mật khẩu mới"
                            className={`w-full pl-9 pr-3 py-2 text-sm rounded-md border ${
                              activeState === '26-reset-password-validation'
                                ? 'border-red-400 bg-red-50/30'
                                : 'border-slate-300 bg-white'
                            } focus:outline-hidden focus:ring-2 focus:ring-blue-100`}
                          />
                        </div>
                        {activeState === '26-reset-password-validation' && (
                          <p className="text-xs text-red-600 mt-1">Xác nhận mật khẩu không trùng khớp</p>
                        )}
                      </div>

                      <div className="rounded bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-500 space-y-1">
                        <p className="font-semibold text-slate-700">Yêu cầu bảo mật:</p>
                        <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-600">
                          <li>Ít nhất 8 ký tự</li>
                          <li>Nên bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt</li>
                        </ul>
                      </div>

                      <button
                        type="submit"
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                      >
                        <span>Cập nhật mật khẩu mới</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  )
                )}
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 7: ADMIN REVIEW & PROVISIONING MODAL (State 29)      */}
            {/* ============================================================= */}
            {activeState === '29-admin-review-provisioning-modal' && (
              <div className="space-y-4" data-testid="admin-review-modal-container">
                <div className="space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight text-slate-900">
                      Chi tiết Yêu cầu Cấp tài khoản
                    </h1>
                    <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold font-mono">
                      PENDING
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Thẩm định hồ sơ đăng ký nhân sự và thực hiện cấp phát (Auth ↔ People Lineage)
                  </p>
                </div>

                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-3.5 text-xs">
                  <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Họ và tên</span>
                      <strong className="text-slate-800 text-sm">Trần Văn Nam</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Email</span>
                      <strong className="text-slate-800 font-mono">nam.tran@company.com</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Số điện thoại</span>
                      <span className="text-slate-700 font-mono">0912345678</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Phòng ban</span>
                      <span className="text-slate-700 font-medium">Livestream Ops</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Phiên bản (CAS)</span>
                      <span className="font-mono text-blue-700 font-bold">version: 1</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block uppercase">Cấp phát</span>
                      <span className="rounded bg-slate-100 text-slate-700 px-1 py-0.5 font-mono text-[10px]">not_started</span>
                    </div>
                  </div>

                  {/* Rejection Reason Textarea */}
                  <div className="space-y-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Lý do từ chối (bắt buộc nếu nhấn Từ chối):
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={e => setRejectionReason(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      className="w-full p-2 text-xs rounded-md border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      placeholder="Nhập lý do chính thức gửi đến ứng viên..."
                    />
                  </div>

                  {/* Modal Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      className="flex-1 py-2 px-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Phê duyệt (Approve)
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-2 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <RotateCcw className="h-4 w-4" /> Cấp phát (Provision)
                    </button>
                    <button
                      type="button"
                      className="py-2 px-3 rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold flex items-center justify-center gap-1"
                    >
                      <XCircle className="h-4 w-4" /> Từ chối
                    </button>
                  </div>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveState('01-login-default')}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Đóng cửa sổ thẩm định
                  </button>
                </div>
              </div>
            )}

            {/* ============================================================= */}
            {/* SUB-FLOW 8: 403 UNAUTHORIZED / ROUTE GUARD (State 30)          */}
            {/* ============================================================= */}
            {activeState === '30-unauthorized-access-denied' && (
              <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center space-y-4" data-testid="unauthorized-guard-container">
                <div className="h-12 w-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                  <Shield className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <span className="rounded bg-red-200 text-red-900 px-2 py-0.5 text-xs font-bold font-mono">
                    403 FORBIDDEN
                  </span>
                  <h2 className="text-xl font-bold text-red-950 mt-2">Quyền hạn không đủ</h2>
                  <p className="text-xs text-red-700 max-w-sm mx-auto">
                    Khu vực Quản trị Hệ thống (Admin / Leader Area) yêu cầu quyền <code className="bg-red-100 px-1 rounded font-mono">admin</code> hoặc <code className="bg-red-100 px-1 rounded font-mono">leader</code>.
                  </p>
                </div>

                <div className="rounded-lg bg-white border border-red-200 p-3.5 text-left text-xs space-y-1.5 text-slate-700 font-mono">
                  <div><strong>Actor:</strong> Lê Văn C (host.c@ada.com)</div>
                  <div><strong>SystemPermission:</strong> <span className="text-purple-700">member</span></div>
                  <div><strong>OperationalRole:</strong> <span className="text-blue-700">host</span></div>
                  <div><strong>Target Route:</strong> <span className="text-red-700">/settings/system</span></div>
                  <div><strong>Policy Violation:</strong> STAFF_ADMIN_REQUIRED (RLS Denied)</div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveState('01-login-default')}
                  className="w-full py-2.5 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-all"
                >
                  Quay lại Bàn làm việc Thành viên (Member Desk)
                </button>
              </div>
            )}

            {/* Bottom Enterprise Compliance Footer */}
            <div className="pt-6 border-t border-slate-200 text-center text-[11px] text-slate-400 space-y-1">
              <p>© 2026 LiveStream Ops Platform. All rights reserved.</p>
              <p className="text-[10px] font-mono text-slate-400">
                Encrypted with TLS 1.3 • Supabase Auth Session Storage • Zero Leak Policy
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
