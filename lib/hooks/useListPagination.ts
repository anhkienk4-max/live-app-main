'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { readPage, readPageSize, type PageSize } from '@/lib/utils/pagination'

export function useListPagination(prefix: string, defaultPageSize: PageSize = 20) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const page = readPage(params.get(prefix + '_page'))
  const pageSize = readPageSize(params.get(prefix + '_size'), defaultPageSize)
  const queryState = params.toString()
  const navigate = useCallback((values: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(queryState)
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    router[replace ? 'replace' : 'push'](query ? pathname + '?' + query : pathname, { scroll: false })
  }, [pathname, queryState, router])
  return {
    page, pageSize, params, navigate,
    setPage: (value: number, replace = false) => navigate({ [prefix + '_page']: value === 1 ? null : String(value) }, replace),
    setPageSize: (value: number) => navigate({ [prefix + '_size']: String(value), [prefix + '_page']: null }),
    reset: () => navigate({ [prefix + '_page']: null }, true),
  }
}
