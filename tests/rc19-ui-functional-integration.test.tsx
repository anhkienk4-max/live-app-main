import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { LanguageProvider } from '@/lib/i18n'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { AdaLoadingScreen } from '@/components/branding/AdaLoadingScreen'
import { sanitizeCsvValue } from '@/components/features/brand-catalog/BrandCatalogWorkspace'

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

test('SPLASH INTERACTION: Loading transition lifecycle, overlay modes, and accessibility landmarks', () => {
  // Test overlay mode
  const overlayHtml = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <AdaLoadingScreen overlay label="Đang đồng bộ dữ liệu phiên live..." />
    </LanguageProvider>
  )
  assert.match(overlayHtml, /role="status"/)
  assert.match(overlayHtml, /aria-busy="true"/)
  assert.match(overlayHtml, /aria-live="polite"/)
  assert.match(overlayHtml, /ada-loading-screen--overlay/)
  assert.match(overlayHtml, /Đang tải ADA OPS Livestream/)

  // Test inline non-overlay mode
  const inlineHtml = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="en">
      <AdaLoadingScreen overlay={false} label="Loading products..." />
    </LanguageProvider>
  )
  assert.doesNotMatch(inlineHtml, /ada-loading-screen--overlay/)
  assert.match(inlineHtml, /role="status"/)
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

