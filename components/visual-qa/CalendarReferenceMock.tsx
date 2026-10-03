import { Button } from '@/components/ui/button'
import { 
  Search, Bell, ChevronLeft, ChevronRight, Plus, 
  Calendar as CalendarIcon, CheckCircle2,
  Clock, LayoutGrid, Users, X, MapPin, MonitorPlay,
  Tag, AlignLeft, Paperclip,
  Briefcase, ArrowLeftRight, CheckSquare, BarChart2, MessageSquare, Menu
} from 'lucide-react'
import React from 'react'

export interface CalendarEventFixture {
  id: number;
  dayIndex: number;
  startHour: number;
  endHour: number;
  title: string;
  time: string;
  location?: string;
  color: 'blue' | 'green' | 'red' | 'purple' | 'orange';
  avatars?: string[];
  tag?: string;
  isSelected?: boolean;
}

const HOURS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
  '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
]

const DAYS = [
  { name: 'Thứ Hai', date: '07/09' },
  { name: 'Thứ Ba', date: '08/09' },
  { name: 'Thứ Tư', date: '09/09' },
  { name: 'Thứ Năm', date: '10/09' },
  { name: 'Thứ Sáu', date: '11/09' },
  { name: 'Thứ Bảy', date: '12/09' },
  { name: 'Chủ Nhật', date: '13/09' },
]

const EVENTS: CalendarEventFixture[] = [
  {
    id: 1, dayIndex: 0, startHour: 10, endHour: 12,
    title: 'Pharmaton', time: '10:00 - 12:00', location: 'Studio A',
    color: 'blue', avatars: ['MK', 'TK'], tag: '+2'
  },
  {
    id: 2, dayIndex: 2, startHour: 9, endHour: 11,
    title: 'Lactacyd', time: '09:00 - 11:00', location: 'Studio B',
    color: 'green', tag: '+1'
  },
  {
    id: 3, dayIndex: 2, startHour: 13, endHour: 14,
    title: 'Team Meeting', time: '13:00 - 14:00', location: 'Online',
    color: 'red'
  },
  {
    id: 4, dayIndex: 3, startHour: 14, endHour: 17,
    title: 'Ostelin', time: '14:00 - 17:00', location: 'Studio C',
    color: 'blue', avatars: ['M', 'K'], tag: '+2', isSelected: true
  },
  {
    id: 5, dayIndex: 2, startHour: 20, endHour: 23,
    title: 'Baby Comfort', time: '20:00 - 23:00', location: 'Studio A',
    color: 'purple', avatars: ['HL', 'PT'], tag: '+3'
  },
  {
    id: 6, dayIndex: 5, startHour: 10, endHour: 12,
    title: 'Corbiere', time: '10:00 - 12:00', location: 'Studio A',
    color: 'orange', avatars: ['HM', 'QY'], tag: '+1'
  },
  {
    id: 7, dayIndex: 6, startHour: 19, endHour: 22,
    title: 'Pharmaton', time: '19:00 - 22:00', location: 'Studio B',
    color: 'blue', avatars: ['MK', 'TK'], tag: '+2'
  }
]

