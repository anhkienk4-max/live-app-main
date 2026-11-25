/* eslint-disable @typescript-eslint/no-require-imports -- source contract test uses Node's built-in test runner. */
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20261125175702_rc19_w4_delta_d_note_workflow_v1.sql'), 'utf8')
const handler = readFileSync(join(process.cwd(), 'lib/server/shiftOperationalNoteWorkflowHandler.ts'), 'utf8')

test('preserves legacy notes while supporting multiple segment-aware rows per shift', () => {
  assert.match(migration, /workflow_state text NOT NULL DEFAULT 'submitted'/)
  assert.match(migration, /staffing_segment_id text NULL REFERENCES public\.shift_staffing_segments\(id\)/)
  assert.match(migration, /canonical_incident_id uuid NULL REFERENCES private\.rc19_staff_incidents\(id\)/)
  assert.doesNotMatch(migration, /UNIQUE\s*\(\s*shift_id\s*\)/i)
})

test('uses row lock, expected-version CAS and actor-scoped payload-bound idempotency', () => {
  assert.match(migration, /FOR UPDATE/i)
  assert.match(migration, /'NOTE_VERSION_CONFLICT' USING ERRCODE = '40001'/)
  assert.match(migration, /PRIMARY KEY \(actor_id, idempotency_key\)/)
  assert.match(migration, /request_payload IS DISTINCT FROM v_payload/)
  assert.match(migration, /Authorization is deliberately evaluated before idempotency replay/)
})

test('keeps revision history append-only and read-scoped', () => {
  assert.match(migration, /UNIQUE \(note_id, version\)/)
  assert.match(migration, /CREATE POLICY shift_operational_note_revisions_read_policy/)
  assert.match(migration, /private\.can_read_shift_operational_notes\(n\.shift_id\)/)
  assert.match(migration, /v_permission NOT IN \('admin','leader'\)/)
})

test('requires an authenticated RPC and authorized readback before API success', () => {
  assert.match(handler, /client\.rpc\('mutate_shift_operational_note_v1'/)
  assert.match(handler, /\.from\('shift_operational_notes'\)/)
  assert.match(handler, /SHIFT_NOTE_READBACK_REQUIRED/)
  assert.match(handler, /NOTE_VERSION_CONFLICT/)
})

test('keeps the SQL payload aligned with the declared RPC and typed HTTP contract', () => {
  assert.doesNotMatch(migration, /p_review_decision/)
  assert.match(migration, /'action',v_action/)
  assert.match(handler, /p_action: input\.action/)
  assert.doesNotMatch(handler, /p_review_decision/)
})
