import React from 'react';
import { 
  Search, Bell, ChevronDown, Calendar, Radio, Users, FileText, ArrowUp, 
  ArrowRight, FileCheck, ArrowLeftRight, UserMinus, CalendarX, 
  CheckCircle, Clock, AlertTriangle, Briefcase, Activity, Settings, 
  HelpCircle, UserCircle2, ArrowUpRight, FolderCheck, Check
} from 'lucide-react';

export function LeaderReferenceMock() {
  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans text-slate-900">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-[248px] bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="h-[56px] flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white">
              <BarChartIcon />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[14px] leading-tight">LiveStream Ops</span>
              <span className="text-[12px] text-slate-500 leading-tight">Operations Management</span>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">APP OPS</div>
            <a href="#" className="flex items-center gap-2.5 px-2.5 py-2 bg-blue-50 text-blue-700 rounded-md font-medium text-[14px]">
              <HomeIcon className="w-4 h-4 text-blue-600" />
              Team Operations
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">OPERATIONS</div>
            <NavItem icon={<Calendar className="w-4 h-4" />} label="Lịch" />
            <NavItem icon={<Radio className="w-4 h-4" />} label="Trực tiếp" />
            <NavItem icon={<Briefcase className="w-4 h-4" />} label="Ca làm việc" />
            <NavItem icon={<Users className="w-4 h-4" />} label="Nhân sự ca" />
            <NavItem icon={<ArrowLeftRight className="w-4 h-4" />} label="Đổi ca" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">PERFORMANCE</div>
            <NavItem icon={<FileText className="w-4 h-4" />} label="Báo cáo" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">TEAM</div>
            <NavItem icon={<UserCircle2 className="w-4 h-4" />} label="Danh sách nhân sự" />
            <NavItem icon={<Bell className="w-4 h-4" />} label="Thông báo" />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex flex-col gap-2">
          <div className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-md cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[12px] shrink-0">
              NTK
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] font-bold text-slate-900 truncate">Nguyễn Trung Kiên</span>
              <span className="text-[12px] text-slate-500 truncate">Leader - Livestream Team</span>
            </div>
            <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
          <a href="#" className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-slate-500 font-medium hover:text-slate-900">
            <HelpCircle className="w-3.5 h-3.5" /> Help & Support
          </a>
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* TOPBAR */}
        <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center w-[400px]">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Tìm kiếm ca, thành viên, thương hiệu..." 
                className="w-full h-9 pl-9 pr-10 bg-slate-50 border border-slate-200 rounded-md text-[14px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 text-[12px] bg-white border border-slate-200 rounded text-slate-500 font-sans shadow-sm">⌘</kbd>
                <kbd className="px-1.5 py-0.5 text-[12px] bg-white border border-slate-200 rounded text-slate-500 font-sans shadow-sm">K</kbd>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative cursor-pointer">
              <Bell className="w-4 h-4 text-slate-600" />
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[12px] font-bold flex items-center justify-center rounded-full border border-white">
                5
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[13px]">
                NTK
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-slate-900 leading-tight">Nguyễn Trung Kiên</span>
                <span className="text-[13px] text-slate-500 leading-tight">Leader</span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="p-8 flex flex-col gap-6 overflow-y-auto">
          
          {/* PAGE HEADER */}
          <div className="flex justify-between items-start mb-1">
            <div className="flex flex-col gap-1">
              <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">Team / Operations</h1>
              <p className="text-[14px] text-slate-500 font-medium">Today • Livestream Team</p>
              <p className="text-[14px] text-slate-500 mt-1">Theo dõi và điều phối hoạt động livestream của đội nhóm</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-md shadow-sm text-[14px] font-medium text-slate-700 hover:bg-slate-50">
                <Calendar className="w-4 h-4 text-slate-500" />
                Hôm nay (19/09/2026)
                <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm text-[14px] font-medium transition-colors">
                <FolderCheck className="w-4 h-4" />
                Review Attention
              </button>
            </div>
          </div>

          {/* ROW 1: KPIs */}
          <div className="grid grid-cols-4 gap-5">
            <KpiCard 
              icon={<Calendar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-50"
              title="TEAM SHIFTS" value="8" subtitle="Today" 
              trend="+2 so với hôm qua" trendUp={true} 
            />
            <KpiCard 
              icon={<Radio className="w-5 h-5 text-red-600" />} iconBg="bg-red-50"
              title="LIVE" value="2" subtitle="Active now" 
              trend="+1 so với hôm qua" trendUp={true} 
            />
            <KpiCard 
              icon={<Users className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-50"
              title="MISSING STAFF" value="2" subtitle="Resolve today" 
              trend="+1 so với hôm qua" trendUp={false} 
            />
            <KpiCard 
              icon={<FileText className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50"
              title="PENDING" value="4" subtitle="Need review" 
              trend="+2 so với hôm qua" trendUp={true} 
            />
          </div>

          {/* ROW 2: SCHEDULE & DECISION */}
          <div className="grid grid-cols-12 gap-6">
            
            {/* SCHEDULE */}
            <div className="col-span-7 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Today's Team Schedule</h2>
                <a href="#" className="text-[14px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm overflow-hidden flex-1 flex flex-col">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Thời gian</th>
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Thương hiệu</th>
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Nền tảng</th>
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Trạng thái</th>
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Ghi chú</th>
                      <th className="px-5 py-3 text-[13px] font-semibold text-slate-500">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 flex-1">
                    <ScheduleRow time="09:00 - 11:00" brand="Ostelin" platform="TikTok" status="Hoàn thành" statusColor="green" note={<>Host: <span className="font-semibold text-slate-900">Minh Anh</span></>} />
                    <ScheduleRow time="11:00 - 13:00" brand="Lactacyd" platform="Shopee" status="Đang live" statusColor="red" note={<>Host: <span className="font-semibold text-slate-900">Hoàng</span></>} />
                    <ScheduleRow time="14:00 - 17:00" brand="Corbiere" platform="TikTok" status="Chuẩn bị" statusColor="orange" note={<span className="text-amber-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/> Support 1/2</span>} />
                    <ScheduleRow time="20:00 - 23:00" brand="Pharmaton" platform="TikTok" status="Đã lên lịch" statusColor="blue" note={<>Host: <span className="font-semibold text-slate-900">Nhật Linh</span></>} />
                  </tbody>
                </table>
              </div>
            </div>

            {/* DECISION */}
            <div className="col-span-5 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-slate-900">Needs Your Decision</h2>
                  <div className="w-5 h-5 bg-red-500 text-white text-[13px] font-bold flex items-center justify-center rounded-full">4</div>
                </div>
                <a href="#" className="text-[14px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-2 flex flex-col gap-1 flex-1 justify-center">
                <DecisionItem icon={<FileCheck className="w-4 h-4 text-amber-500" />} iconBg="bg-amber-50" title="2 Registration Approvals" subtitle="Từ thành viên mới" time="15 phút nữa" action="Review &rarr;" />
                <DecisionItem icon={<ArrowLeftRight className="w-4 h-4 text-purple-500" />} iconBg="bg-purple-50" title="1 Swap Request" subtitle="Pharmaton • 25/09" time="1 giờ nữa" action="Review &rarr;" />
                <DecisionItem icon={<UserMinus className="w-4 h-4 text-red-500" />} iconBg="bg-red-50" title="1 Staffing Gap" subtitle="Ca 20:00 • Technical" time="2 giờ nữa" action="Assign &rarr;" />
                <DecisionItem icon={<CalendarX className="w-4 h-4 text-blue-500" />} iconBg="bg-blue-50" title="1 Schedule Conflict" subtitle="Lactacyd • 22/09" time="3 giờ nữa" action="Review &rarr;" />
              </div>
            </div>
          </div>

          {/* ROW 3: STAFFING HEALTH */}
          <div className="flex flex-col mt-2">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[16px] font-bold text-slate-900">Staffing Health</h2>
              <a href="#" className="text-[14px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                Xem chi tiết <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-6 grid grid-cols-3 divide-x divide-slate-100">
              {/* Host */}
              <div className="flex flex-col px-6 first:pl-0 last:pr-0">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 shrink-0">
                    <UserCircle2 className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-slate-900">Host</span>
                    <span className="text-[18px] font-bold text-blue-600 tracking-tight">8 / 8</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{width: '100%'}}></div>
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 min-w-[32px] text-right">100%</span>
                </div>
              </div>

              {/* Support */}
              <div className="flex flex-col px-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-50 rounded-full flex items-center justify-center text-purple-500 shrink-0">
                      <Users className="w-6 h-6" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[15px] font-bold text-slate-900">Support</span>
                      <span className="text-[18px] font-bold text-purple-600 tracking-tight">12 / 14</span>
                    </div>
                  </div>
                  <div className="bg-amber-100 text-amber-700 text-[13px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-sm border border-amber-200/50">
                    <AlertTriangle className="w-3.5 h-3.5" /> Thiếu 2
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{width: '86%'}}></div>
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 min-w-[32px] text-right">86%</span>
                </div>
              </div>

              {/* Technical */}
              <div className="flex flex-col px-6 pr-0">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 shrink-0">
                    <Settings className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-slate-900">Technical</span>
                    <span className="text-[18px] font-bold text-emerald-600 tracking-tight">8 / 8</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{width: '100%'}}></div>
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 min-w-[32px] text-right">100%</span>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 4: UPCOMING & ACTIVITY */}
          <div className="grid grid-cols-12 gap-6 pb-6 mt-2">
            
            {/* UPCOMING */}
            <div className="col-span-7 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Upcoming Live</h2>
                <a href="#" className="text-[14px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex gap-6 flex-1 items-center">
                <div className="w-[110px] h-[110px] rounded-[10px] bg-[#FF6B00] flex-shrink-0 flex flex-col items-center justify-center text-white p-3 text-center border border-[#E66000]">
                  <span className="font-bold text-[15px] mb-1.5 leading-tight tracking-wide">Pharmaton</span>
                  <span className="text-[12px] font-bold uppercase tracking-widest opacity-90">Mega Sale</span>
                </div>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[17px] font-bold text-slate-900">Pharmaton • TikTok</h3>
                    <div className="bg-blue-50 text-blue-700 text-[13px] font-bold px-2.5 py-1 rounded-md border border-blue-100">
                      Sắp diễn ra
                    </div>
                  </div>
                  <p className="text-[14px] text-slate-600 mb-4 font-medium">Bắt đầu lúc 20:00 (còn 4 giờ)</p>
                  
                  <div className="flex items-center text-[14px] text-slate-600 mb-4">
                    Host: <span className="font-bold text-slate-900 ml-1 mr-3">A</span> <span className="text-slate-200">|</span>
                    <span className="ml-3">Support:</span> <span className="font-bold text-slate-900 ml-1 mr-3">B, C</span> <span className="text-slate-200">|</span>
                    <span className="ml-3">Technical:</span> <span className="font-bold text-slate-900 ml-1">D</span>
                  </div>

                  <div>
                    <button className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[14px] font-bold rounded-md shadow-sm transition-colors">
                      View Shift &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTIVITY */}
            <div className="col-span-5 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Team Activity</h2>
                <a href="#" className="text-[14px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                  Xem tất cả <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-1">
                <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
                  <ActivityItem icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} iconBg="bg-emerald-50" title="Member accepted swap" subtitle="Trần B" time="12 phút trước" />
                  <ActivityItem icon={<CheckCircle className="w-4 h-4 text-blue-500" />} iconBg="bg-blue-50" title="Registration approved" subtitle="Nguyễn A" time="28 phút trước" />
                  <ActivityItem icon={<UserCircle2 className="w-4 h-4 text-purple-500" />} iconBg="bg-purple-50" title="Staff assigned to shift" subtitle="Corbiere • 22/09" time="1 giờ trước" />
                  <ActivityItem icon={<Calendar className="w-4 h-4 text-blue-500" />} iconBg="bg-blue-50" title="Schedule updated" subtitle="Lactacyd • 19/09" time="2 giờ trước" />
                </div>
              </div>
            </div>

          </div>

        </main>
      </div>
    </div>
  );
}

