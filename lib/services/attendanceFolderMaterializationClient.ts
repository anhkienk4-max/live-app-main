export async function requestAttendanceFolderMaterialization(shiftIds: readonly string[]): Promise<boolean> {
  const ids = [...new Set(shiftIds)].filter(Boolean)
  if (!ids.length) return true
  for (let offset = 0; offset < ids.length; offset += 500) {
    try {
      const response = await fetch('/api/operational-storage/attendance-folders', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_ids: ids.slice(offset, offset + 500) }),
      })
      if (!response.ok) return false
    } catch {
      return false
    }
  }
  return true
}
