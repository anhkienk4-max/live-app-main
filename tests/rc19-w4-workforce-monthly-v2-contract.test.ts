import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261126140000_rc19_w4_workforce_monthly_scope_totals.sql', import.meta.url), 'utf8')

test('monthly v2 computes distinct totals from the filtered complete scope before paging', () => {
  assert.match(migration, /WITH scoped AS MATERIALIZED/u)
  assert.match(migration, /'totalDistinctShifts', \(SELECT count\(DISTINCT shift_id\)::integer FROM scoped\)/u)
  assert.match(migration, /'totalDistinctStaff', \(SELECT count\(DISTINCT staff_id\)::integer FROM scoped\)/u)
  assert.match(migration, /LIMIT p_limit OFFSET p_offset/u)
  assert.match(migration, /paged AS \(\s*SELECT \* FROM scoped[\s\S]*?LIMIT p_limit OFFSET p_offset/u)
  assert.ok(!/sum\(distinct_shift_count\)/iu.test(migration), 'per-staff distinct counts must not be summed')
})

test('monthly v2 applies agency, brand, role, platform, status, type, and identity scope before aggregation', () => {
  for (const predicate of [
    's.authoritative_agency_id = p_agency_id', 's.brand_id = p_brand_id',
    'i.operational_role = p_role', 's.platform_id = p_platform_id',
    'i.review_state = p_review_state', 'i.incident_type = p_incident_type',
    'i.original_staff_id = v_staff_id',
  ]) assert.ok(migration.includes(predicate), `missing scope predicate ${predicate}`)
  assert.match(migration, /private\.rc19_has_leader_brand_scope\(s\.brand_id, 'workforce\.read'\)/u)
  assert.match(migration, /private\.rc19_has_active_agency_membership\(v_actor, s\.authoritative_agency_id\)/u)
  assert.match(migration, /WORKFORCE_SELF_SCOPE_REQUIRED/u)
})

test('monthly v2 retains separate review/PASS/SWAP and late-minute aggregates', () => {
  for (const field of [
    'pending_count', 'confirmed_count', 'rejected_count', 'corrected_count',
    'approved_pass_count', 'approved_swap_count', 'unknown_late_minutes_count',
    'verified_late_minutes_total', 'distinct_shift_count',
  ]) assert.ok(migration.includes(field), `missing ${field}`)
})
