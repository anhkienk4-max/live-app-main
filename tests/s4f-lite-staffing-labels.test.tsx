import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { ListView } from '../components/features/calendar/ListView.tsx'
import { resolveDaySessionRoleNames } from '../components/features/calendar/DaySessionsDialog.tsx'
import {
  buildShiftStaffing,
  ShiftImportedStaffingLabels,
  ShiftStaffingLabelsEditor,
  normalizeShiftStaffingLabelDraft,
} from '../components/features/shifts/ShiftDetailModal.tsx'
import { shiftRegistrationService, shiftService } from '../lib/services/dataService.ts'
import { LanguageProvider } from '../lib/i18n.tsx'
import type { Shift, User } from '../lib/types/database.types.ts'
import { parseScheduleRows, type EntityMaps } from '../lib/utils/excelUtils.ts'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeStaffingDisplayNames,
  toCanonicalScheduleImportPreviewRow,
} from '../lib/utils/scheduleImportPreview.ts'
import {
  commitRowDraftToSource,
  committedRowValue,
  updateRowDraft,
} from '../lib/utils/scheduleImportDraft.ts'

const { createElement } = React
;(globalThis as typeof globalThis & { React: typeof React }).React = React

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1']]),
  platforms: new Map([['Shopee Live', 'platform-1']]),
  campaigns: new Map(),
}

const shift: Shift = {
  id: 'shift-staffing-labels',
  date: '2031-09-01',
  start_time: '09:00',
  end_time: '11:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  title: 'Imported staffing labels',
  host_names: ['Hương'],
  assistant_names: ['An', 'Linh'],
  technical_names: ['Minh'],
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  status: 'scheduled',
  created_at: '2031-09-01T00:00:00.000Z',
  updated_at: '2031-09-01T00:00:00.000Z',
}

const fallbackAssignedUser: User = {
  id: 'fallback-host-real',
  email: 'fallback-host@example.test',
  full_name: 'Actual Assigned Host',
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host'],
  status: 'active',
  join_date: '2031-01-01',
  created_at: '2031-01-01T00:00:00.000Z',
  updated_at: '2031-01-01T00:00:00.000Z',
}

const dayRoleNames = (
  role: 'host' | 'support' | 'technical',
  candidateShift: Shift = shift,
  users: User[] = [],
) => resolveDaySessionRoleNames({
  fallback: 'Not updated',
  registrations: [],
  role,
  shift: candidateShift,
  users,
})

test('staffing display name normalization trims, splits and de-duplicates exact names', () => {
  assert.deepEqual(
    normalizeStaffingDisplayNames(' Hương ; An, Linh\nAn ;  Nguyễn   Văn   Minh '),
    ['Hương', 'An', 'Linh', 'Nguyễn Văn Minh'],
  )
  assert.deepEqual(normalizeStaffingDisplayNames('  '), [])
})

test('canonical preview and draft source preserve all display-only staffing names', () => {
  const row = toCanonicalScheduleImportPreviewRow({
    row_number: 2,
    date: '2031-09-01',
    start_time: '09:00',
    end_time: '11:00',
    brand_name: 'Mars Wrigley',
    platform_name: 'Shopee Live',
    title: 'Imported staffing labels',
    Host: 'Hương',
    Assistant: 'An, Linh',
    Technical: 'Minh',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    warnings: [],
    errors: [],
  })

  assert.deepEqual(row.host_names, ['Hương'])
  assert.deepEqual(row.assistant_names, ['An', 'Linh'])
  assert.deepEqual(row.technical_names, ['Minh'])
  assert.equal(committedRowValue(row, 'assistant_names'), 'An, Linh')
  assert.deepEqual(buildScheduleImportPreviewSourceRow(row).assistant_names, ['An', 'Linh'])
})

