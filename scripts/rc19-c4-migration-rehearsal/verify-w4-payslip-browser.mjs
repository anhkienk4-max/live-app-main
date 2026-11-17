import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const c = JSON.parse(readFileSync('//wsl.localhost/Ubuntu-24.04/home/anhkienk4/.local/share/rc19-c511-native/runtime.json', 'utf8'));
const webBase = 'http://127.0.0.1:3102';
const evidenceDir = 'output/playwright/w4-real-uat';

const hostOneEmail = 'hostone_c511_1794886705715_5f2238403c0c40@c511.invalid';
const hostTwoEmail = 'hosttwo_c511_1794886705715_a73a0921852248@c511.invalid';

async function main() {
  console.log('=== VERIFYING MY PAYSLIP (COMPLETE DATA & ANTI-LEAKAGE) ===');
  const { chromium } = createRequire(process.cwd() + '/package.json')('playwright');
  const browser = await chromium.launch({ headless: true });

  const context1 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page1 = await context1.newPage();

  // 1. Log in as HostOne
  console.log('Logging in as HostOne...');
  await page1.goto(`${webBase}/login`, { waitUntil: 'domcontentloaded' });
  await page1.getByTestId('email-input').fill(hostOneEmail);
  await page1.getByTestId('password-input').fill(c.test_password);
  await page1.getByTestId('email-login-btn').click();
  await page1.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page1.waitForTimeout(2000);

  page1.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page1.on('response', async res => {
    if (res.url().includes('my-payslip')) {
      let body;
      try { body = await res.json(); } catch { body = await res.text(); }
      console.log('API RESPONSE [my-payslip]:', res.status(), JSON.stringify(body));
    }
  });

  // 2. Navigate to /payroll?tab=personal
  console.log('Navigating to /payroll?tab=personal...');
  await page1.goto(`${webBase}/payroll?tab=personal`);
  await page1.waitForTimeout(3000);

  // Take immediate debug screenshot
  await page1.screenshot({ path: `${evidenceDir}/debug-payslip-page.png`, fullPage: true });

  const bodyText = await page1.locator('body').innerText();
  console.log('PAGE TEXT SNIPPET:', bodyText.slice(0, 500));

  // Check DOM content
  const heading = await page1.getByRole('heading', { name: /Phiếu lương của tôi/i }).textContent();
  console.log('Page Heading:', heading);

  // Check if period section is rendered
  const periodHeader = await page1.locator('h2:has-text("Kỳ")').textContent();
  console.log('Period Header:', periodHeader);

  // Check table content
  const rows = await page1.locator('tbody tr').count();
  console.log('Rendered payslip line rows:', rows);

  // Check total net money
  const moneyText = await page1.locator('p.font-semibold:has-text("đ")').first().textContent();
  console.log('Total Net VND displayed:', moneyText);

  // Take full screenshot
  const screenshotPath = `${evidenceDir}/mypayslip-complete-data.png`;
  await page1.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Saved screenshot to:', screenshotPath);

  // 3. Test API via page request context (with session cookies)
  console.log('\nTesting API authorization and anti-tamper via session cookies...');

  // Call API for own payslip
  const ownRes = await page1.request.get(`${webBase}/api/workforce/my-payslip?year=2026`);
  console.log('Own Payslip API status:', ownRes.status());
  const ownData = await ownRes.json();
  console.log('Own Statements count:', ownData.statements?.length);
  console.log('Own Lines count:', ownData.statements?.[0]?.lines?.length);
  console.log('Own Total Net VND:', ownData.statements?.[0]?.total_net_vnd);

  if (ownRes.status() !== 200 || !ownData.statements?.length) {
    throw new Error('FAILED_TO_LOAD_OWN_PAYSLIP');
  }

  // Attempt forged query param ?staff_id=...
  const forgedRes = await page1.request.get(`${webBase}/api/workforce/my-payslip?year=2026&staff_id=HostTwo_c511_1794886705715_a73a0921852248`);
  console.log('Forged query param status (must be 400):', forgedRes.status());
  const forgedData = await forgedRes.json();
  console.log('Forged query error code:', forgedData.error?.code);

  if (forgedRes.status() !== 400 || forgedData.error?.code !== 'MY_PAYSLIP_QUERY_NOT_ALLOWED') {
    throw new Error('FORGED_QUERY_NOT_REJECTED');
  }

  // 4. Log in as HostTwo in separate context and verify data isolation
  console.log('\nLogging in as HostTwo in separate context...');
  const context2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page2 = await context2.newPage();

  await page2.goto(`${webBase}/login`, { waitUntil: 'domcontentloaded' });
  await page2.getByTestId('email-input').fill(hostTwoEmail);
  await page2.getByTestId('password-input').fill(c.test_password);
  await page2.getByTestId('email-login-btn').click();
  await page2.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page2.waitForTimeout(2000);

  const hostTwoRes = await page2.request.get(`${webBase}/api/workforce/my-payslip?year=2026`);
  console.log('HostTwo API status:', hostTwoRes.status());
  const hostTwoData = await hostTwoRes.json();
  console.log('HostTwo Statements count:', hostTwoData.statements?.length);
  console.log('HostTwo Total Net VND:', hostTwoData.statements?.[0]?.total_net_vnd);

  // Assert HostTwo sees 30,000 VND (their own), NOT 35,000 VND (HostOne's)
  if (hostTwoData.statements?.[0]?.total_net_vnd !== 30000) {
    throw new Error(`HOST_TWO_WRONG_DATA: expected 30000, got ${hostTwoData.statements?.[0]?.total_net_vnd}`);
  }

  // Save evidence json
  const evidence = {
    verifiedAt: new Date().toISOString(),
    hostOne: {
      email: hostOneEmail,
      status: ownRes.status(),
      periodCount: ownData.statements?.length,
      linesCount: ownData.statements?.[0]?.lines?.length,
      totalNetVnd: ownData.statements?.[0]?.total_net_vnd,
      domRows: rows,
      domHeading: heading,
      domPeriod: periodHeader,
      domMoneyText: moneyText,
      screenshot: screenshotPath
    },
    antiTamper: {
      url: `${webBase}/api/workforce/my-payslip?year=2026&staff_id=HostTwo_c511_1794886705715_a73a0921852248`,
      status: forgedRes.status(),
      errorCode: forgedData.error?.code,
      rejected: forgedRes.status() === 400
    },
    crossMemberIsolation: {
      hostTwoEmail: hostTwoEmail,
      hostTwoTotalNetVnd: hostTwoData.statements?.[0]?.total_net_vnd,
      isolated: hostTwoData.statements?.[0]?.total_net_vnd === 30000 && ownData.statements?.[0]?.total_net_vnd === 35000
    }
  };

  writeFileSync(`${evidenceDir}/mypayslip-real-data-evidence.json`, JSON.stringify(evidence, null, 2));
  console.log('\nEvidence written to:', `${evidenceDir}/mypayslip-real-data-evidence.json`);

  await browser.close();
  console.log('=== MY PAYSLIP VERIFICATION COMPLETED SUCCESSFULLY ===');
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
