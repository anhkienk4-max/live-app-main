import type { LucideIcon } from 'lucide-react'
import { ShiftEditSupplement } from './ShiftOperationalReference'
import {
  ArrowLeft,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  MapPin,
  MoreHorizontal,
  Music2,
  Pencil,
  Plus,
  Radio,
  Save,
  Search,
  UploadCloud,
  Users,
  X,
} from 'lucide-react'

interface StaffFixture {
  role: string
  name: string
  initials: string
  avatarTone: string
  status: 'confirmed' | 'pending'
}

interface TaskFixture {
  title: string
  owner: string
  due: string
}

interface AttachmentFixture {
  name: string
  metadata: string
  icon: typeof FileText
  tone: string
}

const NAV_ITEMS: Array<{ label: string; icon: LucideIcon; active?: boolean }> = [
  { label: 'My Workspace', icon: LayoutDashboard },
  { label: 'My Schedule', icon: CalendarDays },
  { label: 'Shifts', icon: Users, active: true },
  { label: 'Staffing', icon: BriefcaseBusiness },
  { label: 'Swaps', icon: Copy },
  { label: 'Live', icon: Radio },
  { label: 'Reports', icon: BarChart3 },
  { label: 'Notifications', icon: Bell },
]

const STAFF: StaffFixture[] = [
  { role: 'Host', name: 'Minh', initials: 'MI', avatarTone: 'bg-blue-100 text-blue-700', status: 'confirmed' },
  { role: 'Co-host', name: 'Khánh', initials: 'KH', avatarTone: 'bg-slate-800 text-white', status: 'confirmed' },
  { role: 'Producer', name: 'Nhật Linh', initials: 'NL', avatarTone: 'bg-amber-100 text-amber-800', status: 'confirmed' },
  { role: 'Camera', name: 'Dương', initials: 'D', avatarTone: 'bg-cyan-100 text-cyan-800', status: 'confirmed' },
  { role: 'Support', name: 'Hà My', initials: 'HM', avatarTone: 'bg-pink-100 text-pink-700', status: 'confirmed' },
  { role: 'Backup', name: 'Kiệt', initials: 'K', avatarTone: 'bg-indigo-100 text-indigo-700', status: 'pending' },
]

const TASKS: TaskFixture[] = [
  { title: 'Chuẩn bị kịch bản', owner: 'Minh', due: '08/09' },
  { title: 'Set up studio', owner: 'Dương', due: '09/09' },
  { title: 'Kiểm tra thiết bị', owner: 'Nhật Linh', due: '09/09' },
  { title: 'Duyệt nội dung', owner: 'Mie', due: '10/09' },
  { title: 'Livestream', owner: 'Team', due: '10/09' },
]

const REQUIREMENTS = ['Đúng giờ', 'Trang phục theo brand', 'Chuẩn bị thiết bị', 'Check-in studio'] as const

const ATTACHMENTS: AttachmentFixture[] = [
  { name: 'Brief_Pharmaton_T9.pdf', metadata: 'PDF · 2.4 MB', icon: FileText, tone: 'bg-red-500' },
  { name: 'Shotlist_T9.xlsx', metadata: 'XLSX · 1.1 MB', icon: FileSpreadsheet, tone: 'bg-emerald-500' },
]