test('staffing names survive preview edit, source commit and reparse exactly', () => {
  const parsed = parseScheduleRows([{
    Date: '2031-09-01',
    'Start time': '09:00',
    'End time': '11:00',
    Brand: 'Mars Wrigley',
    Platform: 'Shopee Live',
    'Shift name': 'Imported staffing labels',
    Host: 'Hương',
    Assistant: 'An, Linh',
    Technical: 'Minh',
  }], maps)
  assert.equal(parsed.validRows, 1)

  const row = parsed.rows[0].row
  const source = buildScheduleImportPreviewSourceRow(row)
  let drafts = updateRowDraft({}, row.row_number, row, 'host_names', 'Hương, An')
  drafts = updateRowDraft(drafts, row.row_number, row, 'assistant_names', 'An; Linh; Vy')
  drafts = updateRowDraft(drafts, row.row_number, row, 'technical_names', 'Minh, Tuấn')
  const committed = commitRowDraftToSource(source, drafts[row.row_number])
  const reparsed = parseScheduleRows([committed], maps)

  assert.equal(reparsed.validRows, 1)
  assert.deepEqual(reparsed.rows[0].row.host_names, ['Hương', 'An'])
  assert.deepEqual(reparsed.rows[0].row.assistant_names, ['An', 'Linh', 'Vy'])
  assert.deepEqual(reparsed.rows[0].row.technical_names, ['Minh', 'Tuấn'])
})

test('Calendar list renders imported names without staff IDs', () => {
  const markup = renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(ListView, {
      shifts: [shift],
      brands: [{ id: 'brand-1', name: 'Mars Wrigley', created_at: '', updated_at: '' }],
      platforms: [{ id: 'platform-1', name: 'Shopee Live', created_at: '', updated_at: '' }],
      users: [],
    }),
  ))

  assert.match(markup, /Host:<\/span> Hương/)
  assert.match(markup, /Assistant:<\/span> An, Linh/)
  assert.match(markup, /Technical:<\/span> Minh/)
})

test('Calendar prefers a real assignment while Shift Detail preserves imported labels', () => {
  const assignedHost: User = {
    id: 'host-real',
    email: 'host@example.test',
    full_name: 'Real Assigned Host',
    role: 'staff',
    system_permission: 'member',
    operational_roles: ['host'],
    status: 'active',
    join_date: '2031-01-01',
    created_at: '2031-01-01T00:00:00.000Z',
    updated_at: '2031-01-01T00:00:00.000Z',
  }
  const assignedShift = { ...shift, host_id: assignedHost.id }
  const calendarMarkup = renderToStaticMarkup(createElement(
    LanguageProvider,
    null,
    createElement(ListView, {
      shifts: [assignedShift],
      brands: [{ id: 'brand-1', name: 'Mars Wrigley', created_at: '', updated_at: '' }],
      platforms: [{ id: 'platform-1', name: 'Shopee Live', created_at: '', updated_at: '' }],
      users: [assignedHost],
    }),
  ))
  assert.match(calendarMarkup, /Host:<\/span> Real Assigned Host/)
  assert.doesNotMatch(calendarMarkup, /Host:<\/span> Hương/)

  const detailMarkup = renderToStaticMarkup(createElement(ShiftImportedStaffingLabels, {
    shift: assignedShift,
    t: key => key,
  }))
  assert.match(detailMarkup, /shift-detail-imported-staffing/)
  assert.match(detailMarkup, />Hương</)
})

test('Day Sessions falls back to imported labels for all three staffing roles', () => {
  assert.equal(dayRoleNames('host'), shift.host_names?.join(', '))
  assert.equal(dayRoleNames('support'), 'An, Linh')
  assert.equal(dayRoleNames('technical'), 'Minh')
})

test('staffing label editor draft normalizes comma, semicolon and newline delimiters', () => {
  assert.deepEqual(normalizeShiftStaffingLabelDraft({
    host: ' Hương, Hương ',
    support: 'An; Linh\nAn',
    technical: ' Minh\nTuấn ',
  }), {
    host_names: ['Hương'],
    assistant_names: ['An', 'Linh'],
    technical_names: ['Minh', 'Tuấn'],
  })
})

test('staffing label normalization preserves case and Vietnamese characters', () => {
  assert.deepEqual(normalizeShiftStaffingLabelDraft({
    host: 'Hương, hương',
    support: 'Ánh; ANH',
    technical: 'Đức',
  }), {
    host_names: ['Hương', 'hương'],
    assistant_names: ['Ánh', 'ANH'],
    technical_names: ['Đức'],
  })
})

test('clearing one staffing label role produces an empty array', () => {
  assert.deepEqual(normalizeShiftStaffingLabelDraft({
    host: '',
    support: 'An',
    technical: 'Minh',
  }).host_names, [])
})

