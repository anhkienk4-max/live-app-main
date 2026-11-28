import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = await readFile(new URL('../supabase/migrations/20261127100000_rc19_w4_segment_aware_swap_receipts.sql', import.meta.url), 'utf8')
const replayFixMigration = await readFile(new URL('../supabase/migrations/20261128110000_rc19_w4_swap_accept_replay_authorization.sql', import.meta.url), 'utf8')

const baseline = String.raw`
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA private;
CREATE TABLE public.business_users (
  id text PRIMARY KEY, status text NOT NULL, account_status text NOT NULL,
  system_permission text NOT NULL, deleted_at timestamptz, archived_at timestamptz
);
CREATE TABLE public.shifts (
  id text PRIMARY KEY, brand_id text NOT NULL, authoritative_agency_id text NOT NULL
);
CREATE TABLE public.shift_registrations (
  id text PRIMARY KEY, user_id text NOT NULL, shift_id text NOT NULL,
  status text NOT NULL, staffing_segment_id text, operational_role text NOT NULL
);
CREATE TABLE public.swap_requests (
  id text PRIMARY KEY, requester_id text NOT NULL, source_registration_id text NOT NULL,
  source_shift_id text NOT NULL, target_shift_id text, counterpart_registration_id text,
  counterpart_id text, operational_role text NOT NULL, mode text NOT NULL, status text NOT NULL,
  reason text NOT NULL, notes text, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(), version integer NOT NULL DEFAULT 1,
  responded_at timestamptz, responded_by text, approved_at timestamptz, approved_by text,
  completed_at timestamptz, shift_id text, original_staff_id text, replacement_staff_id text,
  new_host_id text, new_support_id text, new_technical_id text, approval_history jsonb NOT NULL DEFAULT '[]',
  deleted_at timestamptz, deleted_by text, deletion_reason text
);
CREATE TABLE public.swap_operation_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id text NOT NULL, action text NOT NULL, request_id text NOT NULL
);
CREATE TABLE public.test_agency_access (actor_id text NOT NULL, agency_id text NOT NULL, PRIMARY KEY (actor_id, agency_id));

CREATE FUNCTION private.current_business_user_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.actor_id', true), '')
$$;
CREATE FUNCTION private.current_business_user_is_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_users WHERE id = private.current_business_user_id()
    AND status = 'active' AND account_status = 'active' AND deleted_at IS NULL AND archived_at IS NULL)
$$;
CREATE FUNCTION private.current_system_permission() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT system_permission FROM public.business_users WHERE id = private.current_business_user_id()
$$;
CREATE FUNCTION private.is_leader_or_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.current_system_permission() IN ('leader', 'admin')
$$;
CREATE FUNCTION private.require_shift_actor(p_leader_required boolean) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='AUTHENTICATION_REQUIRED'; END IF;
  IF p_leader_required AND NOT private.is_leader_or_admin() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='OPERATION_NOT_ALLOWED';
  END IF;
  RETURN actor;
END;
$$;
CREATE FUNCTION private.rc19_has_any_leader_brand_scope(p_brand_id text, p_permissions text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_users WHERE id=private.current_business_user_id()
    AND system_permission='leader' AND status='active' AND account_status='active')
$$;
CREATE FUNCTION private.rc19_assert_swap_agency_scope(p_actor_id text, p_shift_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE required_agency_id text;
BEGIN
  SELECT authoritative_agency_id INTO required_agency_id FROM public.shifts WHERE id=p_shift_id;
  IF required_agency_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.test_agency_access AS access_row
      WHERE access_row.actor_id=p_actor_id AND access_row.agency_id=required_agency_id)
     OR NOT EXISTS (SELECT 1 FROM public.business_users WHERE id=p_actor_id AND status='active' AND account_status='active') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='RC19_AGENCY_MEMBERSHIP_REQUIRED';
  END IF;
END;
$$;

CREATE FUNCTION public.create_shift_swap_request(
  p_source_registration_id text,p_mode text,p_reason text,p_target_shift_id text,
  p_replacement_staff_id text,p_counterpart_registration_id text,p_notes text
) RETURNS public.swap_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id(); result public.swap_requests%ROWTYPE;
BEGIN
  IF NOT private.current_business_user_is_active() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ACTOR_INACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.shift_registrations WHERE id=p_source_registration_id AND user_id=actor) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SWAP_NOT_OWNER';
  END IF;
  PERFORM private.rc19_assert_swap_agency_scope(actor,(SELECT shift_id FROM public.shift_registrations WHERE id=p_source_registration_id));
  INSERT INTO public.swap_requests(id,requester_id,source_registration_id,source_shift_id,target_shift_id,
    counterpart_registration_id,counterpart_id,replacement_staff_id,operational_role,mode,status,reason,notes,shift_id)
  SELECT 'swap-' || (SELECT count(*)+1 FROM public.swap_requests),actor,registration.id,registration.shift_id,
    p_target_shift_id,p_counterpart_registration_id,
    (SELECT user_id FROM public.shift_registrations WHERE id=p_counterpart_registration_id),
    p_replacement_staff_id,registration.operational_role,p_mode,'pending',p_reason,p_notes,registration.shift_id
  FROM public.shift_registrations AS registration WHERE registration.id=p_source_registration_id
  RETURNING * INTO result;
  INSERT INTO public.swap_operation_log(actor_id,action,request_id) VALUES(actor,'create',result.id);
  RETURN result;
END;
$$;
CREATE FUNCTION public.approve_shift_swap_request(p_request_id text,p_notes text) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='UNFENCED_APPROVE_SHOULD_NOT_BE_CALLED'; END;
$$;
CREATE FUNCTION public.approve_shift_swap_request(p_request_id text,p_notes text,p_expected_version integer) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id(); result public.swap_requests%ROWTYPE;
BEGIN
  PERFORM private.require_shift_actor(true);
  UPDATE public.swap_requests SET status='completed',approved_by=actor,approved_at=statement_timestamp(),
    version=version+1,updated_at=statement_timestamp() WHERE id=p_request_id AND version=p_expected_version
    RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='SWAP_VERSION_CONFLICT'; END IF;
  INSERT INTO public.swap_operation_log(actor_id,action,request_id) VALUES(actor,'approve',result.id);
  RETURN result;
END;
$$;
CREATE FUNCTION public.respond_shift_swap_request(p_request_id text,p_action text,p_notes text) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='UNFENCED_RESPOND_SHOULD_NOT_BE_CALLED'; END;
$$;
CREATE FUNCTION public.respond_shift_swap_request(p_request_id text,p_action text,p_notes text,p_expected_version integer) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id(); result public.swap_requests%ROWTYPE;
BEGIN
  UPDATE public.swap_requests SET status=CASE WHEN p_action='accept' THEN 'accepted' ELSE 'rejected' END,
    responded_by=actor,responded_at=statement_timestamp(),version=version+1,updated_at=statement_timestamp()
  WHERE id=p_request_id AND version=p_expected_version AND status='pending'
    AND CASE WHEN mode='replacement' THEN replacement_staff_id=actor ELSE counterpart_id=actor END
  RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SWAP_NOT_COUNTERPART'; END IF;
  INSERT INTO public.swap_operation_log(actor_id,action,request_id) VALUES(actor,'respond_'||p_action,result.id);
  RETURN result;
END;
$$;
CREATE FUNCTION public.reject_shift_swap_request(p_request_id text,p_notes text) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='UNFENCED_REJECT_SHOULD_NOT_BE_CALLED'; END;
$$;
CREATE FUNCTION public.reject_shift_swap_request(p_request_id text,p_notes text,p_expected_version integer) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id(); result public.swap_requests%ROWTYPE;
BEGIN
  PERFORM private.require_shift_actor(true);
  UPDATE public.swap_requests SET status='rejected',approved_by=actor,approved_at=statement_timestamp(),
    version=version+1,updated_at=statement_timestamp() WHERE id=p_request_id AND version=p_expected_version
    RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='SWAP_VERSION_CONFLICT'; END IF;
  INSERT INTO public.swap_operation_log(actor_id,action,request_id) VALUES(actor,'reject',result.id);
  RETURN result;
END;
$$;
CREATE FUNCTION public.cancel_own_shift_swap_request(p_request_id text,p_reason text) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='UNFENCED_CANCEL_SHOULD_NOT_BE_CALLED'; END;
$$;
CREATE FUNCTION public.cancel_own_shift_swap_request(p_request_id text,p_reason text,p_expected_version integer) RETURNS public.swap_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor text := private.current_business_user_id(); result public.swap_requests%ROWTYPE;
BEGIN
  UPDATE public.swap_requests SET status='cancelled',version=version+1,updated_at=statement_timestamp()
    WHERE id=p_request_id AND version=p_expected_version AND requester_id=actor RETURNING * INTO result;
  IF result.id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='SWAP_NOT_OWNER'; END IF;
  INSERT INTO public.swap_operation_log(actor_id,action,request_id) VALUES(actor,'cancel',result.id);
  RETURN result;
END;
$$;
`

