'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

type Correction = {
  id:string; shift_id:string; role:'host'|'support'|'technical'; event:'check_in'|'check_out'
  recorded_at:string; version:number; evidence_revision:number; correction_requested_by:string|null
}

export function AttendanceCorrectionPanel({shiftId}:{shiftId:string}) {
  const {language}=useTranslation()
  const en=language==='en'
  const [rows,setRows]=React.useState<Correction[]>([])
  const [busy,setBusy]=React.useState<string|null>(null)
  const [error,setError]=React.useState('')
  const [files,setFiles]=React.useState<Record<string,File>>({})
  const requestIds=React.useRef<Partial<Record<string,string>>>({})
  const selectedFiles=React.useRef<Partial<Record<string,File>>>({})

  const load=React.useCallback(async(signal?:AbortSignal)=>{
    try {
      const response=await fetch('/api/workforce/attendance-photo-review?shift_id='+encodeURIComponent(shiftId),{cache:'no-store',signal})
      if(response.status===404){setRows([]);setError('');return}
      const body=await response.json()
      if(!response.ok||body.ok!==true)throw new Error(body.error?.code??'ATTENDANCE_CORRECTION_UNAVAILABLE')
      setRows(body.corrections??[]);setError('')
    } catch(cause) { if(!signal?.aborted)setError(cause instanceof Error?cause.message:'ATTENDANCE_CORRECTION_UNAVAILABLE') }
  },[shiftId])

  React.useEffect(()=>{
    const controller=new AbortController()
    const timer=window.setTimeout(()=>void load(controller.signal),0)
    return ()=>{window.clearTimeout(timer);controller.abort()}
  },[load])

  const submit=async(row:Correction)=>{
    const file=files[row.id]
    if(!file||busy)return
    const key=row.id
    setBusy(key);setError('')
    requestIds.current[key]??=crypto.randomUUID()
    try {
      const data=new FormData()
      data.set('shift_id',row.shift_id);data.set('role',row.role);data.set('event_kind',row.event)
      data.set('request_id',requestIds.current[key]);data.set('correction_event_id',row.id)
      data.set('capture_source','file_picker');data.set('file',file)
      const response=await fetch('/api/workforce/self-attendance-photo',{method:'POST',body:data,cache:'no-store'})
      const body=await response.json()
      if(!response.ok||body.ok!==true)throw new Error(body.error?.code??'ATTENDANCE_CORRECTION_FAILED')
      delete requestIds.current[key]
      setFiles(value=>{const next={...value};delete next[key];return next})
      await load()
    } catch(cause) { setError(cause instanceof Error?cause.message:'ATTENDANCE_CORRECTION_FAILED') }
    finally {setBusy(null)}
  }

  if(!rows.length&&!error)return null
  return <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-3" aria-label={en?'Requested attendance corrections':'Ảnh chấm công cần bổ sung'} data-testid="attendance-correction-panel">
    <h4 className="text-sm font-semibold">{en?'Requested attendance corrections':'Yêu cầu bổ sung ảnh chấm công'}</h4>
    {error&&<div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-rose-700"><span>{error}</span><Button type="button" size="sm" variant="outline" onClick={()=>void load()}>{en?'Retry':'Thử lại'}</Button></div>}
    {rows.map(row=><article key={row.id} className="space-y-2 rounded border bg-white p-3" data-testid={`attendance-correction-${row.id}`}>
      <p className="text-xs font-medium">{row.role.toUpperCase()} · {row.event==='check_in'?'Check-in':'Check-out'} · v{row.version}</p>
      <p className="text-xs text-muted-foreground">{row.correction_requested_by}</p>
      <label className="block text-xs font-medium">
        {en?'Replacement photo (JPG, PNG or WebP, max 4 MB)':'Ảnh thay thế (JPG, PNG hoặc WebP, tối đa 4 MB)'}
        <input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
          onChange={event=>{const file=event.target.files?.[0];if(file){if(selectedFiles.current[row.id]!==file){requestIds.current[row.id]=crypto.randomUUID();selectedFiles.current[row.id]=file}setFiles(value=>({...value,[row.id]:file}))}}} />
      </label>
      <Button type="button" disabled={!files[row.id]||Boolean(busy)} onClick={()=>void submit(row)}>
        {busy===row.id?(en?'Uploading…':'Đang gửi…'):(en?'Submit correction':'Gửi ảnh bổ sung')}
      </Button>
      <p className="text-xs text-muted-foreground">{en?'The original photo remains immutable; this creates a new evidence revision and does not change work time or pay.':'Ảnh gốc được giữ nguyên; ảnh này tạo phiên bản minh chứng mới, không thay đổi giờ công hoặc tiền lương.'}</p>
    </article>)}
  </section>
}