test('Day Sessions prefers an actual assignment over an imported label', () => {
  assert.equal(
    dayRoleNames(
      'host',
      { ...shift, host_id: fallbackAssignedUser.id },
      [fallbackAssignedUser],
    ),
    fallbackAssignedUser.full_name,
  )
})

test('Day Sessions uses the not-updated fallback when no assignment or imported label exists', () => {
  const emptyShift = { ...shift, host_names: [], assistant_names: [], technical_names: [] }
  assert.equal(dayRoleNames('host', emptyShift), 'Not updated')
  assert.equal(dayRoleNames('support', emptyShift), 'Not updated')
  assert.equal(dayRoleNames('technical', emptyShift), 'Not updated')
})

test('Shift Detail staffing tab displays imported labels as a distinct read-only section', () => {
  const shiftDetailSource = readFileSync(
    new URL('../components/features/shifts/ShiftDetailModal.tsx', import.meta.url),
    'utf8',
  )
  const markup = renderToStaticMarkup(createElement(ShiftImportedStaffingLabels, {
    shift,
    t: key => key,
    testId: 'shift-detail-staffing-imported-labels',
    variant: 'standalone',
  }))

  assert.match(markup, /shift-detail-staffing-imported-labels/)
  assert.match(markup, /importedStaffingLabels/)
  assert.match(markup, new RegExp(shift.host_names?.[0] ?? ''))
  assert.match(markup, /An, Linh/)
  assert.match(markup, /Minh/)
  assert.match(
    shiftDetailSource,
    /<TabsContent value="staffing"[\s\S]*?<ShiftImportedStaffingLabels[\s\S]*?testId="shift-detail-staffing-imported-labels"/,
  )
})

test('editable staffing label section is available even for a legacy shift with empty arrays', () => {
  const emptyShift = { ...shift, host_names: [], assistant_names: [], technical_names: [] }
  const markup = renderToStaticMarkup(createElement(ShiftStaffingLabelsEditor, {
    shift: emptyShift,
    t: (key: string) => key,
    onSave: async () => undefined,
  }))

  assert.match(markup, /shift-detail-staffing-labels-editor/)
  assert.match(markup, /edit-shift-staffing-labels/)
  assert.match(markup, /importedStaffingLabels/)
  assert.equal((markup.match(/>—</g) ?? []).length, 3)
})

test('read-only staffing label section still omits empty legacy arrays', () => {
  const emptyShift = { ...shift, host_names: [], assistant_names: [], technical_names: [] }
  const markup = renderToStaticMarkup(createElement(ShiftImportedStaffingLabels, {
    shift: emptyShift,
    t: (key: string) => key,
  }))
  assert.equal(markup, '')
})

test('imported labels do not create assignments or change canonical staffing counts', () => {
  const importedOnly = buildShiftStaffing(shift, [], [])
  assert.equal(importedOnly.host.length, 0)
  assert.equal(importedOnly.support.length, 0)
  assert.equal(importedOnly.technical.length, 0)

  const canonicalShift = { ...shift, host_id: fallbackAssignedUser.id }
  const withoutImportedLabels = {
    ...canonicalShift,
    host_names: [],
    assistant_names: [],
    technical_names: [],
  }
  assert.deepEqual(
    buildShiftStaffing(canonicalShift, [], [fallbackAssignedUser]),
    buildShiftStaffing(withoutImportedLabels, [], [fallbackAssignedUser]),
  )
})

test('empty imported arrays render no section and create no fake staffing rows', () => {
  const emptyShift = { ...shift, host_names: [], assistant_names: [], technical_names: [] }
  const markup = renderToStaticMarkup(createElement(ShiftImportedStaffingLabels, {
    shift: emptyShift,
    t: key => key,
    testId: 'shift-detail-staffing-imported-labels',
    variant: 'standalone',
  }))
  const staffing = buildShiftStaffing(emptyShift, [], [])

  assert.equal(markup, '')
  assert.equal(staffing.host.length + staffing.support.length + staffing.technical.length, 0)
})

