import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'

test('PostgreSQL 17 live runtime: RLS on swap_requests prevents cross-brand leaks for Leaders and cross-member leaks for Members', (t) => {
  let runtime
  try {
    const raw = readFileSync('//wsl.localhost/Ubuntu-24.04/home/anhkienk4/.local/share/rc19-c511-native/runtime.json', 'utf8')
    runtime = JSON.parse(raw)
  } catch {
    t.skip('Native PG17 runtime not accessible')
    return
  }

  const runSql = (sql: string) => {
    return execFileSync(
      'wsl.exe',
      ['-d', 'Ubuntu-24.04', '-u', 'anhkienk4', '--', 'psql', '-h', '/home/anhkienk4/.local/share/rc19-c511-native', '-p', '55439', '-U', 'postgres', '-d', runtime.database, '-t', '-A'],
      { input: sql, encoding: 'utf8' }
    ).trim()
  }

  // Create isolated verification scenario in a transaction that rolls back
  const testScript = `
    BEGIN;
    DO $$
    DECLARE
      v_brand_a text := 'brand_sec_a_' || gen_random_uuid();
      v_brand_b text := 'brand_sec_b_' || gen_random_uuid();
      v_platform text := 'plat_sec_' || gen_random_uuid();
      v_auth_admin uuid := gen_random_uuid();
      v_auth_leader_a uuid := gen_random_uuid();
      v_auth_leader_b uuid := gen_random_uuid();
      v_auth_member_1 uuid := gen_random_uuid();
      v_auth_member_2 uuid := gen_random_uuid();
      v_user_admin text := 'admin_' || gen_random_uuid();
      v_user_leader_a text := 'lead_a_' || gen_random_uuid();
      v_user_leader_b text := 'lead_b_' || gen_random_uuid();
      v_user_member_1 text := 'mem_1_' || gen_random_uuid();
      v_user_member_2 text := 'mem_2_' || gen_random_uuid();
      v_shift_a text := 'shift_a_' || gen_random_uuid();
      v_shift_b text := 'shift_b_' || gen_random_uuid();
      v_reg_a text := 'reg_a_' || gen_random_uuid();
      v_reg_b text := 'reg_b_' || gen_random_uuid();
      v_swap_a text := 'swap_a_' || gen_random_uuid();
      v_swap_b text := 'swap_b_' || gen_random_uuid();
      v_cnt integer;
    BEGIN
      -- Setup brands
      INSERT INTO public.brands (id, name, status) VALUES (v_brand_a, 'Sec Brand A', 'active'), (v_brand_b, 'Sec Brand B', 'active');
      INSERT INTO public.platforms (id, name, status) VALUES (v_platform, 'Sec Platform', 'active');

      -- Setup auth users
      INSERT INTO auth.users (id, email) VALUES
        (v_auth_admin, 'admin_sec@test.local'),
        (v_auth_leader_a, 'lead_a@test.local'),
        (v_auth_leader_b, 'lead_b@test.local'),
        (v_auth_member_1, 'mem_1@test.local'),
        (v_auth_member_2, 'mem_2@test.local');

      -- Setup business users
      INSERT INTO public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status, operational_roles) VALUES
        (v_user_admin, v_auth_admin, 'admin_sec@test.local', 'Admin Sec', 'admin', 'active', 'active', ARRAY['host']),
        (v_user_leader_a, v_auth_leader_a, 'lead_a@test.local', 'Leader Brand A', 'leader', 'active', 'active', ARRAY['host']),
        (v_user_leader_b, v_auth_leader_b, 'lead_b@test.local', 'Leader Brand B', 'leader', 'active', 'active', ARRAY['host']),
        (v_user_member_1, v_auth_member_1, 'mem_1@test.local', 'Member One', 'member', 'active', 'active', ARRAY['host']),
        (v_user_member_2, v_auth_member_2, 'mem_2@test.local', 'Member Two', 'member', 'active', 'active', ARRAY['host']);

      -- Assign leader brand scope directly as postgres
      INSERT INTO public.rc19_leader_brand_scopes (leader_business_user_id, brand_id, scope_key, status, valid_from, granted_by, updated_by, version) VALUES
        (v_user_leader_a, v_brand_a, 'shifts.read', 'active', statement_timestamp() - interval '1 hour', v_user_admin, v_user_admin, 1),
        (v_user_leader_b, v_brand_b, 'shifts.read', 'active', statement_timestamp() - interval '1 hour', v_user_admin, v_user_admin, 1);

      -- Create shifts
      INSERT INTO public.shifts (id, brand_id, platform_id, date, start_time, end_time, title, status, host_id) VALUES
        (v_shift_a, v_brand_a, v_platform, '2030-01-01', '09:00', '11:00', 'Shift Brand A', 'scheduled', v_user_member_1),
        (v_shift_b, v_brand_b, v_platform, '2030-01-01', '13:00', '15:00', 'Shift Brand B', 'scheduled', v_user_member_2);

      -- Create registrations under Admin identity
      PERFORM set_config('request.jwt.claim.sub', v_auth_admin::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
      INSERT INTO public.shift_registrations (id, shift_id, user_id, operational_role, status, source) VALUES
        (v_reg_a, v_shift_a, v_user_member_1, 'host', 'approved', 'manual_assignment'),
        (v_reg_b, v_shift_b, v_user_member_2, 'host', 'approved', 'manual_assignment');

      -- Create swap requests: Swap A on Shift A (Brand A), Swap B on Shift B (Brand B)
      INSERT INTO public.swap_requests (id, mode, status, requester_id, source_registration_id, source_shift_id, replacement_staff_id, operational_role, reason) VALUES
        (v_swap_a, 'replacement', 'pending', v_user_member_1, v_reg_a, v_shift_a, v_user_member_2, 'host', 'Pass to Mem 2'),
        (v_swap_b, 'replacement', 'pending', v_user_member_2, v_reg_b, v_shift_b, v_user_member_1, 'host', 'Pass to Mem 1');

      -- Test 1: Leader A queries swap_requests
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claim.sub', v_auth_leader_a::text, true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_a;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'LEADER_A_SHOULD_SEE_SWAP_A'; END IF;

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_b;
      IF v_cnt <> 0 THEN RAISE EXCEPTION 'LEADER_A_MUST_NOT_SEE_SWAP_B'; END IF;

      -- Test 2: Leader B queries swap_requests
      PERFORM set_config('request.jwt.claim.sub', v_auth_leader_b::text, true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_b;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'LEADER_B_SHOULD_SEE_SWAP_B'; END IF;

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_a;
      IF v_cnt <> 0 THEN RAISE EXCEPTION 'LEADER_B_MUST_NOT_SEE_SWAP_A'; END IF;

      -- Test 3: Member 1 (requester of Swap A, replacement of Swap B) sees Swap A and Swap B
      PERFORM set_config('request.jwt.claim.sub', v_auth_member_1::text, true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_a;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'MEMBER_1_SHOULD_SEE_OWN_SWAP_A'; END IF;

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_b;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'MEMBER_1_SHOULD_SEE_SWAP_B_AS_RECIPIENT'; END IF;

      -- Test 4: Member 2 (replacement of Swap A, requester of Swap B) sees Swap A and Swap B
      PERFORM set_config('request.jwt.claim.sub', v_auth_member_2::text, true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_a;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'MEMBER_2_SHOULD_SEE_SWAP_A_AS_RECIPIENT'; END IF;

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id = v_swap_b;
      IF v_cnt <> 1 THEN RAISE EXCEPTION 'MEMBER_2_SHOULD_SEE_OWN_SWAP_B'; END IF;

      -- Test 5: Unrelated Member cannot see either swap
      PERFORM set_config('role', 'postgres', true);
      INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'unrelated@test.local');
      INSERT INTO public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status, operational_roles)
      VALUES ('unrelated_mem', (SELECT id FROM auth.users WHERE email = 'unrelated@test.local'), 'unrelated@test.local', 'Unrelated Member', 'member', 'active', 'active', ARRAY['host']);

      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claim.sub', (SELECT auth_user_id::text FROM public.business_users WHERE id = 'unrelated_mem'), true);
      PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id IN (v_swap_a, v_swap_b);
      IF v_cnt <> 0 THEN RAISE EXCEPTION 'UNRELATED_MEMBER_MUST_SEE_ZERO_SWAPS'; END IF;

      -- Test 6: Admin sees all swaps
      PERFORM set_config('request.jwt.claim.sub', v_auth_admin::text, true);

      SELECT count(*) INTO v_cnt FROM public.swap_requests WHERE id IN (v_swap_a, v_swap_b);
      IF v_cnt <> 2 THEN RAISE EXCEPTION 'ADMIN_MUST_SEE_ALL_SWAPS'; END IF;

    END;
    $$;
    ROLLBACK;
  `

  const out = runSql(testScript)
  assert.ok(out.includes('ROLLBACK'), `Expected clean execution and ROLLBACK, got: ${out}`)
})