async function createDatabase() {
  const db = new PGlite()
  await db.exec(baseline)
  await db.exec(migration)
  await db.exec(replayFixMigration)
  await db.exec(`
    INSERT INTO public.business_users(id,status,account_status,system_permission) VALUES
      ('member-a','active','active','member'),('member-b','active','active','member'),
      ('leader-a','active','active','leader'),('revoked-a','inactive','inactive','member');
    INSERT INTO public.shifts(id,brand_id,authoritative_agency_id) VALUES
      ('shift-a','brand-a','agency-a'),('shift-b','brand-a','agency-a'),('shift-x','brand-x','agency-x');
    INSERT INTO public.shift_registrations(id,user_id,shift_id,status,staffing_segment_id,operational_role) VALUES
      ('reg-a','member-a','shift-a','approved','segment-a','host'),
      ('reg-b','member-b','shift-a','approved','segment-a','host'),
      ('reg-x','member-b','shift-x','approved','segment-x','host');
    INSERT INTO public.test_agency_access(actor_id,agency_id) VALUES
      ('member-a','agency-a'),('member-b','agency-a'),('member-b','agency-x'),('leader-a','agency-a');
  `)
  return db
}

async function run(db, actor, action, requestId, payload, key) {
  await db.query(`SELECT set_config('app.actor_id', $1, false)`, [actor])
  const result = await db.query(
    `SELECT to_jsonb(public.shift_swap_operation_v1($1,$2,$3::jsonb,$4::uuid)) AS value`,
    [action, requestId, JSON.stringify(payload), key],
  )
  return result.rows[0].value
}

