import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const repositoryRoot = process.cwd()
const runGit = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const localProcessEnv = () => {
  const env = { ...process.env }
  delete env.GITHUB_ACTIONS
  delete env.GITHUB_EVENT_NAME
  delete env.GITHUB_BASE_REF
  return env
}

function createRepository() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'memory-validator-'))
  const scripts = path.join(root, 'scripts')
  const hooks = path.join(root, 'hooks')
  mkdirSync(scripts)
  mkdirSync(hooks)
  cpSync(path.join(repositoryRoot, 'project-memory'), path.join(root, 'project-memory'), { recursive: true })
  const statePath = path.join(root, 'project-memory', 'current-state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  state.repository = { ...state.repository, branch: 'main' }
  delete state.repository.worktree
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
  for (const name of ['memory-sync.mjs', 'memory-validate.mjs', 'project-memory-lib.mjs']) {
    cpSync(path.join(repositoryRoot, 'scripts', name), path.join(scripts, name))
  }

  runGit(root, ['init', '-q', '-b', 'main'])
  runGit(root, ['config', 'core.hooksPath', hooks])
  runGit(root, ['config', 'user.email', 'memory-validator@example.test'])
  runGit(root, ['config', 'user.name', 'Memory Validator'])
  writeFileSync(path.join(root, 'source.txt'), 'source snapshot\n')
  runGit(root, ['add', 'source.txt', 'project-memory', 'scripts'])
  runGit(root, ['commit', '-qm', 'source snapshot'])
  const sourceSnapshot = runGit(root, ['rev-parse', 'HEAD'])
  runGit(root, ['update-ref', 'refs/remotes/origin/main', sourceSnapshot])
  execFileSync(process.execPath, [path.join(scripts, 'memory-sync.mjs')], { cwd: root, encoding: 'utf8', env: localProcessEnv() })
  runGit(root, ['add', 'project-memory', 'PROJECT_STATE.md'])
  runGit(root, ['commit', '-qm', 'memory snapshot'])
  return { root, sourceSnapshot }
}

function validate(root: string, extraEnv: NodeJS.ProcessEnv = {}) {
  try {
    const output = execFileSync(process.execPath, [path.join(root, 'scripts', 'memory-validate.mjs')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, ...extraEnv },
    })
    return { passed: true, output }
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string }
    return { passed: false, output: (result.stdout || '') + (result.stderr || '') }
  }
}

function sync(root: string) {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'memory-sync.mjs')], { cwd: root, encoding: 'utf8', env: localProcessEnv() })
}

function setStoredHead(root: string, head: string) {
  const file = path.join(root, 'project-memory', 'current-state.json')
  const state = JSON.parse(readFileSync(file, 'utf8'))
  state.repository.head = head
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
}

function closeRepository(root: string) {
  rmSync(root, { recursive: true, force: true })
}

test('stored SHA equal to live HEAD passes', () => {
  const { root } = createRepository()
  try {
    sync(root)
    assert.equal(validate(root).passed, true)
  } finally {
    closeRepository(root)
  }
})

test('a memory-only reconciliation commit passes from the source snapshot', () => {
  const { root } = createRepository()
  try {
    assert.equal(validate(root).passed, true)
  } finally {
    closeRepository(root)
  }
})

test('a feature checkout can sync against the canonical branch without replacing it with a local branch name', () => {
  const { root } = createRepository()
  try {
    runGit(root, ['switch', '-q', '-c', 'integration/worktree'])
    sync(root)
    const state = JSON.parse(readFileSync(path.join(root, 'project-memory', 'current-state.json'), 'utf8'))
    assert.equal(state.repository.branch, 'main')
    assert.equal(state.repository.head, runGit(root, ['rev-parse', 'HEAD']))
    assert.equal('worktree' in state.repository, false)
  } finally {
    closeRepository(root)
  }
})

test('the source inventory includes Git-tracked files and ignores untracked workspace files', async () => {
  const { root } = createRepository()
  try {
    writeFileSync(path.join(root, 'scripts', 'local-only.mjs'), 'export {}\n')
    const { deriveInventory } = await import(pathToFileURL(path.join(root, 'scripts', 'project-memory-lib.mjs')).href)
    assert.equal(deriveInventory().source_files.roots.scripts, 3)
  } finally {
    closeRepository(root)
  }
})

test('detached pull-request CI validates against the canonical base branch', () => {
  const { root } = createRepository()
  try {
    sync(root)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const result = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'main',
    })
    assert.equal(result.passed, true, result.output)
  } finally {
    closeRepository(root)
  }
})

test('detached pull-request CI rejects a different canonical base branch', () => {
  const { root } = createRepository()
  try {
    sync(root)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const result = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'integration/other',
    })
    assert.equal(result.passed, false)
    assert.match(result.output, /does not match the CI target branch/)
  } finally {
    closeRepository(root)
  }
})

test('memory sync refuses to rewrite canonical state from a detached checkout', () => {
  const { root } = createRepository()
  try {
    runGit(root, ['checkout', '--detach', 'HEAD'])
    assert.throws(() => sync(root), /requires a named local branch/)
  } finally {
    closeRepository(root)
  }
})

test('memory sync refuses to snapshot uncommitted source or untracked files', () => {
  const { root } = createRepository()
  try {
    writeFileSync(path.join(root, 'source.txt'), 'uncommitted source change\n')
    assert.throws(() => sync(root), /requires a clean worktree/)
  } finally {
    closeRepository(root)
  }
})

test('a relevant source change after the snapshot fails as stale', () => {
  const { root } = createRepository()
  try {
    writeFileSync(path.join(root, 'source-change.txt'), 'relevant change\n')
    runGit(root, ['add', 'source-change.txt'])
    runGit(root, ['commit', '-qm', 'relevant source change'])
    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /relevant changes since snapshot: source-change\.txt/)
  } finally {
    closeRepository(root)
  }
})

test('a nonexistent stored SHA fails', () => {
  const { root } = createRepository()
  try {
    setStoredHead(root, '0000000000000000000000000000000000000000')
    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /repository\.head is not a valid commit/)
  } finally {
    closeRepository(root)
  }
})

test('a stored SHA outside the live ancestry fails', () => {
  const { root, sourceSnapshot } = createRepository()
  try {
    runGit(root, ['switch', '-q', '-c', 'other', sourceSnapshot])
    writeFileSync(path.join(root, 'other.txt'), 'divergent history\n')
    runGit(root, ['add', 'other.txt'])
    runGit(root, ['commit', '-qm', 'divergent history'])
    const divergentHead = runGit(root, ['rev-parse', 'HEAD'])
    runGit(root, ['switch', '-q', 'main'])
    setStoredHead(root, divergentHead)
    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /repository\.head is not an ancestor of live Git/)
  } finally {
    closeRepository(root)
  }
})

test('a malformed stored SHA fails', () => {
  const { root } = createRepository()
  try {
    setStoredHead(root, 'not-a-commit')
    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /repository\.head is not a valid commit/)
  } finally {
    closeRepository(root)
  }
})

test('a generated projection drift remains invalid under the memory-only policy', () => {
  const { root } = createRepository()
  try {
    const projection = path.join(root, 'project-memory', 'generated', 'project-memory.md')
    writeFileSync(projection, readFileSync(projection, 'utf8') + 'drift\n')
    runGit(root, ['add', 'project-memory/generated/project-memory.md'])
    runGit(root, ['commit', '-qm', 'projection drift'])
    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /generated\/project-memory\.md is out of sync/)
  } finally {
    closeRepository(root)
  }
})
