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
