import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  mapDashboardImageRecognition,
  mapOcrLabel,
  parseDashboardOcrText,
  parseOcrValue,
} from '../lib/utils/ocrMetrics.ts'
import { mergeMetricValues, reviewInputValues } from '../lib/utils/ocrReview.ts'
import { parseScheduleRows } from '../lib/utils/excelUtils.ts'
import {
  getScheduleImportSourceField,
  normalizeStaffingCountForPreview,
  previewStaffingFields,
  toCanonicalScheduleImportPreviewRow,
} from '../lib/utils/scheduleImportPreview.ts'
import { ScheduleImportStaffingInput } from '../components/features/calendar/ScheduleImportPanel.tsx'

test('Shopee raw OCR text produces normalized metrics', () => {
  const review = parseDashboardOcrText('shopee_live', [
    'Sales: 21.281.718,00',
    'Engaged Viewer: 521',
    'Comments: 65',
    'ATC: 920',
    'Total Views: 1.64M',
    'Avg. Viewing Duration: 00:00:31',
    'Comments Rate: 6,2%',
    'GPM: 18,530,950.00',
    'Orders: 109',
    'ABS: 1.64',
    'Total Viewers: 25.86K',
    'PCU: 107',
    'CTR: 3,2%',
    'Click to Order: 20%',
    'Buyers: 50',
    'Items Sold: 124',
    'Likes: 75',
    'Shares: 12',
  ].join('\n'))

  assert.equal(review.metrics.sales?.value, 21281718)
  assert.equal(review.metrics.engaged_viewers?.value, 521)
  assert.equal(review.metrics.comments?.value, 65)
  assert.equal(review.metrics.add_to_cart?.value, 920)
  assert.equal(review.metrics.total_views?.value, 1640000)
  assert.equal(review.metrics.average_view_duration_seconds?.value, 31)
  assert.equal(review.metrics.comment_rate?.value, 6.2)
  assert.equal(review.metrics.gpm?.value, 18530950)
  assert.equal(review.metrics.orders?.value, 109)
  assert.equal(review.metrics.average_basket_size?.value, 1.64)
  assert.equal(review.metrics.total_viewers?.value, 25860)
  assert.equal(review.metrics.pcu?.value, 107)
  assert.equal(review.metrics.ctr?.value, 3.2)
  assert.equal(review.metrics.click_to_order_rate?.value, 20)
  assert.equal(review.metrics.buyers?.value, 50)
  assert.equal(review.metrics.items_sold?.value, 124)
  assert.equal(review.metrics.likes?.value, 75)
  assert.equal(review.metrics.shares?.value, 12)
})

test('normalized keys exactly match form field names', () => {
  assert.equal(mapOcrLabel('shopee_live', 'Sales'), 'sales')
  assert.equal(mapOcrLabel('shopee_live', 'Engaged Viewers'), 'engaged_viewers')
  assert.equal(mapOcrLabel('shopee_live', 'Comments Rate'), 'comment_rate')
  assert.equal(mapOcrLabel('shopee_live', 'Avg. Viewing Duration'), 'average_view_duration_seconds')
  assert.equal(mapOcrLabel('shopee_live', 'Average Basket Size'), 'average_basket_size')
  assert.equal(mapOcrLabel('shopee_live', 'Click to Order'), 'click_to_order_rate')
  assert.equal(mapOcrLabel('shopee_live', 'Total Viewer'), 'total_viewers')
})

test('form merge preserves existing fields', () => {
  const merged = mergeMetricValues({ revenue: '10', orders: '2' }, { sales: '100', comments: '5' })
  assert.deepEqual(merged, { revenue: '10', orders: '2', sales: '100', comments: '5' })
})

test('Tesseract-style Shopee text and card output populate form metric keys', () => {
  const textReview = parseDashboardOcrText('shopee_live', [
    'Sales (đ) 21.281.718,00',
    'Engaged Viewer',
    '521',
    'Comments 0',
    'Comments Rate 6,58%',
    'Avg. Viewing Duration 00:00:31',
    'Items Sold 116',
    'ABS NaN',
  ].join('\n'))

  assert.equal(textReview.metrics.sales?.value, 21281718)
  assert.equal(textReview.metrics.engaged_viewers?.value, 521)
  assert.equal(textReview.metrics.comments?.value, 0)
  assert.equal(textReview.metrics.comment_rate?.value, 6.58)
  assert.equal(textReview.metrics.average_view_duration_seconds?.value, 31)
  assert.equal(textReview.metrics.items_sold?.value, 116)
  assert.equal(textReview.metrics.average_basket_size, undefined)

  const imageReview = mapDashboardImageRecognition('shopee_live', {
    engine: 'tesseract.js',
    language: 'eng+vie',
    text: 'Sales 21.281.718,00\nComments 0',
    pass_output: {
      label: 'Sales 21.281.718,00\nComments 0',
      numeric: '21.281.718,00\n0',
      card: {
        sales: ['21.281.718,00'],
        comments: ['0'],
        comment_rate: ['6,58%'],
        average_basket_size: ['NaN'],
      },
    },
    confidence: 80,
    words: [],
    crop_box: { left: 0, top: 0, width: 1, height: 1 },
    original_dimensions: { width: 1920, height: 1080 },
    processed_dimensions: { width: 3840, height: 2160 },
  })
  const merged = mergeMetricValues(
    { revenue: '10', orders: '7' },
    reviewInputValues(imageReview),
  )

  assert.deepEqual(merged, {
    revenue: '10',
    orders: '7',
    sales: '21281718',
    comments: '0',
    comment_rate: '6.58',
  })
  assert.equal(imageReview.metrics.average_basket_size, undefined)
})