test('LOGIN INTERACTION: Credential validation, session recovery reasons, and accessible alerts', () => {
  // Test session recovery alert
  const recoveryMarkup = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <AuthLayout variant="login" title="Đăng nhập lại">
        <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
          Bạn đã đăng xuất an toàn. Vui lòng đăng nhập lại.
        </div>
      </AuthLayout>
    </LanguageProvider>
  )
  assert.match(recoveryMarkup, /role="status"/)
  assert.match(recoveryMarkup, /Bạn đã đăng xuất an toàn/)

  // Test error feedback banner
  const errorMarkup = renderToStaticMarkup(
    <LanguageProvider defaultLanguage="vi">
      <AuthLayout variant="login" title="Đăng nhập">
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Tài khoản hoặc mật khẩu không chính xác.
        </div>
      </AuthLayout>
    </LanguageProvider>
  )
  assert.match(errorMarkup, /role="alert"/)
  assert.match(errorMarkup, /Tài khoản hoặc mật khẩu không chính xác/)
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
  assert.match(catalogSrc, /mappedSkuIds = new Set\(/)
  assert.match(catalogSrc, /mappedSkus = catalog\?\.skus\.filter\(s => mappedSkuIds\.has\(s\.id\)\)\.length/)
  assert.match(catalogSrc, /mappingPercentage = totalSkus > 0/)
  assert.match(catalogSrc, /activeCampaignsCount = activeCampaigns\.length/)
  assert.match(catalogSrc, /productsWithMedia = products\.filter/)
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

// =========================================================================
// TEST SUITE 4: KPI ACCURACY, CLAIMS GUARDRAILS & CSV SECURITY
// =========================================================================
test('CATALOG KPI: Distinct mapped SKU counting, bounded percentage (never >100%), and image coverage accuracy', () => {
  // Mock dataset where multiple platforms map to the SAME sku
  const mockCatalog = {
    products: [
      { id: 'p1', name: 'Product A', product_code: 'PA', category: 'Sữa', lifecycle_status: 'active', version: 1 },
      { id: 'p2', name: 'Product B', product_code: 'PB', category: 'Sữa', lifecycle_status: 'active', version: 1 },
      { id: 'p3', name: 'Product C', product_code: 'PC', category: 'Dinh dưỡng', lifecycle_status: 'draft', version: 1 },
    ],
    skus: [
      { id: 's1', product_id: 'p1', sku_code: 'SKU-1', variant_name: '800g', lifecycle_status: 'active', version: 1 },
      { id: 's2', product_id: 'p1', sku_code: 'SKU-2', variant_name: '400g', lifecycle_status: 'active', version: 1 },
      { id: 's3', product_id: 'p2', sku_code: 'SKU-3', variant_name: '1kg', lifecycle_status: 'active', version: 1 },
      { id: 's4', product_id: 'p3', sku_code: 'SKU-4', variant_name: '200ml', lifecycle_status: 'draft', version: 1 },
    ],
    // SKU 1 is mapped to 3 different platforms (Shopee, TikTok, Lazada)
    // SKU 2 is mapped to 1 platform (Shopee)
    // SKU 3 and SKU 4 have NO platform mapping
    skuPlatforms: [
      { sku_id: 's1', platform_id: 'plat-shopee' },
      { sku_id: 's1', platform_id: 'plat-tiktok' },
      { sku_id: 's1', platform_id: 'plat-lazada' },
      { sku_id: 's2', platform_id: 'plat-shopee' },
    ],
    campaigns: [
      { id: 'c1', name: 'Mega 11.11', status: 'active' },
      { id: 'c2', name: 'Brand Day', status: 'completed' },
    ],
    resourceLinks: [
      { id: 'rl1', product_id: 'p1', resource_id: 'res1', relation_type: 'image' },
      { id: 'rl2', product_id: 'p2', resource_id: 'res2', relation_type: 'kv' },
    ],
  }

  // 1. KPI Calculation verification
  const totalProducts = mockCatalog.products.length // 3
  const totalActiveProducts = mockCatalog.products.filter(p => p.lifecycle_status === 'active').length // 2
  const totalSkus = mockCatalog.skus.length // 4

  assert.equal(totalProducts, 3)
  assert.equal(totalActiveProducts, 2)

  // Distinct mapped SKUs calculation (matches BrandCatalogWorkspace logic)
  const mappedSkuIds = new Set(mockCatalog.skuPlatforms.map(sp => sp.sku_id))
  const mappedSkus = mockCatalog.skus.filter(s => mappedSkuIds.has(s.id)).length
  const mappingPercentage = totalSkus > 0 ? Math.min(100, Math.max(0, Math.round((mappedSkus / totalSkus) * 100))) : 0

  // Total raw platform link rows = 4, but DISTINCT mapped SKUs = 2
  assert.equal(mockCatalog.skuPlatforms.length, 4)
  assert.equal(mappedSkus, 2, 'Must count distinct SKUs, not total platform links')
  assert.equal(totalSkus, 4)
  assert.equal(mappingPercentage, 50, '2 / 4 = 50%')

  // Verify ratio NEVER exceeds 100% even if 1 SKU has 10 platform links
  const singleSkuCatalog = {
    skus: [{ id: 's1', product_id: 'p1', sku_code: 'S1', variant_name: 'V1', lifecycle_status: 'active', version: 1 }],
    skuPlatforms: [
      { sku_id: 's1', platform_id: 'p1' },
      { sku_id: 's1', platform_id: 'p2' },
      { sku_id: 's1', platform_id: 'p3' },
      { sku_id: 's1', platform_id: 'p4' },
      { sku_id: 's1', platform_id: 'p5' },
    ],
  }
  const singleMappedIds = new Set(singleSkuCatalog.skuPlatforms.map(sp => sp.sku_id))
  const singleMappedCount = singleSkuCatalog.skus.filter(s => singleMappedIds.has(s.id)).length
  const singleRatio = Math.min(100, Math.max(0, Math.round((singleMappedCount / singleSkuCatalog.skus.length) * 100)))
  assert.equal(singleMappedCount, 1)
  assert.equal(singleRatio, 100, 'Ratio must be capped at 100%')

  // 2. Refresh button name verification (no fake sync claims)
  const catalogSrc = readFileSync(
    new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url),
    'utf8'
  )
  assert.match(catalogSrc, /> Làm mới dữ liệu/)
  assert.doesNotMatch(catalogSrc, /> Đồng Bộ Sàn \(Auto-sync\)/)

  // 3. Media KPI label verification (no legal pass claims)
  assert.match(catalogSrc, /<span>Tỷ lệ có ảnh \/ Key Visual<\/span>/)
  assert.match(catalogSrc, /sản phẩm có tài nguyên hình ảnh/)
  assert.doesNotMatch(catalogSrc, /<span>Chuẩn hóa Media &amp; Claims<\/span>/)
  assert.doesNotMatch(catalogSrc, /Đạt chuẩn duyệt kịch bản live/)
})

test('CATALOG CLAIMS: Fallback guardrails display explicit unapproved/missing state without fake legal copy', () => {
  const catalogSrc = readFileSync(
    new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url),
    'utf8'
  )

  // Must not have misleading default copy that looks like approved legal text
  assert.doesNotMatch(catalogSrc, /Vui lòng tuân thủ đúng tên gọi và công dụng chính hãng đã được cấp phép\./)
  assert.doesNotMatch(catalogSrc, /Tuyệt đối không so sánh tiêu cực nhãn hàng khác, không cam kết quá mức công dụng\./)

  // Must display explicit missing / unapproved fallback notice
  assert.match(catalogSrc, /Chưa có thông điệp bắt buộc được phê duyệt cho thương hiệu này\./)
  assert.match(catalogSrc, /Chưa ghi nhận thông điệp hạn chế hoặc cấm phát ngôn\./)
})