// Subcomponents
function NavItem({ icon, label }: { icon: React.ReactNode, label: string }) {
  return (
    <a href="#" className="flex items-center gap-3 px-2.5 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md font-medium text-[14px] transition-colors">
      <div className="text-slate-400">{icon}</div>
      {label}
    </a>
  )
}

function KpiCard({ icon, iconBg, title, value, subtitle, trend, trendUp }: any) {
  return (
    <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex flex-col justify-center">
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-[48px] h-[48px] rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[30px] font-bold text-slate-900 leading-[1] tracking-tight">{value}</span>
            <span className="text-[14px] text-slate-500 font-medium">{subtitle}</span>
          </div>
        </div>
      </div>
      <div className={`flex items-center gap-1.5 text-[13px] font-bold ${trendUp ? 'text-emerald-600' : 'text-red-500'}`}>
        <ArrowUp className={`w-3.5 h-3.5 ${!trendUp && 'rotate-180'}`} strokeWidth={3} />
        {trend}
      </div>
    </div>
  )
}

function ScheduleRow({ time, brand, platform, status, statusColor, note }: any) {
  const pillClasses: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200'
  }
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3 text-[14px] font-medium text-slate-900 whitespace-nowrap">{time}</td>
      <td className="px-5 py-3 text-[14px] text-slate-600 whitespace-nowrap">{brand}</td>
      <td className="px-5 py-3 text-[14px] text-slate-600 whitespace-nowrap">{platform}</td>
      <td className="px-5 py-3 whitespace-nowrap">
        <span className={`inline-block px-2.5 py-0.5 text-[13px] font-bold rounded-md border ${pillClasses[statusColor]}`}>
          {status}
        </span>
      </td>
      <td className="px-5 py-3 text-[14px] text-slate-600">{note}</td>
      <td className="px-5 py-3 text-[14px] whitespace-nowrap">
        <a href="#" className="font-semibold text-blue-600 hover:underline">Xem chi tiết</a>
      </td>
    </tr>
  )
}

