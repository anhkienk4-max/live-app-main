import { readJson, writeJson, deriveInventory, deriveRepository, git, writeProjection } from './project-memory-lib.mjs'

const state = readJson('current-state.json')
state.repository = { ...state.repository, ...deriveRepository() }
state.inventory = deriveInventory()
state.synced_at = git(['show', '-s', '--format=%cI', 'HEAD'])
writeJson('current-state.json', state)
writeProjection(state)

console.log(`Memory sync complete: ${state.repository.branch} at ${state.repository.head}`)
console.log(`Inventory: ${state.inventory.routes.length} routes, ${state.inventory.tests.count} tests, ${state.inventory.migrations.count} migrations`)
