'use client'
import * as React from 'react'
import { Button } from '@/components/ui/button'

type Line={
  line_id:string;shift_id:string;shift_date:string;shift_title:string|null;operational_role:string
  actual_start_at:string;actual_end_at:string;actual_minutes:number;payable_minutes:number
  overtime_minutes:number;rate_vnd_per_hour:number;gross_vnd:number;adjustment_vnd:number
  adjustment_reason:string|null;net_vnd:number;attendance_review:'approved'
}
type Statement={period_id:string;period_start:string;period_end:string;status:'locked';locked_at:string;lines:Line[];total_net_vnd:number}
type PayslipResponse={ok:true;scope:'own_locked_only';statements:Statement[];limited_to:12}
const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+' đ'
function decode(value:unknown):PayslipResponse {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('PAYSLIP_RESPONSE_INVALID')
  const v=value as Record<string,unknown>
  if(v.ok!==true||v.scope!=='own_locked_only'||!Array.isArray(v.statements)||v.statements.length>12)
    throw new Error('PAYSLIP_RESPONSE_INVALID')
  for(const item of v.statements){
    if(!item||item.status!=='locked'||!Array.isArray(item.lines)||item.lines.length>200||
      !Number.isSafeInteger(item.total_net_vnd))throw new Error('PAYSLIP_RESPONSE_INVALID')
    if(item.lines.some((l:Line)=>!l||l.attendance_review!=='approved'||!Number.isSafeInteger(l.net_vnd)))
      throw new Error('PAYSLIP_RESPONSE_INVALID')
    if(item.lines.reduce((n:number,l:Line)=>n+l.net_vnd,0)!==item.total_net_vnd)
      throw new Error('PAYSLIP_TOTAL_MISMATCH')
  }
  return v as unknown as PayslipResponse
}
export function MyPayslipPanel() {
  const [year,setYear]=React.useState(()=>String(new Date().getFullYear()))
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
  return <main className="mx-auto max-w-5xl space-y-5 p-4 md:p-6" aria-label="Phiếu lương của tôi">
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
    {!current?<p role="status">Đang đọc dữ liệu bảng lương đã khóa...</p>:null}
    {current?.error?<div role="alert" className="rounded-md border p-3 text-sm">Không thể đọc phiếu lương: {current.error}. Vui lòng kiểm tra quyền truy cập hoặc liên hệ Admin.</div>:null}
    {current?.data?.statements.length===0?<p className="rounded-md border p-4 text-sm">Chưa có kỳ lương đã khóa cho năm này. Điều này không đồng nghĩa chưa phát sinh giờ làm hoặc mức lương bằng 0.</p>:null}
    {current?.data?.statements.map(statement=><section key={statement.period_id} className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Kỳ {statement.period_start} đến {statement.period_end}</h2>
          <p className="text-xs text-muted-foreground">Đã khóa, dữ liệu chính thức theo kỳ</p></div>
        <p className="font-semibold">{money(statement.total_net_vnd)}</p>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-xs">
        <thead><tr className="border-b"><th className="p-2">Ngày / ca</th><th className="p-2">Vai trò</th><th className="p-2">Giờ duyệt (phút)</th><th className="p-2">Đơn giá giờ</th><th className="p-2">Tăng ca</th><th className="p-2">Điều chỉnh</th><th className="p-2">Thành tiền</th></tr></thead>
        <tbody>{statement.lines.map(line=><tr key={line.line_id} className="border-b">
          <td className="p-2">{line.shift_date} · {line.shift_title||line.shift_id}</td>
          <td className="p-2">{line.operational_role}</td><td className="p-2">{line.payable_minutes}</td>
          <td className="p-2">{money(line.rate_vnd_per_hour)}</td>
          <td className="p-2">{line.overtime_minutes} phút</td>
          <td className="p-2">{money(line.adjustment_vnd)}{line.adjustment_reason?' · '+line.adjustment_reason:''}</td>
          <td className="p-2 font-medium">{money(line.net_vnd)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
    <p className="text-xs text-muted-foreground">Chỉ hiển thị tối đa 12 kỳ lương đã khóa gần nhất. Mọi điều chỉnh phải có lý do và được xử lý theo quy trình duyệt độc lập. Không có cơ chế trừ phạt tự động tại đây.</p>
  </main>
}
