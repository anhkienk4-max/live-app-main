'use client'

import * as React from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { shiftService, userService, brandService, campaignService } from '@/lib/services/dataService'
import { Search, Calendar, User, Briefcase, Tag, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

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
  const router = useRouter()

  // Listen for Cmd/Ctrl + K
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

  // Perform search
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
          campaignService.getAll()
        ])

        const searchResults: SearchResult[] = []
        const lowerQuery = query.toLowerCase()

        // Search shifts
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
              badge: shift.status
            })
          })

        // Search staff
        users.slice(0, 5).forEach(user => {
          searchResults.push({
            id: user.id,
            type: 'staff',
            title: user.full_name,
            subtitle: user.email,
            url: '/staff',
            icon: <User className="h-4 w-4" />,
            badge: user.role
          })
        })

        // Search brands
        brands
          .filter(b => b.name.toLowerCase().includes(lowerQuery))
          .slice(0, 3)
          .forEach(brand => {
            searchResults.push({
              id: brand.id,
              type: 'brand',
              title: brand.name,
              subtitle: 'Brand',
              url: '/brands',
              icon: <Briefcase className="h-4 w-4" />
            })
          })

        // Search campaigns
        campaigns
          .filter(c => c.name.toLowerCase().includes(lowerQuery))
          .slice(0, 3)
          .forEach(campaign => {
            searchResults.push({
              id: campaign.id,
              type: 'campaign',
              title: campaign.name,
              subtitle: `${format(new Date(campaign.start_date), 'MMM d')} - ${format(new Date(campaign.end_date), 'MMM d')}`,
              url: '/campaigns',
              icon: <Tag className="h-4 w-4" />
            })
          })

        setResults(searchResults)
      } catch (error) {
        console.error('Search error:', error)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(searchTimeout)
  }, [query])

  const handleSelect = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    router.push(result.url)
  }

  return (
    <>
      {/* Search Trigger Button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors w-64"
      >
        <Search className="h-4 w-4" />
        <span>Search...</span>
        <kbd className="ml-auto px-2 py-0.5 text-xs font-semibold text-gray-800 bg-white border border-gray-200 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Search Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search shifts, staff, brands, campaigns..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 border-0 focus-visible:ring-0"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-8 text-gray-600">Searching...</div>
            ) : results.length === 0 && query ? (
              <div className="text-center py-8">
                <Search className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600">No results found for &quot;{query}&quot;</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-2">Start typing to search</p>
                <div className="text-xs space-y-1">
                  <div>Search for shifts, staff, brands, or campaigns</div>
                  <div>Use ⌘K (Mac) or Ctrl+K (Windows) to open</div>
                </div>
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
                      <Badge variant="secondary" className="text-xs">
                        {result.badge}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {results.length > 0 && (
            <div className="p-3 border-t bg-gray-50 text-xs text-gray-600 flex items-center justify-between">
              <div>Press Enter to select</div>
              <div>ESC to close</div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
