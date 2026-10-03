import React from 'react';
import { 
  Search, Bell, ChevronDown, Calendar, Radio, Users, FileText, ArrowUp, 
  ArrowRight, FileCheck, ArrowLeftRight, UserMinus, CalendarX, 
  CheckCircle, Clock, AlertTriangle, Briefcase, Activity, Settings, 
  HelpCircle, UserCircle2, FolderCheck, Plus, ShieldAlert, Zap,
  TrendingUp, TrendingDown, Eye, MessageSquare, ShoppingCart,
  BarChart, Layers, Smartphone, LayoutDashboard, History
} from 'lucide-react';

export function AdminReferenceMock() {
  return (
    <div className="flex min-h-screen w-full bg-[#F8FAFC] font-sans text-slate-900">
      
      {/* LEFT SIDEBAR */}
      <aside className="w-[248px] bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="h-[56px] flex items-center px-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center text-white">
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-[14px] leading-tight">LiveStream Ops</span>
              <span className="text-[12px] text-slate-500 leading-tight">Admin Center</span>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-6 flex flex-col gap-6 overflow-y-auto">
          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">APP OPS</div>
            <a href="#" className="flex items-center gap-3 px-2.5 py-2 bg-indigo-50 text-indigo-700 rounded-md font-medium text-[14px]">
              <LayoutDashboard className="w-4 h-4 text-indigo-600" />
              Dashboard
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">OPERATIONS</div>
            <NavItem icon={<Calendar className="w-4 h-4" />} label="Calendar" />
            <NavItem icon={<Radio className="w-4 h-4" />} label="Live" />
            <NavItem icon={<Briefcase className="w-4 h-4" />} label="Shifts" />
            <NavItem icon={<Users className="w-4 h-4" />} label="Staffing" />
            <NavItem icon={<ArrowLeftRight className="w-4 h-4" />} label="Swaps" />
          </div>
          
          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">PERFORMANCE</div>
            <NavItem icon={<FileText className="w-4 h-4" />} label="Reports" />
            <NavItem icon={<BarChart className="w-4 h-4" />} label="Analytics" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">MANAGEMENT</div>
            <NavItem icon={<UserCircle2 className="w-4 h-4" />} label="Brands" />
            <NavItem icon={<Smartphone className="w-4 h-4" />} label="Platforms" />
            <NavItem icon={<Layers className="w-4 h-4" />} label="Campaigns" />
            <NavItem icon={<Users className="w-4 h-4" />} label="Staff" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 px-2">SYSTEM</div>
            <NavItem icon={<History className="w-4 h-4" />} label="Audit" />
            <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex flex-col gap-2">
          <div className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-md cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[12px] shrink-0">
              AD
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[13px] font-bold text-slate-900 truncate">Admin User</span>
              <span className="text-[12px] text-slate-500 truncate">System Administrator</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </div>
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
                placeholder="Tìm kiếm nhanh..." 
                className="w-full h-9 pl-9 pr-10 bg-slate-50 border border-slate-200 rounded-md text-[14px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                12
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200"></div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[13px]">
                AD
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-bold text-slate-900 leading-tight">Admin User</span>
                <span className="text-[13px] text-slate-500 leading-tight">Admin</span>
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
              <h1 className="text-[26px] font-bold tracking-tight text-slate-900 leading-tight">Tổng quan vận hành livestream</h1>
              <p className="text-[14px] text-slate-500 font-medium">Theo dõi toàn bộ hoạt động livestream trên mọi thương hiệu và nền tảng</p>
            </div>
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-md shadow-sm text-[14px] font-medium text-slate-700 hover:bg-slate-50">
                <Calendar className="w-4 h-4 text-slate-500" />
                Hôm nay (19/09/2026)
                <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
              </button>
              <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md shadow-sm text-[14px] font-bold transition-colors">
                <Plus className="w-4 h-4" />
                Tạo ca làm việc
              </button>
            </div>
          </div>

          {/* ROW 1: KPIs */}
          <div className="grid grid-cols-4 gap-5">
            <KpiCard 
              icon={<Radio className="w-5 h-5 text-red-600" />} iconBg="bg-red-50"
              title="ĐANG LIVE" value="12" subtitle="Phiên live hiện tại"
            />
            <KpiCard 
              icon={<Calendar className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-50"
              title="TỔNG CA HÔM NAY" value="48" subtitle="Trên toàn hệ thống"
            />
            <KpiCard 
              icon={<UserMinus className="w-5 h-5 text-amber-500" />} iconBg="bg-amber-50"
              title="THIẾU NHÂN SỰ" value="5" subtitle="Cần bổ sung"
            />
            <KpiCard 
              icon={<FileCheck className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-50"
              title="CHỜ DUYỆT" value="14" subtitle="Yêu cầu hệ thống"
            />
          </div>

          {/* ROW 2: NEEDS ATTENTION (8/12) & LIVE NOW (4/12) */}
          <div className="grid grid-cols-12 gap-6">
            
            {/* NEEDS ATTENTION */}
            <div className="col-span-8 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Needs Attention</h2>
                <a href="#" className="text-[14px] font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                  Xem tất cả cảnh báo <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-3 flex flex-col gap-1.5 flex-1 justify-center">
                <AttentionItem 
                  severity="critical"
                  title="Mất kết nối Livestream"
                  context="TikTok Shop • Pharmaton • Đã mất kết nối 3 phút"
                  time="Vừa xong"
                  action="Xử lý ngay"
                />
                <AttentionItem 
                  severity="high"
                  title="Thiếu Technical Support ca 14:00"
                  context="Shopee • Ostelin • Sắp bắt đầu"
                  time="10 phút trước"
                  action="Điều phối"
                />
                <AttentionItem 
                  severity="medium"
                  title="5 Yêu cầu đổi ca chờ duyệt"
                  context="Tuần tới • Lactacyd"
                  time="1 giờ trước"
                  action="Xem xét"
                />
                <AttentionItem 
                  severity="low"
                  title="Cảnh báo: Vi phạm từ khóa"
                  context="Shopee • Corbiere • Vừa phát hiện"
                  time="2 giờ trước"
                  action="Chi tiết"
                />
              </div>
            </div>

            {/* LIVE NOW */}
            <div className="col-span-4 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-slate-900">Live Now</h2>
                  <div className="px-2 py-0.5 bg-red-100 text-red-700 text-[12px] font-bold rounded-full animate-pulse border border-red-200">
                    12 ĐANG PHÁT
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-3 flex flex-col flex-1 gap-2 overflow-hidden justify-center">
                <LiveItem brand="Pharmaton" platform="TikTok" duration="01:45:00" viewers="2.4k" health="good" state="LIVE" />
                <LiveItem brand="Lactacyd" platform="Shopee" duration="00:30:12" viewers="1.1k" health="good" state="LIVE" />
                <LiveItem brand="Ostelin" platform="TikTok" duration="02:15:00" viewers="800" health="warning" state="LIVE" />
              </div>
            </div>

          </div>

          {/* ROW 3: TODAY'S OPERATIONS */}
          <div className="flex flex-col mt-2">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-[16px] font-bold text-slate-900">Today's Operations</h2>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Lọc dữ liệu..." 
                  className="px-3.5 py-2 border border-slate-200 rounded-md text-[14px] shadow-sm"
                />
                <button className="px-4 py-2 border border-slate-200 bg-white rounded-md text-[14px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors">
                  Lọc
                </button>
              </div>
            </div>
            <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Thương hiệu</th>
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Ca làm việc</th>
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Nền tảng</th>
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Trạng thái</th>
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Doanh thu / View</th>
                    <th className="px-5 py-3.5 text-[13px] font-semibold text-slate-500">Quản lý</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <OperationRow 
                    brand="Pharmaton" shift="08:00 - 10:00" platform="TikTok" 
                    status="Hoàn thành" statusColor="green" metrics="25M / 12k" manager="Trần A" 
                  />
                  <OperationRow 
                    brand="Lactacyd" shift="10:00 - 12:00" platform="Shopee" 
                    status="Đang Live" statusColor="red" metrics="18M / 5.2k" manager="Nguyễn B" 
                  />
                  <OperationRow 
                    brand="Ostelin" shift="14:00 - 16:00" platform="TikTok" 
                    status="Chuẩn bị" statusColor="orange" metrics="-" manager="Lê C" 
                  />
                  <OperationRow 
                    brand="Corbiere" shift="20:00 - 22:00" platform="Shopee" 
                    status="Chưa bắt đầu" statusColor="slate" metrics="-" manager="Phạm D" 
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* ROW 4: PERFORMANCE SNAPSHOT & SYSTEM ACTIVITY */}
          <div className="grid grid-cols-12 gap-6 mt-2 pb-4">
            
            {/* PERFORMANCE SNAPSHOT */}
            <div className="col-span-7 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Performance Snapshot</h2>
                <a href="#" className="text-[14px] font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                  Báo cáo chi tiết <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-6 flex flex-col gap-5 flex-1">
                <div className="grid grid-cols-3 gap-6 divide-x divide-slate-100">
                  <PerformanceMetric title="Doanh thu" value="128.5M" change="+12%" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />} />
                  <PerformanceMetric title="Lượt xem" value="45.2k" change="+8%" icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-500" />} classNameBase="pl-6" />
                  <PerformanceMetric title="Tỷ lệ chuyển đổi" value="3.2%" change="-1.1%" icon={<TrendingDown className="w-3.5 h-3.5 text-red-500" />} classNameBase="pl-6" />
                </div>
                
                {/* COMPACT TREND VISUALIZATION */}
                <div className="flex-1 w-full bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center relative overflow-hidden mt-2 h-[80px]">
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d="M0,100 L0,50 C20,60 40,30 60,70 C80,20 90,40 100,20 L100,100 Z" fill="#EEF2FF" />
                    <path d="M0,50 C20,60 40,30 60,70 C80,20 90,40 100,20" fill="none" stroke="#6366F1" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <div className="relative z-10 text-[13px] font-semibold text-slate-400 bg-white/70 px-2 py-0.5 rounded shadow-sm backdrop-blur-sm">Xu hướng trong ngày</div>
                </div>
              </div>
            </div>

            {/* RECENT SYSTEM ACTIVITY */}
            <div className="col-span-5 flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-[16px] font-bold text-slate-900">Recent System Activity</h2>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm flex flex-col flex-1 p-2">
                <div className="flex flex-col divide-y divide-slate-50 flex-1 justify-center">
                  <ActivityLog icon={<Settings className="w-4 h-4 text-slate-500" />} iconBg="bg-slate-100" title="Cập nhật hệ thống phân quyền" user="Admin User" time="15 phút trước" />
                  <ActivityLog icon={<Briefcase className="w-4 h-4 text-blue-500" />} iconBg="bg-blue-50" title="Tạo mới 12 ca làm việc (Tuần tới)" user="Quản lý A" time="1 giờ trước" />
                  <ActivityLog icon={<ShieldAlert className="w-4 h-4 text-amber-500" />} iconBg="bg-amber-50" title="Khóa tài khoản: Nguyễn Văn X" user="System" time="2 giờ trước" />
                  <ActivityLog icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} iconBg="bg-emerald-50" title="Duyệt 15 báo cáo hoàn thành ca" user="Admin User" time="3 giờ trước" />
                  <ActivityLog icon={<Users className="w-4 h-4 text-indigo-500" />} iconBg="bg-indigo-50" title="Đồng bộ nhân sự ca trực" user="System" time="4 giờ trước" />
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

function KpiCard({ icon, iconBg, title, value, subtitle }: any) {
  return (
    <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex flex-col justify-center">
      <div className="flex items-center gap-4 mb-3">
        <div className={`w-[48px] h-[48px] rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex flex-col justify-center">
          <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{title}</span>
          <span className="text-[32px] font-bold text-slate-900 leading-[1] tracking-tight">{value}</span>
        </div>
      </div>
      <span className="text-[14px] text-slate-500 font-medium">{subtitle}</span>
    </div>
  )
}

function AttentionItem({ severity, title, context, time, action }: any) {
  const severities: Record<string, { icon: any, color: string, bg: string, border: string }> = {
    critical: { icon: <ShieldAlert className="w-5 h-5 text-red-600" />, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    high: { icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    medium: { icon: <Clock className="w-5 h-5 text-amber-500" />, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    low: { icon: <CheckCircle className="w-5 h-5 text-blue-500" />, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
  }
  const s = severities[severity]
  
  return (
    <div className={`flex items-center justify-between px-4 py-3.5 rounded-lg border hover:border-slate-300 hover:bg-slate-50 transition-colors ${severity === 'critical' ? 'bg-red-50/30 border-red-100' : 'border-transparent'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 border ${s.bg} ${s.border}`}>
          {s.icon}
        </div>
        <div className="flex flex-col">
          <span className="text-[14px] font-bold text-slate-900 leading-snug mb-0.5">{title}</span>
          <span className="text-[14px] text-slate-600 leading-snug">{context}</span>
        </div>
      </div>
      <div className="flex items-center gap-5">
        <span className={`text-[13px] font-bold whitespace-nowrap ${severity === 'critical' ? 'text-red-500' : 'text-slate-500'}`}>{time}</span>
        <button className={`px-4 py-1.5 border hover:bg-slate-50 text-[13px] font-bold rounded-md shadow-sm shrink-0 transition-colors ${severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white border-slate-300 text-slate-700'}`}>
          {action}
        </button>
      </div>
    </div>
  )
}

function LiveItem({ brand, platform, duration, viewers, health, state }: any) {
  return (
    <div className="flex items-center justify-between p-3.5 border border-slate-200 rounded-lg bg-white shadow-sm hover:border-slate-300 hover:shadow-sm transition-all">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center text-slate-700 shadow-inner">
          <span className="font-bold text-[14px]">{brand.charAt(0)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-bold text-slate-900">{brand}</span>
            <span className="text-[13px] font-semibold text-slate-400 uppercase">{platform}</span>
          </div>
          <div className="flex items-center gap-3 text-[13px] font-semibold">
            <span className="text-red-600 flex items-center gap-1.5 bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span> {state} {duration}
            </span>
            <span className="text-slate-600 flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-slate-400" /> {viewers}</span>
          </div>
        </div>
      </div>
      <div className={`w-2.5 h-2.5 rounded-full shadow-sm ${health === 'good' ? 'bg-emerald-500 border border-emerald-600' : 'bg-amber-500 border border-amber-600'}`}></div>
    </div>
  )
}

function OperationRow({ brand, shift, platform, status, statusColor, metrics, manager }: any) {
  const pillClasses: Record<string, string> = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-amber-50 text-amber-700 border-amber-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200'
  }
  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-5 py-3.5 text-[14px] font-bold text-slate-900 whitespace-nowrap">{brand}</td>
      <td className="px-5 py-3.5 text-[14px] font-medium text-slate-700 whitespace-nowrap">{shift}</td>
      <td className="px-5 py-3.5 text-[14px] text-slate-600 whitespace-nowrap">{platform}</td>
      <td className="px-5 py-3.5 whitespace-nowrap">
        <span className={`inline-flex items-center px-2.5 py-0.5 text-[13px] font-bold rounded-md border ${pillClasses[statusColor]}`}>
          {statusColor === 'red' && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse mr-1.5"></span>}
          {status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-[14px] font-bold text-slate-900 whitespace-nowrap">{metrics}</td>
      <td className="px-5 py-3.5 text-[14px] font-medium text-slate-700">{manager}</td>
    </tr>
  )
}

function PerformanceMetric({ title, value, change, icon, classNameBase }: any) {
  return (
    <div className={`flex flex-col ${classNameBase || ''}`}>
      <span className="text-[14px] font-semibold text-slate-500 mb-1">{title}</span>
      <span className="text-[26px] font-bold text-slate-900 tracking-tight leading-none mb-2">{value}</span>
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-600">
        {icon}
        <span className={change.startsWith('+') ? 'text-emerald-600' : 'text-red-500'}>{change}</span>
        <span className="font-medium text-slate-400">vs hqua</span>
      </div>
    </div>
  )
}

function ActivityLog({ icon, iconBg, title, user, time }: any) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors rounded-lg">
      <div className="flex items-start gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border border-slate-100 ${iconBg} mt-0.5 shadow-sm`}>
          {icon}
        </div>
        <div className="flex flex-col justify-center gap-0.5">
          <span className="text-[14px] font-bold text-slate-900 leading-tight">{title}</span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-indigo-600">{user}</span>
            <span className="text-[13px] text-slate-300">•</span>
            <span className="text-[13px] text-slate-500 font-medium">{time}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

