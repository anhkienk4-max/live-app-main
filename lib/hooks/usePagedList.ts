'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useListPagination } from '@/lib/hooks/useListPagination'
import type { ListFilters, ListPage, ListQuery } from '@/lib/services/operationsPageService'
import type { PageSize } from '@/lib/utils/pagination'

export function usePagedList<T>(service: { getPage(query: ListQuery, signal?: AbortSignal): Promise<ListPage<T>> }, prefix: string, filters: ListFilters = {}, defaultSize: PageSize = 20) {
  const pagination = useListPagination(prefix, defaultSize)
  const { currentUser } = useCurrentUser()
  const identity = currentUser ? currentUser.id + ':' + currentUser.system_permission : ''
  const { page, pageSize, navigate } = pagination
  const encodedFilters = JSON.stringify(filters)
  const [revision, setRevision] = useState(0)
  const key = identity + ':' + page + ':' + pageSize + ':' + encodedFilters + ':' + revision
  const [state, setState] = useState<{ key: string; identity: string; result?: ListPage<T>; error?: unknown }>({ key: '', identity: '' })
  const version = useRef(0)
  useEffect(() => {
    const controller = new AbortController()
    const request = ++version.current
    const timer = window.setTimeout(async () => {
      if (!identity) return
      try {
        const result = await service.getPage({ page, pageSize, filters: JSON.parse(encodedFilters) }, controller.signal)
        if (request !== version.current || controller.signal.aborted) return
        if (result.page !== page) navigate({ [prefix + '_page']: String(result.page) }, true)
        setState({ key, identity, result })
      } catch (error) {
        if (request === version.current && !controller.signal.aborted) setState({ key, identity, error })
      }
    }, 150)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [encodedFilters, identity, key, navigate, page, pageSize, prefix, service])
  const reload = useCallback(async () => { setRevision(value => value + 1) }, [])
  const active = state.key === key
  const sameIdentity=state.identity===identity
  return { ...pagination, reload, refreshing: sameIdentity&&!active,
    result: sameIdentity ? state.result : undefined, items: sameIdentity ? state.result?.items ?? [] : [], total: sameIdentity ? state.result?.total ?? 0 : 0,
    loading: !sameIdentity || (!state.result && !state.error), error: active ? state.error : null }
}
