'use client'

import { useState } from 'react'
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  LayoutDashboard,
  MoreHorizontal,
  Music2,
  Plus,
  Radio,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'

type EditShiftPreviewState = 'none' | 'duplicate' | 'delete' | 'success' | 'error'

const NAV_ITEMS = [
  { label: 'My Workspace', icon: LayoutDashboard, active: false },
  { label: 'My Schedule', icon: CalendarDays, active: false },
  { label: 'Shifts', icon: Users, active: true },
  { label: 'Staffing', icon: BriefcaseBusiness, active: false },
  { label: 'Swaps', icon: Copy, active: false },
  { label: 'Live', icon: Radio, active: false },
  { label: 'Reports', icon: BarChart3, active: false },
  { label: 'Notifications', icon: Bell, active: false },
] as const

const SHIFTS = [
  { name: 'Pharmaton T9', product: 'Pharmaton Vitality', date: '10/09/2026', time: '14:00 – 17:00', studio: 'Studio A', status: 'Đang diễn ra' },
  { name: 'Lactacyd Daily Care', product: 'Lactacyd', date: '11/09/2026', time: '09:00 – 11:00', studio: 'Studio B', status: 'Sắp diễn ra' },
  { name: 'Ostelin Vitamin D3', product: 'Ostelin', date: '12/09/2026', time: '15:00 – 17:00', studio: 'Studio A', status: 'Sắp diễn ra' },
] as const

