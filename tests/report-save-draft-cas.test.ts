import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const formSource = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../components/features/reports/ReportDetailModal.tsx', import.meta.url), 'utf8')

test('draft continuation sends a complete CAS save event', () => {
  assert.match(
    formSource,
    /reportService\.update\(\s*existingReport\.id,\s*payload,\s*existingReport\.version_number,\s*currentUser\.id,\s*'Saved report draft',\s*'save',\s*\)/,
  )
})

test('report review save sends the CAS event and surfaces failures', () => {
  assert.match(
    detailSource,
    /report\.version_number, currentUser\.id, reviewNotes \|\| 'Saved report draft revision', 'save'/,
  )
  assert.match(detailSource, /title: t\('saveFailed'\), description: error instanceof Error/)
})
