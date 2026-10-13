import React, { Suspense } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { LanguageProvider, useTranslation } from '../../lib/i18n'
import { OperationalFileWorkspace } from '../../components/features/storage/OperationalFileWorkspace'

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
    <Suspense><OperationalFileWorkspace /></Suspense>
    <p data-testid="untranslated-data">All</p>
  </LanguageProvider>
}

if (typeof document !== 'undefined') {
  hydrateRoot(document.getElementById('root')!, <HydrationFixture />, {
    onRecoverableError: error => console.error(String(error)),
  })
}
