'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Check,
  Download,
  Edit2,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Package,
  Plus,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageLoadError } from '@/components/ui/page-load-error'

type BrandRow = {
  id: string
  name: string
  status: string
  category?: string | null
  logo_url?: string | null
  description?: string | null
  brand_guideline?: string | null
  tone_of_voice?: string | null
  key_products?: string[]
  mandatory_claims?: string[]
  restricted_claims?: string[]
  dos?: string[]
  donts?: string[]
  asset_links?: string[]
}

type CampaignRow = {
  id: string
  name: string
  brand_id: string
  start_date: string
  end_date: string
  status: string
  platform_ids?: string[]
  notes?: string | null
}

type ProductRow = {
  id: string
  name: string
  product_code: string
  category?: string | null
  description?: string | null
  lifecycle_status: string
  version: number
}

type ProductBrandRow = {
  product_id: string
  brand_id: string
}

type SkuRow = {
  id: string
  product_id: string
  sku_code: string
  variant_name: string
  size_or_package?: string | null
  packaging_type?: string | null
  lifecycle_status: string
  version: number
}

type CampaignSkuRow = {
  campaign_id: string
  sku_id: string
}

type SchemeRow = {
  id: string
  campaign_id: string
  scheme_name: string
  terms: string
  status: string
  valid_from: string
  valid_to: string
  created_by: string
}

type KnowledgeRow = {
  id: string
  product_id: string
  knowledge_type: string
  content: unknown
  status: string
  version: number
  created_by: string
}

type ResourceLinkRow = {
  id: string
  resource_id: string
  relation_type: string
  product_id?: string | null
  sku_id?: string | null
  campaign_id?: string | null
}

type ResourceRow = {
  id: string
  title: string
  canonical_url: string
  provider: string
  resource_type: string
  verification_status: string
}

type ScopeRow = {
  grant_id: string
  user_id: string
  brand_id: string
  expires_at?: string | null
  revoked_at?: string | null
}

type UserRow = {
  id: string
  full_name: string
  system_permission: string
}

type PlatformSkuRow = {
  sku_id: string
  platform_id: string
  external_sku_id: string
}

type PlatformRow = {
  id: string
  name: string
  status: string
}

type ApprovalRow = {
  knowledge_version_id: string
  decision: string
  reviewed_at: string
}

type AuditRow = {
  id: number
  table_name: string
  record_id: string
  action: string
  actor_id: string | null
  created_at: string
}

type Catalog = {
  brands: BrandRow[]
  campaigns: CampaignRow[]
  products: ProductRow[]
  productBrands: ProductBrandRow[]
  skus: SkuRow[]
  campaignSkus: CampaignSkuRow[]
  schemes: SchemeRow[]
  knowledge: KnowledgeRow[]
  resourceLinks: ResourceLinkRow[]
  resources: ResourceRow[]
  scopes: ScopeRow[]
  skuPlatforms: PlatformSkuRow[]
  platforms: PlatformRow[]
  knowledgeApprovals: ApprovalRow[]
  users: UserRow[]
  auditEvents: AuditRow[]
}

type SortField = 'name_asc' | 'name_desc' | 'code_asc' | 'status' | 'version_desc'
type InspectorTab = 'skus' | 'platforms' | 'claims' | 'audit'

function productHasResourceType(catalog: Catalog | null, productId: string, kind: string) {
  if (!catalog || kind === 'all') return true
  const skuIds = new Set(catalog.skus.filter(sku => sku.product_id === productId).map(sku => sku.id))
  const campaignIds = new Set(catalog.campaignSkus.filter(link => skuIds.has(link.sku_id)).map(link => link.campaign_id))
  return catalog.resourceLinks.some(link =>
    (link.product_id === productId || (link.sku_id != null && skuIds.has(link.sku_id)) || (link.campaign_id != null && campaignIds.has(link.campaign_id)))
    && catalog.resources.some(resource => resource.id === link.resource_id && resource.resource_type === kind)
  )
}

