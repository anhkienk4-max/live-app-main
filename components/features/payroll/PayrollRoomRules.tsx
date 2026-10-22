'use client'

import * as React from 'react'
import { ClipboardCheck, AlertTriangle, ShieldCheck, FileClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/utils/currency'
import type { PayrollPeriod } from '@/lib/services/workforceService'
import {
  ADA_ROOM_RULES_EFFECTIVE_DATE, ADA_ROOM_RULES_VERSION, proposeAdaRoomRule,
  summarizeAdaRoomRecurrence, type LiveKind, type LiveRole,
  type RoomRuleCode, type RoomRuleProposal,
} from '@/lib/workforce/adaRoomRulebook'

const cases: Array<{ value: RoomRuleCode; label: string }> = [
  {value:'lateness',label:'Đi trễ mốc check-in'}, {value:'checkin_or_outfit_missing',label:'Thiếu check-in hoặc ảnh outfit'},
  {value:'checkout_or_recap_missing',label:'Thiếu check-out / hình report'}, {value:'outfit_not_corrected',label:'Outfit không khắc phục'},
  {value:'conduct',label:'Tác phong ảnh hưởng phiên live'}, {value:'personal_work',label:'Làm việc riêng trong ca'},
  {value:'general',label:'Vi phạm nội quy chung'}, {value:'cancel_or_no_show',label:'Hủy / bỏ ca'},
  {value:'false_report',label:'Report cố tình sai sự thật'}, {value:'verified_report_reward',label:'Thưởng report đã xác minh'},
  {value:'damage',label:'Hỏng tài sản / thiết bị'}, {value:'confidentiality',label:'Lộ thông tin bảo mật'},
  {value:'cover_up',label:'Bao che vi phạm'},
]
const statusLabels: Record<RoomRuleProposal['state'],string> = {
  proposed:'Đề xuất cần phê duyệt', no_violation:'Không có vi phạm theo dữ liệu nhập',
  needs_evidence:'Thiếu bằng chứng', outside_policy:'Ngoài thời hạn hiệu lực',
  manual_review:'Cần xử lý thủ công',
}
const localStamp = (input: string): string | undefined =>
  input ? (/:\\d{2}:\\d{2}$/.test(input) ? input : input + ':00') + '+07:00' : undefined

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
    <span>{label}</span>{children}
  </label>
}
const selectStyle = 'h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900'

/**
 * Review-only case calculator. Never submits to /api/workforce/payroll or
 * persists a penalty; the existing independently approved payroll flow is
 * deliberately untouched. An approved lawful case ledger is a separate gate.
 */
