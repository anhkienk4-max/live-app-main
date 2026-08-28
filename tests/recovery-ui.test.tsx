import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RecoveryPanel } from '@/components/features/settings/RecoveryPanel'
import { useToast } from '@/components/ui/toast'

vi.mock('@/components/ui/toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))

describe('Recovery UI', () => {
  it('renders validation and export buttons', () => {
    render(<RecoveryPanel />)
    expect(screen.getByText('Run Validation')).toBeInTheDocument()
    expect(screen.getByText('Export Operational Data (JSON)')).toBeInTheDocument()
  })

  it('calls validation API on button click', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        status: 'PASS',
        timestamp: new Date().toISOString(),
        checks: { tablesExist: true, orphans: [], rowCounts: {}, migrationLineageOk: true, authIdentityConsistent: true, registrationIntegrityOk: true, swapIntegrityOk: true, reportIntegrityOk: true },
        warnings: [],
        failures: [],
        nextSteps: ['No issues'],
      }),
    })
    global.fetch = mockFetch

    render(<RecoveryPanel />)
    const button = screen.getByText('Run Validation')
    await userEvent.click(button)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/admin/recovery/validate')
    })
  })
})