function getProductStatusVariant(status: string): 'success' | 'secondary' | 'outline' | 'destructive' {
  switch (status.toLowerCase()) {
    case 'active':
      return 'success'
    case 'draft':
      return 'secondary'
    case 'archived':
    case 'deleted':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""'
  let str = String(val)
  // Prevent CSV formula injection in spreadsheet software (=, +, -, @, tab, CR, pipe)
  if (/^[=+\-@|\u0000-\u001F]/.test(str) || /^[\u0000-\u0020\uFEFF]*[=+\-@|]/.test(str)) {
    str = `'` + str
  }
  return `"${str.replace(/"/g, '""')}"`
}

export function BrandCatalogWorkspace() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const isAdmin = currentUser?.system_permission === 'admin' || currentUser?.role === 'admin'

  const [catalog, setCatalog] = React.useState<Catalog | null>(null)
  const [brandId, setBrandId] = React.useState(() => searchParams.get('brand_id') ?? '')
  const [query, setQuery] = React.useState(() => searchParams.get('q') ?? '')
  const [categoryFilter, setCategoryFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [campaignId, setCampaignId] = React.useState(() => searchParams.get('campaign_id') ?? '')
  const [platformId, setPlatformId] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [sortBy, setSortBy] = React.useState<SortField>('name_asc')
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid')
  const [activeInspectorTab, setActiveInspectorTab] = React.useState<InspectorTab>('skus')

  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [productId, setProductId] = React.useState(() => searchParams.get('product_id') ?? '')
  const [skuId, setSkuId] = React.useState(() => searchParams.get('sku_id') ?? '')
  const [editingProduct, setEditingProduct] = React.useState(false)

  const [form, setForm] = React.useState({
    product_code: '',
    name: '',
    category: '',
    description: '',
    product_brand_ids: [] as string[],
    sku_code: '',
    variant_name: '',
    resource_id: '',
    scheme_name: '',
    terms: '',
    scheme_source_url: '',
    knowledge: '',
    source_reference: '',
    review_reason: '',
    access_user_id: '',
    scope_expiry: '',
    relation_type: 'image',
    sku_platform_id: '',
    external_sku_id: '',
    lifecycle_status: 'draft',
    sku_lifecycle_status: 'active',
    sku_size_or_package: '',
    sku_packaging_type: '',
  })

  const updateCatalogUrl = React.useCallback((nextProductId: string, nextSkuId = '') => {
    const params = new URLSearchParams(searchParams.toString())
    if (nextProductId && nextProductId !== 'new') params.set('product_id', nextProductId)
    else params.delete('product_id')
    if (nextSkuId && nextSkuId !== 'new') params.set('sku_id', nextSkuId)
    else params.delete('sku_id')
    const queryString = params.toString()
    router.replace(queryString ? `/brand-catalog?${queryString}` : '/brand-catalog', { scroll: false })
  }, [router, searchParams])

  const load = React.useCallback(async () => {
    setError('')
    try {
      const params = new URLSearchParams()
      if (brandId) params.set('brand_id', brandId)
      if (query) params.set('q', query)
      const response = await fetch('/api/brand-catalog?' + params.toString(), { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? 'Unable to load catalog')
      setCatalog(result as Catalog)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load catalog')
    }
  }, [brandId, query])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void load() })
    return () => cancelAnimationFrame(frame)
  }, [load])

  async function mutate(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/brand-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok || result.ok !== true) throw new Error(result.error ?? 'Action failed')
      setNotice('Lưu thành công')
      await load()
      return result
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
      return null
    } finally {
      setBusy(false)
    }
  }

  // Schema pending check (matches tests/brand-catalog-schema-pending-ui.test.ts)
  if (error && !catalog) {
    if (error === 'BRAND01_SCHEMA_NOT_INSTALLED') {
      return (
        <main data-testid="brand-catalog-schema-pending" role="status" className="mx-auto max-w-3xl p-4 md:p-8">
          <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 md:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Brand / Campaign</p>
              <h1 className="mt-2 text-xl font-semibold text-slate-950">{t('brandCatalogSchemaPendingTitle')}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{t('brandCatalogSchemaPendingBody')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button nativeButton={false} render={<Link href="/brands" />} variant="default">{t('brandCatalogBackToBrands')}</Button>
              <Button nativeButton={false} render={<Link href="/admin" />} variant="outline">{t('brandCatalogOpenAdmin')}</Button>
            </div>
          </section>
        </main>
      )
    }
    return <PageLoadError error={error} onRetry={() => void load()} />
  }

  const brands = catalog?.brands ?? []
  const campaigns = catalog?.campaigns ?? []
  const products = catalog?.products ?? []
  const scopedProductIds = new Set(catalog?.productBrands.filter(link => !brandId || link.brand_id === brandId).map(link => link.product_id))

  // Extract distinct categories from loaded products
  const availableCategories = Array.from(
    new Set(products.map(p => p.category?.trim()).filter((c): c is string => Boolean(c)))
  ).sort()

  // Real KPI calculations from catalog
  const totalActiveProducts = products.filter(p => p.lifecycle_status === 'active').length
  const totalProducts = products.length
  const totalSkus = catalog?.skus.length ?? 0
  const mappedSkuIds = new Set((catalog?.skuPlatforms ?? []).map(sp => sp.sku_id))
  const mappedSkus = catalog?.skus.filter(s => mappedSkuIds.has(s.id)).length ?? 0
  const mappingPercentage = totalSkus > 0 ? Math.min(100, Math.max(0, Math.round((mappedSkus / totalSkus) * 100))) : 0
  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  const activeCampaignsCount = activeCampaigns.length
  const activeCampaignsSummary = activeCampaigns.map(c => c.name).slice(0, 3).join(' · ') || (campaigns.length ? `${campaigns.length} chiến dịch` : 'Chưa có chiến dịch')
  const productsWithMedia = products.filter(p => productHasResourceType(catalog, p.id, 'image') || productHasResourceType(catalog, p.id, 'kv')).length
  const standardizedPercentage = totalProducts > 0 ? Math.min(100, Math.max(0, Math.round((productsWithMedia / totalProducts) * 100))) : 0

  // Filter products
  const filteredProducts = products.filter(product => {
    if (brandId && !scopedProductIds.has(product.id)) return false
    if (categoryFilter && product.category !== categoryFilter) return false
    if (statusFilter && product.lifecycle_status !== statusFilter) return false
    if (campaignId && !catalog?.campaignSkus.some(link => link.campaign_id === campaignId && catalog.skus.some(sku => sku.id === link.sku_id && sku.product_id === product.id))) return false
    if (platformId && !catalog?.skuPlatforms.some(link => link.platform_id === platformId && catalog.skus.some(sku => sku.id === link.sku_id && sku.product_id === product.id))) return false
    if (!productHasResourceType(catalog, product.id, kind)) return false
    if (query.trim()) {
      const q = query.toLowerCase()
      const matchProduct = product.name.toLowerCase().includes(q) || product.product_code.toLowerCase().includes(q) || (product.category ?? '').toLowerCase().includes(q)
      const matchSku = catalog?.skus.some(s => s.product_id === product.id && (s.sku_code.toLowerCase().includes(q) || s.variant_name.toLowerCase().includes(q)))
      if (!matchProduct && !matchSku) return false
    }
    return true
  })

  // Sort products
  filteredProducts.sort((a, b) => {
    switch (sortBy) {
      case 'name_asc':
        return a.name.localeCompare(b.name, 'vi')
      case 'name_desc':
        return b.name.localeCompare(a.name, 'vi')
      case 'code_asc':
        return a.product_code.localeCompare(b.product_code)
      case 'status':
        return a.lifecycle_status.localeCompare(b.lifecycle_status)
      case 'version_desc':
        return b.version - a.version
      default:
        return 0
    }
  })

  const selectedProduct = products.find(product => product.id === productId)
  const selectedProductBrand = selectedProduct ? brands.find(b => (!brandId || b.id === brandId) && catalog?.productBrands.some(link => link.product_id === selectedProduct.id && link.brand_id === b.id)) : null
  const productSkus = catalog?.skus.filter(sku => sku.product_id === productId) ?? []
  const selectedSku = productSkus.find(sku => sku.id === skuId)

  // Find thumbnail image for a given product
  const getProductImage = (prodId: string) => {
    if (!catalog) return null
    const links = catalog.resourceLinks.filter(l => l.product_id === prodId && (l.relation_type === 'image' || l.relation_type === 'kv' || l.relation_type === 'marketing_asset'))
    for (const link of links) {
      const res = catalog.resources.find(r => r.id === link.resource_id)
      if (res && res.canonical_url) return res.canonical_url
    }
    return null
  }

  // Get external platforms for product
  const getProductPlatforms = (prodId: string) => {
    if (!catalog) return []
    const skuIds = new Set(catalog.skus.filter(s => s.product_id === prodId).map(s => s.id))
    const platformIds = new Set(catalog.skuPlatforms.filter(sp => skuIds.has(sp.sku_id)).map(sp => sp.platform_id))
    return catalog.platforms.filter(p => platformIds.has(p.id))
  }

  const clearAllFilters = () => {
    setBrandId('')
    setCategoryFilter('')
    setStatusFilter('')
    setCampaignId('')
    setPlatformId('')
    setKind('all')
    setQuery('')
  }

  const exportFilteredCatalog = () => {
    // Strictly restrict export to products within user-authorized brand scope
    const exportableProducts = filteredProducts.filter(p => scopedProductIds.has(p.id))
    if (!exportableProducts.length) return
    const rows = exportableProducts.map(p => {
      const skus = catalog?.skus.filter(s => s.product_id === p.id) ?? []
      return {
        product_code: p.product_code,
        name: p.name,
        category: p.category ?? '',
        status: p.lifecycle_status,
        version: p.version,
        skus_count: skus.length,
        sku_codes: skus.map(s => s.sku_code).join('; '),
      }
    })
    const header = Object.keys(rows[0]).map(h => sanitizeCsvValue(h)).join(',')
    const csv = [header, ...rows.map(r => Object.values(r).map(v => sanitizeCsvValue(v)).join(','))].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `catalog-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6" data-testid="brand-catalog">
      {/* Context Path & Brand Selector Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Dữ liệu &amp; Báo cáo</span>
          <span>/</span>
          <span className="font-semibold text-foreground">Danh mục sản phẩm &amp; SKU</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">Thương hiệu:</span>
          <select
            aria-label="Select Brand Scope"
            className="h-8 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 text-xs font-semibold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={brandId}
            onChange={e => {
              setBrandId(e.target.value)
              setCampaignId('')
              setProductId('')
            }}
          >
            <option value="">Tất cả Brand</option>
            {brands.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Title & Action Bar */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
              Product &amp; SKU Catalog
            </h1>
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-[10px] font-bold tracking-wider text-blue-700">
              ENTERPRISE SAAS
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Quản lý tập trung sản phẩm, biến thể SKU, sơ đồ mapping sàn (Shopee, TikTok, Lazada) và pháp lý kịch bản live.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportFilteredCatalog} className="h-9 gap-1.5 text-xs font-semibold">
            <Download className="h-3.5 w-3.5" /> Xuất Danh Mục
          </Button>
          <Button variant="outline" size="sm" onClick={() => void load()} className="h-9 gap-1.5 text-xs font-semibold">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Làm mới dữ liệu
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setEditingProduct(false)
                setProductId('new')
                setForm({
                  ...form,
                  product_code: '',
                  name: '',
                  category: '',
                  description: '',
                  product_brand_ids: brandId ? [brandId] : [],
                  lifecycle_status: 'draft',
                })
              }}
              className="h-9 gap-1.5 bg-[#0f172a] text-xs font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" /> Thêm Sản Phẩm Mới
            </Button>
          )}
        </div>
      </header>

      {/* 4 Modern KPI Cards with REAL calculated counts */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Tổng sản phẩm hoạt động</span>
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-foreground">{totalActiveProducts}</div>
            <p className="text-[11px] font-medium text-emerald-600">
              {totalActiveProducts} / {totalProducts} sản phẩm hoạt động
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Biến thể SKU đã mapping</span>
              <Check className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-foreground">{mappedSkus} / {totalSkus}</div>
            <p className="text-[11px] font-medium text-emerald-600">
              {mappingPercentage}% khớp mã sàn TMĐT
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Chiến dịch livestream áp dụng</span>
              <Radio className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-foreground">{activeCampaignsCount} Chiến Dịch</div>
            <p className="truncate text-[11px] font-medium text-muted-foreground" title={activeCampaignsSummary}>
              {activeCampaignsSummary}
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/80 shadow-xs">
          <CardContent className="p-3.5 space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Tỷ lệ có ảnh / Key Visual</span>
              <ImageIcon className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-black text-foreground">{standardizedPercentage}%</div>
            <p className="text-[11px] font-medium text-blue-600">
              {productsWithMedia} / {totalProducts} sản phẩm có tài nguyên hình ảnh
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Control Bar: Search, Filters & View Toggle */}
      <section className="space-y-3 rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search products and SKUs"
              placeholder="Tìm sản phẩm, SKU, ca live..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="h-9 pl-9 pr-8 text-xs sm:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter category"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-slate-700"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">Ngành hàng: Tất cả</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <select
              aria-label="Filter platform"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-slate-700"
              value={platformId}
              onChange={e => setPlatformId(e.target.value)}
            >
              <option value="">Kênh bán: Tất cả sàn</option>
              {(catalog?.platforms ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              aria-label="Filter status"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-slate-700"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="">Trạng thái: Tất cả</option>
              <option value="active">Đang hoạt động (Active)</option>
              <option value="draft">Bản nháp (Draft)</option>
              <option value="inactive">Không hoạt động (Inactive)</option>
              <option value="archived">Lưu trữ (Archived)</option>
            </select>

            <select
              aria-label="Filter campaign"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-slate-700"
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
            >
              <option value="">Chiến dịch: Tất cả</option>
              {campaigns
                .filter(c => !brandId || c.brand_id === brandId)
                .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
              <select
                aria-label="Sort products"
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as SortField)}
              >
                <option value="name_asc">Tên (A-Z)</option>
                <option value="name_desc">Tên (Z-A)</option>
                <option value="code_asc">Mã sản phẩm</option>
                <option value="status">Trạng thái</option>
                <option value="version_desc">Phiên bản mới nhất</option>
              </select>
            </div>

            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2.5 gap-1.5 text-xs"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Lưới
              </Button>
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 px-2.5 gap-1.5 text-xs"
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                <List className="h-3.5 w-3.5" /> Bảng
              </Button>
            </div>
          </div>
        </div>

        {/* Active Filter Chips & Results Count */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground font-medium">Bộ lọc:</span>
            {brandId && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Thương hiệu: {brands.find(b => b.id === brandId)?.name}
                <button type="button" onClick={() => setBrandId('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {categoryFilter && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Ngành: {categoryFilter}
                <button type="button" onClick={() => setCategoryFilter('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {statusFilter && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Trạng thái: {statusFilter}
                <button type="button" onClick={() => setStatusFilter('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {platformId && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Sàn: {(catalog?.platforms ?? []).find(p => p.id === platformId)?.name}
                <button type="button" onClick={() => setPlatformId('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {campaignId && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Chiến dịch: {campaigns.find(c => c.id === campaignId)?.name}
                <button type="button" onClick={() => setCampaignId('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {query && (
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-medium">
                Từ khóa: &ldquo;{query}&rdquo;
                <button type="button" onClick={() => setQuery('')} className="hover:text-foreground"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(brandId || categoryFilter || statusFilter || platformId || campaignId || query) && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 px-1.5 text-xs text-blue-600 hover:text-blue-800">
                Xóa tất cả bộ lọc
              </Button>
            )}
          </div>
          <div className="text-muted-foreground font-medium">
            Hiển thị {filteredProducts.length} trên {products.length} sản phẩm
          </div>
        </div>
      </section>

      {/* Feedback Messages */}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            {error}
          </span>
          <Button variant="link" size="sm" onClick={() => void load()}>Thử lại</Button>
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          {notice}
        </p>
      )}

      {/* Main Dual-Pane Catalog Layout */}
      {!catalog ? (
        <div className="space-y-4 py-12 text-center" aria-live="polite">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">Đang tải danh mục sản phẩm và SKU...</p>
        </div>
      ) : !brands.length ? (
        <Card>
          <CardContent className="pt-6 text-center space-y-2">
            <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="font-semibold text-lg">Chưa được cấp quyền xem thương hiệu</h2>
            <p className="text-sm text-muted-foreground">
              Vui lòng liên hệ Admin để được phân quyền xem dữ liệu Brand tương ứng.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_390px] items-start">
          {/* Left Column: Product Grid / List */}
          <section aria-label="Product catalog" className="space-y-4">
            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <Package className="mx-auto h-10 w-10 text-muted-foreground/60" />
                <p className="mt-2 text-base font-semibold text-foreground">Không tìm thấy sản phẩm phù hợp</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Thử thay đổi từ khóa tìm kiếm hoặc bấm đặt lại bộ lọc để xem toàn bộ danh mục.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={clearAllFilters}>
                  Xóa bộ lọc
                </Button>
              </div>
            ) : viewMode === 'grid' ? (
              /* MODERN GRID VIEW (Matches approved candidate) */
              <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map(product => {
                  const isSelected = productId === product.id
                  const productBrandLinks = catalog.productBrands.filter(l => l.product_id === product.id)
                  const productBrand = brands.find(b => productBrandLinks.some(l => l.brand_id === b.id))
                  const skus = catalog.skus.filter(s => s.product_id === product.id)
                  const thumbnail = getProductImage(product.id)
                  const platforms = getProductPlatforms(product.id)

                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setProductId(product.id)
                        setSkuId('')
                        updateCatalogUrl(product.id)
                        setEditingProduct(false)
                      }}
                      className={`group relative flex flex-col justify-between rounded-xl border bg-card transition-all cursor-pointer overflow-hidden hover:border-blue-400 hover:shadow-md ${
                        isSelected ? 'border-blue-600 ring-2 ring-blue-500/30' : 'border-border/80'
                      }`}
                    >
                      {/* Top Packshot & Badges Area */}
                      <div className="relative h-32 w-full bg-slate-50 flex items-center justify-center p-3 overflow-hidden border-b border-border/50">
                        {/* Channel Badges on Top-Left */}
                        <div className="absolute top-2 left-2 z-10 flex flex-wrap gap-1">
                          {platforms.length > 0 ? (
                            platforms.map(p => {
                              const isShopee = p.name.toLowerCase().includes('shopee')
                              const isTiktok = p.name.toLowerCase().includes('tiktok')
                              const isLazada = p.name.toLowerCase().includes('lazada')
                              return (
                                <span
                                  key={p.id}
                                  className={`rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase text-white ${
                                    isShopee ? 'bg-[#ee4d2d]' : isTiktok ? 'bg-black' : isLazada ? 'bg-[#0f146d]' : 'bg-slate-700'
                                  }`}
                                >
                                  {p.name}
                                </span>
                              )
                            })
                          ) : (
                            <span className="rounded bg-slate-600 px-1.5 py-0.5 text-[8.5px] font-bold text-white">
                              Chưa gắn sàn
                            </span>
                          )}
                        </div>

                        {/* Selected Indicator Badge */}
                        {isSelected && (
                          <div className="absolute top-2 right-2 z-10 rounded bg-blue-600 px-2 py-0.5 text-[9px] font-extrabold text-white shadow-xs">
                            ĐANG CHỌN
                          </div>
                        )}

                        {/* Product Packshot Graphic */}
                        {thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbnail}
                            alt={product.name}
                            className="h-full w-full object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-24 w-20 flex-col items-center justify-center rounded-lg bg-gradient-to-b from-[#1e3a8a] to-[#1e40af] p-1.5 text-center text-white shadow-md">
                            <span className="text-[7.5px] font-bold uppercase tracking-wider opacity-80">
                              {productBrand?.name || 'ADA'}
                            </span>
                            <span className="my-1 line-clamp-2 text-[9px] font-extrabold leading-tight">
                              {product.product_code}
                            </span>
                            <span className="text-[7px] opacity-75">{skus.length} SKUs</span>
                          </div>
                        )}

                        {/* Brand Tag on Bottom-Left of packshot */}
                        <div className="absolute bottom-2 left-2 rounded bg-slate-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {productBrand?.name || 'BRAND'}
                        </div>
                      </div>

                      {/* Card Content Body */}
                      <div className="p-3.5 space-y-2 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span className="font-mono font-semibold text-slate-500">{product.product_code}</span>
                            <Badge variant={getProductStatusVariant(product.lifecycle_status)} className="text-[9.5px] font-bold uppercase px-1.5 py-0">
                              {product.lifecycle_status} (v{product.version})
                            </Badge>
                          </div>
                          <h3 className="mt-1 line-clamp-2 text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {product.name}
                          </h3>
                        </div>

                        <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                          <span className="text-[11px] font-medium text-slate-500">
                            {product.category || 'Chung'}
                          </span>
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-700">
                            {skus.length} Biến thể SKU
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/60 bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="py-2.5 px-3">Mã SP</th>
                      <th className="py-2.5 px-3">Tên sản phẩm</th>
                      <th className="py-2.5 px-3">Thương hiệu</th>
                      <th className="py-2.5 px-3">Danh mục</th>
                      <th className="py-2.5 px-3 text-center">SKUs</th>
                      <th className="py-2.5 px-3 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filteredProducts.map(product => {
                      const isSelected = productId === product.id
                      const productBrandLinks = catalog.productBrands.filter(l => l.product_id === product.id)
                      const productBrandNames = productBrandLinks.map(l => brands.find(b => b.id === l.brand_id)?.name).filter(Boolean)
                      const skus = catalog.skus.filter(s => s.product_id === product.id)

                      return (
                        <tr
                          key={product.id}
                          onClick={() => {
                            setProductId(product.id)
                            setSkuId('')
                            updateCatalogUrl(product.id)
                            setEditingProduct(false)
                          }}
                          className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                            isSelected ? 'bg-primary/5 font-medium' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono font-medium text-primary">
                            {product.product_code}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-foreground max-w-[200px] truncate">
                            {product.name}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {productBrandNames.join(', ') || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {product.category || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-center font-medium">
                            {skus.length}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <Badge variant={getProductStatusVariant(product.lifecycle_status)} className="text-[10px]">
                              {product.lifecycle_status}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Right Column: Sticky Product Detail Inspector (Matches approved candidate) */}
          <aside className="sticky top-20 space-y-4">
            {productId === 'new' && isAdmin && (
              <Card className="border-primary/40 shadow-sm">
                <CardHeader className="pb-3 bg-slate-900 text-white rounded-t-xl p-4">
                  <CardTitle className="text-sm font-bold">Tạo sản phẩm mới</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4">
                  <div className="grid gap-2">
                    <Input
                      aria-label="Product code"
                      placeholder="Mã sản phẩm (VD: PROD-ALN-001)"
                      value={form.product_code}
                      onChange={e => setForm({ ...form, product_code: e.target.value })}
                      className="text-xs"
                    />
                    <Input
                      aria-label="Product name"
                      placeholder="Tên sản phẩm đầy đủ"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      className="text-xs"
                    />
                    <Input
                      aria-label="Category"
                      placeholder="Ngành hàng / Danh mục"
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value })}
                      className="text-xs"
                    />
                    <Input
                      aria-label="Description"
                      placeholder="Mô tả nội bộ"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Thương hiệu liên kết *
                    <select
                      multiple
                      aria-label="Product brand associations"
                      className="mt-1 block min-h-20 w-full rounded-md border border-input bg-background p-2 text-xs"
                      value={form.product_brand_ids}
                      onChange={e => setForm({ ...form, product_brand_ids: Array.from(e.target.selectedOptions, opt => opt.value) })}
                    >
                      {brands.map(brand => (
                        <option key={brand.id} value={brand.id}>{brand.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button variant="outline" size="sm" onClick={() => setProductId('')}>Hủy</Button>
                    <Button
                      size="sm"
                      disabled={busy || !form.product_brand_ids.length || !form.product_code || !form.name}
                      onClick={async () => {
                        const result = await mutate({
                          action: 'product.create',
                          product_code: form.product_code,
                          name: form.name,
                          category: form.category || null,
                          description: form.description || null,
                          brand_ids: form.product_brand_ids,
                        })
                        if (result?.product?.id) setProductId(result.product.id)
                      }}
                      className="bg-[#0f172a] text-white hover:bg-slate-800"
                    >
                      Lưu sản phẩm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!selectedProduct && productId !== 'new' && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-card p-10 text-center text-muted-foreground shadow-xs">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="font-bold text-slate-900 text-sm">Chọn sản phẩm để xem chi tiết</h3>
                <p className="mt-1 text-xs max-w-xs text-slate-500">
                  Xem thông tin chi tiết, danh sách biến thể SKU, sơ đồ mapping sàn và hướng dẫn kịch bản live.
                </p>
              </div>
            )}

            {selectedProduct && (
              <div className="rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-140px)]">
                {/* Inspector Header (Dark Navy) */}
                <div className="bg-[#0f172a] text-white p-3.5 flex items-center justify-between shrink-0">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider">Chi Tiết Sản Phẩm</h2>
                    <p className="text-[10.5px] text-slate-300 font-mono mt-0.5">
                      MÃ: {selectedProduct.product_code} · v{selectedProduct.version}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setForm({
                          ...form,
                          name: selectedProduct.name,
                          product_code: selectedProduct.product_code,
                          category: selectedProduct.category ?? '',
                          description: selectedProduct.description ?? '',
                          product_brand_ids: catalog?.productBrands.filter(l => l.product_id === selectedProduct.id).map(l => l.brand_id) ?? [],
                          lifecycle_status: selectedProduct.lifecycle_status,
                        })
                        setEditingProduct(true)
                      }}
                      className="h-7 px-2 text-xs text-white hover:bg-slate-800"
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" /> Sửa
                    </Button>
                  )}
                </div>

                {/* Inspector Tabs */}
                <div className="flex border-b border-border/60 bg-slate-50/80 px-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveInspectorTab('skus')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      activeInspectorTab === 'skus' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Biến thể SKU ({productSkus.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveInspectorTab('platforms')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      activeInspectorTab === 'platforms' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Kênh &amp; Mapping
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveInspectorTab('claims')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      activeInspectorTab === 'claims' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pháp Lý &amp; Claims
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveInspectorTab('audit')}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      activeInspectorTab === 'audit' ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Audit Log
                  </button>
                </div>

                {/* Inspector Scrollable Body */}
                <div className="p-3.5 space-y-4 overflow-y-auto flex-1">
                  {/* Key Visual / Packshot Banner */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 flex items-center gap-3">
                    <div className="h-12 w-12 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-black shrink-0">
                      KV LIVE
                    </div>
                    <div className="min-w-0 flex-1 text-xs text-blue-950">
                      <p className="font-bold truncate">{selectedProduct.name}</p>
                      <p className="text-[10px] text-blue-800">
                        {selectedProductBrand?.name || 'Brand'} · Ngành: {selectedProduct.category || 'Chung'}
                      </p>
                    </div>
                  </div>

                  {/* TAB 1: BIẾN THỂ SKU */}
                  {activeInspectorTab === 'skus' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Danh Sách Mã Biến Thể ({productSkus.length})
                        </span>
                        {isAdmin && (
                          <Button size="sm" variant="outline" className="h-7 text-xs font-semibold" onClick={() => setSkuId('new')}>
                            <Plus className="mr-1 h-3 w-3" /> Thêm SKU
                          </Button>
                        )}
                      </div>

                      {selectedSku && isAdmin && (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs font-semibold text-foreground">Sửa thông tin SKU ({selectedSku.sku_code}):</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Input
                              aria-label="Edit SKU code"
                              value={form.sku_code}
                              onChange={e => setForm({ ...form, sku_code: e.target.value })}
                              placeholder="Mã SKU"
                            />
                            <Input
                              aria-label="Edit variant name"
                              value={form.variant_name}
                              onChange={e => setForm({ ...form, variant_name: e.target.value })}
                              placeholder="Tên biến thể"
                            />
                            <Input
                              aria-label="Edit size or package"
                              value={form.sku_size_or_package}
                              onChange={e => setForm({ ...form, sku_size_or_package: e.target.value })}
                              placeholder="Kích cỡ / Quy cách"
                            />
                            <Input
                              aria-label="Edit packaging type"
                              value={form.sku_packaging_type}
                              onChange={e => setForm({ ...form, sku_packaging_type: e.target.value })}
                              placeholder="Loại bao bì"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <select
                              aria-label="SKU status"
                              className="rounded-md border border-input bg-background p-1.5 text-xs"
                              value={form.sku_lifecycle_status}
                              onChange={e => setForm({ ...form, sku_lifecycle_status: e.target.value })}
                            >
                              {['active', 'inactive', 'archived'].map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void mutate({
                                action: 'sku.update',
                                id: selectedSku.id,
                                expected_version: selectedSku.version,
                                sku_code: form.sku_code,
                                variant_name: form.variant_name,
                                size_or_package: form.sku_size_or_package || null,
                                packaging_type: form.sku_packaging_type || null,
                                lifecycle_status: form.sku_lifecycle_status,
                              })}
                            >
                              Lưu thay đổi SKU
                            </Button>
                          </div>
                        </div>
                      )}
                      {productSkus.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 italic">Sản phẩm này chưa có biến thể SKU nào.</p>
                      ) : (
                        <div className="space-y-2">
                          {productSkus.map(sku => {
                            const isSkuSelected = skuId === sku.id
                            const platformLinks = (catalog?.skuPlatforms ?? []).filter(sp => sp.sku_id === sku.id)
                            return (
                              <div
                                key={sku.id}
                                onClick={() => {
                                  setSkuId(sku.id)
                                  updateCatalogUrl(selectedProduct.id, sku.id)
                                  setForm({
                                    ...form,
                                    sku_code: sku.sku_code,
                                    variant_name: sku.variant_name,
                                    sku_size_or_package: sku.size_or_package ?? '',
                                    sku_packaging_type: sku.packaging_type ?? '',
                                    sku_lifecycle_status: sku.lifecycle_status,
                                  })
                                }}
                                className={`rounded-lg border p-2.5 text-xs transition-all cursor-pointer ${
                                  isSkuSelected ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-500/40' : 'border-border/80 bg-background hover:border-slate-300'
                                }`}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span className="text-slate-900">{sku.variant_name}</span>
                                  <Badge variant={getProductStatusVariant(sku.lifecycle_status)} className="text-[9px] uppercase px-1 py-0">
                                    {sku.lifecycle_status}
                                  </Badge>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                  <span className="font-mono text-blue-700 font-semibold">{sku.sku_code}</span>
                                  <span>{sku.size_or_package || sku.packaging_type || 'Tiêu chuẩn'}</span>
                                </div>
                                {platformLinks.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1 border-t border-border/40 pt-1.5 text-[10px]">
                                    {platformLinks.map(pl => {
                                      const pName = (catalog?.platforms ?? []).find(p => p.id === pl.platform_id)?.name ?? pl.platform_id
                                      return (
                                        <span key={pl.platform_id} className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 font-medium">
                                          {pName}: {pl.external_sku_id}
                                        </span>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: KÊNH & MAPPING */}
                  {activeInspectorTab === 'platforms' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                          Sơ Đồ Mapping Sàn TMĐT
                        </span>
                      </div>

                      {productSkus.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 italic">Cần tạo SKU trước khi map với các sàn TMĐT.</p>
                      ) : (
                        <div className="space-y-2">
                          {productSkus.map(sku => {
                            const platformLinks = (catalog?.skuPlatforms ?? []).filter(sp => sp.sku_id === sku.id)
                            return (
                              <div key={sku.id} className="rounded-lg border border-border/80 bg-background p-2.5 text-xs space-y-1.5">
                                <div className="flex items-center justify-between font-semibold">
                                  <span className="text-slate-900">{sku.variant_name}</span>
                                  <span className="font-mono text-blue-700">{sku.sku_code}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {platformLinks.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {platformLinks.map(pl => (
                                        <Badge key={pl.platform_id} variant="secondary" className="text-[10px]">
                                          {(catalog?.platforms ?? []).find(p => p.id === pl.platform_id)?.name}: {pl.external_sku_id}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-amber-600 italic">Chưa map mã sàn nào.</p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Map Platform SKU Form (Admin) */}
                      {isAdmin && selectedSku && (
                        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2 text-xs">
                          <p className="font-bold text-slate-800">Map mã sàn cho SKU: {selectedSku.sku_code}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <select
                              aria-label="SKU platform"
                              className="rounded-md border border-input bg-background p-1.5 text-xs"
                              value={form.sku_platform_id}
                              onChange={e => setForm({ ...form, sku_platform_id: e.target.value })}
                            >
                              <option value="">Chọn nền tảng</option>
                              {(catalog?.platforms ?? []).filter(p => p.status === 'active').map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <Input
                              aria-label="External platform SKU"
                              placeholder="Mã SKU trên sàn (VD: 8931282)"
                              value={form.external_sku_id}
                              onChange={e => setForm({ ...form, external_sku_id: e.target.value })}
                              className="text-xs"
                            />
                          </div>
                          <Button
                            size="sm"
                            disabled={busy || !form.sku_platform_id || !form.external_sku_id}
                            onClick={() => void mutate({
                              action: 'sku.platform.set',
                              sku_id: selectedSku.id,
                              platform_id: form.sku_platform_id,
                              external_sku_id: form.external_sku_id,
                            })}
                            className="w-full text-xs font-semibold"
                          >
                            Gắn mã sàn
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: PHÁP LÝ & CLAIMS */}
                  {activeInspectorTab === 'claims' && (
                    <div className="space-y-3 text-xs">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Hướng Dẫn Kịch Bản (Claims &amp; Guardrails)
                      </div>

                      {/* Mandatory Claims Banner */}
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                          <span>Bắt Buộc Nhắc Đến (Mandatory Claims):</span>
                        </div>
                        <p className="text-amber-800 leading-relaxed">
                          {selectedProductBrand?.mandatory_claims?.length ? (
                            selectedProductBrand.mandatory_claims.join('. ')
                          ) : (
                            <span className="text-amber-800/70 italic">
                              Chưa có thông điệp bắt buộc được phê duyệt cho thương hiệu này.
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Restricted Claims Banner */}
                      <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-red-900">
                          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                          <span>Nghiêm Cấm Phát Ngôn (Restricted):</span>
                        </div>
                        <p className="text-red-800 leading-relaxed">
                          {selectedProductBrand?.restricted_claims?.length ? (
                            selectedProductBrand.restricted_claims.join('. ')
                          ) : (
                            <span className="text-red-800/70 italic">
                              Chưa ghi nhận thông điệp hạn chế hoặc cấm phát ngôn.
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Knowledge items */}
                      <div className="space-y-2 pt-2 border-t border-border/50">
                        <span className="font-bold text-slate-800">Kiến thức sản phẩm đã duyệt:</span>
                        {catalog?.knowledge.filter(k => k.product_id === selectedProduct.id).map(k => (
                          <div key={k.id} className="rounded border bg-muted/20 p-2 text-xs">
                            <span className="font-semibold text-slate-800">{k.knowledge_type} (v{k.version}):</span>{' '}
                            <span className="text-muted-foreground">{typeof k.content === 'string' ? k.content : JSON.stringify(k.content)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TAB 4: AUDIT LOG */}
                  {activeInspectorTab === 'audit' && (
                    <div className="space-y-2 text-xs">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                        Lịch Sử Thay Đổi Sản Phẩm
                      </span>
                      {catalog?.auditEvents.filter(e => e.record_id === selectedProduct.id).length ? (
                        <div className="divide-y divide-border/40">
                          {catalog.auditEvents.filter(e => e.record_id === selectedProduct.id).map(e => (
                            <div key={e.id} className="py-2 flex items-center justify-between">
                              <span>
                                <Badge variant="outline" className="text-[9px] uppercase">{e.action}</Badge>{' '}
                                <span className="font-mono">{e.table_name}</span>
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(e.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic py-2">Chưa có thay đổi nào được ghi nhận cho sản phẩm này.</p>
                      )}
                    </div>
                  )}

                  {/* Forms for Editing Product / New SKU */}
                  {isAdmin && editingProduct && (
                    <Card className="border-amber-300 bg-amber-50/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold">Chỉnh sửa sản phẩm</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        <Input
                          aria-label="Edit product code"
                          value={form.product_code}
                          onChange={e => setForm({ ...form, product_code: e.target.value })}
                          placeholder="Mã sản phẩm"
                        />
                        <Input
                          aria-label="Edit product name"
                          value={form.name}
                          onChange={e => setForm({ ...form, name: e.target.value })}
                          placeholder="Tên sản phẩm"
                        />
                        <Input
                          aria-label="Edit product category"
                          value={form.category}
                          onChange={e => setForm({ ...form, category: e.target.value })}
                          placeholder="Danh mục"
                        />
                        <select
                          aria-label="Product status"
                          className="w-full rounded-md border border-input bg-background p-2 text-xs"
                          value={form.lifecycle_status}
                          onChange={e => setForm({ ...form, lifecycle_status: e.target.value })}
                        >
                          {['draft', 'active', 'inactive', 'archived'].map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        <Input
                          aria-label="Edit product description"
                          value={form.description}
                          onChange={e => setForm({ ...form, description: e.target.value })}
                          placeholder="Mô tả nội bộ"
                        />
                        <div className="flex gap-2 justify-end pt-1">
                          <Button variant="outline" size="sm" onClick={() => setEditingProduct(false)}>Hủy</Button>
                          <Button
                            size="sm"
                            disabled={busy || !form.product_brand_ids.length}
                            onClick={async () => {
                              const result = await mutate({
                                action: 'product.update',
                                id: selectedProduct.id,
                                expected_version: selectedProduct.version,
                                product_code: form.product_code,
                                name: form.name,
                                lifecycle_status: form.lifecycle_status,
                                description: form.description || null,
                                category: form.category || null,
                                brand_ids: form.product_brand_ids,
                              })
                              if (result) setEditingProduct(false)
                            }}
                          >
                            Lưu thay đổi
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* New SKU Form */}
                  {skuId === 'new' && isAdmin && (
                    <Card className="border-blue-300 bg-blue-50/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-bold">Thêm biến thể SKU mới</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-xs">
                        <Input
                          aria-label="SKU code"
                          placeholder="Mã SKU (VD: SKU-SP001-50ML)"
                          value={form.sku_code}
                          onChange={e => setForm({ ...form, sku_code: e.target.value })}
                        />
                        <Input
                          aria-label="Variant name"
                          placeholder="Tên biến thể (VD: Hộp 800g)"
                          value={form.variant_name}
                          onChange={e => setForm({ ...form, variant_name: e.target.value })}
                        />
                        <div className="flex gap-2 justify-end pt-1">
                          <Button variant="outline" size="sm" onClick={() => setSkuId('')}>Hủy</Button>
                          <Button
                            size="sm"
                            disabled={busy || !form.sku_code || !form.variant_name}
                            onClick={async () => {
                              const result = await mutate({
                                action: 'sku.create',
                                product_id: selectedProduct.id,
                                sku_code: form.sku_code,
                                variant_name: form.variant_name,
                              })
                              if (result?.sku?.id) setSkuId(result.sku.id)
                            }}
                          >
                            Lưu SKU
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Resource Attachment (Admin) */}
                  {isAdmin && (
                    <div className="pt-2 border-t border-border/50 space-y-2 text-xs">
                      <span className="font-bold text-slate-800">Đính kèm tài nguyên / Hình ảnh:</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input
                          aria-label="Product resource ID"
                          placeholder="Mã STO-02"
                          value={form.resource_id}
                          onChange={e => setForm({ ...form, resource_id: e.target.value })}
                          className="text-xs"
                        />
                        <select
                          aria-label="Product resource relation type"
                          className="rounded-md border border-input bg-background p-1.5 text-xs"
                          value={form.relation_type}
                          onChange={e => setForm({ ...form, relation_type: e.target.value })}
                        >
                          {['image', 'kv', 'marketing_data', 'guideline', 'training', 'faq', 'document', 'other'].map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!form.resource_id || busy}
                          onClick={() => void mutate({
                            action: 'resource.attach',
                            resource_id: form.resource_id,
                            target_type: 'product',
                            target_id: selectedProduct.id,
                            relation_type: form.relation_type,
                          })}
                        >
                          Đính kèm
                        </Button>
                      </div>
                      <ResourceList
                        links={catalog?.resourceLinks.filter(l => l.product_id === selectedProduct.id) ?? []}
                        resources={catalog?.resources ?? []}
                      />
                    </div>
                  )}

                  {/* Campaign Attachment (Admin) */}
                  {isAdmin && (
                    <div className="pt-2 border-t border-border/50 space-y-2 text-xs">
                      <span className="font-bold text-slate-800">Tham gia chiến dịch:</span>
                      {selectedSku && (
                        <select
                          className="w-full rounded-md border border-input bg-background p-1.5 text-xs"
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              void mutate({
                                action: 'campaign.attach_sku',
                                campaign_id: e.target.value,
                                sku_id: selectedSku.id,
                              })
                            }
                          }}
                        >
                          <option value="">Chọn chiến dịch tham gia cho SKU: {selectedSku.sku_code}</option>
                          {campaigns.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Admin: Brand Read Access Scopes & Audit Events */}
      {isAdmin && catalog && (
        <div className="space-y-6 pt-6 border-t border-border">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Phân quyền xem Brand cho nhân sự</CardTitle>
              <p className="text-xs text-muted-foreground">
                Leader và Member chỉ xem được catalog của các Brand được phân quyền cụ thể.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Account to grant brand access"
                  className="rounded-md border border-input bg-background p-2 text-xs"
                  value={form.access_user_id}
                  onChange={e => setForm({ ...form, access_user_id: e.target.value })}
                >
                  <option value="">Chọn tài khoản nhân sự</option>
                  {(catalog.users ?? []).map(u => (
                    <option key={u.id} value={u.id}>{u.full_name} · {u.system_permission}</option>
                  ))}
                </select>
                <Input
                  aria-label="Brand access expiry"
                  type="datetime-local"
                  value={form.scope_expiry}
                  onChange={e => setForm({ ...form, scope_expiry: e.target.value })}
                  className="w-auto text-xs"
                />
                <Button
                  size="sm"
                  disabled={busy || !form.access_user_id || !brandId}
                  onClick={() => void mutate({
                    action: 'scope.set',
                    user_id: form.access_user_id,
                    brand_id: brandId,
                    active: true,
                    expires_at: form.scope_expiry ? new Date(form.scope_expiry).toISOString() : null,
                  })}
                >
                  Cấp quyền Brand đang chọn
                </Button>
              </div>

              <div className="divide-y divide-border/40 text-xs">
                {catalog.scopes
                  .filter(scope => !brandId || scope.brand_id === brandId)
                  .map(scope => (
                    <div key={scope.grant_id ?? scope.user_id + scope.brand_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        <b>{catalog.users.find(u => u.id === scope.user_id)?.full_name ?? scope.user_id}</b> · {brands.find(b => b.id === scope.brand_id)?.name} ·{' '}
                        {scope.revoked_at ? (
                          <span className="text-red-600">Đã thu hồi</span>
                        ) : scope.expires_at && new Date(scope.expires_at) <= new Date() ? (
                          <span className="text-amber-600">Hết hạn</span>
                        ) : scope.expires_at ? (
                          <span>Hết hạn: {new Date(scope.expires_at).toLocaleDateString()}</span>
                        ) : (
                          <span className="text-emerald-600">Đang hoạt động</span>
                        )}
                      </span>
                      {!scope.revoked_at && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:bg-red-50"
                          disabled={busy}
                          onClick={() => void mutate({ action: 'scope.set', user_id: scope.user_id, brand_id: scope.brand_id, active: false })}
                        >
                          Thu hồi
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Scheme and Knowledge Creation */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Tạo cơ chế chiến dịch (Scheme)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Input
                  aria-label="Scheme name"
                  placeholder="Tên cơ chế"
                  value={form.scheme_name}
                  onChange={e => setForm({ ...form, scheme_name: e.target.value })}
                />
                <Input
                  aria-label="Scheme terms"
                  placeholder="Điều khoản / guideline / script"
                  value={form.terms}
                  onChange={e => setForm({ ...form, terms: e.target.value })}
                />
                <Input
                  aria-label="Scheme source URL"
                  placeholder="Link tài liệu nguồn"
                  value={form.scheme_source_url}
                  onChange={e => setForm({ ...form, scheme_source_url: e.target.value })}
                />
                {campaigns.length > 0 && (
                  <Button
                    size="sm"
                    disabled={busy || !form.scheme_name || !form.terms}
                    onClick={() => void mutate({
                      action: 'scheme.create',
                      campaign_id: campaignId || campaigns[0].id,
                      sku_id: null,
                      scheme_name: form.scheme_name,
                      terms: form.terms,
                      source_url: form.scheme_source_url || null,
                      valid_from: new Date().toISOString(),
                      valid_to: new Date(Date.now() + 30 * 86400000).toISOString(),
                    })}
                  >
                    Lưu cơ chế bản nháp
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Đề xuất kiến thức Marketing sản phẩm</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <Input
                  aria-label="Knowledge content"
                  placeholder="Nội dung tính năng / công dụng"
                  value={form.knowledge}
                  onChange={e => setForm({ ...form, knowledge: e.target.value })}
                />
                <Input
                  aria-label="Knowledge source"
                  placeholder="Nguồn tham chiếu"
                  value={form.source_reference}
                  onChange={e => setForm({ ...form, source_reference: e.target.value })}
                />
                {selectedProduct && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !form.knowledge || !form.source_reference}
                    onClick={() => void mutate({
                      action: 'knowledge.create',
                      product_id: selectedProduct.id,
                      knowledge_type: 'feature',
                      content: form.knowledge,
                      source_reference: form.source_reference,
                      effective_from: new Date().toISOString().slice(0, 10),
                    })}
                  >
                    Gửi duyệt kiến thức
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Catalog Audit Events */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Lịch sử thay đổi (Audit log)</CardTitle>
            </CardHeader>
            <CardContent>
              {catalog.auditEvents.length ? (
                <div className="divide-y divide-border/40 text-xs">
                  {catalog.auditEvents.slice(0, 20).map(event => (
                    <div key={event.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-mono font-medium text-foreground">{event.table_name}</span> ·{' '}
                        <Badge variant="outline" className="text-[10px] uppercase">{event.action}</Badge> · {event.record_id}
                      </span>
                      <span className="text-muted-foreground">
                        {event.actor_id ?? 'unknown actor'} · {new Date(event.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa có bản ghi thay đổi nào trong danh mục.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function ResourceList({ links, resources }: { links: ResourceLinkRow[]; resources: ResourceRow[] }) {
  if (!links.length) {
    return <p className="text-xs text-muted-foreground italic">Chưa có tài nguyên nào được đính kèm.</p>
  }
  return (
    <ul className="space-y-1.5 pt-1">
      {links.map(link => {
        const resource = resources.find(item => item.id === link.resource_id)
        const isImage = resource?.resource_type === 'image' || resource?.resource_type === 'kv'
        return (
          <li key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              {isImage ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              {resource ? (
                <a
                  href={resource.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline truncate flex items-center gap-1"
                >
                  {resource.title}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span className="text-muted-foreground">Tài nguyên không khả dụng</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" className="text-[10px]">{link.relation_type}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {resource?.provider ?? 'hidden'} · {resource?.verification_status ?? 'unverified'}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
