'use client'

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { OpsWorkflowReferenceShell } from './OpsWorkflowReferenceShell'

type NotificationPreview = 'none' | 'settings' | 'toast' | 'history' | 'empty'

type NotificationItem = {
  id: string
  type: 'swap' | 'shift' | 'approval' | 'schedule' | 'reminder' | 'system'
  title: string
  message: string
  time: string
  group: 'Hôm nay' | 'Hôm qua'
  unread: boolean
  icon: LucideIcon
  tone: string
}

const NOTIFICATIONS: NotificationItem[] = [
  { id: 'swap-new', type: 'swap', title: 'Yêu cầu đổi ca mới', message: 'Lê Hoàng đã gửi yêu cầu đổi ca Pharmaton T9 – 10/09/2026.', time: '2 phút trước', group: 'Hôm nay', unread: true, icon: Copy, tone: 'bg-amber-50 text-amber-600' },
  { id: 'shift-soon', type: 'shift', title: 'Ca làm sắp diễn ra', message: 'Ca Lactacyd D9 sẽ bắt đầu sau 30 phút tại Studio B.', time: '15 phút trước', group: 'Hôm nay', unread: true, icon: CalendarDays, tone: 'bg-blue-50 text-blue-600' },
  { id: 'swap-approved', type: 'approval', title: 'Yêu cầu của bạn đã được phê duyệt', message: 'Yêu cầu đổi ca ngày 08/09/2026 đã được phê duyệt.', time: '1 giờ trước', group: 'Hôm nay', unread: false, icon: CheckCheck, tone: 'bg-emerald-50 text-emerald-600' },
  { id: 'schedule-updated', type: 'schedule', title: 'Lịch làm việc được cập nhật', message: 'Ca BBC Midmonth đã được cập nhật thời gian.', time: '3 giờ trước', group: 'Hôm nay', unread: false, icon: CalendarDays, tone: 'bg-indigo-50 text-indigo-600' },
  { id: 'reminder', type: 'reminder', title: 'Nhắc nhở xác nhận tham gia', message: 'Vui lòng xác nhận tham gia ca Corbiere T9.', time: '5 giờ trước', group: 'Hôm nay', unread: true, icon: Bell, tone: 'bg-red-50 text-red-600' },
  { id: 'system', type: 'system', title: 'Thông báo từ hệ thống', message: 'Hệ thống sẽ bảo trì vào 22:00 ngày 12/09/2026.', time: '1 ngày trước', group: 'Hôm qua', unread: false, icon: Megaphone, tone: 'bg-violet-50 text-violet-600' },
]

const REALTIME_TOAST = {
  title: 'Yêu cầu đổi ca đã được phê duyệt',
  message: 'Lịch làm việc đã được cập nhật.',
  time: '2 phút trước',
  icon: CheckCheck,
} as const

const QA_STATES: { id: Exclude<NotificationPreview, 'none'>; label: string }[] = [
  { id: 'settings', label: 'Cài đặt thông báo' },
  { id: 'toast', label: 'Thông báo thời gian thực' },
  { id: 'history', label: 'Nhật ký thông báo' },
  { id: 'empty', label: 'Không có thông báo' },
]