test('same-key retries and concurrent identical calls return one committed result', async (t) => {
  const db = await createDatabase()
  t.after(() => db.close())
  const payload = {
    source_registration_id: 'reg-a', mode: 'replacement', reason: 'coverage',
    target_shift_id: null, replacement_staff_id: 'member-b', counterpart_registration_id: null, notes: null,
  }
  const key = '11111111-1111-4111-8111-111111111111'
  const results = await Promise.all([
    run(db,'member-a','create',null,payload,key),
    run(db,'member-a','create',null,payload,key),
  ])
  assert.equal(results[0].id, results[1].id)
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.swap_requests')).rows[0].count, 1)
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.swap_operation_log')).rows[0].count, 1)
  const receipt = (await db.query('SELECT response FROM private.rc19_swap_operation_receipts WHERE actor_id=$1 AND idempotency_key=$2::uuid', ['member-a',key])).rows[0]
  assert.deepEqual(receipt.response, results[0])
})

test('replacement PASS accept receipt replays after status transition with live authorization', async (t) => {
  const db = await createDatabase()
  t.after(() => db.close())
  const createPayload = {
    source_registration_id:'reg-a',mode:'replacement',reason:'coverage',target_shift_id:null,
    replacement_staff_id:'member-b',counterpart_registration_id:null,notes:'create receipt',
  }
  const createKey = '55555555-5555-4555-8555-555555555555'
  const created = await run(db,'member-a','create',null,createPayload,createKey)
  const acceptPayload = { expected_version:1, notes:'accepted candidate' }
  const acceptKey = '66666666-6666-4666-8666-666666666666'
  const accepted = await run(db,'member-b','accept',created.id,acceptPayload,acceptKey)
  assert.equal(accepted.status, 'accepted')
  assert.equal(accepted.responded_by, 'member-b')
  assert.equal(accepted.counterpart_id, null)
  assert.equal(accepted.replacement_staff_id, 'member-b')

  const replay = await run(db,'member-b','accept',created.id,acceptPayload,acceptKey)
  assert.deepEqual(replay, accepted)
  await assert.rejects(
    () => run(db,'member-b','accept',created.id,{...acceptPayload,notes:'changed'},acceptKey),
    /SWAP_IDEMPOTENCY_KEY_REUSED/u,
  )
  await assert.rejects(
    () => run(db,'member-b','respond_reject',created.id,acceptPayload,acceptKey),
    /SWAP_IDEMPOTENCY_KEY_REUSED/u,
  )
  await assert.rejects(
    () => run(db,'member-a','accept',created.id,acceptPayload,acceptKey),
    /SWAP_NOT_COUNTERPART/u,
  )
  await assert.rejects(
    () => run(db,'member-b','accept',created.id,{...acceptPayload,expected_version:1},'77777777-7777-4777-8777-777777777777'),
    /SWAP_NOT_COUNTERPART/u,
  )
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.swap_requests')).rows[0].count, 1)
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM private.rc19_swap_operation_receipts')).rows[0].count, 2)
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.swap_operation_log')).rows[0].count, 2)

  await db.exec("DELETE FROM public.test_agency_access WHERE actor_id='member-b' AND agency_id='agency-a'")
  await assert.rejects(() => run(db,'member-b','accept',created.id,acceptPayload,acceptKey),
    /RC19_AGENCY_MEMBERSHIP_REQUIRED/u)
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM private.rc19_swap_operation_receipts')).rows[0].count, 2)
})

