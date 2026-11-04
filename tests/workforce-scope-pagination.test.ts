import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WORKFORCE_SHIFT_ID_CHUNK_SIZE,
  WorkforceScopeReadError,
  readCompleteWorkforceRows,
  readWorkforceRowsForShifts,
} from '@/lib/server/workforceScopePagination'
import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'

type RecordRow = { id: string; [name: string]: unknown }
function rowsOf(count: number): RecordRow[] {
  return Array.from({length:count},(_,i)=>({id:`record-${String(i).padStart(5,'0')}`}))
}
const okPage = (rows: RecordRow[]) => (first:number,last:number) => Promise.resolve({
  data:rows.slice(first,last+1),count:rows.length,error:null,
})

test('workforce pagination returns every row past the old 1,000-row ceiling',async()=>{
  const rows=rowsOf(1307)
  const result=await readCompleteWorkforceRows(okPage(rows),'TEST_SCOPE_INCOMPLETE')
  assert.equal(result.length,1307)
  assert.equal(new Set(result.map(row=>row.id)).size,1307)
  assert.equal(result.at(-1)?.id,'record-01306')
})

test('workforce pagination rejects drifting counts, missing rows, duplicate IDs and failures',async()=>{
  const rows=rowsOf(1100)
  const cases:Array<(first:number,last:number)=>Promise<{data:RecordRow[]|null;count:number|null;error:unknown}>>=[
    (a,b)=>Promise.resolve({data:rows.slice(a,b+1),count:a>0?1099:1100,error:null}),
    (a,b)=>Promise.resolve({data:rows.slice(a,b+1-(a>0?1:0)),count:1100,error:null}),
    (a,b)=>Promise.resolve({data:a>0?rows.slice(0,b-a+1):rows.slice(a,b+1),count:1100,error:null}),
    (a,b)=>Promise.resolve({data:rows.slice(a,b+1),count:a>0?null:1100,error:null}),
    (a,b)=>Promise.resolve({data:rows.slice(a,b+1),count:1100,error:a>0?{message:'backend error'}:null}),
  ]
  for(const page of cases){
    await assert.rejects(
      ()=>readCompleteWorkforceRows(page,'TEST_SCOPE_INCOMPLETE'),
      (error:unknown)=>error instanceof WorkforceScopeReadError&&error.code==='TEST_SCOPE_INCOMPLETE',
    )
  }
})

test('workforce pagination rejects unsafe data-volume limits instead of truncating',async()=>{
  const rows=rowsOf(150)
  await assert.rejects(
    ()=>readCompleteWorkforceRows(okPage(rows),'TEST_SCOPE_INCOMPLETE',100),
    /TEST_SCOPE_INCOMPLETE/,
  )
})

test('shift-scoped registration queries split large ID lists and retain every row',async()=>{
  const shifts=Array.from({length:1203},(_,i)=>'s-'+i)
  const seen:number[]=[]
  const data=await readWorkforceRowsForShifts(
    shifts,
    (chunk,first,last)=>{
      seen.push(chunk.length)
      const rows=chunk.map(id=>({id:'registration-'+id,shift_id:id}))
      return Promise.resolve({data:rows.slice(first,last+1),count:rows.length,error:null})
    },
    'TEST_SCOPE_INCOMPLETE',
  )
  assert.equal(data.length,1203)
  assert.ok(seen.every(n=>n<=WORKFORCE_SHIFT_ID_CHUNK_SIZE))
  assert.equal(seen.length,Math.ceil(shifts.length/WORKFORCE_SHIFT_ID_CHUNK_SIZE))
})

test('shift-scoped reads reject duplicate evidence across independent chunks',async()=>{
  const shifts=Array.from({length:151},(_,i)=>'s-'+i)
  await assert.rejects(
    ()=>readWorkforceRowsForShifts(
      shifts,
      (_chunk,first,last)=>{
        const rows=[{id:'duplicated-evidence'}]
        return Promise.resolve({data:rows.slice(first,last+1),count:1,error:null})
      },
      'WORKFORCE_TEAM_EVIDENCE_INCOMPLETE',
    ),
    /WORKFORCE_TEAM_EVIDENCE_INCOMPLETE/,
  )
})

