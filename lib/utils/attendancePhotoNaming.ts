/**
 * Shift-attendance photo naming convention for ADA's existing CHECK IN/OUT Drive tree.
 * Names carry shift context and a unique proof timestamp, not user-entered folder paths.
 * The source room rulebook defines required evidence, but not an exact file name pattern.
 */
export type PhotoRole = 'host' | 'support' | 'technical'

export interface AttendancePhotoNamingInput {
  shiftDate: string
  brand: string
  platform: string
  startTime: string
  endTime: string
  staffName: string
  role: PhotoRole
  recordedAt: string
  requestId: string
  extension: 'jpg' | 'png' | 'webp'
}
const pad = (value: number) => String(value).padStart(2, '0')
const SAFE = (raw: string, max: number) => raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'D').replace(/[^A-Za-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/g, '') || 'KHONG_RO'
function checkedTime(value: string): string {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) throw new Error('ATTENDANCE_PHOTO_TIME_INVALID')
  return match[1] + match[2]
}
function checkedDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('ATTENDANCE_PHOTO_DATE_INVALID')
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3])
  const date=new Date(Date.UTC(year,month-1,day))
  if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)
    throw new Error('ATTENDANCE_PHOTO_DATE_INVALID')
  return {year,month,day}
}
export function attendancePhotoFolder(role: PhotoRole, date: string) {
  const {year,month} = checkedDate(date)
  const roles:Record<PhotoRole,string>={host:'HOST',support:'TRỢ',technical:'KỸ THUẬT'}
  return [roles[role], `THÁNG ${month} - ${year}`]
}
export function attendancePhotoName(input: AttendancePhotoNamingInput) {
  const {year,month,day}=checkedDate(input.shiftDate)
  const at=new Date(input.recordedAt)
  if(!Number.isFinite(at.getTime())||!/Z|[+-]\d{2}:\d{2}$/.test(input.recordedAt))
    throw new Error('ATTENDANCE_PHOTO_CAPTURE_TIME_INVALID')
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId))
    throw new Error('ATTENDANCE_PHOTO_REQUEST_INVALID')
  const stamp=`${at.getUTCFullYear()}${pad(at.getUTCMonth()+1)}${pad(at.getUTCDate())}_${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  const roles:Record<PhotoRole,string>={host:'HOST',support:'TRO',technical:'KY_THUAT'}
  return [
    `${year}${pad(month)}${pad(day)}`, SAFE(input.brand,24), SAFE(input.platform,16),
    checkedTime(input.startTime)+'-'+checkedTime(input.endTime),roles[input.role],
    SAFE(input.staffName,28),'CHECKIN',stamp,input.requestId.slice(0,8)
  ].join('_')+'.'+input.extension
}
