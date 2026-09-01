'use client'

import * as React from 'react'
import { AlertTriangle, Check, Download, FileSpreadsheet, Link2, Moon, Plus, Upload, X } from 'lucide-react'
import {
  brandService,
  campaignService,
  currentUserService,
  platformService,
  scheduleChangeService,
  shiftService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DeletionImpact, Platform, ScheduleChangeLog, ScheduleImportBatch, Shift, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import {
  downloadExcelTemplate,
  downloadScheduleImportErrors,
  importShiftsFromExcel,
  importShiftsFromGoogleSheetsUrl,
  normalizeLookup,
  type ImportResult,
  parseScheduleRows,
} from '@/lib/utils/excelUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { PageLoadError } from '@/components/ui/page-load-error'
import { DEFAULT_SHIFT_STAFFING } from '@/lib/utils/shiftUtils'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeScheduleImportResult,
  normalizeScheduleImportSourceRow,
  previewStaffingFields,
  previewStaffingNameFields,
} from '@/lib/utils/scheduleImportPreview'
import {
  type DraftField,
  type DraftRows,
  committedRowValue,
  commitRowDraftToSource,
  removeRowDraft,
  rowDraftValue,
  updateRowDraft,
} from '@/lib/utils/scheduleImportDraft'
import {
  type ImportBatchRow,
  mapImportResultToBatchRows,
  summarizeImportResult,
} from '@/lib/utils/scheduleImportBatch'
import {
  batchPresentationCounts,
  previewPresentationCounts,
  previewPresentationStatus,
  type ImportPresentationCounts,
  type ImportPreviewPresentationStatus,
  type ImportResultPresentationStatus,
} from '@/lib/utils/scheduleImportUx'
import { processScheduleImportRows } from '@/lib/utils/scheduleImportRecovery'
import { scheduleImportBatchPort } from '@/lib/services/scheduleImportBatchPort'
import {
  type MasterDataState,
  importGate,
} from '@/lib/utils/scheduleImportReadiness'

type Source = { type: 'excel' | 'google_sheets'; name: string }
type PreviewFilter = 'all' | 'ready' | 'warning' | 'invalid' | 'duplicate' | 'retryable'

type CompletedImport = {
  source: Source
  batch: ScheduleImportBatch
  rows: ImportBatchRow[]
}

const importStatusLabelKey: Record<ImportResultPresentationStatus, TranslationKey> = {
  ready: 'importStatusReady',
  warning: 'importStatusWarning',
  invalid: 'importStatusInvalid',
  duplicate: 'importStatusDuplicate',
  retryable: 'importStatusRetryable',
  imported: 'importedResult',
}

function importStatusLabel(status: ImportResultPresentationStatus, t: (key: TranslationKey) => string) {
  return t(importStatusLabelKey[status])
}

function previewStatusForRow(preview: ImportResult['rows'][number]): ImportPreviewPresentationStatus {
  return previewPresentationStatus(preview)
}

function safeImportError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : ''
  if (!message || /sqlstate|pgrst|postgrest|postgres|rpc|stack trace|23505|42501/i.test(message)) return fallback
  return message
}

function rowStatusClass(status: ImportResultPresentationStatus) {
  if (status === 'invalid') return 'border-red-200 bg-red-50/70'
  if (status === 'warning' || status === 'retryable') return 'border-amber-200 bg-amber-50/70'
  if (status === 'duplicate') return 'border-slate-200 bg-slate-50/70'
  if (status === 'imported') return 'border-emerald-200 bg-emerald-50/60'
  return 'border-border bg-background'
}

export function ScheduleImportStaffingInput({
  field,
  rowNumber,
  value,
  onChange,
}: {
  field: typeof previewStaffingFields[number]
  rowNumber?: number
  value: number | string
  onChange: (value: string) => void
}) {
  return (
    <Input
      className="w-20"
      data-testid={`schedule-preview-${field}`}
      aria-label={`${rowNumber === undefined ? '' : `Row ${rowNumber} `}${field.replaceAll('_', ' ')}`}
      min="0"
      onChange={event => onChange(event.target.value)}
      step="1"
      type="number"
      value={value}
    />
  )
}

