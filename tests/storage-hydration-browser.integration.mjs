import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { chromium } from '@playwright/test'
import { HydrationFixture } from './fixtures/storage-hydration-browser.tsx'

// This fixture exercises real React components; it does not authenticate or contact Production.
const require = createRequire(import.meta.url)
const root = resolve('.')
const temp = await mkdtemp(join(tmpdir(), 'storage-hydration-'))
assert.equal(dirname(temp), resolve(tmpdir()))
assert.ok(basename(temp).startsWith('storage-hydration-'))
let browser
let server
try {
  const loader = join(temp, 'typescript-loader.cjs')
  await writeFile(loader, `const ts = require(${JSON.stringify(require.resolve('typescript'))});
    module.exports = function(source) { return ts.transpileModule(source, {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022 }, fileName: this.resourcePath
    }).outputText; };`)
  const realtimeBridge = join(temp, 'shift-change-bridge.cjs')
  await writeFile(realtimeBridge, 'exports.ShiftChangeBridge = function ShiftChangeBridge() { return null }')
  const webpack = require('next/dist/compiled/webpack/webpack').webpack
  await new Promise((accept, reject) => webpack({
    mode: 'production', target: 'web', context: root,
    entry: resolve('tests/fixtures/storage-hydration-browser.tsx'),
    output: { path: temp, filename: 'client.js' },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        '@/components/providers/ShiftChangeBridge$': realtimeBridge,
        '@': root,
        'next/navigation$': resolve('tests/next-navigation-test-shim.mjs'),
        'next/link$': resolve('tests/next-link-test-shim.mjs'),
      },
    },
    module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: loader }] },
    plugins: [new webpack.DefinePlugin({
      'process.env.NEXT_PUBLIC_USE_MOCK_DATA': JSON.stringify('false'),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(''),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(''),
    })],
    optimization: { minimize: false },
  }, (error, stats) => error || stats.hasErrors()
    ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : accept()))
  const client = await readFile(join(temp, 'client.js'))
  const cssFiles = (await readdir('.next/static/chunks')).filter(name => name.endsWith('.css'))
  assert.ok(cssFiles.length, 'Build the Next.js application before checking the responsive workspace')
  const css = (await Promise.all(cssFiles.map(name => readFile(join('.next/static/chunks', name), 'utf8')))).join('\n')
  const evidence = resolve('test_reports/hydration-release/isolated-browser')
  await mkdir(evidence, { recursive: true })
  const markup = renderToString(React.createElement(HydrationFixture))
  assert.match(markup, /Kho file vận hành/)
  server = createServer((req, res) => {
    if (req.url === '/client.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript' }); res.end(client)
    } else if (req.url === '/style.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' }); res.end(css)
    } else if (req.url.startsWith('/api/')) {
      // No fake successful catalog/data response: the workspace must handle a real failure shape.
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: { code: 'STORAGE_ROUTE_NOT_CONFIGURED' } }))
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-background"><main class="p-4"><div id="root">${markup}</div></main><script src="/client.js"></script></body></html>`)
    }
  })
  await new Promise(accept => server.listen(0, '127.0.0.1', accept))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const results = []
  for (const width of [1440, 390]) {
    for (const saved of ['vi', 'en']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' })
      await context.addInitScript(language => localStorage.setItem('livestream-ops-language', language), saved)
      const page = await context.newPage()
      const errors = []
      const networkErrors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('response', response => {
        const path = new URL(response.url()).pathname
        if (response.status() >= 400 && !(path === '/api/operational-files' && response.status() === 503)) {
          networkErrors.push({ path, status: response.status() })
        }
      })
      page.on('requestfailed', request => networkErrors.push({ path: new URL(request.url()).pathname, failure: request.failure()?.errorText }))
      page.on('console', message => {
        if (message.type() === 'error' && !/^Failed to load resource:.*\b503\b/.test(message.text())) errors.push(message.text())
      })
      for (const load of ['initial', 'refresh']) {
        if (load === 'initial') await page.goto(origin)
        else await page.reload()
        await page.waitForFunction(language => document.documentElement.lang === language, saved)
        try {
          await page.getByRole('heading', { name: saved === 'vi' ? 'Kho file vận hành' : 'Operational file storage' }).waitFor()
        } catch (error) {
          throw new Error(`Workspace heading did not render: ${JSON.stringify({ body: await page.locator('body').innerText(), errors, networkErrors })}`, { cause: error })
        }
        assert.equal(await page.getByTestId('shared-label').textContent(), saved === 'vi' ? 'Lưu' : 'Save')
        assert.equal(await page.getByTestId('untranslated-data').textContent(), 'All', 'The provider must not rewrite unrelated React-owned text')
        await page.screenshot({ path: join(evidence, `storage-fixture-${width}-${saved}-${load}.png`), fullPage: true })
        for (const language of ['vi', 'en', 'vi']) {
          await page.getByRole('button', { name: language, exact: true }).click()
          await page.waitForFunction(expected => document.documentElement.lang === expected, language)
          const label = language === 'vi' ? 'Lọc loại file' : 'Filter file category'
          const filter = page.getByRole('combobox', { name: label, exact: true })
          await filter.selectOption('all')
          assert.equal(await filter.inputValue(), 'all')
          assert.equal(await filter.locator('option:checked').textContent(), language === 'vi' ? 'Tất cả' : 'All')
          assert.equal(await page.getByTestId('shared-label').textContent(), language === 'vi' ? 'Lưu' : 'Save')
        }
        assert.equal(await page.locator('input[type="date"]').inputValue(), new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date()))
        assert.deepEqual(errors, [], `No hydration, recoverable, or new JavaScript console errors (${width}px, saved ${saved}, ${load})`)
        assert.deepEqual(networkErrors, [], 'Only the explicit fixture API 503 is expected')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Workspace content must fit the viewport')
        results.push({ width, savedLanguage: saved, load, result: 'PASS', expectedNetworkStatus: 503 })
      }
      await context.close()
    }
  }
  console.log(JSON.stringify({ fixture: 'isolated real-component SSR/hydration; not authenticated UAT', results }, null, 2))
  await writeFile(join(evidence, 'results.json'), JSON.stringify({ fixture: 'isolated, no Production access', results }, null, 2))
} finally {
  if (browser) await browser.close()
  if (server) await new Promise(accept => server.close(accept))
  await rm(temp, { recursive: true, force: true })
}
