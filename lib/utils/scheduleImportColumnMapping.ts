import type {
  SupplementalShiftFieldType,
  SupplementalShiftFields,
} from '@/lib/types/database.types'
import type { ImportPreviewRow, ImportResult } from '@/lib/utils/excelUtils'
import { MAX_SHIFT_CAPACITY, resolveShiftDateTime } from '@/lib/utils/shiftUtils'
import {
  executionSourceForAgency,
  normalizeAgencyCode,
  resolveExecutionSource,
} from '@/lib/utils/executionSource'

export type OperationalImportField =
  | 'date'
  | 'start_time'
  | 'end_time'
  | 'title'
  | 'studio'
  | 'notes'
  | 'required_host_count'
  | 'required_support_count'
  | 'required_technical_count'
  | 'execution_source'
  | 'agency_code'

export type ImportColumnMapping =
  | { destination: 'source_only' }
  | { destination: 'supplemental'; type: SupplementalShiftFieldType }
  | { destination: 'operational'; field: OperationalImportField }

export const operationalImportFields: ReadonlyArray<{ value: OperationalImportField; label: string }> = [
  { value: 'date', label: 'Date' },
  { value: 'start_time', label: 'Start Time' },
  { value: 'end_time', label: 'End Time' },
  { value: 'title', label: 'Shift Title' },
  { value: 'studio', label: 'Studio' },
  { value: 'notes', label: 'Notes' },
  { value: 'required_host_count', label: 'Required Host' },
  { value: 'required_support_count', label: 'Required Support' },
  { value: 'required_technical_count', label: 'Required Technical' },
  { value: 'execution_source', label: 'Execution Source' },
  { value: 'agency_code', label: 'Agency' },
]

type ParsedValue = { value: string | number | boolean } | { error: string } | null

function parseMappedValue(label: string, type: SupplementalShiftFieldType, raw: string): ParsedValue {
  if (!raw.trim()) return null
  if (type === 'text') {
    if (raw.length > 2000) return { error: `${label}: text is longer than 2000 characters.` }
    return { value: raw }
  }
  if (type === 'number') {
    if (!/^-?(?:\d+|\d*\.\d+)$/.test(raw.trim())) return { error: `${label}: enter a valid number.` }
    const value = Number(raw)
    return Number.isFinite(value) ? { value } : { error: `${label}: enter a valid number.` }
  }
  if (type === 'boolean') {
    const value = raw.trim().toLocaleLowerCase('en-US')
    if (['true', 'yes', '1'].includes(value)) return { value: true }
    if (['false', 'no', '0'].includes(value)) return { value: false }
    return { error: `${label}: enter Yes/No or True/False.` }
  }
  if (type === 'date') {
    const value = raw.trim()
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? { value }
      : { error: `${label}: use YYYY-MM-DD.` }
  }
  const value = raw.trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? { value }
    : { error: `${label}: use HH:MM.` }
}

function supplementalKey(label: string): string {
  const slug = label.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return slug || 'field_value'
}

function uniqueSupplementalKeys(mappings: Record<string, ImportColumnMapping>): Map<string, string> {
  const used = new Set<string>()
  return new Map(Object.keys(mappings).filter(name => mappings[name]?.destination === 'supplemental').sort().map(name => {
    const base = supplementalKey(name)
    let key = base
    let suffix = 2
    while (used.has(key)) {
      key = `${base.slice(0, 76)}_${suffix}`
      suffix += 1
    }
    used.add(key)
    return [name, key]
  }))
}

