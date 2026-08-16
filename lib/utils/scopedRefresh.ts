/**
 * Scoped authoritative refresh: after a successful mutation, refetch ONLY the
 * affected resource's collection and replace local state with the authoritative
 * result. Unrelated master-data services are intentionally NOT refetched.
 */
export async function refreshCollection<T>(
  service: { getAll(): Promise<T[]> },
  setter: (data: T[]) => void,
): Promise<void> {
  setter(await service.getAll())
}
