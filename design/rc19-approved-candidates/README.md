# RC19 APPROVED VISUAL CANDIDATE HANDOFF SPECIFICATION

> **Branch:** `gemini/rc19-approved-visual-candidates`  
> **Status:** RC19 Visual Design Candidates Frozen & Packaged for Codex Integration  
> **Target App Shell:** Production App Shell (`ProductionAppShell.tsx`, `#082743` / `#0f172a` Navy Slate Sidebar, `LiveStream Ops` Header)  
> **Constraint Boundaries:** DESIGN & CANDIDATE COMPONENTS ONLY. No production routes modified, no database migrations, no storage mutations, no merge to `main`.

---

## 1. Executive Summary & Git Tracking Status

### 1.1 Git Tracking Verification (Task 1)
- **Previous State:** The 3 PNG screenshots (`01_Product_Catalog_Production_Shell.png`, `02_ADA_Login_Reference_Matched.png`, `03_ADA_Splash_Reference_Matched.png`) and the original HTML prototypes in `design/prototypes/` were untracked in Git (`??`).
- **Resolved State:** All approved design assets, high-resolution 2x Retina screenshots, interactive HTML prototypes, and modular candidate React components are now tracked inside `design/rc19-approved-candidates/` on this dedicated branch `gemini/rc19-approved-visual-candidates`.

---

## 2. Deliverables Inventory

### 2.1 High-Resolution Screenshots (2x Retina)
Located in `design/rc19-approved-candidates/screenshots/`:
1. `01_Product_Catalog_Production_Shell.png` (1600×960 @ 2x Retina, 3200×1920)
   - Matches the real Production App Shell from Owner screenshot (`media_1793698071120_bf5db138.jpg`).
   - Dark navy sidebar (`#0f172a`), `LiveStream Ops` video camera squircle logo, exact 5 operational menu groups.
   - Topbar preserved without Brand selector interference.
   - Brand selector moved into the catalog content body.
   - All 4 KPI cards and detail drawer clearly labeled with `[MOCK]` tags.
2. `02_ADA_Login_Reference_Matched.png` (1024×768 @ 2x Retina, 2048×1536)
   - 1:1 scale restoration of Owner reference `trang đăng nhập.png` (`media_1793695574726_d5a302e5.jpg`).
   - Frosted glass card occupying ~46% of window width and ~84% of window height.
   - Royal blue radiant gradient background with sweeping luminous wave ribbons and floating tools dock on the right.
   - Zero hardcoded personal credentials (clean `admin@adaglobal.com` placeholder).
   - Zero fake logout banners on default login state.
3. `03_ADA_Splash_Reference_Matched.png` (1024×873 @ 2x Retina, 2048×1746)
   - 1:1 scale restoration of Owner reference `logo animation chuyển trang loading.png` (`media_1793695574726_c96d7686.jpg`).
   - Central orbital cluster occupying ~80% of window height (~680px diameter).
   - 3D glowing cyan spheres at ~55° and ~220°, soft neomorphic center embossed disc, recessed inner circle.
   - Large prominent `ada | ada OPS LIVESTREAM` logo lockup.

### 2.2 Interactive HTML Prototypes
Located in `design/rc19-approved-candidates/prototypes/`:
- `01_product_catalog_production_shell.html`: Standalone reference with embedded responsive CSS.
- `02_ada_login_reference_matched.html`: Standalone reference for login glassmorphism and light ribbons.
- `03_ada_splash_reference_matched.html`: Standalone reference for orbital geometry and neomorphic depth.

### 2.3 Modular React Candidate Components
Located in `design/rc19-approved-candidates/components/`:
- `ProductCatalogCandidate.tsx`: Component ready for `app/(dashboard)/brand-catalog/page.tsx` integration.
- `ADALoginCandidate.tsx`: Component ready for `app/login/page.tsx` integration.
- `ADASplashCandidate.tsx`: Component ready for system loading screens and route transitions.
- `index.ts`: Unified export barrel.

---

## 3. Component Architecture & Codex Integration Guide

### 3.1 Product Catalog (`ProductCatalogCandidate.tsx`)
```tsx
import { ProductCatalogCandidate } from '@/design/rc19-approved-candidates/components'

export default function BrandCatalogPage() {
  return (
    <ProductCatalogCandidate
      initialBrand="Anlene Vietnam Official"
      products={liveProductsFromSupabase}
      kpiMetrics={liveKpiMetrics}
      canManage={userPermission >= Permission.EDITOR}
      onExportCatalog={handleExport}
      onSyncPlatforms={handleAutoSync}
      onAddNewProduct={openCreateModal}
    />
  )
}
```
*Key Integration Rules:*
- **No Inner Shell:** Do NOT render `<Sidebar>` or `<Header>` inside this component. The parent layout (`app/(dashboard)/layout.tsx`) already supplies `ProductionAppShell`.
- **Live Data Mapping:** Replace `kpiMetrics` with computed metrics from `products` and `campaigns` tables.
- **Scrollable Detail Inspector:** The right inspector drawer has `max-h-[620px] overflow-y-auto`, ensuring seamless scrolling on variant lists and claims without causing page jump.

