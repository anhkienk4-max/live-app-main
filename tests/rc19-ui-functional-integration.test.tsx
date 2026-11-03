import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { LanguageProvider } from '@/lib/i18n'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'

// =========================================================================
// TEST SUITE 1: ADA SPLASH / LOADING SCREEN (SINGLE GLOBAL OWNER)
// =========================================================================
test('SPLASH: AdaLoadingScreen renders neomorphic disc, orbital rings, and official AdaBrand lockup', () => {
  const markup = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <AdaLoadingScreen overlay />
    </LanguageProvider>
  )

  // 1. Single global owner landmarks
  assert.match(markup, /data-testid="ada-loading-screen"/)
  assert.match(markup, /ada-loading-screen--overlay/)
  assert.equal((markup.match(/data-testid="ada-brand-lockup"/g) ?? []).length, 1)
  assert.match(markup, /ada-loading-screen__logo/)
  assert.match(markup, /Đang tải ADA OPS Livestream/)

  // 2. Approved candidate visual assets: neomorphic disc, orbital rings, 3D cyan spheres
  assert.match(markup, /ada-splash-orbit-system/)
  assert.match(markup, /ada-splash-orbit-ring-outer/)
  assert.match(markup, /ada-splash-orbit-ring-inner/)
  assert.match(markup, /ada-splash-center-disc/)
  assert.match(markup, /ada-splash-inner-recessed/)
  assert.match(markup, /ada-splash-sphere--tr/)
  assert.match(markup, /ada-splash-sphere--bl/)
  assert.match(markup, /ada-splash-glow-arc-1/)
  assert.match(markup, /ada-splash-wave-tl-1/)
  assert.match(markup, /ada-splash-wave-br-1/)

  // 3. CSS Performance & reduced-motion verification
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(css, /\.ada-splash-orbit-system\s*\{[^}]*animation:\s*ada-orbit-spin-slow/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /\.ada-splash-orbit-system\s*\{\s*animation:\s*none;/)
})

// =========================================================================
// TEST SUITE 2: ADA LOGIN SCREEN (ROYAL BLUE CANVAS & FROSTED GLASS CARD)
// =========================================================================
test('LOGIN: AuthLayout variant="login" renders rich royal-blue radiant canvas and centered frosted card', () => {
  const markup = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <AuthLayout variant="login" title="Chào mừng trở lại!" subtitle="Đăng nhập để quản trị">
        <form data-testid="test-login-form">
          <input data-testid="email-input" name="email" type="email" />
          <input data-testid="password-input" name="password" type="password" />
          <button data-testid="email-login-btn" type="submit">Đăng nhập</button>
        </form>
      </AuthLayout>
    </LanguageProvider>
  )

  // 1. Canvas and sweeping luminous ribbons
  assert.match(markup, /data-testid="ada-reference-login"/)
  assert.match(markup, /ada-login-reference/)
  assert.match(markup, /ada-login-ribbon-1/)
  assert.match(markup, /ada-login-ribbon-2/)
  assert.match(markup, /ada-login-wave-1/)
  assert.match(markup, /ada-login-wave-2/)

  // 2. Centered frosted-glass card shell
  assert.match(markup, /ada-login-reference__content/)
  assert.match(markup, /max-w-\[460px\]/)
  assert.match(markup, /rounded-\[28px\]/)
  assert.match(markup, /bg-white\/95/)
  assert.match(markup, /backdrop-blur-xl/)
  assert.match(markup, /Chào mừng trở lại!/)

  // 3. Official AdaBrand header lockup
  assert.match(markup, /ada-brand/)
  assert.match(markup, /ada-brand__name/)
  assert.match(markup, /ada-brand__descriptor/)

  // 4. Form integration
  assert.match(markup, /data-testid="test-login-form"/)
  assert.match(markup, /data-testid="email-input"/)
  assert.match(markup, /data-testid="password-input"/)
  assert.match(markup, /data-testid="email-login-btn"/)

  // 5. Verification: NO non-functional floating tools dock in production login
  assert.doesNotMatch(markup, /floating-tools-bar/)
  assert.doesNotMatch(markup, /tool-badge-count/)
})

