import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const TARGET_URL = 'http://localhost:3101/visual-qa?scenario=attendance'
const OUTPUT_DIR = 'C:/Users/KienNguyen/.gemini/antigravity-ide/brain/d1a2032d-819b-49e3-a7ba-f0e351da06e3'

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

console.log('Starting visual capture for Attendance Source Manager...')
console.log('Target URL:', TARGET_URL)
console.log('Output Dir:', OUTPUT_DIR)

const browser = await chromium.launch({ headless: true })

try {
  // 1. Desktop 1440px
  console.log('Capturing Desktop 1440x900...')
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const desktopPage = await desktopContext.newPage()
  await desktopPage.goto(TARGET_URL, { waitUntil: 'networkidle' })
  await desktopPage.waitForSelector('[data-testid="attendance-source-manager"]', { timeout: 15000 })

  // Click Analyze & Match to render preview reconciliation tiles & exception queue
  const analyzeBtn = desktopPage.locator('button:has-text("Phân tích & Khớp nối")')
  if (await analyzeBtn.isVisible()) {
    await analyzeBtn.click()
    await desktopPage.waitForTimeout(1500)
  }

  // Click mapping button to expand column mapping section
  const mappingBtn = desktopPage.locator('button:has-text("Cấu hình ánh xạ cột")')
  if (await mappingBtn.isVisible()) {
    await mappingBtn.click()
    await desktopPage.waitForTimeout(800)
  }

  const desktopPath = path.join(OUTPUT_DIR, 'attendance_import_desktop_1440px.png')
  await desktopPage.screenshot({ path: desktopPath, fullPage: true })
  console.log('Saved Desktop screenshot:', desktopPath)
  await desktopContext.close()

  // 2. Mobile 390px (iPhone 12/13/14)
  console.log('Capturing Mobile 390x844...')
  const mobile390Context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  })
  const mobile390Page = await mobile390Context.newPage()
  await mobile390Page.goto(TARGET_URL, { waitUntil: 'networkidle' })
  await mobile390Page.waitForSelector('[data-testid="attendance-source-manager"]', { timeout: 15000 })

  const analyzeBtn390 = mobile390Page.locator('button:has-text("Phân tích & Khớp nối")')
  if (await analyzeBtn390.isVisible()) {
    await analyzeBtn390.click()
    await mobile390Page.waitForTimeout(1500)
  }

  const mobile390Path = path.join(OUTPUT_DIR, 'attendance_import_mobile_390px.png')
  await mobile390Page.screenshot({ path: mobile390Path, fullPage: true })
  console.log('Saved Mobile 390px screenshot:', mobile390Path)
  await mobile390Context.close()

  // 3. Mobile 375px (iPhone SE / Standard Mobile)
  console.log('Capturing Mobile 375x812...')
  const mobile375Context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
  })
  const mobile375Page = await mobile375Context.newPage()
  await mobile375Page.goto(TARGET_URL, { waitUntil: 'networkidle' })
  await mobile375Page.waitForSelector('[data-testid="attendance-source-manager"]', { timeout: 15000 })

  const analyzeBtn375 = mobile375Page.locator('button:has-text("Phân tích & Khớp nối")')
  if (await analyzeBtn375.isVisible()) {
    await analyzeBtn375.click()
    await mobile375Page.waitForTimeout(1500)
  }

  const mobile375Path = path.join(OUTPUT_DIR, 'attendance_import_mobile_375px.png')
  await mobile375Page.screenshot({ path: mobile375Path, fullPage: true })
  console.log('Saved Mobile 375px screenshot:', mobile375Path)
  await mobile375Context.close()

  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!')
} catch (err) {
  console.error('Screenshot capture failed:', err)
  process.exitCode = 1
} finally {
  await browser.close()
}
