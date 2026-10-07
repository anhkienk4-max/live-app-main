export type ProductionShellVariant = 'ops' | 'admin' | 'live' | 'shift-detail'

type SearchContext = Pick<URLSearchParams, 'get'>

/** Presentation only: route access and navigation permissions remain canonical. */
export function resolveProductionShell(pathname: string, search: SearchContext): ProductionShellVariant {
  if (pathname === '/live' || pathname.startsWith('/live/')) return 'live'
  if (pathname === '/audit' || pathname.startsWith('/audit/') || pathname === '/settings' || pathname.startsWith('/settings/')) return 'admin'
  if (pathname === '/calendar' && (search.get('tab') === 'import' || search.get('action') === 'import')) return 'admin'
  if (/^\/shifts\/(?!create(?:\/|$)|new(?:\/|$))[^/]+/.test(pathname)) return 'shift-detail'
  return 'ops'
}

/** Prefer a matching query destination over its generic parent; match nested paths at boundaries. */
export function resolveActiveNavigation(items: ReadonlyArray<{ href: string }>, pathname: string, search: SearchContext): string | undefined {
  let active: string | undefined
  let score = -1
  for (const item of items) {
    const url = new URL(item.href, 'https://navigation.invalid')
    if (pathname !== url.pathname && (url.pathname === '/' || !pathname.startsWith(`${url.pathname}/`))) continue
    const query = [...url.searchParams.entries()]
    if (!query.every(([key, value]) => search.get(key) === value)) continue
    const specificity = url.pathname.length + query.length * 1000
    if (specificity > score) { active = item.href; score = specificity }
  }
  return active
}
