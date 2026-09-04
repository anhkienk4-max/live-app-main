import { readJson } from './project-memory-lib.mjs'

const state = readJson('current-state.json')
const modules = readJson('modules.json')
const defects = readJson('defects.json')
const rules = readJson('business-rules.json')
const maturityCounts = modules.modules.reduce((counts, module) => {
  counts[module.maturity] = (counts[module.maturity] || 0) + 1
  return counts
}, {})
const openDefects = defects.defects.filter((defect) => defect.status === 'OPEN')

console.log('Project Memory V1')
console.log(`Repository: ${state.repository.branch} at ${state.repository.head}`)
console.log(`Inventory: ${state.inventory.routes.length} routes, ${state.inventory.tests.count} tests, ${state.inventory.migrations.count} migrations`)
console.log(`Modules: ${modules.modules.length} total (${Object.entries(maturityCounts).map(([key, value]) => `${key}=${value}`).join(', ')})`)
console.log(`Defects: ${defects.defects.length} total, ${openDefects.length} open`)
console.log(`Business rules: ${rules.rules.length} canonical`)
console.log(`Generated at: ${state.synced_at || 'not yet synchronized'}`)
