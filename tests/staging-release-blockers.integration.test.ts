import assert from 'node:assert/strict'
import test from 'node:test'
import { createClient } from '@supabase/supabase-js'

const stagingRef = 'amagnzebmmuqiptmrjmc'
const roles = ['admin', 'leader', 'member'] as const

test('real staging API enforces Member privacy and preserves privileged reads/revision history', async () => {
  assert.equal(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname, stagingRef + '.supabase.co', 'staging target required')
  const clients = await Promise.all(roles.map(async role => {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const email = process.env['E2E_' + role.toUpperCase() + '_EMAIL']
    const password = process.env['E2E_' + role.toUpperCase() + '_PASSWORD']
    assert.ok(email && password, role + ' credential configuration absent')
    const result = await client.auth.signInWithPassword({ email, password })
    assert.equal(result.error, null, role + ' staging login failed')
    return client
  }))
  try {
    const [admin, leader, member] = clients
    const own = await member.from('business_users').select('*')
    assert.equal(own.error, null); assert.equal(own.data!.length, 1); assert.equal(own.data![0].system_permission, 'member')
    const memberId = own.data![0].id
    const raw = await member.from('shift_registrations').select('*')
    assert.equal(raw.error, null); assert.ok(raw.data!.length > 0)
    assert.ok(raw.data!.every(row => row.user_id === memberId), 'foreign reviewer row returned')
    const foreign = await member.from('shift_registrations').select('*').neq('user_id', memberId)
    assert.equal(foreign.error, null); assert.deepEqual(foreign.data, [])
    const contacts = await member.from('business_users').select('*').neq('id', memberId)
    assert.equal(contacts.error, null); assert.deepEqual(contacts.data, [])
    const directory = await member.rpc('get_staff_directory')
    assert.equal(directory.error, null); assert.ok(directory.data.some((row: { id: string }) => row.id !== memberId))
    for (const row of directory.data) assert.deepEqual(Object.keys(row).sort(), ['avatar_url', 'full_name', 'id', 'operational_roles'])
    const shifts = await member.from('shifts').select('id').limit(100)
    assert.equal(shifts.error, null)
    const summary = await member.rpc('get_shift_staffing_summary', { p_shift_ids: shifts.data!.map(row => row.id) })
    assert.equal(summary.error, null); assert.ok(summary.data.some((row: { approved: number }) => row.approved > 0))
    for (const row of summary.data) {
      assert.deepEqual(Object.keys(row).sort(), ['approved', 'approved_staff', 'pending', 'remaining', 'required', 'role', 'shift_id'])
      for (const staff of row.approved_staff) assert.deepEqual(Object.keys(staff).sort(), ['avatar_url', 'imported_only', 'name'])
    }
    const leaderRows = await leader.from('shift_registrations').select('*')
    assert.equal(leaderRows.error, null)
    assert.ok(leaderRows.data!.some(row => row.user_id !== '2' && row.review_notes), 'authorized reviewer context absent')
    for (const client of [admin, leader]) {
      const staff = await client.from('business_users').select('id,email,phone,auth_user_id')
      assert.equal(staff.error, null); assert.ok(staff.data!.length > 1)
    }
    const reports = await admin.from('reports').select('id').is('archived_at', null).is('deleted_at', null).order('id').limit(1)
    assert.equal(reports.error, null); assert.ok(reports.data!.length)
    for (const [index, client] of clients.entries()) {
      const revisions = await client.rpc('get_report_revisions', { p_report_id: reports.data![0].id })
      assert.equal(revisions.error, null, roles[index] + ' revision RPC failed')
      assert.ok(revisions.data.length > 0)
      const versions = revisions.data.map((row: { version: number }) => row.version)
      assert.deepEqual(versions, [...versions].sort((a, b) => a - b))
    }
    const archived = await admin.from('reports').select('id').or('archived_at.not.is.null,deleted_at.not.is.null').limit(1)
    assert.equal(archived.error, null); assert.ok(archived.data!.length, 'archived report fixture required')
    for (const client of [leader, member]) {
      const denied = await client.rpc('get_report_revisions', { p_report_id: archived.data![0].id })
      assert.equal(denied.error?.code, '42501', 'archived report authorization changed')
    }
    const allShifts = await admin.from('shifts').select('id').limit(100)
    assert.equal(allShifts.error, null)
    const hidden = allShifts.data!.find(row => !shifts.data!.some(visible => visible.id === row.id))
    assert.ok(hidden, 'unreadable shift fixture required')
    const hiddenSummary = await member.rpc('get_shift_staffing_summary', { p_shift_ids: [hidden.id] })
    assert.equal(hiddenSummary.error, null); assert.deepEqual(hiddenSummary.data, [])
    const hiddenCandidates = await member.rpc('get_swap_exchange_candidates', { p_shift_id: hidden.id, p_role: 'host' })
    assert.equal(hiddenCandidates.error?.code, '42501')
    const missing = await member.rpc('get_report_revisions', { p_report_id: 'QA_NONEXISTENT_REPORT' })
    assert.equal(missing.error?.message, 'REPORT_NOT_FOUND')
  } finally { await Promise.all(clients.map(client => client.auth.signOut())) }
})
