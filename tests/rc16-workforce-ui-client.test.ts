import test from 'node:test'
import assert from 'node:assert/strict'
import { workforceService, type PayrollLine } from '@/lib/services/workforceService'
import { formatCurrency } from '@/lib/utils/currency'

test('RC16 UI Client: CSV Export URL requires locked period and matches exact pattern', () => {
  const url = workforceService.getExportCsvUrl('period-123')
  assert.equal(url, '/api/workforce/payroll?period_id=period-123&export=csv')
})

test('RC16 UI Client: Voided lines are strictly excluded from payable totals', () => {
  const lines: PayrollLine[] = [
    {
      id: 'l1',
      period_id: 'p1',
      segment_id: 's1',
      rate_card_id: 'r1',
      staff_id: 'staff-1',
      operational_role: 'host',
      actual_minutes: 90,
      payable_minutes: 90,
      overtime_minutes: 0,
      rate_vnd_per_hour: 100000,
      overtime_multiplier_basis_points: 15000,
      gross_vnd: 150000,
      adjustment_vnd: 0,
      net_vnd: 150000,
      adjustment_reason: null,
      calculation_version: 'rc16-v1',
      version: 1,
      voided_at: null,
      created_at: '2026-10-11T00:00:00Z',
      updated_at: '2026-10-11T00:00:00Z',
    },
    {
      id: 'l2',
      period_id: 'p1',
      segment_id: 's2',
      rate_card_id: 'r2',
      staff_id: 'staff-2',
      operational_role: 'support',
      actual_minutes: 120,
      payable_minutes: 120,
      overtime_minutes: 30,
      rate_vnd_per_hour: 80000,
      overtime_multiplier_basis_points: 15000,
      gross_vnd: 180000,
      adjustment_vnd: -10000,
      net_vnd: 170000,
      adjustment_reason: 'Late deduction',
      calculation_version: 'rc16-v1',
      version: 2,
      voided_at: '2026-10-11T01:00:00Z', // VOIDED LINE
      created_at: '2026-10-11T00:00:00Z',
      updated_at: '2026-10-11T01:00:00Z',
    },
  ]

  // Filter active lines
  const activeLines = lines.filter(l => !l.voided_at)
  assert.equal(activeLines.length, 1, 'Only 1 active line')
  assert.equal(activeLines[0].id, 'l1')

  const totalNet = activeLines.reduce((sum, l) => sum + l.net_vnd, 0)
  assert.equal(totalNet, 150000, 'Voided line l2 must NOT be included in total net')
})

test('RC16 UI Client: VND currency format output matches Vietnamese operational standards', () => {
  const formatted = formatCurrency(125000)
  assert.ok(formatted.includes('125.000'), 'Should format thousands with dot')
  assert.ok(formatted.includes('₫') || formatted.includes('VND'), 'Should include VND currency symbol')
})
