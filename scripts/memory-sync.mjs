import { readJson, writeJson, deriveInventory, deriveRepository, git, writeProjection } from './project-memory-lib.mjs'

const state = readJson('current-state.json')
const live = deriveRepository()

if (process.env.GITHUB_ACTIONS === 'true' || live.branch === 'DETACHED') {
  throw new Error('Memory sync requires a named local branch; CI and detached checkouts may validate but must not rewrite canonical state.')
}

const canonicalRef = `refs/remotes/origin/${state.repository.branch}`
const canonicalHead = git(['rev-parse', '--verify', `${canonicalRef}^{commit}`])
try {
  git(['merge-base', '--is-ancestor', canonicalHead, live.head])
} catch {
  throw new Error(`Memory sync must run from a commit based on ${canonicalRef}.`)
}

state.repository = { ...state.repository, head: live.head, origin_main: live.origin_main }
delete state.repository.worktree
state.inventory = deriveInventory()
state.synced_at = git(['show', '-s', '--format=%cI', 'HEAD'])
writeJson('current-state.json', state)
writeProjection(state)

console.log(`Memory sync complete: ${state.repository.branch} at ${state.repository.head}`)
console.log(`Inventory: ${state.inventory.routes.length} routes, ${state.inventory.tests.count} tests, ${state.inventory.migrations.count} migrations`)
