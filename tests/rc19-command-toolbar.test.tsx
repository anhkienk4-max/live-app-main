import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandToolbar } from '../components/ui/command-toolbar.tsx'

test('reusable toolbar is accessible, labels its landmark and exposes loading state',()=>{
  const html=renderToStaticMarkup(React.createElement(CommandToolbar,
    {label:'Tìm và lọc file',loading:true,id:'storage-controls'},
    React.createElement('input',{type:'search','aria-label':'Tìm tên file'})
  ))
  assert.match(html,/<section/)
  assert.match(html,/aria-label="Tìm và lọc file"/)
  assert.match(html,/aria-busy="true"/)
  assert.match(html,/id="storage-controls"/)
  assert.match(html,/data-testid="command-toolbar"/)
  assert.match(html,/aria-label="Tìm tên file"/)
})
test('Reports and Storage share a responsive command landmark without changing apply/export scope',()=>{
  const reports=readFileSync(new URL('../components/features/reports/ReportsList.tsx',import.meta.url),'utf8')
  const storage=readFileSync(new URL('../components/features/storage/OperationalFileWorkspace.tsx',import.meta.url),'utf8')
  assert.match(reports,/import \{ CommandToolbar \} from '@\/components\/ui\/command-toolbar'/)
  assert.match(storage,/import \{ CommandToolbar \} from '@\/components\/ui\/command-toolbar'/)
  assert.match(reports,/<CommandToolbar label=\{t\('filters'\)\}/)
  assert.match(reports,/data-testid="reports-apply-filters"/)
  assert.match(reports,/reportService\.getAllFiltered\(JSON\.parse\(encodedFilters\)\)/)
  assert.match(storage,/<CommandToolbar label="Tìm và lọc file"/)
  assert.match(storage,/onClick=\{applySearch\}/)
  assert.match(storage,/provider_filter: providerFilter, search: appliedSearch/)
})