export function PayrollRoomRules({ period }: { period: PayrollPeriod | null }) {
  const [rule,setRule] = React.useState<RoomRuleCode>('lateness')
  const [role,setRole] = React.useState<LiveRole>('host')
  const [kind,setKind] = React.useState<LiveKind>('daily')
  const [date,setDate] = React.useState('')
  const [shiftFee,setShiftFee] = React.useState('')
  const [liveStart,setLiveStart] = React.useState('')
  const [checkin,setCheckin] = React.useState('')
  const [airDelayed,setAirDelayed] = React.useState(false)
  const [incidentNumber,setIncidentNumber] = React.useState('1')
  const [notice,setNotice] = React.useState('')
  const [replacement,setReplacement] = React.useState(false)
  const [campaignPassHours,setCampaignPassHours] = React.useState('')
  const [verifiedReporter,setVerifiedReporter] = React.useState(false)
  const [verifiedFine,setVerifiedFine] = React.useState('')
  const [forceMajeure,setForceMajeure] = React.useState(false)
  const [monthIncidents,setMonthIncidents] = React.useState('0')
  const [campaignLate,setCampaignLate] = React.useState('0')
  const [noShows,setNoShows] = React.useState('0')
  const [proposal,setProposal] = React.useState<RoomRuleProposal | null>(null)
  const [recurrence,setRecurrence] = React.useState<string[] | null>(null)

  const resetProposal = () => setProposal(null)
  const input = (value: string, setter: (value:string)=>void) => ({
    value, onChange: (e:React.ChangeEvent<HTMLInputElement>) => { setter(e.target.value); resetProposal() },
  })

  const evaluate = () => {
    setProposal(proposeAdaRoomRule({
      rule, role, liveKind:kind, shiftDate:date,
      shiftFeeVnd:shiftFee===''?undefined:Number(shiftFee),
      liveStartAt:localStamp(liveStart), groupCheckInAt:localStamp(checkin),
      airedLate:airDelayed, personalWorkOccurrence:Number(incidentNumber),
      cancellationNoticeHours:notice===''?undefined:Number(notice),
      replacementApproved:replacement,
      campaignPassApprovedHoursBefore:campaignPassHours===''?undefined:Number(campaignPassHours),
      firstVerifiedReporter:verifiedReporter,
      reviewedCaseAmountVnd:verifiedFine===''?undefined:Number(verifiedFine),
      forceMajeureApproved:forceMajeure,
    }))
  }

  const evaluateRecurrence = () => {
    try {
      setRecurrence(summarizeAdaRoomRecurrence({
        totalConfirmedIncidents:Number(monthIncidents),
        confirmedCampaignLate:Number(campaignLate),
        confirmedUnannouncedNoShows:Number(noShows),
      }).proposals)
    } catch { setRecurrence(['Các bộ đếm phải là số nguyên không âm đã được xác minh.']) }
  }

  return <div className="space-y-5" data-testid="payroll-room-rules">
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base font-semibold">Nội quy phòng live & đối soát case</h2>
        <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{ADA_ROOM_RULES_VERSION}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        Hiệu lực {ADA_ROOM_RULES_EFFECTIVE_DATE}. Áp dụng cho Host và Trợ live;
        Kỹ thuật xử lý theo quy định nội bộ riêng. {period
          ? 'Chu kỳ đang chọn: ' + period.period_start + ' → ' + period.period_end
          : 'Chưa chọn chu kỳ lương.'}
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Đây là <strong>công cụ tính đề xuất để đối soát, không phải quyết định trừ tiền</strong>.
          Chưa tạo case trên database, chưa cập nhật Payroll Line, chưa tác động Net/CSV khóa sổ.
          Với người lao động, phạt tiền hoặc cắt lương để xử lý kỷ luật bị cấm theo Điều 127 Bộ luật Lao động 2019.
          Chỉ thực hiện điều chỉnh thanh toán sau khi xác minh chứng cứ, tình trạng hợp đồng,
          căn cứ pháp lý và duyệt độc lập theo quy trình.
        </span>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-sm">Đánh giá một case</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Loại vi phạm / thưởng">
              <select aria-label="Loại case" className={selectStyle} value={rule}
                onChange={e=>{setRule(e.target.value as RoomRuleCode);resetProposal()}}>
                {cases.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Vai trò">
              <select aria-label="Vai trò nhân sự" className={selectStyle} value={role}
                onChange={e=>{setRole(e.target.value as LiveRole);resetProposal()}}>
                <option value="host">Host</option><option value="support">Trợ live</option>
              </select>
            </Field>
            <Field label="Loại ca">
              <select aria-label="Loại ca" className={selectStyle} value={kind}
                onChange={e=>{setKind(e.target.value as LiveKind);resetProposal()}}>
                <option value="daily">Daily</option><option value="campaign">Campaign</option>
              </select>
            </Field>
            <Field label="Ngày ca (không mặc định)">
              <Input type="date" aria-label="Ngày ca" {...input(date,setDate)} />
            </Field>
            <Field label="Tiền ca xác nhận (VND)">
              <Input type="number" min="0" max="1000000000000" step="1" placeholder="Không tự suy ra từ tiền giờ"
                aria-label="Tiền ca" {...input(shiftFee,setShiftFee)} />
            </Field>
            {rule==='lateness'&&<>
              <Field label="Giờ live dự kiến (giờ Việt Nam)">
                <Input type="datetime-local" aria-label="Giờ live" {...input(liveStart,setLiveStart)} />
              </Field>
              <Field label="Giờ gửi check-in trên group">
                <Input type="datetime-local" aria-label="Giờ check-in group" {...input(checkin,setCheckin)} />
              </Field>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={airDelayed} onChange={e=>{setAirDelayed(e.target.checked);resetProposal()}} />
                Xác minh phiên live air trễ do nhân sự
              </label>
            </>}
            {rule==='personal_work'&&<Field label="Lần vi phạm cùng nhân sự trong tháng">
              <Input type="number" min="1" step="1" aria-label="Số lần làm việc riêng" {...input(incidentNumber,setIncidentNumber)} />
            </Field>}
            {rule==='cancel_or_no_show'&&<>
              <Field label="Số giờ báo trước (dưới 3 giờ = bỏ ca)">
                <Input type="number" min="0" step="0.5" aria-label="Số giờ báo hủy" {...input(notice,setNotice)} />
              </Field>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={replacement} onChange={e=>{setReplacement(e.target.checked);resetProposal()}}/>
                Có người thay phù hợp và được vận hành đồng ý
              </label>
              {replacement&&kind==='campaign'&&<Field label="Số giờ đồng ý pass trước ca Campaign">
                <Input type="number" min="0" step="0.5" aria-label="Số giờ duyệt pass" {...input(campaignPassHours,setCampaignPassHours)}/>
              </Field>}
            </>}
            {rule==='verified_report_reward'&&<>
              <Field label="Số tiền case đã được duyệt (VND)">
                <Input type="number" min="0" step="1" aria-label="Giá trị case đã duyệt" {...input(verifiedFine,setVerifiedFine)}/>
              </Field>
              <label className="flex items-center gap-2 text-xs font-medium">
                <input type="checkbox" checked={verifiedReporter} onChange={e=>{setVerifiedReporter(e.target.checked);resetProposal()}}/>
                Người gửi report hợp lệ đầu tiên, đã xác minh
              </label>
            </>}
            <label className="flex items-center gap-2 text-xs font-medium sm:col-span-2">
              <input type="checkbox" checked={forceMajeure} onChange={e=>{setForceMajeure(e.target.checked);resetProposal()}}/>
              Hồ sơ bất khả kháng đã được xác minh (chuyển duyệt thủ công)
            </label>
          </div>
          <Button className="mt-4" onClick={evaluate} data-testid="evaluate-ada-rule">Tính đề xuất theo nội quy</Button>
        </CardContent>
      </Card>
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="text-sm">Kết quả và bằng chứng</CardTitle></CardHeader>
        <CardContent className="space-y-3" data-testid="ada-rule-result">
          {proposal ? <>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-xs text-slate-600">{statusLabels[proposal.state]}</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">
                {proposal.suggestedVnd === null ? 'Chưa thể tính' : formatCurrency(proposal.suggestedVnd)}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {proposal.direction==='review_bonus'?'Đề xuất thưởng; chưa cộng vào lương'
                  :proposal.direction==='review_deduction'?'Đề xuất theo nội quy; chưa trừ lương'
                  :'Không có khoản được áp dụng tự động'}
              </p>
              <p className="mt-2 text-sm">{proposal.basis}</p>
            </div>
            {proposal.warnings.map(w=><p key={w} className="text-xs text-amber-800">{w}</p>)}
            <p className="text-xs font-semibold text-slate-700">Bắt buộc xác minh</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
              {proposal.requiredEvidence.map(e=><li key={e}>{e}</li>)}
            </ul>
          </> : <p className="text-sm text-slate-500">
            Chọn loại case, nhập dữ liệu có bằng chứng và bấm tính.
            Không có khoản trừ tự động, không tạo dữ liệu giả.
          </p>}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><FileClock className="h-4 w-4" /> Kiểm tra tái phạm theo tháng</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-slate-600">Chỉ điền số case đã xác minh cho cùng nhân sự và tháng; đây là cảnh báo sắp lịch, không phải hành động tự động.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tổng lỗi đã xác minh"><Input aria-label="Tổng lỗi tháng" type="number" min="0" step="1" {...input(monthIncidents,setMonthIncidents)} /></Field>
            <Field label="Trễ Campaign"><Input aria-label="Số ca trễ Campaign" type="number" min="0" step="1" {...input(campaignLate,setCampaignLate)} /></Field>
            <Field label="Bỏ ca không báo"><Input aria-label="Số ca bỏ không báo" type="number" min="0" step="1" {...input(noShows,setNoShows)} /></Field>
          </div>
          <Button size="sm" variant="outline" className="mt-3" onClick={evaluateRecurrence}>Kiểm tra ngưỡng tái phạm</Button>
          {recurrence!==null&&<div className="mt-3 text-xs text-slate-700" role="status">
            {recurrence.length ? recurrence.map(t=><p key={t} className="mt-1">• {t}</p>) : 'Chưa đạt ngưỡng cảnh báo theo số liệu nhập.'}
          </div>}
        </CardContent>
      </Card>
      <Card className="border-slate-200">
        <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="h-4 w-4" /> Nguyên tắc nghiệm thu & đối soát</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs text-slate-700">
          <p><strong>Check-in:</strong> dùng timestamp tin nhắn group và 01 ảnh outfit. Host sớm 15 phút; Trợ sớm 30 phút.</p>
          <p><strong>Check-out:</strong> gửi trong 15 phút sau ca; Trợ nộp dashboard, visibility và up Drive. Thiếu report cần xử lý nghiệm thu riêng.</p>
          <p><strong>Report:</strong> gửi riêng trong 24 giờ, có ảnh/video/timecode; vận hành phản hồi trong 3 ngày làm việc, giữ kín danh tính.</p>
          <p><strong>Thưởng report:</strong> 50% giá trị case được duyệt, tối đa 70.000đ, chỉ người gửi hợp lệ đầu tiên.</p>
          <p><strong>Không cộng trùng:</strong> làm việc riêng thay thế phạt chung/tác phong nếu cùng hành vi; phạt check-in/out có thể cộng với đi trễ theo nội quy.</p>
          <p><strong>Phân quyền:</strong> case cần bằng chứng, đối soát độc lập và duyệt pháp lý trước khi tác động thù lao. Không tự động khóa lịch hoặc chấm dứt hợp tác.</p>
        </CardContent>
      </Card>
    </div>
  </div>
}
