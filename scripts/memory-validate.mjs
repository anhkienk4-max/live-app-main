import fs from 'node:fs'
import path from 'node:path'
import { MEMORY_DIR, ROOT, readJson, deriveRepository, generatedMarkdown, projectStatePointer } from './project-memory-lib.mjs'

const required = ['current-state.json', 'modules.json', 'business-rules.json', 'flows.json', 'ui-contracts.json', 'data-contracts.json', 'permissions.json', 'defects.json', 'release-gates.json']
const errors = []
const fail = (message) => errors.push(message)
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const records = {}

for (const name of required) {
  const absolute = path.join(MEMORY_DIR, name)
  if (!fs.existsSync(absolute)) {
    fail(`missing ${name}`)
    continue
  }
  try {
    records[name] = readJson(name)
  } catch (error) {
    fail(`invalid JSON in ${name}: ${error.message}`)
  }
}

for (const [name, record] of Object.entries(records)) {
  if (!isObject(record)) {
    fail(`${name} must contain a JSON object`)
    continue
  }
  if (record.schema_version !== 1) fail(`${name} must declare schema_version 1`)
  if (typeof record.record_type !== 'string') fail(`${name} must declare record_type`)
}

const state = records['current-state.json']
const modules = records['modules.json']
const rules = records['business-rules.json']
const defects = records['defects.json']

if (state) {
  if (state.base?.sha !== '73b1999ea07cbc227d1bd4052088cc6c6f4cc8e5') fail('current-state base SHA is not the GL-03 expected base')
  if (state.hardening?.main_sha !== '73b1999ea07cbc227d1bd4052088cc6c6f4cc8e5') fail('current-state main SHA is not the GL-03 expected base')
  if (state.hardening?.g1_technical_baseline !== 'NOT_YET_CLOSED') fail('G1 technical baseline must remain NOT_YET_CLOSED')
  if (state.hardening?.production_uat !== 'PAUSED') fail('production UAT must remain PAUSED')
  if (state.hardening?.go_live !== 'NO') fail('go-live must remain NO')
  if (!state.repository?.head || !state.repository?.branch || !state.repository?.origin_main) fail('current-state repository identity is incomplete')
  if (!Array.isArray(state.inventory?.routes)) fail('current-state routes inventory is missing')
  if (!Array.isArray(state.inventory?.tests?.files)) fail('current-state tests inventory is missing')
  if (!Array.isArray(state.inventory?.migrations?.files)) fail('current-state migrations inventory is missing')
  try {
    const live = deriveRepository()
    for (const field of ['branch', 'head', 'origin_main']) {
      if (state.repository[field] !== live[field]) fail(`current-state repository.${field} does not match live Git`)
    }
  } catch (error) {
    fail(`could not verify live Git: ${error.message}`)
  }
}

const maturity = new Set(['IMPLEMENTED', 'UNIT_VERIFIED', 'INTEGRATION_VERIFIED', 'E2E_VERIFIED', 'UAT_VERIFIED', 'RELEASED'])
const expectedModules = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'SETTINGS_PROFILE', 'EXTERNAL_PROVIDERS'])
if (modules) {
  const ids = modules.modules?.map((module) => module.id) || []
  if (ids.length !== expectedModules.size || ids.some((id) => !expectedModules.has(id))) fail('module inventory does not match required initial modules')
  if (new Set(ids).size !== ids.length) fail('module IDs must be unique')
  for (const entry of modules.modules || []) {
    if (!maturity.has(entry.maturity)) fail(`${entry.id} has invalid maturity ${entry.maturity}`)
    if (entry.maturity === 'DONE' || entry.status === 'DONE') fail(`${entry.id} must not use DONE maturity`)
  }
}

const expectedDefects = {
  'RW-001': ['FIXED', undefined],
  'RW-002': ['OPEN', undefined],
  'RW-003': ['OPEN', 'P1'],
  'RW-004': ['OPEN', 'P1'],
}
if (defects) {
  const byId = Object.fromEntries((defects.defects || []).map((defect) => [defect.id, defect]))
  for (const [id, [status, priority]] of Object.entries(expectedDefects)) {
    if (!byId[id]) fail(`missing defect ${id}`)
    else {
      if (byId[id].status !== status) fail(`${id} status must remain ${status}`)
      if (priority && byId[id].priority !== priority) fail(`${id} priority must remain ${priority}`)
    }
  }
  if (Object.keys(byId).length !== Object.keys(expectedDefects).length) fail('defect register contains unexpected IDs')
  if (byId['RW-001']?.resolution !== 'merged PR #20') fail('RW-001 must record merged PR #20')
}

const requiredRules = {
  'BR-001': 'preferred_roles != operational_roles',
  'BR-002': 'server_mutation_success requires authoritative_persistence',
  'BR-003': 'same_filter_dimension.multi_select = OR',
  'BR-004': 'different_filter_dimensions = AND',
  'BR-005': 'confirmed_assignment > imported_staffing_label > unassigned',
  'BR-006': 'frontend_hiding != authorization',
  'BR-007': 'backend_or_rpc_permission = authoritative',
}
if (rules) {
  const byId = Object.fromEntries((rules.rules || []).map((rule) => [rule.id, rule]))
  for (const [id, expression] of Object.entries(requiredRules)) {
    if (!byId[id]) fail(`missing business rule ${id}`)
    else if (byId[id].expression !== expression) fail(`${id} expression is not canonical`)
  }
  if (byId['BR-005'] && JSON.stringify(byId['BR-005'].precedence) !== JSON.stringify(['confirmed assignment', 'imported staffing label', 'unassigned'])) fail('BR-005 precedence is not canonical')
}

const generatedPath = path.join(MEMORY_DIR, 'generated', 'project-memory.md')
if (!fs.existsSync(generatedPath)) fail('generated/project-memory.md is missing; run npm run memory:sync')
else if (state && modules && defects && rules && fs.readFileSync(generatedPath, 'utf8') !== generatedMarkdown(state, modules, defects, rules)) fail('generated/project-memory.md is out of sync; run npm run memory:sync')
const pointerPath = path.join(ROOT, 'PROJECT_STATE.md')
if (!fs.existsSync(pointerPath) || fs.readFileSync(pointerPath, 'utf8') !== projectStatePointer()) fail('PROJECT_STATE.md must remain the generated pointer')

if (errors.length) {
  console.error(`Memory validation failed with ${errors.length} error(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`Memory validation passed: ${required.length} canonical JSON records and generated projections are consistent.`)
}
