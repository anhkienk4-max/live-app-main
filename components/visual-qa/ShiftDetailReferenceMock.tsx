import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Gauge,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Mic2,
  MoreHorizontal,
  Music2,
  Pencil,
  Radio,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Upload,
  Users,
  Video,
  Wifi,
  Zap,
} from 'lucide-react'

interface NavItemFixture {
  label: string
  icon: LucideIcon
  active?: boolean
}

interface NavGroupFixture {
  label: string
  items: NavItemFixture[]
}

interface ParticipantFixture {
  initials: string
  name: string
  role: string
  status: 'live' | 'absent'
  tone: string
}

interface TimelineFixture {
  time: string
  title: string
  detail: string
  dot: string
}

interface AttachmentFixture {
  name: string
  metadata: string
  icon: typeof FileText
  tone: string
}

const NAV_GROUPS: NavGroupFixture[] = [
  {
    label: 'APP OPS',
    items: [{ label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'OPERATIONS',
    items: [
      { label: 'Calendar', icon: CalendarDays },
      { label: 'Live', icon: Radio },
      { label: 'Shifts', icon: BriefcaseBusiness, active: true },
      { label: 'Registration', icon: ClipboardCheck },
      { label: 'Staffing', icon: Users },
      { label: 'Swaps', icon: ArrowLeftRight },
      { label: 'Reports', icon: FileText },
      { label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'PERFORMANCE',
    items: [
      { label: 'Reports', icon: FileSpreadsheet },
      { label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'MANAGEMENT',
    items: [
      { label: 'Brands', icon: Tag },
      { label: 'Platforms', icon: Gauge },
      { label: 'Campaigns', icon: Megaphone },
      { label: 'Staff', icon: Users },
    ],
  },
  {
    label: 'SYSTEM',
    items: [
      { label: 'Audit', icon: ShieldCheck },
      { label: 'Import Data', icon: Upload },
      { label: 'Settings', icon: Settings },
    ],
  },
]

const TABS = ['Tổng quan', 'Nhân sự', 'Nội dung & Kịch bản', 'Thiết bị & Phòng studio', 'Hoạt động', 'Logs'] as const

const PARTICIPANTS: ParticipantFixture[] = [
  { initials: 'TN', name: 'Trần Văn Nam', role: 'Host', status: 'live', tone: 'bg-violet-50 text-violet-700' },
  { initials: 'LH', name: 'Lê Thị Hương', role: 'Support', status: 'live', tone: 'bg-indigo-50 text-indigo-700' },
  { initials: 'PQ', name: 'Phạm Minh Quân', role: 'Technical', status: 'live', tone: 'bg-pink-50 text-pink-700' },
  { initials: 'VN', name: 'Vũ Thị Ngọc', role: 'Support', status: 'absent', tone: 'bg-amber-50 text-amber-600' },
]

const TIMELINE: TimelineFixture[] = [
  { time: '08:30', title: 'Nhân sự bắt đầu check-in', detail: 'Trần Văn Nam, Lê Thị Hương', dot: 'bg-violet-600' },
  { time: '08:45', title: 'Thiết bị sẵn sàng', detail: 'Camera, Micro, Đèn, Internet', dot: 'bg-blue-500' },
  { time: '09:00', title: 'Bắt đầu livestream', detail: 'Pharmaton Livestream', dot: 'bg-violet-600' },
  { time: '10:15', title: 'Cập nhật kịch bản', detail: 'Thay đổi quà tặng theo yêu cầu brand', dot: 'bg-amber-500' },
  { time: '11:45', title: 'Kết thúc ca', detail: 'Đúng giờ', dot: 'bg-emerald-600' },
]

const ATTACHMENTS: AttachmentFixture[] = [
  { name: 'Kịch bản livestream - Pharmaton.pdf', metadata: '2.4 MB', icon: FileText, tone: 'bg-red-500' },
  { name: 'Danh sách quà tặng.docx', metadata: '1.2 MB', icon: FileSpreadsheet, tone: 'bg-blue-500' },
]

export function ShiftDetailReferenceMock() {
  return (
    <div lang="vi" translate="no" className="notranslate flex h-screen min-w-[1280px] overflow-hidden bg-[#f7faff] font-sans text-slate-900">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-3 border-b border-slate-200 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-600 text-white">
            <Zap className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[14px] font-bold leading-4 text-slate-950">LiveStream Ops</div>
            <div className="text-[12px] text-slate-500">Admin Center</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-2.5">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className={groupIndex === 0 ? '' : 'mt-2.5 border-t border-slate-100 pt-2.5'}>
              <div className="mb-1.5 px-2 text-[12px] font-semibold tracking-wide text-slate-400">{group.label}</div>
              <nav className="space-y-0.5">
                {group.items.map(({ label, icon: Icon, active }) => (
                  <button
                    key={`${group.label}-${label}`}
                    type="button"
                    className={`flex w-full items-center gap-3 rounded-md px-2.5 py-[5px] text-left text-[13px] font-medium ${active ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-violet-600' : 'text-slate-400'}`} />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-200 px-5 py-2.5">
          <InitialsAvatar initials="AD" tone="bg-blue-50 text-blue-700" size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-slate-800">Admin User</div>
            <div className="text-[12px] text-slate-500">System Administrator</div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex h-9 w-[460px] items-center gap-2.5 rounded-md border border-slate-200 bg-white px-3 text-slate-400">
            <Search className="h-4 w-4" />
            <span className="text-[13px]">Tìm kiếm nhân sự, ca làm việc, thương hiệu...</span>
            <span className="ml-auto rounded border border-slate-200 px-1.5 py-0.5 text-[12px]">⌘ K</span>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" aria-label="Thông báo" className="relative flex h-8 w-8 items-center justify-center text-slate-500">
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-0 top-0 rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">12</span>
            </button>
            <span className="h-7 w-px bg-slate-200" />
            <InitialsAvatar initials="AD" tone="bg-indigo-50 text-indigo-700" size="md" />
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-slate-800">Admin User</div>
              <div className="text-[12px] text-slate-500">Admin</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
          <div className="mx-auto max-w-[1180px]">
            <button type="button" className="flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
              <ArrowLeft className="h-3.5 w-3.5" />Quay lại danh sách ca
            </button>

            <div className="mt-2.5 flex items-start justify-between gap-6">
              <div>
                <h1 className="text-[22px] font-bold tracking-[-0.02em] text-slate-950">Chi tiết ca làm việc</h1>
                <p className="mt-1 text-[13px] text-slate-500">Xem thông tin chi tiết, nhân sự và các hoạt động của ca làm việc</p>
              </div>
              <div className="flex items-center gap-2">
                <ActionButton icon={Pencil}>Chỉnh sửa</ActionButton>
                <ActionButton icon={Copy}>Sao chép</ActionButton>
                <button type="button" aria-label="Thêm hành động" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_332px] items-start gap-[18px]">
              <div className="min-w-0">
                <section className="flex min-h-[124px] items-center rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
                  <ProductThumbnail />
                  <div className="ml-4 min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-[16px] font-bold text-slate-900">Pharmaton Livestream</h2>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-500">TIKTOK</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-600">
                      <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400" />Thứ Sáu, 23 Tháng 9 2026</span>
                      <span className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-slate-400" />09:00 - 11:00 (2 giờ)</span>
                      <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />Studio A</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <HeroChip tone="violet">Live Commerce</HeroChip>
                      <HeroChip tone="blue">Health</HeroChip>
                      <HeroChip tone="sky">Brand Campaign</HeroChip>
                    </div>
                  </div>
                </section>

                <nav aria-label="Chi tiết ca" className="mt-3 flex h-[44px] items-end rounded-xl border border-slate-200 bg-white px-0.5 text-[13px] font-medium text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
                  {TABS.map((tab, index) => (
                    <button
                      key={tab}
                      type="button"
                      className={`h-full flex-1 border-b-2 px-2 ${index === 0 ? 'border-violet-600 font-semibold text-violet-700' : 'border-transparent hover:text-slate-900'}`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>

                <div className="mt-3 space-y-3">
                  <SectionCard title="Thông tin ca làm việc">
                    <div className="grid grid-cols-3 border-t border-slate-100">
                      <InfoCell icon={Tag} label="Thương hiệu" value="Pharmaton" />
                      <InfoCell icon={Video} label="Nền tảng"><span className="flex items-center gap-1.5 font-semibold text-slate-700"><TikTokMark />TikTok</span></InfoCell>
                      <InfoCell icon={CalendarDays} label="Thời gian"><span className="font-semibold leading-5 text-slate-700">Thứ Sáu, 23/09/2026<br />09:00 - 11:00 (2 giờ)</span></InfoCell>
                      <InfoCell icon={MapPin} label="Địa điểm" value="Studio A" />
                      <InfoCell icon={Activity} label="Trạng thái"><StatusPill tone="green">Đang diễn ra</StatusPill></InfoCell>
                      <InfoCell icon={Zap} label="Loại ca" value="Live Commerce" />
                      <InfoCell icon={BarChart3} label="Mục tiêu" value="Tăng doanh số, nhận diện thương hiệu" />
                      <InfoCell icon={FileText} label="Ghi chú" value="Bảng kịch bản theo file đính kèm" className="col-span-2" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Nội dung & Kịch bản" action={<SectionLink>Xem chi tiết</SectionLink>}>
                    <div className="mx-4 mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-violet-600 text-white"><FileText className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-slate-800">Kịch bản livestream - Pharmaton.pdf</div>
                        <div className="mt-0.5 text-[12px] text-slate-500">2.4 MB · Cập nhật 20/09/2026 14:32</div>
                      </div>
                      <button type="button" className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600">
                        <Eye className="h-3.5 w-3.5" />Xem trước
                      </button>
                    </div>
                  </SectionCard>

                  <SectionCard title="Thiết bị & Phòng studio" action={<StatusPill tone="green">Đã sẵn sàng</StatusPill>}>
                    <div className="mx-4 grid grid-cols-5 overflow-hidden rounded-lg border border-slate-200">
                      <EquipmentCell icon={Building2} label="Phòng studio" value="Studio A" tone="bg-slate-50 text-slate-500" />
                      <EquipmentCell icon={Camera} label="Camera" value="2 máy" tone="bg-blue-50 text-blue-600" />
                      <EquipmentCell icon={Mic2} label="Micro" value="2 bộ" tone="bg-violet-50 text-violet-600" />
                      <EquipmentCell icon={Zap} label="Đèn chiếu sáng" value="Đầy đủ" tone="bg-amber-50 text-amber-600" />
                      <EquipmentCell icon={Wifi} label="Internet" value="Ổn định" tone="bg-emerald-50 text-emerald-600" />
                    </div>
                    <div className="mx-4 mb-3 mt-2.5 rounded-lg border border-rose-100 bg-rose-50/60 px-3 py-2">
                      <div className="flex items-center gap-2 text-[12px] font-semibold text-rose-600"><AlertCircle className="h-3.5 w-3.5" />Lưu ý quan trọng</div>
                      <ul className="mt-1.5 space-y-0.5 pl-5 text-[12px] leading-4 text-slate-500">
                        <li className="list-disc">Vui lòng đảm bảo đội ngũ có mặt trước 30 phút để setup.</li>
                        <li className="list-disc">Không claim hiệu quả điều trị. Tuân thủ quy định quảng cáo.</li>
                        <li className="list-disc">Kiểm tra kỹ nhãn mác và thông tin sản phẩm trước khi lên sóng.</li>
                      </ul>
                    </div>
                  </SectionCard>
                </div>
              </div>

              <aside className="space-y-3">
                <SectionCard title="Trạng thái ca">
                  <div className="px-4 pb-3.5">
                    <div className="flex items-center justify-between">
                      <StatusPill tone="green"><span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />Đang diễn ra</StatusPill>
                      <span className="rounded bg-red-500 px-2 py-1 text-[12px] font-bold text-white">● LIVE</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[56%] rounded-full bg-violet-600" /></div>
                    <div className="mt-2 flex items-center justify-between text-[12px] font-medium text-slate-500">
                      <span>01:12:34&nbsp; / &nbsp;02:00:00</span>
                      <span className="font-semibold text-slate-700">56%</span>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Nhân sự tham gia" titleSuffix="(3/4)" action={<SectionLink>Xem tất cả</SectionLink>}>
                  <div className="divide-y divide-slate-100 px-4 pb-2">
                    {PARTICIPANTS.map((person) => (
                      <div key={person.name} className="flex items-center gap-3 py-2">
                        <InitialsAvatar initials={person.initials} tone={person.tone} size="lg" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-slate-800">{person.name}</div>
                          <div className="mt-0.5 text-[12px] text-slate-500">{person.role}</div>
                        </div>
                        <StatusPill tone={person.status === 'live' ? 'green' : 'gray'}>{person.status === 'live' ? 'Đang live' : 'Chưa vào'}</StatusPill>
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Timeline hoạt động" action={<SectionLink>Xem tất cả</SectionLink>}>
                  <div className="px-5 pb-3">
                    {TIMELINE.map((event, index) => (
                      <div key={`${event.time}-${event.title}`} className="relative grid grid-cols-[42px_1fr] gap-3 pb-3 last:pb-0">
                        {index < TIMELINE.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-slate-200" />}
                        <div className="flex items-start gap-2">
                          <span className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white ${event.dot}`} />
                          <span className="text-[12px] text-slate-400">{event.time}</span>
                        </div>
                        <div>
                          <div className="text-[12px] font-semibold text-slate-700">{event.title}</div>
                          <div className="mt-0.5 text-[12px] leading-4 text-slate-400">{event.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Tài liệu đính kèm" action={<SectionLink>Xem tất cả</SectionLink>}>
                  <div className="space-y-1.5 px-4 pb-3">
                    {ATTACHMENTS.map(({ name, metadata, icon: Icon, tone }) => (
                      <div key={name} className="flex items-center gap-3 rounded-lg border border-slate-200 px-2.5 py-1.5">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white ${tone}`}><Icon className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-semibold text-slate-700">{name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">{metadata}</div>
                        </div>
                        <Download className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function ProductThumbnail() {
  return (
    <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-amber-500 text-white shadow-sm">
      <span className="absolute inset-x-0 top-0 h-2 bg-amber-400" />
      <span className="text-[13px] font-bold tracking-tight">Pharmaton</span>
    </span>
  )
}

function TikTokMark() {
  return <span className="flex h-5 w-5 items-center justify-center rounded bg-black text-white"><Music2 className="h-3 w-3" /></span>
}

function ActionButton({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3.5 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
      <Icon className="h-3.5 w-3.5 text-slate-600" />{children}
    </button>
  )
}

function HeroChip({ tone, children }: { tone: 'violet' | 'blue' | 'sky'; children: React.ReactNode }) {
  const toneClass = tone === 'violet' ? 'bg-violet-50 text-violet-700' : tone === 'blue' ? 'bg-blue-50 text-blue-700' : 'bg-sky-50 text-sky-700'
  return <span className={`rounded-md px-2.5 py-1 text-[12px] font-semibold ${toneClass}`}>{children}</span>
}

function SectionCard({ title, titleSuffix, action, children }: { title: string; titleSuffix?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]">
      <div className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2">
        <h2 className="text-[13px] font-bold text-slate-900">{title}{titleSuffix && <span className="ml-1 font-medium text-slate-400">{titleSuffix}</span>}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function SectionLink({ children }: { children: React.ReactNode }) {
  return <button type="button" className="flex items-center gap-1 text-[12px] font-semibold text-violet-600">{children}<ArrowRight className="h-3 w-3" /></button>
}

function InfoCell({ icon: Icon, label, value, children, className = '' }: { icon: LucideIcon; label: string; value?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-[74px] items-start gap-2.5 border-b border-r border-slate-100 px-3.5 py-2.5 ${className}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0">
        <div className="text-[12px] text-slate-400">{label}</div>
        <div className="mt-1 text-[12px] font-semibold leading-4 text-slate-700">{children ?? value}</div>
      </div>
    </div>
  )
}

function EquipmentCell({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 border-r border-slate-200 px-3 py-2 last:border-r-0">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${tone}`}><Icon className="h-3.5 w-3.5" /></span>
      <div className="min-w-0">
        <div className="truncate text-[11px] font-medium text-slate-500">{label}</div>
        <div className="mt-0.5 truncate text-[12px] font-semibold text-slate-700">{value}</div>
      </div>
    </div>
  )
}

function StatusPill({ tone, children }: { tone: 'green' | 'gray'; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold ${tone === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{children}</span>
}

function InitialsAvatar({ initials, tone, size }: { initials: string; tone: string; size: 'md' | 'lg' }) {
  const sizeClass = size === 'md' ? 'h-8 w-8 text-[12px]' : 'h-9 w-9 text-[12px]'
  return <span className={`flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-inset ring-slate-100 ${tone} ${sizeClass}`}>{initials}</span>
}
