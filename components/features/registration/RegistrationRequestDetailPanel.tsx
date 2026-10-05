'use client'

import * as React from 'react'
import {
  CheckCircle2, AlertTriangle, XCircle, Clock, Calendar, MapPin,
  Layers, ChevronDown, ChevronUp,
  Clock3
} from 'lucide-react'
import type { Brand, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { isStaffedRegistration, type ShiftRoleCapacity } from '@/lib/services/dataService'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface RegistrationRequestDetailPanelProps {
  registration: ShiftRegistration
  applicant?: User
  shift?: Shift
  brand?: Brand
  platform?: Platform
  capacity?: ShiftRoleCapacity
  allUserRegistrations: ShiftRegistration[]
  allShifts: Shift[]
  canReview: boolean
  onOpenApprove: () => void
  onOpenReject: () => void
  onCloseMobile?: () => void
}

export function RegistrationRequestDetailPanel({
  registration,
  applicant,
  shift,
  brand,
  platform,
  capacity,
  allUserRegistrations,
  allShifts,
  canReview,
  onOpenApprove,
  onOpenReject,
  onCloseMobile,
}: RegistrationRequestDetailPanelProps) {
  const [showDbInspector, setShowDbInspector] = React.useState(false)

  const applicantName = applicant?.full_name || registration.imported_name || registration.user_id
  const applicantEmail = applicant?.email || 'Chưa liên kết email'


  // Weekly workload derivation
  const userShifts = allUserRegistrations.filter(r => r.user_id === registration.user_id && isStaffedRegistration(r))
  const weeklyShiftsCount = userShifts.length
  const weeklyHours = userShifts.length * 3.5

  // Shift overlap check
  const overlapConflict = (() => {
    if (!shift) return null
    const targetTime = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
    if (!targetTime?.valid) return null

    for (const userReg of userShifts) {
      if (userReg.shift_id === shift.id) continue
      const otherShift = allShifts.find(s => s.id === userReg.shift_id)
      if (!otherShift || otherShift.date !== shift.date) continue
      const otherTime = resolveShiftDateTime(otherShift.date, otherShift.start_time, otherShift.end_time, otherShift.timezone)
      if (otherTime?.valid && targetTime.startAt < otherTime.endAt && otherTime.startAt < targetTime.endAt) {
        return {
          shift: otherShift,
          details: `Trùng giờ với ca #${otherShift.id} "${otherShift.title}" (${otherShift.start_time} – ${otherShift.end_time})`,
        }
      }
    }
    return null
  })()

  // Cutoff evaluation
  const isCutoffPassed = (() => {
    if (!shift) return false
    const now = new Date()
    if (shift.registration_cutoff_at) {
      const cutoff = new Date(shift.registration_cutoff_at)
      if (!Number.isNaN(cutoff.getTime()) && cutoff <= now) return true
    }
    if (shift.end_at) {
      const end = new Date(shift.end_at)
      if (!Number.isNaN(end.getTime()) && end <= now) return true
    }
    return false
  })()

  // Role qualification
  const hasRoleQualification = !applicant?.operational_roles || applicant.operational_roles.includes(registration.operational_role)
  const isAccountActive = !applicant || (applicant.status === 'active' && (!applicant.account_status || applicant.account_status === 'active'))
  const isCapacityFull = capacity ? capacity.approved >= capacity.required : false

  // Overall eligibility synthesis
  const eligibilityStatus: 'pass' | 'warning' | 'conflict_blocking' = (() => {
    if (overlapConflict || !hasRoleQualification || !isAccountActive) return 'conflict_blocking'
    if (isCapacityFull || isCutoffPassed || weeklyShiftsCount >= 4) return 'warning'
    return 'pass'
  })()

  const eligibilityChecklist = [
    {
      title: `Đạt chuẩn năng lực vai trò ${registration.operational_role.toUpperCase()}`,
      status: hasRoleQualification ? 'pass' : 'fail',
      note: hasRoleQualification ? 'Hồ sơ nhân sự có vai trò này' : 'Chưa được phân quyền cho vai trò này',
    },
    {
      title: 'Tài khoản & nhân sự đang hoạt động',
      status: isAccountActive ? 'pass' : 'fail',
      note: isAccountActive ? 'Trạng thái tài khoản: Hoạt động' : 'Tài khoản đang bị tạm hoãn hoặc khóa',
    },
    {
      title: 'Không trùng lịch với ca phát sóng nào khác',
      status: overlapConflict ? 'fail' : 'pass',
      note: overlapConflict ? overlapConflict.details : 'Không phát hiện xung đột lịch trực',
    },
    {
      title: `Chỉ tiêu ${registration.operational_role.toUpperCase()} ca trực`,
      status: isCapacityFull ? 'warning' : 'pass',
      note: capacity ? `Hiện tại: ${capacity.approved}/${capacity.required} nhân sự` : 'Đang tải chỉ tiêu',
    },
    {
      title: 'Thời hạn đăng ký (Cutoff)',
      status: isCutoffPassed ? 'warning' : 'pass',
      note: isCutoffPassed ? 'Ca đã qua thời hạn cutoff' : (shift?.registration_cutoff_at ? `Hạn chót: ${shift.registration_cutoff_at}` : 'Trong thời hạn cho phép'),
    },
  ]

  return (
    <div className="flex flex-col h-full space-y-4 overflow-y-auto p-4 text-xs bg-slate-50/50">
      {onCloseMobile && (
        <div className="flex lg:hidden justify-between items-center pb-2 border-b border-slate-200">
          <span className="font-bold text-slate-800">Chi tiết đơn đăng ký</span>
          <Button variant="ghost" size="sm" onClick={onCloseMobile}>
            ✕ Đóng
          </Button>
        </div>
      )}

      {/* 1. APPLICANT & REQUEST HEADER */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-600">#{registration.id}</span>
              <span className="text-[10px] text-slate-400 font-mono">v{registration.version}</span>
            </div>
            <h3 className="text-sm font-bold text-slate-900 mt-0.5">{applicantName}</h3>
            <div className="text-[11px] text-slate-500">{applicantEmail}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              variant="outline"
              className={`text-[10px] uppercase font-bold tracking-wider ${
                registration.operational_role === 'host'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : registration.operational_role === 'support'
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-purple-200 bg-purple-50 text-purple-700'
              }`}
            >
              {registration.operational_role}
            </Badge>
            <span className="text-[10px] text-slate-400 font-mono">
              {registration.source}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px]">
          <div>
            <span className="text-slate-400 block text-[10px]">Tải ca tuần này</span>
            <span className="font-semibold text-slate-800">{weeklyShiftsCount} ca · ~{weeklyHours}h</span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px]">Thời điểm gửi</span>
            <span className="font-medium text-slate-700">
              {registration.requested_at ? new Date(registration.requested_at).toLocaleDateString('vi-VN') : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. SHIFT CONTEXT PANEL */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
          <span>BỐI CẢNH CA PHÁT SÓNG</span>
          <span className="font-mono text-blue-600 font-semibold">{shift ? `#${shift.id}` : registration.shift_id}</span>
        </div>
        {shift ? (
          <div className="space-y-1.5 text-[11px]">
            <div className="font-semibold text-slate-900">{shift.title}</div>
            <div className="text-slate-600 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {shift.date}</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {shift.start_time} – {shift.end_time}</span>
              {shift.studio && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {shift.studio}</span>}
            </div>
            {(brand || platform) && (
              <div className="text-[10px] text-slate-500 flex gap-2">
                {brand && <span>Nhãn hàng: <strong>{brand.name}</strong></span>}
                {platform && <span>Nền tảng: <strong>{platform.name}</strong></span>}
              </div>
            )}
            <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between">
              <span>Hạn đăng ký: {shift.registration_cutoff_at || 'Mở'}</span>
              <span className="font-semibold text-slate-700">
                Định biên: {capacity ? `${capacity.approved}/${capacity.required}` : '—'}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-[11px]">Đang tải thông tin ca trực #{registration.shift_id}...</div>
        )}
      </div>

      {/* 3. ELIGIBILITY RULES & AUDIT CHECKLIST */}
      <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
          <span>KẾT QUẢ THẨM ĐỊNH ĐIỀU KIỆN</span>
          {eligibilityStatus === 'pass' ? (
            <span className="text-[10px] font-bold text-emerald-600">100% ĐẠT</span>
          ) : eligibilityStatus === 'warning' ? (
            <span className="text-[10px] font-bold text-amber-600">CẢNH BÁO</span>
          ) : (
            <span className="text-[10px] font-bold text-rose-600">XUNG ĐỘT CHẶN</span>
          )}
        </div>

        <div className="space-y-1.5 text-[11px]">
          {eligibilityChecklist.map((item, idx) => (
            <div key={idx} className="flex items-start gap-1.5">
              {item.status === 'fail' ? (
                <XCircle className="h-3.5 w-3.5 text-rose-600 mt-0.5 flex-shrink-0" />
              ) : item.status === 'warning' ? (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <span className={item.status === 'fail' ? 'text-rose-700 font-medium' : item.status === 'warning' ? 'text-amber-800' : 'text-slate-700'}>
                  {item.title}
                </span>
                <div className="text-[10px] text-slate-400">{item.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. CANCELLED / TERMINAL RECORD HIGHLIGHT */}
      {registration.status === 'cancelled' && (
        <div className="rounded-lg border border-slate-300 bg-slate-100/90 p-3.5 text-[11px] text-slate-900 space-y-1.5">
          <div className="font-bold text-slate-900 flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-slate-600" />
            <span>Đơn đăng ký đã hủy (Cancelled Record)</span>
          </div>
          <div className="text-[10px] space-y-1 text-slate-700">
            <div>Thời điểm hủy: <strong className="font-mono text-slate-900">{registration.cancelled_at || 'N/A'}</strong></div>
            {registration.review_notes && (
              <div>Ghi chú / Lý do: <span>{registration.review_notes}</span></div>
            )}
            <div className="text-slate-500 pt-1 border-t border-slate-300">
              Quy tắc toàn vẹn: Đơn hủy không chiếm định mức nhân sự đã chốt (isStaffedRegistration = false).
            </div>
          </div>
        </div>
      )}

      {/* 5. DECISION RECORD (FOR APPROVED / REJECTED) */}
      {(registration.status === 'approved' || registration.status === 'rejected') && (
        <div className={`rounded-lg border p-3 text-[11px] space-y-1.5 ${
          registration.status === 'approved'
            ? 'border-emerald-200 bg-emerald-50/60 text-emerald-950'
            : 'border-rose-200 bg-rose-50/60 text-rose-950'
        }`}>
          <div className="font-bold flex items-center gap-1.5">
            {registration.status === 'approved' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <XCircle className="h-4 w-4 text-rose-600" />
            )}
            <span>
              {registration.status === 'approved' ? 'Đã phê duyệt' : 'Đã từ chối'} bởi {registration.reviewed_by || 'Quản trị viên'}
            </span>
          </div>
          <div className="text-[10px] text-slate-600">
            Thời điểm duyệt: {registration.reviewed_at ? new Date(registration.reviewed_at).toLocaleString('vi-VN') : 'N/A'}
          </div>
          {registration.review_notes && (
            <div className="mt-1 pt-1 border-t border-slate-200 text-[10px] italic">
              &ldquo;{registration.review_notes}&rdquo;
            </div>
          )}
        </div>
      )}

      {/* 6. REGISTRATION ↔ OPERATIONAL STAFFING PROVENANCE */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-[11px] text-blue-900 space-y-1.5">
        <div className="font-bold flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-blue-600" />
          <span>Registration ↔ Operational Staffing</span>
        </div>
        <p className="text-[10px] leading-relaxed text-blue-800">
          ShiftRegistration là sổ cái phân bổ quyền lực duy nhất (authoritative shift-user-role ledger). Không tạo thực thể phân bổ riêng (StaffingAssignment). Góc nhìn vận hành trực tiếp chiếu từ đơn đã duyệt.
        </p>
      </div>

      {/* 7. CANONICAL 15 DB FIELDS INSPECTOR */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
        <button
          type="button"
          onClick={() => setShowDbInspector(!showDbInspector)}
          className="flex items-center justify-between w-full text-[11px] font-bold text-slate-700 hover:text-slate-900"
        >
          <span>15 TRƯỜNG DỮ LIỆU CƠ SỞ (REG-001 ~ REG-015)</span>
          {showDbInspector ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        {showDbInspector && (
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px] pt-1 border-t border-slate-100">
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-001 id</span>{registration.id}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-002 shift_id</span>{registration.shift_id}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-003 user_id</span>{registration.user_id}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-004 operational_role</span>{registration.operational_role}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-005 status</span>{registration.status}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-006 source</span>{registration.source}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-007 requested_at</span>{registration.requested_at || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-008 reviewed_by</span>{registration.reviewed_by || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-009 reviewed_at</span>{registration.reviewed_at || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-010 review_notes</span>{registration.review_notes || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-011 cancelled_at</span>{registration.cancelled_at || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-012 imported_name</span>{registration.imported_name || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-013 created_at</span>{registration.created_at || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded"><span className="text-slate-400 block">REG-014 updated_at</span>{registration.updated_at || 'null'}</div>
            <div className="bg-slate-50 p-1.5 rounded col-span-2 text-blue-700 font-bold"><span className="text-slate-400 block font-normal">REG-015 version (CAS)</span>v{registration.version}</div>
          </div>
        )}
      </div>

      {/* 8. DECISION CTAS */}
      <div className="pt-2 sticky bottom-0 bg-slate-50/90 backdrop-blur-xs pb-1">
        {registration.status === 'pending' ? (
          <div className="flex gap-2">
            <Button
              type="button"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
              disabled={!canReview}
              onClick={onOpenApprove}
            >
              ✓ Phê duyệt đơn
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800 font-semibold text-xs"
              disabled={!canReview}
              onClick={onOpenReject}
            >
              ✕ Từ chối
            </Button>
          </div>
        ) : (
          <div className="rounded border border-slate-200 bg-white p-2.5 text-center text-slate-500 text-xs">
            Bản ghi đã chốt (Trạng thái: <strong className="uppercase">{registration.status}</strong>) · Quyết định đã được lưu trữ
          </div>
        )}
      </div>
    </div>
  )
}