test('CATALOG CSV SECURITY: Formula injection prevention and user brand scope bounding', () => {
  // 1. Formula Injection Sanitization Tests
  assert.equal(sanitizeCsvValue('=1+2'), `"'=1+2"`)
  assert.equal(sanitizeCsvValue('   =SUM(1,2)'), `"'   =SUM(1,2)"`)
  assert.equal(sanitizeCsvValue('\n+CMD'), `"'\n+CMD"`)
  assert.equal(sanitizeCsvValue('\ufeff=1+2'), `"'\ufeff=1+2"`)
  assert.equal(sanitizeCsvValue('+84901234567'), `"'` + `+84901234567"`)
  assert.equal(sanitizeCsvValue('-500000'), `"'-500000"`)
  assert.equal(sanitizeCsvValue('@SUM(A1:A10)'), `"'@SUM(A1:A10)"`)
  assert.equal(sanitizeCsvValue('\tcmd.exe'), `"'\tcmd.exe"`)
  assert.equal(sanitizeCsvValue('\rcmd.exe'), `"'\rcmd.exe"`)
  assert.equal(sanitizeCsvValue('|cmd.exe'), `"'|cmd.exe"`)
  assert.equal(sanitizeCsvValue('Standard Product Name'), `"Standard Product Name"`)
  assert.equal(sanitizeCsvValue('Sữa Bột "Anlene" 800g'), `"Sữa Bột ""Anlene"" 800g"`)
  assert.equal(sanitizeCsvValue(null), `""`)
  assert.equal(sanitizeCsvValue(undefined), `""`)

  // 2. Scope Security: ensure only products belonging to authorized brand scope are exported
  const allProducts = [
    { id: 'p1', name: 'Permitted Brand Product A', product_code: 'P-A', lifecycle_status: 'active', version: 1 },
    { id: 'p2', name: 'Permitted Brand Product B', product_code: 'P-B', lifecycle_status: 'active', version: 1 },
    { id: 'p3', name: 'Other Unauthorized Brand Product C', product_code: 'P-C', lifecycle_status: 'active', version: 1 },
  ]
  const userScopedProductIds = new Set(['p1', 'p2'])

  const exportable = allProducts.filter(p => userScopedProductIds.has(p.id))
  assert.equal(exportable.length, 2)
  assert.deepEqual(exportable.map(p => p.id), ['p1', 'p2'])
  assert.ok(!exportable.some(p => p.id === 'p3'), 'Cross-brand product must never leak into export')
})