export function NotificationsReferenceMock({ initialState = 'none' }: { initialState?: NotificationPreview }) {
  const [preview, setPreview] = useState<NotificationPreview>(initialState)
  const [qaOpen, setQaOpen] = useState(false)
  const [selectedId, setSelectedId] = useState('swap-new')
  const [allRead, setAllRead] = useState(false)
  const selected = NOTIFICATIONS.find((notification) => notification.id === selectedId) ?? NOTIFICATIONS[0]
  const openPreview = (next: Exclude<NotificationPreview, 'none'>) => { setPreview(next); setQaOpen(false) }

  return (
    <OpsWorkflowReferenceShell active="Notifications" searchPlaceholder="Tìm kiếm thông báo, ca làm việc, yêu cầu...">
      <main className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div><h1 className="text-[22px] font-bold tracking-tight text-slate-950">Thông báo</h1><p className="mt-1 text-[13px] text-slate-500">Theo dõi cập nhật vận hành và các mục cần xử lý</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setAllRead(true)} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-[12px] font-semibold text-blue-600"><CheckCheck className="h-4 w-4" />Đánh dấu tất cả đã đọc</button><button type="button" onClick={() => openPreview('settings')} aria-label="Cài đặt thông báo" className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600"><Settings className="h-4 w-4" /></button></div>
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-4">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center gap-5 border-b border-slate-200 px-4 text-[12px] font-semibold text-slate-500">{['Tất cả (12)', 'Chưa đọc (3)', 'Lịch làm việc (4)', 'Swaps (2)', 'Hệ thống (2)'].map((tab, index) => <button key={tab} type="button" className={`py-3 ${index === 0 ? 'border-b-2 border-blue-600 text-blue-600' : ''}`}>{tab}</button>)}<button type="button" aria-label="Bộ lọc" className="ml-auto text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5" /></button></div>
            {preview === 'empty' ? <EmptyState onBack={() => setPreview('none')} /> : <NotificationList selectedId={selectedId} allRead={allRead} onSelect={setSelectedId} />}
          </section>
          {preview === 'empty' ? <EmptyDetail /> : <NotificationDetail notification={selected} allRead={allRead} onRead={() => setAllRead(true)} />}
        </div>
      </main>

      {preview === 'none' && <QaController open={qaOpen} setOpen={setQaOpen} onSelect={openPreview} />}
      {(preview === 'settings' || preview === 'history') && <NotificationDialog state={preview} onClose={() => setPreview('none')} />}
      {preview === 'toast' && <ToastPreview onClose={() => setPreview('none')} />}
    </OpsWorkflowReferenceShell>
  )
}