export function CalendarReferenceMock() {
  return (
    <div lang="vi" translate="no" className="notranslate flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-900">
      
      {/* SIDEBAR (248px) */}
      <aside className="w-[248px] bg-[#082743] text-white flex flex-col flex-shrink-0 z-20">
        <div className="h-[56px] flex items-center px-4 font-bold text-lg tracking-tight border-b border-white/10">
          <div className="w-6 h-6 bg-blue-600 rounded mr-2 flex items-center justify-center">
            <div className="w-2 h-3 bg-white rounded-sm"></div>
          </div>
          LiveStream Ops
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 mt-2">
          <NavItem icon={<LayoutGrid size={18} />} label="My Workspace" />
          <NavItem icon={<Briefcase size={18} />} label="My Schedule" />
          <NavItem icon={<CalendarIcon size={18} />} label="Calendar" active />
          <NavItem icon={<Clock size={18} />} label="Shifts" />
          <NavItem icon={<Users size={18} />} label="Staffing" />
          <NavItem icon={<ArrowLeftRight size={18} />} label="My Swaps" />
          <NavItem icon={<CheckSquare size={18} />} label="Approvals" />
          <NavItem icon={<MonitorPlay size={18} />} label="Live" />
          <NavItem icon={<BarChart2 size={18} />} label="Reports" />
          <NavItem icon={<Bell size={18} />} label="Notifications" />
        </div>
        
        <div className="p-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
            <span className="w-full h-full flex items-center justify-center text-[12px] font-bold text-slate-700 bg-slate-200">NK</span>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-[14px] font-medium truncate">Nguyễn Trung Kiên</span>
            <span className="text-[13px] text-slate-400 truncate">Member</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
        
        {/* TOPBAR (56px) */}
        <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer lg:hidden">
              <Menu size={14} />
            </div>
            <div className="relative w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Tìm kiếm ca, brand, host, studio..." 
                className="w-full pl-9 pr-4 py-1.5 bg-slate-100 border border-transparent rounded-md text-[14px] focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-slate-500 hover:text-slate-700">
              <Bell className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <div className="w-px h-4 bg-slate-200"></div>
            <div className="flex items-center gap-2 cursor-pointer group">
              <div className="text-right hidden sm:block">
                <div className="text-[13px] font-bold text-slate-700 leading-tight group-hover:text-blue-600">Nguyễn Trung Kiên</div>
                <div className="text-[12px] text-slate-500 leading-tight">Member</div>
              </div>
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center text-[12px] font-bold">NK</div>
            </div>
          </div>
        </header>

        {/* WORKSPACE & RIGHT PANEL CONTAINER */}
        <div className="flex-1 flex p-6 gap-5 overflow-hidden">
          
          {/* CALENDAR WORKSPACE CARD */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col min-w-0 overflow-hidden">
            
            {/* Header Area */}
            <div className="px-5 py-4 flex-shrink-0 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h1 className="text-[18px] font-bold text-slate-900 leading-tight">Calendar</h1>
              </div>
              <div className="flex items-center gap-3">
                 {/* Toggles */}
                 <div className="flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200">
                   <button className="px-3 py-1.5 text-[13px] font-medium text-slate-600 rounded hover:bg-slate-200 transition-colors">Tháng</button>
                   <button className="px-3 py-1.5 text-[13px] font-bold text-blue-700 bg-white rounded shadow-sm">Tuần</button>
                   <button className="px-3 py-1.5 text-[13px] font-medium text-slate-600 rounded hover:bg-slate-200 transition-colors">Ngày</button>
                 </div>
                 {/* Nav */}
                 <div className="flex items-center gap-1">
                   <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors">
                     <ChevronLeft className="w-4 h-4" />
                   </button>
                   <span className="text-[14px] font-bold text-slate-800 w-[110px] text-center">Tháng 9, 2026</span>
                   <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors">
                     <ChevronRight className="w-4 h-4" />
                   </button>
                 </div>
                 <button className="px-3 py-1.5 text-[13px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 shadow-sm transition-colors">
                   Hôm nay
                 </button>
                 <div className="w-px h-4 bg-slate-200 mx-1"></div>
                 <Button className="bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md px-3 h-8 flex items-center gap-1.5 text-[13px] shadow-sm">
                   <Plus className="w-3.5 h-3.5" /> Tạo ca
                 </Button>
              </div>
            </div>

            {/* Filters Row */}
            <div className="px-5 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 flex-shrink-0">
              <FilterDropdown label="Tất cả brand" />
              <FilterDropdown label="Tất cả platform" />
              <FilterDropdown label="Tất cả địa điểm" />
              <FilterDropdown label="Tất cả trạng thái" />
            </div>

            {/* CALENDAR GRID */}
            <div className="flex-1 overflow-auto flex flex-col relative bg-white">
              
              {/* Grid Header (Days) */}
              <div className="flex sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
                <div className="w-[56px] flex-shrink-0 border-r border-slate-200 bg-slate-50"></div>
                <div className="flex-1 grid grid-cols-7">
                  {DAYS.map((day, i) => (
                    <div key={i} className="py-2.5 flex flex-col items-center justify-center border-r border-slate-200 bg-white">
                      <span className={`text-[13px] font-bold uppercase tracking-wider ${i === 3 ? 'text-blue-600' : 'text-slate-400'}`}>{day.name}</span>
                      <span className={`text-[18px] mt-0.5 font-medium ${i === 3 ? 'w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center' : 'text-slate-800'}`}>
                        {day.date.split('/')[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid Body */}
              <div className="flex flex-1 relative" style={{ minHeight: `${HOURS.length * 36}px` }}>
                {/* Time column */}
                <div className="w-[56px] flex-shrink-0 border-r border-slate-200 bg-slate-50 z-10">
                  {HOURS.map((hour, i) => (
                    <div key={i} className="h-[36px] relative border-b border-slate-100/50">
                      <span className="absolute -top-2.5 right-2 text-[12px] font-medium text-slate-400 bg-slate-50 px-1">{hour}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns wrapper */}
                <div className="flex-1 grid grid-cols-7 relative">
                  {/* Horizontal grid lines */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col">
                    {HOURS.map((_, i) => (
                      <div key={i} className="h-[36px] border-b border-slate-100 w-full"></div>
                    ))}
                  </div>

                  {/* Vertical day columns */}
                  {DAYS.map((day, i) => (
                    <div key={i} className={`relative border-r border-slate-200 ${i === 3 ? 'bg-blue-50/20' : ''}`}>
                      {EVENTS.filter(e => e.dayIndex === i).map(event => (
                        <EventCard key={event.id} event={event} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* DETAIL PANEL CARD */}
          <div className="w-[320px] bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col flex-shrink-0 h-fit max-h-full overflow-hidden relative pb-14">
            
            {/* Header */}
            <div className="h-[52px] flex items-center justify-between px-4 border-b border-slate-100 flex-shrink-0 bg-white">
              <h2 className="text-[14px] font-bold text-slate-800">Chi tiết ca làm việc</h2>
              <button className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"><X size={16} /></button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              {/* Identity */}
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded border border-blue-100 flex flex-col items-center justify-center shrink-0">
                   <span className="text-[11px] font-bold text-blue-700 leading-none">OSTELIN</span>
                   <span className="text-[5px] font-medium text-blue-500 mt-0.5 uppercase tracking-wider">Calcium</span>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-slate-900 leading-tight mb-1.5">Ostelin - TikTok Live</h3>
                  <span className="text-[12px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">Đã lên lịch</span>
                </div>
              </div>

              {/* Info List */}
              <div className="space-y-2.5">
                <DetailRow icon={<Clock size={14}/>} label="Thời gian" value={
                  <>Thứ Năm, 10/09/2026<br/><span className="font-mono">14:00 - 17:00</span> <span className="text-slate-500 font-normal">(3 giờ)</span></>
                } />
                <DetailRow icon={<MapPin size={14}/>} label="Địa điểm" value="Studio C - Quận 7, HCM" />
                <DetailRow icon={<MonitorPlay size={14}/>} label="Platform" value="TikTok Shop" />
                <DetailRow icon={<Tag size={14}/>} label="Brand" value="Ostelin" />
                
                <DetailRow icon={<Users size={14}/>} label="Nhân sự" value={
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-900">Min <span className="text-slate-500 font-normal">(Host)</span></span>
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-900">Kiên <span className="text-slate-500 font-normal">(Support)</span></span>
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    </div>
                  </div>
                } />

                <DetailRow icon={<AlignLeft size={14}/>} label="Mô tả" value={
                  <span className="text-slate-700 leading-relaxed block mt-0.5">Livestream giới thiệu Ostelin Calcium + D3<br/>Chiến dịch 9.9</span>
                } />

                <DetailRow icon={<Paperclip size={14}/>} label="Đính kèm" value={
                  <div className="space-y-2 mt-0.5">
                    <a href="#" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                      <Paperclip size={12} /> <span className="truncate">Brief_Ostelin_9.9.pdf</span>
                    </a>
                    <a href="#" className="flex items-center gap-1.5 text-blue-600 hover:underline">
                      <Paperclip size={12} /> <span className="truncate">Shotlist_v1.xlsx</span>
                    </a>
                  </div>
                } />
              </div>
            </div>

            {/* Footer actions pinned to bottom of card */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-slate-50/80 backdrop-blur-sm border-t border-slate-200 flex gap-2">
              <Button variant="outline" className="flex-1 bg-white h-8 text-[13px] font-medium text-blue-600 border-blue-200 hover:bg-blue-50 transition-colors">Chỉnh sửa</Button>
              <Button variant="outline" className="flex-1 bg-white h-9 text-[13px] font-medium text-slate-700 border-slate-200 hover:bg-slate-50 transition-colors">Nhân bản</Button>
            </div>
            
          </div>

        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a 
      href="#" 
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-[14px] font-medium transition-colors ${
        active 
          ? 'bg-blue-600 text-white shadow-sm' 
          : 'text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {icon}
      {label}
    </a>
  )
}

function FilterDropdown({ label }: { label: string }) {
  return (
    <button className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded text-[13px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm transition-colors">
      <span>{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-slate-400 rotate-90" />
    </button>
  )
}

function EventCard({ event }: { event: CalendarEventFixture }) {
  // Base start hour is 8:00 (index 0)
  // Height per hour is 36px
  const topOffset = (event.startHour - 8) * 36
  const height = (event.endHour - event.startHour) * 36
  const duration = event.endHour - event.startHour
  const isCompact = duration <= 1

  const colorStyles = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    red: 'bg-rose-50 border-rose-200 text-rose-800',
    purple: 'bg-purple-50 border-purple-200 text-purple-800',
    orange: 'bg-amber-50 border-amber-200 text-amber-800',
  }
  const bgStyle = colorStyles[event.color]
  
  const selectedStyle = event.isSelected 
    ? 'border-l-[3px] border-blue-500 border-y border-r border-y-blue-300 border-r-blue-300 shadow-sm ring-1 ring-blue-500/10 z-10' 
    : 'border-l-[3px] border-y border-r border-slate-200 hover:border-slate-300 hover:shadow-sm'

  return (
    <div 
      className={`absolute left-1 right-1 rounded overflow-hidden flex ${isCompact ? 'flex-row items-center gap-1.5 px-1.5 py-0' : 'flex-col px-2 py-1.5'} ${bgStyle} ${selectedStyle} transition-all cursor-pointer`}
      style={{ top: `${topOffset + 1}px`, height: `${height - 2}px` }}
    >
      {isCompact ? (
        <>
          <span className="text-[13px] font-bold leading-none truncate shrink-0">{event.title}</span>
          <span className="text-[12px] font-semibold opacity-80 leading-none truncate min-w-0">{event.time}</span>
        </>
      ) : (
        <>
          <span className="text-[13px] font-bold leading-tight truncate">{event.title}</span>
          <span className="text-[12px] font-semibold opacity-80 mt-0.5 truncate">{event.time}</span>
          
          {event.location && (
            <span className="text-[12px] font-medium opacity-70 truncate mt-0.5">{event.location}</span>
          )}
          
          <div className="mt-auto flex items-center justify-between">
            <div className="flex -space-x-1">
              {event.avatars && event.avatars.map((av: string, idx: number) => (
                <div key={idx} className="w-4 h-4 rounded-full border border-white bg-slate-200 overflow-hidden shadow-sm">
                  <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-700 bg-white">{av}</span>
                </div>
              ))}
            </div>
            {event.tag && (
              <span className="text-[12px] font-bold bg-white/70 px-1 py-0.5 rounded opacity-90 border border-white">
                {event.tag}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode, label: string, value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 pt-2.5 border-t border-slate-100 first:border-0 first:pt-0">
      <div className="w-20 flex items-center gap-1.5 text-[13px] font-medium text-slate-500 shrink-0 mt-[1px]">
        <span className="text-slate-400">{icon}</span> {label}
      </div>
      <div className="text-[13px] font-medium text-slate-900 flex-1 min-w-0">
        {value}
      </div>
    </div>
  )
}