function applyOperationalField(
  preview: ImportPreviewRow,
  field: OperationalImportField,
  raw: string,
): string | null {
  if (!raw.trim()) return null
  const { row } = preview
  const shift = preview.shift
  if (field === 'agency_code') {
    const agency = normalizeAgencyCode(raw)
    if (!agency) return 'Agency must be ADA, SNAP, or Live AI.'
    const expectedSource = executionSourceForAgency(agency)!
    if (row.source_presence?.execution_source && row.execution_source !== expectedSource) {
      return `Agency ${agency.toUpperCase()} conflicts with the explicit Execution Source.`
    }
    row.agency_code = agency
    if (!row.source_presence?.execution_source) row.execution_source = expectedSource
    if (shift) {
      shift.agency_code = agency
      shift.execution_source = row.execution_source
    }
    row.source_presence = { ...row.source_presence, agency_code: true }
    return null
  }
  if (field === 'execution_source') {
    try {
      const source = resolveExecutionSource({ explicit: raw })
      const expectedSource = executionSourceForAgency(row.agency_code)
      if (expectedSource && source !== expectedSource) return `Execution Source conflicts with Agency ${row.agency_code?.toUpperCase() ?? ''}.`
      row.execution_source = source
      row.source_presence = { ...row.source_presence, execution_source: true }
      if (shift) shift.execution_source = source
      return null
    } catch {
      return 'Execution Source must be Internal or External.'
    }
  }
  if (field === 'required_host_count' || field === 'required_support_count' || field === 'required_technical_count') {
    const count = Number(raw)
    if (!Number.isInteger(count) || count < 1 || count > MAX_SHIFT_CAPACITY) return `${field.replaceAll('_', ' ')} must be a whole number from 1 to ${MAX_SHIFT_CAPACITY}.`
    row[field] = count
    row.source_presence = { ...row.source_presence, [field]: true }
    if (shift) shift[field] = count
    return null
  }
  if (field === 'date') {
    const value = parseMappedValue('Date', 'date', raw)
    if (!value || 'error' in value) return value?.error ?? null
    row.date = value.value as string
    if (shift) shift.date = row.date
  } else if (field === 'start_time' || field === 'end_time') {
    const value = parseMappedValue(field === 'start_time' ? 'Start Time' : 'End Time', 'time', raw)
    if (!value || 'error' in value) return value?.error ?? null
    row[field] = value.value as string
    if (shift) shift[field] = row[field]
  } else if (field === 'title' || field === 'studio') {
    if (raw.length > 2000) return `${field}: text is longer than 2000 characters.`
    row[field] = raw
    if (shift) shift[field] = raw
    row.source_presence = { ...row.source_presence, [field === 'title' ? 'title' : 'studio']: true }
  } else if (field === 'notes') {
    if (raw.length > 2000) return 'Notes: text is longer than 2000 characters.'
    row.notes = raw
    if (shift) shift.product_notes = raw
    row.source_presence = { ...row.source_presence, notes: true }
  }
  return null
}

export function applyImportColumnMappings(
  result: ImportResult,
  mappings: Record<string, ImportColumnMapping>,
): ImportResult {
  const keys = uniqueSupplementalKeys(mappings)
  let addedInvalidRows = 0
  const rows = result.rows.map(preview => {
    const next: ImportPreviewRow = {
      ...preview,
      row: { ...preview.row, errors: [...preview.row.errors], source_presence: { ...preview.row.source_presence } },
      shift: preview.shift ? { ...preview.shift } : undefined,
      duplicateCandidate: preview.duplicateCandidate ? { ...preview.duplicateCandidate } : undefined,
    }
    const mappedPreview: ImportPreviewRow = {
      ...next,
      shift: next.shift ? { ...next.shift } : next.duplicateCandidate ? { ...next.duplicateCandidate } : undefined,
    }
    const supplemental: SupplementalShiftFields = {
      ...(mappedPreview.shift?.supplemental_fields ?? next.duplicateReference?.supplemental_fields ?? {}),
    }
    const mappedErrors: string[] = []
    for (const [column, mapping] of Object.entries(mappings)) {
      if (mapping.destination === 'source_only') continue
      const raw = next.row.custom_fields?.[column] ?? ''
      if (mapping.destination === 'operational') {
        const error = applyOperationalField(mappedPreview, mapping.field, raw)
        if (error) mappedErrors.push(`${column}: ${error}`)
        continue
      }
      if (!column.trim() || column.trim().length > 80) {
        mappedErrors.push(`${column}: supplemental field labels must be 1 to 80 characters.`)
        continue
      }
      const parsed = parseMappedValue(column, mapping.type, raw)
      if (parsed && 'error' in parsed) {
        mappedErrors.push(parsed.error)
        continue
      }
      if (parsed) {
        supplemental[keys.get(column)!] = { label: column, type: mapping.type, value: parsed.value }
      }
    }
    if (Object.keys(supplemental).length > 50) mappedErrors.push('A Shift can store at most 50 supplemental fields.')
    if (mappedPreview.shift && Object.keys(supplemental).length > 0) mappedPreview.shift.supplemental_fields = supplemental
    const time = resolveShiftDateTime(next.row.date, next.row.start_time, next.row.end_time)
    if (!time?.valid) mappedErrors.push(time?.error || 'Mapped Date/Start Time/End Time are invalid.')
    else if (mappedPreview.shift) {
      mappedPreview.shift.end_date = time.endDate
      mappedPreview.shift.crosses_midnight = time.crossesMidnight
      mappedPreview.shift.duration_minutes = time.durationMinutes
    }
    if (mappedErrors.length > 0) {
      addedInvalidRows += next.row.errors.length === 0 ? 1 : 0
      next.row.errors.push(...mappedErrors)
      next.shift = undefined
    } else if (next.shift) {
      next.shift = mappedPreview.shift
    } else if (next.duplicateCandidate) {
      next.duplicateCandidate = mappedPreview.shift
    }
    return next
  })
  return {
    ...result,
    rows,
    validShifts: rows.flatMap(preview => preview.shift && preview.row.errors.length === 0 ? [preview.shift] : []),
    validRows: Math.max(0, result.validRows - addedInvalidRows),
    invalidRows: result.invalidRows + addedInvalidRows,
  }
}
