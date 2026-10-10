export function staffingSummary(database: { shifts: Record<string, unknown>[]; shift_registrations: Record<string, unknown>[] }, ids: unknown) {
  return database.shifts.filter(shift => (ids as string[]).includes(String(shift.id))).flatMap(shift =>
    ['host', 'support', 'technical'].map(role => {
      const rows = database.shift_registrations.filter(row => row.shift_id === shift.id && row.operational_role === role)
      const approved = rows.filter(row => ['approved', 'manually_assigned'].includes(String(row.status))).length
      const required = Number(shift['required_' + role + '_count'] ?? 1)
      return { shift_id: shift.id, role, required, approved, pending: rows.filter(row => row.status === 'pending').length,
        remaining: Math.max(0, required - approved), approved_staff: [] }
    }))
}
