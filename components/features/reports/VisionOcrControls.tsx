'use client'

import * as React from 'react'
import { Bot, Check, GitCompareArrows, Loader2, ScanText } from 'lucide-react'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { metricTranslationKeys } from '@/lib/reportMetricLabels'
import type { HybridMetricResult } from '@/lib/visionOcr/types'

export type VisionOcrMode = 'local' | 'ai' | 'compare'

const privacyConsentKey = 'livestream-ops-ai-ocr-privacy-consent-v1'

export function VisionOcrActionGroup({
  activeMode,
  busy,
  disabled,
  localButtonTestId,
  onRun,
}: {
  activeMode: VisionOcrMode | null
  busy: boolean
  disabled: boolean
  localButtonTestId?: string
  onRun: (mode: VisionOcrMode) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [privacyOpen, setPrivacyOpen] = React.useState(false)
  const [pendingMode, setPendingMode] = React.useState<Exclude<VisionOcrMode, 'local'> | null>(null)

  const requestMode = (mode: VisionOcrMode) => {
    if (mode === 'local') {
      void onRun(mode)
      return
    }
    const consented = typeof window !== 'undefined' && window.localStorage.getItem(privacyConsentKey) === 'accepted'
    if (consented) {
      void onRun(mode)
      return
    }
    setPendingMode(mode)
    setPrivacyOpen(true)
  }

  return <>
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="vision-ocr-actions">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => requestMode('local')} data-testid={localButtonTestId || 'vision-ocr-mode-local'}>
          {busy && activeMode === 'local' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}{t('visionOcrQuickScan')}
        </Button>
        <Button type="button" variant="outline" disabled={disabled || busy} onClick={() => requestMode('ai')} data-testid="vision-ocr-mode-ai">
          {busy && activeMode === 'ai' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}{t('visionOcrAiScan')}
        </Button>
        <Button type="button" disabled={disabled || busy} onClick={() => requestMode('compare')} data-testid="vision-ocr-mode-compare">
          {busy && activeMode === 'compare' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitCompareArrows className="mr-2 h-4 w-4" />}{t('visionOcrCompareScan')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="vision-ocr-current-mode">
        {t('visionOcrCurrentMode')}: {activeMode ? t(activeMode === 'local' ? 'visionOcrQuickScan' : activeMode === 'ai' ? 'visionOcrAiScan' : 'visionOcrCompareScan') : t('visionOcrIdle')}
      </p>
    </div>
    <AlertDialog
      open={privacyOpen}
      onOpenChange={setPrivacyOpen}
      title={t('visionOcrPrivacyTitle')}
      description={t('visionOcrPrivacyNotice')}
      confirmText={t('continue')}
      cancelText={t('cancel')}
      onConfirm={() => {
        window.localStorage.setItem(privacyConsentKey, 'accepted')
        if (pendingMode) void onRun(pendingMode)
        setPendingMode(null)
      }}
    />
  </>
}

function comparisonStatus(result: HybridMetricResult) {
  if (result.selectedSource === 'agreement') return 'visionOcrStatusMatch' as const
  if (result.warning === 'conflict') return 'visionOcrStatusDifferent' as const
  if (result.warning === 'local_only') return 'visionOcrStatusLocalOnly' as const
  if (result.warning === 'ai_only') return 'visionOcrStatusAiOnly' as const
  if (result.state === 'missing') return 'visionOcrStatusUnreadable' as const
  return 'statusConfirmed' as const
}

export function VisionOcrReviewPanel({
  results,
  onResolve,
}: {
  results: readonly HybridMetricResult[]
  onResolve: (key: HybridMetricResult['key'], source: 'local' | 'ai' | 'manual', manualValue?: number | null) => void
}) {
  const { t } = useTranslation()
  const [manualValues, setManualValues] = React.useState<Record<string, string>>({})
  if (results.length === 0) return null
  const unresolved = results.filter(result => result.state === 'review_required').length

  return <section className="rounded-lg border" data-testid="vision-ocr-review-panel">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <div><h4 className="font-semibold">{t('visionOcrComparisonTitle')}</h4><p className="text-xs text-muted-foreground">{t('visionOcrComparisonHelp')}</p></div>
      <Badge variant={unresolved ? 'destructive' : 'outline'}>{t('visionOcrUnresolvedCount', { count: unresolved })}</Badge>
    </div>
    <div className="max-h-[55vh] overflow-auto">
      <table className="w-full min-w-[880px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-popover"><tr className="border-b">
          <th className="p-2">{t('metric')}</th><th className="p-2">{t('visionOcrQuickScan')}</th><th className="p-2">AI Vision</th><th className="p-2">{t('visionOcrSelectedResult')}</th><th className="p-2">{t('status')}</th><th className="p-2">{t('actions')}</th>
        </tr></thead>
        <tbody>{results.map(result => <tr key={result.key} className={result.state === 'review_required' ? 'border-b bg-amber-50/70' : 'border-b'} data-testid={`vision-ocr-review-${result.key}`}>
          <td className="p-2 font-medium">{t(metricTranslationKeys[result.key])}</td>
          <td className="p-2">{result.local?.value ?? '—'}</td>
          <td className="p-2">{result.ai?.value ?? '—'}</td>
          <td className="p-2 font-medium">{result.selectedValue ?? '—'} <span className="text-muted-foreground">({result.selectedSource})</span></td>
          <td className="p-2"><Badge variant="outline">{t(comparisonStatus(result))}</Badge></td>
          <td className="p-2"><div className="flex min-w-[300px] flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" disabled={result.local?.value == null} onClick={() => onResolve(result.key, 'local')}>{t('visionOcrChooseLocal')}</Button>
            <Button type="button" size="sm" variant="outline" disabled={result.ai?.value == null} onClick={() => onResolve(result.key, 'ai')}>{t('visionOcrChooseAi')}</Button>
            <Input className="h-8 w-24" type="number" value={manualValues[result.key] || ''} onChange={event => setManualValues(current => ({ ...current, [result.key]: event.target.value }))} aria-label={`${t('visionOcrManualValue')} ${t(metricTranslationKeys[result.key])}`} />
            <Button type="button" size="sm" disabled={!manualValues[result.key] || !Number.isFinite(Number(manualValues[result.key]))} onClick={() => onResolve(result.key, 'manual', Number(manualValues[result.key]))}><Check className="mr-1 h-3 w-3" />{t('visionOcrManual')}</Button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>
}
