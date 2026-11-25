import type { ReplaceAssignmentWithIncidentV1Request } from '@/lib/types/shiftIncidentContract'

/** The returned receipt requires authoritative roster readback before UI confirmation. */
export async function replaceAssignmentWithIncidentV1(input: ReplaceAssignmentWithIncidentV1Request) {
  const response = await fetch('/api/staffing/replacements/incident-v1', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', body: JSON.stringify(input),
  })
  const body: unknown = await response.json()
  if (!response.ok) {
    const code = (body as { error?: { code?: unknown } })?.error?.code
    throw new Error(typeof code === 'string' ? code : 'STAFFING_INCIDENT_REPLACEMENT_FAILED')
  }
  return body as { ok: true; data: unknown; readbackRequired: true }
}
