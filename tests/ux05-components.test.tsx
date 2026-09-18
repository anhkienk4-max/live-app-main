
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ObjectHeader, OperationalHeader } from '@/components/ui/headers'
import { MetricCard, AttentionItem, DecisionItem } from '@/components/ui/operational-widgets'

describe('UX-05 Shared Components', () => {
  it('ObjectHeader renders title and subtitle', () => {
    const html = renderToStaticMarkup(
      <ObjectHeader title="Test Title" subtitle="Test Subtitle" />
    )
    assert.ok(html.includes('Test Title'))
    assert.ok(html.includes('Test Subtitle'))
  })

  it('OperationalHeader renders with risk level', () => {
    const html = renderToStaticMarkup(
      <OperationalHeader title="Ops Header" riskLevel="high" />
    )
    assert.ok(html.includes('Ops Header'))
    assert.ok(html.includes('border-danger/30'))
  })

  it('MetricCard renders label and value', () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Uptime" value="99.9%" delta="+0.1%" trend="up" />
    )
    assert.ok(html.includes('Uptime'))
    assert.ok(html.includes('99.9%'))
    assert.ok(html.includes('text-success'))
  })

  it('AttentionItem renders severity context', () => {
    const html = renderToStaticMarkup(
      <AttentionItem severity="medium" context="Delay expected" />
    )
    assert.ok(html.includes('Delay expected'))
    assert.ok(html.includes('bg-warning/10'))
  })

  it('DecisionItem renders context and state', () => {
    const html = renderToStaticMarkup(
      <DecisionItem context="Approve Shift" state="Pending" />
    )
    assert.ok(html.includes('Approve Shift'))
    assert.ok(html.includes('Pending'))
  })
})