export function EditShiftReferenceMock() {
  return (
    <div lang="vi" translate="no" className="notranslate flex h-screen min-w-[1180px] overflow-hidden bg-slate-50 font-sans text-slate-900">
      <aside className="flex w-[248px] shrink-0 flex-col bg-[#082743] text-white">
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600"><BarChart3 className="h-4 w-4" /></span>
          <span className="text-[15px] font-semibold tracking-tight">LiveStream Ops</span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-6">
          {NAV_ITEMS.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[14px] font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-white/5'}`}
            >
              <Icon className="h-[17px] w-[17px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <InitialsAvatar initials="NK" tone="bg-slate-100 text-slate-700" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">Nguyễn Trung Kiên</div>
            <div className="text-[11px] text-slate-400">Admin</div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" aria-label="Quay lại" className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button>
            <div className="flex h-9 max-w-[720px] flex-1 items-center rounded-full border border-slate-200 bg-slate-50 px-4 text-[13px] text-slate-500">
              <span>Shifts</span>
              <span className="px-2 text-slate-300">›</span>
              <span className="font-medium text-slate-700">Edit Shift</span>
            </div>
          </div>
          <div className="ml-5 flex items-center gap-2 text-slate-500">
            <UtilityButton label="Tìm kiếm"><Search className="h-4 w-4" /></UtilityButton>
            <UtilityButton label="Thêm tùy chọn"><MoreHorizontal className="h-4 w-4" /></UtilityButton>
            <UtilityButton label="Nhóm"><Users className="h-4 w-4" /></UtilityButton>
            <InitialsAvatar initials="NK" tone="bg-blue-100 text-blue-700" size="md" />
          </div>
        </header>

        <section className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-7 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">Edit Shift</h1>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Đang diễn ra
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600"><X className="h-3.5 w-3.5" />Hủy</button>
            <button type="button" className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white"><Save className="h-3.5 w-3.5" />Lưu thay đổi</button>
          </div>
        </section>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-6 py-4">
          <div className="grid grid-cols-[1.08fr_1fr_0.98fr] items-start gap-3.5">
            <SectionCard title="Thông tin ca">
              <div className="space-y-1.5 px-4 pb-4">
                <CompactField label="Thương hiệu" value="Pharmaton" select required />
                <CompactField label="Sản phẩm" value="Pharmaton Vitality" select required />
                <CompactField label="Nền tảng" select required value={<span className="flex items-center gap-2"><TikTokMark />TikTok Shop</span>} />
                <CompactField label="Studio" value="Studio A" select required />
                <CompactField label="Địa điểm" value="Tòa nhà ADA, Quận 1, HCM" required />
                <CompactField label="Ngày" value="10/09/2026" icon={CalendarDays} required />
                <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                  <FieldLabel label="Thời gian" required compact />
                  <div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <StaticControl value="14:00" icon={Clock3} />
                      <span className="text-[13px] text-slate-400">—</span>
                      <StaticControl value="17:00" icon={Clock3} />
                    </div>
                    <div className="mt-1 text-right text-[12px] text-slate-400">Thời lượng: 3 tiếng</div>
                  </div>
                </div>
                <CompactField label="Loại ca" value="Livestream" select required />
                <div className="grid grid-cols-[92px_1fr] items-start gap-3">
                  <FieldLabel label="Mô tả" compact />
                  <div className="min-h-16 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-5 text-slate-700">
                    Pharmaton T9 – Siêu sale ngày đôi<br />Chuẩn bị set up từ 13:30
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Nhân sự (6/6)"
              action={<button type="button" className="flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1.5 text-[12px] font-semibold text-blue-600"><Plus className="h-3 w-3" />Thêm nhân sự</button>}
            >
              <div className="divide-y divide-slate-100 px-4 pb-2">
                {STAFF.map((member) => (
                  <div key={member.role} className="grid grid-cols-[76px_1fr_auto] items-center gap-2 py-2 text-[13px]">
                    <span className="font-medium text-slate-500">{member.role}</span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <InitialsAvatar initials={member.initials} tone={member.avatarTone} size="md" />
                      <span className="truncate font-semibold text-slate-700">{member.name}</span>
                    </span>
                    <span className={`rounded-md px-2 py-1.5 text-[12px] font-semibold ${member.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'}`}>
                      {member.status === 'confirmed' ? 'Đã xác nhận' : 'Chờ xác nhận'}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <div className="grid content-start gap-3.5">
              <SectionCard title="Trạng thái công việc (5/5)">
                <div className="px-4 pb-3.5">
                  <div className="flex items-center justify-between text-[12px] text-slate-500">
                    <span>5/5 hoàn thành</span>
                    <span className="font-semibold text-slate-700">100%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-full rounded-full bg-emerald-500" /></div>
                  <div className="mt-3 divide-y divide-slate-100">
                    {TASKS.map((task) => (
                      <div key={task.title} className="grid grid-cols-[22px_minmax(0,1fr)_58px_38px] items-center gap-2 py-2 text-[12px]">
                        <span className="flex h-[18px] w-[18px] items-center justify-center rounded bg-emerald-600 text-white"><Check className="h-3 w-3" /></span>
                        <span className="truncate text-[12px] font-medium text-slate-700">{task.title}</span>
                        <span className="truncate text-slate-500">{task.owner}</span>
                        <span className="text-right text-slate-500">{task.due}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Ghi chú"
                action={<button type="button" aria-label="Chỉnh sửa ghi chú" className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-blue-600"><Pencil className="h-3.5 w-3.5" /></button>}
              >
                <div className="px-4 pb-4 text-[13px] leading-5 text-slate-600">
                  <p>Lưu ý: Host mặc trang phục màu pastel, tránh áo trắng.</p>
                  <p className="mt-1">Kiểm tra âm thanh trước 30 phút.</p>
                </div>
              </SectionCard>
            </div>
          </div>

          <div className="mt-4 space-y-3.5">
            <div className="grid grid-cols-[2fr_3fr] items-stretch gap-3.5">
              <SectionCard title="Thông tin bổ sung">
                <div className="grid grid-cols-[0.8fr_1.2fr] gap-3 px-4 pb-4">
                  <StaticField label="Tên ca" value="Pharmaton T9" required />
                  <StaticField label="Địa chỉ chi tiết" value="Studio A, Tòa nhà ADA" />
                </div>
              </SectionCard>

              <SectionCard
                title="Yêu cầu"
                action={<button type="button" className="flex items-center gap-1 text-[12px] font-semibold text-blue-600"><Plus className="h-3 w-3" />Thêm yêu cầu</button>}
              >
                <div className="flex flex-wrap gap-2 px-4 pb-4">
                  {REQUIREMENTS.map((requirement) => (
                    <span key={requirement} className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-[12px] font-medium text-blue-700">
                      <CheckCircle2 className="h-3 w-3" />{requirement}
                    </span>
                  ))}
                </div>
              </SectionCard>
            </div>

            <div className="grid grid-cols-[1.85fr_1fr] items-stretch gap-3.5">
              <SectionCard title="Tệp đính kèm">
                <div className="grid grid-cols-[1fr_1.08fr] gap-3 px-4 pb-4">
                  <div className="space-y-2">
                    {ATTACHMENTS.map(({ name, metadata, icon: Icon, tone }) => (
                      <div key={name} className="flex items-center gap-2.5 rounded-md border border-slate-200 px-2.5 py-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white ${tone}`}><Icon className="h-3.5 w-3.5" /></span>
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-slate-700">{name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">{metadata}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex min-h-[88px] flex-col items-center justify-center rounded-lg border border-dashed border-blue-300 bg-blue-50/30 px-3 text-center">
                    <UploadCloud className="h-5 w-5 text-blue-500" />
                    <div className="mt-1.5 text-[12px] font-medium text-slate-600">Kéo thả file vào đây hoặc <span className="font-semibold text-blue-600">Chọn file</span></div>
                    <div className="mt-1 text-[11px] text-slate-400">PDF, DOC, XLSX, JPG, PNG · tối đa 10MB</div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Ghi chú thêm">
                <div className="px-4 pb-4">
                  <div className="min-h-[88px] rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-400">Nhập ghi chú thêm...</div>
                </div>
              </SectionCard>
            </div>
          </div>
          <div className="mt-4"><ShiftEditSupplement /></div>
        </div>
      </main>
    </div>
  )
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
      <div className="flex min-h-[46px] items-center justify-between gap-3 px-4 py-2.5">
        <h2 className="text-[14px] font-bold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ label, required = false, compact = false }: { label: string; required?: boolean; compact?: boolean }) {
  return <div className={`${compact ? 'pt-2' : 'mb-1.5'} text-[12px] font-medium text-slate-600`}>{label}{required && <span className="ml-0.5 text-red-500">*</span>}</div>
}

function CompactField({ label, value, required = false, select = false, icon }: { label: string; value: React.ReactNode; required?: boolean; select?: boolean; icon?: LucideIcon }) {
  return (
    <div className="grid grid-cols-[92px_1fr] items-start gap-3">
      <FieldLabel label={label} required={required} compact />
      <StaticControl value={value} icon={icon} select={select} />
    </div>
  )
}

function StaticField({ label, value, required = false, select = false, icon }: { label: string; value: React.ReactNode; required?: boolean; select?: boolean; icon?: LucideIcon }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <StaticControl value={value} icon={icon} select={select} />
    </div>
  )
}

function StaticControl({ value, icon: Icon, select = false }: { value: React.ReactNode; icon?: LucideIcon; select?: boolean }) {
  return (
    <div className="flex h-[34px] items-center rounded-md border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700">
      <span className="min-w-0 flex-1 truncate">{value}</span>
      {Icon && <Icon className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />}
      {select && <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />}
    </div>
  )
}

function TikTokMark() {
  return <span className="flex h-5 w-5 items-center justify-center rounded bg-black text-white"><Music2 className="h-3 w-3" /></span>
}

function UtilityButton({ label, children }: { label: string; children: React.ReactNode }) {
  return <button type="button" aria-label={label} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100">{children}</button>
}

function InitialsAvatar({ initials, tone, size }: { initials: string; tone: string; size: 'md' | 'lg' }) {
  const sizeClass = size === 'md' ? 'h-8 w-8 text-[12px]' : 'h-9 w-9 text-[12px]'
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-inset ring-slate-200 ${tone} ${sizeClass}`}>{initials}</span>
}
