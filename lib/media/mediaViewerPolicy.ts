/**
 * Pure, deliberately conservative ADA media read authorization.
 * Being logged in, admin/leader, or knowing a studio URL is never enough.
 */
export type MediaShift = {
  id:string; brand_id:string; platform_id:string; studio:string|null;
  status:string; start_at:string; end_at:string; deleted_at?:string|null;
}
export type MediaGrant = {
  auth_user_id:string; shift_id:string; active:boolean;
  valid_from:string; valid_until:string
}
export type MediaRoute = {
  brand_id:string;platform_id:string;studio:string;
  media_path:string;active:boolean
}
const MEDIA_PATH=/^[a-z][a-z0-9_]{0,63}$/
const time=value=>{
  const parsed=Date.parse(value)
  return Number.isFinite(parsed)?parsed:NaN
}
export function mayReadMediaShift(input:{
  viewerId:string;shift:MediaShift;grant:MediaGrant;route:MediaRoute;now:number
}):boolean{
  const {viewerId,shift,grant,route,now}=input
  if(!viewerId||!shift||!grant||!route||!Number.isFinite(now)
    ||shift.status!=='live'||Boolean(shift.deleted_at)
    ||!shift.studio?.trim()||!route.active||!grant.active
    ||!MEDIA_PATH.test(route.media_path)
    ||grant.auth_user_id!==viewerId||grant.shift_id!==shift.id
    ||route.brand_id!==shift.brand_id
    ||route.platform_id!==shift.platform_id||route.studio!==shift.studio)return false
  const start=time(shift.start_at),end=time(shift.end_at)
  const validFrom=time(grant.valid_from),validUntil=time(grant.valid_until)
  if(![start,end,validFrom,validUntil].every(Number.isFinite)
    ||end<=start||validUntil<=validFrom)return false
  const slack=15*60*1000
  return now>=start-slack&&now<=end+slack&&now>=validFrom&&now<validUntil
}
export const isMediaPath=(s:string)=>MEDIA_PATH.test(s)