test('mock staffing label save has parity and leaves assignments, capacity and registrations unchanged', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  const before = await shiftService.getById('s1')
  assert.ok(before)
  const beforeRegistrations = await shiftRegistrationService.getForShift('s1')
  const originalLabels = {
    host_names: before.host_names ?? [],
    assistant_names: before.assistant_names ?? [],
    technical_names: before.technical_names ?? [],
  }

  try {
    const updated = await shiftService.updateStaffingLabels('s1', {
      host_names: [' Hương ', 'Hương'],
      assistant_names: ['An; Linh'],
      technical_names: ['Minh'],
    }, '1')
    assert.deepEqual(updated?.host_names, ['Hương'])
    assert.deepEqual(updated?.assistant_names, ['An', 'Linh'])
    assert.deepEqual(updated?.technical_names, ['Minh'])
    assert.equal(updated?.host_id, before.host_id)
    assert.equal(updated?.support_id, before.support_id)
    assert.equal(updated?.technical_id, before.technical_id)
    assert.equal(updated?.required_host_count, before.required_host_count)
    assert.equal(updated?.required_support_count, before.required_support_count)
    assert.equal(updated?.required_technical_count, before.required_technical_count)
    assert.deepEqual(await shiftRegistrationService.getForShift('s1'), beforeRegistrations)
  } finally {
    await shiftService.updateStaffingLabels('s1', originalLabels, '1')
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('S4F.1 RPC is narrow, leader-gated and hardened', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260822140432_s4f1_edit_staffing_display_labels.sql', import.meta.url),
    'utf8',
  )
  const updateSet = sql.match(/update public\.shifts as target\s+set([\s\S]*?)where target\.id/i)?.[1] ?? ''

  assert.match(sql, /create or replace function public\.update_shift_staffing_labels\(\s*p_shift_id text,\s*p_host_names text\[\],\s*p_assistant_names text\[\],\s*p_technical_names text\[\]/i)
  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(sql, /private\.require_shift_actor\(true\)/i)
  assert.match(sql, /deleted_at is null/i)
  assert.match(sql, /archived_at is null/i)
  assert.match(sql, /for update/i)
  assert.match(sql, /revoke all on function public\.update_shift_staffing_labels\(text, text\[\], text\[\], text\[\]\) from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.update_shift_staffing_labels\(text, text\[\], text\[\], text\[\]\) to authenticated/i)
  assert.match(updateSet, /host_names = p_host_names/i)
  assert.match(updateSet, /assistant_names = p_assistant_names/i)
  assert.match(updateSet, /technical_names = p_technical_names/i)
  assert.match(updateSet, /updated_by = actor_id/i)
  assert.doesNotMatch(updateSet, /host_id|support_id|technical_id/)
  assert.doesNotMatch(updateSet, /required_.*_count|registration_locked|status|import_batch_id/)
  assert.doesNotMatch(sql, /insert into public\.shift_registrations/i)
  assert.doesNotMatch(sql, /schedule_import_batch_rows/i)
})

test('S4F-Lite migration is additive and keeps labels independent from staffing assignments', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20260821083750_s4f_lite_staffing_display_labels.sql', import.meta.url),
    'utf8',
  )

  const staffingColumns = ['host_names', 'assistant_names', 'technical_names']
  const whitelist = sql.match(/if input_key <> all \(array\[([\s\S]*?)\]::text\[\]\)/i)?.[1] ?? ''
  const insertColumns = sql.match(/insert into public\.shifts\s*\(([\s\S]*?)\)\s*values/i)?.[1] ?? ''

  for (const column of staffingColumns) {
    assert.match(sql, new RegExp(`add column if not exists ${column} text\\[\\] not null default`))
    assert.match(whitelist, new RegExp(`'${column}'`))
    assert.match(insertColumns, new RegExp(`\\b${column}\\b`))
    assert.match(sql, new RegExp(`p_data \\? '${column}'.*jsonb_typeof\\(p_data->'${column}'\\) <> 'array'`, 's'))
    assert.match(sql, new RegExp(`jsonb_array_elements_text\\(coalesce\\(p_data->'${column}', '.*?'::jsonb\\)\\)`, 's'))
  }
  assert.match(insertColumns, /\bimport_batch_id\b/)
  assert.match(sql, /nullif\(p_data->>'import_batch_id', ''\)/)
  assert.match(sql, /update public\.shifts set registration_locked = false where id = created_shift\.id/i)
  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.create_shift\(jsonb\) from public, anon, authenticated/i)
  assert.match(sql, /grant execute on function public\.create_shift\(jsonb\) to authenticated/i)
  assert.doesNotMatch(sql, /insert into public\.shift_registrations/i)
  assert.doesNotMatch(sql, /references public\.business_users/i)
})