function largeScopeFixture(staffCount=1, shiftsPerStaff=1205, approved=false){
  const shifts=Array.from({length:staffCount*shiftsPerStaff},(_,i)=>({
    id:'shift-'+String(i).padStart(5,'0'),
    date:'2026-05-10',start_at:'2026-05-10T02:00:00Z',status:'completed',
    host_id:`staff-${Math.floor(i/shiftsPerStaff)+1}`,support_id:null,technical_id:null,
    deleted_at:null,
  }))
  const data:Record<string,RecordRow[]>={
    shifts,
    business_users:Array.from({length:staffCount},(_,i)=>({id:`staff-${i+1}`,full_name:`Verified member ${i+1}`,department:'Livestream',status:'active',deleted_at:null})),
    shift_registrations:[],
    workforce_actual_segments:approved?shifts.flatMap((shift,i)=>[
      {id:`actual-${i}`,shift_id:shift.id,staff_id:shift.host_id,operational_role:'host',event_kind:'worked',review_status:'approved',actual_start_at:'2026-05-10T02:00:00Z',actual_end_at:'2026-05-10T03:00:00Z'},
      {id:`draft-${i}`,shift_id:shift.id,staff_id:shift.host_id,operational_role:'host',event_kind:'worked',review_status:'draft',actual_start_at:'2026-05-10T02:00:00Z',actual_end_at:'2026-05-10T12:00:00Z'},
    ]):[],
  }
  const seenChunks:number[]=[]
  const createClient=()=>({
    from(table:string){
      const where:Array<(row:RecordRow)=>boolean>=[]
      const query={
        select(){return query},
        eq(field:string,value:unknown){where.push(row=>row[field]===value);return query},
        gte(field:string,value:string){where.push(row=>String(row[field])>=value);return query},
        lte(field:string,value:string){where.push(row=>String(row[field])<=value);return query},
        is(field:string,value:unknown){where.push(row=>row[field]===value);return query},
        in(field:string,values:unknown[]){
          if(field==='shift_id')seenChunks.push(values.length)
          where.push(row=>values.includes(row[field]))
          return query
        },
        order(){return query},
        range(first:number,last:number){
          const rows=data[table].filter(row=>where.every(fn=>fn(row)))
            .sort((a,b)=>a.id.localeCompare(b.id))
          return Promise.resolve({data:rows.slice(first,last+1),count:rows.length,error:null})
        },
      }
      return query
    },
  })
  return {createClient,seenChunks}
}

const admin=async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const member=async()=>({id:'auth-member',businessUserId:'staff-1',systemPermission:'member' as const})

test('year-long Individual KPI includes 1,205 shifts and remains scoped to authenticated member',async()=>{
  const db=largeScopeFixture()
  const handler=createWorkforcePerformanceHandler({
    createClient:db.createClient as never,resolveUser:member,
    isEnabled:()=>true,lateGraceMinutes:()=>10,
  })
  const response=await handler.GET(new Request(
    'https://example.test/api/workforce/performance?staff_id=staff-1&role=host&period=2026',
  ))
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()))
  const result=await response.json() as {performance:{assignedShifts:number;verifiedShifts:number;unknownAttendanceShifts:number}}
  assert.equal(result.performance.assignedShifts,1205)
  assert.equal(result.performance.verifiedShifts,0)
  assert.equal(result.performance.unknownAttendanceShifts,1205)
  assert.ok(db.seenChunks.every(n=>n<=WORKFORCE_SHIFT_ID_CHUNK_SIZE))
})

test('year-long Team KPI includes 1,205 shifts with no inferred verified attendance',async()=>{
  const db=largeScopeFixture()
  const handler=createWorkforceOverviewHandler({
    createClient:db.createClient as never,resolveUser:admin,
    isEnabled:()=>true,grace:()=>10,leaderboardMin:()=>null,
  })
  const response=await handler.GET(new Request(
    'https://example.test/api/workforce/overview?period=2026&role=host',
  ))
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()))
  const result=await response.json() as {team:{assignedShifts:number;verifiedShifts:number;unknownAttendanceShifts:number}}
  assert.equal(result.team.assignedShifts,1205)
  assert.equal(result.team.verifiedShifts,0)
  assert.equal(result.team.unknownAttendanceShifts,1205)
  assert.ok(db.seenChunks.every(n=>n<=WORKFORCE_SHIFT_ID_CHUNK_SIZE))
})

test('team staff pages filter and sort server-side while ranking uses the complete approved scope',async()=>{
  const db=largeScopeFixture(25,1,true)
  const handler=createWorkforceOverviewHandler({
    createClient:db.createClient as never,resolveUser:admin,
    isEnabled:()=>true,grace:()=>10,leaderboardMin:()=>1,
  })
  const response=await handler.GET(new Request(
    'https://example.test/api/workforce/overview?period=2026-05&role=host&page=2&page_size=10&sort=name&direction=asc',
  ))
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()))
  const body=await response.json() as {
    team:{staffCount:number;actualMinutes:number};
    staff:Array<{staffId:string}>;
    staff_pagination:{page:number;total_count:number;total_pages:number};
    leaderboard:Array<{rank:number}>;
  }
  assert.equal(body.team.staffCount,25)
  assert.equal(body.team.actualMinutes,25*60)
  assert.equal(body.staff.length,10)
  assert.deepEqual(body.staff_pagination,{page:2,page_size:10,total_count:25,total_pages:3,has_next:true,has_previous:true})
  assert.equal(body.leaderboard.length,25)
  assert.equal(body.leaderboard.at(-1)?.rank,25)

  const filtered=await handler.GET(new Request(
    'https://example.test/api/workforce/overview?period=2026-05&role=host&page=9&page_size=10&staff_id=staff-3',
  ))
  assert.equal(filtered.status,200)
  const selected=await filtered.json() as {staff:Array<{staffId:string}>;staff_pagination:{page:number;total_count:number}}
  assert.deepEqual(selected.staff.map(staff=>staff.staffId),['staff-3'])
  assert.equal(selected.staff_pagination.page,1)
  assert.equal(selected.staff_pagination.total_count,1)
})
