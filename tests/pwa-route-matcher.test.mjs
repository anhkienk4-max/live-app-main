import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
const match = source.match(/matcher:\s*\[\s*'([^']+)'/);

test('PWA assets bypass Supabase auth proxy', () => {
  assert.ok(match, 'proxy.ts must declare a matcher');
  // Decode backslash escapes from the single-quoted TypeScript matcher literal.
  const matcherPattern = match[1].replaceAll('\\\\', '\\');
  const matcher = new RegExp('^' + matcherPattern + '$');
  for (const route of [
    '/manifest.webmanifest', '/icon1', '/icon2', '/icon3',
    '/apple-icon', '/favicon.ico', '/api/health', '/_next/static/chunk.js',
    '/brand/icon.png',
  ]) {
    assert.equal(matcher.test(route), false, route + ' must bypass the proxy');
  }
});

test('operational pages remain subject to the auth proxy', () => {
  assert.ok(match, 'proxy.ts must declare a matcher');
  const matcherPattern = match[1].replaceAll('\\\\', '\\');
  const matcher = new RegExp('^' + matcherPattern + '$');
  for (const route of [
    '/', '/login', '/calendar', '/shifts', '/reports', '/storage',
    '/workforce', '/payroll', '/settings',
  ]) {
    assert.equal(matcher.test(route), true, route + ' must remain protected by the proxy');
  }
});

test('PWA manifest stays same-origin and uses standalone display', () => {
  const manifest = readFileSync(new URL('../app/manifest.ts', import.meta.url), 'utf8');
  assert.match(manifest, /start_url:\s*["']\/["']/);
  assert.match(manifest, /scope:\s*["']\/["']/);
  assert.match(manifest, /display:\s*["']standalone["']/);
  for (const route of ['/icon1', '/icon2', '/icon3']) {
    assert.ok(manifest.includes(route), 'manifest icon ' + route + ' missing');
  }
});