test('LOGIN: LoginPage source code maintains real session, dynamic Google check, and zero hardcoded states', () => {
  const loginSrc = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8')

  // Real authentication handlers
  assert.match(loginSrc, /establishPasswordSession\(createClient, email, password\)/)
  assert.match(loginSrc, /safeLocalRedirect\(/)
  assert.match(loginSrc, /shouldClearLocalSessionForLoginReason\(recoveryReason\)/)

  // Dynamic Google OAuth (not hardcoded false)
  assert.match(loginSrc, /fetch\('\/api\/auth\/providers'/)
  assert.match(loginSrc, /startGoogleOAuth\(/)

  // PwaInstallControl integration
  assert.match(loginSrc, /<PwaInstallControl compact \/>/)

  // Accessible testids
  assert.match(loginSrc, /data-testid="email-input"/)
  assert.match(loginSrc, /data-testid="password-input"/)
  assert.match(loginSrc, /data-testid="email-login-btn"/)
})

// =========================================================================
// TEST SUITE 3: PRODUCT CATALOG (PRODUCTION SHELL & REAL METRICS)
// =========================================================================
test('CATALOG: BrandCatalogWorkspace preserves production shell, calculated KPIs, and complete CRUD', () => {
  const catalogSrc = readFileSync(
    new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url),
    'utf8'
  )

  // 1. Production Shell integration
  assert.match(catalogSrc, /data-testid="brand-catalog"/)
  assert.match(catalogSrc, /ENTERPRISE SAAS/)
  assert.match(catalogSrc, /Product &amp; SKU Catalog/)
  assert.match(catalogSrc, /Danh mục sản phẩm &amp; SKU/)

  // 2. Dynamic Real KPIs (calculated from catalog, NO hardcoded mock numbers)
  assert.match(catalogSrc, /totalActiveProducts = products\.filter/)
  assert.match(catalogSrc, /mappedSkus = catalog\?\.skuPlatforms\.length/)
  assert.match(catalogSrc, /mappingPercentage = totalSkus > 0/)
  assert.match(catalogSrc, /activeCampaignsCount = activeCampaigns\.length/)
  assert.match(catalogSrc, /standardizedPercentage = totalProducts > 0/)
  assert.doesNotMatch(catalogSrc, /<div className="[^"]*">142<\/div>/)
  assert.doesNotMatch(catalogSrc, /<div className="[^"]*">418 \/ 418<\/div>/)
  assert.doesNotMatch(catalogSrc, /<div className="[^"]*">98\.6%<\/div>/)

  // 3. Search, Filter Toolbar, Sort, and View Switcher
  assert.match(catalogSrc, /placeholder="Tìm sản phẩm, SKU, ca live\.\.\."/)
  assert.match(catalogSrc, /aria-label="Filter category"/)
  assert.match(catalogSrc, /aria-label="Filter platform"/)
  assert.match(catalogSrc, /aria-label="Filter status"/)
  assert.match(catalogSrc, /aria-label="Filter campaign"/)
  assert.match(catalogSrc, /aria-label="Sort products"/)
  assert.match(catalogSrc, /aria-label="Grid view"/)
  assert.match(catalogSrc, /aria-label="List view"/)
  assert.match(catalogSrc, /Xóa tất cả bộ lọc/)

  // 4. Product Card Grid Features
  assert.match(catalogSrc, /ĐANG CHỌN/)
  assert.match(catalogSrc, /getProductPlatforms/)
  assert.match(catalogSrc, /Biến thể SKU/)

  // 5. Sticky Right Inspector Drawer with Tabs
  assert.match(catalogSrc, /activeInspectorTab === 'skus'/)
  assert.match(catalogSrc, /activeInspectorTab === 'platforms'/)
  assert.match(catalogSrc, /activeInspectorTab === 'claims'/)
  assert.match(catalogSrc, /activeInspectorTab === 'audit'/)
  assert.match(catalogSrc, /Bắt Buộc Nhắc Đến \(Mandatory Claims\)/)
  assert.match(catalogSrc, /Nghiêm Cấm Phát Ngôn \(Restricted\)/)

  // 6. Complete CRUD Mutations & Security
  assert.match(catalogSrc, /action:\s*'product\.create'/)
  assert.match(catalogSrc, /action:\s*'product\.update'/)
  assert.match(catalogSrc, /action:\s*'sku\.create'/)
  assert.match(catalogSrc, /action:\s*'sku\.update'/)
  assert.match(catalogSrc, /action:\s*'sku\.platform\.set'/)
  assert.match(catalogSrc, /action:\s*'campaign\.attach_sku'/)
  assert.match(catalogSrc, /action:\s*'resource\.attach'/)
  assert.match(catalogSrc, /action:\s*'scheme\.create'/)
  assert.match(catalogSrc, /action:\s*'knowledge\.create'/)
  assert.match(catalogSrc, /action:\s*'scope\.set'/)
  assert.match(catalogSrc, /const isAdmin = currentUser\?.system_permission === 'admin' \|\| currentUser\?.role === 'admin'/)
})
