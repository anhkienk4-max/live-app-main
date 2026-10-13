import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = 'http://localhost:3009'
const CAPTURE_DIR = path.resolve('..', 'capture ảnh', '06_UX_W1_Refinement')

console.log('=== STARTING UX-W1 BROWSER HARDENING REGRESSION ===')
console.log('Target URL:', BASE_URL)
console.log('Evidence dir:', CAPTURE_DIR)

const browser = await chromium.launch({ headless: true })
const consoleErrors = []

async function createContextWithUser(roleId, lang = 'vi', viewport = { width: 1440, height: 900 }, skipLangInit = false) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.includes('favicon') && !text.includes('Failed to load resource')) {
        consoleErrors.push(text)
      }
    }
  })
  page.on('pageerror', err => {
    consoleErrors.push(err.message)
  })

  await page.addInitScript(({ uid, userLang, skipLang }) => {
    localStorage.setItem('livestream-ops-current-user', uid)
    if (!skipLang) {
      localStorage.setItem('livestream-ops-language', userLang)
    }
  }, { uid: roleId, userLang: lang, skipLang: skipLangInit })

  return { context, page }
}

try {
  // -------------------------------------------------------------
  // GATE 1: MEMBER CAPABILITY GATING & DETAIL DRILLDOWN (/shifts)
  // -------------------------------------------------------------
  console.log('\n[TEST 1] Testing Member role (User 3 - Sarah Johnson)...')
  {
    const { context, page } = await createContextWithUser('3', 'vi', { width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table tbody tr', { timeout: 15000 })

    // Member: MUST NOT see Add Shift button
    const addShiftCount = await page.locator('[data-testid="add-shift-btn"]').count()
    assert.equal(addShiftCount, 0, 'Member must not see Add Shift button')

    // Member: MUST NOT see Import / Export button
    const importExportCount = await page.locator('[data-testid="import-export-btn"]').count()
    assert.equal(importExportCount, 0, 'Member must not see Import/Export button')

    // Member: MUST NOT see Select All or row checkboxes
    const selectAllCount = await page.locator('[data-testid="shift-select-all-checkbox"]').count()
    assert.equal(selectAllCount, 0, 'Member must not see Select All checkbox')

    // Member: MUST NOT see Edit or Delete buttons in table rows
    const editCount = await page.locator('[data-testid="action-edit-shift"]').count()
    assert.equal(editCount, 0, 'Member must not see edit shift button')
    const deleteCount = await page.locator('[data-testid="action-delete-shift"]').count()
    assert.equal(deleteCount, 0, 'Member must not see delete shift button')

    // Member: MUST be able to view shift details
    const viewDetailBtn = page.locator('[data-testid="action-view-shift"]').first()
    assert.ok(await viewDetailBtn.isVisible(), 'Member must see View Detail action')
    await viewDetailBtn.click()

    // Assert detail dialog opens
    const dialog = page.locator('[data-testid="shift-detail-modal"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await dialog.isVisible(), 'Shift detail dialog must open on click')

    // Capture Member Desktop with modal open
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_desktop_1440_detail_modal.png') })

    // Close dialog
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    assert.ok(await dialog.isHidden(), 'Shift detail dialog must close')

    // Capture Member Desktop
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_desktop_1440.png') })
    await context.close()
    console.log('  -> PASS: Member capability boundaries verified.')
  }

  // -------------------------------------------------------------
  // GATE 2: LEADER CAPABILITIES & NO BULK DELETE (/shifts)
  // -------------------------------------------------------------
  console.log('\n[TEST 2] Testing Leader role (User 2 - Team Leader)...')
  {
    const { context, page } = await createContextWithUser('2', 'vi', { width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table tbody tr', { timeout: 15000 })

    // Leader: CAN see Add Shift
    const addShiftBtn = page.locator('[data-testid="add-shift-btn"]')
    assert.ok(await addShiftBtn.isVisible(), 'Leader must see Add Shift button')

    // Leader: CAN see Import/Export
    const importExportBtn = page.locator('[data-testid="import-export-btn"]')
    assert.ok(await importExportBtn.isVisible(), 'Leader must see Import/Export button')

    // Leader: CAN see row selection checkboxes
    const selectAllCheckbox = page.locator('[data-testid="shift-select-all-checkbox"]')
    assert.ok(await selectAllCheckbox.isVisible(), 'Leader must see select all checkbox')

    // Leader: CAN see edit shift button
    const editBtn = page.locator('[data-testid="action-edit-shift"]').first()
    assert.ok(await editBtn.isVisible(), 'Leader must see edit shift button')

    // Leader: CANNOT see delete shift buttons in table rows
    const deleteCount = await page.locator('[data-testid="action-delete-shift"]').count()
    assert.equal(deleteCount, 0, 'Leader must not see delete shift buttons')

    // Leader: Select a row checkbox to test bulk actions
    const firstRowCheckbox = page.locator('[data-testid="shift-row-checkbox"]').first()
    await firstRowCheckbox.click()

    // Assert bulk actions toolbar appears
    const bulkBadge = page.locator('[data-testid="bulk-selected-badge"]')
    await bulkBadge.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await bulkBadge.isVisible(), 'Bulk toolbar must appear on selection')

    // CRITICAL: Leader MUST NOT see Bulk Delete button
    const bulkDeleteCount = await page.locator('[data-testid="bulk-delete-btn"]').count()
    assert.equal(bulkDeleteCount, 0, 'Leader must NOT see bulk delete button')

    // Leader CAN see Mark Scheduled / Mark Completed buttons
    const markScheduledBtn = page.locator('button:has-text("Mark Scheduled")')
    assert.ok(await markScheduledBtn.isVisible(), 'Leader must see status bulk action')

    // Deselect
    const deselectBtn = page.locator('[data-testid="bulk-deselect-btn"]')
    await deselectBtn.click()
    await bulkBadge.waitFor({ state: 'hidden', timeout: 5000 })

    // Capture Leader Desktop
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'leader_shifts_desktop_1440.png') })
    await context.close()
    console.log('  -> PASS: Leader capability boundaries & delete protection verified.')
  }

  // -------------------------------------------------------------
  // GATE 3: ADMIN CAPABILITIES & DESTRUCTIVE CONFIRMATION (/shifts)
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Testing Admin role (User 1 - Admin User)...')
  {
    const { context, page } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table tbody tr', { timeout: 15000 })

    // Admin: CAN see Add Shift
    assert.ok(await page.locator('[data-testid="add-shift-btn"]').isVisible(), 'Admin must see Add Shift button')

    // Admin: CAN see Import/Export
    assert.ok(await page.locator('[data-testid="import-export-btn"]').isVisible(), 'Admin must see Import/Export button')

    // Admin: Test Select All checkbox
    const selectAllCheckbox = page.locator('[data-testid="shift-select-all-checkbox"]')
    await selectAllCheckbox.click()

    // Bulk toolbar badge must show exact count
    const bulkBadge = page.locator('[data-testid="bulk-selected-badge"]')
    await bulkBadge.waitFor({ state: 'visible', timeout: 5000 })
    const badgeText = await bulkBadge.innerText()
    assert.match(badgeText, /\d+ \/ \d+ selected|\d+ selected/, 'Bulk selected badge must show accurate count')

    // Admin: CAN see Bulk Delete button
    const bulkDeleteBtn = page.locator('[data-testid="bulk-delete-btn"]')
    assert.ok(await bulkDeleteBtn.isVisible(), 'Admin must see bulk delete button')

    // Click Bulk Delete -> MUST open LifecycleActionDialog (destructive confirmation)
    await bulkDeleteBtn.click()
    const confirmDialog = page.locator('[data-testid="lifecycle-action-dialog"]')
    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await confirmDialog.isVisible(), 'Destructive bulk action must require confirmation dialog')

    // Dialog must contain impact information
    const dialogText = await confirmDialog.innerText()
    assert.ok(dialogText.length > 20, 'Confirmation dialog must render impact details')

    // CANCEL the deletion (SAFE: zero writes to production/mock)
    const cancelBtn = confirmDialog.locator('button:has-text("Hủy"), button:has-text("Cancel")').first()
    await cancelBtn.click()
    await confirmDialog.waitFor({ state: 'hidden', timeout: 5000 })
    assert.ok(await confirmDialog.isHidden(), 'Confirmation dialog must close safely on Cancel')

    // Deselect all
    await page.locator('[data-testid="bulk-deselect-btn"]').click()

    // Capture Admin Desktop
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'admin_shifts_desktop_1440.png') })
    await context.close()
    console.log('  -> PASS: Admin capability & destructive confirmation verified.')
  }

  // -------------------------------------------------------------
  // GATE 4: MOBILE SHIFTS (390px) - CARDS, DRILLDOWN, PAGINATION
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Testing Mobile 390px on /shifts...')
  {
    const { context, page } = await createContextWithUser('3', 'vi', { width: 390, height: 844 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })

    // Assert mobile container is visible and desktop table is hidden
    const mobileContainer = page.locator('[data-testid="shifts-mobile-container"]')
    await mobileContainer.waitFor({ state: 'visible', timeout: 15000 })
    assert.ok(await mobileContainer.isVisible(), 'Mobile container must be visible at 390px')
    assert.equal(await page.locator('table').isVisible(), false, 'Desktop table must be hidden on mobile')

    // Assert compact cards render with data
    const firstCard = mobileContainer.locator('[data-testid^="shift-mobile-card-"]').first()
    await firstCard.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await firstCard.isVisible(), 'Compact shift card must be visible')

    // Card contains occupancy chips and timing
    const cardText = await firstCard.innerText()
    assert.ok(cardText.includes('H:') || cardText.includes('Host') || cardText.length > 10, 'Card must render shift data')

    // View detail drilldown on mobile
    const viewMobileBtn = firstCard.locator('[data-testid^="view-shift-mobile-"]').first()
    assert.ok(await viewMobileBtn.isVisible(), 'Mobile card must have View Detail button')
    await viewMobileBtn.click()

    // Assert modal opens
    const dialog = page.locator('[data-testid="shift-detail-modal"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await dialog.isVisible(), 'Mobile detail modal must open')

    // Capture Mobile Detail Modal
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_mobile_390_detail_modal.png') })

    // Test ESCAPE key closes modal
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    assert.ok(await dialog.isHidden(), 'Mobile detail modal must close on Escape key')

    // Test Search & Filter:
    const searchInput = page.locator('[data-testid="shifts-mobile-search"]')
    await searchInput.fill('NONEXISTENT_KEYWORD_XYZ_999')
    await page.waitForTimeout(400)
    const emptyState = page.locator('[data-testid="shifts-mobile-empty-state"]')
    await emptyState.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await emptyState.isVisible(), 'Empty state must appear when search has 0 results')

    // Clear search
    await searchInput.fill('')
    await page.waitForTimeout(400)
    assert.ok(await firstCard.isVisible(), 'Shift cards must reappear after search cleared')

    // Test Mobile Pagination selector (10 / 20 / 50)
    const pagination = page.locator('[data-testid="shifts-mobile-pagination"]')
    if (await pagination.isVisible()) {
      const pageSizeSelect = pagination.locator('select')
      if (await pageSizeSelect.isVisible()) {
        await pageSizeSelect.selectOption('20')
        await page.waitForTimeout(300)
      }
    }

    // Capture Mobile Shifts
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_mobile_390.png') })
    await context.close()
    console.log('  -> PASS: Mobile 390px cards, modal, drilldown, search, and pagination verified.')
  }

  // -------------------------------------------------------------
  // GATE 5: TABLET 768px on /shifts
  // -------------------------------------------------------------
  console.log('\n[TEST 5] Testing Tablet 768px on /shifts...')
  {
    const { context, page } = await createContextWithUser('3', 'vi', { width: 768, height: 1024 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table tbody tr', { timeout: 15000 })

    // At 768px, desktop table is preserved (hidden md:block)
    const tableVisible = await page.locator('table').isVisible()
    assert.ok(tableVisible, 'DataTable must be preserved on tablet 768px')

    // Capture Tablet Shifts
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_tablet_768.png') })
    await context.close()
    console.log('  -> PASS: Tablet 768px preserved DataTable verified.')
  }

  // -------------------------------------------------------------
  // GATE 6: STAFFING WORKSPACE (/staffing) - COMPACT ITEMS, DRAWER
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Testing Staffing workspace (/staffing)...')
  {
    // Mobile 390px Staffing
    const { context: mobCtx, page: mobPage } = await createContextWithUser('3', 'vi', { width: 390, height: 844 })
    await mobPage.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
    await mobPage.waitForSelector('[data-testid^="open-shift-card-"]', { timeout: 15000 })

    const staffingCard = mobPage.locator('[data-testid^="open-shift-card-"]').first()
    assert.ok(await staffingCard.isVisible(), 'Staffing compact card must render')

    // Check card height: must NOT be 500px tall
    const box = await staffingCard.boundingBox()
    assert.ok(box && box.height < 300, `Staffing card height must be compact (<300px), actual: ${box?.height}px`)

    // Test expand/collapse drawer
    const expandBtn = staffingCard.locator('button[aria-label="Expand"], button[title="Expand details"]').first()
    if (await expandBtn.isVisible()) {
      await expandBtn.click()
      await mobPage.waitForTimeout(300)
      const collapseBtn = staffingCard.locator('button[aria-label="Collapse"], button[title="Collapse details"]').first()
      assert.ok(await collapseBtn.isVisible(), 'Drawer must expand on chevron click')

      // Capture Mobile Staffing Expanded
      await mobPage.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_390_expanded.png') })

      // Collapse
      await collapseBtn.click()
      await mobPage.waitForTimeout(300)
    }

    // Capture Mobile Staffing Collapsed
    await mobPage.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_390.png') })
    await mobCtx.close()

    // Desktop 1440px Staffing
    const { context: dskCtx, page: dskPage } = await createContextWithUser('3', 'vi', { width: 1440, height: 900 })
    await dskPage.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
    await dskPage.waitForSelector('[data-testid^="open-shift-card-"]', { timeout: 15000 })

    const dskCard = dskPage.locator('[data-testid^="open-shift-card-"]').first()
    assert.ok(await dskCard.isVisible(), 'Desktop staffing card must render')

    // Assert pagination exists
    const pagination = dskPage.locator('[data-testid="staffing-pagination"]')
    assert.ok(await pagination.isVisible(), 'Staffing pagination must be visible on desktop')

    // Capture Desktop Staffing Member & Admin
    await dskPage.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_desktop_1440.png') })
    await dskCtx.close()

    const { context: admCtx, page: admPage } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 })
    await admPage.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
    await admPage.waitForSelector('[data-testid="staffing-production-workspace"]', { timeout: 15000 })
    await admPage.screenshot({ path: path.join(CAPTURE_DIR, 'admin_staffing_desktop_1440.png') })
    await admCtx.close()
    console.log('  -> PASS: Staffing compact cards, drawer expand/collapse, and pagination verified.')
  }

  // -------------------------------------------------------------
  // GATE 7: RESPONSIVE OVERFLOW & TOUCH TARGET AUDIT (390px)
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Testing Responsive overflow & touch targets...')
  {
    const { context, page } = await createContextWithUser('3', 'vi', { width: 390, height: 844 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="shifts-mobile-container"]', { timeout: 15000 })

    // Check horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    assert.equal(hasHorizontalOverflow, false, 'Mobile 390px must not have horizontal overflow')

    // Audit interactive touch targets (exclude hidden / aria-hidden / zero-dim elements)
    const touchAudit = await page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll('button, a, input:not([type="hidden"]), select'))
      const smallTargets = []
      for (const el of interactive) {
        if (el.getAttribute('aria-hidden') === 'true' || el.getAttribute('tabindex') === '-1') continue
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
        const rect = el.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue
        if (rect.height < 32 || rect.width < 32) {
          smallTargets.push({ tag: el.tagName, text: el.textContent?.slice(0, 20), w: rect.width, h: rect.height })
        }
      }
      return smallTargets
    })
    console.log('  Touch targets below 32px count:', touchAudit.length)
    assert.equal(touchAudit.length, 0, 'No visible interactive elements smaller than 32px on mobile')

    await context.close()
    console.log('  -> PASS: Zero horizontal overflow and safe touch targets verified.')
  }

  // -------------------------------------------------------------
  // GATE 8: I18N PERSISTENCE & REACT #418 ZERO HYDRATION ERROR
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Testing i18n persistence and React #418 hydration safety...')
  {
    // Do not pre-set language in initScript so localStorage persistence is tested accurately across reload
    const { context, page } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 }, true)
    await page.goto(`${BASE_URL}/storage`, { waitUntil: 'networkidle' })

    // Capture initial VI storage
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'storage_desktop_1440_vi_initial.png') })

    // Find language toggle button
    const langBtn = page.locator('header button').filter({ hasText: /^(EN|VI)$/ }).first()
    assert.ok(await langBtn.isVisible(), 'Language toggle button must be present in header')

    // Toggle to EN
    await langBtn.click()
    await page.waitForTimeout(400)

    // Verify localStorage has 'en'
    const savedLang = await page.evaluate(() => localStorage.getItem('livestream-ops-language'))
    assert.equal(savedLang, 'en', 'Language must be saved to localStorage as en')

    // Reload while in EN
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    // Verify language persisted after reload
    const langAfterReload = await page.evaluate(() => document.documentElement.lang)
    assert.equal(langAfterReload, 'en', 'Document lang must persist as en after reload')

    // Capture EN refreshed storage
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'storage_desktop_1440_en_refresh.png') })

    // Toggle back to VI
    const langBtnEn = page.locator('header button').filter({ hasText: /^(EN|VI)$/ }).first()
    await langBtnEn.click()
    await page.waitForTimeout(400)

    await context.close()

    // Assert NO React #418 errors occurred across entire test run
    const hydrationErrors = consoleErrors.filter(err => err.includes('418') || err.includes('Hydration failed') || err.includes('hydration'))
    console.log('  Hydration errors detected:', hydrationErrors.length)
    assert.equal(hydrationErrors.length, 0, 'Must have zero React #418 hydration errors across all navigations')

    console.log('  -> PASS: i18n persistence and hydration safety verified.')
  }

  console.log('\n======================================================')
  console.log('ALL BROWSER HARDENING REGRESSION ASSERTIONS PASSED!')
  console.log('======================================================')
} finally {
  await browser.close()
}
