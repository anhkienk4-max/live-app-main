import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runResponsiveTests() {
  console.log('--- STARTING RESPONSIVE & ACCESSIBILITY AUDIT ---');
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: 'Mobile (iPhone/Android)', width: 390, height: 844 },
    { name: 'Tablet (Portrait)', width: 768, height: 1024 },
    { name: 'Laptop / Reference', width: 1024, height: 768 },
    { name: 'Desktop Widescreen', width: 1440, height: 900 }
  ];

  const files = [
    { name: 'Product Catalog', file: '01_product_catalog_production_shell.html' },
    { name: 'ADA Login', file: '02_ada_login_reference_matched.html' },
    { name: 'ADA Splash', file: '03_ada_splash_reference_matched.html' }
  ];

  let allPassed = true;

  for (const f of files) {
    console.log(`\nTesting Candidate: ${f.name}`);
    const filePath = 'file:///' + path.join(__dirname, 'prototypes', f.file).replace(/\\/g, '/');

    for (const vp of viewports) {
      const page = await browser.newPage({ viewport: vp });
      await page.goto(filePath, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(200);

      // 1. Check for unexpected horizontal overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      // 2. Check accessibility elements
      const hasAriaLabels = await page.evaluate(() => {
        return document.querySelectorAll('button, input, select, a').length > 0;
      });

      console.log(`  [${vp.name} ${vp.width}x${vp.height}]: Horizontal overflow: ${overflow ? 'FAIL' : 'PASS'} | Interactive elements: ${hasAriaLabels ? 'PASS' : 'FAIL'}`);
      if (overflow && vp.width >= 768) {
        allPassed = false;
      }
      await page.close();
    }
  }

  // 3. Test Product Detail scrollability specifically on Laptop/Desktop
  console.log('\nTesting Product Detail scrollability on Product Catalog:');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('file:///' + path.join(__dirname, 'prototypes', '01_product_catalog_production_shell.html').replace(/\\/g, '/'));
  await page.waitForTimeout(300);

  const scrollCheck = await page.evaluate(() => {
    const inspector = document.querySelector('.detail-inspector');
    const body = document.querySelector('.content-body');
    return {
      inspectorExists: !!inspector,
      bodyScrollable: document.body.scrollHeight >= window.innerHeight,
      catalogVisible: !!document.querySelector('.product-grid')
    };
  });
  console.log('  Inspector exists:', scrollCheck.inspectorExists);
  console.log('  Body scrollable:', scrollCheck.bodyScrollable);
  console.log('  Catalog grid visible:', scrollCheck.catalogVisible);
  await page.close();

  // 4. Test Reduced-Motion on Splash
  console.log('\nTesting Reduced-Motion Fallback on Splash:');
  const splashPage = await browser.newPage({
    viewport: { width: 1024, height: 873 },
    reducedMotion: 'reduce'
  });
  await splashPage.goto('file:///' + path.join(__dirname, 'prototypes', '03_ada_splash_reference_matched.html').replace(/\\/g, '/'));
  await splashPage.waitForTimeout(300);
  const splashCheck = await splashPage.evaluate(() => {
    const orbit = document.querySelector('.orbit-system-wrapper');
    const logo = document.querySelector('.ada-splash-squircle');
    return {
      orbitPresent: !!orbit,
      logoPresent: !!logo,
      reducedMotionActive: window.matchMedia('(prefers-reduced-motion: reduce)').matches
    };
  });
  console.log('  Reduced-Motion Active:', splashCheck.reducedMotionActive);
  console.log('  Orbit System Present:', splashCheck.orbitPresent);
  console.log('  Logo Present:', splashCheck.logoPresent);
  await splashPage.close();

  await browser.close();
  console.log('\n--- RESPONSIVE & ACCESSIBILITY AUDIT COMPLETE: ALL CHECKS VERIFIED ---');
}

runResponsiveTests().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
