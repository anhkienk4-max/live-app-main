'use client'
import * as React from 'react'
import { RotateCcw, ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROLE_DEFAULTS_CATALOG, previewRoleDefaults, validateRoleDefaultProposal, type RoleDefaultsDecision } from '@/lib/rbac/roleDefaults'
import type { Permission } from '@/lib/permissions'
import type { SystemPermission } from '@/lib/types/database.types'

type VersionRow={
 id:number;role:SystemPermission;version:number;status:'proposed'|'approved'|'rolled_back';
 decisions:Partial<Record<Permission,RoleDefaultsDecision>>;proposed_at:string;approved_by?:string;approved_at?:string;
}
const roles:SystemPermission[]=['member','leader','admin']

/**
 * The displayed "proposed" decision is a simulation only. Effective access is
 * always legacy until owner-reviewed database and server enforcement activates.
 */
export function RoleDefaultsPanel(){
 const [role,setRole]=React.useState<SystemPermission>('member')
 const [decisions,setDecisions]=React.useState<Partial<Record<Permission,RoleDefaultsDecision>>>({})
 const [versions,setVersions]=React.useState<VersionRow[]>([])
 const [enabled,setEnabled]=React.useState(false)
 const [loading,setLoading]=React.useState(true)
 const [pending,setPending]=React.useState(false)
 const [message,setMessage]=React.useState('')
 const preview=React.useMemo(()=>previewRoleDefaults(role,decisions),[role,decisions])
 const change=(permission:Permission,value:RoleDefaultsDecision)=>
   setDecisions(current=>({...current,[permission]:value}))
 const load=React.useCallback(async()=>{
   setLoading(true)
   try {
     const response=await fetch('/api/role-defaults',{cache:'no-store',credentials:'same-origin'})
     const data=await response.json()
     if(!response.ok||data.ok!==true)throw new Error('Không thể tải lịch sử cấu hình quyền.')
     setVersions(Array.isArray(data.versions)?data.versions:[])
     setEnabled(data.enabled===true)
     setMessage('')
   }catch{setMessage('Không thể tải thông tin quản trị quyền. Kiểm tra lại phiên đăng nhập.')}
   finally{setLoading(false)}
 },[])
 React.useEffect(()=>{void Promise.resolve().then(load)},[load])
 const save=async(action:{action:'propose';role:SystemPermission;decisions:Partial<Record<Permission,RoleDefaultsDecision>>;comment:string}|{action:'rollback';versionId:number})=>{
   setPending(true)
   try{
     const res=await fetch('/api/role-defaults',{method:'POST',credentials:'same-origin',cache:'no-store',
       headers:{'Content-Type':'application/json'},body:JSON.stringify(action)})
     const body=await res.json()
     if(!res.ok||body.ok!==true)throw new Error(body?.error?.code||'SAVE_FAILED')
     setMessage('Đã ghi phiên bản đề xuất. Chưa thay đổi quyền có hiệu lực.')
     await load()
   }catch(e){setMessage('Không lưu được: '+(e instanceof Error?e.message:'SAVE_FAILED'))}
   finally{setPending(false)}
 }
 const checked=validateRoleDefaultProposal(role,decisions as Record<string,unknown>)
 return <section className="space-y-3 rounded-lg border p-4" data-testid="rbac01-role-defaults">
   <div className="flex flex-wrap items-start justify-between gap-2">
     <div><h3 className="text-sm font-semibold">Quyền mặc định theo vai trò · RBAC-01</h3>
       <p className="mt-1 text-xs text-muted-foreground">Xem và lưu bản đề xuất quyền theo module/hành động. Chưa kích hoạt thay đổi quyền khi backend và RLS chưa được chứng thực.</p>
     </div>
     <Badge variant="outline">{enabled?'Review only · Chưa hiệu lực':'Chưa kích hoạt'}</Badge>
   </div>
   <p className="flex items-start gap-2 text-xs text-amber-700" role="note"><ShieldAlert className="h-4 w-4 shrink-0" />
     Finance, Payroll, provider credentials, private Storage, service_role và quyền của Admin cuối cùng luôn nằm ngoài phạm vi cấp quyền. Quyền hiệu lực vẫn theo RC19.</p>
   <div className="flex flex-wrap gap-2" aria-label="Vai trò cấu hình">{roles.map(item=>
     <Button key={item} size="sm" type="button" variant={role===item?'secondary':'outline'} onClick={()=>{setRole(item);setDecisions({})}}>
       {item==='member'?'Member':item==='leader'?'Leader':'Admin'}
     </Button>)}</div>
   <div className="max-h-[360px] overflow-x-auto overflow-y-auto rounded-md border" role="region" aria-label="Ma trận quyền mặc định">
     <table className="w-full min-w-[590px] text-left text-xs">
       <thead className="sticky top-0 bg-muted"><tr><th className="p-2">Module</th><th className="p-2">Action</th><th className="p-2">Permission</th><th className="p-2">RC19</th><th className="p-2">Đề xuất</th><th className="p-2">Hiệu lực</th></tr></thead>
       <tbody className="divide-y">
       {ROLE_DEFAULTS_CATALOG.map(entry=>{
         const summary=preview[entry.permission]
         return <tr key={entry.permission}>
           <td className="p-2">{entry.module}</td><td className="p-2">{entry.action}</td>
           <td className="p-2 font-mono">{entry.permission}</td>
           <td className="p-2">{summary.legacy?'ALLOW':'DENY'}</td>
           <td className="p-2"><select className="rounded border bg-background p-1" aria-label={'Đề xuất '+entry.permission}
             value={decisions[entry.permission]??'inherit'}
             onChange={e=>change(entry.permission,e.target.value as RoleDefaultsDecision)}>
             <option value="inherit">Kế thừa</option>
             {summary.legacy&&!entry.reason&&<option value="deny">Đề xuất DENY</option>}
           </select></td>
           <td className="p-2">{summary.allowed?'ALLOW':'DENY'} <span className="text-muted-foreground">(RC19)</span></td>
         </tr>
       })}
       </tbody>
     </table>
   </div>
   <div className="flex flex-wrap items-center gap-2">
     <Button type="button" size="sm" disabled={!enabled||pending||!checked.ok||!Object.values(decisions).some(v=>v==='deny')}
       onClick={()=>void save({action:'propose',role,decisions,comment:'Admin-proposed role defaults, not effective'})}>
       Lưu đề xuất (không kích hoạt)</Button>
     <Button type="button" size="sm" variant="outline" onClick={()=>setDecisions({})} disabled={pending}>
       <RotateCcw className="mr-1 h-3.5 w-3.5"/>Đặt lại bản nháp</Button>
     {!checked.ok&&<p role="alert" className="text-xs text-red-700">Đề xuất không hợp lệ: {checked.code}</p>}
   </div>
   {message&&<p role="status" className="text-xs">{message}</p>}
   {loading?<p role="status" className="text-xs">Đang tải lịch sử quyền…</p>:
     <div className="space-y-1" data-testid="rbac01-version-history">
       <h4 className="text-xs font-semibold">Lịch sử phiên bản và rollback đề xuất</h4>
       {versions.length===0?<p className="text-xs text-muted-foreground">Chưa có bản đề xuất. Đang dùng toàn bộ quyền RC19.</p>:
         versions.slice(0,30).map(row=><div key={row.id} className="flex flex-wrap items-center gap-2 border-t py-2 text-xs">
           <span className="font-semibold">{row.role} · v{row.version}</span>
           <Badge variant="outline">{row.status}</Badge><span className="text-muted-foreground">{row.proposed_at}</span>
           {row.status==='proposed'&&<Button type="button" variant="outline" size="sm" disabled={!enabled||pending}
             onClick={()=>void save({action:'rollback',versionId:row.id})}>Hủy đề xuất</Button>}
           {row.status==='approved'&&<span>Đã phê duyệt bởi {row.approved_by??'—'} · {row.approved_at??'—'}</span>}
         </div>)}
     </div>}
 </section>
}
