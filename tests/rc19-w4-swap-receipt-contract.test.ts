import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261127100000_rc19_w4_segment_aware_swap_receipts.sql', import.meta.url), 'utf8')
const service = readFileSync(new URL('../lib/services/supabaseSwapRequestService.ts', import.meta.url), 'utf8')

test('receipt storage binds actor, key, action, original request identity, payload, and committed row', () => {
  assert.match(migration, /PRIMARY KEY \(actor_id, idempotency_key\)/u)
  assert.match(migration, /action text NOT NULL CHECK \(action IN \('create','approve','accept','respond_reject','reject','cancel'\)\)/u)
  assert.match(migration, /request_id text,[\s\S]*request_payload jsonb NOT NULL[\s\S]*response jsonb NOT NULL/u)
  assert.match(migration, /INSERT INTO private\.rc19_swap_operation_receipts\([\s\S]*to_jsonb\(result_row\)/u)
  assert.match(migration, /hashtextextended\(v_actor_id \|\| ':' \|\| p_idempotency_key::text, 91732\)/u)
  assert.match(migration, /SWAP_IDEMPOTENCY_KEY_REUSED/u)
  assert.match(migration, /request_payload IS DISTINCT FROM payload/u)
})

test('receipt replay checks current active actor and action-specific identity and Agency scope', () => {
  assert.match(migration, /NOT private\.current_business_user_is_active\(\)[\s\S]*SWAP_RECEIPT_REPLAY_ACTOR_INACTIVE/u)
  assert.match(migration, /live_request\.requester_id IS DISTINCT FROM saved_request\.requester_id/u)
  assert.match(migration, /live_request\.source_registration_id IS DISTINCT FROM saved_request\.source_registration_id/u)
  assert.match(migration, /live_request\.counterpart_registration_id IS DISTINCT FROM saved_request\.counterpart_registration_id/u)
  assert.match(migration, /private\.rc19_assert_swap_agency_scope\(p_actor_id, live_request\.source_shift_id\)/u)
  assert.match(migration, /private\.rc19_has_any_leader_brand_scope\(source_shift\.brand_id, ARRAY\['shifts\.manage'\]::text\[\]\)/u)
  assert.match(migration, /live_request\.counterpart_id IS DISTINCT FROM p_actor_id/u)
  assert.match(migration, /live_request\.requester_id IS DISTINCT FROM p_actor_id/u)
})

test('all authenticated mutations use the receipt RPC and legacy direct mutation grants are retired', () => {
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.shift_swap_operation_v1\(text,text,jsonb,uuid\) TO authenticated/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_shift_swap_request\(text,text,text,text,text,text,text\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.respond_shift_swap_request\(text,text,text,integer\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.approve_shift_swap_request\(text,text,integer\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.reject_shift_swap_request\(text,text,integer\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.cancel_own_shift_swap_request\(text,text,integer\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(service, /client\.rpc\('shift_swap_operation_v1'/u)
  assert.doesNotMatch(service, /client\.rpc\('(create_shift_swap_request|approve_shift_swap_request|respond_shift_swap_request|reject_shift_swap_request|cancel_own_shift_swap_request)'/u)
})

test('uncertain transport retry retains the same UUID key and does not silently fall back', () => {
  assert.match(service, /sessionStorage\.setItem\(slot, JSON\.stringify\(\{ key \}\)\)/u)
  assert.match(service, /A transport exception can occur after PostgreSQL committed/u)
  assert.match(service, /so a retry replays the same transaction and response/u)
  assert.match(service, /SWAP_IDEMPOTENCY_KEY_INVALID/u)
  assert.doesNotMatch(service, /fallback to legacy RPC/u)
})
