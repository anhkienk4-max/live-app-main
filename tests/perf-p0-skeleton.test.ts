import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import DashboardLoading from '../app/(dashboard)/loading.tsx'
import RootLoading from '../app/loading.tsx'
import { ContentSkeleton } from '../components/ui/content-skeleton.tsx'
import { AdminDashboardView } from '../components/features/dashboard/presentation/admin/AdminDashboardView.tsx'
import { LeaderDashboardView } from '../components/features/dashboard/presentation/leader/LeaderDashboardView.tsx'
import { OpsMobileHome } from '../components/features/dashboard/presentation/OpsMobileHome.tsx'
import { LanguageProvider } from '../lib/i18n.tsx'

test('dashboard route fallback leaves the single global ADA transition visible', () => {
  const markup = renderToStaticMarkup(createElement(DashboardLoading))
  assert.equal(markup, '')
  assert.equal(renderToStaticMarkup(createElement(RootLoading)), '')
})

test('full-screen ADA loader renders one large centered logo without panels or copy', async () => {
  const { AdaLoadingScreen } = await import('../components/branding/AdaLoadingScreen.tsx')
  const markup = renderToStaticMarkup(createElement(AdaLoadingScreen, { overlay: true }))
  assert.equal((markup.match(/data-testid="ada-brand-lockup"/g) ?? []).length, 1)
  assert.match(markup, /ada-loading-screen__logo/)
  assert.doesNotMatch(markup, /content-skeleton|skeleton|ĐANG TẢI|LOADING|ada-loading-screen__halo|ada-loading-screen__progress/)
})

test('route transition uses an opaque white screen and animates only the centered ADA lockup', () => {
  const css = readFileSync(fileURLToPath(new URL('../app/globals.css', import.meta.url)), 'utf8')
  const transition = css.match(/\.ada-navigation-transition\s*\{([^}]*)\}/)?.[1] ?? ''
  assert.match(transition, /position:\s*fixed/)
  assert.match(transition, /inset:\s*0/)
  assert.match(transition, /background:\s*#fff/)
  assert.match(css, /\.ada-loading-screen__logo\s*\{[^}]*animation:\s*ada-loading-float/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})

test('admin dashboard renders localized labels and source-backed app-wide metrics without empty panels', () => {
  const translations: Record<string, string> = {
    dashboardTitle: 'Tổng quan vận hành livestream',
    applicationDashboardSubtitle: 'Tổng quan hệ thống',
    appWideOverview: 'Tổng quan toàn ứng dụng',
    appWideOverviewSubtitle: 'Số liệu từ dữ liệu đang có',
    shiftsInRange: 'Ca trong kỳ',
    confirmedReportsInRange: 'Báo cáo đã xác nhận',
    activeBrands: 'Thương hiệu hoạt động',
    activeCampaigns: 'Chiến dịch hoạt động',
    activePlatforms: 'Nền tảng hoạt động',
    activeStaffAccounts: 'Nhân sự đang hoạt động',
    liveNow: 'Đang live',
    activeSessions: 'Phiên đang live',
    shiftsToday: 'Ca hôm nay',
    scheduledToday: 'Đã xếp lịch hôm nay',
    staffingGap: 'Thiếu nhân sự',
    needsResolution: 'Cần xử lý',
    pendingRegistrations: 'Đăng ký chờ duyệt',
    needsReview: 'Cần xem xét',
    attentionRequired: 'Cần chú ý',
    todaysOperationsTitle: 'Hoạt động hôm nay',
    noTodayOperations: 'Hôm nay chưa có ca',
    viewAll: 'Xem tất cả',
    dashboardAllShifts: 'Xem tất cả ca',
    allReports: 'Xem tất cả báo cáo',
    allNotifications: 'Xem tất cả thông báo',
    allDataQuality: 'Xem chất lượng dữ liệu',
  }
  const markup = renderToStaticMarkup(createElement(LanguageProvider, { defaultLanguage: 'vi' }, createElement(AdminDashboardView, {
    liveCount: 0,
    todaysShiftsCount: 0,
    missingStaffCount: null,
    pendingCount: 0,
    dqAttention: [],
    liveShifts: [],
    todaysOperations: [],
    performance: null,
    activityLog: null,
    t: key => translations[key] ?? key,
    applicationOverview: [
      { key: 'shifts', label: 'Ca trong kỳ', value: 4, href: '/calendar' },
      { key: 'reports', label: 'Báo cáo đã xác nhận', value: null, href: '/reports' },
    ],
  })))
  assert.match(markup, /Tổng quan toàn ứng dụng/)
  assert.match(markup, /Báo cáo đã xác nhận/)
  assert.match(markup, />4<|>4,000</)
  assert.doesNotMatch(markup, /Operations Dashboard|Operational Attention|dataQualityWarnings|dqWarningsDesc/)
  assert.doesNotMatch(markup, /Performance|Activity Log/)
})

test('leader dashboard renders Vietnamese labels instead of English fallback copy', () => {
  const markup = renderToStaticMarkup(createElement(LanguageProvider, { defaultLanguage: 'vi' }, createElement(LeaderDashboardView, {
    liveCount: 0,
    todaysShiftsCount: 0,
    missingStaffCount: null,
    pendingCount: 0,
    decisions: [],
    todaysSchedule: [],
    staffingHealth: null,
    upcomingLive: null,
    activityLog: null,
    userName: 'Leader',
  })))

  assert.match(markup, /Bảng điều khiển Leader/)
  assert.match(markup, /Hàng đợi quyết định/)
  assert.match(markup, /Tình trạng nhân sự/)
  assert.doesNotMatch(markup, /Leader Dashboard|Decision Queue|Upcoming Live|Staffing Health|Activity Log|TEAM SHIFTS|MISSING STAFF/)
})

test('mobile operations dashboard follows the selected English locale', () => {
  const markup = renderToStaticMarkup(createElement(LanguageProvider, { defaultLanguage: 'en' }, createElement(OpsMobileHome, {
    role: 'admin',
    shiftCount: 0,
    liveCount: null,
    pendingCount: null,
    shift: null,
    attention: [],
  })))

  assert.match(markup, /Welcome,/)
  assert.match(markup, /Quick access/)
  assert.doesNotMatch(markup, /Truy cập nhanh|Quản trị vận hành|Không có ca phù hợp trong phạm vi đã tải/)
})

test('ContentSkeleton renders stat cards and list rows without text flash', () => {
  const markup = renderToStaticMarkup(createElement(ContentSkeleton))
  assert.match(markup, /data-testid="content-skeleton"/)
  // No plain "Loading..." text.
  assert.doesNotMatch(markup, /Loading/)
})
