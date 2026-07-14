import * as React from 'react'
import { useLocation } from 'wouter'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { shiftService, userService, brandService, campaignService } from '@/lib/services/dataService'
import { Search, Calendar, User, Briefcase, Tag } from 'lucide-react'
import { format } from 'date-fns'

interface SearchResult {
  id: string
  type: 'shift' | 'staff' | 'brand' | 'campaign'
  title: string
  subtitle: string
  url: string
  icon: React.ReactNode
  badge?: string
}

export function GlobalSearch() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [, navigate] = useLocation()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  React.useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const searchTimeout = setTimeout(async () => {
      setLoading(true)
      try {
        const [shifts, users, brands, campaigns] = await Promise.all([
          shiftService.getAll(),
          userService.search(query),
          brandService.getAll(),
          campaignService.getAll(),
        ])

        const searchResults: SearchResult[] = []
        const lowerQuery = query.toLowerCase()

        shifts
          .filter(s => {
            const brand = brands.find(b => b.id === s.brand_id)
            return brand?.name.toLowerCase().includes(lowerQuery) ||
              s.product_notes?.toLowerCase().includes(lowerQuery)
          })
          .slice(0, 5)
          .forEach(shift => {
            const brand = brands.find(b => b.id === shift.brand_id)
            searchResults.push({
              id: shift.id,
              type: 'shift',
              title: `${brand?.name || 'Unknown'} - ${format(new Date(shift.date), 'MMM d')}`,
              subtitle: `${shift.start_time} - ${shift.end_time}`,
              url: '/calendar',
              icon: <Calendar className="h-4 w-4" />,
              badge: shift.status,
            })
          })

        users.slice(0, 5).forEach(user => {
          searchResults.push({
            id: user.id,
            type: 'staff',
            title: user.full_name,
            subtitle: user.email,
            url: '/staff',
            icon: <User className="h-4 w-4" />,
            badge: user.role,
          })
        })

        brands.filter(b => b.name.toLowerCase().includes(lowerQuery)).slice(0, 3).forEach(brand => {
          searchResults.push({
            id: brand.id,
            type: 'brand',
            title: brand.name,
            subtitle: 'Brand',
            url: '/brands',
            icon: <Briefcase className="h-4 w-4" />,
          })
        })

        campaigns.filter(c => c.name.toLowerCase().includes(lowerQuery)).slice(0, 3).forEach(campaign => {
          searchResults.push({
            id: campaign.id,
            type: 'campaign',
            title: campaign.name,
            subtitle: `${format(new Date(campaign.start_date), 'MMM d')} - ${format(new Date(campaign.end_date), 'MMM d')}`,
            url: '/campaigns',
            icon: <Tag className="h-4 w-4" />,
          })
        })

        setResults(searchResults)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    navigate(result.url)
  }

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-9 md:w-64 md:justify-start md:px-3 md:py-2 text-sm"
        onClick={() => setOpen(true)}
        data-testid="search-btn"
      >
        <Search className="h-4 w-4 md:mr-2" />
        <span className="hidden md:inline-flex text-gray-500">Search... ⌘K</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 max-w-lg">
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-gray-500 mr-2" />
            <Input
              placeholder="Search shifts, staff, brands..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 focus-visible:ring-0 h-12"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-8 text-gray-500 text-sm">Searching...</div>
            ) : results.length === 0 && query ? (
              <div className="text-center py-8">
                <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600 text-sm">No results for &quot;{query}&quot;</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <p className="mb-2">Start typing to search</p>
                <p className="text-xs">Search shifts, staff, brands, or campaigns</p>
              </div>
            ) : (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded-lg">
                      {result.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{result.title}</div>
                      <div className="text-xs text-gray-600 truncate">{result.subtitle}</div>
                    </div>
                    {result.badge && (
                      <Badge variant="secondary" className="text-xs">{result.badge}</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
