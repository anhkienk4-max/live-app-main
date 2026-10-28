'use client'

import * as React from 'react'
import Link from 'next/link'
import type { Shift } from '@/lib/types/database.types'
import { getCollectionPage } from '@/lib/services/operationsPageService'
import {
  workforceService, workforceErrorMessage, type ActualSegment, type ActualSegmentsResponse,
} from '@/lib/services/workforceService'
import { reviewRoomAttendance, type RoomAttendanceReview } from '@/lib/workforce/adaRoomAttendanceReview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AttendanceDrivePreflight } from './AttendanceDrivePreflight'

export interface LinkedRoomAttendance {
  shiftId: string
  staffId: string
  role: 'host' | 'support'
  date: string
  /** Vietnam-local timestamp, for the existing datetime-local input. */
  liveStartLocal: string
}

function vietnamLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Asia/Ho_Chi_Minh', year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  }).formatToParts(new Date(iso))
  const get=(key: string)=>parts.find(part=>part.type===key)?.value??''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
function fmt(iso: string | null): string {
  return iso ? new Intl.DateTimeFormat('vi-VN', {
    timeZone:'Asia/Ho_Chi_Minh', dateStyle:'short', timeStyle:'short',
  }).format(new Date(iso)) : 'Chưa có'
}
const badge: Record<RoomAttendanceReview['state'],string> = {
  no_record:'Chưa có bản ghi chấm công',
  unverified:'Chờ xác minh/chưa duyệt',
  approved_worked:'Đã duyệt: có làm việc',
  approved_no_show:'Đã duyệt: vắng mặt (cần kiểm tra hủy/pass)',
  outside_policy:'Ca trước ngày hiệu lực 22/10/2026',
  schedule_invalid:'Lịch ca chưa đủ thời gian hợp lệ',
}
export function PayrollAttendanceLink({
  onUse,
}: { onUse: (value: LinkedRoomAttendance) => void }) {
  const [date,setDate] = React.useState('')
  const [page,setPage] = React.useState(1)
  const [shifts,setShifts] = React.useState<Shift[]>([])
  const [total,setTotal] = React.useState(0)
  const [selected,setSelected] = React.useState<Shift | null>(null)
  const [attendance,setAttendance] = React.useState<ActualSegmentsResponse | null>(null)
  const [busy,setBusy] = React.useState(false)
  const [error,setError] = React.useState<string|null>(null)
  const sequence = React.useRef(0)
  React.useEffect(()=>()=>{sequence.current++},[])
  const reset = () => {
    ++sequence.current
    setPage(1);setShifts([]);setTotal(0);setSelected(null);setAttendance(null);setError(null)
  }
  const loadShifts = async (requestedPage: number) => {
    if (!date) {setError('Chọn ngày ca để tải chấm công theo đúng khoảng thời gian.');return}
    const seq=++sequence.current
    setBusy(true);setError(null);setSelected(null);setAttendance(null)
    try {
      const response=await getCollectionPage<Shift>('shifts',{
        page:requestedPage,pageSize:20,filters:{from:date,to:date},
      })
      if(seq!==sequence.current)return
      if (response.items.some(s=>s.date!==date)) throw new Error('SHIFT_DATE_SCOPE_MISMATCH')
      setShifts(response.items);setTotal(response.total);setPage(response.page)
    }catch(e){
      if(seq!==sequence.current)return
      setError(e instanceof Error?e.message:'Không thể tải lịch ca');setShifts([]);setTotal(0)
    }finally{if(seq===sequence.current)setBusy(false)}
  }
  const selectShift = async (shiftId: string) => {
    const shift=shifts.find(s=>s.id===shiftId)
    const seq=++sequence.current
    setSelected(shift??null);setAttendance(null);setError(null)
    if(!shift)return
    setBusy(true)
    try{
      const res=await workforceService.getActualSegments(shiftId)
      if(seq!==sequence.current)return
      if (res.shift_context?.id!==shiftId || res.segments.some(x=>x.shift_id!==shiftId))
        throw new Error('WORKFORCE_SHIFT_SCOPE_MISMATCH')
      setAttendance(res)
    }catch(e){
      if(seq!==sequence.current)return
      setError(workforceErrorMessage(e));setAttendance(null)
    }finally{if(seq===sequence.current)setBusy(false)}
  }
  const start = (selected && attendance?.shift_context) ? {
    id:selected.id, date:attendance.shift_context.date,
    start_time:attendance.shift_context.start_time,
    end_time:attendance.shift_context.end_time,
    start_at:attendance.shift_context.start_at,
    end_at:attendance.shift_context.end_at,
    end_date:attendance.shift_context.end_date,
    crosses_midnight:attendance.shift_context.crosses_midnight,
  } : null
  const segments: ActualSegment[] = attendance?.segments??[]
  const rawAttendance = attendance?.attendance_events ?? []
  interface AppAttendanceRecord {
    staffId: string
    role: string
    checkin: string | null
    checkout: string | null
    checkinEventId: string | null
    checkinPhotoAvailable: boolean
    checkoutEventId: string | null
    checkoutPhotoAvailable: boolean
  }
  const sourceRecords = new Map<string, AppAttendanceRecord>()
  for(const entry of rawAttendance){
    const key=entry.staff_id+':'+entry.operational_role
    const row=sourceRecords.get(key)??{
      staffId:entry.staff_id,
      role:entry.operational_role,
      checkin:null,
      checkout:null,
      checkinEventId:null,
      checkinPhotoAvailable:false,
      checkoutEventId:null,
      checkoutPhotoAvailable:false,
    }
    if(entry.event_kind==='check_in'){
      row.checkin=entry.recorded_at
      row.checkinEventId=entry.id
      row.checkinPhotoAvailable=entry.photo_available===true
    }
    if(entry.event_kind==='check_out'){
      row.checkout=entry.recorded_at
      row.checkoutEventId=entry.id
      row.checkoutPhotoAvailable=entry.photo_available===true
    }
    sourceRecords.set(key,row)
  }
  const pendingAppAttendance=[...sourceRecords.values()]
  const review = (segment:ActualSegment)=>start?reviewRoomAttendance(start,segment):null

  return <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" data-testid="payroll-attendance-link">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Liên kết Chấm công → Nội quy → Payroll</h3>
        <p className="mt-1 text-xs text-slate-600">Dữ liệu đọc trực tiếp từ lịch ca và Workforce Actual Staffing, không tạo lỗi hoặc trừ lương.</p>
      </div>
      <Link className="text-xs font-medium text-blue-700 underline underline-offset-2" href="/workforce">Mở chấm công & Workforce</Link>
    </div>
    <AttendanceDrivePreflight />
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-44 flex-col gap-1 text-xs font-medium">Ngày ca
        <Input aria-label="Ngày ca chấm công" type="date" value={date}
          onChange={e=>{setDate(e.target.value);reset()}}/>
      </label>
      <Button type="button" variant="outline" size="sm" disabled={busy||!date} onClick={()=>void loadShifts(1)}>
        {busy?'Đang tải…':'Lấy ca theo ngày'}
      </Button>
      {total>0&&<span className="text-xs text-slate-500">Tổng {total} ca, trang {page}/{Math.ceil(total/20)}</span>}
    </div>
    {error&&<p className="text-xs text-rose-700" role="alert">{error}</p>}
    {shifts.length>0&&<>
      <label className="flex flex-col gap-1 text-xs font-medium">Ca livestream (đọc từ hệ thống)
        <select aria-label="Chọn ca chấm công" className="h-10 max-w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
          value={selected?.id??''} onChange={e=>void selectShift(e.target.value)}>
          <option value="">Chọn một ca để xem bản ghi chấm công</option>
          {shifts.map(s=><option key={s.id} value={s.id}>
            {s.start_time.slice(0,5)}–{s.end_time.slice(0,5)} · {s.title||s.id.slice(0,8)} · {s.status}
          </option>)}
        </select>
      </label>
      {total>20&&<div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={busy||page<=1} onClick={()=>void loadShifts(page-1)}>Trang trước</Button>
        <Button size="sm" variant="outline" disabled={busy||page*20>=total} onClick={()=>void loadShifts(page+1)}>Trang sau</Button>
      </div>}
    </>}
    {selected&&attendance&&<>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
        <strong>Phân biệt hai bằng chứng:</strong> giờ bắt đầu thực tế của Workforce chỉ xác nhận giờ làm việc khi đã duyệt.
        Ảnh check-in trong ứng dụng chỉ là bằng chứng bổ sung, không tự chứng minh ảnh outfit đúng quy định.
        Chưa tích hợp timestamp tin nhắn group hoặc hình report Drive, nên vẫn cần người quản lý đối chiếu.
        Vì vậy KHÔNG tự xác nhận đi trễ, thiếu ảnh hay áp dụng tiền phạt.
      </div>
      <p className="text-xs text-slate-600">
        Ca {selected.id} · {selected.date} · {selected.status}. Có {segments.length} bản ghi chấm công;
        {attendance.planned_staff?.length??0} phân công được liệt kê.
      </p>
      {segments.length===0&&<p data-testid="attendance-empty" className="text-sm text-slate-600">
        Chưa có bản ghi chấm công. Không đồng nghĩa vắng mặt hoặc vi phạm; cần bổ sung bằng chứng.
      </p>}
      {attendance.attendance_review_enabled === true && <div className="space-y-2 rounded-md border border-slate-200 p-3 text-xs" data-testid="app-attendance-review">
        <strong>Check-in / Check-out trong ứng dụng · Chờ đối chiếu</strong>
        <p className="text-slate-600">Nhật ký server, chưa phải giờ công đã duyệt. Không dùng làm căn cứ trừ lương tự động.</p>
        {pendingAppAttendance.length===0?<p>Chưa có bản ghi check-in ứng dụng, không kết luận vắng mặt.</p>:null}
        {pendingAppAttendance.map(item=><div key={item.staffId+':'+item.role} className="border-t pt-2 space-y-1" data-testid="pending-app-attendance-item">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-800">
              {item.role==='host'?'Host':item.role==='support'?'Trợ live':'Kỹ thuật'} · {item.staffId.slice(0,8)}…
            </span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900" data-testid="attendance-pending-badge">
              Chờ duyệt
            </span>
          </div>
          <div className="text-slate-600">
            Check-in: {fmt(item.checkin)}
            {item.checkinPhotoAvailable&&item.checkinEventId?
              <a className="ml-2 text-blue-700 underline" target="_blank" rel="noopener noreferrer"
                data-testid="view-checkin-photo-link"
                href={'/api/workforce/self-attendance-photo?event_id='+encodeURIComponent(item.checkinEventId)}>
                Xem ảnh check-in Drive (chờ xác minh)
              </a>:
              <span className="ml-2 text-amber-700">Chưa có ảnh check-in</span>}
          </div>
          <div className="text-slate-600">
            Check-out: {fmt(item.checkout)}
            {item.checkoutPhotoAvailable&&item.checkoutEventId?
              <a className="ml-2 text-blue-700 underline" target="_blank" rel="noopener noreferrer"
                data-testid="view-checkout-photo-link"
                href={'/api/workforce/self-attendance-photo?event_id='+encodeURIComponent(item.checkoutEventId)}>
                Xem ảnh check-out Drive (chờ xác minh)
              </a>:
              <span className="ml-2 text-amber-700">Chưa có ảnh check-out</span>}
          </div>
        </div>)}
      </div>}
      <div className="grid gap-2 lg:grid-cols-2">
        {segments.map(seg=>{
          const result=review(seg)
          const allowed=Boolean(result?.state==='approved_worked'
            && (seg.operational_role==='host'||seg.operational_role==='support')
            && result?.scheduledLiveStartIso)
          return <div key={seg.id} className="space-y-2 rounded-md border border-slate-200 p-3 text-xs" data-testid="attendance-segment">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong>{seg.operational_role==='host'?'Host':seg.operational_role==='support'?'Trợ live':'Kỹ thuật'} · {seg.staff_id.slice(0,8)}…</strong>
              <span className="rounded bg-slate-100 px-2 py-0.5">{result?badge[result.state]:'Không hợp lệ'}</span>
            </div>
            <p>Mã chấm công: {seg.id.slice(0,10)} · {seg.review_status}</p>
            <p>Mốc có mặt: {fmt(result?.deadlineIso??null)}</p>
            <p>Bắt đầu làm thực tế: {fmt(seg.actual_start_at)}</p>
            <p>Timestamp check-in group: <strong>Chưa có dữ liệu tích hợp</strong></p>
            <p>
              {result?.actualStartDeltaMinutes!=null
                ? 'Giờ làm thực tế lệch mốc có mặt '+ result.actualStartDeltaMinutes +' phút (chỉ tham chiếu)'
                : 'Chưa đủ dữ liệu để đối chiếu giờ làm thực tế'}
            </p>
            {allowed&&<Button type="button" size="sm" variant="outline" onClick={()=>
              onUse({
                shiftId: selected.id,staffId:seg.staff_id,
                role:seg.operational_role as 'host'|'support',
                date:selected.date,
                liveStartLocal:vietnamLocal(result!.scheduledLiveStartIso!),
              })}>
              Chuyển ca sang bộ tính đề xuất
            </Button>}
          </div>
        })}
      </div>
    </>}
  </div>
}
