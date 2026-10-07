type SearchContext = Pick<URLSearchParams, 'get'>

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