test('zero values remain zero and NaN values are excluded', () => {
  assert.equal(parseOcrValue('0'), 0)
  assert.equal(parseOcrValue('00:00:00'), 0)
  assert.equal(parseOcrValue('NaN'), null)
  assert.equal(parseOcrValue('invalid'), null)
})

test('localized numbers parse correctly', () => {
  assert.equal(parseOcrValue('21.281.718,00'), 21281718)
  assert.equal(parseOcrValue('18,530,950.00'), 18530950)
  assert.equal(parseOcrValue('6,2%'), 6.2)
  assert.equal(parseOcrValue('00:00:31'), 31)
  assert.equal(parseOcrValue('1.64M'), 1640000)
  assert.equal(parseOcrValue('25.86K'), 25860)
})

test('host missing or blank defaults to one and invalid host values fail validation', () => {
  const rows = [
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'A', Notes: '' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'B', 'Required Host count': '' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'C', 'Required Host count': '0' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'D', 'Required Host count': '1' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'E', 'Required Host count': '2' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'F', 'Required Host count': '-1' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'G', 'Required Host count': '1.5' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'H', 'Required Host count': 'not-a-number' },
    { Date: '2026-07-20', 'Start time': '09:00', 'End time': '13:00', Brand: 'TechGear Pro', Platform: 'Shopee Live', 'Shift title': 'I', 'Required Host count': '101' },
  ]

  const result = parseScheduleRows(rows as any, {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['Shopee Live', 'platform-1']]),
    campaigns: new Map(),
  })

  const previewFields = result.rows.map(row => row.row.required_host_count)
  assert.deepEqual(previewFields[0], 1)
  assert.deepEqual(previewFields[1], 1)
  assert.deepEqual(previewFields[2], 1)
  assert.deepEqual(previewFields[3], 1)
  assert.deepEqual(previewFields[4], 2)
  assert.equal(result.rows[5].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.rows[6].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.rows[7].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.rows[8].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.validShifts[0].required_host_count, 1)
})

test('support and technical missing values default to one and template staffing uses one values', () => {
  const result = parseScheduleRows([{
    Date: '2026-07-20',
    'Start time': '09:00',
    'End time': '13:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
    'Shift title': 'A',
  }] as any, {
    brands: new Map([['techgear pro', 'brand-1']]),
    platforms: new Map([['shopee live', 'platform-1']]),
    campaigns: new Map(),
  })

  assert.equal(result.rows[0].row.required_support_count, 1)
  assert.equal(result.rows[0].row.required_technical_count, 1)
})

test('Schedule Import rendered Host binding is the canonical value before validation', () => {
  const markup = renderToStaticMarkup(createElement(ScheduleImportStaffingInput, {
    field: 'required_host_count',
    value: 1,
    onChange: () => undefined,
  }))
  assert.match(markup, /data-testid="schedule-preview-required_host_count"/)
  assert.match(markup, /value="1"/)
  assert.doesNotMatch(markup, /value=""/)
  assert.equal(getScheduleImportSourceField('required_host_count'), 'required_host_count')
})

test('staffing preview normalization defaults empty values and rejects malformed values', () => {
  for (const value of [undefined, null, Number.NaN, '', '   ', 0, '0']) {
    assert.equal(normalizeStaffingCountForPreview(value), 1)
  }
  assert.equal(normalizeStaffingCountForPreview(2), 2)
  assert.equal(normalizeStaffingCountForPreview('2'), 2)
  assert.equal(normalizeStaffingCountForPreview(-1), '-1')
  assert.equal(normalizeStaffingCountForPreview(1.5), '1.5')
  assert.equal(normalizeStaffingCountForPreview('not-a-number'), 'not-a-number')

  const aliased = parseScheduleRows([{
    Date: '2026-07-21',
    'Start time': '09:00',
    'End time': '13:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
    'Shift title': 'Alias',
    'Host Count': 2,
  }] as any, {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['Shopee Live', 'platform-1']]),
    campaigns: new Map(),
  })
  assert.equal(aliased.rows[0].row.required_host_count, 2)
  assert.equal(aliased.validShifts[0].required_host_count, 2)
})