function DecisionItem({ icon, iconBg, title, subtitle, time, action }: any) {
  return (
    <div className="flex items-center justify-between px-3 py-3 rounded-lg border border-transparent hover:border-slate-200 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-slate-900 leading-snug">{title}</span>
          <span className="text-[13px] text-slate-500 leading-snug mt-0.5">{subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-[13px] font-medium text-red-500 whitespace-nowrap">{time}</span>
        <button className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold rounded-md shadow-sm shrink-0 transition-colors">
          {action}
        </button>
      </div>
    </div>
  )
}

function ActivityItem({ icon, iconBg, title, subtitle, time }: any) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
      <div className="flex items-center gap-3.5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-slate-900">{title}</span>
          <span className="text-[14px] text-slate-600">{subtitle}</span>
        </div>
      </div>
      <span className="text-[13px] font-medium text-slate-500 shrink-0">{time}</span>
    </div>
  )
}

// Custom simple icons
function BarChartIcon(props: any) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="20" x2="18" y2="10"></line>
      <line x1="12" y1="20" x2="12" y2="4"></line>
      <line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
  )
}
function HomeIcon(props: any) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
      <polyline points="9 22 9 12 15 12 15 22"></polyline>
    </svg>
  )
}
function ChevronRightIcon(props: any) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  )
}

