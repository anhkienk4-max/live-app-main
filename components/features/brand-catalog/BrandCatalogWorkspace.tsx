'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  ChevronRight,
  ExternalLink,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List,
  Package,
  Plus,
  RefreshCw,
  Search,
  Tag,
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
  const [campaignId, setCampaignId] = React.useState(() => searchParams.get('campaign_id') ?? '')
  const [platformId, setPlatformId] = React.useState('')
  const [kind, setKind] = React.useState('all')
  const [sortBy, setSortBy] = React.useState<SortField>('name_asc')
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid')

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

  // Filter products
  const filteredProducts = products.filter(product => {
    if (brandId && !scopedProductIds.has(product.id)) return false
    if (categoryFilter && product.category !== categoryFilter) return false
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

  const clearAllFilters = () => {
    setBrandId('')
    setCategoryFilter('')
    setCampaignId('')
    setPlatformId('')
    setKind('all')
    setQuery('')
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6" data-testid="brand-catalog">
      {/* Header Banner */}
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Package className="h-4 w-4 text-primary" />
            <span>Brand / Campaign workspace</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Product &amp; SKU catalog
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Danh mục sản phẩm, biến thể SKU và tài nguyên truyền thông được phân quyền theo Brand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
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
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" /> Thêm sản phẩm
            </Button>
          )}
        </div>
      </header>

      {/* Control Bar: Search, Filters & View Toggle */}
      <section className="space-y-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search products and SKUs"
              placeholder="Tìm theo tên sản phẩm, mã SP, mã SKU..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 pr-8"
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
                <List className="h-3.5 w-3.5" /> Danh sách
              </Button>
            </div>

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

            {(brandId || categoryFilter || campaignId || platformId || kind !== 'all' || query) && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                <X className="mr-1 h-3.5 w-3.5" /> Đặt lại
              </Button>
            )}
          </div>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 pt-2 border-t border-border/40">
          <label className="text-xs font-medium text-muted-foreground">
            Thương hiệu
            <select
              aria-label="Filter brand"
              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Danh mục SP
            <select
              aria-label="Filter category"
              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="">Tất cả danh mục</option>
              {availableCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Chiến dịch
            <select
              aria-label="Filter campaign"
              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={campaignId}
              onChange={e => setCampaignId(e.target.value)}
            >
              <option value="">Tất cả chiến dịch</option>
              {campaigns
                .filter(c => !brandId || c.brand_id === brandId)
                .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground">
            Nền tảng
            <select
              aria-label="Filter platform"
              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={platformId}
              onChange={e => setPlatformId(e.target.value)}
            >
              <option value="">Tất cả nền tảng</option>
              {(catalog?.platforms ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>

          <label className="text-xs font-medium text-muted-foreground col-span-2 sm:col-span-1">
            Loại tài nguyên
            <select
              aria-label="Filter resource type"
              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={kind}
              onChange={e => setKind(e.target.value)}
            >
              <option value="all">Tất cả tài nguyên</option>
              {['image', 'kv', 'livecut', 'marketing_asset', 'campaign_scheme', 'script', 'guideline', 'product_document', 'sku_document', 'google_sheet', 'report_data', 'contract', 'acceptance', 'other'].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Selected Brand Profile banner */}
      {catalog && brandId && brands.find(b => b.id === brandId) && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                {brands.find(b => b.id === brandId)?.name} · Thông tin thương hiệu
              </h2>
              <Badge variant="outline" className="text-xs">{brands.find(b => b.id === brandId)?.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {brands.find(b => b.id === brandId)?.description || 'Chưa có mô tả thương hiệu.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg border bg-background/80 p-2.5">
                <b className="text-foreground">Thông điệp bắt buộc (Mandatory claims):</b>
                <p className="mt-1 text-muted-foreground">
                  {(brands.find(b => b.id === brandId)?.mandatory_claims ?? []).join(', ') || '—'}
                </p>
              </div>
              <div className="rounded-lg border bg-background/80 p-2.5">
                <b className="text-foreground">Thông điệp hạn chế (Restricted claims):</b>
                <p className="mt-1 text-muted-foreground">
                  {(brands.find(b => b.id === brandId)?.restricted_claims ?? []).join(', ') || '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Main Catalog Body */}
      {!catalog ? (
        <div className="space-y-4 py-8 text-center" aria-live="polite">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Đang tải danh mục sản phẩm được cấp quyền...</p>
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)]">
          {/* Products List / Grid Column */}
          <section aria-label="Product catalog" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Sản phẩm ({filteredProducts.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                {brands.length} thương hiệu có quyền truy cập
              </span>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Package className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-2 text-sm font-medium text-foreground">Không có sản phẩm phù hợp</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc để xem các sản phẩm khác.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={clearAllFilters}>
                  Xóa bộ lọc
                </Button>
              </div>
            ) : viewMode === 'grid' ? (
              /* GRID VIEW */
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredProducts.map(product => {
                  const isSelected = productId === product.id
                  const productBrandLinks = catalog.productBrands.filter(l => l.product_id === product.id)
                  const productBrandNames = productBrandLinks.map(l => brands.find(b => b.id === l.brand_id)?.name).filter(Boolean)
                  const skus = catalog.skus.filter(s => s.product_id === product.id)
                  const thumbnail = getProductImage(product.id)

                  return (
                    <div
                      key={product.id}
                      onClick={() => {
                        setProductId(product.id)
                        setSkuId('')
                        updateCatalogUrl(product.id)
                        setEditingProduct(false)
                      }}
                      className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer hover:border-primary/50 hover:shadow-sm ${
                        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'bg-card border-border/80'
                      }`}
                    >
                      <div>
                        {/* Top info: Thumbnail + Badges */}
                        <div className="flex items-start gap-3">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/30 flex items-center justify-center">
                            {thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumbnail}
                                alt={product.name}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-xs font-semibold text-muted-foreground">
                                {product.product_code}
                              </span>
                              <Badge variant={getProductStatusVariant(product.lifecycle_status)} className="text-[10px] uppercase">
                                {product.lifecycle_status}
                              </Badge>
                            </div>
                            <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {product.name}
                            </h3>
                          </div>
                        </div>

                        {/* Middle info: Brands & Category */}
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {productBrandNames.map(bName => (
                            <Badge key={bName} variant="secondary" className="text-[10px] font-medium">
                              {bName}
                            </Badge>
                          ))}
                          {product.category && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Tag className="h-3 w-3" /> {product.category}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Footer: SKUs count */}
                      <div className="mt-3.5 flex items-center justify-between border-t border-border/40 pt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium">
                          <Layers className="h-3.5 w-3.5 text-primary" /> {skus.length} biến thể SKU
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* LIST VIEW */
              <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border/60 bg-muted/40 font-medium text-muted-foreground">
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
                          <td className="py-2.5 px-3 font-medium text-foreground max-w-[180px] truncate">
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

          {/* Details / Admin Forms Column */}
          <section className="space-y-5">
            {productId === 'new' && isAdmin && (
              <Card className="border-primary/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Tạo sản phẩm mới</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      aria-label="Product code"
                      placeholder="Mã sản phẩm (VD: SP001)"
                      value={form.product_code}
                      onChange={e => setForm({ ...form, product_code: e.target.value })}
                    />
                    <Input
                      aria-label="Product name"
                      placeholder="Tên sản phẩm"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                    />
                    <Input
                      aria-label="Category"
                      placeholder="Danh mục (VD: Skincare, Chăm sóc tóc)"
                      value={form.category}
                      onChange={e => setForm({ ...form, category: e.target.value })}
                    />
                    <Input
                      aria-label="Description"
                      placeholder="Mô tả nội bộ"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Thương hiệu liên kết *
                    <select
                      multiple
                      aria-label="Product brand associations"
                      className="mt-1 block min-h-24 w-full rounded-md border border-input bg-background p-2 text-xs"
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
                    >
                      Lưu sản phẩm
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {!selectedProduct && productId !== 'new' && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 p-12 text-center text-muted-foreground">
                <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <h3 className="font-semibold text-foreground">Chọn một sản phẩm để xem chi tiết</h3>
                <p className="mt-1 text-xs max-w-xs">
                  Xem thông tin chi tiết, các biến thể SKU, tài nguyên hình ảnh và các chiến dịch liên quan.
                </p>
              </div>
            )}

            {selectedProduct && (
              <>
                {/* Product Detail Card */}
                <Card>
                  <CardContent className="space-y-4 pt-5">
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-primary">{selectedProduct.product_code}</span>
                          <Badge variant={getProductStatusVariant(selectedProduct.lifecycle_status)} className="text-[10px]">
                            {selectedProduct.lifecycle_status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">v{selectedProduct.version}</span>
                        </div>
                        <h2 className="mt-1 text-xl font-bold text-foreground">{selectedProduct.name}</h2>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="outline"
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
                        >
                          Sửa thông tin
                        </Button>
                      )}
                    </div>

                    {/* Metadata attributes */}
                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Thương hiệu:</span>{' '}
                        <span className="font-medium text-foreground">
                          {catalog?.productBrands
                            .filter(l => l.product_id === selectedProduct.id)
                            .map(l => brands.find(b => b.id === l.brand_id)?.name)
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Danh mục:</span>{' '}
                        <span className="font-medium text-foreground">{selectedProduct.category || '—'}</span>
                      </div>
                    </div>

                    {/* Description */}
                    <div>
                      <p className="text-xs text-muted-foreground font-medium">Mô tả sản phẩm:</p>
                      <p className="mt-1 text-sm text-foreground bg-muted/20 rounded-lg p-2.5 border border-border/40">
                        {selectedProduct.description || 'Chưa có mô tả nội bộ cho sản phẩm này.'}
                      </p>
                    </div>

                    {/* Linked Resources Gallery */}
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <ImageIcon className="h-3.5 w-3.5" /> Tài nguyên &amp; Hình ảnh
                        </h4>
                      </div>
                      {isAdmin && (
                        <div className="grid gap-2 sm:grid-cols-3 pt-1">
                          <Input
                            aria-label="Product resource ID"
                            placeholder="Mã tài nguyên STO-02"
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
                      )}
                      <ResourceList
                        links={catalog?.resourceLinks.filter(l => l.product_id === selectedProduct.id) ?? []}
                        resources={catalog?.resources ?? []}
                      />
                    </div>

                    {/* SKUs / Variants Section */}
                    <div className="space-y-2 pt-2 border-t border-border/60">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5" /> Biến thể / SKU ({productSkus.length})
                        </h4>
                        {isAdmin && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSkuId('new')}>
                            <Plus className="mr-1 h-3 w-3" /> Thêm SKU
                          </Button>
                        )}
                      </div>

                      {productSkus.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">Sản phẩm này chưa có biến thể SKU nào.</p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {productSkus.map(sku => (
                            <button
                              key={sku.id}
                              className={`rounded-lg border p-2.5 text-left text-xs transition-colors hover:border-primary/50 ${
                                skuId === sku.id ? 'border-primary bg-primary/5 ring-1 ring-primary/40' : 'border-border/80 bg-background'
                              }`}
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
                            >
                              <div className="flex items-center justify-between">
                                <b className="font-mono text-primary">{sku.sku_code}</b>
                                <Badge variant={getProductStatusVariant(sku.lifecycle_status)} className="text-[9px]">
                                  {sku.lifecycle_status}
                                </Badge>
                              </div>
                              <p className="mt-1 font-medium text-foreground">{sku.variant_name}</p>
                              <p className="text-[11px] text-muted-foreground">
                                Quy cách: {sku.size_or_package || '—'} · {sku.packaging_type || '—'}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Edit Product Form */}
                {isAdmin && editingProduct && (
                  <Card className="border-amber-300/80 bg-amber-50/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Chỉnh sửa sản phẩm: {selectedProduct.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
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
                          className="rounded-md border border-input bg-background p-2 text-xs"
                          value={form.lifecycle_status}
                          onChange={e => setForm({ ...form, lifecycle_status: e.target.value })}
                        >
                          {['draft', 'active', 'inactive', 'archived'].map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                      </div>
                      <Input
                        aria-label="Edit product description"
                        value={form.description}
                        onChange={e => setForm({ ...form, description: e.target.value })}
                        placeholder="Mô tả nội bộ"
                      />
                      <label className="block text-xs font-medium text-muted-foreground">
                        Thương hiệu liên kết
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
                  <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Thêm biến thể SKU mới</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          aria-label="SKU code"
                          placeholder="Mã SKU (VD: SKU-SP001-50ML)"
                          value={form.sku_code}
                          onChange={e => setForm({ ...form, sku_code: e.target.value })}
                        />
                        <Input
                          aria-label="Variant name"
                          placeholder="Tên biến thể (VD: Chai 50ml)"
                          value={form.variant_name}
                          onChange={e => setForm({ ...form, variant_name: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2 justify-end pt-2">
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
                          Lưu biến thể SKU
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Selected SKU Details */}
                {selectedSku && (
                  <Card className="border-border">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold">
                          Chi tiết SKU: {selectedSku.sku_code}
                        </CardTitle>
                        <Badge variant={getProductStatusVariant(selectedSku.lifecycle_status)} className="text-[10px]">
                          {selectedSku.lifecycle_status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        {selectedSku.sku_code} · {selectedSku.variant_name} · Quy cách: {selectedSku.size_or_package ?? '—'} · Loại bao bì: {selectedSku.packaging_type ?? '—'}
                      </p>

                      {isAdmin && (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs font-semibold text-foreground">Sửa thông tin SKU:</p>
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

                      {/* External Platform SKU mapping */}
                      <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                        <p className="font-medium text-foreground">Mã SKU trên các sàn TMĐT:</p>
                        <p className="text-muted-foreground">
                          {(catalog?.skuPlatforms ?? [])
                            .filter(row => row.sku_id === selectedSku.id)
                            .map(row => (catalog?.platforms ?? []).find(p => p.id === row.platform_id)?.name + ' (' + row.external_sku_id + ')')
                            .join(', ') || 'Chưa liên kết sàn nào.'}
                        </p>
                        {isAdmin && (
                          <div className="grid gap-2 sm:grid-cols-3 pt-1">
                            <select
                              aria-label="SKU platform"
                              className="rounded-md border border-input bg-background p-1.5 text-xs"
                              value={form.sku_platform_id}
                              onChange={e => setForm({ ...form, sku_platform_id: e.target.value })}
                            >
                              <option value="">Chọn nền tảng</option>
                              {(catalog?.platforms ?? [])
                                .filter(p => p.status === 'active')
                                .map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <Input
                              aria-label="External platform SKU"
                              placeholder="Mã SKU trên sàn"
                              value={form.external_sku_id}
                              onChange={e => setForm({ ...form, external_sku_id: e.target.value })}
                              className="text-xs"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || !form.sku_platform_id || !form.external_sku_id}
                              onClick={() => void mutate({
                                action: 'sku.platform.set',
                                sku_id: selectedSku.id,
                                platform_id: form.sku_platform_id,
                                external_sku_id: form.external_sku_id,
                              })}
                            >
                              Gắn mã sàn
                            </Button>
                          </div>
                        )}
                      </div>

                      {/* Attach to Campaign & SKU Resources */}
                      {isAdmin && (
                        <div className="space-y-2 pt-2 border-t border-border/40 text-xs">
                          <label className="block text-muted-foreground font-medium">
                            Gắn vào chiến dịch:
                            <select
                              className="mt-1 block w-full rounded-md border border-input bg-background p-1.5 text-xs"
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
                              <option value="">Chọn chiến dịch tham gia</option>
                              {campaigns.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </label>
                          <div className="grid gap-2 sm:grid-cols-3 pt-1">
                            <Input
                              aria-label="Resource ID"
                              placeholder="Mã tài nguyên STO-02"
                              value={form.resource_id}
                              onChange={e => setForm({ ...form, resource_id: e.target.value })}
                              className="text-xs"
                            />
                            <select
                              aria-label="Resource relation type"
                              className="rounded-md border border-input bg-background p-1.5 text-xs"
                              value={form.relation_type}
                              onChange={e => setForm({ ...form, relation_type: e.target.value })}
                            >
                              {['image', 'kv', 'guideline', 'script', 'training', 'faq', 'scheme', 'marketing_data', 'document', 'other'].map(v => (
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
                                target_type: 'sku',
                                target_id: selectedSku.id,
                                relation_type: form.relation_type,
                              })}
                            >
                              Đính kèm tài nguyên
                            </Button>
                          </div>
                        </div>
                      )}
                      <ResourceList
                        links={catalog?.resourceLinks.filter(l => l.sku_id === selectedSku.id) ?? []}
                        resources={catalog?.resources ?? []}
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Campaigns and Knowledge */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Chiến dịch &amp; Thông tin Marketing đã duyệt</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {campaigns
                      .filter(campaign => !brandId || campaign.brand_id === brandId)
                      .map(campaign => (
                        <div key={campaign.id} className="rounded-lg border border-border/80 p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-foreground">{campaign.name}</p>
                            <Badge variant="outline" className="text-[10px]">{campaign.status}</Badge>
                          </div>
                          <p className="text-muted-foreground">
                            Thời gian: {campaign.start_date} – {campaign.end_date}
                          </p>
                          <p className="text-muted-foreground">
                            Sản phẩm tham gia:{' '}
                            {catalog?.campaignSkus
                              .filter(l => l.campaign_id === campaign.id)
                              .map(l => products.find(p => p.id === catalog.skus.find(s => s.id === l.sku_id)?.product_id)?.name)
                              .filter(Boolean)
                              .join(', ') || 'Chưa có'}
                          </p>
                          <p className="text-muted-foreground italic">{campaign.notes || 'Không có ghi chú chiến dịch.'}</p>

                          {isAdmin && (
                            <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-2.5">
                              <p className="font-medium text-foreground">Tạo cơ chế / scheme chiến dịch:</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  aria-label={'Scheme name ' + campaign.name}
                                  placeholder="Tên cơ chế"
                                  value={form.scheme_name}
                                  onChange={e => setForm({ ...form, scheme_name: e.target.value })}
                                />
                                <Input
                                  aria-label={'Scheme terms ' + campaign.name}
                                  placeholder="Điều khoản / guideline / script"
                                  value={form.terms}
                                  onChange={e => setForm({ ...form, terms: e.target.value })}
                                />
                                <Input
                                  aria-label={'Scheme source URL ' + campaign.name}
                                  placeholder="Link tài liệu nguồn"
                                  value={form.scheme_source_url}
                                  onChange={e => setForm({ ...form, scheme_source_url: e.target.value })}
                                />
                                <Button
                                  size="sm"
                                  disabled={busy || !form.scheme_name || !form.terms}
                                  onClick={() => void mutate({
                                    action: 'scheme.create',
                                    campaign_id: campaign.id,
                                    sku_id: null,
                                    scheme_name: form.scheme_name,
                                    terms: form.terms,
                                    source_url: form.scheme_source_url || null,
                                    valid_from: new Date(campaign.start_date + 'T00:00:00.000Z').toISOString(),
                                    valid_to: new Date(campaign.end_date + 'T23:59:59.000Z').toISOString(),
                                  })}
                                >
                                  Lưu cơ chế bản nháp
                                </Button>
                              </div>

                              <p className="font-medium text-foreground pt-1">Đề xuất kiến thức marketing sản phẩm:</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <Input
                                  aria-label="Knowledge content"
                                  placeholder="Nội dung kiến thức / tính năng"
                                  value={form.knowledge}
                                  onChange={e => setForm({ ...form, knowledge: e.target.value })}
                                />
                                <Input
                                  aria-label="Knowledge source"
                                  placeholder="Nguồn tham chiếu"
                                  value={form.source_reference}
                                  onChange={e => setForm({ ...form, source_reference: e.target.value })}
                                />
                              </div>
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
                            </div>
                          )}

                          {catalog?.schemes.filter(row => row.campaign_id === campaign.id).map(row => (
                            <div key={row.id} className="rounded-md border bg-background p-2">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">{row.scheme_name}</span>
                                <Badge variant={row.status === 'approved' ? 'success' : 'outline'} className="text-[10px]">
                                  {row.status}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground mt-1">{row.terms}</p>
                              {isAdmin && row.status === 'draft' && row.created_by !== currentUser?.id && (
                                <div className="mt-2 flex gap-2">
                                  <Button size="sm" className="h-7 text-xs" onClick={() => void mutate({ action: 'scheme.review', id: row.id, decision: 'approved' })}>
                                    Duyệt
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void mutate({ action: 'scheme.review', id: row.id, decision: 'rejected' })}>
                                    Từ chối
                                  </Button>
                                </div>
                              )}
                            </div>
                          ))}

                          <ResourceList
                            links={catalog?.resourceLinks.filter(l => l.campaign_id === campaign.id) ?? []}
                            resources={catalog?.resources ?? []}
                          />
                        </div>
                      ))}

                    {/* Knowledge items for product */}
                    {catalog?.knowledge.filter(row => row.product_id === selectedProduct.id).map(row => (
                      <div key={row.id} className="rounded-lg border bg-muted/10 p-2.5 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{row.knowledge_type} · v{row.version}</span>
                          <Badge
                            variant={(catalog?.knowledgeApprovals ?? []).find(item => item.knowledge_version_id === row.id)?.decision === 'approved' ? 'success' : 'outline'}
                            className="text-[10px]"
                          >
                            {(catalog?.knowledgeApprovals ?? []).find(item => item.knowledge_version_id === row.id)?.decision === 'approved' ? 'approved' : row.status}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{typeof row.content === 'string' ? row.content : JSON.stringify(row.content)}</p>
                        {isAdmin && row.status === 'pending_review' && row.created_by !== currentUser?.id && !(catalog?.knowledgeApprovals ?? []).some(item => item.knowledge_version_id === row.id) && (
                          <div className="mt-2 space-y-1.5">
                            <Input
                              aria-label="Review reason"
                              placeholder="Lý do duyệt / từ chối / yêu cầu chỉnh sửa"
                              value={form.review_reason}
                              onChange={e => setForm({ ...form, review_reason: e.target.value })}
                              className="text-xs"
                            />
                            <div className="flex flex-wrap gap-1.5">
                              <Button size="sm" className="h-7 text-xs" onClick={() => void mutate({ action: 'knowledge.review', knowledge_version_id: row.id, decision: 'approved', reason: form.review_reason || 'Source reviewed' })}>
                                Duyệt kiến thức
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!form.review_reason} onClick={() => void mutate({ action: 'knowledge.review', knowledge_version_id: row.id, decision: 'rejected', reason: form.review_reason })}>
                                Từ chối
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!form.review_reason} onClick={() => void mutate({ action: 'knowledge.review', knowledge_version_id: row.id, decision: 'changes_requested', reason: form.review_reason })}>
                                Yêu cầu sửa
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}
          </section>
        </div>
      )}

      {/* Brand Read Access & Audit History (Admin Only) */}
      {isAdmin && catalog && (
        <div className="space-y-6 pt-6 border-t border-border">
          {/* Brand Read Access Management */}
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

          {/* Catalog Audit Events */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Lịch sử thay đổi (Audit log)</CardTitle>
            </CardHeader>
            <CardContent>
              {catalog.auditEvents.length ? (
                <div className="divide-y divide-border/40 text-xs">
                  {catalog.auditEvents.slice(0, 30).map(event => (
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
