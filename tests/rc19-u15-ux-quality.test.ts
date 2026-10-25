import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('U15 accessibility: globals.css supports prefers-reduced-motion to eliminate layout disturbance and excessive motion', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'globals.css must include prefers-reduced-motion')
  assert.ok(css.includes('animation-duration: 0.01ms !important'), 'must minimize animation duration')
  assert.ok(css.includes('transition-duration: 0.01ms !important'), 'must minimize transition duration')
  assert.ok(css.includes('scroll-behavior: auto !important'), 'must disable smooth scrolling')
})

test('U15 loading UX: PageLoader uses responsive grid breakpoints to prevent mobile layout jump and squishing', () => {
  const code = readFileSync(new URL('../lib/utils/lazyComponents.tsx', import.meta.url), 'utf8')
  assert.ok(code.includes('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'), 'PageLoader must use responsive column scaling')
  assert.ok(!code.includes('grid grid-cols-4 gap-4'), 'PageLoader must not use rigid 4-column layout on mobile')
})

test('U15 loading UX: Storage workspaces render structured skeleton shells instead of bare text paragraphs', () => {
  const filesWs = readFileSync(new URL('../components/features/storage/OperationalFileWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(filesWs.includes('data-testid="operational-file-workspace-loading"'), 'OperationalFileWorkspace must render structured loading shell')
  assert.ok(!filesWs.includes("if(userLoading||!currentUser)return <p className=\"p-4\">{t('loading')}</p>"), 'Must not return bare p tag during userLoading')

  const setupWs = readFileSync(new URL('../components/features/storage/OperationalStorageSetupWorkspace.tsx', import.meta.url), 'utf8')
  assert.ok(setupWs.includes('data-testid="storage-setup-loading"'), 'OperationalStorageSetupWorkspace must render structured loading shell')
  assert.ok(!setupWs.includes("if(userLoading)return <p className=\"p-6\">{t('loading')}</p>"), 'Must not return bare p tag during userLoading')
})

test('U15 loading UX: Notifications and Profile pages render structured skeleton shells instead of bare text centers', () => {
  const notif = readFileSync(new URL('../app/(dashboard)/notifications/page.tsx', import.meta.url), 'utf8')
  assert.ok(notif.includes('data-testid="notifications-loading-shell"'), 'Notifications must render structured loading shell')
  assert.ok(!notif.includes("if (loading || userLoading) return <div role=\"status\" className=\"p-12 text-center\">{t('loading')}</div>"))

  const profile = readFileSync(new URL('../app/(dashboard)/profile/page.tsx', import.meta.url), 'utf8')
  assert.ok(profile.includes('data-testid="profile-loading-shell"'), 'Profile must render structured loading shell')
  assert.ok(!profile.includes("if (loading || !currentUser) return <div className=\"py-12 text-center\">{t('loading')}</div>"))
})
