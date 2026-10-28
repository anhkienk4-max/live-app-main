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

function createRepository(canonicalBranch = 'main') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'memory-validator-'))
  const scripts = path.join(root, 'scripts')
  const hooks = path.join(root, 'hooks')
  mkdirSync(scripts)
  mkdirSync(hooks)
  cpSync(path.join(repositoryRoot, 'project-memory'), path.join(root, 'project-memory'), { recursive: true })
  const statePath = path.join(root, 'project-memory', 'current-state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf8'))
  state.repository = { ...state.repository, branch: canonicalBranch }
  delete state.repository.worktree
  writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')
  for (const name of ['memory-sync.mjs', 'memory-validate.mjs', 'project-memory-lib.mjs']) {
    cpSync(path.join(repositoryRoot, 'scripts', name), path.join(scripts, name))
  }

  runGit(root, ['init', '-q', '-b', 'main'])
  runGit(root, ['config', 'core.hooksPath', hooks])
  runGit(root, ['config', 'user.email', 'memory-validator@example.test'])
  runGit(root, ['config', 'user.name', 'Memory Validator'])
  runGit(root, ['remote', 'add', 'origin', 'https://github.com/anhkienk4-max/live-app-main.git'])
  writeFileSync(path.join(root, 'source.txt'), 'source snapshot\n')
  runGit(root, ['add', 'source.txt', 'project-memory', 'scripts'])
  runGit(root, ['commit', '-qm', 'source snapshot'])
  const sourceSnapshot = runGit(root, ['rev-parse', 'HEAD'])
  runGit(root, ['update-ref', 'refs/remotes/origin/main', sourceSnapshot])
  if (canonicalBranch !== 'main') setOriginBranch(root, canonicalBranch, sourceSnapshot)
  execFileSync(process.execPath, [path.join(scripts, 'memory-sync.mjs')], { cwd: root, encoding: 'utf8', env: localProcessEnv() })
  runGit(root, ['add', 'project-memory', 'PROJECT_STATE.md'])
  runGit(root, ['commit', '-qm', 'memory snapshot'])
  return { root, sourceSnapshot }
}

function setOriginBranch(root: string, branch: string, commit: string) {
  runGit(root, ['update-ref', `refs/remotes/origin/${branch}`, commit])
}

function commitTree(root: string, tree: string, parent?: string, message = 'synthetic branch history') {
  return execFileSync('git', ['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
}

function validate(root: string, extraEnv: NodeJS.ProcessEnv = {}) {
  try {
    const output = execFileSync(process.execPath, [path.join(root, 'scripts', 'memory-validate.mjs')], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...localProcessEnv(), ...extraEnv },
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

test('detached pull-request CI accepts a target descended from the canonical source branch', () => {
  const { root } = createRepository()
  try {
    const candidate = runGit(root, ['rev-parse', 'HEAD'])
    setOriginBranch(root, 'integration/rc19-wave1-candidate', candidate)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const result = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'integration/rc19-wave1-candidate',
    })
    assert.equal(result.passed, true, result.output)
  } finally {
    closeRepository(root)
  }
})

test('detached pull-request CI rejects an unrelated target branch', () => {
  const { root } = createRepository()
  try {
    const tree = runGit(root, ['rev-parse', 'HEAD^{tree}'])
    setOriginBranch(root, 'integration/unrelated', commitTree(root, tree))
    sync(root)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const result = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'integration/unrelated',
    })
    assert.equal(result.passed, false)
    assert.match(result.output, /does not descend from the canonical source branch/)
  } finally {
    closeRepository(root)
  }
})

test('detached pull-request CI rejects a divergent target branch', () => {
  const { root, sourceSnapshot } = createRepository('canonical')
  try {
    const tree = runGit(root, ['rev-parse', `${sourceSnapshot}^{tree}`])
    const canonicalDescendant = commitTree(root, tree, sourceSnapshot, 'canonical descendant')
    const targetSibling = commitTree(root, tree, sourceSnapshot, 'divergent target sibling')
    setOriginBranch(root, 'canonical', canonicalDescendant)
    setOriginBranch(root, 'integration/diverged', targetSibling)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const result = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'integration/diverged',
    })
    assert.equal(result.passed, false)
    assert.match(result.output, /does not descend from the canonical source branch/)
  } finally {
    closeRepository(root)
  }
})

test('detached pull-request CI rejects missing, forged and unavailable canonical refs', () => {
  const { root, sourceSnapshot } = createRepository('canonical')
  try {
    setOriginBranch(root, 'integration/rc19-wave1-candidate', sourceSnapshot)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    for (const target of ['integration/missing', '../main']) {
      const result = validate(root, {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_BASE_REF: target,
      })
      assert.equal(result.passed, false)
      assert.match(result.output, /target branch does not resolve/)
    }
    runGit(root, ['update-ref', '-d', 'refs/remotes/origin/canonical'])
    const missingCanonical = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'integration/rc19-wave1-candidate',
    })
    assert.equal(missingCanonical.passed, false)
    assert.match(missingCanonical.output, /canonical source branch does not resolve/)
  } finally {
    closeRepository(root)
  }
})

test('detached push workflow validates the intended proof branch and exact checked-out SHA', () => {
  const { root } = createRepository()
  try {
    const head = runGit(root, ['rev-parse', 'HEAD'])
    setOriginBranch(root, 'integration/rc19-memory-proof', head)
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const valid = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'integration/rc19-memory-proof',
      GITHUB_SHA: head,
    })
    assert.equal(valid.passed, true, valid.output)

    const mismatch = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF_TYPE: 'branch',
      GITHUB_REF_NAME: 'integration/rc19-memory-proof',
      GITHUB_SHA: '0'.repeat(40),
    })
    assert.equal(mismatch.passed, false)
    assert.match(mismatch.output, /does not match the checked-out source SHA/)
  } finally {
    closeRepository(root)
  }
})

test('CI rejects an unexpected event and a remote outside the expected repository', () => {
  const { root } = createRepository()
  try {
    runGit(root, ['checkout', '--detach', 'HEAD'])
    const event = validate(root, { GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_run' })
    assert.equal(event.passed, false)
    assert.match(event.output, /unrecognized GitHub Actions event/)

    runGit(root, ['remote', 'set-url', 'origin', 'https://github.com/someone/else.git'])
    const wrongOrigin = validate(root, {
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_BASE_REF: 'main',
    })
    assert.equal(wrongOrigin.passed, false)
    assert.match(wrongOrigin.output, /origin remote does not identify the expected repository/)
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

test('a wrong trusted origin/main snapshot fails even when its projection is synchronized', () => {
  const { root } = createRepository()
  try {
    const statePath = path.join(root, 'project-memory', 'current-state.json')
    const state = JSON.parse(readFileSync(statePath, 'utf8'))
    const previousOriginMain = state.repository.origin_main
    state.repository.origin_main = 'f'.repeat(40)
    writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n')

    const projectionPath = path.join(root, 'project-memory', 'generated', 'project-memory.md')
    const projection = readFileSync(projectionPath, 'utf8')
    writeFileSync(projectionPath, projection.replace(previousOriginMain, state.repository.origin_main))

    const result = validate(root)
    assert.equal(result.passed, false)
    assert.match(result.output, /repository\.origin_main does not match live Git/)
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