test('same actor cannot reuse a key with changed payload', async (t) => {
  const db = await createDatabase()
  t.after(() => db.close())
  const payload = {
    source_registration_id:'reg-a',mode:'replacement',reason:'coverage',target_shift_id:null,
    replacement_staff_id:'member-b',counterpart_registration_id:null,notes:null,
  }
  const key = '22222222-2222-4222-8222-222222222222'
  await run(db,'member-a','create',null,payload,key)
  await assert.rejects(
    () => run(db,'member-a','create',null,{...payload,reason:'changed payload'},key),
    /SWAP_IDEMPOTENCY_KEY_REUSED/u,
  )
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.swap_operation_log')).rows[0].count, 1)
})

test('revoked and cross-Agency actors cannot replay a committed receipt', async (t) => {
  const db = await createDatabase()
  t.after(() => db.close())
  const payload = {
    source_registration_id:'reg-a',mode:'replacement',reason:'coverage',target_shift_id:null,
    replacement_staff_id:'member-b',counterpart_registration_id:null,notes:null,
  }
  const key = '33333333-3333-4333-8333-333333333333'
  await run(db,'member-a','create',null,payload,key)
  await db.exec("UPDATE public.business_users SET status='inactive',account_status='inactive' WHERE id='member-a'")
  await assert.rejects(() => run(db,'member-a','create',null,payload,key), /SWAP_ACTOR_NOT_AUTHORIZED/u)
  await db.exec("UPDATE public.business_users SET status='active',account_status='active' WHERE id='member-a'")
  await db.exec("DELETE FROM public.test_agency_access WHERE actor_id='member-a' AND agency_id='agency-a'")
  await assert.rejects(() => run(db,'member-a','create',null,payload,key), /RC19_AGENCY_MEMBERSHIP_REQUIRED/u)
})

test('a different actor cannot read or replay another actor receipt', async (t) => {
  const db = await createDatabase()
  t.after(() => db.close())
  const payload = {
    source_registration_id:'reg-a',mode:'replacement',reason:'coverage',target_shift_id:null,
    replacement_staff_id:'member-b',counterpart_registration_id:null,notes:null,
  }
  const key = '44444444-4444-4444-8444-444444444444'
  const result = await run(db,'member-a','create',null,payload,key)
  await assert.rejects(
    () => run(db,'member-b','cancel',result.id,{reason:'retry',expected_version:1},key),
    /SWAP_NOT_OWNER/u,
  )
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM private.rc19_swap_operation_receipts')).rows[0].count, 1)
})
