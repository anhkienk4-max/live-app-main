'use client'

import * as React from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { workforceService, workforceErrorMessage, type CancellationCompensationCase } from '@/lib/services/workforceService'
import { formatCurrency } from '@/lib/utils/currency'

const pageSize=25

export function CancellationCompensationPanel() {
  const [filters,setFilters]=React.useState({dateFrom:'',dateTo:'',brandId:'',staffId:'',state:'',reason:''})
  const [applied,setApplied]=React.useState(filters)
  const [page,setPage]=React.useState(1)
  const [result,setResult]=React.useState<Awaited<ReturnType<typeof workforceService.listCancellationCompensationCases>>|null>(null)
  const [loading,setLoading]=React.useState(false)
  const [error,setError]=React.useState<string|null>(null)
  const [amounts,setAmounts]=React.useState<Record<string,string>>({})
  const [reasons,setReasons]=React.useState<Record<string,string>>({})
  const [submitting,setSubmitting]=React.useState<string|null>(null)
  const [actionError,setActionError]=React.useState<Record<string,string>>({})
  const intents=React.useRef(new Map<string,{amount:number;reason:string;key:string;version:number}>())
  const sequence=React.useRef(0)

  const load=React.useCallback(async()=>{
    const current=++sequence.current
    setLoading(true);setError(null)
    try {
      const response=await workforceService.listCancellationCompensationCases({
        dateFrom:applied.dateFrom||undefined,dateTo:applied.dateTo||undefined,
        brandId:applied.brandId||undefined,staffId:applied.staffId.trim()||undefined,
        state:(applied.state||undefined) as CancellationCompensationCase['state']|undefined,
        reason:applied.reason.trim()||undefined,page,pageSize,
      })
      if(current===sequence.current)setResult(response)
    } catch (cause) {
      if(current===sequence.current)setError(workforceErrorMessage(cause))
    } finally { if(current===sequence.current)setLoading(false) }
  },[applied,page])

  React.useEffect(()=>{void load()},[load])

  const editProposal=async(item:CancellationCompensationCase)=>{
    const amount=Number(amounts[item.id])
    const reason=reasons[item.id]?.trim()??''
    if(!Number.isSafeInteger(amount)||amount<1||amount>1_000_000_000_000||reason.length<8){
      setActionError(value=>({...value,[item.id]:'Nhập số tiền VND hợp lệ và lý do tối thiểu 8 ký tự.'}));return
    }
    const previous=intents.current.get(item.id)
    const intent=previous??{amount,reason,key:crypto.randomUUID(),version:item.version}
    if(previous&&(previous.amount!==amount||previous.reason!==reason||previous.version!==item.version)){
      setActionError(value=>({...value,[item.id]:'Retry phải dùng nguyên nội dung đã gửi. Tải lại và đối chiếu lịch sử trước khi gửi đề xuất mới.'}));return
    }
    intents.current.set(item.id,intent);setSubmitting(item.id);setActionError(value=>({...value,[item.id]:''}))
    try {
      await workforceService.decideCancellationCompensation({caseId:item.id,expectedVersion:item.version,
        decision:'edit',reason,newAmountVnd:amount,idempotencyKey:intent.key})
      intents.current.delete(item.id)
      setAmounts(value=>({...value,[item.id]:''}));setReasons(value=>({...value,[item.id]:''}))
      await load()
    } catch (cause) {
      setActionError(value=>({...value,[item.id]:workforceErrorMessage(cause)}))
    } finally { setSubmitting(null) }
  }

  const apply=()=>{setPage(1);setApplied({...filters})}
  return <section aria-label="Danh sách ngoại lệ hỗ trợ hủy ca" className="space-y-4 rounded-lg border border-amber-200 bg-white p-4">
    <div>
      <h2 className="text-base font-semibold text-slate-900">Đề xuất hỗ trợ khi Brand/ADA hủy ca</h2>
      <p className="mt-1 text-xs text-slate-600">Chỉ xem các Brand được cấp quyền. Giờ thực tế đã duyệt vẫn được giữ; thời gian chưa làm không tự phát sinh lương. Leader chỉ đề xuất hoặc chỉnh đề xuất, Admin mới xác nhận khoản hỗ trợ.</p>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Input aria-label="Từ ngày hủy ca" type="date" value={filters.dateFrom} onChange={e=>setFilters(v=>({...v,dateFrom:e.target.value}))}/>
      <Input aria-label="Đến ngày hủy ca" type="date" value={filters.dateTo} onChange={e=>setFilters(v=>({...v,dateTo:e.target.value}))}/>
      <select aria-label="Brand hủy ca" value={filters.brandId} onChange={e=>setFilters(v=>({...v,brandId:e.target.value}))} className="rounded-md border bg-white px-3 py-2 text-sm">
        <option value="">Tất cả Brand được cấp</option>{(result?.brand_ids??Array.from(new Set(result?.cases.map(row=>row.shift.brand_id)??[]))).map(value=><option key={value} value={value}>{value}</option>)}
      </select>
      <Input aria-label="Nhân sự hủy ca" placeholder="Staff ID" value={filters.staffId} onChange={e=>setFilters(v=>({...v,staffId:e.target.value}))}/>
      <select aria-label="Trạng thái đề xuất hỗ trợ" value={filters.state} onChange={e=>setFilters(v=>({...v,state:e.target.value}))} className="rounded-md border bg-white px-3 py-2 text-sm">
        <option value="">Tất cả trạng thái</option><option value="pending_admin_confirmation">Chờ Admin</option><option value="admin_confirmed">Đã xác nhận</option><option value="rejected">Từ chối</option>
      </select>
      <Input aria-label="Lý do hỗ trợ" placeholder="Tìm theo lý do đề xuất" value={filters.reason} onChange={e=>setFilters(v=>({...v,reason:e.target.value}))}/>
    </div>
    <div className="flex gap-2"><Button type="button" size="sm" onClick={apply}>Lọc</Button><Button type="button" size="sm" variant="outline" onClick={()=>void load()} disabled={loading}>Làm mới</Button></div>
    {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}
    {loading&&!result?<p role="status" className="text-sm text-slate-500">Đang tải danh sách…</p>:null}
    {result&&<>
      <ul className="space-y-3">
        {result.cases.map(item=><li key={item.id} className="rounded-md border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-semibold">{item.shift.date} · {item.shift.title||item.shift.id} · {item.operational_role}</p>
              <p className="text-xs text-slate-600">Brand {item.shift.brand_id} · Agency {item.shift.agency_code??'—'} · Staff {item.staff_id}</p></div>
            <span className="rounded bg-amber-50 px-2 py-1 text-xs">{item.state==='pending_admin_confirmation'?'Chờ Admin':item.state==='admin_confirmed'?'Admin đã xác nhận':'Từ chối'}</span>
          </div>
          <p className="mt-2">Actual được duyệt: {item.actual_seconds}s · Tiền công thực tế: {item.actual_earnings_vnd === null ? 'chưa có dòng lương được duyệt' : `${formatCurrency(item.actual_earnings_vnd)} VND`} · Đề xuất hỗ trợ: {formatCurrency(item.proposed_amount_vnd)} VND</p>
          <p className="text-xs text-slate-600">Lý do hủy: {item.cancellation_reason} · Lý do đề xuất: {item.reason}</p>
          <div className="mt-1 flex flex-wrap gap-3 text-xs">
            <a className="text-blue-700 underline" href={`/api/operational-files?file_id=${encodeURIComponent(item.evidence_receipt_id)}`} target="_blank" rel="noreferrer">Mở bằng chứng đã lưu</a>
            <Link className="text-blue-700 underline" href={`/calendar?calendar_view=day&date=${encodeURIComponent(item.shift.date)}`}>Mở ngày ca</Link>
          </div>
          <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Lịch sử thay đổi ({item.history?.length??0})</summary>
            <ol className="mt-2 space-y-1 text-xs text-slate-600">{(item.history??[]).map(event=><li key={event.id}>{new Date(event.created_at).toLocaleString()} · {event.action} · {event.actor_id} · {formatCurrency(event.amount_vnd)} VND · {event.reason}</li>)}</ol>
          </details>
          {item.state==='pending_admin_confirmation'&&<div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto]">
            <Input aria-label={`Số tiền đề xuất ${item.staff_id}`} inputMode="numeric" type="number" min={1} step={1} value={amounts[item.id]??''} onChange={e=>setAmounts(v=>({...v,[item.id]:e.target.value}))} placeholder="VND"/>
            <Textarea aria-label={`Lý do chỉnh đề xuất ${item.staff_id}`} rows={2} minLength={8} maxLength={2000} value={reasons[item.id]??''} onChange={e=>setReasons(v=>({...v,[item.id]:e.target.value}))} placeholder="Lý do chỉnh, tối thiểu 8 ký tự"/>
            <Button type="button" size="sm" disabled={submitting===item.id} onClick={()=>void editProposal(item)}>{submitting===item.id?'Đang gửi…':'Cập nhật đề xuất'}</Button>
            {actionError[item.id]&&<p role="alert" className="text-xs text-rose-700 sm:col-span-3">{actionError[item.id]}</p>}
          </div>}
        </li>)}
        {result.cases.length===0&&<li className="text-sm text-slate-600">Không có đề xuất phù hợp bộ lọc.</li>}
      </ul>
      <div className="flex items-center justify-between text-xs text-slate-600"><span>{result.pagination.total_count} hồ sơ · trang {result.pagination.page}/{Math.max(1,result.pagination.total_pages)}</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={!result.pagination.has_previous||loading} onClick={()=>setPage(v=>Math.max(1,v-1))}>Trước</Button><Button size="sm" variant="outline" disabled={!result.pagination.has_next||loading} onClick={()=>setPage(v=>v+1)}>Tiếp</Button></div>
      </div>
    </>}
  </section>
}
