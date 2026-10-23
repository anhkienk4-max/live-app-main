import * as React from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '../lib/i18n.tsx'
import { AuthLayout } from '../components/layouts/AuthLayout.tsx'

test('Auth layout server-renders at both languages with landmark and keyboard skip control',()=>{
  for(const locale of ['vi','en'] as const){
    const markup=renderToStaticMarkup(React.createElement(LanguageProvider,
      {defaultLanguage:locale}, React.createElement(AuthLayout,
        {title:locale==='vi'?'Đăng nhập':'Sign in',subtitle:'Secure account access'},
        React.createElement('form',{'aria-label':'Email sign in'},React.createElement('input',{type:'email',name:'email'}))
      )))
    assert.match(markup,/href="#auth-content"/)
    assert.match(markup,/id="auth-content"/)
    assert.match(markup,/aria-labelledby="auth-title"/)
    assert.match(markup,/id="auth-title"/)
    assert.match(markup,/name="email"/)
    assert.equal((markup.match(/<main /g)??[]).length,1)
  }
})
test('Auth layout protects 320px and zoomed viewports with min-w-0 and mobile-first scrolling',()=>{
  const markup=renderToStaticMarkup(React.createElement(LanguageProvider,null,
    React.createElement(AuthLayout,{title:'Sign in',subtitle:'My workspace'},'Credentials')))
  assert.match(markup,/min-h-dvh w-full min-w-0 items-start justify-center/)
  assert.match(markup,/sm:px-6 sm:py-6 lg:items-center/)
  assert.match(markup,/lg:grid-cols-\[minmax\(0,0\.8fr\)_minmax\(0,1fr\)\]/)
  assert.match(markup,/min-w-0 w-full px-4 py-6/)
  assert.match(markup,/break-words text-xl/)
  assert.ok(!markup.includes('overflow-x-auto'))
})