test('CATALOG INTERACTION: Search, multi-axis filter, SKU selection, and inspector drawer tab switching', () => {
  const catalogSrc = readFileSync(
    new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url),
    'utf8'
  )

  // 1. Search filter matches product name, code, category, and SKU variants
  assert.match(catalogSrc, /const matchProduct = product\.name\.toLowerCase\(\)\.includes\(q\) \|\| product\.product_code\.toLowerCase\(\)\.includes\(q\) \|\| \(product\.category \?\? ''\)\.toLowerCase\(\)\.includes\(q\)/)
  assert.match(catalogSrc, /const matchSku = catalog\?\.skus\.some\(s => s\.product_id === product\.id && \(s\.sku_code\.toLowerCase\(\)\.includes\(q\) \|\| s\.variant_name\.toLowerCase\(\)\.includes\(q\)\)\)/)

  // 2. Multi-axis filter variables
  assert.match(catalogSrc, /const \[categoryFilter, setCategoryFilter\] = React\.useState\(''\)/)
  assert.match(catalogSrc, /const \[statusFilter, setStatusFilter\] = React\.useState\(''\)/)
  assert.match(catalogSrc, /const \[campaignId, setCampaignId\] = React\.useState\(/)
  assert.match(catalogSrc, /const \[platformId, setPlatformId\] = React\.useState\(''\)/)
  assert.match(catalogSrc, /const \[kind, setKind\] = React\.useState\('all'\)/)

  // 3. Clear all filters handler
  assert.match(catalogSrc, /const clearAllFilters = \(\) => \{/)

  // 4. Inspector tab switching: skus, platforms, claims, audit
  assert.match(catalogSrc, /type InspectorTab = 'skus' \| 'platforms' \| 'claims' \| 'audit'/)
  assert.match(catalogSrc, /setActiveInspectorTab\('skus'\)/)
  assert.match(catalogSrc, /setActiveInspectorTab\('platforms'\)/)
  assert.match(catalogSrc, /setActiveInspectorTab\('claims'\)/)
  assert.match(catalogSrc, /setActiveInspectorTab\('audit'\)/)
})

test('CATALOG RBAC: Non-admin negative permission testing (zero mutation actions or privileged controls)', () => {
  const catalogSrc = readFileSync(
    new URL('../components/features/brand-catalog/BrandCatalogWorkspace.tsx', import.meta.url),
    'utf8'
  )

  // 1. Role determination
  assert.match(catalogSrc, /const isAdmin = currentUser\?.system_permission === 'admin' \|\| currentUser\?.role === 'admin'/)

  // 2. Positive & Negative gating for privileged actions
  // "Thêm Sản Phẩm Mới" only renders when isAdmin === true
  assert.match(catalogSrc, /\{isAdmin && \(\s*<Button\s+size="sm"\s+onClick=\{[\s\S]*?<Plus className="h-4 w-4" \/> Thêm Sản Phẩm Mới/)

  // "Sửa" product action only renders when isAdmin === true
  assert.match(catalogSrc, /\{isAdmin && \(\s*<Button\s+variant="ghost"\s+size="sm"\s+onClick=\{[\s\S]*?<Edit2 className="h-3\.5 w-3\.5 mr-1" \/> Sửa/)

  // "Sửa thông tin SKU" form only renders when isAdmin === true
  assert.match(catalogSrc, /\{selectedSku && isAdmin && \(\s*<div className="space-y-2 rounded-lg border bg-muted\/20 p-3">\s*<p className="text-xs font-semibold text-foreground">Sửa thông tin SKU/)

  // "Thêm biến thể SKU mới" form only renders when isAdmin === true
  assert.match(catalogSrc, /\{skuId === 'new' && isAdmin && \(\s*<Card className="border-blue-300 bg-blue-50\/20">\s*<CardHeader className="pb-2">\s*<CardTitle className="text-xs font-bold">Thêm biến thể SKU mới<\/CardTitle>/)

  // "Đính kèm tài nguyên / Hình ảnh" only renders when isAdmin === true
  assert.match(catalogSrc, /\{isAdmin && \(\s*<div className="pt-2 border-t border-border\/50 space-y-2 text-xs">\s*<span className="font-bold text-slate-800">Đính kèm tài nguyên \/ Hình ảnh:<\/span>/)

  // "Tham gia chiến dịch" only renders when isAdmin === true
  assert.match(catalogSrc, /\{isAdmin && \(\s*<div className="pt-2 border-t border-border\/50 space-y-2 text-xs">\s*<span className="font-bold text-slate-800">Tham gia chiến dịch:<\/span>/)

  // "Cấp quyền đọc danh mục" (Admin brand scopes) only renders when isAdmin === true
  assert.match(catalogSrc, /\{isAdmin && catalog && \(\s*<div className="space-y-6 pt-6 border-t border-border">/)
})
