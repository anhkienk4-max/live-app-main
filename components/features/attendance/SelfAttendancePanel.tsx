'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'
import { readMySelfAttendance,writeSelfAttendance } from '@/lib/services/supabaseSelfAttendanceService'
import type { AttendanceRole,AttendanceEventKind,SelfAttendanceEvent } from '@/lib/utils/selfAttendanceContract'

const displayTime=(value:string)=>new Intl.DateTimeFormat('vi-VN',{
  timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'
}).format(new Date(value))

export function SelfAttendancePanel({shiftId,role}:{shiftId:string;role:AttendanceRole}) {
  const key=shiftId+':'+role
  const [nonce,setNonce]=React.useState(0)
  const [snapshot,setSnapshot]=React.useState<{key:string;items:SelfAttendanceEvent[];error:string|null}|null>(null)
  const [busy,setBusy]=React.useState(false)
  const [writeError,setWriteError]=React.useState<string|null>(null)
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
  const ready=snapshot?.key===key && !snapshot.error
  const rows=ready?snapshot.items.filter(r=>r.role===role):[]
  const checkedIn=rows.find(row=>row.event==='check_in')
  const checkedOut=rows.find(row=>row.event==='check_out')
  const nextAction:AttendanceEventKind|null=!ready?null:!checkedIn?'check_in':!checkedOut?'check_out':null

  async function submit(kind:AttendanceEventKind){
    if(lock.current||!ready||kind!==nextAction)return
    lock.current=true;setBusy(true);setWriteError(null)
    requestIds.current[kind]??=crypto.randomUUID()
    try{
      await writeSelfAttendance(shiftId,role,kind,requestIds.current[kind]!)
      requestIds.current[kind]=undefined
      setSnapshot(null)
      setNonce(v=>v+1)
    }catch(error){
      setWriteError(error instanceof Error?error.message:'Không xác minh được thao tác. Hãy thử lại.')
    }finally{lock.current=false;setBusy(false)}
  }
  return <section aria-label="Chấm công cá nhân" className="space-y-2 rounded-md border p-3">
    <h3 className="text-sm font-semibold">Chấm công ca của tôi · {role}</h3>
    <p className="text-xs text-muted-foreground">Thời gian do server ghi nhận. Chưa phải giờ công được duyệt hoặc tiền lương.</p>
    {!ready&&!snapshot?.error?<p role="status" className="text-xs">Đang kiểm tra nhật ký...</p>:null}
    {snapshot?.key===key&&snapshot.error?<p role="alert" className="text-xs text-red-600">{snapshot.error}</p>:null}
    {checkedIn?<p className="text-xs">Check-in: {displayTime(checkedIn.recorded_at)}</p>:null}
    {checkedOut?<p className="text-xs">Check-out: {displayTime(checkedOut.recorded_at)}</p>:null}
    {checkedIn?<p className="text-xs text-amber-700">Đang chờ đối chiếu và duyệt giờ công</p>:null}
    {writeError?<p role="alert" className="text-xs text-red-600">{writeError}</p>:null}
    <div className="flex gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setNonce(v=>v+1)}>Tải lại</Button>
      {nextAction?<Button type="button" size="sm" disabled={busy} onClick={()=>void submit(nextAction)}>
        {busy?'Đang ghi nhận...':nextAction==='check_in'?'Check-in':'Check-out'}
      </Button>:null}
    </div>
  </section>
}
