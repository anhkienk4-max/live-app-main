'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'

type Line={
  line_id:string;shift_id:string;shift_date:string;shift_title:string|null;operational_role:string
  actual_start_at:string;actual_end_at:string;actual_minutes:number;payable_minutes:number
  actual_seconds:number|null;payable_seconds:number|null;overtime_seconds:number|null
  overtime_request_id:string|null;overtime_day_class:'weekday'|'weekend'|'holiday'|null;overtime_time_class:'day'|'night'|null
  overtime_minutes:number;rate_vnd_per_hour:number;gross_vnd:number;adjustment_vnd:number
  adjustment_reason:string|null;net_vnd:number;attendance_review:'approved'
}
type Compensation={id:string;compensation_case_id:string;staff_id:string;operational_role:string;amount_vnd:number;reason:string;confirmed_by:string;shift_id:string|null}
type Statement={period_id:string;period_start:string;period_end:string;status:'locked';locked_at:string;lines:Line[];compensation_adjustments:Compensation[];total_net_vnd:number}
type PayslipResponse={ok:true;scope:'own_locked_only';statements:Statement[];limited_to:12;compensation_available:boolean}
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' đ'
const duration=(seconds:number|null,minutes:number)=>seconds===null?`${minutes} phút`:
  `${Math.floor(seconds/3600)} giờ ${Math.floor(seconds%3600/60)} phút ${seconds%60} giây`
