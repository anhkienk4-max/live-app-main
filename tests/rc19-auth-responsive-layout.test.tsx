import * as React from 'react'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../lib/i18n.tsx'
import { AuthLayout } from '../components/layouts/AuthLayout.tsx'

test('U01 auth layout server-renders for both languages with accessible landmarks and skip control', () => {
  for (const locale of ['vi', 'en'] as const) {
    const markup = renderToStaticMarkup(React.createElement(
      LanguageProvider, { defaultLanguage: locale },
      React.createElement(AuthLayout, {
        title: locale === 'vi' ? 'Đăng nhập' : 'Sign in',
        subtitle: 'Secure account access',
      }, React.createElement('form', { 'aria-label': 'Email sign in' },
        React.createElement('input', { type: 'email', name: 'email' }),
      )),
    ))
    assert.match(markup, /href="#auth-content"/)
    assert.match(markup, /id="auth-content"/)
    assert.match(markup, /aria-labelledby="auth-title"/)
    assert.match(markup, /id="auth-title"/)
    assert.match(markup, /name="email"/)
    assert.equal((markup.match(/<main /g) ?? []).length, 1)
  }
})

test('U01 responsive layout makes auth form readable at phone, tablet and desktop without overflow', () => {
  const markup = renderToStaticMarkup(React.createElement(
    LanguageProvider, null,
    React.createElement(AuthLayout, { title: 'Sign in', subtitle: 'My workspace' }, 'Credentials'),
  ))
  assert.match(markup, /min-h-dvh w-full min-w-0 items-start justify-center/)
  assert.match(markup, /sm:px-6 sm:py-8 lg:items-center/)
  assert.match(markup, /lg:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1fr\)\]/)
  assert.match(markup, /max-w-\[720px\]/)
  assert.match(markup, /lg:max-w-\[1180px\]/)
  assert.match(markup, /max-w-\[460px\]/)
  assert.match(markup, /break-words text-3xl/)
  assert.match(markup, /data-testid="auth-form-panel"/)
  assert.ok(!markup.includes('overflow-x-auto'))
})

test('U01 login keeps actual credentials, session recovery and an accessible form-sized suspense fallback', () => {
  const login = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
  assert.match(login, /<form onSubmit={handleEmailLogin} className="space-y-5" aria-busy={loading}>/)
  assert.match(login, /data-testid="email-input"/)
  assert.match(login, /data-testid="password-input"/)
  assert.match(login, /data-testid="email-login-btn"/)
  assert.match(login, /data-testid="login-error" role="alert"|role="alert" className="[^"]+" data-testid="login-error"/)
  assert.match(login, /role="status" aria-live="polite"/)
  assert.match(login, /href="\/forgot-password"/)
  assert.match(login, /href="\/register"/)
  assert.match(login, /establishPasswordSession\(createClient, email, password\)/)
  assert.match(login, /shouldClearLocalSessionForLoginReason\(recoveryReason\)/)
  assert.match(login, /safeLocalRedirect\(/)
  assert.match(login, /function LoginPagePending\(\)/)
  assert.match(login, /aria-busy="true"/)
  assert.match(login, /motion-reduce:animate-none/)
  assert.match(login, /<Suspense fallback={<LoginPagePending \/>}>/)
  assert.doesNotMatch(login, /fallback={null}/)
  assert.ok(login.indexOf('handleEmailLogin') < login.indexOf('function LoginPagePending'))
})
