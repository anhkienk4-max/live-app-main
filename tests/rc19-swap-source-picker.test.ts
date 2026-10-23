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

test('swap request opens immediately and failed source fetch is retried inside modal rather than failing whole page', () => {
  const parent = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url)), 'utf8')
  const modal = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
  const before = parent.indexOf('setShowForm(true)')
  const after = parent.indexOf('loadFormShifts(currentUser.id)', before)
  assert.ok(before >= 0 && after > before, 'opening the modal must not wait for shift API response')
  assert.match(parent, /sourceShiftsReady=\{Boolean\(formFetchState/)
  assert.match(parent, /onRetrySourceShifts=/)
  assert.match(modal, /disabled=\{submitting \|\| !formReady\}/)
})

test('RC19 source shift query excludes historical business dates without broadening actor scope', () => {
  const parent = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestList.tsx', import.meta.url)), 'utf8')
  assert.match(parent, /import \{ formatShiftTimeRange, getCurrentBusinessDate \} from '@\/lib\/utils\/shiftUtils'/)
  assert.match(parent, /shiftService\.getAllFiltered\(\{[\s\S]*?assignedUserIds: \[ownerId\],[\s\S]*?statuses: \['scheduled'\],[\s\S]*?from: getCurrentBusinessDate\(\),[\s\S]*?\}\)/)
  assert.match(parent, /if \(request !== formRequestRef\.current\) return/)
  assert.match(parent, /sourceShiftsReady=\{Boolean\(formFetchState/)
})
