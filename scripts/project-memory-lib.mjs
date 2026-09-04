import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MEMORY_DIR = path.join(ROOT, 'project-memory')

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

export function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(MEMORY_DIR, name), 'utf8'))
}

export function writeJson(name, value) {
  fs.writeFileSync(path.join(MEMORY_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function walk(relativeRoot, predicate) {
  const absoluteRoot = path.join(ROOT, relativeRoot)
  if (!fs.existsSync(absoluteRoot)) return []
  const result = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === '.serena') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (predicate(entry.name, absolute)) result.push(normalizePath(path.relative(ROOT, absolute)))
    }
  }
  visit(absoluteRoot)
  return result.sort()
}

export function deriveInventory() {
  const routes = walk('app', (name) => /^(page|route)\.(ts|tsx)$/.test(name))
  const tests = walk('tests', (name) => /\.test\.(ts|tsx)$/.test(name))
  const migrations = walk('supabase/migrations', (name) => name.endsWith('.sql'))
  const roots = ['app', 'components', 'lib', 'scripts', 'supabase', 'tests']
    .map((root) => [root, walk(root, (name) => /\.(ts|tsx|js|mjs|sql|yaml|json)$/.test(name)).length])
  return {
    routes,
    source_files: { roots: Object.fromEntries(roots), total: roots.reduce((sum, [, count]) => sum + count, 0) },
    tests: { files: tests, count: tests.length },
    migrations: { files: migrations, count: migrations.length },
  }
}

export function deriveRepository() {
  return {
    branch: git(['branch', '--show-current']) || 'DETACHED',
    head: git(['rev-parse', 'HEAD']),
    origin_main: git(['rev-parse', 'origin/main']),
    worktree: git(['rev-parse', '--show-toplevel']),
  }
}

export function projectStatePointer() {
  return '# PROJECT_STATE\n\n<!-- GENERATED POINTER: canonical state is project-memory/current-state.json. -->\n\nThis file is a generated navigation pointer. Do not maintain baseline facts here.\n\nRun `npm run memory:sync` to refresh the generated Markdown projection at\n`project-memory/generated/project-memory.md`.\n'
}

function tableRow(values) {
  return `| ${values.join(' | ')} |`
}

export function generatedMarkdown(state, modules, defects, rules) {
  const moduleRows = modules.modules.map((module) => tableRow([module.id, module.name, module.maturity]))
  const defectRows = defects.defects.map((defect) => tableRow([defect.id, defect.status, defect.priority || '-', defect.title]))
  const ruleRows = rules.rules.map((rule) => tableRow([rule.id, rule.expression]))
  return [
    '# Project Memory V1 Projection',
    '',
    '<!-- GENERATED FILE. Do not edit. Source records are the JSON files in this directory. -->',
    '',
    `Generated at: ${state.synced_at || 'not yet synchronized'}`,
    '',
    '## Repository',
    '',
    `- Branch: \`${state.repository.branch}\``,
    `- HEAD: \`${state.repository.head}\``,
    `- origin/main: \`${state.repository.origin_main}\``,
    `- Worktree: \`${state.repository.worktree}\``,
    `- Base: \`${state.base.ref}\` at \`${state.base.sha}\``,
    '',
    '## Hardening',
    '',
    `- Main: \`${state.hardening.main_sha}\``,
    `- G1 technical baseline: ${state.hardening.g1_technical_baseline}`,
    `- Production UAT: ${state.hardening.production_uat}`,
    `- Go-live: ${state.hardening.go_live}`,
    '',
    '## Inventory',
    '',
    `- Routes: ${state.inventory.routes.length}`,
    `- Source files in tracked inventory roots: ${state.inventory.source_files.total}`,
    `- Tests: ${state.inventory.tests.count}`,
    `- Migrations: ${state.inventory.migrations.count}`,
    '',
    '## Modules',
    '',
    tableRow(['ID', 'Module', 'Maturity']),
    tableRow(['---', '---', '---']),
    ...moduleRows,
    '',
    '## Defects',
    '',
    tableRow(['ID', 'Status', 'Priority', 'Defect']),
    tableRow(['---', '---', '---', '---']),
    ...defectRows,
    '',
    '## Business Rules',
    '',
    tableRow(['ID', 'Expression']),
    tableRow(['---', '---']),
    ...ruleRows,
    '',
    'Update with `npm run memory:sync`; validate with `npm run memory:validate`.',
    '',
  ].join('\n')
}

export function writeProjection(state) {
  const modules = readJson('modules.json')
  const defects = readJson('defects.json')
  const rules = readJson('business-rules.json')
  const generatedDir = path.join(MEMORY_DIR, 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  fs.writeFileSync(path.join(generatedDir, 'project-memory.md'), generatedMarkdown(state, modules, defects, rules), 'utf8')
  fs.writeFileSync(path.join(ROOT, 'PROJECT_STATE.md'), projectStatePointer(), 'utf8')
}