export function EditShiftActionsReferenceMock({ initialState = 'none' }: { initialState?: EditShiftPreviewState }) {
  const [previewState, setPreviewState] = useState<EditShiftPreviewState>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const closePreview = () => setPreviewState('none')
  const openPreview = (state: Exclude<EditShiftPreviewState, 'none'>) => {
    setPreviewState(state)
    setQaOpen(false)
  }

  return (
    <div lang="vi" translate="no" className="notranslate relative flex h-screen min-w-[1180px] overflow-hidden bg-slate-50 font-sans text-slate-900">
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
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[14px] font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-200'}`}
            >
              <Icon className="h-[17px] w-[17px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-700">NK</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">Nguyễn Trung Kiên</div>
            <div className="text-[11px] text-slate-400">Admin</div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-slate-400" />
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-slate-50">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div className="flex h-9 w-[440px] items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 text-[13px] text-slate-400">
            <Search className="h-4 w-4" />
            Tìm kiếm ca làm việc, thương hiệu...
          </div>
          <div className="flex items-center gap-2 text-slate-500">
            <button type="button" aria-label="Thông báo" className="flex h-8 w-8 items-center justify-center rounded-full"><Bell className="h-4 w-4" /></button>
            <button type="button" aria-label="Nhóm" className="flex h-8 w-8 items-center justify-center rounded-full"><Users className="h-4 w-4" /></button>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-[12px] font-bold text-blue-700">NK</span>
          </div>
        </header>

        <div className="px-7 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-slate-950">Shifts</h1>
              <p className="mt-1 text-[13px] text-slate-500">Quản lý lịch làm việc và nhân sự tham gia</p>
            </div>
            <button type="button" className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white"><Plus className="h-3.5 w-3.5" /><span><FrozenText>Tạo ca mới</FrozenText></span></button>
          </div>

          <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <div className="flex h-9 w-[280px] items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-400"><Search className="h-3.5 w-3.5" />Tìm ca làm việc</div>
              <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[12px] text-slate-600"><span><FrozenText>Tất cả trạng thái</FrozenText></span><ChevronDown className="h-3.5 w-3.5" /></div>
            </div>
            <div className="grid grid-cols-[1.45fr_0.9fr_0.9fr_0.7fr_0.7fr_28px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Ca làm việc</span><span><FrozenText>Ngày</FrozenText></span><span><FrozenText>Thời gian</FrozenText></span><span>Studio</span><span><FrozenText>Trạng thái</FrozenText></span><span />
            </div>
            {SHIFTS.map((shift) => (
              <div key={shift.name} className="grid grid-cols-[1.45fr_0.9fr_0.9fr_0.7fr_0.7fr_28px] items-center gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-black text-white"><Music2 className="h-4 w-4" /></span>
                  <div className="min-w-0"><div className="truncate text-[13px] font-semibold text-slate-800">{shift.name}</div><div className="mt-0.5 truncate text-[12px] text-slate-500">{shift.product} · TikTok Shop</div></div>
                </div>
                <span className="text-[12px] text-slate-600">{shift.date}</span>
                <span className="text-[12px] text-slate-600">{shift.time}</span>
                <span className="text-[12px] text-slate-600">{shift.studio}</span>
                <span className="w-fit rounded-md bg-emerald-50 px-2 py-1 text-[12px] font-semibold text-emerald-700">{shift.status}</span>
                <MoreHorizontal className="h-4 w-4 text-slate-400" />
              </div>
            ))}
          </section>
        </div>
      </main>

      {previewState === 'none' && (
        <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">
          {qaOpen && (
            <div className="w-[152px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              <div className="mb-1.5 px-1 text-[12px] font-semibold uppercase tracking-wide text-slate-400">QA States</div>
              <div className="grid gap-1">
                <button type="button" onClick={() => openPreview('duplicate')} className="rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50"><FrozenText>Nhân bản</FrozenText></button>
                <button type="button" onClick={() => openPreview('delete')} className="rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-red-700 hover:bg-red-50"><FrozenText>Xóa</FrozenText></button>
                <button type="button" onClick={() => openPreview('success')} className="rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-emerald-700 hover:bg-emerald-50"><FrozenText>Thành công</FrozenText></button>
                <button type="button" onClick={() => openPreview('error')} className="rounded-md px-2.5 py-2 text-left text-[12px] font-medium text-rose-700 hover:bg-rose-50"><FrozenText>Lỗi</FrozenText></button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => setQaOpen((open) => !open)} aria-expanded={qaOpen} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button>
        </div>
      )}

      {previewState === 'duplicate' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
          <section role="dialog" aria-modal="true" aria-labelledby="duplicate-shift-title" className="w-[420px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 id="duplicate-shift-title" className="text-[15px] font-bold text-slate-950"><FrozenText>Tạo ca mới từ ca hiện có</FrozenText></h2>
              <button type="button" onClick={closePreview} aria-label="Đóng" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button>
            </header>

            <div className="px-5 py-4">
              <p className="text-[13px] font-medium text-slate-700"><FrozenText>Bạn có muốn tạo ca mới từ ca này không?</FrozenText></p>
              <p className="mt-1 text-[12px] leading-4 text-slate-500">Thông tin ca và người được gán sẽ điền sẵn. Đăng ký, tác vụ và cập nhật live không được sao chép.</p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-slate-600"><FrozenText>Ngày</FrozenText></span>
                  <span className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-[12px] font-medium text-slate-700">
                    <span className="flex-1">11/09/2026</span><CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-slate-600"><FrozenText>Thời gian</FrozenText></span>
                  <span className="flex h-9 items-center rounded-md border border-slate-200 px-3 text-[12px] font-medium text-slate-700">
                    <Clock3 className="mr-2 h-3.5 w-3.5 text-slate-400" /><span className="flex-1">14:00 – 17:00</span><ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                </label>
              </div>

              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600">Ngày mới phải chọn · trạng thái đặt lại Đã lên lịch · khóa đăng ký tắt · link live trống.</p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={closePreview} className="h-9 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600"><FrozenText>Hủy</FrozenText></button>
                <button type="button" className="h-9 rounded-md bg-blue-600 text-[12px] font-semibold text-white"><FrozenText>Tạo ca mới</FrozenText></button>
              </div>
            </div>
          </section>
        </div>
      )}

      {previewState === 'delete' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-shift-title" className="relative w-[420px] max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white px-5 pb-4 pt-5 text-center shadow-lg">
            <button type="button" onClick={closePreview} aria-label="Đóng" className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-md text-slate-400"><X className="h-4 w-4" /></button>
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600"><Trash2 className="h-5 w-5" /></span>
            <h2 id="delete-shift-title" className="mt-3 text-[15px] font-bold text-slate-950"><FrozenText>Xóa ca này?</FrozenText></h2>
            <p className="mt-1 text-[12px] text-slate-500">Chính sách xóa phụ thuộc vào lịch sử của ca.</p>
            <div className="mt-3 border-t border-slate-100 pt-3 text-[12px] text-slate-600">
              <div className="flex items-center justify-center gap-2"><span className="font-semibold text-slate-800">Pharmaton</span><span>•</span><span>10/09/2026</span><span>•</span><span>14:00 – 17:00</span></div>
              <div className="mt-1">Studio A <span className="px-1.5">•</span> Livestream</div>
            </div>
            <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-left text-[11px] leading-4 text-rose-700">Ca có đăng ký, cập nhật live hoặc báo cáo sẽ được hủy và xóa mềm để giữ lịch sử. Ca tương lai chưa có lịch sử có thể xóa. Chỉ Admin được xóa; cần lý do và phiên bản hiện tại.</p>
            <div className="-mx-5 mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 px-5 pt-4">
              <button type="button" onClick={closePreview} className="h-9 rounded-md border border-slate-200 bg-white text-[12px] font-semibold text-slate-600"><FrozenText>Hủy</FrozenText></button>
              <button type="button" className="flex h-9 items-center justify-center gap-2 rounded-md bg-red-600 text-[12px] font-semibold text-white"><Trash2 className="h-3.5 w-3.5" /><span><FrozenText>Xóa</FrozenText></span></button>
            </div>
          </section>
        </div>
      )}

      {previewState === 'success' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
          <section role="status" className="relative flex w-[400px] max-w-[calc(100vw-48px)] items-start gap-3 rounded-lg border border-emerald-300 bg-white px-4 py-3.5 shadow-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-[13px] font-bold text-emerald-700"><FrozenText>Đã lưu thay đổi</FrozenText></h2>
              <p className="mt-1 text-[12px] leading-4 text-slate-500"><FrozenText>Thông tin ca đã được cập nhật thành công.</FrozenText></p>
            </div>
            <button type="button" onClick={closePreview} aria-label="Đóng" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400"><X className="h-3.5 w-3.5" /></button>
          </section>
        </div>
      )}

      {previewState === 'error' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35">
          <section role="alert" className="relative flex w-[400px] max-w-[calc(100vw-48px)] items-start gap-3 rounded-lg border border-red-300 bg-white px-4 py-3.5 shadow-lg">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white"><CircleAlert className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 className="text-[13px] font-bold text-red-700"><FrozenText>Không thể lưu thay đổi</FrozenText></h2>
              <p className="mt-1 text-[12px] leading-4 text-slate-500"><FrozenText>Vui lòng kiểm tra lại thông tin nhân sự hoặc thời gian ca.</FrozenText></p>
            </div>
            <button type="button" onClick={closePreview} aria-label="Đóng" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400"><X className="h-3.5 w-3.5" /></button>
          </section>
        </div>
      )}
    </div>
  )
}

function FrozenText({ children }: { children: string }) {
  return <><span>{children.slice(0, 1)}</span>{children.slice(1)}</>
}
