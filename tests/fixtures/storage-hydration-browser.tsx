import React, { Suspense } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { LanguageProvider, useTranslation } from '../../lib/i18n'
import { OperationalFileWorkspace } from '../../components/features/storage/OperationalFileWorkspace'
import { AuthIdentityProvider } from '../../lib/auth/AuthIdentityProvider'
import type { User } from '../../lib/types/database.types'

const fixtureAdmin: User = {
  id: 'qa-storage-admin', email: 'qa-storage@example.invalid', full_name: 'Storage fixture Admin',
  role: 'admin', system_permission: 'admin', status: 'active', join_date: '2026-10-13',
  created_at: '2026-10-13', updated_at: '2026-10-13',
}

function LanguageControls() {
  const { setLanguage, t } = useTranslation()
  return <>
    <button onClick={() => setLanguage('vi')}>vi</button>
    <button onClick={() => setLanguage('en')}>en</button>
    <p data-testid="shared-label">{t('save')}</p>
  </>
}

export function HydrationFixture() {
  return <LanguageProvider>
    <LanguageControls />
    <AuthIdentityProvider mode="supabase" identity={null} businessUser={fixtureAdmin}>
      <Suspense><OperationalFileWorkspace /></Suspense>
    </AuthIdentityProvider>
    <p data-testid="untranslated-data">All</p>
  </LanguageProvider>
}

if (typeof document !== 'undefined') {
  hydrateRoot(document.getElementById('root')!, <HydrationFixture />, {
    onRecoverableError: error => console.error(String(error)),
  })
}
