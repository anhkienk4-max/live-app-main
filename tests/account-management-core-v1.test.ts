import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { isAuthBusinessIdentityConsistent } from '../lib/auth/authIdentity.ts'
import { isPublicAuthPath } from '../lib/supabase/middleware.ts'

const migrationPath = new URL('../supabase/migrations/20260827100000_core_account_lifecycle.sql', import.meta.url)

test('Core V1 migration links an existing Auth UUID and cannot be called anonymously', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /create or replace function public\.create_staff_member_with_auth\(\s*p_auth_user_id uuid,\s*p_data jsonb/i)
  assert.match(sql, /from auth\.users where id = p_auth_user_id/i)
  assert.match(sql, /auth_user_id, email, full_name/i)
  assert.match(sql, /revoke all on function public\.create_staff_member_with_auth\(uuid, jsonb\) from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.create_staff_member_with_auth\(uuid, jsonb\) to authenticated/i)
  assert.match(sql, /private\.require_staff_admin\(\)/i)
  assert.match(sql, /create or replace function public\.sync_staff_auth_metadata\(p_user_id text\)/i)
  assert.match(sql, /raw_app_meta_data = v_existing\s*\|\|\s*jsonb_build_object\('system_permission'/i)
  assert.match(sql, /grant execute on function public\.sync_staff_auth_metadata\(text\) to authenticated/i)
})

test('identity reconciliation fails closed when Auth and business email differ', () => {
  const identity = {
    auth_user_id: 'auth-1',
    email: 'person@example.com',
    system_permission: 'member' as const,
    business_user_id: 'business-1',
  }
  const businessUser = {
    id: 'business-1',
    email: 'different@example.com',
    full_name: 'Person',
    role: 'staff' as const,
    system_permission: 'member' as const,
    operational_roles: [],
    status: 'active' as const,
    account_status: 'active' as const,
    join_date: '2026-08-27',
    created_at: '',
    updated_at: '',
  }
  assert.equal(isAuthBusinessIdentityConsistent(identity, businessUser), false)
})

test('password recovery uses Supabase APIs and never stores a password', async () => {
  const forgot = await readFile(new URL('../app/forgot-password/page.tsx', import.meta.url), 'utf8')
  const reset = await readFile(new URL('../app/reset-password/page.tsx', import.meta.url), 'utf8')
  assert.match(forgot, /resetPasswordForEmail/)
  assert.match(reset, /updateUser\(\{ password \}\)/)
  assert.doesNotMatch(forgot + reset, /localStorage.*password|sessionStorage.*password/i)
})

test('invite endpoint is server-authorized and uses the server-only secret client', async () => {
  const route = await readFile(new URL('../app/api/staff/invite/route.ts', import.meta.url), 'utf8')
  const admin = await readFile(new URL('../lib/server/supabaseAdmin.ts', import.meta.url), 'utf8')
  assert.match(route, /requireRole\(request, 'admin'\)/)
  assert.match(route, /create_staff_member_with_auth/)
  assert.match(route, /inviteUserByEmail/)
  assert.match(admin, /SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(route + admin, /NEXT_PUBLIC_SUPABASE_ANON_KEY.*SECRET|service_role.*NEXT_PUBLIC/i)
})

test('invite and recovery callback routes remain public auth boundaries', () => {
  for (const path of ['/login', '/forgot-password', '/reset-password', '/auth/auth-code-error']) {
    assert.equal(isPublicAuthPath(path), true)
  }
})
