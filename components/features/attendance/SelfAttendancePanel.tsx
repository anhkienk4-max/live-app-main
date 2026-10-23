'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { readMySelfAttendance,writeSelfAttendance,writeSelfAttendancePhotoCheckIn } from '@/lib/services/supabaseSelfAttendanceService'
import type { AttendanceRole,AttendanceEventKind,SelfAttendanceEvent } from '@/lib/utils/selfAttendanceContract'

export interface SelfAttendanceShiftContext {
  date:string
  start_time:string
  end_time:string
  brand:string
  platform:string
  title?:string|null
  studio?:string|null
}

const displayTime=(value:string)=>new Intl.DateTimeFormat('vi-VN',{
  timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'
}).format(new Date(value))

export function SelfAttendancePanel({
  shiftId,role,shiftContext,
}:{shiftId:string;role:AttendanceRole;shiftContext:SelfAttendanceShiftContext}) {
  const key=shiftId+':'+role
  const [nonce,setNonce]=React.useState(0)
  const [snapshot,setSnapshot]=React.useState<{key:string;items:SelfAttendanceEvent[];error:string|null}|null>(null)
  const [busy,setBusy]=React.useState(false)
  const [writeError,setWriteError]=React.useState<string|null>(null)
  const [photo,setPhoto]=React.useState<File|null>(null)
  const [photoSource,setPhotoSource]=React.useState<'camera'|'file_picker'>('camera')
  const [photoPreview,setPhotoPreview]=React.useState<string|null>(null)
  const cameraRef=React.useRef<HTMLInputElement>(null)
  const pickerRef=React.useRef<HTMLInputElement>(null)
  const lock=React.useRef(false)
  const requestIds=React.useRef<Partial<Record<AttendanceEventKind,string>>>({})

  React.useEffect(()=>{
    let active=true
    void readMySelfAttendance(shiftId).then(items=>{
      if(active)setSnapshot({key,items,error:null})
    }).catch(error=>{
      if(active)setSnapshot({key,items:[],error:error instanceof Error?error.message:'Không thể tải chấm công'})
    })
    return()=>{active=false}
  },[shiftId,key,nonce])
  React.useEffect(()=>{
    if(!photo)return
    const reader=new FileReader()
    reader.onload=()=>{
      if(typeof reader.result==='string')setPhotoPreview(reader.result)
    }
    reader.readAsDataURL(photo)
    return()=>{reader.onload=null;reader.abort()}
  },[photo])

  const ready=snapshot?.key===key && !snapshot.error
  const rows=ready?snapshot.items.filter(r=>r.role===role):[]
  const checkedIn=rows.find(row=>row.event==='check_in')
  const checkedOut=rows.find(row=>row.event==='check_out')
  const nextAction:AttendanceEventKind|null=!ready?null:!checkedIn?'check_in':!checkedOut?'check_out':null

  function selectPhoto(file:File|undefined,source:'camera'|'file_picker') {
    setWriteError(null)
    if(!file)return
    if(file.size<1||file.size>4*1024*1024||
      !['image/jpeg','image/png','image/webp'].includes(file.type)) {
      setPhoto(null)
      setPhotoPreview(null)
      setWriteError('Ảnh JPG, PNG hoặc WebP, tối đa 4 MB. Vui lòng chụp/chọn lại.')
      return
    }
    setPhotoPreview(null)
    setPhoto(file)
    setPhotoSource(source)
  }

  async function submit(kind:AttendanceEventKind){
    if(lock.current||!ready||kind!==nextAction)return
    if(kind==='check_in'&&!photo){setWriteError('Cần chụp hoặc chọn ảnh check-in trước khi xác nhận.');return}
    lock.current=true;setBusy(true);setWriteError(null)
    requestIds.current[kind]??=crypto.randomUUID()
    try {
      if(kind==='check_in') {
        await writeSelfAttendancePhotoCheckIn(shiftId,role,requestIds.current[kind]!,photo!,photoSource)
      } else {
        await writeSelfAttendance(shiftId,role,kind,requestIds.current[kind]!)
      }
      requestIds.current[kind]=undefined
      setPhoto(null)
      setPhotoPreview(null)
      setSnapshot(null)
      setNonce(v=>v+1)
    } catch(error){
      setWriteError(error instanceof Error?error.message:'Không xác minh được thao tác. Hãy thử lại.')
      // Preserve request UUID and selected photo for an idempotent retry.
      // If the server stored evidence before a timeout, do not upload another object.
    } finally {lock.current=false;setBusy(false)}
  }
  const roleNames:Record<AttendanceRole,string>={host:'Host',support:'Trợ live',technical:'Kỹ thuật'}

  return <section aria-label="Chấm công cá nhân" className="space-y-3 rounded-md border p-3" data-testid="self-attendance-panel">
    <div className="space-y-1">
      <h3 className="text-sm font-semibold">Chấm công ca của tôi · {roleNames[role]}</h3>
      <p className="text-xs text-muted-foreground">Thời gian do server ghi nhận. Ảnh check-in chỉ là bằng chứng chờ đối chiếu, chưa phải giờ công được duyệt hoặc tiền lương.</p>
    </div>
    <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-3" data-testid="attendance-live-shift-context">
      <div><dt className="text-muted-foreground">Ngày ca</dt><dd className="font-medium">{shiftContext.date}</dd></div>
      <div><dt className="text-muted-foreground">Khung giờ live</dt><dd className="font-medium">{shiftContext.start_time.slice(0,5)}–{shiftContext.end_time.slice(0,5)}</dd></div>
      <div><dt className="text-muted-foreground">Thương hiệu</dt><dd className="font-medium">{shiftContext.brand}</dd></div>
      <div><dt className="text-muted-foreground">Nền tảng</dt><dd className="font-medium">{shiftContext.platform}</dd></div>
      <div><dt className="text-muted-foreground">Phòng live</dt><dd className="font-medium">{shiftContext.studio||'Chưa có'}</dd></div>
      <div><dt className="text-muted-foreground">Nội dung ca</dt><dd className="font-medium">{shiftContext.title||'Livestream'}</dd></div>
    </dl>

    {!ready&&!snapshot?.error?<p role="status" className="text-xs">Đang kiểm tra nhật ký...</p>:null}
    {snapshot?.key===key&&snapshot.error?<p role="alert" className="text-xs text-red-600">{snapshot.error}</p>:null}
    {checkedIn?<p className="text-xs">Check-in: {displayTime(checkedIn.recorded_at)}
      {checkedIn.photo_available?' · Đã gắn ảnh Drive':' · Chưa có ảnh được xác minh'}
    </p>:null}
    {checkedOut?<p className="text-xs">Check-out: {displayTime(checkedOut.recorded_at)}</p>:null}
    {checkedIn?.photo_available?<div className="space-y-1">
      <p className="text-xs font-medium">Ảnh bằng chứng check-in</p>
      {/* Authenticated route enforces owner or scoped reviewer permission. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="max-h-52 max-w-full rounded-md border object-contain"
        src={'/api/workforce/self-attendance-photo?event_id='+encodeURIComponent(checkedIn.event_id)}
        alt="Ảnh bằng chứng chấm công" />
    </div>:null}
    {checkedIn?<p className="text-xs text-amber-700">Đang chờ quản lý đối chiếu và duyệt giờ công</p>:null}

    {nextAction==='check_in'?<div className="space-y-2 rounded-md border p-3" data-testid="attendance-checkin-camera">
      <p className="text-xs font-medium">Ảnh check-in bắt buộc (JPG/PNG/WebP, tối đa 4 MB)</p>
      <p className="text-xs text-muted-foreground">Chụp ảnh tại phòng live để xác nhận có mặt. Ảnh sẽ được lưu tại Drive CHECK IN/OUT đúng tháng và vai trò.</p>
      <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
        className="sr-only" aria-label="Chụp ảnh check-in bằng camera"
        onChange={e=>selectPhoto(e.target.files?.[0], 'camera')} />
      <input ref={pickerRef} type="file" accept="image/jpeg,image/png,image/webp"
        className="sr-only" aria-label="Chọn ảnh check-in có sẵn"
        onChange={e=>selectPhoto(e.target.files?.[0], 'file_picker')} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={busy}
          onClick={()=>cameraRef.current?.click()}>Chụp ảnh</Button>
        <Button type="button" variant="outline" size="sm" disabled={busy}
          onClick={()=>pickerRef.current?.click()}>Chọn ảnh</Button>
      </div>
      {photoPreview? <div className="space-y-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoPreview} className="max-h-48 max-w-full rounded-md border object-contain" alt="Ảnh sẽ gửi để check-in" />
        <p className="text-xs text-muted-foreground">Ảnh đã chọn: {photo?.name}, {photo?Math.ceil(photo.size/1024):0} KB. Sẽ tải vào Drive khi xác nhận.</p>
      </div>:null}
    </div>:null}
    {writeError?<p role="alert" className="text-xs text-red-600">{writeError}</p>:null}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setNonce(v=>v+1)}>Tải lại</Button>
      {nextAction?<Button type="button" size="sm" disabled={busy||(nextAction==='check_in'&&!photo)}
        onClick={()=>void submit(nextAction)}>
        {busy?'Đang ghi nhận...':nextAction==='check_in'?'Tải ảnh và check-in':'Check-out'}
      </Button>:null}
    </div>
  </section>
}
