import 'server-only'

import { z } from 'zod'
import { permissionMatrix } from '@/lib/permissions'
import { isAuthorizationError, authorizationErrorResponse, requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { materializeAttendancePhotoFolders } from '@/lib/server/attendancePhotoDrive'
import { OperationalStoragePlacementError } from '@/lib/files/operationalStoragePlacementResolver'

const inputSchema = z.object({
  shift_ids: z.array(z.string().trim().min(1).max(120)).min(1).max(500),
}).strict().transform(({ shift_ids }) => [...new Set(shift_ids)])

export function createAttendanceFolderMaterializationHandler(dependencies: {
  resolveUser?: ServerUserResolver
  createClient?: typeof createSupabaseAdminClient
  materialize?: typeof materializeAttendancePhotoFolders
} = {}) {
  const createClient = dependencies.createClient ?? createSupabaseAdminClient
  const materialize = dependencies.materialize ?? materializeAttendancePhotoFolders

  return async function POST(request: Request) {
    try {
      if (request.headers.get('origin') !== new URL(request.url).origin) {
        return Response.json({ ok: false, error: { code: 'ATTENDANCE_FOLDER_ORIGIN_INVALID' } }, { status: 403 })
      }
      const actor = await requireUser(request, dependencies.resolveUser)
      if (!actor.businessUserId || !(
        permissionMatrix[actor.systemPermission].has('shifts.edit')
        || permissionMatrix[actor.systemPermission].has('shifts.import')
      )) return Response.json({ ok: false, error: { code: 'PERMISSION_DENIED' } }, { status: 403 })

      const parsed = inputSchema.safeParse(await readJsonBody(request, 64 * 1024))
      if (!parsed.success) return Response.json({ ok: false, error: { code: 'ATTENDANCE_FOLDER_REQUEST_INVALID' } }, { status: 400 })
      const client = createClient()
      const shiftIds = parsed.data
      const result = await client.from('shifts').select('id,date,created_by')
        .in('id', shiftIds).is('deleted_at', null).is('archived_at', null)
      if (result.error) throw new Error('ATTENDANCE_FOLDER_SHIFT_LOOKUP_FAILED')
      const shifts = (result.data ?? []) as Array<{ id: string; date: string; created_by: string | null }>
      if (shifts.length !== shiftIds.length) {
        return Response.json({ ok: false, error: { code: 'ATTENDANCE_FOLDER_SHIFT_NOT_FOUND' } }, { status: 404 })
      }
      if (actor.systemPermission !== 'admin' && shifts.some(shift => shift.created_by !== actor.businessUserId)) {
        return Response.json({ ok: false, error: { code: 'PERMISSION_DENIED' } }, { status: 403 })
      }

      let foldersVerified = 0
      for (const shift of shifts) foldersVerified += await materialize(client, {
        shiftId: shift.id, shiftDate: shift.date, actorBusinessUserId: actor.businessUserId,
      })
      return Response.json({ ok: true, shifts_processed: shifts.length, folders_verified: foldersVerified }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) {
        return Response.json({ ok: false, error: { code: error.code } }, { status: error.status })
      }
      if (error instanceof OperationalStoragePlacementError) {
        return Response.json({ ok: false, error: { code: error.code } }, { status: 409 })
      }
      const code = error instanceof Error && error.message.startsWith('ATTENDANCE_DRIVE_')
        ? error.message
        : 'ATTENDANCE_FOLDER_MATERIALIZATION_FAILED'
      return Response.json({ ok: false, error: { code } }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }
  }
}
