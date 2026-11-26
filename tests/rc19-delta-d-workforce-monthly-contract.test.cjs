/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner requires CommonJS in this .cjs file. */
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const migration = readFileSync(path.join(__dirname, '../supabase/migrations/20261125175629_rc19_w4_delta_d_workforce_monthly_read_model.sql'), 'utf8')

test('D3 monthly read function is an authenticated security-definer with pinned search_path', () => {
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path\s*=\s*''/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.rc19_workforce_incident_monthly\(date, text, text, text, integer, integer\)\s+FROM PUBLIC, anon, service_role/u)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.rc19_workforce_incident_monthly\(date, text, text, text, integer, integer\)\s+TO authenticated/u)
  assert.match(migration, /WORKFORCE_SELF_SCOPE_REQUIRED/u)
  assert.match(migration, /rc19_has_leader_brand_scope\(p_brand_id, 'workforce\.read'\)/u)
  assert.match(migration, /private\.rc19_has_leader_brand_scope\(s\.brand_id, 'workforce\.read'\)/u)
})

test('D3 registers an Admin-only global permission and scopes Leaders by active Brand grants', () => {
  assert.match(migration, /\('workforce\.read', '\{"member":false,"leader":false,"admin":true\}', true, '\{\}', '\{\}', '\{\}'\)/u)
  assert.match(migration, /WORKFORCE_READ_PERMISSION_CONFIGURATION_CONFLICT/u)
  const leaderBranch = migration.slice(
    migration.indexOf("ELSIF v_permission = 'leader' THEN"),
    migration.indexOf('WITH scoped AS MATERIALIZED'),
  )
  assert.ok(leaderBranch.length > 0)
  assert.ok(!leaderBranch.includes('rbac01_effective_permission'))
  assert.match(leaderBranch, /rc19_has_leader_brand_scope\(p_brand_id, 'workforce\.read'\)/u)
})

test('D3 monthly summary separates review states, approved PASS/SWAP and unknown late duration', () => {
  for (const field of [
    'pending_count', 'confirmed_count', 'rejected_count', 'corrected_count',
    'approved_pass_count', 'approved_swap_count', 'unknown_late_minutes_count',
    'verified_late_minutes_total', 'distinct_shift_count',
  ]) assert.ok(migration.includes(field), `missing summary field ${field}`)
  assert.match(migration, /verified_late_minutes IS NULL/u)
  assert.match(migration, /WHEN review_state = 'confirmed' AND incident_type = 'late'[\s\S]*THEN verified_late_minutes/u)
  assert.match(migration, /incident_type = 'approved_pass'/u)
  assert.match(migration, /incident_type = 'approved_swap'/u)
  assert.match(migration, /LIMIT p_limit OFFSET p_offset/u)
})

test('D3 public projection excludes incident reason and evidence references', () => {
  const projection = migration.slice(migration.indexOf('jsonb_build_object(\n        \'incidentId\''), migration.indexOf(') AS items'))
  assert.ok(projection.includes('incidentId'))
  assert.ok(!projection.includes('reason'))
  assert.ok(!projection.includes('evidence_reference_id'))
})
