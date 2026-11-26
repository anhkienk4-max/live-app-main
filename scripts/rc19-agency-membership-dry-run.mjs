#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const sourcePath = process.argv[2]
if (!sourcePath) {
  console.error('Usage: node scripts/rc19-agency-membership-dry-run.mjs <sanitized-mapping.json>')
  process.exitCode = 2
} else {
  try {
    const bytes = await readFile(sourcePath)
    const sourceHash = createHash('sha256').update(bytes).digest('hex')
    const input = JSON.parse(bytes.toString('utf8'))
    const issues = []
    const agencies = Array.isArray(input.agencies) ? input.agencies : []
    const memberships = Array.isArray(input.memberships) ? input.memberships : []
    const knownBusinessUserIds = new Set(Array.isArray(input.knownBusinessUserIds) ? input.knownBusinessUserIds : [])
    const agencyByKey = new Map()

    for (const [index, agency] of agencies.entries()) {
      if (!agency || typeof agency.key !== 'string' || !agency.key.trim()) {
        issues.push({ row: index + 1, code: 'AGENCY_KEY_MISSING' })
        continue
      }
      if (agencyByKey.has(agency.key)) issues.push({ row: index + 1, code: 'DUPLICATE_AGENCY_KEY' })
      agencyByKey.set(agency.key, agency)
    }

    const identityAgencyRows = new Map()
    for (const [index, row] of memberships.entries()) {
      const rowNumber = index + 1
      if (!row || typeof row.businessUserId !== 'string' || !row.businessUserId.trim()) {
        issues.push({ row: rowNumber, code: 'USER_MAPPING_MISSING' })
        continue
      }
      if (knownBusinessUserIds.size > 0 && !knownBusinessUserIds.has(row.businessUserId)) {
        issues.push({ row: rowNumber, code: 'BUSINESS_USER_UNMAPPED' })
      }
      if (typeof row.userKey !== 'string' || !row.userKey.trim()) issues.push({ row: rowNumber, code: 'HR_USER_KEY_MISSING' })
      if (typeof row.agencyKey !== 'string' || !agencyByKey.has(row.agencyKey)) issues.push({ row: rowNumber, code: 'HR_AGENCY_KEY_UNMAPPED' })
      if (!['active', 'revoked'].includes(row.status)) issues.push({ row: rowNumber, code: 'MEMBERSHIP_STATUS_INVALID' })
      const from = Date.parse(row.effectiveFrom)
      const until = row.effectiveUntil == null ? Number.POSITIVE_INFINITY : Date.parse(row.effectiveUntil)
      if (!Number.isFinite(from) || !(until > from)) issues.push({ row: rowNumber, code: 'EFFECTIVE_INTERVAL_INVALID' })
      const key = `${row.businessUserId}\u0000${row.agencyKey}`
      const intervals = identityAgencyRows.get(key) ?? []
      intervals.push({ row: rowNumber, from, until })
      identityAgencyRows.set(key, intervals)
    }

    for (const intervals of identityAgencyRows.values()) {
      intervals.sort((a, b) => a.from - b.from)
      for (let index = 1; index < intervals.length; index += 1) {
        const previous = intervals[index - 1]
        const current = intervals[index]
        if (current.from < previous.until) issues.push({ row: current.row, code: 'MEMBERSHIP_INTERVAL_OVERLAP' })
      }
    }

    const result = {
      schemaVersion: 1,
      result: issues.length === 0 ? 'PASS' : 'FAIL',
      sourceSystem: typeof input.sourceSystem === 'string' ? input.sourceSystem : null,
      sourceVersion: typeof input.sourceVersion === 'string' ? input.sourceVersion : null,
      sourceFileSha256: sourceHash,
      sourceSnapshotSha256: typeof input.sourceSnapshotSha256 === 'string' ? input.sourceSnapshotSha256 : null,
      counts: {
        agencies: agencies.length,
        membershipRows: memberships.length,
        knownBusinessUsersProvided: knownBusinessUserIds.size > 0,
        issues: issues.length,
      },
      issues,
      writesPerformed: false,
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    if (issues.length > 0) process.exitCode = 1
  } catch (error) {
    const code = error instanceof SyntaxError ? 'INPUT_JSON_INVALID' : 'INPUT_READ_FAILED'
    process.stderr.write(`${code}\n`)
    process.exitCode = 1
  }
}
