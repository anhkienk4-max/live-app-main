import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import DashboardLoading from '../app/(dashboard)/loading.tsx'
import { ContentSkeleton } from '../components/ui/content-skeleton.tsx'

test('route loading.tsx renders the shared content skeleton', () => {
  const markup = renderToStaticMarkup(createElement(DashboardLoading))
  assert.match(markup, /content-skeleton/)
  assert.match(markup, /animate-pulse/)
})

test('ContentSkeleton renders stat cards and list rows without text flash', () => {
  const markup = renderToStaticMarkup(createElement(ContentSkeleton))
  assert.match(markup, /data-testid="content-skeleton"/)
  // No plain "Loading..." text.
  assert.doesNotMatch(markup, /Loading/)
})
