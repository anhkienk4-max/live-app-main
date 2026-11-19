import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const c = JSON.parse(readFileSync('//wsl.localhost/Ubuntu-24.04/home/anhkienk4/.local/share/rc19-c511-native/runtime.json', 'utf8'));
const b = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

const mkJwt = (role) => {
  const n = now();
  const u = `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ iss: 'supabase', aud: 'authenticated', iat: n, exp: n + 86400 * 30, role })}`;
  return `${u}.${createHmac('sha256', c.local_jwt_secret).update(u).digest('base64url')}`;
};

const svc = mkJwt('service_role');
const rest = `http://127.0.0.1:15546`;
const webBase = 'http://127.0.0.1:3102';
const evidenceDir = 'output/playwright/w4-real-uat';
const hSvc = { apikey: svc, Authorization: `Bearer ${svc}` };

const getLockedPayrollSnap = async () => {
  const [a, bRes] = await Promise.all([
    fetch(`${rest}/rest/v1/workforce_payroll_periods?select=*&status=eq.locked&order=id.asc`, { headers: hSvc }),
    fetch(`${rest}/rest/v1/workforce_payroll_lines?select=*&order=id.asc`, { headers: hSvc })
  ]);
  const periods = await a.json();
  const lines = (await bRes.json()).filter(x => periods.some(p => p.id === x.period_id));
  const bytes = JSON.stringify({
    periods: periods.sort((x, y) => String(x.id).localeCompare(String(y.id))),
    lines: lines.sort((x, y) => String(x.id).localeCompare(String(y.id)))
  });
  return {
    periodCount: periods.length,
    lineCount: lines.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const getAttendanceSnap = async () => {
  const res = await fetch(`${rest}/rest/v1/self_attendance_events?select=*&order=id.asc`, { headers: hSvc });
  const items = await res.json();
  const bytes = JSON.stringify(items.sort((x, y) => String(x.id).localeCompare(String(y.id))));
  return {
    eventCount: items.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const getApprovedActualSnap = async () => {
  const [aRes, dRes] = await Promise.all([
    fetch(`${rest}/rest/v1/workforce_actual_segments?select=*&order=id.asc`, { headers: hSvc }),
    fetch(`${rest}/rest/v1/workforce_payroll_segment_decisions?select=*&order=segment_id.asc`, { headers: hSvc })
  ]);
  const segs = await aRes.json();
  const decs = await dRes.json();
  const bytes = JSON.stringify({
    actualSegments: segs.sort((x, y) => String(x.id).localeCompare(String(y.id))),
    decisions: decs.sort((x, y) => String(x.segment_id).localeCompare(String(y.segment_id)))
  });
  return {
    segmentCount: segs.length,
    decisionCount: decs.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const psqlExec = (sql) => {
  return execFileSync('wsl.exe', [
    '-d', 'Ubuntu-24.04', '-u', 'anhkienk4', '--',
    'psql', '-h', '/home/anhkienk4/.local/share/rc19-c511-native', '-p', '55439', '-U', 'postgres', '-d', c.database,
    '-v', 'ON_ERROR_STOP=1', '-c', sql
  ], { encoding: 'utf8' });
};

const createAssignedShift = async (title, userId, adminUser, dateStr = '2026-11-25', startH = 9, endH = 11) => {
  const shiftId = randomUUID();
  const regId = randomUUID();
  const startHour = String(startH % 24).padStart(2, '0');
  const endHour = String(endH % 24).padStart(2, '0');
  const startTime = `${startHour}:00:00`;
  const endTime = `${endHour}:00:00`;
  const studio = `studio_${Date.now()}_${randomUUID().slice(0, 6)}`;
  const sql = `
    BEGIN;
    SELECT set_config('request.jwt.claim.sub', '${adminUser.auth_user_id}', true);
    SELECT set_config('request.jwt.claim.role', 'authenticated', true);
    INSERT INTO public.shifts (
      id, title, date, start_time, end_time, timezone, start_at, end_at, end_date,
      crosses_midnight, duration_minutes, brand_id, platform_id, host_id,
      required_host_count, status, execution_source, agency_code, version, studio
    ) VALUES (
      '${shiftId}', '${title}', '${dateStr}', '${startTime}', '${endTime}', 'Asia/Ho_Chi_Minh',
      '${dateStr}T${startHour}:00:00+00:00', '${dateStr}T${endHour}:00:00+00:00', '${dateStr}',
      false, ${(endH - startH) * 60}, 'brand_ui_1794890074612_22ec09ce', 'platform_ui_1794890074612_22ec09ce', '${userId}',
      1, 'scheduled', 'internal', 'ada', 1, '${studio}'
    );
    INSERT INTO public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at, version
    ) VALUES (
      '${regId}', '${shiftId}', '${userId}', 'host', 'approved', 'manual_assignment', now(), '${adminUser.id}', now(), 1
    );
    COMMIT;
  `;
  psqlExec(sql);
  return { shiftId, regId, title };
};

const selectSourceShiftBySearch = async (d, page, shiftTitle) => {
  const searchInput = d.locator('input[aria-label*="Tìm ca"]').first();
  await searchInput.fill(shiftTitle);
  await searchInput.press('Enter');
  await page.waitForTimeout(1000);
  const row = d.locator('tr').filter({ hasText: shiftTitle });
  await row.getByRole('button', { name: /Chọn ca|Choose shift/i }).click();
  await page.waitForTimeout(800);
};

const selectTargetShiftBySearch = async (d, page, targetTitle) => {
  const targetSearchInput = d.locator('input[aria-label*="Tìm ca đổi chéo"]').first();
  await targetSearchInput.fill(targetTitle);
  await targetSearchInput.press('Enter');
  await page.waitForTimeout(1000);
  const targetDiv = d.locator('div[aria-label*="Chọn ca đổi"]');
  const targetBtn = targetDiv.locator('button').filter({ hasText: targetTitle }).first();
  await targetBtn.click();
  await page.waitForTimeout(800);
};

const loginUser = async (page, email, password) => {
  await page.goto(`${webBase}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('email-login-btn').click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
};

async function main() {
  console.log('=== RC19 W4 SWAP EXCHANGE (ĐỔI CHÉO) REAL BROWSER VERIFICATION ===');
  const [payrollBefore, attendanceBefore, actualBefore] = await Promise.all([
    getLockedPayrollSnap(),
    getAttendanceSnap(),
    getApprovedActualSnap()
  ]);
  console.log('Historical Baselines Before:');
  console.log('  Locked Payroll:', payrollBefore);
  console.log('  Attendance:', attendanceBefore);
  console.log('  Approved Actual:', actualBefore);

  // 1. Get test users
  const uRes = await fetch(`${rest}/rest/v1/business_users?select=id,auth_user_id,email,system_permission&order=created_at.desc&limit=100`, {
    headers: hSvc
  });
  const users = await uRes.json();
  const admin = users.find(x => x.id.startsWith('admin_ui_') && x.system_permission === 'admin');
  const requester = users.find(x => x.id.startsWith('UiOriginal_ui_'));
  const counterpart = users.find(x => x.id.startsWith('UiReplacement_ui_'));

  if (!admin || !requester || !counterpart) {
    throw new Error('TEST_USERS_NOT_FOUND');
  }
  console.log('Admin:', admin.email, admin.id);
  console.log('Requester (Host 1):', requester.email, requester.id);
  console.log('Counterpart (Host 2):', counterpart.email, counterpart.id);

  const { chromium } = createRequire(process.cwd() + '/package.json')('playwright');
  const browser = await chromium.launch({ headless: true });
  const results = {};

  // ============================================================
  // SCENARIO 1: EXCHANGE -> Create -> Counterpart Accept -> Admin Approve -> Verify Swapped Assignments
  // ============================================================
  console.log('\n--- SCENARIO 1: EXCHANGE Creation -> Accept -> Approve -> Swapped Registrations ---');
  {
    const ts = Date.now();
    const sourceShift = await createAssignedShift(`Exchange S1 Requester ${ts}`, requester.id, admin, '2026-12-01', 9, 11);
    const targetShift = await createAssignedShift(`Exchange S1 Counterpart ${ts}`, counterpart.id, admin, '2026-12-01', 14, 16);
    console.log('Created Source Shift (Requester):', sourceShift.shiftId);
    console.log('Created Target Shift (Counterpart):', targetShift.shiftId);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const rpcLogs = [];
    page.on('response', async r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/rest/v1/rpc/')) {
        let body = null;
        try { body = await r.json(); } catch {}
        rpcLogs.push({ status: r.status(), path: u.pathname, body });
      }
    });

    // Step 1: Requester creates Exchange request
    await loginUser(page, requester.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Yêu cầu đổi ca/ }).click();
    const d = page.getByRole('dialog');
    await page.waitForTimeout(500);

    // Switch to Exchange mode
    const exchangeModeBtn = d.getByRole('button', { name: /^Đổi ca$|^Exchange$/i });
    await exchangeModeBtn.click();
    await page.waitForTimeout(600);

    // Step 1: Pick Source shift
    await selectSourceShiftBySearch(d, page, sourceShift.title);

    // Step 2: Pick Target shift
    await selectTargetShiftBySearch(d, page, targetShift.title);

    // Step 3: Pick Counterpart
    const counterpartDiv = d.locator('div[aria-label*="Chọn người đổi chéo"]');
    const counterpartOpt = counterpartDiv.locator('button').first();
    await counterpartOpt.click();
    await page.waitForTimeout(1500);

    // Wait for conflict check to show VERIFIED_CLEAR
    await d.getByText(/Lịch hai bên hợp lệ|Both schedules valid/i).waitFor({ timeout: 10000 });
    console.log('Two-sided conflict check verified clear!');

    // Enter reason and submit
    await d.getByRole('textbox', { name: /Lý do|Reason/i }).fill('Lý do đổi ca chéo UAT Scenario 1 ' + ts);
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario1-form-ready.png`, fullPage: true });

    await d.getByRole('button', { name: /Gửi yêu cầu|Submit request/i }).click();
    await page.waitForTimeout(2500);

    const createRpc = rpcLogs.find(x => x.path.endsWith('/create_shift_swap_request') && x.status === 200);
    const requestId = createRpc?.body?.id;
    if (!requestId) {
      throw new Error('CREATE_EXCHANGE_RPC_FAILED_S1: ' + JSON.stringify(rpcLogs));
    }
    console.log('Exchange Request ID:', requestId);
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario1-created.png`, fullPage: true });

    // Step 2: Counterpart logs in -> "Gửi cho tôi" -> clicks Accept
    await loginUser(page, counterpart.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Gửi cho tôi/ }).click();
    await page.waitForTimeout(1500);

    const counterpartRow = page.locator('tr').filter({ hasText: requestId });
    if (await counterpartRow.count() !== 1) {
      throw new Error('COUNTERPART_ROW_NOT_FOUND_IN_FOR_ME');
    }
    console.log('Counterpart sees exchange request in For Me tab!');
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario1-counterpart-pending.png`, fullPage: true });

    const acceptBtn = counterpartRow.getByTestId('action-accept').or(counterpartRow.getByRole('button', { name: /Chấp nhận|Accept/i }));
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
    } else {
      await counterpartRow.getByText(/Xem chi tiết|View details/i).click();
      await page.waitForTimeout(600);
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: /Chấp nhận|Accept/i }).click();
    }
    await page.waitForTimeout(2000);

    const acceptedCheck = await (await fetch(`${rest}/rest/v1/swap_requests?id=eq.${requestId}&select=*`, { headers: hSvc })).json();
    console.log('DB status after counterpart accept:', acceptedCheck[0]?.status, 'version:', acceptedCheck[0]?.version);
    if (acceptedCheck[0]?.status !== 'accepted') {
      throw new Error(`STATUS_NOT_ACCEPTED: ${acceptedCheck[0]?.status}`);
    }

    // Step 3: Admin logs in -> "Chờ duyệt" -> clicks Approve
    await loginUser(page, admin.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Chờ duyệt/ }).click();
    await page.waitForTimeout(1500);

    const adminRow = page.locator('tr').filter({ hasText: requestId });
    if (await adminRow.count() !== 1) {
      throw new Error('ADMIN_ROW_NOT_FOUND_IN_PENDING_APPROVAL');
    }
    console.log('Admin sees exchange row in Pending Approval tab!');
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario1-admin-review.png`, fullPage: true });

    const approveBtn = adminRow.getByTestId('action-approve').or(adminRow.getByRole('button', { name: /Duyệt|Approve/i }));
    if (await approveBtn.count() > 0) {
      await approveBtn.click();
    } else {
      await adminRow.getByText(/Xem chi tiết|View details/i).click();
      await page.waitForTimeout(600);
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: /Duyệt|Approve/i }).click();
    }
    await page.waitForTimeout(2500);

    const completedCheck = await (await fetch(`${rest}/rest/v1/swap_requests?id=eq.${requestId}&select=*`, { headers: hSvc })).json();
    console.log('DB row after approve:', completedCheck[0]?.status, 'version:', completedCheck[0]?.version);
    if (completedCheck[0]?.status !== 'completed' && completedCheck[0]?.status !== 'approved') {
      throw new Error(`STATUS_NOT_COMPLETED: ${completedCheck[0]?.status}`);
    }
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario1-completed.png`, fullPage: true });

    // Step 4: Verify swapped registrations committed in DB
    const [sourceRegs, targetRegs] = await Promise.all([
      fetch(`${rest}/rest/v1/shift_registrations?shift_id=eq.${sourceShift.shiftId}&status=eq.approved&select=*`, { headers: hSvc }).then(r => r.json()),
      fetch(`${rest}/rest/v1/shift_registrations?shift_id=eq.${targetShift.shiftId}&status=eq.approved&select=*`, { headers: hSvc }).then(r => r.json())
    ]);

    console.log('Source Shift Approved Staff:', sourceRegs.map(r => r.user_id));
    console.log('Target Shift Approved Staff:', targetRegs.map(r => r.user_id));

    // In an exchange:
    // Source shift incumbent was requester -> now counterpart is assigned!
    // Target shift incumbent was counterpart -> now requester is assigned!
    const swappedCorrectly = sourceRegs.some(r => r.user_id === counterpart.id) &&
                             targetRegs.some(r => r.user_id === requester.id);
    if (!swappedCorrectly) {
      throw new Error(`SWAP_ASSIGNMENTS_NOT_COMMITTED: source=${JSON.stringify(sourceRegs)} target=${JSON.stringify(targetRegs)}`);
    }
    console.log('Confirmed: Registrations swapped 100% correctly in PostgreSQL!');

    results.scenario1 = {
      requestId,
      mode: 'exchange',
      status: completedCheck[0]?.status,
      version: completedCheck[0]?.version,
      sourceShiftId: sourceShift.shiftId,
      targetShiftId: targetShift.shiftId,
      swappedAssignmentsVerified: true,
      ok: true
    };
    await page.close();
  }

  // ============================================================
  // SCENARIO 2: EXCHANGE -> Counterpart Reject
  // ============================================================
  console.log('\n--- SCENARIO 2: EXCHANGE Creation -> Counterpart Reject ---');
  {
    const ts = Date.now();
    const sourceShift = await createAssignedShift(`Exchange S2 Requester ${ts}`, requester.id, admin, '2026-12-02', 9, 11);
    const targetShift = await createAssignedShift(`Exchange S2 Counterpart ${ts}`, counterpart.id, admin, '2026-12-02', 14, 16);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const rpcLogs = [];
    page.on('response', async r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/rest/v1/rpc/')) {
        let body = null;
        try { body = await r.json(); } catch {}
        rpcLogs.push({ status: r.status(), path: u.pathname, body });
      }
    });

    // Step 1: Requester creates Exchange request
    await loginUser(page, requester.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Yêu cầu đổi ca/ }).click();
    const d = page.getByRole('dialog');
    await page.waitForTimeout(500);

    const exchangeModeBtn = d.getByRole('button', { name: /^Đổi ca$|^Exchange$/i });
    await exchangeModeBtn.click();
    await page.waitForTimeout(600);

    // Step 1: Pick Source shift
    await selectSourceShiftBySearch(d, page, sourceShift.title);

    // Step 2: Pick Target shift
    await selectTargetShiftBySearch(d, page, targetShift.title);

    // Step 3: Pick Counterpart
    const counterpartDiv = d.locator('div[aria-label*="Chọn người đổi chéo"]');
    const counterpartOpt = counterpartDiv.locator('button').first();
    await counterpartOpt.click();
    await page.waitForTimeout(1500);

    await d.getByText(/Lịch hai bên hợp lệ|Both schedules valid/i).waitFor({ timeout: 10000 });
    await d.getByRole('textbox', { name: /Lý do|Reason/i }).fill('Lý do đổi ca chéo UAT Scenario 2 Reject ' + ts);
    await d.getByRole('button', { name: /Gửi yêu cầu|Submit request/i }).click();
    await page.waitForTimeout(2500);

    const createRpc = rpcLogs.find(x => x.path.endsWith('/create_shift_swap_request') && x.status === 200);
    const requestId = createRpc?.body?.id;
    if (!requestId) {
      throw new Error('CREATE_EXCHANGE_RPC_FAILED_S2');
    }
    console.log('Scenario 2 Request ID:', requestId);

    // Step 2: Counterpart logs in -> "Gửi cho tôi" -> clicks Reject
    await loginUser(page, counterpart.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Gửi cho tôi/ }).click();
    await page.waitForTimeout(1500);

    const swapRow = page.locator('tr').filter({ hasText: requestId });
    if (await swapRow.count() !== 1) {
      throw new Error('COUNTERPART_ROW_NOT_FOUND_IN_FOR_ME_S2');
    }

    const rejectBtn = swapRow.getByTestId('action-reject').or(swapRow.getByRole('button', { name: /Từ chối|Reject/i }));
    if (await rejectBtn.count() > 0) {
      await rejectBtn.click();
    } else {
      await swapRow.getByText(/Xem chi tiết|View details/i).click();
      await page.waitForTimeout(600);
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: /Từ chối|Reject/i }).click();
    }
    await page.waitForTimeout(1000);

    const actionModal = page.getByRole('dialog');
    if (await actionModal.count() > 0) {
      const noteBox = actionModal.getByRole('textbox');
      if (await noteBox.count() > 0) {
        await noteBox.fill('Trùng lịch cá nhân, không thể đổi ca được');
      }
      const confirmBtn = actionModal.getByRole('button', { name: /Xác nhận|Confirm|Từ chối/i }).last();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click();
      }
    }
    await page.waitForTimeout(2000);

    const rejectedCheck = await (await fetch(`${rest}/rest/v1/swap_requests?id=eq.${requestId}&select=*`, { headers: hSvc })).json();
    console.log('DB row after counterpart reject:', rejectedCheck[0]?.status, 'version:', rejectedCheck[0]?.version);
    if (rejectedCheck[0]?.status !== 'rejected') {
      throw new Error(`STATUS_NOT_REJECTED: ${rejectedCheck[0]?.status}`);
    }
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario2-rejected.png`, fullPage: true });

    results.scenario2 = {
      requestId,
      mode: 'exchange',
      status: rejectedCheck[0]?.status,
      version: rejectedCheck[0]?.version,
      ok: true
    };
    await page.close();
  }

  // ============================================================
  // SCENARIO 3: EXCHANGE -> Requester Cancel
  // ============================================================
  console.log('\n--- SCENARIO 3: EXCHANGE Creation -> Requester Cancel ---');
  {
    const ts = Date.now();
    const sourceShift = await createAssignedShift(`Exchange S3 Requester ${ts}`, requester.id, admin, '2026-12-03', 9, 11);
    const targetShift = await createAssignedShift(`Exchange S3 Counterpart ${ts}`, counterpart.id, admin, '2026-12-03', 14, 16);

    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const rpcLogs = [];
    page.on('response', async r => {
      const u = new URL(r.url());
      if (u.pathname.includes('/rest/v1/rpc/')) {
        let body = null;
        try { body = await r.json(); } catch {}
        rpcLogs.push({ status: r.status(), path: u.pathname, body });
      }
    });

    // Step 1: Requester creates Exchange request
    await loginUser(page, requester.email, c.test_password);
    await page.goto(`${webBase}/swaps`, { timeout: 60000 });
    await page.waitForTimeout(2000);

    await page.getByRole('button', { name: /Yêu cầu đổi ca/ }).click();
    const d = page.getByRole('dialog');
    await page.waitForTimeout(500);

    const exchangeModeBtn = d.getByRole('button', { name: /^Đổi ca$|^Exchange$/i });
    await exchangeModeBtn.click();
    await page.waitForTimeout(600);

    // Step 1: Pick Source shift
    await selectSourceShiftBySearch(d, page, sourceShift.title);

    // Step 2: Pick Target shift
    await selectTargetShiftBySearch(d, page, targetShift.title);

    // Step 3: Pick Counterpart
    const counterpartDiv = d.locator('div[aria-label*="Chọn người đổi chéo"]');
    const counterpartOpt = counterpartDiv.locator('button').first();
    await counterpartOpt.click();
    await page.waitForTimeout(1500);

    await d.getByText(/Lịch hai bên hợp lệ|Both schedules valid/i).waitFor({ timeout: 10000 });
    await d.getByRole('textbox', { name: /Lý do|Reason/i }).fill('Lý do đổi ca chéo UAT Scenario 3 Cancel ' + ts);
    await d.getByRole('button', { name: /Gửi yêu cầu|Submit request/i }).click();
    await page.waitForTimeout(2500);

    const createRpc = rpcLogs.find(x => x.path.endsWith('/create_shift_swap_request') && x.status === 200);
    const requestId = createRpc?.body?.id;
    if (!requestId) {
      throw new Error('CREATE_EXCHANGE_RPC_FAILED_S3');
    }
    console.log('Scenario 3 Request ID:', requestId);

    // Step 2: Requester cancels own request
    const mineBtn = page.getByRole('button', { name: /Đổi ca của tôi/ });
    await mineBtn.click();
    await page.waitForTimeout(1500);

    const mineRow = page.locator('tr').filter({ hasText: requestId });
    if (await mineRow.count() !== 1) {
      throw new Error('REQUESTER_ROW_NOT_FOUND_IN_MINE');
    }

    const cancelBtn = mineRow.getByTestId('action-cancel').or(mineRow.getByRole('button', { name: /Hủy yêu cầu|Cancel/i }));
    if (await cancelBtn.count() > 0) {
      await cancelBtn.click();
    } else {
      await mineRow.getByText(/Xem chi tiết|View details/i).click();
      await page.waitForTimeout(600);
      const modal = page.getByRole('dialog');
      await modal.getByRole('button', { name: /Hủy yêu cầu|Cancel/i }).click();
    }
    await page.waitForTimeout(1000);

    const cancelModal = page.locator('[data-testid="lifecycle-action-dialog"]').or(page.getByRole('dialog'));
    const reasonInput = cancelModal.getByTestId('lifecycle-reason-input').or(cancelModal.getByRole('textbox'));
    if (await reasonInput.count() > 0) {
      await reasonInput.fill('Tôi tự hủy yêu cầu đổi ca này vì kế hoạch thay đổi');
    }
    const confirmCancelBtn = cancelModal.getByTestId('lifecycle-confirm-button').or(
      cancelModal.getByRole('button', { name: /Cancel request|Hủy yêu cầu|Confirm|Xác nhận/i }).last()
    );
    await confirmCancelBtn.click();
    await page.waitForTimeout(2000);

    const cancelledCheck = await (await fetch(`${rest}/rest/v1/swap_requests?id=eq.${requestId}&select=*`, { headers: hSvc })).json();
    console.log('DB row after requester cancel:', cancelledCheck[0]?.status, 'version:', cancelledCheck[0]?.version);
    if (cancelledCheck[0]?.status !== 'cancelled') {
      throw new Error(`STATUS_NOT_CANCELLED: ${cancelledCheck[0]?.status}`);
    }
    await page.screenshot({ path: `${evidenceDir}/exchange-scenario3-cancelled.png`, fullPage: true });

    results.scenario3 = {
      requestId,
      mode: 'exchange',
      status: cancelledCheck[0]?.status,
      version: cancelledCheck[0]?.version,
      ok: true
    };
    await page.close();
  }

  // Check baselines after
  const [payrollAfter, attendanceAfter, actualAfter] = await Promise.all([
    getLockedPayrollSnap(),
    getAttendanceSnap(),
    getApprovedActualSnap()
  ]);

  console.log('\nHistorical Baselines After:');
  console.log('  Locked Payroll:', payrollAfter);
  console.log('  Attendance:', attendanceAfter);
  console.log('  Approved Actual:', actualAfter);

  const payrollUnchanged = payrollBefore.sha256 === payrollAfter.sha256;
  const attendanceUnchanged = attendanceBefore.sha256 === attendanceAfter.sha256;
  const actualUnchanged = actualBefore.sha256 === actualAfter.sha256;

  console.log('\nIntegrity Invariants:');
  console.log('  Payroll unchanged:', payrollUnchanged);
  console.log('  Attendance unchanged:', attendanceUnchanged);
  console.log('  Approved Actual unchanged:', actualUnchanged);

  const finalEvidence = {
    verifiedAt: new Date().toISOString(),
    scenarios: results,
    baselines: {
      payrollBefore,
      payrollAfter,
      payrollUnchanged,
      attendanceBefore,
      attendanceAfter,
      attendanceUnchanged,
      actualBefore,
      actualAfter,
      actualUnchanged
    }
  };

  writeFileSync(`${evidenceDir}/exchange-swap-browser-e2e-evidence-20261117.json`, JSON.stringify(finalEvidence, null, 2));
  console.log('\nEvidence written to:', `${evidenceDir}/exchange-swap-browser-e2e-evidence-20261117.json`);

  await browser.close();
  console.log('\n=== ALL EXCHANGE SCENARIOS PASSED WITH COMMITTED DB PROOF ===');
}

main().catch(err => {
  console.error('ERROR in Exchange UAT runner:', err);
  process.exit(1);
});
