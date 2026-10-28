import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { searchEligibleSwapShifts } from '../lib/utils/swapEligibleShiftPicker.ts'
import type { Shift, OperationalRole } from '../lib/types/database.types.ts'

const make = (id: string, date: string, brand_id = 'b1', platform_id = 'p1'): Shift => ({
  id, date, start_time: '18:00', end_time: '22:00', status: 'scheduled',
  brand_id, platform_id, title: 'Buổi tối', studio: 'Studio 2'
} as Shift)
const roles: Record<string, OperationalRole[]> = { s1: ['host'], s3: ['support'], s4: ['host'] }
const shifts = [make('s4', '2026-10-30'), make('s2', '2026-10-24'), make('s1', '2026-10-23'), make('s3', '2026-10-25', 'b2', 'p2')]
const brands = [{ id: 'b1', name: 'Opella' }, { id: 'b2', name: 'Mars' }]
const platforms = [{ id: 'p1', name: 'TikTok' }, { id: 'p2', name: 'Shopee' }]

test('only assigned roles appear in the swap source-shift picker, ordered by date', () => {
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, '', brands, platforms).map(s => s.id), ['s1', 's3', 's4'])
})
test('search by brand, platform, day/month/year and title without expanding unauthorized shifts', () => {
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, 'mars', brands, platforms).map(s => s.id), ['s3'])
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, 'shopee', brands, platforms).map(s => s.id), ['s3'])
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, '25/10', brands, platforms).map(s => s.id), ['s3'])
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, 'STUDIO 2', brands, platforms).map(s => s.id), ['s1','s3','s4'])
  assert.deepEqual(searchEligibleSwapShifts(shifts, roles, 's2', brands, platforms), [])
})
test('cancelled, archived, deleted or unassigned shifts fail closed', () => {
  const cases = [ {...make('s1','2026-10-23'), status:'cancelled' }, {...make('s1','2026-10-23'), archived_at:'2026-01-01' }, {...make('s1','2026-10-23'), deleted_at:'2026-01-01' }] as Shift[]
  for(const shift of cases) assert.equal(searchEligibleSwapShifts([shift],roles,'',brands,platforms).length,0)
})
test('large directories are bounded and missing owner assignments return empty', () => {
  const many=Array.from({length:150},(_,i)=>make('m'+i,'2026-10-23'))
  const all=Object.fromEntries(many.map(s=>[s.id,['host'] as OperationalRole[]]))
  assert.equal(searchEligibleSwapShifts(many,all,'',brands,platforms).length,50)
  assert.equal(searchEligibleSwapShifts(shifts,{},'',brands,platforms).length,0)
  assert.equal(searchEligibleSwapShifts(many,all,'',brands,platforms,3).length,3)
})

test('swap request opens immediately and source page errors are retried inside modal', () => {
  const parent = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url)), 'utf8')
  const modal = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
  assert.match(parent, /setShowForm\(true\)/)
  assert.doesNotMatch(parent, /getAllFiltered\(\{[\s\S]*?assignedUserIds/)
  assert.match(modal, /getRegistrationPage\('mine'/)
  assert.match(modal, /setSourceRevision\(n => n \+ 1\)/)
  assert.match(modal, /disabled=\{busy \|\| !sourceRegistration \|\| !validCandidate/)
})

test('source picker pages only staffed registrations for current actor and filters on server', () => {
  const modal = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
  assert.match(modal, /getRegistrationPage\('mine', \{ page: sourcePage, pageSize, filters:/)
  assert.match(modal, /registrationStatuses: \['approved', 'manually_assigned'\], from/)
  assert.match(modal, /brandIds: \[brandId\]/)
  assert.match(modal, /platformIds: \[platformId\]/)
  assert.match(modal, /reg\.user_id === owner && isStaffedRegistration\(reg\)/)
  assert.match(modal, /sourceSnapshot\?\.key === sourceKey/)
  assert.match(modal, /return \(\) => \{ active = false \}/)
  assert.match(modal, /submitLock\.current/)
  assert.match(modal, /Legacy-only shifts without a registration cannot be used as a source/)
})

test('PASS recipient is blocked when its conflict check is incomplete or fails', () => {
  const modal = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
  assert.match(modal, /Boolean\(conflict\) && !conflict\?\.reason && !conflict\?\.error/)
})

test('cancelled shifts do not create a client-side PASS conflict', () => {
  const modal = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
  const persistence = readFileSync(fileURLToPath(new URL('../supabase/migrations/20260814085659_p1c_shift_persistence.sql', import.meta.url)), 'utf8')
  assert.match(modal, /shift\.id === selectedSource\.id \|\| shift\.status === 'cancelled'/)
  assert.match(persistence, /other_shift\.status <> 'cancelled'[\s\S]*?other_shift\.start_at < p_shift\.end_at/)
})

test('swap detail and cancel actions are rebound to the current actor page', () => {
  const list = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url)), 'utf8')
  assert.match(list, /activeSelectedSwap = identity === loadedIdentity && selectedSwap \? swaps\.find/)
  assert.match(list, /activeCancelTarget = identity === loadedIdentity && cancelTarget \? swaps\.find/)
  assert.match(list, /!swaps\.some\(row => row\.id === swap\.id\)/)
})
