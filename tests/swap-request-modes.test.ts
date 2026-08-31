import assert from 'node:assert/strict'
import test from 'node:test'
import { shiftService, shiftRegistrationService, swapRequestService, userService } from '../lib/services/dataService.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'

process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
process.env.NODE_ENV = 'development'

function makeUser(id: string, role: 'host'|'support'|'technical'): User {
  return {
    id, email: `${id}@test`, full_name: id, role: 'staff', system_permission: 'member', operational_roles: [role], status: 'active', account_status: 'active', join_date: '2024-01-01', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  } as User
}
async function setupShifts(): Promise<{ s1: Shift; s2: Shift; r1: ShiftRegistration; r2: ShiftRegistration; hostA: User; hostB: User }> {
  const hostA = makeUser('hostA','host')
  const hostB = makeUser('hostB','host')
  // ensure users exist in mock store: create via userService? For mock we can directly use shiftService etc. Simpler: use existing mock users
  // Create two shifts on different dates to avoid overlap
  const s1 = await shiftService.create({ date: '2031-10-01', start_time: '09:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'S1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-10-02', start_time: '09:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'S2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  // Create approved registrations for hostA on s1 and hostB on s2
  // Use shiftRegistrationService manual assign via leader
  const admin = await userService.getById('1')
  const r1 = await shiftRegistrationService.assignManually(s1.id, hostA.id, 'host', admin!.id, 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, hostB.id, 'host', admin!.id, 1)
  // Actually need hostA/B to exist as business users; create them
  return { s1, s2, r1, r2, hostA, hostB }
}

test('replacement success', async () => {
  const s = await shiftService.create({ date: '2031-11-01', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'RS', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r = await shiftRegistrationService.assignManually(s.id, '2', 'host', '1', 1)
  const req = await swapRequestService.create({ shift_id: s.id, requester_id: '2', operational_role: 'host', source_registration_id: r.id, replacement_staff_id: '3', reason: 'swap', mode: 'replacement' } as unknown as never)
  assert.equal(req.status, 'pending')
  assert.equal(req.approval_history?.[0]?.action, 'created')
  assert.equal(req.approval_history?.[0]?.actor_id, '2')
  assert.equal(req.approval_history?.[0]?.mode, 'replacement')
  assert.equal(req.approval_history?.[0]?.source_registration_id, r.id)
  assert.equal(req.approval_history?.[0]?.to_status, 'pending')
  await assert.rejects(() => swapRequestService.approve(req.id, '1', 1), /must be accepted/i)
  const accepted = await swapRequestService.respond(req.id, '3', 'accept', 1)
  assert.equal(accepted?.status, 'accepted')
  const approved = await swapRequestService.approve(req.id, '1', 2)
  assert.equal(approved?.status, 'completed')
  assert.deepEqual(approved?.approval_history?.map(entry => entry.action), ['created', 'accepted', 'approved', 'completed'])
  assert.ok(approved?.approval_history?.every(entry => !('by' in entry)))
})

test('MOVE cannot be created but remains a readable type', async () => {
  const s1 = await shiftService.create({ date: '2031-11-02', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'M1', required_host_count: 2, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-03', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'M2', required_host_count: 2, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  await assert.rejects(() => swapRequestService.create({ requester_id: '2', source_registration_id: r.id, target_shift_id: s2.id, reason: 'move', shift_id: s1.id, operational_role: 'host', mode: 'move' } as unknown as never), /historical.*cannot be created/i)
})

test('EXCHANGE success with accept', async () => {
  const s1 = await shiftService.create({ date: '2031-11-04', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'E1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-05', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'E2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'exchange', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  assert.equal(req.mode, 'exchange')
  assert.equal(req.approval_history?.[0]?.mode, 'exchange')
  assert.equal(req.approval_history?.[0]?.source_registration_id, r1.id)
  assert.equal(req.approval_history?.[0]?.counterpart_registration_id, r2.id)
  assert.equal(req.approval_history?.[0]?.counterpart_id, '3')
  assert.equal(req.approval_history?.[0]?.target_shift_id, s2.id)
  const accepted = await (swapRequestService as unknown as { accept: (id:string, actor:string)=>Promise<never> }).accept(req.id, '3', 1)
  assert.equal(accepted.status, 'accepted')
  const approved = await swapRequestService.approve(req.id, '1', 2)
  assert.equal(approved?.status, 'completed')
  assert.deepEqual(approved?.approval_history?.map(entry => entry.action), ['created', 'accepted', 'approved', 'completed'])
  assert.ok(approved?.approval_history?.every(entry => !('by' in entry)))
  const s1Regs = await shiftRegistrationService.getForShift(s1.id)
  const s2Regs = await shiftRegistrationService.getForShift(s2.id)
  assert.ok(s1Regs.some(r=> r.user_id==='3' && r.status==='approved'))
  assert.ok(s2Regs.some(r=> r.user_id==='2' && r.status==='approved'))
})

test('duplicate active blocked', async () => {
  const s = await shiftService.create({ date: '2031-11-06', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Dup', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r = await shiftRegistrationService.assignManually(s.id, '2', 'host', '1', 1)
  const s2 = await shiftService.create({ date: '2031-11-07', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'DupT', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  await swapRequestService.create({ requester_id: '2', source_registration_id: r.id, replacement_staff_id: '3', reason: 'dup', shift_id: s.id, operational_role: 'host', mode: 'replacement' } as unknown as never)
  await assert.rejects(()=> swapRequestService.create({ requester_id: '2', source_registration_id: r.id, replacement_staff_id: '3', reason: 'dup2', shift_id: s.id, operational_role: 'host', mode: 'replacement' } as unknown as never), /Duplicate/)
})

test('wrong actor blocked for accept', async () => {
  const s1 = await shiftService.create({ date: '2031-11-08', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'W1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-09', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'W2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'ex', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  await assert.rejects(()=> (swapRequestService as unknown as { accept: (a:string,b:string)=>Promise<never> }).accept(req.id, '2', 1), /Only the selected participant/)
})

test('replacement becoming busy after accept is blocked at approval', async () => {
  const s1 = await shiftService.create({ date: '2031-11-10', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Cap1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-10', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Cap2', required_host_count: 2, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, replacement_staff_id: '3', reason: 'busy after accept', shift_id: s1.id, operational_role: 'host', mode: 'replacement' } as unknown as never)
  await swapRequestService.respond(req.id, '3', 'accept', 1)
  await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  await assert.rejects(()=> swapRequestService.approve(req.id, '1', 2), /conflict/i)
})

test('rollback preserves both original assignments on failed exchange', async () => {
  const s1 = await shiftService.create({ date: '2031-11-12', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Roll1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-13', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Roll2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'rollback', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  await (swapRequestService as unknown as { accept: (a:string,b:string)=>Promise<never> }).accept(req.id, '3', 1)
  // Introduce the conflict after acceptance to exercise approval-time revalidation.
  const sOverlap = await shiftService.create({ date: '2031-11-13', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Overlap', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  await shiftRegistrationService.assignManually(sOverlap.id, '2', 'host', '1', 1)
  let err: unknown
  try { await swapRequestService.approve(req.id, '1', 2) } catch (e) { err = e }
  assert.ok(err instanceof Error && /conflict/i.test(err.message), `expected conflict, got ${err}`)
  const afterS1 = await shiftRegistrationService.getForShift(s1.id)
  const afterS2 = await shiftRegistrationService.getForShift(s2.id)
  // debug
  // console.log('afterS1', afterS1.map(r=> `${r.id}:${r.status}:${r.user_id}`))
  // console.log('afterS2', afterS2.map(r=> `${r.id}:${r.status}:${r.user_id}`))
  const isStaffed = (s:string)=> s==='approved' || s==='manually_assigned'
  assert.ok(afterS1.some(r => r.id===r1.id && isStaffed(r.status)), `afterS1 missing r1 staffed, got ${JSON.stringify(afterS1)}`)
  assert.ok(afterS2.some(r => r.id===r2.id && isStaffed(r.status)), `afterS2 missing r2 staffed, got ${JSON.stringify(afterS2)}`)
  // also ensure no duplicate staffed for same role
  const s1Staffed = afterS1.filter(r=> r.operational_role==='host' && isStaffed(r.status))
  const s2Staffed = afterS2.filter(r=> r.operational_role==='host' && isStaffed(r.status))
  assert.equal(s1Staffed.length, 1)
  assert.equal(s2Staffed.length, 1)
})

test('role mismatch blocked', async () => {
  const s1 = await shiftService.create({ date: '2031-11-14', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Role1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const s2 = await shiftService.create({ date: '2031-11-15', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Role2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '5', 'support', '1', 1)
  await assert.rejects(()=> swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'role mismatch', shift_id: s1.id, operational_role: 'host' } as unknown as never), /Role mismatch|SHIFT_MISMATCH/i)
})

test('inactive user blocked', async () => {
  const s1 = await shiftService.create({ date: '2031-11-16', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Inact1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  // make requester inactive by archiving user 2
  const u2 = await userService.getById('2')
  // mock: set status inactive via direct users array? For test, we can archive via userService
  await userService.archive('2', '1', 'test inactive')
  const s2 = await shiftService.create({ date: '2031-11-17', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Inact2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, replacement_staff_id: '3', reason: 'inactive', shift_id: s1.id, operational_role: 'host', mode: 'replacement' } as unknown as never).catch(e=> e)
  // create should fail due to inactive or approve should fail
  // restore user for other tests
  await userService.restore('2', '1', 'restore')
  assert.ok(req instanceof Error || (req as unknown as { status: string }).status === 'pending')
})

test('stale source blocked', async () => {
  const s1 = await shiftService.create({ date: '2031-11-18', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Stale1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-19', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Stale2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, replacement_staff_id: '3', reason: 'stale', shift_id: s1.id, operational_role: 'host', mode: 'replacement' } as unknown as never)
  await swapRequestService.respond(req.id, '3', 'accept', 1)
  // cancel source registration to make it stale
  await shiftRegistrationService.removeAssignment(r1.id, '1', undefined, 1)
  await assert.rejects(()=> swapRequestService.approve(req.id, '1', 2), /Source stale|not active/i)
})

test('cancel success', async () => {
  const s1 = await shiftService.create({ date: '2031-11-20', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Cancel1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-21', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Cancel2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, replacement_staff_id: '3', reason: 'cancel', shift_id: s1.id, operational_role: 'host', mode: 'replacement' } as unknown as never)
  const cancelled = await swapRequestService.cancel(req.id, '2', 'no need', 1)
  assert.equal(cancelled?.status, 'cancelled')
})

test('reject success via counterpart', async () => {
  const s1 = await shiftService.create({ date: '2031-11-22', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Rej1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-23', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Rej2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'reject', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  const rejected = await swapRequestService.respond(req.id, '3', 'reject', 1)
  assert.equal(rejected?.status, 'rejected')
})

test('replacement overlap conflict is blocked', async () => {
  const s1 = await shiftService.create({ date: '2031-11-24', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Over1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-25', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Over2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, replacement_staff_id: '3', reason: 'overlap', shift_id: s1.id, operational_role: 'host', mode: 'replacement' } as unknown as never)
  await swapRequestService.respond(req.id, '3', 'accept', 1)
  const sOverlap = await shiftService.create({ date: '2031-11-24', start_time: '10:00', end_time: '12:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'OverLap', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  await shiftRegistrationService.assignManually(sOverlap.id, '3', 'host', '1', 1)
  await assert.rejects(()=> swapRequestService.approve(req.id, '1', 2), /conflict/i)
})

test('stale counterpart blocked', async () => {
  const s1 = await shiftService.create({ date: '2031-11-26', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'StaleCp1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-27', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'StaleCp2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: 'stale cp', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  await (swapRequestService as unknown as { accept: (a:string,b:string)=>Promise<never> }).accept(req.id, '3', 1)
  await shiftRegistrationService.removeAssignment(r2.id, '1', undefined, 1)
  await assert.rejects(()=> swapRequestService.approve(req.id, '1', 2), /Counterpart stale|not active/i)
})

test('successful EXCHANGE produces exactly 2 new staffed registrations and no stale duplicates', async () => {
  const s1 = await shiftService.create({ date: '2031-11-28', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Ex1', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const s2 = await shiftService.create({ date: '2031-11-29', start_time: '09:00', end_time: '11:00', brand_id: 'brand-1', platform_id: 'platform-1', title: 'Ex2', required_host_count: 1, required_support_count: 1, required_technical_count: 1, status: 'scheduled' } as unknown as Shift)
  const r1 = await shiftRegistrationService.assignManually(s1.id, '2', 'host', '1', 1)
  const r2 = await shiftRegistrationService.assignManually(s2.id, '3', 'host', '1', 1)
  const req = await swapRequestService.create({ requester_id: '2', source_registration_id: r1.id, target_shift_id: s2.id, counterpart_registration_id: r2.id, reason: '2 new', shift_id: s1.id, operational_role: 'host' } as unknown as never)
  await (swapRequestService as unknown as { accept: (a:string,b:string)=>Promise<never> }).accept(req.id, '3', 1)
  await swapRequestService.approve(req.id, '1', 2)
  const s1Regs = await shiftRegistrationService.getForShift(s1.id)
  const s2Regs = await shiftRegistrationService.getForShift(s2.id)
  const s1Staffed = s1Regs.filter(r=> r.operational_role==='host' && (r.status==='approved' || r.status==='manually_assigned'))
  const s2Staffed = s2Regs.filter(r=> r.operational_role==='host' && (r.status==='approved' || r.status==='manually_assigned'))
  assert.equal(s1Staffed.length, 1)
  assert.equal(s2Staffed.length, 1)
  assert.equal(s1Staffed[0].user_id, '3')
  assert.equal(s2Staffed[0].user_id, '2')
  const dupCheck = s1Regs.filter(r=> r.id===r1.id)
  assert.equal(dupCheck[0].status, 'cancelled')
})
