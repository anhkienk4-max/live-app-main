'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { currentUserService } from '@/lib/services/dataService'
import { useListPagination } from '@/lib/hooks/useListPagination'
import type { ListFilters, ListPage, ListQuery } from '@/lib/services/operationsPageService'
import type { PageSize } from '@/lib/utils/pagination'
import {
  invalidatePageCache, pageCacheKey, prefetchNextListPage,
  readCachedListPage, readPageCache,
} from '@/lib/services/operationsPageCache'

export function usePagedList<T>(service: { getPage(query: ListQuery, signal?: AbortSignal): Promise<ListPage<T>> }, prefix: string, filters: ListFilters = {}, defaultSize: PageSize = 20) {
  const pagination = useListPagination(prefix, defaultSize)
  const { currentUser } = useCurrentUser()
  const identity = currentUser ? currentUser.id + ':' + currentUser.system_permission + ':' + currentUser.updated_at : ''
  const { page, pageSize, navigate } = pagination
  const encodedFilters = JSON.stringify(filters)
  const [revision, setRevision] = useState(0)
  const key = identity + ':' + page + ':' + pageSize + ':' + encodedFilters + ':' + revision
  const [state, setState] = useState<{ key: string; identity: string; result?: ListPage<T>; error?: unknown }>({ key: '', identity: '' })
  const version = useRef(0)
  const query: ListQuery = { page, pageSize, filters: JSON.parse(encodedFilters) }
  const cacheKey = identity ? pageCacheKey(identity, prefix, query) : ''
  const cached = cacheKey ? readPageCache<ListPage<T>>(cacheKey) : undefined

  useEffect(() => {
    const controller = new AbortController()
    const request = ++version.current
    let prefetchTimer: number | undefined
    if (!identity) return () => { controller.abort() }
    const currentQuery: ListQuery = { page, pageSize, filters: JSON.parse(encodedFilters) }
    const stillSameActor = async () => {
      const actor = await currentUserService.getCurrent()
      return !!actor && identity === actor.id + ':' + (actor.system_permission ?? actor.role) + ':' + actor.updated_at
    }
    // A cached, role-scoped page can render immediately without opening a new request.
    if (readPageCache<ListPage<T>>(pageCacheKey(identity, prefix, currentQuery))) {
      return () => { controller.abort() }
    }
    const timer = window.setTimeout(async () => {
      try {
        const result = await readCachedListPage(service, identity, prefix, currentQuery, controller.signal, stillSameActor)
        if (request !== version.current || controller.signal.aborted) return
        if (result.page !== page) navigate({ [prefix + '_page']: String(result.page) }, true)
        setState({ key, identity, result })
        prefetchTimer = window.setTimeout(() => {
          if (!controller.signal.aborted) prefetchNextListPage(service, identity, prefix, currentQuery, result, controller.signal, stillSameActor)
        }, 250)
      } catch (error) {
        if (request === version.current && !controller.signal.aborted) setState({ key, identity, error })
      }
    }, 30)
    return () => { window.clearTimeout(timer); if (prefetchTimer !== undefined) window.clearTimeout(prefetchTimer); controller.abort() }
  }, [encodedFilters, identity, key, navigate, page, pageSize, prefix, service])
  const reload = useCallback(async () => {
    // An authorized write can affect Calendar, Reports or other filtered lists.
    invalidatePageCache()
    setRevision(value => value + 1)
  }, [setRevision])
  const active = state.key === key
  const result = (active ? state.result : undefined) ?? cached
  return { ...pagination, reload, refreshing: !!result && !active && !cached,
    result, items: result?.items ?? [], total: result?.total ?? 0,
    loading: !result && (!active || !state.error), error: active ? state.error : null }
}