### 3.2 ADA Login (`ADALoginCandidate.tsx`)
```tsx
import { ADALoginCandidate } from '@/design/rc19-approved-candidates/components'

export default function LoginPage() {
  const { email, setEmail, password, setPassword, handleSubmit, loading, error, recoveryNotice } = useAuth()
  
  return (
    <ADALoginCandidate
      email={email}
      setEmail={setEmail}
      password={password}
      setPassword={setPassword}
      onSubmit={handleSubmit}
      isLoading={loading}
      error={error}
      recoveryNotice={recoveryNotice}
    />
  )
}
```
*Key Integration Rules:*
- **Authentication Safety:** Uses standard Supabase password auth or mock auth via props.
- **No Hardcoded Values:** Controlled inputs with enterprise-safe placeholders only.
- **Accessible State:** Supports real `error` and `recoveryNotice` banner states with ARIA role alerts.

### 3.3 ADA Splash (`ADASplashCandidate.tsx`)
```tsx
import { ADASplashCandidate } from '@/design/rc19-approved-candidates/components'

export default function Loading() {
  return <ADASplashCandidate message="Đang đồng bộ dữ liệu ca trực..." />
}
```
*Key Integration Rules:*
- **Low-Power CSS Animation:** Uses GPU-accelerated `transform: rotate()` (`will-change: transform`).
- **Accessibility & Battery Protection:** Built-in `motion-reduce:animate-none` pauses all rotation automatically when `@media (prefers-reduced-motion: reduce)` is enabled.

---

## 4. Responsive & Accessibility Audit Results

Verified via Playwright automated headless test suite (`verify-candidates.mjs`):

| Viewport Breakpoint | Target Screen | Horizontal Overflow | Interactive Elements / Visual Elements | Result |
| :--- | :--- | :--- | :--- | :--- |
| **390 × 844 px** (Mobile) | Product Catalog | PASS (0px overflow) | Search collapsed, 1-col grid, stacked KPIs | **PASS** |
| **390 × 844 px** (Mobile) | ADA Login | PASS (0px overflow) | Card scaled to 92vw, centered, touch-friendly | **PASS** |
| **390 × 844 px** (Mobile) | ADA Splash | PASS (0px overflow) | Orbital system responsive scaling | **PASS** |
| **768 × 1024 px** (Tablet Portrait) | Product Catalog | PASS (0px overflow) | 2-col grid, stacked drawer | **PASS** |
| **768 × 1024 px** (Tablet Portrait) | ADA Login | PASS (0px overflow) | Card centered, tools bar hidden/compact | **PASS** |
| **1024 × 768 px** (Laptop / Reference) | Product Catalog | PASS (0px overflow) | Real Production Shell matching screenshot | **PASS** |
| **1024 × 768 px** (Laptop / Reference) | ADA Login | PASS (0px overflow) | 1:1 scale matching `trang đăng nhập.png` | **PASS** |
| **1024 × 873 px** (Reference) | ADA Splash | PASS (0px overflow) | 1:1 scale matching `logo animation...png` | **PASS** |
| **1440 × 900 px** (Widescreen) | Product Catalog | PASS (0px overflow) | 3-col grid + 390px sticky detail inspector | **PASS** |

### Reduced-Motion Check:
- `@media (prefers-reduced-motion: reduce)`: **VERIFIED PASS** (Orbital rotation paused, GPU overhead dropped to 0).

---

## 5. Code Quality & Static Analysis Checks

1. **TypeScript Typecheck:**
   - Ran `tsc --noEmit` across `design/rc19-approved-candidates/components/*.tsx`.
   - Result: **0 errors**.
2. **ESLint Static Analysis:**
   - Ran ESLint across `design/rc19-approved-candidates/components/`.
   - Result: **0 errors, 0 warnings**.

---

## 6. Implementation Status Ledger

| Component / Artifact | Format / Location | Status | Action Required for Production |
| :--- | :--- | :--- | :--- |
| **Catalog Shell & Grid** | `ProductCatalogCandidate.tsx` | **Ready for Integration** | Codex to import into `app/(dashboard)/brand-catalog/page.tsx` and wire with Supabase `products` query. |
| **Login Card** | `ADALoginCandidate.tsx` | **Ready for Integration** | Codex to replace `app/login/page.tsx` card layout while preserving existing `establishPasswordSession`. |
| **Splash Screen** | `ADASplashCandidate.tsx` | **Ready for Integration** | Codex to wire into `app/(dashboard)/loading.tsx` or global loading suspense boundaries. |
| **Design Deliverables** | 3 PNGs in `screenshots/` | **Approved Reference** | Archived as visual source of truth. |
| **HTML Prototypes** | 3 HTMLs in `prototypes/` | **Approved Reference** | Archived as interactive visual reference. |

---

*Handoff prepared by Gemini for Codex & Owner review.*
