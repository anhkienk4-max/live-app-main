import { useState } from 'react'
import { 
  Check, ChevronRight, ChevronLeft, ChevronDown, Search, MoreHorizontal, 
  X, Plus, UploadCloud, Calendar as CalendarIcon, Clock3, LayoutGrid, Users, ArrowLeftRight, MonitorPlay, BarChart2, Bell, Briefcase
} from 'lucide-react'

type CreateShiftStep = 1 | 2 | 3 | 4

const STEPS = [
  { id: 1 as CreateShiftStep, label: 'Thông tin cơ bản' },
  { id: 2 as CreateShiftStep, label: 'Nhân sự' },
  { id: 3 as CreateShiftStep, label: 'Thiết lập' },
  { id: 4 as CreateShiftStep, label: 'Xem lại' },
]

type Tone = 'orange' | 'blue' | 'purple' | 'green' | 'rose'

const STAFF: { name: string, role: string, initials: string, tone: Tone, selected: boolean }[] = [
  { name: 'Lê Thảo Vy', role: 'Host', initials: 'LV', tone: 'orange', selected: true },
  { name: 'Trần Minh Quân', role: 'Cameraman', initials: 'TQ', tone: 'blue', selected: true },
  { name: 'Phạm Gia Huy', role: 'Support', initials: 'PH', tone: 'purple', selected: false },
  { name: 'Nguyễn Thu Hà', role: 'Support', initials: 'NH', tone: 'green', selected: false },
  { name: 'Đặng Minh Khoa', role: 'Support', initials: 'DK', tone: 'rose', selected: false },
]

const REQUIREMENTS = [
  'Đúng giờ',
  'Trang phục theo brand',
  'Chuẩn bị thiết bị',
  'Check-in studio'
]