test('mixed spreadsheet rows canonicalize Host before state/render/persistence and reject invalid values', async () => {
  const common = {
    Date: '2026-08-05',
    'Start time': '09:00',
    'End time': '13:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
  }
  const rows = [
    { ...common, 'Shift title': 'Missing' },
    { ...common, 'Shift title': 'Blank', 'Required Host count': '' },
    { ...common, 'Shift title': 'Whitespace', required_host_count: '   ' },
    { ...common, 'Shift title': 'Numeric zero', host_count: 0 },
    { ...common, 'Shift title': 'String zero', requiredHostCount: '0' },
    { ...common, 'Shift title': 'One', hostRequired: 1 },
    { ...common, 'Shift title': 'Two', 'Host Count': 2 },
    { ...common, 'Shift title': 'Vietnamese', 'Số Host bắt buộc': '' },
    { ...common, 'Shift title': 'English alias', 'Host Count': '' },
    { ...common, 'Shift title': 'Mixed aliases', required_host_count: '', host_count: 2, Host: '' },
    { ...common, 'Shift title': 'Negative', required_host_count: -1 },
    { ...common, 'Shift title': 'Decimal', 'Required Host count': 1.5 },
    { ...common, 'Shift title': 'Text', required_host_count: 'abc' },
  ]
  const result = parseScheduleRows(rows, {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['Shopee Live', 'platform-1']]),
    campaigns: new Map(),
  })

  assert.deepEqual(
    result.rows.slice(0, 10).map(preview => preview.row.required_host_count),
    [1, 1, 1, 1, 1, 1, 2, 1, 1, 2],
  )
  assert.equal(result.rows[10].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.rows[11].row.errors.some(message => message.includes('Required Host count')), true)
  assert.equal(result.rows[12].row.errors.some(message => message.includes('Required Host count')), true)

  for (const preview of result.rows.slice(0, 10)) {
    const markup = renderToStaticMarkup(createElement(ScheduleImportStaffingInput, {
      field: 'required_host_count',
      value: preview.row.required_host_count,
      onChange: () => undefined,
    }))
    assert.match(markup, new RegExp(`value="${preview.row.required_host_count}"`))
    assert.doesNotMatch(markup, /value=""/)
  }

  const legacyRuntimeRow = {
    ...result.rows[0].row,
    required_host_count: '',
    host_count: 2,
    Host: '',
  }
  const canonicalRuntimeRow = toCanonicalScheduleImportPreviewRow(legacyRuntimeRow)
  assert.equal(canonicalRuntimeRow.required_host_count, 2)
  assert.equal('host_count' in canonicalRuntimeRow, false)
  assert.equal('Host' in canonicalRuntimeRow, false)

  const { shiftService } = await import('../lib/services/dataService.ts')
  const saved = await shiftService.create(result.validShifts[0])
  assert.equal((await shiftService.getById(saved.id))?.required_host_count, 1)
})

test('identical blank staffing values default, render, and persist as one for every role', async () => {
  const result = parseScheduleRows([{
    Date: '2026-08-06',
    'Start time': '09:00',
    'End time': '13:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
    'Shift title': 'Shared staffing path',
    required_host_count: '',
    required_support_count: '',
    required_technical_count: '',
  }], {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['Shopee Live', 'platform-1']]),
    campaigns: new Map(),
  })

  const preview = result.rows[0].row
  previewStaffingFields.forEach(field => {
    assert.equal(preview[field], 1)
    const markup = renderToStaticMarkup(createElement(ScheduleImportStaffingInput, {
      field,
      value: preview[field],
      onChange: () => undefined,
    }))
    assert.match(markup, /value="1"/)
    assert.doesNotMatch(markup, /value=""/)
  })

  const { shiftService } = await import('../lib/services/dataService.ts')
  const saved = await shiftService.create(result.validShifts[0])
  previewStaffingFields.forEach(field => assert.equal(saved[field], 1))
})

test('bare personnel role columns cannot overwrite canonical staffing defaults', () => {
  const result = parseScheduleRows([{
    Date: '2026-08-07',
    'Start time': '09:00',
    'End time': '13:00',
    Brand: 'TechGear Pro',
    Platform: 'Shopee Live',
    'Shift title': 'Assigned staff columns',
    Host: 'Nguyen Van A',
    Support: 'Nguyen Van B',
    Technical: 'Nguyen Van C',
  }], {
    brands: new Map([['TechGear Pro', 'brand-1']]),
    platforms: new Map([['Shopee Live', 'platform-1']]),
    campaigns: new Map(),
  })

  assert.deepEqual(
    previewStaffingFields.map(field => result.rows[0].row[field]),
    [1, 1, 1],
  )
  assert.equal(result.rows[0].row.errors.some(message => message.includes('Required Host count')), false)
})
