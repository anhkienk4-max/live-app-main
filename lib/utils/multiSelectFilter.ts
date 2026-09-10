export const ALL_FILTER_VALUE = 'all'

/**
 * Empty selections mean unrestricted. The legacy `all` sentinel is accepted
 * at the boundary only so persisted or restored state cannot create a mixed
 * value such as ['all', id].
 */
export function normalizeMultiSelect(values: readonly string[] | null | undefined): string[] {
  return [...new Set((values ?? []).filter(value => value !== ALL_FILTER_VALUE && value.trim() !== ''))]
}

export function matchesMultiSelect(candidate: string | null | undefined, values: readonly string[] | null | undefined): boolean {
  const normalized = normalizeMultiSelect(values)
  return normalized.length === 0 || (candidate !== null && candidate !== undefined && normalized.includes(candidate))
}

export function toggleMultiSelect(values: readonly string[] | null | undefined, value: string): string[] {
  const normalized = normalizeMultiSelect(values)
  return normalized.includes(value)
    ? normalized.filter(item => item !== value)
    : normalizeMultiSelect([...normalized, value])
}

export function clearMultiSelect(): string[] {
  return []
}

export function selectAllMultiSelect(): string[] {
  return []
}