export function ScheduleImportPanel({ onImported }: { onImported?: () => void }) {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const completedImportRef = React.useRef<HTMLDivElement>(null)
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [existingShifts, setExistingShifts] = React.useState<Shift[]>([])
  const [googleUrl, setGoogleUrl] = React.useState('mock://schedule')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [source, setSource] = React.useState<Source | null>(null)
  const [batch, setBatch] = React.useState<ScheduleImportBatch | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [masterState, setMasterState] = React.useState<MasterDataState>('loading')
  const [previewFilter, setPreviewFilter] = React.useState<PreviewFilter>('all')
  const [previewSearch, setPreviewSearch] = React.useState('')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [draftRows, setDraftRows] = React.useState<DraftRows>({})
  const [completedImport, setCompletedImport] = React.useState<CompletedImport | null>(null)

  React.useEffect(() => {
    if (completedImport) completedImportRef.current?.focus()
  }, [completedImport])

  React.useEffect(() => {
    void Promise.all([
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
      shiftService.getAll(),
    ]).then(([loadedBrands, loadedPlatforms, loadedCampaigns, loadedShifts]) => {
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setExistingShifts(loadedShifts)
      setMasterState('ready')
    }).catch(() => {
      setMasterState('error')
    })
  }, [])

  const maps = React.useMemo(() => ({
    brands: new Map(brands.map(item => [item.name, item.id])),
    platforms: new Map(platforms.map(item => [item.name, item.id])),
    campaigns: new Map(campaigns.map(item => [item.name, item.id])),
  }), [brands, campaigns, platforms])

  const masterGate = importGate(masterState)

  const recordPreview = async (next: ImportResult, nextSource: Source) => {
    const normalizedNext = normalizeScheduleImportResult(next)
    setCompletedImport(null)
    setPreviewFilter('all')
    setPreviewSearch('')
    setResult(normalizedNext)
    setSource(nextSource)
    const createdBy = currentUser?.id || currentUserService.getId()
    const created = await scheduleImportBatchPort.createBatch({
      source: nextSource.type,
      sourceName: nextSource.name,
      createdBy,
      summary: summarizeImportResult(normalizedNext),
      previewRows: normalizedNext.rows.map(preview => preview.row),
    })
    await scheduleImportBatchPort.recordBatchRows(
      created.id,
      mapImportResultToBatchRows(created.id, normalizedNext),
    )
    setBatch(created)
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !masterGate.allowed) {
      if (file && masterGate.message) {
        toast({ title: t('error'), description: masterGate.message, variant: 'destructive' })
      }
      return
    }
    setBusy(true)
    try {
      const next = await importShiftsFromExcel(file, maps.brands, maps.platforms, maps.campaigns, undefined, existingShifts)
      await recordPreview(next, { type: 'excel', name: file.name })
    } catch (error) {
      toast({ title: t('error'), description: safeImportError(error, t('importPreviewLoadError')), variant: 'destructive' })
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  const handleGoogle = async () => {
    if (!masterGate.allowed) {
      if (masterGate.message) {
        toast({ title: t('error'), description: masterGate.message, variant: 'destructive' })
      }
      return
    }
    setBusy(true)
    try {
      const next = await importShiftsFromGoogleSheetsUrl(googleUrl, maps.brands, maps.platforms, maps.campaigns, existingShifts)
      await recordPreview(next, { type: 'google_sheets', name: googleUrl })
    } catch (error) {
      toast({ title: t('error'), description: safeImportError(error, t('importPreviewLoadError')), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const sourceRowsFromPreview = React.useCallback(() => {
    if (!result) return []
    return result.rows.map(preview => buildScheduleImportPreviewSourceRow(preview.row))
  }, [result])

  const applySourceRows = (sourceRows: Record<string, unknown>[]) => {
    const nextResult = normalizeScheduleImportResult(parseScheduleRows(sourceRows, {
      brands: maps.brands,
      platforms: maps.platforms,
      campaigns: maps.campaigns,
    }, existingShifts))
    setResult(nextResult)
    if (batch) {
      void scheduleImportBatchPort.updateBatchPreview(
        batch.id,
        summarizeImportResult(nextResult),
        nextResult.rows.map(preview => preview.row),
      ).catch(() => {
        toast({
          title: t('error'),
          description: 'Import outcomes were already recorded for this batch. Re-import the source file to retry failed rows.',
          variant: 'destructive',
        })
      })
    }
  }

  const draftChange = (rowNumber: number, field: DraftField, value: string) => {
    const row = result?.rows.find(preview => preview.row.row_number === rowNumber)?.row
    if (!row) return
    setDraftRows(prev => updateRowDraft(prev, rowNumber, row, field, value))
  }

  const commitRow = (rowNumber: number) => {
    const draft = draftRows[rowNumber]
    if (!draft) return
    const sourceRows = sourceRowsFromPreview()
    const index = result?.rows.findIndex(preview => preview.row.row_number === rowNumber) ?? -1
    if (index >= 0 && sourceRows[index]) {
      sourceRows[index] = commitRowDraftToSource(sourceRows[index], draft)
      applySourceRows(sourceRows)
    }
    setDraftRows(prev => removeRowDraft(prev, rowNumber))
  }

  const cancelRow = (rowNumber: number) => {
    setDraftRows(prev => removeRowDraft(prev, rowNumber))
  }

  const addPreviewRow = () => {
    applySourceRows([
      ...sourceRowsFromPreview(),
      normalizeScheduleImportSourceRow({
        Date: '',
        'Start time': '09:00',
        'End time': '13:00',
        Brand: '',
        Platform: '',
        Campaign: '',
        'Shift title': '',
        Studio: '',
        required_host_count: DEFAULT_SHIFT_STAFFING.required_host_count,
        required_support_count: DEFAULT_SHIFT_STAFFING.required_support_count,
        required_technical_count: DEFAULT_SHIFT_STAFFING.required_technical_count,
        Notes: '',
      }),
    ])
  }

  const confirmImport = async () => {
    if (!result || !batch || !source || result.validRows === 0) return
    const completedSource = source
    setBusy(true)
    try {
      const batchRows = await scheduleImportBatchPort.listBatchRows(batch.id)
      const importResult = await processScheduleImportRows({
        batchId: batch.id,
        previews: result.rows,
        batchRows,
        initialShifts: existingShifts,
        createShift: shiftService.create,
        refreshShifts: shiftService.getAll,
        recordOutcome: async ({ rowNumber, outcome, expectedOutcome, shiftId, failureCode }) => {
          await scheduleImportBatchPort.recordRowOutcome(batch.id, rowNumber, outcome, {
            expectedOutcome,
            shiftId,
            failureCode,
          })
        },
        updateStaffingLabels: async (shiftId, labels) => {
          // Use dataService directly to ensure both mock and Supabase paths are covered
          // and to update the in-memory projection for subsequent reconciliation.
          const updated = await shiftService.updateStaffingLabels(
            shiftId,
            labels,
            undefined,
            existingShifts.find(shift => shift.id === shiftId)?.version,
          )
          if (updated) setExistingShifts(prev => prev.map(s => s.id === updated.id ? updated : s))
          return updated
        },
      })
      const importedCount = importResult.imported + importResult.recovered
      let completedBatch: ScheduleImportBatch | null = null
      if (importResult.retryable > 0) {
        completedBatch = await scheduleImportBatchPort.markBatchStatus(batch.id, 'failed')
        const finalRows = await scheduleImportBatchPort.listBatchRows(batch.id)
        setCompletedImport({ source: completedSource, batch: completedBatch ?? { ...batch, status: 'failed' }, rows: finalRows })
        setResult(null)
        setBatch(null)
        setSource(null)
        setDraftRows({})
        toast({
          title: t('error'),
          description: `${importedCount} row(s) imported; ${importResult.retryable} row(s) were marked for retry.`,
          variant: 'destructive',
        })
        setExistingShifts(await shiftService.getAll())
        onImported?.()
        return
      }
      completedBatch = await scheduleImportBatchPort.markBatchStatus(batch.id, 'confirmed')
      const finalRows = await scheduleImportBatchPort.listBatchRows(batch.id)
      setCompletedImport({ source: completedSource, batch: completedBatch ?? { ...batch, status: 'confirmed' }, rows: finalRows })
      const finalCounts = batchPresentationCounts(finalRows)
      const attention = finalCounts.warning + finalCounts.invalid + finalCounts.duplicate + finalCounts.retryable
      toast({
        title: t('success'),
        description: attention > 0 ? t('importPartialSuccess', { imported: finalCounts.imported, attention }) : t('importCompleted'),
        variant: 'success',
      })
      setResult(null)
      setBatch(null)
      setSource(null)
      setDraftRows({})
      setExistingShifts(await shiftService.getAll())
      onImported?.()
    } catch (error) {
      await scheduleImportBatchPort.markBatchStatus(batch.id, 'failed').catch(() => undefined)
      toast({ title: t('error'), description: safeImportError(error, t('importPreviewLoadError')), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const cancelImpact: DeletionImpact | null = batch ? {
    entity_type: 'schedule_import',
    entity_id: batch.id,
    entity_name: batch.source_name,
    action: 'delete',
    consequence: 'This unconfirmed import preview will be removed. No shifts have been created yet.',
    reversible: false,
    related_records: [],
  } : null

  const removePreview = async (reason: string) => {
    if (!batch || !currentUser) return
    try {
      await scheduleImportBatchPort.removeBatch(batch.id, currentUser.id, reason)
      setResult(null)
      setBatch(null)
      setSource(null)
      setCompletedImport(null)
      toast({ title: 'Import preview removed', variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: safeImportError(error, t('importPreviewLoadError')), variant: 'destructive' })
      throw error
    }
  }

  if (userLoading || !currentUser) return <div className="py-12 text-center">{t('loading')}</div>
  if (!hasPermission(currentUser, 'shifts.import')) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">{t('permissionDenied')}</CardContent></Card>
  }

  const previewCounts = result ? previewPresentationCounts(result) : null
  const visiblePreviews = result?.rows.filter(preview => {
    const status = previewStatusForRow(preview)
    if (previewFilter !== 'all' && previewFilter !== status) return false
    const query = previewSearch.trim().toLocaleLowerCase()
    if (!query) return true
    return [
      preview.row.title,
      preview.row.brand_name,
      preview.row.platform_name,
      preview.row.campaign_name,
      preview.row.studio,
      preview.row.host_names?.join(' ') ?? '',
      preview.row.assistant_names?.join(' ') ?? '',
      preview.row.technical_names?.join(' ') ?? '',
      String(preview.row.row_number),
    ].some(value => String(value ?? '').toLocaleLowerCase().includes(query))
  }) ?? []
  const completedCounts = completedImport ? batchPresentationCounts(completedImport.rows) : null
  const previewAttention = previewCounts
    ? previewCounts.warning + previewCounts.invalid + previewCounts.duplicate + previewCounts.retryable
    : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5" />{t('importInput')}: {t('importExcel')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('importFormatExcel')}</p>
            <p className="text-xs text-muted-foreground">{t('importDateTimeHelp')}</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={busy || !masterGate.allowed}><Upload className="mr-2 h-4 w-4" />{t('importExcel')}</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only" aria-label={t('importFormatExcel')} onChange={handleFile} />
              <Button variant="outline" onClick={downloadExcelTemplate}><Download className="mr-2 h-4 w-4" />{t('downloadTemplate')}</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" />{t('importInput')}: {t('importGoogleSheets')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('importFormatGoogle')}. {t('googleSheetsHelp')}</p>
            <p className="text-xs text-muted-foreground">{t('importDateTimeHelp')}</p>
            <div className="flex flex-col gap-2 sm:flex-row"><Input className="min-w-0" value={googleUrl} onChange={event => setGoogleUrl(event.target.value)} aria-label={t('importFormatGoogle')} placeholder="https://docs.google.com/spreadsheets/... or mock://schedule" /><Button className="shrink-0" onClick={handleGoogle} disabled={busy || !masterGate.allowed || !googleUrl}>{t('importGoogleSheets')}</Button></div>
          </CardContent>
        </Card>
      </div>

      {busy && <p className="text-sm font-medium text-blue-700" role="status" aria-live="polite" data-testid="schedule-import-processing">{t('importProcessing')}</p>}

      {masterGate.message && (
        <p className="text-sm font-medium text-red-700" role="alert" data-testid="schedule-import-master-error">{masterGate.message}</p>
      )}

      {result && source && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle>{t('reviewBeforeImport')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t('importSourceSelected')}: <span className="font-medium text-foreground">{source.name}</span></p><p className="mt-1 text-xs text-muted-foreground">{t('batchPreviewState')}</p></div>
              {previewCounts && <ImportSummary counts={previewCounts} t={t} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm text-blue-900" role="status" data-testid="schedule-import-preview-state">{t('batchPreviewState')}</div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1" aria-label={t('importOutcomeRows')}>
                {(['all', 'ready', 'warning', 'invalid', 'duplicate', 'retryable'] as const).map(filter => (
                  <Button key={filter} size="sm" variant={previewFilter === filter ? 'default' : 'outline'} onClick={() => setPreviewFilter(filter)} aria-pressed={previewFilter === filter}>
                    {filter === 'all' ? t('importStatusAll') : filter === 'ready' ? t('importStatusReady') : filter === 'warning' ? t('importStatusWarning') : filter === 'invalid' ? t('importStatusInvalid') : filter === 'duplicate' ? t('importStatusDuplicate') : t('importStatusRetryable')}
                    {previewCounts && <span className="ml-1">({filter === 'all' ? previewCounts.total : previewCounts[filter]})</span>}
                  </Button>
                ))}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Input className="w-full sm:w-64" value={previewSearch} onChange={event => setPreviewSearch(event.target.value)} aria-label={t('importSearchRows')} placeholder={t('importSearchRows')} />
                <Button size="sm" variant="outline" onClick={addPreviewRow}><Plus className="mr-2 h-4 w-4" />{t('addImportRow')}</Button>
                {(result.errors.length > 0 || result.warnings.length > 0) && <Button size="sm" variant="outline" onClick={() => downloadScheduleImportErrors(result)}><Download className="mr-2 h-4 w-4" />Download errors</Button>}
              </div>
            </div>
            {visiblePreviews.length === 0 && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" role="status">{result.rows.length === 0 ? t('importNoRows') : t('importNoMatchingRows')}</p>}
            <div className="hidden max-h-[560px] overflow-auto rounded-lg border md:block">
              <table className="min-w-[1780px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background"><tr className="border-b text-left"><th className="p-2">{t('importSourceRow')}</th><th className="p-2">{t('date')}</th><th className="p-2">{t('time')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('studio')}</th><th className="p-2">{t('importHostNames')}</th><th className="p-2">{t('importAssistantNames')}</th><th className="p-2">{t('importTechnicalNames')}</th><th className="p-2">{t('requiredHostCount')}</th><th className="p-2">{t('requiredSupportCount')}</th><th className="p-2">{t('requiredTechnicalCount')}</th><th className="min-w-64 p-2">{t('status')}</th></tr></thead>
                <tbody>
                  {visiblePreviews.map(preview => {
                    const rowNumber = preview.row.row_number
                    const rowStatus = previewStatusForRow(preview)
                    const editing = draftRows[rowNumber]
                    const cellValue = (field: DraftField): string => {
                      const committedText = committedRowValue(preview.row, field)
                      return editing ? rowDraftValue(draftRows, rowNumber, field, committedText) : committedText
                    }
                    const changeField = (field: DraftField) => (event: React.ChangeEvent<HTMLInputElement>) => {
                      draftChange(rowNumber, field, event.target.value)
                    }
                    const handleCellKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        commitRow(rowNumber)
                      } else if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelRow(rowNumber)
                      }
                    }
                    const entityValue = (field: DraftField, fallback: string) =>
                      editing ? rowDraftValue(draftRows, rowNumber, field, fallback) : fallback
                    return (
                      <tr key={rowNumber} data-status={rowStatus} className={`border-b align-top${editing ? ' bg-amber-50/50' : ''}`}>
                        <td className="p-2">{rowNumber}</td>
                        <td className="p-2"><Input aria-label={`Row ${rowNumber} date`} className="w-36" value={cellValue('date')} onChange={changeField('date')} onKeyDown={handleCellKeyDown} /></td>
                        <td className="p-2"><div className="flex gap-1"><Input aria-label={`Row ${rowNumber} start time`} className="w-24" value={cellValue('start_time')} onChange={changeField('start_time')} onKeyDown={handleCellKeyDown} /><Input aria-label={`Row ${rowNumber} end time`} className="w-24" value={cellValue('end_time')} onChange={changeField('end_time')} onKeyDown={handleCellKeyDown} /></div>{preview.row.crosses_midnight && <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-indigo-700"><Moon className="h-3 w-3" />{t('endsNextDay')}: {displayDate(preview.row.end_date)}</p>}</td>
                        <td className="p-2"><PreviewEntitySelect ariaLabel={`Row ${rowNumber} brand`} value={entityValue('brand_name', preview.row.brand_name)} onChange={value => draftChange(rowNumber, 'brand_name', value)} options={brands} /></td>
                        <td className="p-2"><PreviewEntitySelect ariaLabel={`Row ${rowNumber} platform`} value={entityValue('platform_name', preview.row.platform_name)} onChange={value => draftChange(rowNumber, 'platform_name', value)} options={platforms} /></td>
                        <td className="p-2"><PreviewEntitySelect ariaLabel={`Row ${rowNumber} campaign`} optional value={entityValue('campaign_name', preview.row.campaign_name || '')} onChange={value => draftChange(rowNumber, 'campaign_name', value)} options={campaigns} /></td>
                        <td className="p-2"><Input aria-label={`Row ${rowNumber} shift title`} className="w-48" value={cellValue('title')} onChange={changeField('title')} onKeyDown={handleCellKeyDown} /></td>
                        <td className="p-2"><Input aria-label={`Row ${rowNumber} studio`} className="w-36" value={cellValue('studio')} onChange={changeField('studio')} onKeyDown={handleCellKeyDown} /></td>
                        {previewStaffingNameFields.map(field => (
                          <td className="p-2" key={field}>
                            <Input
                              className="w-40"
                              data-testid={`schedule-preview-${field}`}
                              aria-label={`Row ${rowNumber} ${field.replaceAll('_', ' ')}`}
                              value={cellValue(field)}
                              onChange={changeField(field)}
                              onKeyDown={handleCellKeyDown}
                              placeholder="—"
                            />
                          </td>
                        ))}
                        {previewStaffingFields.map(field => (
                          <td className="p-2" key={field}>
                            <ScheduleImportStaffingInput
                              field={field}
                              rowNumber={rowNumber}
                              value={cellValue(field)}
                              onChange={value => draftChange(rowNumber, field, value)}
                            />
                          </td>
                        ))}
                        <td className="p-2">
                          {editing && (
                            <div className="mb-1 flex flex-wrap items-center gap-1">
                              <Button size="sm" variant="default" onClick={() => commitRow(rowNumber)} aria-label="Confirm edit"><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => cancelRow(rowNumber)} aria-label="Cancel edit"><X className="h-3 w-3" /></Button>
                              <span className="text-xs text-amber-700">Editing draft — Enter to confirm</span>
                            </div>
                          )}
                          {!editing && <Badge variant="outline" className={rowStatusClass(rowStatus)}>{importStatusLabel(rowStatus, t)}</Badge>}
                          {rowStatus === 'invalid' && <p className="mt-1 text-xs text-red-700">{t('importValidationDetails')}</p>}
                          {rowStatus === 'duplicate' && <p className="mt-1 text-xs text-slate-700">{t('duplicatePreserved')}</p>}
                          {preview.row.errors.map(message => <p key={message} className="mb-1 text-xs text-red-700">{message}</p>)}
                          {preview.row.warnings.map(message => <p key={message} className="mb-1 flex gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3 shrink-0" />{message}</p>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 md:hidden" data-testid="schedule-import-mobile-rows">
              {visiblePreviews.map(preview => {
                const status = previewStatusForRow(preview)
                const identity = [preview.row.date, `${preview.row.start_time}–${preview.row.end_time}`, preview.row.title || preview.row.brand_name].filter(Boolean).join(' · ')
                return <div key={preview.row.row_number} className={`rounded-md border p-3 ${rowStatusClass(status)}`}>
                  <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-muted-foreground">{t('importSourceRow')} {preview.row.row_number}</p><p className="font-medium">{identity || t('importNoRows')}</p></div><Badge variant="outline">{importStatusLabel(status, t)}</Badge></div>
                  <p className="mt-1 text-xs text-muted-foreground">{preview.row.brand_name} · {preview.row.platform_name}{preview.row.campaign_name ? ` · ${preview.row.campaign_name}` : ''}</p>
                  {preview.row.errors.map(message => <p key={message} className="mt-1 text-xs text-red-700">{message}</p>)}
                  {preview.row.warnings.map(message => <p key={message} className="mt-1 text-xs text-amber-700">{message}</p>)}
                </div>
              })}
            </div>
            {result.invalidRows > 0 && <p className="text-sm text-red-700">{t('correctRows')}</p>}
            {previewCounts && <p className="text-sm text-muted-foreground" data-testid="schedule-import-confirm-summary">{t('confirmImportSummary', { ready: previewCounts.ready, attention: previewAttention })}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(true)}>{t('cancel')}</Button>
              <Button variant="outline" onClick={confirmImport} disabled={busy || result.validRows === 0} aria-label={`${t('confirmImport')} (${result.validRows})`}>{busy ? t('loading') : `${t('confirmImport')} (${result.validRows})`}</Button>
              <Button onClick={confirmImport} disabled={busy || result.invalidRows > 0 || result.validRows === 0} aria-label={t('confirmImport')}>{busy ? t('loading') : t('confirmImport')}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {completedImport && completedCounts && <div ref={completedImportRef} tabIndex={-1}><ImportCompletionCard completed={completedImport} counts={completedCounts} t={t} /></div>}
      <LifecycleActionDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Remove import preview" impact={cancelImpact} confirmText="Remove preview" onConfirm={removePreview} />
    </div>
  )
}

type ImportTranslate = (key: TranslationKey, variables?: Record<string, string | number>) => string

function ImportSummary({ counts, t }: { counts: ImportPresentationCounts; t: ImportTranslate }) {
  const items: Array<[TranslationKey, number, string]> = [
    ['readyToImport', counts.ready, 'text-emerald-700'],
    ['importWarning', counts.warning, 'text-amber-700'],
    ['importValidationFailed', counts.invalid, 'text-red-700'],
    ['importDuplicateSkipped', counts.duplicate, 'text-slate-700'],
    ['importRetryable', counts.retryable, 'text-orange-700'],
  ]
  return <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-testid="schedule-import-summary" aria-label={t('importSummary')}>
    <span className="font-semibold text-foreground">{t('totalRows')}: {counts.total}</span>
    {items.map(([label, count, color]) => <span key={label} className={color}>{t(label)}: {count}</span>)}
  </div>
}

function ImportCompletionCard({ completed, counts, t }: { completed: CompletedImport; counts: ImportPresentationCounts; t: ImportTranslate }) {
  const attentionRows = completed.rows.filter(row => row.status !== 'imported')
  const statusForRow = (row: ImportBatchRow): ImportResultPresentationStatus => {
    if (row.status === 'imported') return 'imported'
    if (row.status === 'warning') return 'warning'
    if (row.status === 'duplicate_skipped') return 'duplicate'
    if (row.status === 'retryable') return 'retryable'
    if (row.status === 'validation_failed') return 'invalid'
    return 'ready'
  }
  return <Card data-testid="schedule-import-result" role="status" aria-live="polite" className="border-emerald-200">
    <CardHeader><CardTitle className="flex flex-wrap items-center justify-between gap-2"><span>{t('importCompleted')}</span><Badge variant="outline">{completed.source.name}</Badge></CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <ImportSummary counts={counts} t={t} />
      {counts.imported === 0 && <p className="text-sm text-muted-foreground">{t('importNothingPersisted')}</p>}
      {counts.retryable > 0 && <p className="text-sm text-orange-700">{t('retryableRecovery')} {t('retryUnavailable')}</p>}
      {attentionRows.length > 0 && <details open className="rounded-md border border-amber-200 bg-amber-50/50 p-3"><summary className="cursor-pointer text-sm font-medium">{t('importRowsNotCreated')}: {attentionRows.length}</summary><div className="mt-2 space-y-2">{attentionRows.map(row => <div key={row.id} className="rounded border bg-background p-2 text-sm"><div className="flex items-center justify-between gap-2"><span>{t('importSourceRow')} {row.source_row_number}</span><Badge variant="outline" className={rowStatusClass(statusForRow(row))}>{importStatusLabel(statusForRow(row), t)}</Badge></div>{row.failure_code && <p className="mt-1 text-xs text-muted-foreground">{statusForRow(row) === 'retryable' ? t('retryableRecovery') : statusForRow(row) === 'invalid' ? t('importValidationDetails') : t('notImported')}</p>}{row.validation_issues.map(issue => <p key={issue} className="mt-1 text-xs text-red-700">{issue}</p>)}</div>)}</div></details>}
    </CardContent>
  </Card>
}

function batchStatusLabel(status: ScheduleImportBatch['status'], t: ImportTranslate) {
  const key: Record<ScheduleImportBatch['status'], TranslationKey> = {
    previewed: 'importHistoryStatusPreviewed',
    confirmed: 'importHistoryStatusConfirmed',
    failed: 'importHistoryStatusFailed',
    cancelled: 'importHistoryStatusCancelled',
  }
  return t(key[status])
}

function PreviewEntitySelect({ value, onChange, options, optional = false, ariaLabel }: { value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; optional?: boolean; ariaLabel: string }) {
  const resolved = value
    ? options.find(option => normalizeLookup(option.name) === normalizeLookup(value))
    : undefined
  const unmatched = Boolean(value) && !resolved
  return (
    <Select value={resolved ? resolved.name : value || (optional ? 'none' : '')} onValueChange={next => onChange(next === 'none' ? '' : next)}>
      <SelectTrigger aria-label={ariaLabel} className="w-44"><SelectValue placeholder="Select mapping" /></SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value="none">—</SelectItem>}
        {unmatched && <SelectItem value={value}>{value}</SelectItem>}
        {options.map(option => <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function ImportHistoryPanel() {
  const { t } = useTranslation()
  const [history, setHistory] = React.useState<ScheduleImportBatch[]>([])
  const [changes, setChanges] = React.useState<ScheduleChangeLog[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [filters, setFilters] = React.useState({ date: '', actor: 'all', action: 'all', shift: 'all', brand: 'all', source: 'all' })
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [importPage, setImportPage] = React.useState(1)
  const [importPageSize, setImportPageSize] = React.useState(10)
  const [changePage, setChangePage] = React.useState(1)
  const [changePageSize, setChangePageSize] = React.useState(10)
  const loadHistory = React.useCallback(() => Promise.all([
    scheduleImportBatchPort.listBatches(),
    scheduleChangeService.getAll(),
    shiftService.getAll(),
    userService.getAll(),
    brandService.getAll(),
  ]).then(([imports, logs, loadedShifts, loadedUsers, loadedBrands]) => {
      setHistory(imports)
      setChanges(logs)
      setShifts(loadedShifts)
      setUsers(loadedUsers)
      setBrands(loadedBrands)
    }).catch((error: unknown) => {
      setLoadError(error)
    }).finally(() => {
      setLoading(false)
    }), [])
  React.useEffect(() => { void loadHistory() }, [loadHistory])
  const updateChangeFilter = (key: keyof typeof filters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }))
    setChangePage(1)
  }
  if (loading) return <div className="py-12 text-center" role="status" aria-live="polite" data-testid="schedule-import-history-loading">{t('loading')}</div>
  if (loadError) return <PageLoadError error={new Error(t('importLoadError'))} onRetry={() => { setLoadError(null); setLoading(true); void loadHistory() }} />
  const visibleChanges = changes.filter(log => {
    const shift = shifts.find(item => item.id === log.shift_id)
    return (!filters.date || log.timestamp.slice(0, 10) === filters.date) &&
      (filters.actor === 'all' || log.actor_id === filters.actor) &&
      (filters.action === 'all' || log.action === filters.action) &&
      (filters.shift === 'all' || log.shift_id === filters.shift) &&
      (filters.brand === 'all' || shift?.brand_id === filters.brand) &&
      (filters.source === 'all' || log.source === filters.source)
  })
  const pagedImports = history.slice((importPage - 1) * importPageSize, importPage * importPageSize)
  const pagedChanges = visibleChanges.slice((changePage - 1) * changePageSize, changePage * changePageSize)
  const actions = [...new Set(changes.map(log => log.action))]
  return (
    <Tabs defaultValue="imports">
      <TabsList>
        <TabsTrigger value="imports">{t('importHistory')}</TabsTrigger>
        <TabsTrigger value="changes">{t('scheduleChangeHistory')}</TabsTrigger>
      </TabsList>
      <TabsContent value="imports">
        {history.length === 0
          ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noImportHistory')}</CardContent></Card>
          : <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[520px] overflow-auto p-5"><table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('source')}</th><th className="p-2">{t('status')}</th><th className="p-2 text-right">{t('totalRows')}</th><th className="p-2 text-right">{t('validRows')}</th><th className="p-2 text-right">{t('invalidRows')}</th><th className="p-2 text-right">{t('warningRows')}</th><th className="p-2 text-right">{t('importedResult')}</th><th className="p-2 text-right">{t('importRetryable')}</th></tr></thead><tbody>{pagedImports.map(batch => <tr className="border-b" key={batch.id}><td className="p-2">{new Date(batch.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td><td className="p-2"><p className="font-medium">{batch.source === 'google_sheets' ? t('importGoogleSheets') : t('importExcel')}</p><p className="max-w-72 truncate text-xs text-muted-foreground">{batch.source_name}</p></td><td className="p-2"><Badge variant="outline">{batchStatusLabel(batch.status, t)}</Badge></td><td className="p-2 text-right">{batch.total_rows}</td><td className="p-2 text-right">{batch.valid_rows}</td><td className="p-2 text-right">{batch.invalid_rows}</td><td className="p-2 text-right">{batch.warning_rows}</td><td className="p-2 text-right">{batch.imported_rows ?? '—'}</td><td className="p-2 text-right">{batch.retryable_rows ?? '—'}</td></tr>)}</tbody></table></div><HistoryPagination page={importPage} pageSize={importPageSize} total={history.length} onPageChange={setImportPage} onPageSizeChange={size => { setImportPageSize(size); setImportPage(1) }} /></CardContent></Card>}
      </TabsContent>
      <TabsContent value="changes">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Input type="date" value={filters.date} onChange={event => updateChangeFilter('date', event.target.value)} />
              <HistorySelect value={filters.actor} onChange={value => updateChangeFilter('actor', value)} allLabel={t('actor')} options={users.map(user => ({ id: user.id, name: user.full_name }))} />
              <HistorySelect value={filters.action} onChange={value => updateChangeFilter('action', value)} allLabel={t('action')} options={actions.map(action => ({ id: action, name: action }))} />
              <HistorySelect value={filters.shift} onChange={value => updateChangeFilter('shift', value)} allLabel={t('shiftTitle')} options={shifts.map(shift => ({ id: shift.id, name: shift.title || `${shift.date} ${shift.start_time}` }))} />
              <HistorySelect value={filters.brand} onChange={value => updateChangeFilter('brand', value)} allLabel={t('brand')} options={brands} />
              <HistorySelect value={filters.source} onChange={value => updateChangeFilter('source', value)} allLabel={t('source')} options={['manual','excel_import','google_sheets','system'].map(source => ({ id: source, name: source.replaceAll('_', ' ') }))} />
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="sticky top-0 bg-background"><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('actor')}</th><th className="p-2">{t('action')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('before')}</th><th className="p-2">{t('after')}</th><th className="p-2">{t('source')}</th><th className="p-2">{t('reason')}</th><th className="p-2">{t('status')}</th></tr></thead>
                <tbody>{pagedChanges.map(log => <tr key={log.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td><td className="p-2">{users.find(user => user.id === log.actor_id)?.full_name || log.actor_id}</td><td className="p-2"><Badge variant="outline">{log.action}</Badge></td><td className="p-2">{shifts.find(shift => shift.id === log.shift_id)?.title || log.shift_id}</td><td className="max-w-64 p-2 text-xs"><ChangeValue value={log.before} /></td><td className="max-w-64 p-2 text-xs"><ChangeValue value={log.after} /></td><td className="p-2">{log.source.replaceAll('_', ' ')}</td><td className="p-2">{log.reason || '—'}</td><td className="p-2"><Badge>{log.status}</Badge></td></tr>)}</tbody>
              </table>
            </div>
            <HistoryPagination page={changePage} pageSize={changePageSize} total={visibleChanges.length} onPageChange={setChangePage} onPageSizeChange={size => { setChangePageSize(size); setChangePage(1) }} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function HistorySelect({ value, onChange, allLabel, options }: { value: string; onChange: (value: string) => void; allLabel: string; options: Array<{ id: string; name: string }> }) {
  const { t } = useTranslation()
  return <Select value={value} onValueChange={onChange}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')} {allLabel}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select>
}

function ChangeValue({ value }: { value?: Record<string, unknown> }) {
  if (!value) return <>—</>
  return <div className="space-y-0.5">{Object.entries(value).filter(([, item]) => item !== undefined).slice(0, 8).map(([key, item]) => <p key={key}><span className="font-medium">{key}:</span> {String(item)}</p>)}</div>
}

function displayDate(value?: string) {
  if (!value) return '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}
