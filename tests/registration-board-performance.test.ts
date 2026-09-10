import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const board = readFileSync('components/features/calendar/ShiftRegistrationBoard.tsx', 'utf8')
const actions = readFileSync('components/features/calendar/ShiftRegistrationActions.tsx', 'utf8')
const workspace = readFileSync('components/features/calendar/CalendarWorkspace.tsx', 'utf8')

test('registration mutations refresh operational data without reloading master data', () => {
  assert.match(board, /const loadReferenceData = React\.useCallback/)
  assert.match(board, /const loadRegistrationOperationalData = React\.useCallback/)
  assert.match(board, /Promise\.all\(\[loadReferenceData\(\), loadRegistrationOperationalData\(\)\]\)/)
  assert.match(board, /void loadRegistrationOperationalData\(\)/)
  assert.doesNotMatch(board.slice(board.indexOf('const runAction'), board.indexOf('const removalImpact')), /loadReferenceData/)
  assert.doesNotMatch(board.slice(board.indexOf('const runAction'), board.indexOf('const removalImpact')), /brandService\.getAll|platformService\.getAll|campaignService\.getAll|userService\.getAll/)
})

test('successful actions keep their controls guarded through the authoritative refresh', () => {
  const runAction = board.slice(board.indexOf('const runAction'), board.indexOf('const removalImpact'))
  assert.match(runAction, /await action\(\)[\s\S]*const refreshed = await loadRegistrationOperationalData\(\)/)
  assert.ok(runAction.indexOf('const refreshed = await loadRegistrationOperationalData()') < runAction.indexOf('setBusyId(null)'))
  assert.match(board, /const actionId = removalTarget\.kind === 'cancel'[\s\S]*await loadRegistrationOperationalData\(\)[\s\S]*setBusyId\(null\)/)
})

test('late reference data cannot gate or invent operational board state', () => {
  assert.match(board, /if \(loading \|\| userLoading \|\| !currentUser\) return <ContentSkeleton \/>/)
  assert.match(board, /const studioOptions = React\.useMemo\(\(\) => buildStudioFilterOptions\(shifts\)/)
  assert.match(board, /brandName\(brands, shift\.brand_id\)/)
  assert.match(board, /platformName\(platforms, shift\.platform_id\)/)
  assert.match(board, /campaignName\(campaigns, shift\.campaign_id\)/)
  assert.match(board, /users\.find\(user => user\.id === registration\.user_id\) \|\| \{ full_name: registration\.user_id \}/)
  assert.doesNotMatch(board, /if \(!shift \|\| !staff\) return null/)
  assert.match(board, /\|\| '—'/)
})

test('operational refreshes ignore stale responses and unmounted boards', () => {
  assert.match(board, /type OperationalLoadState = \{[\s\S]*active: boolean[\s\S]*latest:/)
  assert.match(board, /if \(!isCurrent\(loadVersion\)\)/)
  assert.match(board, /return getLatest\(\)/)
  assert.match(board, /const loadState = state\.current[\s\S]*loadState\.active = true[\s\S]*loadState\.active = false/)
})

test('role dialog opening is local and registration has no network side effect until submit', () => {
  assert.doesNotMatch(actions, /shiftRegistrationService\./)
  assert.match(actions, /<DialogTrigger/)
  assert.match(actions, /await runEligibleRegistration\(state, onRegister\)/)
})

test('registration tabs mount lazily and stay mounted after first visit', () => {
  assert.match(workspace, /const \[visitedTabs, setVisitedTabs\]/)
  assert.match(workspace, /keepMounted value="open"/)
  assert.match(workspace, /keepMounted value="mine"/)
  assert.match(workspace, /visitedTabs\.has\("open"\)/)
  assert.match(workspace, /visitedTabs\.has\("mine"\)/)
})