export function CreateShiftReferenceMock() {
  const [step, setStep] = useState<CreateShiftStep>(1)

  return (
    <div className="flex h-screen w-full bg-[#F8FAFC] overflow-hidden font-sans text-slate-900">
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
          <NavItem icon={<Clock3 size={18} />} label="Shifts" active />
          <NavItem icon={<Users size={18} />} label="Staffing" />
          <NavItem icon={<ArrowLeftRight size={18} />} label="Swaps" />
          <NavItem icon={<MonitorPlay size={18} />} label="Live" />
          <NavItem icon={<BarChart2 size={18} />} label="Reports" />
          <NavItem icon={<Bell size={18} />} label="Notifications" />
        </div>
        
        <div className="p-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
            <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 bg-slate-200">NK</span>
          </div>
          <div className="flex flex-col flex-1 overflow-hidden">
            <span className="text-sm font-medium truncate">Nguyễn Trung Kiên</span>
            <span className="text-xs text-slate-400 truncate">Admin</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* TOPBAR (56px) */}
        <header className="h-[56px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-2 text-[14px] text-slate-500">
            <span className="hover:text-blue-600 cursor-pointer font-medium">Shifts</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-slate-900 font-bold">Tạo ca làm việc</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative text-slate-500 hover:text-slate-700">
              <Bell className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
              <span className="w-full h-full flex items-center justify-center text-xs font-bold text-slate-700 bg-slate-200">NK</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6 flex justify-center">
          {/* WIZARD CONTAINER - Compact Enterprise Card */}
          <section className="w-full max-w-[640px] bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-fit mb-12">
            
            {/* Header & Stepper */}
            <div className="px-6 py-5 border-b border-slate-100 bg-white">
              <h1 className="text-[18px] font-bold text-slate-900 mb-5">Tạo ca làm việc mới</h1>
              <StepProgress currentStep={step} />
            </div>

            {/* Step Content */}
            <div className="bg-white">
              {step === 1 && <StepOne onNext={() => setStep(2)} />}
              {step === 2 && <StepTwo onBack={() => setStep(1)} onNext={() => setStep(3)} />}
              {step === 3 && <StepThree onBack={() => setStep(2)} onNext={() => setStep(4)} />}
              {step === 4 && <StepFour onBack={() => setStep(3)} />}
            </div>

          </section>
        </div>
      </main>
    </div>
  )
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a 
      href="#" 
      className={`flex items-center gap-3 px-3 py-2 rounded-md text-[14px] font-medium transition-colors ${
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

function StepProgress({ currentStep }: { currentStep: CreateShiftStep }) {
  return (
    <div className="flex items-center justify-between max-w-[500px]">
      {STEPS.map((item, index) => {
        const isCurrent = item.id === currentStep
        const isComplete = item.id < currentStep
        return (
          <div key={item.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5 relative z-10 w-24">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold ${
                isCurrent ? 'bg-blue-600 text-white shadow-sm border border-blue-600' : 
                isComplete ? 'bg-blue-50 text-blue-600 border border-blue-200' : 
                'bg-white text-slate-400 border border-slate-200'
              }`}>
                {isComplete ? <Check className="h-3.5 w-3.5" /> : item.id}
              </span>
              <span className={`text-[13px] whitespace-nowrap font-medium ${
                isCurrent ? 'text-blue-700' : 
                isComplete ? 'text-slate-700' : 
                'text-slate-400'
              }`}>{item.label}</span>
            </div>
            {index < STEPS.length - 1 && (
              <div className={`h-[2px] flex-1 -mt-5 mx-1 ${isComplete ? 'bg-blue-500' : 'bg-slate-100'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepOne({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-6 space-y-4">
        
        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
            Tên ca <span className="text-red-500">*</span>
          </label>
          <div className="h-9 border border-slate-200 rounded-md px-3 flex items-center bg-white text-[14px] text-slate-900 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            Pharmaton T9
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
              Thương hiệu <span className="text-red-500">*</span>
            </label>
            <div className="h-9 border border-slate-200 rounded-md px-3 flex items-center justify-between bg-white text-[14px] text-slate-900 shadow-sm">
              <span>Pharmaton</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
              Loại ca <span className="text-red-500">*</span>
            </label>
            <div className="h-9 border border-slate-200 rounded-md px-3 flex items-center justify-between bg-white text-[14px] text-slate-900 shadow-sm">
              <span>Livestream</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-4">
          <div className="space-y-1.5">
            <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
              Ngày <span className="text-red-500">*</span>
            </label>
            <div className="h-9 border border-slate-200 rounded-md px-3 flex items-center gap-2 bg-white text-[14px] text-slate-900 shadow-sm">
              <CalendarIcon className="h-4 w-4 text-slate-400" />
              <span className="flex-1">10/09/2026</span>
            </div>
          </div>
          <div className="space-y-1.5 w-[200px]">
            <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
              Thời gian <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="h-9 flex-1 border border-slate-200 rounded-md px-2 flex items-center justify-between bg-white text-[14px] text-slate-900 shadow-sm">
                <span>14:00</span>
                <Clock3 className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <span className="text-slate-400 text-[13px] font-medium">-</span>
              <div className="h-9 flex-1 border border-slate-200 rounded-md px-2 flex items-center justify-between bg-white text-[14px] text-slate-900 shadow-sm">
                <span>17:00</span>
                <Clock3 className="h-3.5 w-3.5 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
            Địa điểm <span className="text-red-500">*</span>
          </label>
          <div className="h-9 border border-slate-200 rounded-md px-3 flex items-center justify-between bg-white text-[14px] text-slate-900 shadow-sm">
            <span>Studio A</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[14px] font-semibold text-slate-800 flex items-center gap-1">
            Mô tả
          </label>
          <div className="h-[72px] border border-slate-200 rounded-md px-3 py-2 bg-white text-[14px] text-slate-700 shadow-sm">
            Livestream bán hàng Pharmaton T9 trên TikTok Shop. Chuẩn bị set up, test thiết bị, hỗ trợ vận hành livestream.
          </div>
        </div>

      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-7 py-4 rounded-b-xl">
        <button type="button" className="h-9 rounded-md border border-slate-200 bg-white px-5 text-[14px] font-medium text-slate-600 hover:bg-slate-50 shadow-sm">
          Hủy
        </button>
        <button type="button" onClick={onNext} className="h-9 rounded-md bg-blue-600 px-5 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm flex items-center gap-1.5">
          Tiếp theo
        </button>
      </div>
    </div>
  )
}

function StepTwo({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-6">
        
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Tìm kiếm nhân sự..." 
              className="w-full h-9 pl-9 pr-3 border border-slate-200 rounded-md text-[14px] focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
            />
          </div>
          <div className="w-[180px] h-9 border border-slate-200 rounded-md px-3 flex items-center justify-between bg-white text-[14px] text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50">
            <span>Tất cả vai trò</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
          {STAFF.map((person, idx) => (
            <div key={idx} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 hover:bg-slate-50/50 last:border-b-0">
              <div className={`w-4 h-4 rounded-sm border flex items-center justify-center flex-shrink-0 cursor-pointer ${person.selected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                <Check className="w-3 h-3" />
              </div>
              <InitialsAvatar initials={person.initials} tone={person.tone} />
              <div className="flex-1 text-[14px] font-semibold text-slate-800">
                {person.name}
              </div>
              <div className="w-[100px] text-[13px] font-medium text-slate-500">
                {person.role}
              </div>
              <button className="p-1 hover:bg-slate-100 rounded text-slate-400">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        
        <div className="text-[13px] font-medium text-blue-600 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span> Đã chọn 2 nhân sự
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-7 py-4 rounded-b-xl">
        <button type="button" onClick={onBack} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Quay lại
        </button>
        <button type="button" onClick={onNext} className="h-9 rounded-md bg-blue-600 px-5 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm flex items-center gap-1.5">
          Tiếp theo
        </button>
      </div>
    </div>
  )
}

function StepThree({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-6 space-y-6">
        
        {/* Requirements */}
        <div>
          <h3 className="text-[14px] font-bold text-slate-900 mb-2.5">Yêu cầu & Ghi chú</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {REQUIREMENTS.map((req, idx) => (
              <div key={idx} className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-md text-[13px] font-medium text-slate-700">
                {req}
                <button className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          <button className="text-[13px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 border border-dashed border-blue-200 bg-blue-50/50 px-3 py-1.5 rounded-md">
            <Plus className="w-3.5 h-3.5" /> Thêm yêu cầu
          </button>
        </div>

        {/* Upload Zone */}
        <div>
          <h3 className="text-[14px] font-bold text-slate-900 mb-2.5">File đính kèm</h3>
          <div className="h-[88px] border border-dashed border-slate-300 rounded-lg bg-slate-50 flex flex-col items-center justify-center gap-1.5 hover:bg-slate-100/50 transition-colors cursor-pointer">
            <UploadCloud className="w-5 h-5 text-slate-400" />
            <div className="text-[13px] font-medium text-slate-700">
              Kéo thả file vào đây hoặc <span className="text-blue-600 font-semibold underline underline-offset-2">Chọn file</span>
            </div>
            <div className="text-[13px] text-slate-500">Hỗ trợ PDF, DOC, XLSX, JPG, PNG (tối đa 10MB)</div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <h3 className="text-[14px] font-bold text-slate-900 mb-2.5">Ghi chú thêm</h3>
          <textarea 
            placeholder="Nhập ghi chú..."
            className="w-full h-[64px] border border-slate-200 rounded-md px-3 py-2 text-[14px] text-slate-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          ></textarea>
        </div>

      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-7 py-4 rounded-b-xl mt-auto">
        <button type="button" onClick={onBack} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Quay lại
        </button>
        <button type="button" onClick={onNext} className="h-9 rounded-md bg-blue-600 px-5 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm flex items-center gap-1.5">
          Tiếp theo
        </button>
      </div>
    </div>
  )
}

function StepFour({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-7 py-6">
        
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm">
          {/* Header Row */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-1">Tên ca</div>
            <div className="text-[15px] font-bold text-slate-900">Pharmaton T9</div>
          </div>

          {/* Data Grid */}
          <div className="grid grid-cols-2">
            <div className="px-5 py-3 border-b border-r border-slate-100">
              <div className="text-[13px] font-medium text-slate-500 mb-1">Thương hiệu</div>
              <div className="text-[14px] font-medium text-slate-900">Pharmaton</div>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="text-[13px] font-medium text-slate-500 mb-1">Loại ca</div>
              <div className="text-[14px] font-medium text-slate-900">Livestream</div>
            </div>

            <div className="px-5 py-3 border-b border-r border-slate-100">
              <div className="text-[13px] font-medium text-slate-500 mb-1">Thời gian</div>
              <div className="text-[14px] font-medium text-slate-900 leading-snug">
                10/09/2026<br />14:00 - 17:00 (3 giờ)
              </div>
            </div>
            <div className="px-5 py-3 border-b border-slate-100">
              <div className="text-[13px] font-medium text-slate-500 mb-1">Địa điểm</div>
              <div className="text-[14px] font-medium text-slate-900">Studio A</div>
            </div>
          </div>

          {/* Full Width Rows */}
          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-3">Nhân sự (2)</div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <InitialsAvatar initials="LV" tone="orange" />
                <span className="text-[14px] font-medium text-slate-900">Lê Thảo Vy</span>
                <span className="text-[14px] text-slate-400">—</span>
                <span className="text-[14px] font-medium text-slate-600">Host</span>
              </div>
              <div className="flex items-center gap-2">
                <InitialsAvatar initials="TQ" tone="blue" />
                <span className="text-[14px] font-medium text-slate-900">Trần Minh Quân</span>
                <span className="text-[14px] text-slate-400">—</span>
                <span className="text-[14px] font-medium text-slate-600">Cameraman</span>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 border-b border-slate-100">
            <div className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Yêu cầu (4)</div>
            <div className="flex flex-wrap gap-1.5">
              {REQUIREMENTS.map((req, idx) => (
                <span key={idx} className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-1 rounded text-[13px] font-medium">
                  {req}
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="px-5 py-3 border-r border-slate-100">
              <div className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ghi chú</div>
              <div className="text-[14px] text-slate-500 italic">Không có</div>
            </div>
            <div className="px-5 py-3">
              <div className="text-[13px] font-bold text-slate-500 uppercase tracking-wider mb-1">File đính kèm</div>
              <div className="text-[14px] text-slate-500 italic">Không có</div>
            </div>
          </div>

        </div>

      </div>

      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-7 py-4 rounded-b-xl mt-auto">
        <button type="button" onClick={onBack} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[14px] font-medium text-slate-700 hover:bg-slate-50 shadow-sm flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Quay lại
        </button>
        <button type="button" className="h-9 rounded-md bg-blue-600 px-5 text-[14px] font-medium text-white hover:bg-blue-700 shadow-sm">
          Tạo ca
        </button>
      </div>
    </div>
  )
}

function InitialsAvatar({ initials, tone }: { initials: string, tone: 'orange' | 'blue' | 'purple' | 'green' | 'rose' }) {
  const styles = {
    orange: 'bg-amber-100 text-amber-700 border-amber-200',
    blue: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  return (
    <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${styles[tone]}`}>
      {initials}
    </div>
  )
}
