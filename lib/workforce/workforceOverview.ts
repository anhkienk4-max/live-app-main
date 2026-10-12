import type { WorkforcePerformanceSummary } from './workforcePerformance'

export interface WorkforceTeamOverview {
  staffCount: number
  assignedShifts: number
  verifiedShifts: number
  unknownAttendanceShifts: number
  workedShifts: number
  approvedNoShows: number
  actualMinutes: number
  onTimeShifts: number
  lateShifts: number
  attendanceCoveragePct: number | null
  punctualityPct: number | null
  knownReliabilityPct: number | null
  isComplete: boolean
  incompleteStaffCount: number
}
const pct=(a:number,b:number)=>b===0?null:Math.round(a*10_000/b)/100

/** Weighted team KPIs: never average personal percentages (Simpson's paradox).
 * Missing evidence contributes to unknown coverage, not a no-show penalty. */
export function aggregateWorkforceTeam(rows:readonly WorkforcePerformanceSummary[]):WorkforceTeamOverview {
  const sum=(f:(r:WorkforcePerformanceSummary)=>number)=>rows.reduce((v,r)=>v+f(r),0)
  const assigned=sum(r=>r.assignedShifts),verified=sum(r=>r.verifiedShifts)
  const worked=sum(r=>r.approvedWorkedShifts)
  const noShows=sum(r=>r.approvedNoShows)
  const onTime=sum(r=>r.onTimeShifts)
  const incomplete=rows.filter(r=>!r.isComplete).length
  return {
    staffCount:rows.length,assignedShifts:assigned,verifiedShifts:verified,
    unknownAttendanceShifts:sum(r=>r.unknownAttendanceShifts),
    workedShifts:worked,approvedNoShows:noShows,
    actualMinutes:sum(r=>r.approvedActualMinutes),
    onTimeShifts:onTime,lateShifts:sum(r=>r.lateShifts),
    attendanceCoveragePct:pct(verified,assigned),
    punctualityPct:pct(onTime,worked),
    knownReliabilityPct:pct(worked,verified),
    isComplete:assigned>0 && incomplete===0,
    incompleteStaffCount:incomplete,
  }
}

/** Transparent leaderboard: sort by punctuality then documented workload.
 * Never rank people with incomplete attendance or fewer verified shifts than
 * the explicit organization-wide threshold. No hidden weighted "AI score". */
export function rankVerifiedWorkforce(
  rows:readonly WorkforcePerformanceSummary[],
  minimumVerifiedShifts:number,
):WorkforcePerformanceSummary[] {
  if(!Number.isSafeInteger(minimumVerifiedShifts)||minimumVerifiedShifts<1||minimumVerifiedShifts>100)
    throw new Error('WORKFORCE_LEADERBOARD_POLICY_REQUIRED')
  return rows.filter(r=>r.isComplete&&r.verifiedShifts>=minimumVerifiedShifts
    && r.punctualityPct!==null)
    .slice().sort((a,b)=>
      (b.punctualityPct??0)-(a.punctualityPct??0)
      ||b.approvedWorkedShifts-a.approvedWorkedShifts
      ||b.approvedActualMinutes-a.approvedActualMinutes
      ||a.staffId.localeCompare(b.staffId))
}
