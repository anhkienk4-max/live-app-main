import 'server-only'

import {
  isAuthorizationError,
  requireRole,
  resolveServerUser,
  type ServerUserResolutionDiagnostics,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  createFileProviderRegistry,
  isFileProviderConfigured,
} from '@/lib/server/fileProviderRegistry'
import {
  FileProviderError,
  isFileStorageEnabled,
} from '@/lib/server/fileProviderResolver'
import { resolveGoogleDriveAuthMode } from '@/lib/server/googleDriveAuth'

type Environment = Record<string, string | undefined>

function present(env: Environment, name: string) {
  return Boolean(env[name]?.trim())
}

function safeErrorCode(error: unknown, fallback: string) {
  const code = error instanceof FileProviderError ? error.code : fallback
  return /^[A-Z][A-Z0-9_]*$/.test(code) ? code : fallback
}

function authDiagnostics(
  request: Request,
  env: Environment,
  resolution: ServerUserResolutionDiagnostics,
) {
  return {
    supabase_url_present: present(env, 'NEXT_PUBLIC_SUPABASE_URL'),
    supabase_anon_key_present: present(env, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    auth_cookie_present: Boolean(request.headers.get('cookie')?.trim()),
    authenticated_user_resolved: resolution.authenticatedUserResolved,
    business_user_mapped: resolution.businessUserMapped,
  }
}

function providerDiagnostics(env: Environment) {
  const googleDriveAuth = (() => {
    try {
      return { auth_mode: resolveGoogleDriveAuthMode(env) }
    } catch (error) {
      return {
        auth_mode: 'configuration_error',
        configuration_error: safeErrorCode(error, 'GOOGLE_DRIVE_AUTH_FAILED'),
      }
    }
  })()

  const googleDrive = {
    ...googleDriveAuth,
    root_folder_id_present: present(env, 'GOOGLE_DRIVE_ROOT_FOLDER_ID'),
    client_id_present: present(env, 'GOOGLE_DRIVE_CLIENT_ID'),
    client_secret_present: present(env, 'GOOGLE_DRIVE_CLIENT_SECRET'),
    refresh_token_present: present(env, 'GOOGLE_DRIVE_REFRESH_TOKEN'),
    service_account_email_present: present(env, 'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL'),
    private_key_present: present(env, 'GOOGLE_DRIVE_PRIVATE_KEY'),
    configured: isFileProviderConfigured('google_drive', env),
  }
  const onedrive = {
    client_id_present: present(env, 'ONEDRIVE_CLIENT_ID'),
    client_secret_present: present(env, 'ONEDRIVE_CLIENT_SECRET'),
    refresh_token_present: present(env, 'ONEDRIVE_REFRESH_TOKEN'),
    tenant_id_present: present(env, 'ONEDRIVE_TENANT_ID'),
    configured: isFileProviderConfigured('onedrive', env),
  }

  try {
    const registry = createFileProviderRegistry({ env })
    const availability = registry.getAvailability()
    return {
      file_storage_enabled: isFileStorageEnabled(env),
      file_provider: registry.defaultProviderName,
      google_drive: googleDrive,
      onedrive,
      registry: {
        default_provider: registry.defaultProviderName,
        google_drive_available: availability.google_drive,
        onedrive_available: availability.onedrive,
      },
    }
  } catch (error) {
    const providerError = safeErrorCode(error, 'FILE_PROVIDER_CONFIGURATION_ERROR')
    return {
      file_storage_enabled: isFileStorageEnabled(env),
      file_provider: providerError,
      google_drive: googleDrive,
      onedrive,
      registry: {
        default_provider: providerError,
        google_drive_available: googleDrive.configured,
        onedrive_available: onedrive.configured,
      },
    }
  }
}

// TEMPORARY DEBUG CODE: remove after RC1.2 provider runtime diagnosis.
export function createFileProviderDiagnosticsGetHandler(options: {
  env?: Environment
  resolveUser?: ServerUserResolver
} = {}) {
  return async function GET(request: Request) {
    const env = options.env ?? process.env
    const resolution: ServerUserResolutionDiagnostics = {
      authenticatedUserResolved: false,
      businessUserMapped: false,
    }
    const resolveUser: ServerUserResolver = options.resolveUser
      ? async resolverRequest => {
          const user = await options.resolveUser!(resolverRequest)
          resolution.authenticatedUserResolved = Boolean(user)
          resolution.businessUserMapped = Boolean(user?.businessUserId)
          return user
        }
      : resolverRequest => resolveServerUser(resolverRequest, resolution)
    try {
      await requireRole(request, 'admin', resolveUser)
      return Response.json(providerDiagnostics(env), {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (isAuthorizationError(error)) {
        return Response.json(authDiagnostics(request, env, resolution), {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      return Response.json({
        ok: false,
        error: { code: 'FILE_PROVIDER_DIAGNOSTICS_UNAVAILABLE' },
      }, {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }
}
