import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireRole, authorizationErrorResponse, isAuthorizationError } from '@/lib/server/authGuards'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'

const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(80).optional(),
  department: z.string().trim().max(160).optional(),
  avatar_url: z.string().trim().url().max(1000).optional(),
  avatar_storage_path: z.string().trim().max(500).optional(),
  system_permission: z.enum(['admin', 'leader', 'member']).default('member'),
  operational_roles: z.array(z.enum(['host', 'support', 'technical'])).default([]),
  join_date: z.string().trim().date().optional(),
})

function errorResponse(message: string, status = 400, code = 'ACCOUNT_INVITE_FAILED') {
  return NextResponse.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function hasBusinessUserId(value: unknown): value is { id: string } {
  return value !== null
    && typeof value === 'object'
    && 'id' in value
    && typeof value.id === 'string'
    && value.id.length > 0
}

export async function POST(request: Request) {
  try {
    await requireRole(request, 'admin')
    const parsed = inviteSchema.safeParse(await request.json())
    if (!parsed.success) return errorResponse('Invalid staff invitation payload.', 400, 'STAFF_PAYLOAD_INVALID')

    const data = parsed.data
    const email = data.email.toLowerCase()
    const supabase = await createClient()
    const { data: existingBusinessUser, error: businessLookupError } = await supabase
      .from('business_users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (businessLookupError) return errorResponse('Unable to verify the staff directory.', 500)
    if (existingBusinessUser) return errorResponse('An account with this email already exists.', 409, 'ACCOUNT_EMAIL_EXISTS')

    const admin = createSupabaseAdminClient()
    const { data: authUsers, error: authLookupError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authLookupError) return errorResponse('Unable to verify the authentication directory.', 502, 'AUTH_PROVIDER_UNAVAILABLE')
    const authMatches = authUsers.users.filter(user => user.email?.trim().toLowerCase() === email)
    if (authMatches.length > 1) return errorResponse('Multiple authentication accounts match this email.', 409, 'ACCOUNT_EMAIL_AMBIGUOUS')
    if (authMatches.length === 1) return errorResponse('An account with this email already exists.', 409, 'ACCOUNT_EMAIL_EXISTS')

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: new URL('/auth/confirm?next=/reset-password', request.url).toString(),
    })
    if (inviteError || !invited.user) return errorResponse('Unable to send the account invitation.', 502, 'AUTH_INVITE_FAILED')

    const payload = {
      email,
      full_name: data.full_name,
      phone: data.phone,
      department: data.department,
      avatar_url: data.avatar_url,
      avatar_storage_path: data.avatar_storage_path,
      system_permission: data.system_permission,
      operational_roles: data.operational_roles,
      join_date: data.join_date,
    }
    const { data: businessUser, error: createError } = await supabase
      .rpc('create_staff_member_with_auth', {
        p_auth_user_id: invited.user.id,
        p_data: payload,
      })
      .maybeSingle()
    if (createError || !hasBusinessUserId(businessUser)) {
      await admin.auth.admin.deleteUser(invited.user.id, true)
      return errorResponse('Unable to create the linked staff record.', 502, 'BUSINESS_USER_CREATE_FAILED')
    }

    const existingMetadata = invited.user.app_metadata && typeof invited.user.app_metadata === 'object'
      ? invited.user.app_metadata
      : {}
    const { error: metadataError } = await admin.auth.admin.updateUserById(invited.user.id, {
      app_metadata: {
        ...existingMetadata,
        system_permission: data.system_permission,
        business_user_id: businessUser.id,
      },
    })
    if (metadataError) {
      await supabase.rpc('archive_staff_member', {
        p_user_id: businessUser.id,
        p_reason: 'Invitation metadata linking failed',
      })
      await admin.auth.admin.deleteUser(invited.user.id, true)
      return errorResponse('Unable to link the authentication account.', 502, 'AUTH_IDENTITY_LINK_FAILED')
    }

    return NextResponse.json({ ok: true, user: businessUser }, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    if (isAuthorizationError(error)) return authorizationErrorResponse(error)
    const message = error instanceof Error && error.message === 'AUTH_ADMIN_NOT_CONFIGURED'
      ? 'Account invitations are not configured on this server.'
      : 'Unable to complete the account invitation.'
    return errorResponse(message, 503, 'AUTH_ADMIN_NOT_CONFIGURED')
  }
}
