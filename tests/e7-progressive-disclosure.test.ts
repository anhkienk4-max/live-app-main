import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const shiftDetail = read('../components/features/shifts/ShiftDetailModal.tsx')
const audit = read('../components/features/audit/AuditHistory.tsx')
const report = read('../components/features/reports/ReportDetailModal.tsx')
const dashboard = read('../components/features/dashboard/DashboardOverview.tsx')
const disclosure = read('../components/ui/progressive-disclosure.tsx')

test('E7 progressive disclosure keeps decision context visible', () => {
  const overview = shiftDetail.indexOf('value="overview"')
  const staffing = shiftDetail.indexOf('value="staffing"')
  const advancedMetadata = shiftDetail.indexOf('data-testid="shift-detail-advanced-metadata"')

  assert.ok(overview >= 0)
  assert.ok(staffing > overview)
  assert.ok(advancedMetadata > staffing)
  assert.match(shiftDetail, /data-testid="shift-detail-status"/)
  assert.match(shiftDetail, /testId="shift-detail-time"/)
  assert.match(shiftDetail, /<ShiftRegistrationActions/)
  assert.match(shiftDetail, /level="detail_only"/)
})

test('E7 advanced audit snapshots are collapsed without hiding scan metadata', () => {
  assert.match(audit, /<Meta label="Actor" value=\{actor\.label\} \/>/)
  assert.match(audit, /<Meta label="Time\/status" value=\{`\$\{time\.display\}/)
  assert.match(audit, /<ProgressiveDisclosure level="expandable" summary=\{title\}>/)
  assert.match(audit, /function Snapshot\([\s\S]*?<ProgressiveDisclosure level="expandable"/)
})

test('E7 report evidence uses on-demand raw diagnostics while metrics remain available', () => {
  assert.match(report, /defaultCollapsed = true/)
  assert.match(report, /data-testid="toggle-raw-ocr-collapse"/)
  assert.match(report, /data-testid="platform-metrics-grid"/)
})

test('E7 dashboard caps upcoming lists and keeps a clear view-all path', () => {
  assert.match(dashboard, /\.slice\(0, 5\)/)
  assert.match(dashboard, /href="\/calendar"/)
  assert.match(dashboard, /viewAll/)
})

test('E7 primitive uses native, keyboard-accessible disclosure semantics', () => {
  assert.match(disclosure, /<details/)
  assert.match(disclosure, /<summary/)
  assert.match(disclosure, /aria-controls=\{contentId\}/)
  assert.match(disclosure, /data-disclosure-level=\{level\}/)
  assert.match(disclosure, /defaultOpen = false/)
})

test('E7 avoids nested disclosure stacks on representative surfaces', () => {
  const shiftDetails = (shiftDetail.match(/<ProgressiveDisclosure/g) || []).length
  const auditDetails = (audit.match(/<ProgressiveDisclosure/g) || []).length
  assert.equal(shiftDetails, 1)
  assert.equal(auditDetails, 1)
})
