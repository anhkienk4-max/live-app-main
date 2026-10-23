'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'

type Result = 'idle'|'checking'|'ready'|'blocked'

/** This does not check staff attendance or perform QC. It only gives an
 * authorized Admin a safe, read-only runtime provider readiness check. */
export function AttendanceDrivePreflight() {
  const [status,setStatus] = React.useState<Result>('idle')
  const [enabled,setEnabled] = React.useState(false)
  const lock = React.useRef(false)

  async function verify() {
    if(lock.current)return
    lock.current=true
    setStatus('checking')
    try {
      const response=await fetch('/api/workforce/self-attendance-photo/preflight',{
        method:'GET',credentials:'same-origin',cache:'no-store',
      })
      if(!response.ok) { setStatus('blocked');return }
      const body:unknown=await response.json()
      if(!body||typeof body!=='object'||Array.isArray(body)) {
        setStatus('blocked');return
      }
      const result=body as Record<string,unknown>
      if(result.ok!==true||result.provider!=='google_drive'||
        result.root_readable!==true||result.root_can_add_children!==true||
        typeof result.feature_enabled!=='boolean'){
        setStatus('blocked');return
      }
      setEnabled(result.feature_enabled)
      setStatus('ready')
    }catch{
      setStatus('blocked')
    }finally{lock.current=false}
  }

  return <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3"
    data-testid="attendance-drive-readiness">
    <div>
      <p className="text-sm font-semibold">Google Drive cho ảnh check-in</p>
      <p className="text-xs text-slate-600">Kiểm tra quyền của ứng dụng tại thư mục CHECK IN/OUT. Chỉ đọc, không tạo thư mục hoặc tải ảnh.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={status==='checking'}
        onClick={()=>void verify()}>
        {status==='checking'?'Đang kiểm tra…':'Kiểm tra quyền Drive'}
      </Button>
      {status==='idle'&&<span role="status" className="text-xs text-slate-600">Chưa kiểm tra</span>}
      {status==='ready'&&<span role="status" className="text-xs text-green-800">
        Đã xác nhận quyền đọc/ghi thư mục. Tính năng check-in ảnh {enabled?'đang bật':'đang tắt'}.
      </span>}
      {status==='blocked'&&<span role="alert" className="text-xs text-rose-800">
        Chưa xác nhận được quyền Drive của ứng dụng. Giữ khóa check-in ảnh và kiểm tra cấu hình Admin.
      </span>}
    </div>
  </div>
}
