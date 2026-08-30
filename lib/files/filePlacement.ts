import type { FileEntityType } from './fileProvider'
import { sanitizeFileName } from './fileValidation'

export interface LogicalFilePlacement {
  entity_type: FileEntityType
  entity_id: string
  segments: string[]
  logical_path: string
}

function yearMonth(value: string | Date): { year: string; month: string } {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('FILE_PLACEMENT_DATE_INVALID')
  return { year: String(date.getUTCFullYear()), month: String(date.getUTCMonth() + 1).padStart(2, '0') }
}

export function logicalFilePlacement(entityType: FileEntityType, entityId: string, createdAt: string | Date): LogicalFilePlacement {
  const id = sanitizeFileName(entityId)
  const { year, month } = yearMonth(createdAt)
  const segments = entityType === 'attachment'
    ? ['LiveStreamOps', 'attachments', entityType, id]
    : ['LiveStreamOps', entityType === 'schedule_import' ? 'imports' : `${entityType}s`, year, month, id]
  return { entity_type: entityType, entity_id: entityId, segments, logical_path: segments.join('/') }
}
