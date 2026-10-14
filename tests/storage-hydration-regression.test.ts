import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { LanguageProvider, useTranslation } from '../lib/i18n.tsx'
import { businessLocalDate } from '../lib/utils/shiftUtils.ts'
import { OperationalFileWorkspace } from '../components/features/storage/OperationalFileWorkspace.tsx'
import { AuthIdentityProvider } from '../lib/auth/AuthIdentityProvider.tsx'
import type { User } from '../lib/types/database.types.ts'

const fixtureAdmin: User = {
  id: 'qa-storage-admin', email: 'qa-storage@example.invalid', full_name: 'Storage fixture Admin',
  role: 'admin', system_permission: 'admin', status: 'active', join_date: '2026-10-13',
  created_at: '2026-10-13', updated_at: '2026-10-13',
}

test('storage hydration: LanguageProvider defaults to Vietnamese (vi) and preserves native copy', () => {
  function TestConsumer() {
    const { language, t } = useTranslation()
    return React.createElement('div', { 'data-lang': language }, t('save'))
  }

  const html = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      null,
      React.createElement(TestConsumer, null)
    )
  )

  assert.match(html, /data-lang="vi"/)
  assert.match(html, />Lưu</)
})

test('storage hydration: LanguageProvider respects explicit defaultLanguage prop', () => {
  function TestConsumer() {
    const { language, t } = useTranslation()
    return React.createElement('div', { 'data-lang': language }, t('save'))
  }

  const htmlVi = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { defaultLanguage: 'vi' },
      React.createElement(TestConsumer, null)
    )
  )
  assert.match(htmlVi, /data-lang="vi"/)
  assert.match(htmlVi, />Lưu</)

  const htmlEn = renderToStaticMarkup(
    React.createElement(
      LanguageProvider,
      { defaultLanguage: 'en' },
      React.createElement(TestConsumer, null)
    )
  )
  assert.match(htmlEn, /data-lang="en"/)
  assert.match(htmlEn, />Save</)
})

test('storage hydration: businessLocalDate produces deterministic YYYY-MM-DD in Vietnam timezone', () => {
  const fixedUtcDate = new Date('2026-10-13T01:30:00.000Z') // 08:30 in UTC+7
  const formatted = businessLocalDate(fixedUtcDate)
  assert.equal(formatted, '2026-10-13')

  // Midnight edge case: 2026-10-12 23:30 UTC is 2026-10-13 06:30 UTC+7
  const midnightUtcDate = new Date('2026-10-12T23:30:00.000Z')
  assert.equal(businessLocalDate(midnightUtcDate), '2026-10-13')
})

for (const [language, heading, label, all, savedFiles] of [
  ['vi', 'Kho file vận hành', 'Lọc loại file', 'Tất cả', 'File đã lưu'],
  ['en', 'Operational file storage', 'Filter file category', 'All', 'Saved files'],
] as const) {
  test(`storage hydration: real workspace SSR renders ${language} labels and a stable initial date`, () => {
    const markup = renderToStaticMarkup(React.createElement(LanguageProvider,
      { defaultLanguage: language }, React.createElement(AuthIdentityProvider,
        { mode: 'supabase', identity: null, businessUser: fixtureAdmin }, React.createElement(OperationalFileWorkspace))))
    assert.ok(markup.includes(heading))
    assert.ok(markup.includes(`aria-label="${label}"`))
    assert.ok(markup.includes(`<option value="all" selected="">${all}</option>`))
    assert.ok(markup.includes(`<h2 class="font-semibold">${savedFiles} (0)</h2>`))
    assert.match(markup, /type="date"[^>]*value=""/)
  })
}
