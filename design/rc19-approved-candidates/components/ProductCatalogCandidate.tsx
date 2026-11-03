'use client'

import * as React from 'react'
import {
  Download,
  Grid,
  List,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react'

export interface ProductVariantItem {
  id: string
  sku: string
  name: string
  barcode?: string
  price: number
  inventoryCount?: number
  channelStock?: {
    shopee?: number
    tiktok?: number
    lazada?: number
  }
}

export interface ProductItem {
  id: string
  sku: string
  name: string
  brand: string
  category: string
  status: 'active' | 'draft' | 'archived' | 'upcoming' | 'campaign'
  version?: string
  priceRange: { min: number; max: number }
  channels: ('shopee' | 'tiktok' | 'lazada' | 'shopee-live' | 'mega-live')[]
  variants: ProductVariantItem[]
  keyVisualUrl?: string
  isCombo?: boolean
  isSeasonal?: boolean
  claims?: {
    mandatory?: string[]
    restricted?: string[]
  }
}

export interface CatalogKpiMetrics {
  totalActiveProducts: number
  newProductsThisWeek: number
  mappedSkuRatio: { current: number; total: number }
  activeCampaignsCount: number
  campaignNames: string[]
  mediaComplianceRate: number
}

export interface ProductCatalogProps {
  initialBrand?: string
  brandsList?: string[]
  selectedBrand?: string
  onSelectBrand?: (brand: string) => void
  products?: ProductItem[]
  kpiMetrics?: CatalogKpiMetrics
  isLoading?: boolean
  canManage?: boolean
  onExportCatalog?: () => void
  onSyncPlatforms?: () => void
  onAddNewProduct?: () => void
  className?: string
}

// Fallback high-fidelity sample data matching Owner-approved reference
const DEFAULT_SAMPLE_PRODUCTS: ProductItem[] = [
  {
    id: 'prod-001',
    sku: 'PROD-ALN-001',
    name: 'Sữa Bột Anlene Total 10 Hương Vani 800g Chăm Sóc Toàn Diện',
    brand: 'ANLENE',
    category: 'Sữa dinh dưỡng',
    status: 'active',
    version: 'v2.4',
    priceRange: { min: 485000, max: 520000 },
    channels: ['shopee', 'tiktok'],
    variants: [
      {
        id: 'var-001',
        sku: 'ALN-T10-800-VN',
        name: 'Lon 800g Hương Vani Tiêu Chuẩn',
        barcode: '8934678120012',
        price: 495000,
        inventoryCount: 1450,
      },
      {
        id: 'var-002',
        sku: 'ALN-T10-400-VN',
        name: 'Lon Nhỏ 400g Dùng Thử',
        barcode: '8934678120029',
        price: 265000,
        inventoryCount: 820,
      },
      {
        id: 'var-003',
        sku: 'ALN-T10-CASE-6X800',
        name: 'Thùng Tiết Kiệm (6 Lon x 800g)',
        barcode: '8934678120036',
        price: 2850000,
        inventoryCount: 260,
      },
    ],
    claims: {
      mandatory: [
        'Anlene Total 10 bổ sung 10 dưỡng chất thiết yếu hỗ trợ Cơ - Xương - Khớp và đề kháng vững vàng.',
      ],
      restricted: [
        'Tuyệt đối không nói "chữa dứt điểm thoái hóa", không so sánh dìm hàng nhãn khác.',
      ],
    },
  },
  {
    id: 'prod-002',
    sku: 'PROD-ALN-002',
    name: 'Sữa Bột Anlene Vàng Đậm Đặc Pha Sẵn 180ml (Lốc 4 hộp / Thùng 48)',
    brand: 'ANLENE',
    category: 'Sữa dinh dưỡng',
    status: 'active',
    version: 'v2.1',
    priceRange: { min: 64000, max: 420000 },
    channels: ['shopee', 'tiktok', 'lazada'],
    variants: [
      { id: 'var-201', sku: 'ALN-GOLD-4PK', name: 'Lốc 4 Hộp 180ml', price: 64000, inventoryCount: 3200 },
      { id: 'var-202', sku: 'ALN-GOLD-CASE48', name: 'Thùng 48 Hộp 180ml', price: 420000, inventoryCount: 540 },
    ],
  },
  {
    id: 'prod-003',
    sku: 'PROD-ALN-003',
    name: 'Sữa Hạt Thực Vật Anlene 3 Khỏe Hương Hạnh Nhân & Đậu Nành 400g',
    brand: 'ANLENE',
    category: 'Sữa hạt',
    status: 'draft',
    version: 'v1.0',
    priceRange: { min: 285000, max: 285000 },
    channels: ['shopee-live'],
    variants: [
      { id: 'var-301', sku: 'ALN-PLANT-400', name: 'Hộp Hạt 400g', price: 285000, inventoryCount: 450 },
    ],
  },
  {
    id: 'prod-004',
    sku: 'COMBO-ALN-1111',
    name: 'Combo 2 Lon Anlene Total 10 800g Tặng Bình Giữ Nhiệt Lock&Lock Cao Cấp',
    brand: 'EXCLUSIVE',
    category: 'Combo khuyến mãi',
    status: 'campaign',
    version: 'v1.3',
    isCombo: true,
    priceRange: { min: 899000, max: 899000 },
    channels: ['shopee', 'mega-live'],
    variants: [
      { id: 'var-401', sku: 'ALN-DEAL-1111', name: 'Set 2 Lon + Quà Lock&Lock', price: 899000, inventoryCount: 120 },
    ],
  },
  {
    id: 'prod-005',
    sku: 'PROD-ALN-005',
    name: 'Sữa Bột Anlene MovePro Canxi & Collagen Hương Socola Ít Béo 800g',
    brand: 'ANLENE',
    category: 'Sữa dinh dưỡng',
    status: 'active',
    version: 'v1.9',
    priceRange: { min: 395000, max: 430000 },
    channels: ['tiktok'],
    variants: [
      { id: 'var-501', sku: 'ALN-MOVE-800', name: 'Lon 800g Socola', price: 395000, inventoryCount: 980 },
    ],
  },
  {
    id: 'prod-006',
    sku: 'SET-TET-2026',
    name: 'Hộp Quà Tết Anlene Sức Khỏe Vàng 2026 (2 Hộp 800g + Bộ Ly Thủy Tinh)',
    brand: 'SEASONAL',
    category: 'Set quà Tết',
    status: 'upcoming',
    version: 'v1.0',
    isSeasonal: true,
    priceRange: { min: 1150000, max: 1150000 },
    channels: ['shopee', 'tiktok'],
    variants: [
      { id: 'var-601', sku: 'ALN-TET-SET', name: 'Set Quà Tết Sang Trọng', price: 1150000, inventoryCount: 300 },
    ],
  },
]

const DEFAULT_SAMPLE_KPIS: CatalogKpiMetrics = {
  totalActiveProducts: 142,
  newProductsThisWeek: 8,
  mappedSkuRatio: { current: 418, total: 418 },
  activeCampaignsCount: 3,
  campaignNames: ['Mega 11.11', 'Brand Day', 'Daily Live'],
  mediaComplianceRate: 98.6,
}

export function ProductCatalogCandidate({
  initialBrand = 'Anlene Vietnam Official',
  brandsList = ['Anlene Vietnam Official', 'Fonterra Brands', 'Pepsico Foods', 'Mars Snacking'],
  selectedBrand,
  onSelectBrand,
  products = DEFAULT_SAMPLE_PRODUCTS,
  kpiMetrics = DEFAULT_SAMPLE_KPIS,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isLoading = false,
  canManage = true,
  onExportCatalog,
  onSyncPlatforms,
  onAddNewProduct,
  className = '',
}: ProductCatalogProps) {
  const [currentBrand, setCurrentBrand] = React.useState(selectedBrand || initialBrand)
  const [searchQuery, setSearchQuery] = React.useState('Anlene Total 10')
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid')
  const [selectedProductId, setSelectedProductId] = React.useState<string>(products[0]?.id || '')
  const [activeInspectorTab, setActiveInspectorTab] = React.useState<'sku' | 'mapping' | 'claims' | 'audit'>('sku')

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0]

  const handleBrandChange = (brand: string) => {
    setCurrentBrand(brand)
    if (onSelectBrand) onSelectBrand(brand)
  }

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val)
  }

  return (
    <div className={`flex flex-col gap-5 p-4 sm:p-6 bg-slate-50 min-h-full font-sans text-slate-900 ${className}`}>
      {/* 1. Header Toolbar with Context Brand Picker */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Product &amp; SKU Catalog
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              MOCK DATA
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Quản lý tập trung danh mục sản phẩm, biến thể SKU, sơ đồ mapping sàn (Shopee, TikTok, Lazada) và pháp lý kịch bản live.
          </p>

          <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse"></span>
            <span>Thương hiệu áp dụng:</span>
            <select
              value={currentBrand}
              onChange={(e) => handleBrandChange(e.target.value)}
              aria-label="Chọn thương hiệu áp dụng"
              className="bg-transparent font-bold text-blue-800 outline-none cursor-pointer border-none p-0 pr-1"
            >
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Global Catalog Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onExportCatalog}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Xuất Danh Mục</span>
          </button>
          <button
            type="button"
            onClick={onSyncPlatforms}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Đồng Bộ Sàn (Auto-sync)</span>
          </button>
          {canManage && (
            <button
              type="button"
              onClick={onAddNewProduct}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ Thêm Sản Phẩm Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. 4 KPI Metrics Cards with Explicit Validation Labels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5" role="region" aria-label="Catalog KPIs">
        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            <span>Sản phẩm hoạt động</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200">MOCK</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">
            {kpiMetrics.totalActiveProducts}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium">
            ↑ {kpiMetrics.newProductsThisWeek} sản phẩm mới tuần này
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            <span>SKU đã mapping sàn</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200">MOCK</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">
            {kpiMetrics.mappedSkuRatio.current} / {kpiMetrics.mappedSkuRatio.total}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium">
            100% khớp mã Shopee &amp; TikTok
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            <span>Chiến dịch livestream</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200">MOCK</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">
            {kpiMetrics.activeCampaignsCount} Chiến Dịch
          </div>
          <div className="text-[11px] text-slate-500 font-medium truncate">
            {kpiMetrics.campaignNames.join(' · ')}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 shadow-xs flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wide">
            <span>Chuẩn hóa media &amp; claims</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-50 text-amber-700 border border-amber-200">MOCK</span>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 leading-none">
            {kpiMetrics.mediaComplianceRate}%
          </div>
          <div className="text-[11px] text-emerald-600 font-medium">
            Đạt chuẩn kiểm duyệt kịch bản
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-xs flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-[220px] flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên sản phẩm, SKU, mã vạch..."
              className="w-full bg-transparent text-xs text-slate-900 outline-none"
            />
          </div>

          <select className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 font-medium">
            <option>Ngành hàng: Sữa dinh dưỡng (48)</option>
            <option>Ngành hàng: Sữa hạt thực vật (12)</option>
            <option>Ngành hàng: Combo quà tặng (16)</option>
          </select>

          <select className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 font-medium">
            <option>Kênh bán: Tất cả sàn (Shopee, TikTok, Lazada)</option>
            <option>Shopee Live</option>
            <option>TikTok Shop</option>
          </select>

          <select className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 font-medium">
            <option>Trạng thái: Hoạt động (Active)</option>
            <option>Bản nháp (Draft)</option>
            <option>Chiến dịch (Campaign)</option>
          </select>

          <select className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-700 font-medium hidden md:block">
            <option>Chiến dịch: Super Mega Live 11.11</option>
          </select>

          <div className="ml-auto inline-flex border border-slate-300 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 font-semibold transition-colors ${
                viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500 hover:text-slate-900'
              }`}
            >
              <Grid className="h-3 w-3" />
              <span>Lưới</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 font-semibold transition-colors ${
                viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-500 hover:text-slate-900'
              }`}
            >
              <List className="h-3 w-3" />
              <span>Bảng</span>
            </button>
          </div>
        </div>

        {/* Active Filter Chips */}
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] pt-1 border-t border-slate-100">
          <span className="text-slate-500 font-semibold">Bộ lọc hiệu lực:</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
            Thương hiệu: {currentBrand.split(' ')[0]} <X className="h-2.5 w-2.5 cursor-pointer" />
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
            Từ khóa: &quot;{searchQuery}&quot; <X className="h-2.5 w-2.5 cursor-pointer" />
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
            Kênh: Shopee + TikTok <X className="h-2.5 w-2.5 cursor-pointer" />
          </span>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="text-blue-600 font-semibold hover:underline ml-1"
          >
            Xóa tất cả bộ lọc
          </button>
          <span className="ml-auto text-slate-400">Hiển thị {products.length} trên 142 sản phẩm</span>
        </div>
      </div>

      {/* 4. Split Workspace: Product Grid (Left) + Detail Inspector (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_390px] gap-4.5 items-start">
        {/* Product Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {products.map((item) => {
            const isSelected = item.id === selectedProductId
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedProductId(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setSelectedProductId(item.id)
                  }
                }}
                className={`bg-white rounded-lg border transition-all text-left overflow-hidden cursor-pointer flex flex-col relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isSelected
                    ? 'border-blue-600 shadow-md ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300 shadow-xs'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2 right-2 z-10 bg-blue-600 text-white text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-xs">
                    ĐANG CHỌN
                  </span>
                )}

                {/* Card Thumbnail / Mock Packshot */}
                <div className="h-28 bg-slate-50 border-b border-slate-100 flex items-center justify-center relative p-2">
                  <div className="absolute top-2 left-2 flex gap-1 z-10">
                    {item.channels.includes('shopee') && (
                      <span className="bg-[#ee4d2d] text-white text-[8px] font-bold px-1.5 py-0.5 rounded">Shopee</span>
                    )}
                    {item.channels.includes('tiktok') && (
                      <span className="bg-black text-white text-[8px] font-bold px-1.5 py-0.5 rounded">TikTok</span>
                    )}
                    {item.channels.includes('lazada') && (
                      <span className="bg-[#0f146d] text-white text-[8px] font-bold px-1.5 py-0.5 rounded">Lazada</span>
                    )}
                    {item.channels.includes('shopee-live') && (
                      <span className="bg-[#ee4d2d] text-white text-[8px] font-bold px-1.5 py-0.5 rounded">Shopee Live</span>
                    )}
                    {item.channels.includes('mega-live') && (
                      <span className="bg-purple-700 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">Mega Live</span>
                    )}
                  </div>

                  <div className="w-20 h-22 rounded bg-gradient-to-b from-blue-900 to-blue-700 flex flex-col items-center justify-center text-white text-center p-1 shadow-sm">
                    <span className="text-[7px] tracking-wider opacity-80 uppercase">{item.brand}</span>
                    <strong className="text-[10px] font-extrabold my-0.5 line-clamp-1">{item.sku.split('-')[1] || 'PRODUCT'}</strong>
                    <span className="text-[7px] opacity-80 line-clamp-1">{item.variants[0]?.name || 'Standard'}</span>
                  </div>

                  <span className="absolute bottom-1.5 left-2 bg-slate-900/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                    {item.brand}
                  </span>
                </div>

                {/* Card Metadata */}
                <div className="p-3 flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="font-mono">{item.sku}</span>
                    <span
                      className={`font-bold ${
                        item.status === 'active'
                          ? 'text-emerald-600'
                          : item.status === 'campaign'
                            ? 'text-blue-600'
                            : 'text-amber-600'
                      }`}
                    >
                      {item.status.toUpperCase()} ({item.version || 'v1.0'})
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-900 line-clamp-2 leading-snug min-h-[32px]">
                    {item.name}
                  </h3>

                  <div className="flex items-baseline justify-between mt-auto pt-2 border-t border-slate-100">
                    <span className="text-xs font-extrabold text-slate-900">
                      {formatPrice(item.priceRange.min)}
                      {item.priceRange.max > item.priceRange.min && ` – ${formatPrice(item.priceRange.max)}`}
                    </span>
                    <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                      {item.variants.length} Biến thể SKU
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Product Detail Inspector (Sticky Right Drawer) */}
        {selectedProduct && (
          <aside className="bg-white rounded-lg border border-slate-200/90 shadow-sm flex flex-col overflow-hidden sticky top-4">
            <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-tight">Chi Tiết Sản Phẩm</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  MÃ: {selectedProduct.sku} · {selectedProduct.version || 'v1.0'}
                </div>
              </div>
              <span className="text-[9px] font-bold bg-white/20 px-2 py-0.5 rounded text-white">MOCK</span>
            </div>

            {/* Inspector Tab Switchers */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-2">
              <button
                type="button"
                onClick={() => setActiveInspectorTab('sku')}
                className={`px-2.5 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
                  activeInspectorTab === 'sku'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Biến thể SKU ({selectedProduct.variants.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveInspectorTab('claims')}
                className={`px-2.5 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
                  activeInspectorTab === 'claims'
                    ? 'border-blue-600 text-blue-600 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Claims &amp; Pháp Lý
              </button>
            </div>

            <div className="p-3.5 flex flex-col gap-3.5 max-h-[620px] overflow-y-auto">
              {/* Key Visual ca live box */}
              <div className="p-2.5 rounded-md bg-blue-50 border border-blue-200 flex gap-2.5 items-center">
                <div className="w-11 h-11 rounded bg-blue-600 text-white text-[9px] font-extrabold flex items-center justify-center shrink-0">
                  KV LIVE
                </div>
                <div className="text-[11px] text-blue-900 leading-tight">
                  <strong className="font-bold">Key Visual Ca Live · {selectedProduct.name.split(' ')[2] || 'Anlene'}</strong>
                  <br />
                  <span className="text-[10px] text-slate-500">Tỷ lệ 1080x1920 (TikTok) &amp; 1:1 (Shopee)</span>
                </div>
              </div>

              {/* SKU Variant Listing */}
              {activeInspectorTab === 'sku' && (
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase mb-2">
                    <span>Danh Sách Mã Biến Thể (SKU)</span>
                    <button type="button" className="text-blue-600 font-semibold hover:underline text-[11px]">
                      + Thêm SKU
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {selectedProduct.variants.map((v) => (
                      <div key={v.id} className="p-2.5 rounded border border-slate-200 bg-white flex flex-col gap-1">
                        <div className="flex justify-between items-baseline text-xs font-bold text-slate-900">
                          <span>{v.name}</span>
                          <span className="text-blue-600">{formatPrice(v.price)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                          <span>SKU: {v.sku}</span>
                          <span className="text-emerald-700 font-semibold">
                            Kho: {v.inventoryCount ?? 120} đơn vị
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Claims & Guardrails */}
              {activeInspectorTab === 'claims' && (
                <div className="flex flex-col gap-2.5">
                  <div className="text-[11px] font-bold text-slate-500 uppercase">
                    Hướng Dẫn Kịch Bản (Claims &amp; Guardrails)
                  </div>
                  <div className="p-2.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
                    <strong className="flex items-center gap-1 font-bold">
                      <Sparkles className="h-3 w-3 text-amber-600" /> Bắt Buộc Nhắc Đến (Mandatory Claim):
                    </strong>
                    <p className="mt-1 text-[11px]">
                      &ldquo;{selectedProduct.claims?.mandatory?.[0] || 'Sản phẩm bổ sung dưỡng chất thiết yếu hỗ trợ Cơ - Xương - Khớp chắc khỏe.'}&rdquo;
                    </p>
                  </div>

                  <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-900 text-xs leading-relaxed">
                    <strong className="flex items-center gap-1 font-bold text-rose-700">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> Nghiêm Cấm Phát Ngôn (Restricted):
                    </strong>
                    <p className="mt-1 text-[11px]">
                      &ldquo;{selectedProduct.claims?.restricted?.[0] || 'Tuyệt đối không nói "chữa dứt điểm", không so sánh dìm hàng nhãn khác.'}&rdquo;
                    </p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 5. Production Disclaimer */}
      <footer className="mt-6 pt-4 border-t border-slate-200 text-center text-[11px] text-slate-400">
        * Dữ liệu minh họa (MOCK) cho quy trình kiểm thử giao diện theo yêu cầu OWNER. Không ghi nhận hoặc phát sinh dữ liệu vào cơ sở dữ liệu thực tế.
      </footer>
    </div>
  )
}