const intervalPartFormatter=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'})
function actualInterval(start:string,end:string){
  const parts=(value:string)=>{
    const date=new Date(value)
    if(Number.isNaN(date.getTime()))return null
    const values=Object.fromEntries(intervalPartFormatter.formatToParts(date).map(part=>[part.type,part.value]))
    return {date:`${values.day}/${values.month}/${values.year}`,time:`${values.hour}:${values.minute}:${values.second}`}
  }
  const from=parts(start),to=parts(end)
  if(!from||!to)return '—'
  return from.date===to.date?`${from.date} · ${from.time} – ${to.time}`:`${from.date} ${from.time} – ${to.date} ${to.time}`
}
const roleLabel=(role:string)=>({host:'Host',support:'Trợ',technical:'Kỹ thuật'}[role]??role)
function decode(value:unknown):PayslipResponse {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PAYSLIP_RESPONSE_INVALID')
  const v=value as Record<string,unknown>
  if(v.ok!==true||v.scope!=='own_locked_only'||typeof v.compensation_available!=='boolean'||!Array.isArray(v.statements)||v.statements.length>12)
    throw new Error('PAYSLIP_RESPONSE_INVALID')
  for(const item of v.statements){
    if(!item||item.status!=='locked'||!Array.isArray(item.lines)||item.lines.length>200||
      !Number.isSafeInteger(item.total_net_vnd))throw new Error('PAYSLIP_RESPONSE_INVALID')
    if(item.lines.some((l:Line)=>!l||l.attendance_review!=='approved'||!Number.isSafeInteger(l.net_vnd)||
      ![l.actual_seconds,l.payable_seconds,l.overtime_seconds].every(v=>v===null||Number.isSafeInteger(v))))
      throw new Error('PAYSLIP_RESPONSE_INVALID')
    if(!Array.isArray(item.compensation_adjustments)||item.compensation_adjustments.some((a:Compensation)=>
      !a||!Number.isSafeInteger(a.amount_vnd)||a.amount_vnd<1||typeof a.reason!=='string'||!a.reason.trim()))
      throw new Error('PAYSLIP_COMPENSATION_INVALID')
    if(item.lines.reduce((n:number,l:Line)=>n+l.net_vnd,0)+item.compensation_adjustments.reduce((n:number,a:Compensation)=>n+a.amount_vnd,0)!==item.total_net_vnd)
      throw new Error('PAYSLIP_TOTAL_MISMATCH')
  }
  return v as unknown as PayslipResponse
}
export function MyPayslipPanel() {
  const [year,setYear]=React.useState(()=>String(new Date().getFullYear()))
  const [selection,setSelection]=React.useState<{year:string;id:string}|null>(null)
  const [revision,reload]=React.useReducer((n:number)=>n+1,0)
  const [result,setResult]=React.useState<{key:string;data:PayslipResponse|null;error:string|null}|null>(null)
  const scope=year+':'+revision
  React.useEffect(()=>{
    if(!/^20[2-9][0-9]$/.test(year))return
    const controller=new AbortController()
    void fetch('/api/workforce/my-payslip?year='+encodeURIComponent(year),{
      method:'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    }).then(async res=>{
      const body:unknown=await res.json()
      if(!res.ok){
        const code=body&&typeof body==='object'&&'error' in body?String((body as {error?:{code?:string}}).error?.code??'PAYSLIP_UNAVAILABLE'):'PAYSLIP_UNAVAILABLE'
        throw new Error(code)
      }
      return decode(body)
    }).then(data=>{if(!controller.signal.aborted)setResult({key:scope,data,error:null})})
      .catch(error=>{if(!controller.signal.aborted)setResult({key:scope,data:null,error:error instanceof Error?error.message:'PAYSLIP_UNAVAILABLE'})})
    return()=>controller.abort()
  },[scope,year])
  const current=result?.key===scope?result:null
  const validYear=/^20[2-9][0-9]$/.test(year)
  const statements=current?.data?.statements ?? []
  const selected=statements.find(s=>selection?.year===year && s.period_id===selection.id) ?? statements[0]
  return <section className="mx-auto max-w-5xl space-y-5 p-4 pb-24 md:p-6" aria-label="Phiếu lương của tôi">
    <header className="space-y-1"><h1 className="text-xl font-semibold">Phiếu lương của tôi</h1>
      <p className="text-sm text-muted-foreground">Chỉ hiển thị kỳ đã khóa và số liệu của chính tài khoản đang đăng nhập. Chấm công chờ duyệt không được tính thành lương.</p>
    </header>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">Năm
        <input className="mt-1 block w-28 rounded-md border p-2" aria-label="Năm phiếu lương" type="number" min="2020" max="2099"
          value={year} onChange={e=>setYear(e.target.value)} />
      </label>
      <Button type="button" variant="outline" disabled={!/^20[2-9][0-9]$/.test(year)} onClick={()=>reload()}>Tải lại</Button>
    </div>
    {!validYear?<p role="alert">Vui lòng nhập năm từ 2020 đến 2099.</p>:null}
    {validYear&&!current?<p role="status">Đang đọc dữ liệu bảng lương đã khóa...</p>:null}
    {current?.error?<div role="alert" className="rounded-md border p-3 text-sm">Không thể đọc phiếu lương: {current.error}. Vui lòng kiểm tra quyền truy cập hoặc liên hệ Admin.</div>:null}
    {current?.data?.statements.length===0?<p className="rounded-md border p-4 text-sm">Chưa có phiếu lương được phát hành cho năm này. Chưa có kỳ lương đã khóa; điều này không đồng nghĩa chưa phát sinh giờ làm hoặc mức lương bằng 0.</p>:null}
    {selected?<label className="block text-sm font-medium">Kỳ lương
      <select aria-label="Kỳ lương" className="mt-1 block max-w-full rounded-md border p-2" value={selected.period_id} onChange={e=>setSelection({year,id:e.target.value})}>
        {statements.map(s=><option key={s.period_id} value={s.period_id}>{s.period_start} — {s.period_end}</option>)}
      </select>
    </label>:null}
    {selected?<section key={selected.period_id} className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Kỳ {selected.period_start} đến {selected.period_end}</h2>
          <p className="text-xs text-muted-foreground">Đã khóa, dữ liệu chính thức theo kỳ</p></div>
        <p className="font-semibold">{money(selected.total_net_vnd)}</p>
      </div>
      {!current?.data?.compensation_available?<p role="status" className="text-xs text-amber-700">Danh sách hỗ trợ hủy ca chưa sẵn sàng ở môi trường này; tổng phiếu lương chỉ gồm các dòng lương hiện có.</p>:null}
      {selected.lines.length>0 ? (
        <>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[720px] text-left text-xs">
            <thead><tr className="border-b"><th className="p-2">Ngày / ca</th><th className="p-2">Vai trò</th><th className="p-2">Giờ thực tế / phút tính lương</th><th className="p-2">Đơn giá giờ</th><th className="p-2">Tăng ca</th><th className="p-2">Tiền ca</th><th className="p-2">Điều chỉnh</th><th className="p-2">Thành tiền</th></tr></thead>
            <tbody>{selected.lines.map(line=><tr key={line.line_id} className="border-b">
              <td className="p-2">{line.shift_date} · {line.shift_title||line.shift_id}</td>
              <td className="p-2">{roleLabel(line.operational_role)}</td><td className="p-2">{actualInterval(line.actual_start_at,line.actual_end_at)}<br />{duration(line.actual_seconds,line.actual_minutes)} thực tế / {duration(line.payable_seconds,line.payable_minutes)} tính lương</td>
              <td className="p-2">{money(line.rate_vnd_per_hour)}</td>
              <td className="p-2">{duration(line.overtime_seconds,line.overtime_minutes)}</td>
              <td className="p-2">{money(line.gross_vnd)}</td>
              <td className="p-2">{money(line.adjustment_vnd)}{line.adjustment_reason?' · '+line.adjustment_reason:''}</td>
              <td className="p-2 font-medium">{money(line.net_vnd)}{line.overtime_request_id?<small className="block text-slate-500">OT {line.overtime_day_class}/{line.overtime_time_class}</small>:null}</td>
            </tr>)}</tbody>
          </table></div>
          <ul className="space-y-3 lg:hidden" aria-label="Các ca trong phiếu lương">
            {selected.lines.map(line=><li key={line.line_id} className="rounded-md border p-3 text-xs">
              <h3 className="font-semibold">{line.shift_date} · {line.shift_title||line.shift_id}</h3>
              <p className="mt-1 text-muted-foreground">{roleLabel(line.operational_role)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <div><dt className="text-muted-foreground">Giờ thực tế</dt><dd>{actualInterval(line.actual_start_at,line.actual_end_at)}</dd></div>
                <div><dt className="text-muted-foreground">Thời lượng</dt><dd>{duration(line.actual_seconds,line.actual_minutes)} thực tế</dd><dd>{duration(line.payable_seconds,line.payable_minutes)} tính lương</dd></div>
                <div><dt className="text-muted-foreground">Đơn giá</dt><dd>{money(line.rate_vnd_per_hour)}</dd></div>
                <div><dt className="text-muted-foreground">Tăng ca</dt><dd>{duration(line.overtime_seconds,line.overtime_minutes)}{line.overtime_request_id?` · ${line.overtime_day_class}/${line.overtime_time_class}`:''}</dd></div>
                <div><dt className="text-muted-foreground">Tiền ca</dt><dd>{money(line.gross_vnd)}</dd></div>
                <div><dt className="text-muted-foreground">Điều chỉnh</dt><dd>{money(line.adjustment_vnd)}{line.adjustment_reason?' · '+line.adjustment_reason:''}</dd></div>
              </dl>
              <p className="mt-3 border-t pt-2 font-semibold">Thành tiền <span className="float-right">{money(line.net_vnd)}</span></p>
            </li>)}
          </ul>
        </>
      ) : (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Không có ca làm việc trong kỳ (chỉ phát sinh hỗ trợ hủy ca).</p>
      )}
      {selected.compensation_adjustments.length>0?<section aria-label="Điều chỉnh hỗ trợ hủy ca" className="space-y-2">
        <h3 className="text-sm font-semibold">Hỗ trợ hủy ca đã Admin xác nhận</h3>
        <ul className="divide-y rounded-md border text-sm">{selected.compensation_adjustments.map(item=><li key={item.id} className="flex flex-wrap justify-between gap-2 p-3">
          <span>{item.shift_id??'Ca đã hủy'} · {item.operational_role} · {item.reason}</span><strong>{money(item.amount_vnd)}</strong>
        </li>)}</ul>
      </section>:null}
    </section>:null}
    <p className="text-xs text-muted-foreground">Chỉ hiển thị tối đa 12 kỳ lương đã khóa gần nhất. Mọi điều chỉnh phải có lý do và được xử lý theo quy trình duyệt độc lập. Không có cơ chế trừ phạt tự động tại đây.</p>
  </section>
}
