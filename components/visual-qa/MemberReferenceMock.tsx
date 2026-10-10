import React from 'react';
import { LayoutGrid, Calendar, Users, ClipboardCheck, Video, Settings, History, HelpCircle, Bell, Search, Clock, MapPin, CheckCircle, PlayCircle, ArrowRight, FileEdit, AlertCircle, ListTodo, Menu } from 'lucide-react';

export function MemberReferenceMock() {
  return (
    <div className="w-full h-full bg-[#FAFAFA] flex overflow-hidden font-sans">

      {/* SIDEBAR (Desktop Only) */}
      <aside className="hidden xl:flex w-[248px] bg-white border-r border-slate-200 flex-col shrink-0 z-10 relative">
        <div className="h-[68px] flex items-center px-6 border-b border-slate-200 shrink-0">
          <div className="text-[18px] font-bold text-slate-900 tracking-tight">Ada Ops</div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">My Workspace</div>
            <div className="bg-indigo-50 text-indigo-700 rounded-md font-bold text-[14px] flex items-center gap-3 px-2.5 py-2">
              <LayoutGrid className="w-4 h-4" /> Dashboard
            </div>
            <NavItem icon={<Calendar className="w-4 h-4" />} label="My Schedule" />
            <NavItem icon={<History className="w-4 h-4" />} label="Timesheets" />
            <NavItem icon={<ClipboardCheck className="w-4 h-4" />} label="My Requests" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-3 mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Platform</div>
            <NavItem icon={<Video className="w-4 h-4" />} label="Live Sessions" />
            <NavItem icon={<Users className="w-4 h-4" />} label="Directory" />
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex flex-col gap-2">
          <NavItem icon={<HelpCircle className="w-4 h-4" />} label="Help Center" />
          <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 relative z-0">

        {/* HEADER */}
        <header className="h-[56px] md:h-[60px] xl:h-[68px] bg-white border-b border-slate-200 flex items-center justify-between px-4 xl:px-8 shrink-0 z-10">
          <div className="flex items-center gap-3 xl:hidden">
            <button className="text-slate-500 hover:text-slate-900">
              <Menu className="w-6 h-6" />
            </button>
            <div className="text-[16px] font-bold text-slate-900">Ada Ops</div>
          </div>
          <div className="hidden xl:flex items-center gap-6 w-[400px]">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full h-9 pl-9 pr-10 bg-slate-50 border border-slate-200 rounded-md text-[14px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 xl:gap-5">
            <div className="relative cursor-pointer">
              <Bell className="w-5 h-5 xl:w-4 xl:h-4 text-slate-600" />
              <div className="absolute -top-1 -right-1 xl:-top-1.5 xl:-right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] xl:text-[12px] font-bold flex items-center justify-center rounded-full border border-white">
                3
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200 hidden xl:block"></div>
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[13px]">
                ME
              </div>
            </div>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="p-4 md:p-6 xl:p-8 flex flex-col gap-4 xl:gap-6 overflow-y-auto">

          {/* PAGE HEADER */}
          <div className="flex flex-col gap-1 mb-1">
            <h1 className="text-[20px] md:text-[24px] xl:text-[26px] font-bold tracking-tight text-slate-900 leading-tight">My Workspace</h1>
            <p className="text-[13px] xl:text-[14px] text-slate-500 font-medium">Welcome back! Ready for your upcoming shifts today?</p>
          </div>

          {/* ROW 1: NEXT SHIFT HERO */}
          <div className="w-full bg-white rounded-[12px] xl:rounded-[16px] border border-slate-200 shadow-sm p-4 md:p-5 xl:p-6 flex flex-col xl:flex-row items-stretch min-h-auto xl:min-h-[170px] relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-600"></div>

            <div className="flex-1 flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-2 xl:gap-3 mb-3 xl:mb-4">
                <span className="px-2.5 py-1 text-[12px] xl:text-[13px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 rounded border border-indigo-100">Next Shift</span>
                <span className="flex items-center gap-1 text-[12px] xl:text-[13px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                  <Clock className="w-3.5 h-3.5" /> Starts in 45m
                </span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 xl:gap-5">
                <div className="hidden sm:flex w-[60px] h-[60px] xl:w-[72px] xl:h-[72px] rounded-xl bg-slate-50 border border-slate-200 items-center justify-center text-[20px] xl:text-[22px] font-bold text-slate-700 shadow-sm shrink-0">
                  PH
                </div>
                <div className="flex flex-col gap-1 xl:gap-1.5">
                  <div className="flex items-center gap-2 xl:gap-3">
                    <h2 className="text-[20px] xl:text-[24px] font-bold text-slate-900 leading-none">Pharmaton</h2>
                    <span className="text-[11px] xl:text-[13px] font-semibold text-slate-500 uppercase px-1.5 py-0.5 xl:px-2 xl:py-0.5 bg-slate-100 rounded">TikTok</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 xl:gap-y-2 xl:gap-x-4 text-[13px] xl:text-[14px] text-slate-600 mt-1">
                    <span className="flex items-center gap-1 xl:gap-1.5 font-medium"><Calendar className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-400" /> Today, 14:00 - 16:00</span>
                    <span className="flex items-center gap-1 xl:gap-1.5 font-bold text-slate-700"><CheckCircle className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-emerald-500" /> Host</span>
                    <span className="flex items-center gap-1 xl:gap-1.5 font-medium"><MapPin className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-400" /> Studio A</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full xl:w-[280px] flex flex-col items-start xl:items-end justify-center border-t xl:border-t-0 xl:border-l border-slate-100 pt-4 mt-4 xl:pt-0 xl:mt-0 xl:pl-6 shrink-0">
              <div className="flex flex-col items-end gap-1 mb-3 xl:mb-4 w-full">
                <div className="flex justify-between w-full text-[12px] xl:text-[13px] font-medium mb-1">
                  <span className="text-slate-500">Preparation</span>
                  <span className="text-indigo-600 font-bold">100% Ready</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-full rounded-full"></div>
                </div>
              </div>
              <button className="w-full flex justify-center items-center gap-2 px-4 py-3 xl:py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm text-[14px] font-bold transition-colors">
                <PlayCircle className="w-4 h-4" /> Enter Workspace
              </button>
            </div>
          </div>

          {/* ROW 2: MY SCHEDULE (7/12) & MY ACTIONS (5/12) */}
          <div className="flex flex-col xl:grid xl:grid-cols-12 gap-4 xl:gap-6 mt-1 xl:mt-2">

            {/* MY SCHEDULE */}
            <div className="xl:col-span-7 flex flex-col">
              <div className="flex justify-between items-center mb-2 xl:mb-3">
                <h2 className="text-[15px] xl:text-[16px] font-bold text-slate-900">My Schedule</h2>
                <a href="#" className="text-[13px] xl:text-[14px] font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                  View full schedule <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-3 xl:p-4 flex flex-col gap-3 flex-1">
                <div className="text-[12px] xl:text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 xl:mb-1">Tomorrow</div>

                <ScheduleItem
                  brand="Lactacyd" platform="Shopee" time="10:00 - 12:00" role="Support" location="Studio B"
                />
                <ScheduleItem
                  brand="Corbiere" platform="TikTok" time="18:00 - 20:00" role="Host" location="Studio A"
                />

                <div className="text-[12px] xl:text-[13px] font-bold text-slate-500 uppercase tracking-wider mt-2 mb-0.5 xl:mb-1">Thursday, 22 Sep</div>
                <ScheduleItem
                  brand="Ostelin" platform="Shopee" time="14:00 - 16:00" role="Host" location="Studio C"
                />
              </div>
            </div>

            {/* MY ACTIONS */}
            <div className="xl:col-span-5 flex flex-col">
              <div className="flex justify-between items-center mb-2 xl:mb-3">
                <h2 className="text-[15px] xl:text-[16px] font-bold text-slate-900">My Actions</h2>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-2 xl:p-3 flex flex-col gap-1.5 flex-1 justify-center">
                <ActionItem
                  icon={<FileEdit className="w-5 h-5 text-indigo-600" />} bg="bg-indigo-50" border="border-indigo-100"
                  title="Submit Post-Live Report" context="Pharmaton   Morning Shift" action="Submit"
                />
                <ActionItem
                  icon={<AlertCircle className="w-5 h-5 text-amber-600" />} bg="bg-amber-50" border="border-amber-100"
                  title="Confirm Script Update" context="Lactacyd   Tomorrow" action="Review"
                />
                <ActionItem
                  icon={<ListTodo className="w-5 h-5 text-emerald-600" />} bg="bg-emerald-50" border="border-emerald-100"
                  title="Complete Training Module" context="Platform Updates Q3" action="Start"
                />
              </div>
            </div>

          </div>

          {/* ROW 3: OPEN SHIFTS FOR YOU */}
          <div className="flex flex-col mt-2">
            <div className="flex justify-between items-center mb-2 xl:mb-3">
              <h2 className="text-[15px] xl:text-[16px] font-bold text-slate-900">Open Shifts For You</h2>
              <a href="#" className="text-[13px] xl:text-[14px] font-semibold text-indigo-600 hover:underline flex items-center gap-1">
                View all open shifts <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <OpenShiftCard brand="Cetaphil" platform="Lazada" date="Mon, 26 Sep" time="09:00 - 11:00" role="Host" />
              <OpenShiftCard brand="Berocca" platform="Shopee" date="Tue, 27 Sep" time="15:00 - 17:00" role="Support" />
              <OpenShiftCard brand="Redoxon" platform="TikTok" date="Wed, 28 Sep" time="19:00 - 21:00" role="Host" />
              <div className="hidden xl:block">
                <OpenShiftCard brand="Bepanthen" platform="Lazada" date="Thu, 29 Sep" time="10:00 - 12:00" role="Support" />
              </div>
            </div>
          </div>

          {/* ROW 4: MY REQUESTS (6/12) & NOTIFICATIONS (6/12) */}
          <div className="flex flex-col xl:grid xl:grid-cols-12 gap-4 xl:gap-6 mt-1 xl:mt-2 pb-4">

            {/* MY REQUESTS */}
            <div className="xl:col-span-6 flex flex-col">
              <div className="flex justify-between items-center mb-2 xl:mb-3">
                <h2 className="text-[15px] xl:text-[16px] font-bold text-slate-900">My Requests</h2>
                <button className="text-[12px] xl:text-[13px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 xl:px-3 xl:py-1 rounded-md border border-indigo-100 hover:bg-indigo-100 transition-colors">
                  New Request
                </button>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-2 flex flex-col flex-1">
                <RequestItem title="Swap Request" target="Corbiere   21 Sep" status="Pending" statusColor="amber" />
                <RequestItem title="Leave Request" target="26 Sep - 28 Sep" status="Approved" statusColor="emerald" />
                <RequestItem title="Equipment Issue" target="Studio A Mic" status="Resolved" statusColor="emerald" />
              </div>
            </div>

            {/* RECENT NOTIFICATIONS */}
            <div className="xl:col-span-6 flex flex-col">
              <div className="flex justify-between items-center mb-2 xl:mb-3">
                <h2 className="text-[15px] xl:text-[16px] font-bold text-slate-900">Recent Notifications</h2>
                <a href="#" className="text-[13px] xl:text-[14px] font-semibold text-slate-500 hover:text-slate-900 transition-colors">
                  Mark all as read
                </a>
              </div>
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-2 flex flex-col flex-1">
                <NotificationItem title="Shift Reminder" desc="Your shift for Pharmaton starts in 45 mins" time="10m ago" unread={true} />
                <NotificationItem title="Script Updated" desc="Lactacyd script has been updated for tomorrow" time="2h ago" unread={false} />
                <NotificationItem title="Swap Approved" desc="Your swap request for Corbiere has been approved" time="Yesterday" unread={false} />
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

function ScheduleItem({ brand, platform, time, role, location }: any) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 xl:p-3.5 border border-slate-100 bg-slate-50/50 rounded-lg hover:border-slate-300 hover:bg-white transition-all group gap-3 sm:gap-0">
      <div className="flex items-start sm:items-center gap-3 xl:gap-4 min-w-0">
        <div className="flex flex-col w-16 sm:w-20 shrink-0">
          <span className="text-[13px] xl:text-[14px] font-bold text-slate-900 leading-tight">{time.split(' - ')[0]}</span>
          <span className="text-[12px] xl:text-[13px] font-medium text-slate-500">{time.split(' - ')[1]}</span>
        </div>
        <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>
        <div className="flex flex-col min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 xl:gap-2 mb-0.5">
            <span className="text-[13px] xl:text-[14px] font-bold text-slate-900 truncate max-w-[100px] sm:max-w-[200px]">{brand}</span>
            <span className="text-[11px] xl:text-[12px] font-bold text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 rounded shrink-0">{platform}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 xl:gap-3 text-[12px] xl:text-[13px] font-medium text-slate-600">
            <span className="flex items-center gap-1 shrink-0"><CheckCircle className="w-3 h-3 text-slate-400" /> {role}</span>
            <span className="flex items-center gap-1 shrink-0"><MapPin className="w-3 h-3 text-slate-400" /> {location}</span>
          </div>
        </div>
      </div>
      <button className="w-full sm:w-auto text-[13px] xl:text-[14px] font-semibold text-slate-700 sm:text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 hover:text-indigo-600 transition-all border border-slate-200 px-3 py-2.5 sm:py-1.5 rounded-md bg-white text-center">
        Details
      </button>
    </div>
  )
}

function ActionItem({ icon, bg, border, title, context, action }: any) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 xl:px-4 xl:py-3.5 rounded-lg border hover:border-slate-300 hover:bg-slate-50 transition-colors border-transparent gap-3 sm:gap-0`}>
      <div className="flex items-start sm:items-center gap-3 xl:gap-4 min-w-0">
        <div className={`w-8 h-8 xl:w-10 xl:h-10 rounded-full flex items-center justify-center shrink-0 border ${bg} ${border}`}>
          <div className="scale-75 xl:scale-100">{icon}</div>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] xl:text-[14px] font-bold text-slate-900 leading-snug mb-0.5 truncate">{title}</span>
          <span className="text-[12px] xl:text-[14px] text-slate-600 leading-snug truncate">{context}</span>
        </div>
      </div>
      <button className={`w-full sm:w-auto px-4 py-2.5 xl:py-1.5 border hover:bg-slate-50 text-[13px] font-bold rounded-md shadow-sm shrink-0 transition-colors bg-white border-slate-300 text-slate-700 text-center`}>
        {action}
      </button>
    </div>
  )
}

function OpenShiftCard({ brand, platform, date, time, role }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-indigo-300 hover:shadow-sm transition-all flex flex-col gap-3 min-w-0">
      <div className="flex justify-between items-start">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-[14px] xl:text-[15px] font-bold text-slate-900 mb-1 truncate">{brand}</span>
          <span className="text-[12px] xl:text-[13px] font-semibold text-slate-500 uppercase px-1.5 py-0.5 bg-slate-100 rounded inline-block self-start shrink-0">{platform}</span>
        </div>
        <span className="text-[12px] xl:text-[13px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 shrink-0">{role}</span>
      </div>

      <div className="flex flex-col gap-1 text-[13px] xl:text-[14px] font-medium text-slate-600 mt-1">
        <div className="flex items-center gap-2 truncate"><Calendar className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-400 shrink-0" /> {date}</div>
        <div className="flex items-center gap-2 truncate"><Clock className="w-3.5 h-3.5 xl:w-4 xl:h-4 text-slate-400 shrink-0" /> {time}</div>
      </div>

      <button className="w-full mt-2 py-2.5 xl:py-2 border border-slate-200 rounded-md text-[13px] xl:text-[14px] font-bold text-slate-700 hover:bg-slate-50 hover:text-indigo-600 transition-colors text-center">
        Request Shift
      </button>
    </div>
  )
}

function RequestItem({ title, target, status, statusColor }: any) {
  const pillClasses: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center justify-between p-2.5 xl:p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors gap-2 sm:gap-0">
      <div className="flex flex-col gap-0.5 min-w-0 pr-2">
        <span className="text-[13px] xl:text-[14px] font-bold text-slate-900 truncate">{title}</span>
        <span className="text-[12px] xl:text-[13px] text-slate-500 truncate">{target}</span>
      </div>
      <span className={`px-2 py-0.5 xl:px-2.5 xl:py-1 text-[12px] xl:text-[13px] font-bold rounded-md border shrink-0 ${pillClasses[statusColor]}`}>
        {status}
      </span>
    </div>
  )
}

function NotificationItem({ title, desc, time, unread }: any) {
  return (
    <div className="flex items-start gap-2.5 xl:gap-3 p-2.5 xl:p-3 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
      <div className="pt-1.5 shrink-0">
        <div className={`w-1.5 h-1.5 xl:w-2 xl:h-2 rounded-full ${unread ? 'bg-indigo-600' : 'bg-transparent'}`}></div>
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className={`text-[13px] xl:text-[14px] ${unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'} truncate`}>{title}</span>
        <span className="text-[12px] xl:text-[13px] text-slate-500 line-clamp-2 xl:truncate">{desc}</span>
      </div>
      <span className="text-[11px] xl:text-[13px] font-medium text-slate-400 shrink-0">{time}</span>
    </div>
  )
}
