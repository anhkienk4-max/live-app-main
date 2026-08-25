'use client'

import * as React from 'react'
import { AlertTriangle, Check, CheckCircle2, Download, FileSpreadsheet, Link2, Moon, Plus, Upload, X } from 'lucide-react'
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
import { useTranslation } from '@/lib/i18n'
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
  mapImportResultToBatchRows,
  summarizeImportResult,
} from '@/lib/utils/scheduleImportBatch'
import { processScheduleImportRows } from '@/lib/utils/scheduleImportRecovery'
import { scheduleImportBatchPort } from '@/lib/services/scheduleImportBatchPort'
import {
  type MasterDataState,
  importGate,
} from '@/lib/utils/scheduleImportReadiness'

type Source = { type: 'excel' | 'google_sheets'; name: string }

export function ScheduleImportStaffingInput({
  field,
  value,
  onChange,
}: {
  field: typeof previewStaffingFields[number]
  value: number | string
  onChange: (value: string) => void
}) {
  return (
    <Input
      className="w-20"
      data-testid={`schedule-preview-${field}`}
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
  const [previewFilter, setPreviewFilter] = React.useState<'all' | 'valid' | 'warning' | 'error'>('all')
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [draftRows, setDraftRows] = React.useState<DraftRows>({})

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
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
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
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
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
    if (!result || !batch || result.validRows === 0) return
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
          const updated = await shiftService.updateStaffingLabels(shiftId, labels)
          if (updated) setExistingShifts(prev => prev.map(s => s.id === updated.id ? updated : s))
          return updated
        },
      })
      const importedCount = importResult.imported + importResult.recovered
      if (importResult.retryable > 0) {
        await scheduleImportBatchPort.markBatchStatus(batch.id, 'failed')
        toast({
          title: t('error'),
          description: `${importedCount} row(s) imported; ${importResult.retryable} row(s) were marked for retry.`,
          variant: 'destructive',
        })
        setExistingShifts(await shiftService.getAll())
        onImported?.()
        return
      }
      await scheduleImportBatchPort.markBatchStatus(batch.id, 'confirmed')
      toast({ title: t('success'), description: `${result.validRows} ${t('validRows')}`, variant: 'success' })
      setResult(null)
      setBatch(null)
      setSource(null)
      setExistingShifts(await shiftService.getAll())
      onImported?.()
    } catch (error) {
      await scheduleImportBatchPort.markBatchStatus(batch.id, 'failed').catch(() => undefined)
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
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
      toast({ title: 'Import preview removed', variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  if (userLoading || !currentUser) return <div className="py-12 text-center">{t('loading')}</div>
  if (!hasPermission(currentUser, 'shifts.import')) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">{t('permissionDenied')}</CardContent></Card>
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5" />{t('importExcel')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">XLSX / XLS</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileInputRef.current?.click()} disabled={busy || !masterGate.allowed}><Upload className="mr-2 h-4 w-4" />{t('importExcel')}</Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only" onChange={handleFile} />
              <Button variant="outline" onClick={downloadExcelTemplate}><Download className="mr-2 h-4 w-4" />{t('downloadTemplate')}</Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-5 w-5" />{t('importGoogleSheets')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('googleSheetsHelp')}</p>
            <div className="flex flex-col gap-2 sm:flex-row"><Input className="min-w-0" value={googleUrl} onChange={event => setGoogleUrl(event.target.value)} placeholder="https://docs.google.com/spreadsheets/... or mock://schedule" /><Button className="shrink-0" onClick={handleGoogle} disabled={busy || !masterGate.allowed || !googleUrl}>{t('importGoogleSheets')}</Button></div>
          </CardContent>
        </Card>
      </div>

      {masterGate.message && (
        <p className="text-sm font-medium text-red-700">{masterGate.message}</p>
      )}

      {result && source && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><CardTitle>{t('importPreview')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t('source')}: {source.name}</p></div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{t('totalRows')}: {result.totalRows}</Badge>
                <Badge className="bg-green-100 text-green-800">{t('validRows')}: {result.validRows}</Badge>
                <Badge className="bg-red-100 text-red-800">{t('invalidRows')}: {result.invalidRows}</Badge>
                <Badge className="bg-amber-100 text-amber-800">{t('warningRows')}: {result.warningRows}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                {(['all', 'valid', 'warning', 'error'] as const).map(filter => (
                  <Button key={filter} size="sm" variant={previewFilter === filter ? 'default' : 'outline'} onClick={() => setPreviewFilter(filter)}>
                    {filter === 'all' ? t('all') : filter === 'valid' ? t('validRows') : filter === 'warning' ? t('warningRows') : t('invalidRows')}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={addPreviewRow}><Plus className="mr-2 h-4 w-4" />{t('addImportRow')}</Button>
                {(result.errors.length > 0 || result.warnings.length > 0) && <Button size="sm" variant="outline" onClick={() => downloadScheduleImportErrors(result)}><Download className="mr-2 h-4 w-4" />Download errors</Button>}
              </div>
            </div>
            <div className="max-h-[560px] overflow-auto rounded-lg border">
              <table className="min-w-[1780px] w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background"><tr className="border-b text-left"><th className="p-2">#</th><th className="p-2">{t('date')}</th><th className="p-2">{t('time')}</th><th className="p-2">{t('brand')}</th><th className="p-2">{t('platform')}</th><th className="p-2">{t('campaign')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('studio')}</th><th className="p-2">{t('importHostNames')}</th><th className="p-2">{t('importAssistantNames')}</th><th className="p-2">{t('importTechnicalNames')}</th><th className="p-2">{t('requiredHostCount')}</th><th className="p-2">{t('requiredSupportCount')}</th><th className="p-2">{t('requiredTechnicalCount')}</th><th className="min-w-64 p-2">{t('status')}</th></tr></thead>
                <tbody>
                  {result.rows.filter(preview =>
                    previewFilter === 'all' ||
                    (previewFilter === 'valid' && preview.row.errors.length === 0 && preview.row.warnings.length === 0) ||
                    (previewFilter === 'warning' && preview.row.warnings.length > 0) ||
                    (previewFilter === 'error' && preview.row.errors.length > 0)
                  ).map(preview => {
                    const rowNumber = preview.row.row_number
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
                      <tr key={rowNumber} className={`border-b align-top${editing ? ' bg-amber-50/50' : ''}`}>
                        <td className="p-2">{rowNumber}</td>
                        <td className="p-2"><Input className="w-36" value={cellValue('date')} onChange={changeField('date')} onKeyDown={handleCellKeyDown} /></td>
                        <td className="p-2"><div className="flex gap-1"><Input className="w-24" value={cellValue('start_time')} onChange={changeField('start_time')} onKeyDown={handleCellKeyDown} /><Input className="w-24" value={cellValue('end_time')} onChange={changeField('end_time')} onKeyDown={handleCellKeyDown} /></div>{preview.row.crosses_midnight && <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-indigo-700"><Moon className="h-3 w-3" />{t('endsNextDay')}: {displayDate(preview.row.end_date)}</p>}</td>
                        <td className="p-2"><PreviewEntitySelect value={entityValue('brand_name', preview.row.brand_name)} onChange={value => draftChange(rowNumber, 'brand_name', value)} options={brands} /></td>
                        <td className="p-2"><PreviewEntitySelect value={entityValue('platform_name', preview.row.platform_name)} onChange={value => draftChange(rowNumber, 'platform_name', value)} options={platforms} /></td>
                        <td className="p-2"><PreviewEntitySelect optional value={entityValue('campaign_name', preview.row.campaign_name || '')} onChange={value => draftChange(rowNumber, 'campaign_name', value)} options={campaigns} /></td>
                        <td className="p-2"><Input className="w-48" value={cellValue('title')} onChange={changeField('title')} onKeyDown={handleCellKeyDown} /></td>
                        <td className="p-2"><Input className="w-36" value={cellValue('studio')} onChange={changeField('studio')} onKeyDown={handleCellKeyDown} /></td>
                        {previewStaffingNameFields.map(field => (
                          <td className="p-2" key={field}>
                            <Input
                              className="w-40"
                              data-testid={`schedule-preview-${field}`}
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
                          {!editing && preview.row.errors.length === 0 && preview.row.warnings.length === 0 && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {preview.row.errors.map(message => <p key={message} className="mb-1 text-xs text-red-700">{message}</p>)}
                          {preview.row.warnings.map(message => <p key={message} className="mb-1 flex gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3 shrink-0" />{message}</p>)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {result.invalidRows > 0 && <p className="text-sm text-red-700">{t('correctRows')}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(true)}>{t('cancel')}</Button>
              <Button variant="outline" onClick={confirmImport} disabled={busy || result.validRows === 0}>{busy ? t('loading') : `Import valid rows (${result.validRows})`}</Button>
              <Button onClick={confirmImport} disabled={busy || result.invalidRows > 0 || result.validRows === 0}>{busy ? t('loading') : `Import all after fix (${result.validRows})`}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      <LifecycleActionDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Remove import preview" impact={cancelImpact} confirmText="Remove preview" onConfirm={removePreview} />
    </div>
  )
}

function PreviewEntitySelect({ value, onChange, options, optional = false }: { value: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; optional?: boolean }) {
  const resolved = value
    ? options.find(option => normalizeLookup(option.name) === normalizeLookup(value))
    : undefined
  const unmatched = Boolean(value) && !resolved
  return (
    <Select value={resolved ? resolved.name : value || (optional ? 'none' : '')} onValueChange={next => onChange(next === 'none' ? '' : next)}>
      <SelectTrigger className="w-44"><SelectValue placeholder="Select mapping" /></SelectTrigger>
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
  if (loading) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoadError(null); setLoading(true); void loadHistory() }} />
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
          : <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[520px] overflow-auto p-5"><table className="w-full text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('source')}</th><th className="p-2">{t('status')}</th><th className="p-2 text-right">{t('totalRows')}</th><th className="p-2 text-right">{t('validRows')}</th><th className="p-2 text-right">{t('invalidRows')}</th><th className="p-2 text-right">{t('warningRows')}</th><th className="p-2 text-right">Imported</th><th className="p-2 text-right">Retryable</th></tr></thead><tbody>{pagedImports.map(batch => <tr className="border-b" key={batch.id}><td className="p-2">{new Date(batch.created_at).toLocaleString()}</td><td className="p-2"><p className="font-medium">{batch.source === 'google_sheets' ? 'Google Sheets' : 'Excel'}</p><p className="max-w-72 truncate text-xs text-muted-foreground">{batch.source_name}</p></td><td className="p-2"><Badge variant="outline">{batch.status}</Badge></td><td className="p-2 text-right">{batch.total_rows}</td><td className="p-2 text-right">{batch.valid_rows}</td><td className="p-2 text-right">{batch.invalid_rows}</td><td className="p-2 text-right">{batch.warning_rows}</td><td className="p-2 text-right">{batch.imported_rows ?? '—'}</td><td className="p-2 text-right">{batch.retryable_rows ?? '—'}</td></tr>)}</tbody></table></div><HistoryPagination page={importPage} pageSize={importPageSize} total={history.length} onPageChange={setImportPage} onPageSizeChange={size => { setImportPageSize(size); setImportPage(1) }} /></CardContent></Card>}
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
