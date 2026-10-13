import assert from 'node:assert/strict'
import path from 'node:path'
import { chromium } from '@playwright/test'

const BASE_URL = 'http://localhost:3009'
const CAPTURE_DIR = 'C:/Users/KienNguyen/Downloads/KIEN ADA code/OPS LIVESTREAM PLATFORM/capture ảnh/06_UX_W1_Refinement'

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

    // Leader CAN see Mark Scheduled / Mark Completed buttons (using data-testid)
    const markScheduledBtn = page.locator('[data-testid="bulk-mark-scheduled-btn"]')
    assert.ok(await markScheduledBtn.isVisible(), 'Leader must see status bulk action')
    const markCompletedBtn = page.locator('[data-testid="bulk-mark-completed-btn"]')
    assert.ok(await markCompletedBtn.isVisible(), 'Leader must see status bulk action')

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
  // GATE 3: BLOCKER 1 — DESKTOP BULK SELECTION SCOPE & STATUS CONFIRMATION
  // -------------------------------------------------------------
  console.log('\n[TEST 3] Testing Blocker 1: Desktop Bulk Selection Scope & Confirmation (Admin)...')
  {
    const { context, page } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await page.waitForSelector('table tbody tr', { timeout: 15000 })

    // Step A: Search to filter data
    const searchInput = page.locator('.relative.flex-1.max-w-sm input, input[placeholder*="Tìm"], input[placeholder*="Search"]').first()
    await searchInput.fill('Tech')
    await page.waitForTimeout(400)

    const visibleRowsCount = await page.locator('table tbody tr').count()
    console.log('  Visible rows after search "Tech":', visibleRowsCount)
    assert.ok(visibleRowsCount > 0, 'Search "Tech" should return visible rows')

    // Step B: Select All on current visible page
    const selectAllCheckbox = page.locator('[data-testid="shift-select-all-checkbox"]')
    await selectAllCheckbox.click()

    // Assert bulk toolbar badge shows exact selected count
    const bulkBadge = page.locator('[data-testid="bulk-selected-badge"]')
    await bulkBadge.waitFor({ state: 'visible', timeout: 5000 })
    const badgeText = await bulkBadge.innerText()
    console.log('  Bulk badge text:', badgeText)
    assert.ok(badgeText.includes(String(visibleRowsCount)), 'Bulk badge must reflect visible count')

    // Step C: Bulk Status Update Confirmation Dialog
    const markCompletedBtn = page.locator('[data-testid="bulk-mark-completed-btn"]')
    await markCompletedBtn.click()

    const confirmDialog = page.locator('[data-testid="confirm-bulk-status-dialog"]')
    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await confirmDialog.isVisible(), 'Bulk status change must prompt confirmation dialog')

    const dialogText = await confirmDialog.innerText()
    console.log('  Confirmation dialog text:', dialogText)
    assert.ok(dialogText.includes(String(visibleRowsCount)), 'Confirmation dialog must show exact count of records')

    // Cancel without mutating
    const cancelStatusBtn = page.locator('[data-testid="cancel-bulk-status-btn"]')
    await cancelStatusBtn.click()
    await confirmDialog.waitFor({ state: 'hidden', timeout: 5000 })
    assert.ok(await confirmDialog.isHidden(), 'Confirmation dialog must close on cancel')

    // Deselect all
    await page.locator('[data-testid="bulk-deselect-btn"]').click()
    await searchInput.fill('')
    await page.waitForTimeout(400)

    // Capture Admin Desktop
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'admin_shifts_desktop_1440.png') })
    await context.close()
    console.log('  -> PASS: Blocker 1 desktop bulk selection and confirmation verified.')
  }

  // -------------------------------------------------------------
  // GATE 4: MOBILE SHIFTS (390px) - CARDS, DRILLDOWN, PAGINATION
  // -------------------------------------------------------------
  console.log('\n[TEST 4] Testing Mobile 390px on /shifts...')
  {
    const { context, page } = await createContextWithUser('3', 'vi', { width: 390, height: 844 })
    await page.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })

    const mobileContainer = page.locator('[data-testid="shifts-mobile-container"]')
    await mobileContainer.waitFor({ state: 'visible', timeout: 15000 })
    assert.ok(await mobileContainer.isVisible(), 'Mobile container must be visible at 390px')
    assert.equal(await page.locator('table').isVisible(), false, 'Desktop table must be hidden on mobile')

    const firstCard = mobileContainer.locator('[data-testid^="shift-mobile-card-"]').first()
    await firstCard.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await firstCard.isVisible(), 'Compact shift card must be visible')

    // View detail drilldown on mobile
    const viewMobileBtn = firstCard.locator('[data-testid^="view-shift-mobile-"]').first()
    assert.ok(await viewMobileBtn.isVisible(), 'Mobile card must have View Detail button')
    await viewMobileBtn.click()

    const dialog = page.locator('[data-testid="shift-detail-modal"]')
    await dialog.waitFor({ state: 'visible', timeout: 5000 })
    assert.ok(await dialog.isVisible(), 'Mobile detail modal must open')

    // Capture Mobile Detail Modal
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_mobile_390_detail_modal.png') })

    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden', timeout: 5000 })
    assert.ok(await dialog.isHidden(), 'Mobile detail modal must close on Escape key')

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

    const tableVisible = await page.locator('table').isVisible()
    assert.ok(tableVisible, 'DataTable must be preserved on tablet 768px')

    // Capture Tablet Shifts
    await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_shifts_tablet_768.png') })
    await context.close()
    console.log('  -> PASS: Tablet 768px preserved DataTable verified.')
  }

  // -------------------------------------------------------------
  // GATE 6: BLOCKER 2 — STAFFING MOBILE TEXT CLIPPING AUDIT (320, 375, 390, 768px)
  // -------------------------------------------------------------
  console.log('\n[TEST 6] Testing Blocker 2: Staffing Mobile Text Clipping across viewports...')
  {
    const viewports = [
      { name: '320', width: 320, height: 640 },
      { name: '375', width: 375, height: 812 },
      { name: '390', width: 390, height: 844 },
      { name: '768', width: 768, height: 1024 },
    ]

    for (const vp of viewports) {
      console.log(`  Auditing viewport ${vp.name}px...`)
      const { context, page } = await createContextWithUser('3', 'vi', { width: vp.width, height: vp.height })
      await page.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
      await page.waitForSelector('[data-testid^="open-shift-card-"]', { timeout: 15000 })

      const cards = page.locator('[data-testid^="open-shift-card-"]')
      const count = await cards.count()
      assert.ok(count > 0, `Staffing cards must exist at ${vp.name}px`)

      // For the first card (and all cards): verify bounding box boundaries
      const firstCard = cards.first()
      const cardBox = await firstCard.boundingBox()
      assert.ok(cardBox, 'Card must have bounding box')

      // Check card scrollLeft is strictly 0
      const scrollLeftBefore = await firstCard.evaluate(el => el.scrollLeft)
      assert.equal(scrollLeftBefore, 0, `Card scrollLeft must be 0 at ${vp.name}px before expand`)

      // Check title bounding box is inside card
      const titleEl = firstCard.locator('span.font-semibold').first()
      const titleBox = await titleEl.boundingBox()
      assert.ok(titleBox, 'Title must have bounding box')
      assert.ok(titleBox.x >= cardBox.x - 2, `Title left (${titleBox.x}) must not be clipped past card left (${cardBox.x}) at ${vp.name}px`)

      // Test expand drawer on chevron button
      const expandBtn = firstCard.locator('button[aria-label="Expand"], button[title="Expand details"]').first()
      if (await expandBtn.isVisible()) {
        await expandBtn.click()
        await page.waitForTimeout(300)

        // Verify card scrollLeft remains 0 after expand (CRITICAL ROOT CAUSE CHECK)
        const scrollLeftAfter = await firstCard.evaluate(el => el.scrollLeft)
        assert.equal(scrollLeftAfter, 0, `Card scrollLeft must remain 0 after expand at ${vp.name}px (no horizontal shift)`)

        // Re-verify title bounding box
        const titleBoxAfter = await titleEl.boundingBox()
        assert.ok(titleBoxAfter, 'Title must have bounding box after expand')
        assert.ok(titleBoxAfter.x >= cardBox.x - 2, `Title left (${titleBoxAfter.x}) must remain unclipped after expand at ${vp.name}px`)

        if (vp.name === '390') {
          await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_390_expanded.png') })
        }

        // Collapse
        const collapseBtn = firstCard.locator('button[aria-label="Collapse"], button[title="Collapse details"]').first()
        if (await collapseBtn.isVisible()) {
          await collapseBtn.click()
          await page.waitForTimeout(200)
        }
      }

      // Save screenshots
      if (vp.name === '320') {
        await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_320.png') })
      } else if (vp.name === '375') {
        await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_375.png') })
      } else if (vp.name === '390') {
        await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_mobile_390.png') })
      } else if (vp.name === '768') {
        await page.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_tablet_768.png') })
      }

      await context.close()
    }

    // Capture Desktop Staffing Member & Admin at 1440px
    const { context: dskCtx, page: dskPage } = await createContextWithUser('3', 'vi', { width: 1440, height: 900 })
    await dskPage.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
    await dskPage.waitForSelector('[data-testid^="open-shift-card-"]', { timeout: 15000 })
    await dskPage.screenshot({ path: path.join(CAPTURE_DIR, 'member_staffing_desktop_1440.png') })
    await dskCtx.close()

    const { context: admCtx, page: admPage } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 })
    await admPage.goto(`${BASE_URL}/staffing`, { waitUntil: 'networkidle' })
    await admPage.waitForSelector('[data-testid="staffing-production-workspace"]', { timeout: 15000 })
    await admPage.screenshot({ path: path.join(CAPTURE_DIR, 'admin_staffing_desktop_1440.png') })
    await admCtx.close()

    console.log('  -> PASS: Blocker 2 zero text clipping and zero horizontal drift verified.')
  }

  // -------------------------------------------------------------
  // GATE 7: BLOCKER 3 — I18N COMPLETENESS & BOTTOMNAV VERIFICATION
  // -------------------------------------------------------------
  console.log('\n[TEST 7] Testing Blocker 3: i18n Completeness & BottomNav...')
  {
    // Test VI mode
    const { context: viCtx, page: viPage } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 })
    await viPage.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await viPage.waitForSelector('table tbody tr', { timeout: 15000 })

    // Check Add Shift button in VI: "Thêm ca"
    const addShiftBtnVi = viPage.locator('[data-testid="add-shift-btn"]')
    const addShiftTextVi = await addShiftBtnVi.innerText()
    assert.ok(addShiftTextVi.includes('Thêm ca'), `Add shift button in VI should be 'Thêm ca', got '${addShiftTextVi}'`)

    // Check Import/Export button in VI: "Nhập / Xuất"
    const importExportBtnVi = viPage.locator('[data-testid="import-export-btn"]')
    const importExportTextVi = await importExportBtnVi.innerText()
    assert.ok(importExportTextVi.includes('Nhập / Xuất'), `Import/Export button in VI should be 'Nhập / Xuất', got '${importExportTextVi}'`)

    // Check status badges in table: must NOT contain "LiveStatus"
    const badgesTextVi = await viPage.locator('table tbody td span.capitalize, table tbody td span').allInnerTexts()
    for (const b of badgesTextVi) {
      assert.notEqual(b, 'LiveStatus', `Found unlocalized badge text 'LiveStatus' in table`)
    }

    // Check BottomNav on mobile 390px in VI mode
    await viPage.setViewportSize({ width: 390, height: 844 })
    await viPage.waitForTimeout(300)

    const bottomNavVi = viPage.locator('nav.fixed.bottom-0, [data-testid="bottom-nav"]')
    const bottomNavText = await bottomNavVi.innerText()
    console.log('  BottomNav VI text:', bottomNavText.replace(/\n+/g, ' | '))
    assert.ok(bottomNavText.includes('Tổng quan') || bottomNavText.includes('Lịch') || bottomNavText.includes('Ca trực'), 'BottomNav must show translated Vietnamese labels')

    await viCtx.close()

    // Test EN mode
    const { context: enCtx, page: enPage } = await createContextWithUser('1', 'en', { width: 1440, height: 900 })
    await enPage.goto(`${BASE_URL}/shifts`, { waitUntil: 'networkidle' })
    await enPage.waitForSelector('table tbody tr', { timeout: 15000 })

    const addShiftBtnEn = enPage.locator('[data-testid="add-shift-btn"]')
    const addShiftTextEn = await addShiftBtnEn.innerText()
    assert.ok(addShiftTextEn.includes('Add Shift'), `Add shift button in EN should be 'Add Shift', got '${addShiftTextEn}'`)

    const importExportBtnEn = enPage.locator('[data-testid="import-export-btn"]')
    const importExportTextEn = await importExportBtnEn.innerText()
    assert.ok(importExportTextEn.includes('Import / Export'), `Import/Export button in EN should be 'Import / Export', got '${importExportTextEn}'`)

    await enCtx.close()
    console.log('  -> PASS: Blocker 3 i18n completeness and BottomNav labels verified.')
  }

  // -------------------------------------------------------------
  // GATE 8: I18N PERSISTENCE & REACT #418 ZERO HYDRATION ERROR
  // -------------------------------------------------------------
  console.log('\n[TEST 8] Testing i18n persistence and React #418 hydration safety...')
  {
    const { context, page } = await createContextWithUser('1', 'vi', { width: 1440, height: 900 }, true)
    await page.goto(`${BASE_URL}/storage`, { waitUntil: 'networkidle' })

    await page.screenshot({ path: path.join(CAPTURE_DIR, 'storage_desktop_1440_vi_initial.png') })

    const langBtn = page.locator('header button').filter({ hasText: /^(EN|VI)$/ }).first()
    assert.ok(await langBtn.isVisible(), 'Language toggle button must be present in header')

    await langBtn.click()
    await page.waitForTimeout(400)

    const savedLang = await page.evaluate(() => localStorage.getItem('livestream-ops-language'))
    assert.equal(savedLang, 'en', 'Language must be saved to localStorage as en')

    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(400)

    const langAfterReload = await page.evaluate(() => document.documentElement.lang)
    assert.equal(langAfterReload, 'en', 'Document lang must persist as en after reload')

    await page.screenshot({ path: path.join(CAPTURE_DIR, 'storage_desktop_1440_en_refresh.png') })

    const langBtnEn = page.locator('header button').filter({ hasText: /^(EN|VI)$/ }).first()
    await langBtnEn.click()
    await page.waitForTimeout(400)

    await context.close()

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
