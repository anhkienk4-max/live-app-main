'use client'

import * as React from 'react'
import { ADA_ROOM_RULES_CATALOG } from '@/lib/workforce/adaRoomRulesCatalog'
import { Input } from '@/components/ui/input'

/** Full six-section reference, separate from the monetary case calculator. */
export function PayrollRoomRulesCatalog() {
  const [search,setSearch]=React.useState('')
  const term=search.trim().toLocaleLowerCase('vi-VN')
  const sections=ADA_ROOM_RULES_CATALOG
    .map(section=>({
      ...section,items:!term?section.items:section.items.filter(item=>
        [section.title,item.title,...item.details].some(text=>
          text.toLocaleLowerCase('vi-VN').includes(term))),
    })).filter(section=>section.items.length>0)
  return <section data-testid="ada-full-rulebook" aria-labelledby="ada-rulebook-title"
    className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="ada-rulebook-title" className="text-sm font-semibold text-slate-900">Danh mục nội quy phòng livestream</h3>
        <p className="mt-1 text-xs text-slate-600">
          Phiên bản ADA-LIVE-2026-10-22, 6 mục I–VI; ban hành 21/10/2026, hiệu lực từ 22/10/2026. Mức đánh giá case dành cho Host và Trợ live trong ca Daily/Campaign từ ngày hiệu lực; Kỹ thuật theo quy định riêng. Mở từng mục để xem phạm vi và điều khoản.
        </p>
      </div>
      <div className="w-full sm:w-64">
        <Input aria-label="Tìm nội quy" placeholder="Tìm check-in, Host, Campaign, report…" value={search}
          onChange={e=>setSearch(e.target.value)}/>
      </div>
    </div>
    <div className="grid gap-2 lg:grid-cols-2">
      {sections.map(section=><details key={section.id}
        open={term?true:undefined} className="group min-w-0 rounded-md border border-slate-200 bg-slate-50/30 p-3"
        data-testid={'room-rule-section-'+section.id}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          {section.id}. {section.title}
        </summary>
        <div className="mt-3 space-y-3">
          {section.items.map(item=><div key={item.title}>
            <p className="text-xs font-semibold text-slate-800">{item.title}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5 text-slate-700">
              {item.details.map((d,i)=><li key={i}>{d}</li>)}
            </ul>
          </div>)}
        </div>
      </details>)}
    </div>
    {sections.length===0&&<p className="text-xs text-slate-500" role="status">Không tìm thấy điều khoản nào khớp.</p>}
    <p className="text-xs text-slate-500">
      Số liệu và mức xử lý trong nội quy là thông tin tham chiếu của văn bản.
      Mọi thay đổi thanh toán phải qua xác minh chứng cứ, xem xét hợp đồng và phê duyệt pháp lý;
      tra cứu nội quy không tạo khoản trừ lương.
    </p>
  </section>
}
