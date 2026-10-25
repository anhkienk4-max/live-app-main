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