function NotificationList({ selectedId, allRead, onSelect }: { selectedId: string; allRead: boolean; onSelect: (id: string) => void }) {
  return <div>{(['Hôm nay', 'Hôm qua'] as const).map((group) => <div key={group}><div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase text-slate-400">{group}</div>{NOTIFICATIONS.filter((item) => item.group === group).map((item) => { const Icon = item.icon; const unread = item.unread && !allRead; return <button key={item.id} type="button" onClick={() => onSelect(item.id)} className={`relative flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${selectedId === item.id ? 'bg-blue-50/60' : unread ? 'bg-slate-50/80' : 'bg-white'}`}>{unread && <span className="absolute left-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-blue-600" />}<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.tone}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className={`block text-[12px] text-slate-800 ${unread ? 'font-bold' : 'font-semibold'}`}>{item.title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{item.message}</span></span><span className="shrink-0 text-[10px] text-slate-400">{item.time}</span></button>})}</div>)}</div>
}

function NotificationDetail({ notification, allRead, onRead }: { notification: NotificationItem; allRead: boolean; onRead: () => void }) {
  const Icon = notification.icon
  return <aside className="rounded-lg border border-slate-200 bg-white"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-[14px] font-bold text-slate-900">Chi tiết thông báo</h2><p className="mt-0.5 text-[11px] text-slate-400">{notification.time}</p></div><button type="button" className="text-slate-400"><MoreHorizontal className="h-4 w-4" /></button></header><div className="p-5"><div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${notification.tone}`}><Icon className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="text-[14px] font-bold text-slate-900">{notification.title}</h3>{notification.unread && !allRead && <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">Cần phản hồi</span>}</div><p className="mt-2 text-[12px] leading-5 text-slate-600">Lê Hoàng đã gửi yêu cầu đổi ca cho bạn. Vui lòng kiểm tra thông tin và phản hồi trước 12:00 hôm nay.</p></div></div><div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4"><div className="flex items-start justify-between"><div><strong className="text-[13px] text-slate-800">Pharmaton T9</strong><div className="mt-2 flex items-center gap-4 text-[11px] text-slate-500"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />10/09/2026</span><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />14:00–17:00</span></div><div className="mt-1 text-[11px] text-slate-500">Studio A · Host</div></div><span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">Chờ phản hồi</span></div></div><div className="mt-4 grid grid-cols-[100px_1fr] gap-y-2 text-[11px]"><span className="text-slate-400">Người đề xuất</span><span className="font-semibold text-slate-700">Lê Hoàng · Camera</span><span className="text-slate-400">Lý do</span><span className="text-slate-700">Bận lịch học</span><span className="text-slate-400">Liên quan</span><span className="text-blue-600">Yêu cầu SWP-001</span></div><div className="mt-4 rounded-md bg-blue-50 p-3 text-[11px] leading-4 text-blue-700">“Mình bận lịch học buổi chiều, bạn hỗ trợ mình với nhé!”</div><div className="mt-5 flex items-center justify-between"><button type="button" onClick={onRead} className="flex items-center gap-2 text-[11px] font-semibold text-blue-600"><Check className="h-3.5 w-3.5" />Đánh dấu đã đọc</button><div className="flex gap-2"><button type="button" className="h-9 rounded-md border border-slate-200 px-4 text-[12px] font-semibold text-slate-600">Xem ca</button><button type="button" className="h-9 rounded-md bg-blue-600 px-4 text-[12px] font-semibold text-white">Xem yêu cầu</button></div></div></div></aside>
}

function QaController({ open, setOpen, onSelect }: { open: boolean; setOpen: (value: boolean) => void; onSelect: (state: Exclude<NotificationPreview, 'none'>) => void }) {
  return <div className="absolute bottom-5 right-5 z-30 flex flex-col items-end gap-2">{open && <div className="w-[190px] rounded-lg border border-slate-200 bg-white p-2 shadow-lg"><div className="mb-1 px-1 text-[11px] font-semibold uppercase text-slate-400">QA States</div>{QA_STATES.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item.id)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium text-slate-700 hover:bg-slate-50">{item.label}</button>)}</div>}<button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="h-8 rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-600 shadow-sm">QA States</button></div>
}

function NotificationDialog({ state, onClose }: { state: 'settings' | 'history'; onClose: () => void }) {
  const title = state === 'settings' ? 'Cài đặt thông báo' : 'Nhật ký thông báo'
  return <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35"><section role="dialog" aria-modal="true" aria-label={title} className={`${state === 'history' ? 'w-[820px]' : 'w-[700px]'} max-w-[calc(100vw-48px)] rounded-lg border border-slate-200 bg-white shadow-lg`}><header className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5"><div><h2 className="text-[14px] font-bold">{title}</h2><p className="mt-0.5 text-[11px] text-slate-400">{state === 'settings' ? 'Tùy chỉnh loại thông báo và kênh nhận' : 'Lịch sử gửi và trạng thái thông báo'}</p></div><button type="button" onClick={onClose} aria-label="Đóng hộp thoại" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="p-5">{state === 'settings' ? <SettingsState /> : <HistoryState />}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 px-5 text-[12px] font-semibold text-slate-600">Hủy</button><button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">{state === 'settings' ? 'Lưu cài đặt' : 'Xuất nhật ký'}</button></div></div></section></div>
}

function SettingsState() {
  const rows = [
    ['Ca làm việc', 'Nhắc nhở ca sắp diễn ra, thay đổi lịch', true, true, true],
    ['Yêu cầu đổi ca', 'Tạo, chấp nhận, phê duyệt', true, true, true],
    ['Phê duyệt / Từ chối', 'Kết quả phê duyệt yêu cầu', true, false, true],
    ['Thông báo hệ thống', 'Bảo trì, cập nhật hệ thống', false, true, false],
    ['Nhắc nhở chung', 'Các thông báo khác', true, false, false],
  ] as const
  return <div><div className="grid grid-cols-4 border-b border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-400"><span>Loại thông báo</span><span className="text-center">In-app</span><span className="text-center">Email</span><span className="text-center">Push</span></div>{rows.map(([name, note, inApp, email, push]) => <div key={name} className="grid grid-cols-4 items-center border-b border-slate-100 px-3 py-2.5"><span><strong className="block text-[11px] text-slate-700">{name}</strong><small className="text-[10px] text-slate-400">{note}</small></span><Toggle enabled={inApp} /><Toggle enabled={email} /><Toggle enabled={push} /></div>)}</div>
}

function HistoryState() {
  const rows = [
    ['10/09/2026 09:24', 'Nguyễn Trung Kiên', 'Yêu cầu đổi ca', 'In-app', 'Đã gửi'],
    ['10/09/2026 09:24', 'Nguyễn Trung Kiên', 'Yêu cầu đổi ca', 'Email', 'Đã gửi'],
    ['10/09/2026 09:24', 'Lê Hoàng', 'Yêu cầu đổi ca', 'Push', 'Đã gửi'],
    ['10/09/2026 08:15', 'Nguyễn Trung Kiên', 'Nhắc nhở ca', 'In-app', 'Đã đọc'],
    ['09/09/2026 14:32', 'Trần Minh Anh', 'Phê duyệt', 'Email', 'Đã gửi'],
    ['09/09/2026 14:32', 'Lê Hoàng', 'Phê duyệt', 'Push', 'Thất bại'],
  ] as const
  return <div><div className="mb-3 flex gap-2"><Filter label="Tất cả loại" /><Filter label="Tất cả trạng thái" /><Filter label="01/09/2026 – 10/09/2026" /></div><div className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.65fr] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-400"><span>Thời gian</span><span>Người nhận</span><span>Loại thông báo</span><span>Kênh</span><span>Trạng thái</span></div>{rows.map(([time, person, type, channel, status]) => <div key={`${time}-${person}-${channel}`} className="grid grid-cols-[1.1fr_1fr_1fr_0.7fr_0.65fr] border-b border-slate-100 px-3 py-2.5 text-[11px] text-slate-600"><span>{time}</span><span>{person}</span><span>{type}</span><span>{channel}</span><span className={`w-fit rounded px-2 py-1 text-[10px] font-semibold ${status === 'Thất bại' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{status}</span></div>)}</div>
}

function ToastPreview({ onClose }: { onClose: () => void }) {
  const Icon = REALTIME_TOAST.icon
  return <div data-preview="toast" className="absolute inset-0 z-40 bg-slate-950/10"><div role="status" className="absolute right-6 top-20 w-[370px] rounded-lg border border-slate-200 bg-white p-4 shadow-lg"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Icon className="h-5 w-5" /></span><div className="flex-1"><h3 className="text-[12px] font-bold">{REALTIME_TOAST.title}</h3><p className="mt-1 text-[11px] leading-4 text-slate-500">{REALTIME_TOAST.message}</p><span className="mt-1 block text-[10px] text-slate-400">{REALTIME_TOAST.time}</span></div><button type="button" onClick={onClose} aria-label="Đóng thông báo" className="text-slate-400"><X className="h-4 w-4" /></button></div></div></div>
}

function EmptyState({ onBack }: { onBack: () => void }) {
  return <div className="flex h-[440px] flex-col items-center justify-center text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-500"><Bell className="h-7 w-7" /></span><h2 className="mt-4 text-[14px] font-bold">Không có thông báo</h2><p className="mt-1 text-[12px] text-slate-500">Bạn đã xem hết các cập nhật trong bộ lọc này.</p><button type="button" onClick={onBack} className="mt-4 h-9 rounded-md bg-blue-600 px-5 text-[12px] font-semibold text-white">Quay về tất cả</button></div>
}

function EmptyDetail() {
  return <aside className="flex h-[300px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-center"><MessageSquare className="h-7 w-7 text-slate-300" /><p className="mt-3 text-[12px] text-slate-400">Chọn một thông báo để xem chi tiết</p></aside>
}

function Toggle({ enabled }: { enabled: boolean }) {
  return <span className={`mx-auto flex h-4 w-7 rounded-full p-0.5 ${enabled ? 'justify-end bg-blue-600' : 'justify-start bg-slate-300'}`}><span className="h-3 w-3 rounded-full bg-white" /></span>
}

function Filter({ label }: { label: string }) {
  return <button type="button" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-[11px] text-slate-600">{label}<ChevronDown className="h-3 w-3" /></button>
}
