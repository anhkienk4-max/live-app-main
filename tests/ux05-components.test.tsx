
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

import { ActiveFilterChips } from '@/components/ui/filter-bar'
import {
  LoadingState,
  EmptyState,
  FilterEmptyState,
  ErrorState,
  PartialState,
  PermissionState,
  StaleState,
  ConflictState,
} from '@/components/ui/states'

describe('UX-05 ActiveFilter System', () => {
  it('ActiveFilterChips renders multiple filters and clear all', () => {
    const filters = [
      { id: '1', label: 'Role', value: 'Host' },
      { id: '2', label: 'Status', value: 'Live' }
    ]
    const html = renderToStaticMarkup(
      <ActiveFilterChips filters={filters} onRemove={() => {}} onClearAll={() => {}} clearAllLabel="Clear Filters" />
    )
    assert.ok(html.includes('Role:'))
    assert.ok(html.includes('Host'))
    assert.ok(html.includes('Status:'))
    assert.ok(html.includes('Live'))
    assert.ok(html.includes('Clear Filters'))
  })
})

describe('UX-05 Semantic States', () => {
  it('LoadingState renders properly', () => {
    const html = renderToStaticMarkup(<LoadingState text="Loading data..." />)
    assert.ok(html.includes('Loading data...'))
    assert.ok(html.includes('animate-spin'))
  })

  it('EmptyState renders properly', () => {
    const html = renderToStaticMarkup(<EmptyState title="No items" description="Try again" />)
    assert.ok(html.includes('No items'))
    assert.ok(html.includes('Try again'))
  })

  it('FilterEmptyState renders properly', () => {
    const html = renderToStaticMarkup(<FilterEmptyState title="No results found for your filters" onClearFilters={() => {}} />)
    assert.ok(html.includes('No results found for your filters'))
  })

  it('ErrorState renders properly', () => {
    const html = renderToStaticMarkup(<ErrorState title="Error occurred" onRetry={() => {}} />)
    assert.ok(html.includes('Error occurred'))
    assert.ok(html.includes('text-danger'))
  })

  it('PartialState renders properly', () => {
    const html = renderToStaticMarkup(<PartialState title="Partial Data" />)
    assert.ok(html.includes('Partial Data'))
    assert.ok(html.includes('text-warning'))
  })

  it('PermissionState renders properly', () => {
    const html = renderToStaticMarkup(<PermissionState title="Access Denied" />)
    assert.ok(html.includes('Access Denied'))
  })

  it('StaleState renders properly', () => {
    const html = renderToStaticMarkup(<StaleState lastSync="5 mins ago" />)
    assert.ok(html.includes('5 mins ago'))
  })

  it('ConflictState renders properly', () => {
    const html = renderToStaticMarkup(<ConflictState title="Version conflict" onResolve={() => {}} />)
    assert.ok(html.includes('Version conflict'))
  })
})
