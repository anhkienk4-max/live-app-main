'use client'

import * as React from 'react'
import { AlertTriangle, Check, Download, Edit3, FileSpreadsheet, Filter, Link2, Moon, Plus, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import {
  brandService,
  campaignService,
  currentUserService,
  platformService,
  scheduleChangeService,
  shiftService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DeletionImpact, Platform, ScheduleImportBatch, Shift, User, type SupplementalShiftFieldType } from '@/lib/types/database.types'
import { hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import {
  downloadExcelTemplate,
  downloadScheduleImportErrors,
  importShiftsFromExcel,
  importShiftsFromGoogleSheetsUrl,
  normalizeLookup,
  type ImportResult,
  type AgencyCode,
  agencyDisplayLabel,
  parseScheduleRows,
} from '@/lib/utils/excelUtils'
import { executionSourceDisplayLabel, executionSourceForAgency, normalizeAgencyCode } from '@/lib/utils/executionSource'
import {
  applyImportColumnMappings,
  operationalImportFields,
  type ImportColumnMapping,
  type OperationalImportField,
} from '@/lib/utils/scheduleImportColumnMapping'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { PageLoadError } from '@/components/ui/page-load-error'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
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
  isNotImportedResultRow,
  persistedImportCount,
  previewPresentationCounts,
  previewPresentationStatus,
  type ImportPresentationCounts,
  type ImportPreviewPresentationStatus,
  type ImportResultPresentationStatus,
} from '@/lib/utils/scheduleImportUx'
import { scheduleArchiveFailureMessage } from '@/lib/utils/scheduleArchiveMessage'
import { processScheduleImportRows } from '@/lib/utils/scheduleImportRecovery'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { scheduleImportBatchPort, scheduleImportHistoryService } from '@/lib/services/scheduleImportBatchPort'
import { uploadScheduleSourceFile, verifyScheduleSourceFile } from '@/lib/services/scheduleSourceStorageService'
import { planScheduleImportArchive, persistScheduleArchive, type ScheduleArchivePlan } from '@/lib/utils/scheduleImportArchive'
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
  archiveStatus?: string
  archiveIncomplete?: boolean
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
  onKeyDown,
}: {
  field: typeof previewStaffingFields[number]
  rowNumber?: number
  value: number | string
  onChange: (value: string) => void
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <Input
      className="w-20"
      data-testid={`schedule-preview-${field}`}
      aria-label={`${rowNumber === undefined ? '' : `Row ${rowNumber} `}${field.replaceAll('_', ' ')}`}
      min="0"
      onChange={event => onChange(event.target.value)}
      onKeyDown={onKeyDown}
      step="1"
      type="number"
      value={value}
    />
  )
}

export function ScheduleImportPanel({ onImported }: { onImported?: () => void }) {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { t, language } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const originalImportFileRef = React.useRef<File | null>(null)
  const incompleteArchiveRef = React.useRef<ScheduleArchivePlan | null>(null)
  const completedImportRef = React.useRef<HTMLDivElement>(null)
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [existingShifts, setExistingShifts] = React.useState<Shift[]>([])
  const [googleUrl, setGoogleUrl] = React.useState('')
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [source, setSource] = React.useState<Source | null>(null)
  const [batch, setBatch] = React.useState<ScheduleImportBatch | null>(null)
  const [sourceFileId, setSourceFileId] = React.useState<string | null>(null)
  const [sourceFileStatus, setSourceFileStatus] = React.useState<'not_required' | 'saving' | 'saved' | 'failed'>('not_required')
  const [busy, setBusy] = React.useState(false)
  const [masterState, setMasterState] = React.useState<MasterDataState>('loading')
  const [previewFilter, setPreviewFilter] = React.useState<PreviewFilter>('all')
  const [previewSearch, setPreviewSearch] = React.useState('')
  const [previewPage, setPreviewPage] = React.useState(1)
  const [previewPageSize, setPreviewPageSize] = React.useState(50)
  const [selectedRowNumbers, setSelectedRowNumbers] = React.useState<Set<number>>(new Set())
  const [previewMaxHeight, setPreviewMaxHeight] = React.useState(560)
  const [previewMinWidth, setPreviewMinWidth] = React.useState(1780)
  const [customHeaderDrafts, setCustomHeaderDrafts] = React.useState<Record<string, string>>({})
  const [columnMappings, setColumnMappings] = React.useState<Record<string, ImportColumnMapping>>({})
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [draftRows, setDraftRows] = React.useState<DraftRows>({})
  const [batchAgency, setBatchAgency] = React.useState<AgencyCode | null>(null)
  const [completedImport, setCompletedImport] = React.useState<CompletedImport | null>(null)
  const [retryingArchive, setRetryingArchive] = React.useState(false)

  // Column filters state (Task 1: Issue #161 & Owner ID 05)
  const [filterBrand, setFilterBrand] = React.useState<string>('all')
  const [filterPlatform, setFilterPlatform] = React.useState<string>('all')
  const [filterStudio, setFilterStudio] = React.useState<string>('all')
  const [filterAgency, setFilterAgency] = React.useState<string>('all')
  const [filterCampaign, setFilterCampaign] = React.useState<string>('all')
  const [filterDate, setFilterDate] = React.useState<string>('')
  const [filterValidation, setFilterValidation] = React.useState<'all' | 'valid' | 'has_errors' | 'has_warnings'>('all')

  // Single row delete confirmation (Issue #161 & Owner ID 03)
  const [deleteConfirmRowNumber, setDeleteConfirmRowNumber] = React.useState<number | null>(null)
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = React.useState(false)

  // Undo delete stack (Task 1: Issue #161)
  type DeletedRowEntry = {
    row: ReturnType<typeof sourceRowsFromPreview>[number]
    index: number
    rowNumber: number
    draft?: DraftRows[number]
  }
  const [undoStack, setUndoStack] = React.useState<DeletedRowEntry[]>([])

  // Bulk Edit modal state (Task 1: Issue #161 & Owner ID 04)
  const [bulkModalOpen, setBulkModalOpen] = React.useState(false)
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false)
  const [bulkExecutionSource, setBulkExecutionSource] = React.useState<string>('')
  const [bulkAgencyCode, setBulkAgencyCode] = React.useState<string>('')
  const [bulkBrandName, setBulkBrandName] = React.useState<string>('')
  const [bulkPlatformName, setBulkPlatformName] = React.useState<string>('')
  const [bulkStudio, setBulkStudio] = React.useState<string>('')

  React.useEffect(() => {
    setPreviewPage(1)
  }, [previewFilter, previewSearch, filterBrand, filterPlatform, filterStudio, filterAgency, filterCampaign, filterDate, filterValidation])

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
    incompleteArchiveRef.current = null
    setPreviewFilter('all')
    setPreviewSearch('')
    setPreviewPage(1)
    setSelectedRowNumbers(new Set())
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
    return created
  }

  const clearPreviewForNewImport = () => {
    setCompletedImport(null)
    setResult(null)
    setSource(null)
    setBatch(null)
    setSourceFileStatus('not_required')
    setSourceFileId(null)
    setColumnMappings({})
    originalImportFileRef.current = null
  }

  const saveOriginalScheduleSource = async (batchId: string, file: File) => {
    return uploadScheduleSourceFile(batchId, file)
  }

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !masterGate.allowed) {
      if (file && masterGate.message) {
        toast({ title: t('error'), description: masterGate.message, variant: 'destructive' })
      }
      return
    }
    clearPreviewForNewImport()
    setBusy(true)
    try {
      const next = await importShiftsFromExcel(file, maps.brands, maps.platforms, maps.campaigns, undefined, existingShifts, { batchAgency })
      originalImportFileRef.current = file
      const created = await recordPreview(next, { type: 'excel', name: file.name })
      setSourceFileStatus('saving')
      try {
        const receipt = await saveOriginalScheduleSource(created.id, file)
        setSourceFileId(receipt.id)
        setSourceFileStatus('saved')
      } catch (error) {
        setSourceFileStatus('failed')
        toast({ title: t('error'), description: safeImportError(error, t('importSourceRequired')), variant: 'destructive' })
      }
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
    clearPreviewForNewImport()
    setBusy(true)
    try {
      const next = await importShiftsFromGoogleSheetsUrl(googleUrl, maps.brands, maps.platforms, maps.campaigns, existingShifts, { batchAgency })
      await recordPreview(next, { type: 'google_sheets', name: googleUrl })
      originalImportFileRef.current = null
      setSourceFileStatus('not_required')
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
    }, existingShifts, { batchAgency }))
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
    const existingCustomFields = Object.fromEntries(customColumnNames.map(name => [name, '']))
    const nextRows = [
      ...sourceRowsFromPreview(),
      normalizeScheduleImportSourceRow({
        Date: '',
        'Start time': '09:00',
        'End time': '13:00',
        Brand: '',
        Platform: '',
        Campaign: '',
        'Execution Source': '',
        'Shift title': '',
        Studio: '',
        required_host_count: DEFAULT_SHIFT_STAFFING.required_host_count,
        required_support_count: DEFAULT_SHIFT_STAFFING.required_support_count,
        required_technical_count: DEFAULT_SHIFT_STAFFING.required_technical_count,
        Notes: '',
        custom_fields: existingCustomFields,
      }),
    ]
    applySourceRows(nextRows)
    setPreviewPage(Math.ceil(nextRows.length / previewPageSize))
  }

  const addCustomColumn = () => {
    const existing = new Set(customColumnNames.map(name => name.toLocaleLowerCase()))
    let index = 1
    const base = language === 'vi' ? 'Cột tùy chỉnh' : 'Custom column'
    while (existing.has(`${base} ${index}`.toLocaleLowerCase())) index += 1
    const name = `${base} ${index}`
    applySourceRows(sourceRowsFromPreview().map(sourceRow => ({
      ...sourceRow,
      custom_fields: { ...((sourceRow.custom_fields as Record<string, string> | undefined) ?? {}), [name]: '' },
    })))
  }

  const renameCustomColumn = (oldName: string, requestedName: string) => {
    const newName = requestedName.trim()
    if (!newName || newName === oldName) {
      setCustomHeaderDrafts(current => ({ ...current, [oldName]: oldName }))
      return
    }
    if (customColumnNames.some(name => name !== oldName && name.toLocaleLowerCase() === newName.toLocaleLowerCase())) {
      toast({ title: t('error'), description: language === 'vi' ? 'Tên cột đã tồn tại.' : 'That column name already exists.', variant: 'destructive' })
      setCustomHeaderDrafts(current => ({ ...current, [oldName]: oldName }))
      return
    }
    const sourceRows = sourceRowsFromPreview().map((sourceRow, index) => {
      const rowNumber = result?.rows[index]?.row.row_number ?? -1
      const committed = commitRowDraftToSource(sourceRow, draftRows[rowNumber] ?? {})
      const fields = { ...((committed.custom_fields as Record<string, string> | undefined) ?? {}) }
      const value = fields[oldName] ?? ''
      delete fields[oldName]
      fields[newName] = value
      return { ...committed, custom_fields: fields }
    })
    applySourceRows(sourceRows)
    setDraftRows({})
    setCustomHeaderDrafts(current => {
      const next = { ...current, [newName]: newName }
      delete next[oldName]
      return next
    })
    setColumnMappings(current => {
      const next = { ...current }
      if (next[oldName]) next[newName] = next[oldName]
      delete next[oldName]
      return next
    })
  }

  const removePreviewRow = (rowNumber: number) => {
    const sourceRows = sourceRowsFromPreview()
    const index = result?.rows.findIndex(preview => preview.row.row_number === rowNumber) ?? -1
    if (index >= 0 && sourceRows[index]) {
      const removedRow = sourceRows[index]
      const existingDraft = draftRows[rowNumber]
      setUndoStack(prev => [...prev, { row: removedRow, index, rowNumber, draft: existingDraft }])
      sourceRows.splice(index, 1)
      applySourceRows(sourceRows)
      setDraftRows(prev => removeRowDraft(prev, rowNumber))
      setSelectedRowNumbers(prev => {
        const next = new Set(prev)
        next.delete(rowNumber)
        return next
      })
      const maxPage = Math.max(1, Math.ceil(sourceRows.length / previewPageSize))
      if (previewPage > maxPage) {
        setPreviewPage(maxPage)
      }
      toast({
        title: language === 'vi' ? 'Đã xóa dòng' : 'Row deleted',
        description: language === 'vi' ? `Đã xóa dòng ${rowNumber}. Nhấn Hoàn tác để khôi phục.` : `Deleted row ${rowNumber}. Click Undo to restore.`,
      })
    }
  }

  const undoLastDelete = () => {
    if (undoStack.length === 0) return
    const last = undoStack[undoStack.length - 1]
    const sourceRows = sourceRowsFromPreview()
    const insertIdx = Math.min(last.index, sourceRows.length)
    sourceRows.splice(insertIdx, 0, last.row)
    applySourceRows(sourceRows)
    if (last.draft) {
      setDraftRows(prev => ({ ...prev, [last.rowNumber]: last.draft! }))
    }
    setUndoStack(prev => prev.slice(0, prev.length - 1))
    toast({
      title: language === 'vi' ? 'Đã hoàn tác' : 'Action undone',
      description: language === 'vi' ? `Đã khôi phục dòng ${last.rowNumber}.` : `Restored row ${last.rowNumber}.`,
      variant: 'success',
    })
  }

  const removeCustomColumn = (columnName: string) => {
    const sourceRows = sourceRowsFromPreview().map((sourceRow, index) => {
      const rowNumber = result?.rows[index]?.row.row_number ?? -1
      const committed = commitRowDraftToSource(sourceRow, draftRows[rowNumber] ?? {})
      const fields = { ...((committed.custom_fields as Record<string, string> | undefined) ?? {}) }
      delete fields[columnName]
      return { ...committed, custom_fields: fields }
    })
    applySourceRows(sourceRows)
    setDraftRows({})
    setCustomHeaderDrafts(current => {
      const next = { ...current }
      delete next[columnName]
      return next
    })
    setColumnMappings(current => {
      const next = { ...current }
      delete next[columnName]
      return next
    })
  }

  const bulkUpdateSelected = (updates: Partial<{ execution_source: string; brand_name: string; platform_name: string; studio: string; agency: string; agency_code: string }>) => {
    if (selectedRowNumbers.size === 0) return
    const sourceRows = sourceRowsFromPreview()
    let changed = false
    result?.rows.forEach((preview, index) => {
      if (selectedRowNumbers.has(preview.row.row_number) && sourceRows[index]) {
        let row = sourceRows[index]
        if (updates.execution_source !== undefined) {
          row = { ...row, 'Execution Source': updates.execution_source }
          changed = true
        }
        if (updates.brand_name !== undefined) {
          row = { ...row, Brand: updates.brand_name }
          changed = true
        }
        if (updates.platform_name !== undefined) {
          row = { ...row, Platform: updates.platform_name }
          changed = true
        }
        if (updates.studio !== undefined) {
          row = { ...row, Studio: updates.studio }
          changed = true
        }
        if (updates.agency_code !== undefined || updates.agency !== undefined) {
          const agencyLabel = updates.agency || (updates.agency_code ? agencyDisplayLabel(updates.agency_code as AgencyCode) : '')
          const customFields = { ...((row.custom_fields as Record<string, string> | undefined) ?? {}) }
          customFields.Agency = agencyLabel
          row = { ...row, Agency: agencyLabel, custom_fields: customFields }
          if (updates.execution_source === undefined && updates.agency_code) {
            row['Execution Source'] = executionSourceForAgency(updates.agency_code as AgencyCode)
          }
          changed = true
        }
        sourceRows[index] = row
      }
    })
    if (changed) {
      applySourceRows(sourceRows)
      setDraftRows({})
      toast({
        title: language === 'vi' ? 'Cập nhật hàng loạt thành công' : 'Bulk update successful',
        description: language === 'vi' ? `Đã áp dụng thay đổi cho ${selectedRowNumbers.size} dòng.` : `Applied updates to ${selectedRowNumbers.size} rows.`,
        variant: 'success',
      })
    }
  }

  const bulkDeleteSelected = () => {
    if (selectedRowNumbers.size === 0) return
    const sourceRows = sourceRowsFromPreview()
    const deletedEntries: DeletedRowEntry[] = []
    const keptRows: ReturnType<typeof sourceRowsFromPreview> = []
    result?.rows.forEach((preview, index) => {
      const rowNum = preview.row.row_number
      if (selectedRowNumbers.has(rowNum) && sourceRows[index]) {
        deletedEntries.push({
          row: sourceRows[index],
          index,
          rowNumber: rowNum,
          draft: draftRows[rowNum],
        })
      } else if (sourceRows[index]) {
        const committedRow = draftRows[rowNum]
          ? commitRowDraftToSource(sourceRows[index], draftRows[rowNum])
          : sourceRows[index]
        keptRows.push(committedRow)
      }
    })
    setUndoStack(prev => [...prev, ...deletedEntries])
    applySourceRows(keptRows)
    const count = selectedRowNumbers.size
    setSelectedRowNumbers(new Set())
    setDraftRows({})
    const maxPage = Math.max(1, Math.ceil(keptRows.length / previewPageSize))
    if (previewPage > maxPage) {
      setPreviewPage(maxPage)
    }
    toast({
      title: language === 'vi' ? 'Đã xóa hàng loạt' : 'Bulk deleted',
      description: language === 'vi' ? `Đã xóa ${count} dòng. Bạn có thể nhấn Hoàn tác.` : `Deleted ${count} rows. You can click Undo.`,
    })
  }

  // This archive is deliberately isolated from import-batch state transitions.
  // A storage outage must never mark already imported shifts as failed.
  const archiveCompletedSchedule = async (sourceType: Source['type'], batchId: string, previews: ImportResult['rows'], persistedRows: number) => {
    let plan: ScheduleArchivePlan | null = null
    try {
      plan = planScheduleImportArchive({
      batchId, previews, brands, platforms, sourceType,
      sourceFile: sourceType === 'excel' ? originalImportFileRef.current : null,
      maxFileBytes: 4 * 1024 * 1024,
    })
      incompleteArchiveRef.current = plan
      const saved = await persistScheduleArchive(plan)
      const partial = saved.unresolved > 0 || (!saved.originalSourceArchived && sourceType === 'excel')
      incompleteArchiveRef.current = null
      const status = saved.archived
        ? `Đã lưu ${saved.archived} file lịch vào Google Drive (trong đó ${saved.reused} file đã tồn tại).`
        : 'Không có dòng lịch nào có ngữ cảnh đủ an toàn để tự lưu.'
      const note = saved.unresolved
        ? ` ${saved.unresolved} dòng thiếu Brand/Platform/Ngày/Nguồn vận hành nên không tự lưu; cần kiểm tra thủ công.`
        : ''
      const originalNote = !saved.originalSourceArchived && sourceType === 'excel'
        ? ' File Excel gốc chưa lưu vì chứa nhiều phạm vi hoặc vượt giới hạn 4 MB; các bản preview đã được phân vùng theo brand.'
        : ''
      return { archiveStatus: status + note + originalNote, archiveIncomplete: partial }
    } catch (error) {
      return {
        archiveStatus: scheduleArchiveFailureMessage(error, persistedRows),
        archiveIncomplete: true,
      }
    }
  }

  const retryCompletedArchive = async () => {
    const plan = incompleteArchiveRef.current
    if (!plan || !completedImport || retryingArchive) return
    setRetryingArchive(true)
    try {
      const saved = await persistScheduleArchive(plan)
      const partial = saved.unresolved > 0 || (!saved.originalSourceArchived && completedImport.source.type === 'excel')
      incompleteArchiveRef.current = null
      setCompletedImport(prev => prev ? {
        ...prev,
        archiveStatus: `Đồng bộ Drive: ${saved.archived} file (đã tồn tại: ${saved.reused}).`
          + (saved.unresolved ? ` Vẫn còn ${saved.unresolved} dòng chưa phân vùng được.` : '')
          + (!saved.originalSourceArchived && prev.source.type === 'excel' ? ' File Excel gốc không được sao chép vào folder brand.' : ''),
        archiveIncomplete: partial,
      } : prev)
    } catch (error) {
      setCompletedImport(prev => prev ? {
        ...prev, archiveIncomplete: true,
        archiveStatus: scheduleArchiveFailureMessage(error, persistedImportCount(batchPresentationCounts(prev.rows))),
      } : prev)
    } finally { setRetryingArchive(false) }
  }

  const confirmImport = async () => {
    if (!result || !batch || !source || hasPendingDrafts || hasAgencySourceConflict || importableCount === 0
      || (source.type === 'excel' && (sourceFileStatus !== 'saved' || !sourceFileId))) return
    const completedSource = source
    setBusy(true)
    try {
      if (completedSource.type === 'excel') {
        if (!sourceFileId) throw new Error('SCHEDULE_SOURCE_REQUIRED')
        await verifyScheduleSourceFile(sourceFileId)
      }
      const batchRows = await scheduleImportBatchPort.listBatchRows(batch.id)
      const mappedImport = applyImportColumnMappings(result, columnMappings)
      const importResult = await processScheduleImportRows({
        batchId: batch.id,
        previews: mappedImport.rows,
        batchRows,
        initialShifts: existingShifts,
        createShift: shiftService.create,
        refreshShifts: shiftService.getAll,
        updateShift: (shiftId, patch) => shiftService.update(shiftId, patch),
        recordOutcome: async ({ rowNumber, outcome, expectedOutcome, shiftId, failureCode }) => {
          await scheduleImportBatchPort.recordRowOutcome(batch.id, rowNumber, outcome, {
            expectedOutcome,
            shiftId,
            failureCode,
          })
        },
        updateStaffingLabels: async (shiftId, labels, expectedVersion) => {
          // Use dataService directly to ensure both mock and Supabase paths are covered
          // and to update the in-memory projection for subsequent reconciliation.
          const updated = await shiftService.updateStaffingLabels(
            shiftId,
            labels,
            undefined,
            expectedVersion ?? existingShifts.find(shift => shift.id === shiftId)?.version,
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
        const archive = await archiveCompletedSchedule(completedSource.type, batch.id, mappedImport.rows, importedCount)
        setCompletedImport({ source: completedSource, batch: completedBatch ?? { ...batch, status: 'failed' }, rows: finalRows, ...archive })
        setResult(null)
        setBatch(null)
        setSource(null)
        setSourceFileStatus('not_required')
        setSourceFileId(null)
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
      const archive = await archiveCompletedSchedule(completedSource.type, batch.id, mappedImport.rows, importedCount)
      setCompletedImport({ source: completedSource, batch: completedBatch ?? { ...batch, status: 'confirmed' }, rows: finalRows, ...archive })
      const finalCounts = batchPresentationCounts(finalRows)
      const attention = finalCounts.warning + finalCounts.invalid + finalCounts.duplicate + finalCounts.retryable
      toast({
        title: t('success'),
        description: attention > 0 ? t('importPartialSuccess', { imported: persistedImportCount(finalCounts), attention }) : t('importCompleted'),
        variant: 'success',
      })
      setResult(null)
      setBatch(null)
      setSource(null)
      setSourceFileStatus('not_required')
      setSourceFileId(null)
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

  const retryOriginalScheduleSource = async () => {
    const file = originalImportFileRef.current
    if (!batch || source?.type !== 'excel' || !file || busy) return
    setBusy(true)
    setSourceFileStatus('saving')
    try {
      const receipt = await saveOriginalScheduleSource(batch.id, file)
      setSourceFileId(receipt.id)
      setSourceFileStatus('saved')
    } catch (error) {
      setSourceFileStatus('failed')
      toast({ title: t('error'), description: safeImportError(error, t('importSourceRequired')), variant: 'destructive' })
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
      originalImportFileRef.current = null
      incompleteArchiveRef.current = null
      setCompletedImport(null)
      toast({ title: 'Import preview removed', variant: 'success' })
    } catch (error) {
      toast({ title: t('error'), description: safeImportError(error, t('importPreviewLoadError')), variant: 'destructive' })
      throw error
    }
  }

  const customColumnNames = React.useMemo(
    () => [...new Set((result?.rows ?? []).flatMap(preview => Object.keys(preview.row.custom_fields ?? {})))].filter(name =>
      !['agency', 'agency name', 'execution source'].includes(normalizeLookup(name)),
    ),
    [result],
  )
  const mappedResult = React.useMemo(
    () => result ? applyImportColumnMappings(result, columnMappings) : null,
    [result, columnMappings],
  )
  const mappedPreviewCounts = React.useMemo(
    () => mappedResult ? previewPresentationCounts(mappedResult) : null,
    [mappedResult],
  )
  const uniquePreviewBrands = React.useMemo(() => {
    if (!result) return []
    return [...new Set(result.rows.map(p => p.row.brand_name).filter(Boolean))].sort()
  }, [result])

  const uniquePreviewPlatforms = React.useMemo(() => {
    if (!result) return []
    return [...new Set(result.rows.map(p => p.row.platform_name).filter(Boolean))].sort()
  }, [result])

  const uniquePreviewStudios = React.useMemo(() => {
    if (!result) return []
    return [...new Set(result.rows.map(p => p.row.studio).filter(Boolean))].sort()
  }, [result])

  const uniquePreviewCampaigns = React.useMemo(() => {
    if (!result) return []
    return [...new Set(result.rows.map(p => p.row.campaign_name).filter(Boolean))].sort()
  }, [result])

  const visiblePreviews = React.useMemo(() => {
    if (!mappedResult) return []
    return mappedResult.rows.filter(preview => {
      const status = previewStatusForRow(preview)
      if (previewFilter !== 'all' && previewFilter !== status) return false

      // Column filters (Task 1: Issue #161 & Owner ID 05)
      if (filterBrand !== 'all' && preview.row.brand_name !== filterBrand) return false
      if (filterPlatform !== 'all' && preview.row.platform_name !== filterPlatform) return false
      if (filterStudio !== 'all' && (preview.row.studio || '') !== filterStudio) return false
      if (filterCampaign !== 'all' && (preview.row.campaign_name || '') !== filterCampaign) return false
      if (filterAgency !== 'all') {
        const rowAgencyRaw = (preview.row.custom_fields?.Agency || (preview.row.agency_code ? preview.row.agency_code : '')).trim()
        const rowAgencyCode = normalizeAgencyCode(rowAgencyRaw)
        const targetCode = normalizeAgencyCode(filterAgency)
        if (filterAgency === 'none') {
          if (rowAgencyRaw && rowAgencyRaw !== '—' && rowAgencyCode !== null) return false
        } else if (targetCode && rowAgencyCode) {
          if (targetCode !== rowAgencyCode) return false
        } else {
          if (!rowAgencyRaw.toLowerCase().includes(filterAgency.toLowerCase())) return false
        }
      }
      if (filterDate.trim() && !preview.row.date.includes(filterDate.trim())) return false
      if (filterValidation === 'valid' && (preview.row.errors.length > 0 || preview.row.warnings.length > 0)) return false
      if (filterValidation === 'has_errors' && preview.row.errors.length === 0) return false
      if (filterValidation === 'has_warnings' && preview.row.warnings.length === 0) return false

      const query = previewSearch.trim().toLocaleLowerCase()
      if (!query) return true
      return [
        preview.row.title,
        preview.row.brand_name,
        preview.row.platform_name,
        preview.row.campaign_name,
        preview.row.execution_source,
        preview.row.studio,
        preview.row.host_names?.join(' ') ?? '',
        preview.row.assistant_names?.join(' ') ?? '',
        preview.row.technical_names?.join(' ') ?? '',
        ...Object.values(preview.row.custom_fields ?? {}),
        String(preview.row.row_number),
      ].some(value => String(value ?? '').toLocaleLowerCase().includes(query))
    })
  }, [mappedResult, previewFilter, previewSearch, filterBrand, filterPlatform, filterStudio, filterAgency, filterCampaign, filterDate, filterValidation])
  const completedCounts = completedImport ? batchPresentationCounts(completedImport.rows) : null
  const importableCount = mappedPreviewCounts ? mappedPreviewCounts.ready + mappedPreviewCounts.warning : 0
  const hasAgencySourceConflict = Boolean(mappedResult?.rows.some(preview =>
    preview.row.errors.some(error => /conflicts with (?:Execution Source|Agency)/i.test(error)),
  ))
  const previewAttention = mappedPreviewCounts
    ? mappedPreviewCounts.warning + mappedPreviewCounts.invalid + mappedPreviewCounts.duplicate + mappedPreviewCounts.retryable
    : 0
  const hasPendingDrafts = Object.keys(draftRows).length > 0

  const paginatedPreviews = React.useMemo(() => {
    const start = (previewPage - 1) * previewPageSize
    return visiblePreviews.slice(start, start + previewPageSize)
  }, [visiblePreviews, previewPage, previewPageSize])

  if (userLoading || !currentUser) return <div className="py-12 text-center">{t('loading')}</div>
  if (!hasPermission(currentUser, 'shifts.import')) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">{t('permissionDenied')}</CardContent></Card>
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-2 border-dashed border-slate-200 hover:border-slate-300 transition-colors bg-slate-50/40 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              {t('importInput')}: {t('importExcel')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-slate-600">{t('importFormatExcel')}</p>
              <p className="text-xs text-slate-500">{t('importDateTimeHelp')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => fileInputRef.current?.click()} disabled={busy || !masterGate.allowed} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
                <Upload className="mr-2 h-4 w-4" />{t('importExcel')}
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="sr-only" aria-label={t('importFormatExcel')} onChange={handleFile} />
              <Button variant="outline" onClick={downloadExcelTemplate} className="text-slate-600 bg-white">
                <Download className="mr-2 h-4 w-4" />{t('downloadTemplate')}
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-1 text-xs">
              <span className="font-medium text-slate-700">{language === 'vi' ? 'Gán Agency mặc định:' : 'Default Agency:'}</span>
              <select
                aria-label={language === 'vi' ? 'Gán Agency mặc định' : 'Default Agency'}
                className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                value={batchAgency ?? ''}
                onChange={e => setBatchAgency((e.target.value as AgencyCode) || null)}
              >
                <option value="">{language === 'vi' ? '— Không —' : '— None —'}</option>
                <option value="ada">ADA</option>
                <option value="snap">SNAP</option>
                <option value="live_ai">Live AI</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-800">
              <Link2 className="h-5 w-5 text-blue-600" />
              {t('importInput')}: {t('importGoogleSheets')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-slate-600">{t('importFormatGoogle')}. {t('googleSheetsHelp')}</p>
              <p className="text-xs text-slate-500">{t('importDateTimeHelp')}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input className="min-w-0 bg-slate-50 focus-visible:ring-blue-500" value={googleUrl} onChange={event => setGoogleUrl(event.target.value)} aria-label={t('importFormatGoogle')} placeholder="https://docs.google.com/spreadsheets/d/..." />
              <Button className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white shadow-sm" onClick={handleGoogle} disabled={busy || !masterGate.allowed || !googleUrl}>
                {t('importGoogleSheets')}
              </Button>
            </div>
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
              {mappedPreviewCounts && <ImportSummary counts={mappedPreviewCounts} t={t} />}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-sm text-blue-900" role="status" data-testid="schedule-import-preview-state">{t('batchPreviewState')}</div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1" aria-label={t('importOutcomeRows')}>
                {(['all', 'ready', 'warning', 'invalid', 'duplicate', 'retryable'] as const).map(filter => (
                  <Button key={filter} size="sm" variant={previewFilter === filter ? 'default' : 'outline'} onClick={() => setPreviewFilter(filter)} aria-pressed={previewFilter === filter}>
                    {filter === 'all' ? t('importStatusAll') : filter === 'ready' ? t('importStatusReady') : filter === 'warning' ? t('importStatusWarning') : filter === 'invalid' ? t('importStatusInvalid') : filter === 'duplicate' ? t('importStatusDuplicate') : t('importStatusRetryable')}
                    {mappedPreviewCounts && <span className="ml-1">({filter === 'all' ? mappedPreviewCounts.total : mappedPreviewCounts[filter]})</span>}
                  </Button>
                ))}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                <Input className="w-full sm:w-64" value={previewSearch} onChange={event => setPreviewSearch(event.target.value)} aria-label={t('importSearchRows')} placeholder={t('importSearchRows')} />
                <Button size="sm" variant="outline" onClick={addPreviewRow}><Plus className="mr-2 h-4 w-4" />{t('addImportRow')}</Button>
                <Button size="sm" variant="outline" onClick={addCustomColumn}><Plus className="mr-2 h-4 w-4" />{language === 'vi' ? 'Thêm cột' : 'Add column'}</Button>
                {(result.errors.length > 0 || result.warnings.length > 0) && <Button size="sm" variant="outline" onClick={() => downloadScheduleImportErrors(result)}><Download className="mr-2 h-4 w-4" />{language === 'vi' ? 'Tải lỗi import' : 'Download errors'}</Button>}
              </div>
            </div>

            {/* Column Filters Strip (Task 1: Issue #161) */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs text-slate-700" data-testid="schedule-import-column-filters">
              <div className="flex items-center gap-1.5 font-medium text-slate-800">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <span>{language === 'vi' ? 'Lọc theo cột:' : 'Column filters:'}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder={language === 'vi' ? 'Ngày (YYYY-MM-DD)...' : 'Filter Date...'}
                  value={filterDate}
                  onChange={e => setFilterDate(e.target.value)}
                  className="h-8 w-32 bg-white text-xs"
                />
                <select
                  aria-label="Filter Brand"
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                >
                  <option value="all">{language === 'vi' ? 'Tất cả Brand' : 'All Brands'}</option>
                  {uniquePreviewBrands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  aria-label="Filter Platform"
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={filterPlatform}
                  onChange={e => setFilterPlatform(e.target.value)}
                >
                  <option value="all">{language === 'vi' ? 'Tất cả Platform' : 'All Platforms'}</option>
                  {uniquePreviewPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <select
                  aria-label="Filter Studio"
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={filterStudio}
                  onChange={e => setFilterStudio(e.target.value)}
                >
                  <option value="all">{language === 'vi' ? 'Tất cả Studio' : 'All Studios'}</option>
                  {uniquePreviewStudios.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  aria-label="Filter Agency"
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={filterAgency}
                  onChange={e => setFilterAgency(e.target.value)}
                >
                  <option value="all">{language === 'vi' ? 'Tất cả Agency' : 'All Agencies'}</option>
                  <option value="ada">ADA</option>
                  <option value="snap">SNAP</option>
                  <option value="live_ai">Live AI</option>
                  <option value="none">{language === 'vi' ? 'Không có Agency' : 'No Agency'}</option>
                </select>
                {uniquePreviewCampaigns.length > 0 && (
                  <select
                    aria-label="Filter Campaign"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    value={filterCampaign}
                    onChange={e => setFilterCampaign(e.target.value)}
                  >
                    <option value="all">{language === 'vi' ? 'Tất cả Chiến dịch' : 'All Campaigns'}</option>
                    {uniquePreviewCampaigns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
                <select
                  aria-label="Filter Validation"
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={filterValidation}
                  onChange={e => setFilterValidation(e.target.value as typeof filterValidation)}
                >
                  <option value="all">{language === 'vi' ? 'Tất cả tính hợp lệ' : 'All Validation'}</option>
                  <option value="valid">{language === 'vi' ? 'Hợp lệ' : 'Valid'}</option>
                  <option value="has_errors">{language === 'vi' ? 'Có lỗi' : 'Has Errors'}</option>
                  <option value="has_warnings">{language === 'vi' ? 'Có cảnh báo' : 'Has Warnings'}</option>
                </select>

                {(filterBrand !== 'all' || filterPlatform !== 'all' || filterStudio !== 'all' || filterAgency !== 'all' || filterCampaign !== 'all' || filterDate.trim() || filterValidation !== 'all') && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-blue-600 hover:text-blue-800"
                    onClick={() => {
                      setFilterBrand('all')
                      setFilterPlatform('all')
                      setFilterStudio('all')
                      setFilterAgency('all')
                      setFilterCampaign('all')
                      setFilterDate('')
                      setFilterValidation('all')
                    }}
                  >
                    {language === 'vi' ? 'Xóa lọc' : 'Reset filters'}
                  </Button>
                )}

                {undoStack.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                    onClick={undoLastDelete}
                    data-testid="schedule-import-undo-button"
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    {language === 'vi' ? `Hoàn tác xóa (${undoStack.length})` : `Undo Delete (${undoStack.length})`}
                  </Button>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {language === 'vi'
                      ? `Hiển thị ${visiblePreviews.length}/${mappedResult?.rows.length ?? 0} dòng`
                      : `Showing ${visiblePreviews.length}/${mappedResult?.rows.length ?? 0} rows`}
                  </span>
                  <select
                    aria-label="Rows per page"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    value={previewPageSize}
                    onChange={e => {
                      setPreviewPageSize(Number(e.target.value))
                      setPreviewPage(1)
                    }}
                  >
                    <option value={25}>25 / trang</option>
                    <option value={50}>50 / trang</option>
                    <option value={100}>100 / trang</option>
                  </select>
                </div>
              </div>
            </div>

            {selectedRowNumbers.size > 0 && (() => {
              const isAllDraft = mappedResult ? mappedResult.rows.length > 0 && mappedResult.rows.every(p => selectedRowNumbers.has(p.row.row_number)) : false
              const isAllFiltered = visiblePreviews.length > 0 && visiblePreviews.every(p => selectedRowNumbers.has(p.row.row_number)) && (!mappedResult || visiblePreviews.length < mappedResult.rows.length)
              return (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/80 p-3 text-sm text-blue-950" data-testid="schedule-import-bulk-bar">
                <span className="font-semibold" data-testid="schedule-import-selection-scope">
                  {isAllDraft
                    ? (language === 'vi' ? `Đã chọn toàn bộ Draft (${selectedRowNumbers.size} dòng):` : `All Draft selected (${selectedRowNumbers.size} rows):`)
                    : isAllFiltered
                      ? (language === 'vi' ? `Đã chọn tất cả dòng đang lọc (${selectedRowNumbers.size}/${mappedResult?.rows.length ?? 0} dòng):` : `All filtered rows selected (${selectedRowNumbers.size}/${mappedResult?.rows.length ?? 0}):`)
                      : (language === 'vi' ? `Đã chọn ${selectedRowNumbers.size} dòng (trên ${visiblePreviews.length} hiển thị / ${mappedResult?.rows.length ?? 0} toàn bộ):` : `${selectedRowNumbers.size} rows selected (${visiblePreviews.length} visible / ${mappedResult?.rows.length ?? 0} total):`)}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="h-8 text-xs bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                    onClick={() => {
                      setBulkExecutionSource('')
                      setBulkAgencyCode('')
                      setBulkBrandName('')
                      setBulkPlatformName('')
                      setBulkStudio('')
                      setBulkModalOpen(true)
                    }}
                    data-testid="schedule-import-open-bulk-modal"
                  >
                    <Edit3 className="mr-1 h-3.5 w-3.5" />
                    {language === 'vi' ? 'Hộp thoại sửa hàng loạt' : 'Bulk Edit Dialog'}
                  </Button>
                  <select
                    aria-label="Bulk Execution Source"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        bulkUpdateSelected({ execution_source: e.target.value })
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>{language === 'vi' ? 'Gán nguồn thực hiện...' : 'Set Execution Source...'}</option>
                    <option value="internal">{language === 'vi' ? 'Nội bộ' : 'Internal'}</option>
                    <option value="agency">{language === 'vi' ? 'Bên ngoài' : 'External'}</option>
                  </select>
                  <select
                    aria-label="Bulk Agency"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        bulkUpdateSelected({ agency_code: e.target.value, execution_source: executionSourceForAgency(e.target.value as AgencyCode) })
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>{language === 'vi' ? 'Gán Agency...' : 'Set Agency...'}</option>
                    <option value="ada">ADA</option>
                    <option value="snap">SNAP</option>
                    <option value="live_ai">Live AI</option>
                  </select>
                  <select
                    aria-label="Bulk Brand"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        bulkUpdateSelected({ brand_name: e.target.value })
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>{language === 'vi' ? 'Gán Brand...' : 'Set Brand...'}</option>
                    {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                  <select
                    aria-label="Bulk Platform"
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) {
                        bulkUpdateSelected({ platform_name: e.target.value })
                        e.target.value = ''
                      }
                    }}
                  >
                    <option value="" disabled>{language === 'vi' ? 'Gán Platform...' : 'Set Platform...'}</option>
                    {platforms.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                  {visiblePreviews.length > 0 && selectedRowNumbers.size < visiblePreviews.length && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                      onClick={() => setSelectedRowNumbers(new Set(visiblePreviews.map(p => p.row.row_number)))}
                      data-testid="schedule-import-select-all-filtered"
                    >
                      {language === 'vi' ? `Chọn tất cả ${visiblePreviews.length} dòng đang lọc` : `Select all ${visiblePreviews.length} filtered rows`}
                    </Button>
                  )}
                  {mappedResult && mappedResult.rows.length > visiblePreviews.length && selectedRowNumbers.size < mappedResult.rows.length && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                      onClick={() => setSelectedRowNumbers(new Set(mappedResult.rows.map(p => p.row.row_number)))}
                      data-testid="schedule-import-select-all-draft"
                    >
                      {language === 'vi' ? `Chọn toàn bộ Draft (${mappedResult.rows.length} dòng)` : `Select entire Draft (${mappedResult.rows.length} rows)`}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-8 text-xs"
                    onClick={() => setBulkDeleteConfirmOpen(true)}
                    data-testid="schedule-import-bulk-delete"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {language === 'vi' ? `Xóa ${selectedRowNumbers.size} dòng` : `Delete ${selectedRowNumbers.size} rows`}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-slate-600 hover:text-slate-900"
                    onClick={() => setSelectedRowNumbers(new Set())}
                  >
                    {language === 'vi' ? 'Bỏ chọn' : 'Deselect'}
                  </Button>
                </div>
              </div>
            )
            })()}

            {customColumnNames.length > 0 && (
              <section className="space-y-3 rounded-lg border bg-white p-3" aria-labelledby="schedule-import-column-mapping-title" data-testid="schedule-import-column-mapping">
                <div>
                  <h3 id="schedule-import-column-mapping-title" className="text-sm font-semibold">
                    {language === 'vi' ? 'Ánh xạ cột Excel' : 'Excel column mapping'}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {language === 'vi'
                      ? 'Chỉ Admin được chọn đích. Source Only chỉ lưu trong lô nhập; Supplemental lưu cùng ca; Operational ghi vào trường ca được hỗ trợ.'
                      : 'Only Admin can choose destinations. Source Only stays with the import batch; Supplemental is stored on the Shift; Operational writes to a supported Shift field.'}
                  </p>
                </div>
                <div className="space-y-2">
                  {customColumnNames.map(name => {
                    const mapping = columnMappings[name] ?? { destination: 'source_only' as const }
                    const sample = result?.rows.map(preview => preview.row.custom_fields?.[name]).find(value => Boolean(value?.trim())) || '—'
                    const invalidValues = mappedResult?.rows.filter(preview => preview.row.errors.some(error => error.startsWith(`${name}:`))).length ?? 0
                    return (
                      <div key={name} className="grid gap-2 rounded-md border p-2 md:grid-cols-[minmax(9rem,1fr)_minmax(10rem,1fr)_minmax(11rem,1fr)_minmax(7rem,auto)_minmax(10rem,1fr)] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium" title={name}>{name}</p>
                          <p className="text-[11px] text-muted-foreground">{language === 'vi' ? 'Có thể sửa trong bản xem trước' : 'Editable in preview'}</p>
                        </div>
                        <select
                          aria-label={`${name} destination type`}
                          className="h-8 min-w-0 rounded border bg-background px-2 text-xs"
                          disabled={resolveSystemPermission(currentUser) !== 'admin'}
                          value={mapping.destination}
                          onChange={event => {
                            const destination = event.target.value
                            setColumnMappings(current => ({
                              ...current,
                              [name]: destination === 'supplemental'
                                ? { destination: 'supplemental', type: 'text' }
                                : destination === 'operational'
                                  ? { destination: 'operational', field: 'title' }
                                  : { destination: 'source_only' },
                            }))
                          }}
                        >
                          <option value="source_only">{language === 'vi' ? 'Chỉ lưu nguồn' : 'Source Only'}</option>
                          <option value="supplemental">{language === 'vi' ? 'Trường bổ sung của ca' : 'Supplemental Shift Field'}</option>
                          <option value="operational">{language === 'vi' ? 'Trường vận hành' : 'Operational Field'}</option>
                        </select>
                        {mapping.destination === 'supplemental' ? (
                          <select
                            aria-label={`${name} data type`}
                            className="h-8 min-w-0 rounded border bg-background px-2 text-xs"
                            disabled={resolveSystemPermission(currentUser) !== 'admin'}
                            value={mapping.type}
                            onChange={event => setColumnMappings(current => ({ ...current, [name]: { destination: 'supplemental', type: event.target.value as SupplementalShiftFieldType } }))}
                          >
                            <option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option><option value="date">Date</option><option value="time">Time</option>
                          </select>
                        ) : mapping.destination === 'operational' ? (
                          <select
                            aria-label={`${name} operational field`}
                            className="h-8 min-w-0 rounded border bg-background px-2 text-xs"
                            disabled={resolveSystemPermission(currentUser) !== 'admin'}
                            value={mapping.field}
                            onChange={event => setColumnMappings(current => ({ ...current, [name]: { destination: 'operational', field: event.target.value as OperationalImportField } }))}
                          >
                            {operationalImportFields.map(field => <option key={field.value} value={field.value}>{field.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{language === 'vi' ? 'Chưa ghi vào ca' : 'Not written to Shift'}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{language === 'vi' ? 'Có thể sửa' : 'Editable'}</span>
                        <div className="min-w-0">
                          <p className="truncate text-xs" title={sample}>{language === 'vi' ? 'Mẫu: ' : 'Sample: '}{sample}</p>
                          <p className={`text-[11px] ${invalidValues ? 'text-red-700' : 'text-emerald-700'}`}>
                            {invalidValues
                              ? (language === 'vi' ? `${invalidValues} dòng không hợp lệ` : `${invalidValues} invalid row(s)`)
                              : (language === 'vi' ? 'Kiểm tra hợp lệ' : 'Validation passed')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <label htmlFor="schedule-import-preview-height" className="font-medium text-foreground">{language === 'vi' ? 'Chiều cao bảng xem trước' : 'Preview table height'}</label>
              <input id="schedule-import-preview-height" type="range" min={320} max={920} step={40} value={previewMaxHeight} onChange={event => setPreviewMaxHeight(Number(event.target.value))} className="w-40 accent-primary" />
              <span>{previewMaxHeight}px</span>
              <label htmlFor="schedule-import-preview-width" className="ml-2 font-medium text-foreground">{language === 'vi' ? 'Chiều rộng bảng' : 'Preview table width'}</label>
              <input id="schedule-import-preview-width" type="range" min={1400} max={3000} step={100} value={previewMinWidth} onChange={event => setPreviewMinWidth(Number(event.target.value))} className="w-40 accent-primary" />
              <span>{previewMinWidth}px</span>
              <span>{language === 'vi' ? 'Cột chưa ánh xạ mặc định chỉ lưu trong nguồn của lô import.' : 'Unmapped columns stay with import batch source metadata by default.'}</span>
            </div>
            {visiblePreviews.length === 0 && <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" role="status">{mappedResult?.rows.length === 0 ? t('importNoRows') : t('importNoMatchingRows')}</p>}
            <div className="hidden overflow-auto rounded-lg border md:block" style={{ maxHeight: `${previewMaxHeight}px` }}>
              <table className="w-full text-sm" style={{ minWidth: `${previewMinWidth}px` }}>
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-left">
                    <th className="p-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={paginatedPreviews.length > 0 && paginatedPreviews.every(p => selectedRowNumbers.has(p.row.row_number))}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedRowNumbers(prev => {
                                const next = new Set(prev)
                                paginatedPreviews.forEach(p => next.add(p.row.row_number))
                                return next
                              })
                            } else {
                              setSelectedRowNumbers(prev => {
                                const next = new Set(prev)
                                paginatedPreviews.forEach(p => next.delete(p.row.row_number))
                                return next
                              })
                            }
                          }}
                          aria-label={language === 'vi' ? 'Chọn tất cả dòng trên trang' : 'Select all rows on page'}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{t('importSourceRow')}</span>
                      </div>
                    </th>
                    <th className="p-2">{t('date')}</th>
                    <th className="p-2">{t('time')}</th>
                    <th className="p-2">{t('brand')}</th>
                    <th className="p-2">{t('platform')}</th>
                    <th className="p-2">{language === 'vi' ? 'Nguồn thực hiện' : 'Execution Source'}</th>
                    <th className="p-2">Agency</th>
                    <th className="p-2">{t('campaign')}</th>
                    <th className="p-2">{t('shiftTitle')}</th>
                    <th className="p-2">{t('studio')}</th>
                    <th className="p-2">{t('importHostNames')}</th>
                    <th className="p-2">{t('importAssistantNames')}</th>
                    <th className="p-2">{t('importTechnicalNames')}</th>
                    <th className="p-2">{t('requiredHostCount')}</th>
                    <th className="p-2">{t('requiredSupportCount')}</th>
                    <th className="p-2">{t('requiredTechnicalCount')}</th>
                    {customColumnNames.map(name => (
                      <th key={name} className="min-w-56 p-2">
                        <div className="flex items-center gap-1">
                          <Input
                            aria-label={language === 'vi' ? `Đổi tên cột ${name}` : `Rename ${name} column`}
                            value={customHeaderDrafts[name] ?? name}
                            onChange={event => setCustomHeaderDrafts(current => ({ ...current, [name]: event.target.value }))}
                            onBlur={event => renameCustomColumn(name, event.target.value)}
                            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); renameCustomColumn(name, event.currentTarget.value) } }}
                            className="h-8 text-xs"
                          />
                          <Button
                            type="button"
                            size="icon-xs"
                            variant="ghost"
                            className="h-7 w-7 text-slate-400 hover:text-red-600"
                            onClick={() => removeCustomColumn(name)}
                            aria-label={language === 'vi' ? `Xóa cột ${name}` : `Delete column ${name}`}
                            title={language === 'vi' ? `Xóa cột ${name}` : `Delete column ${name}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </th>
                    ))}
                    <th className="min-w-64 p-2">{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPreviews.map(preview => {
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
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={selectedRowNumbers.has(rowNumber)}
                              onChange={e => {
                                setSelectedRowNumbers(prev => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(rowNumber)
                                  else next.delete(rowNumber)
                                  return next
                                })
                              }}
                              aria-label={`Select row ${rowNumber}`}
                              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="font-mono text-xs">{rowNumber}</span>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              className="h-6 w-6 text-slate-400 hover:text-red-600"
                              onClick={() => setDeleteConfirmRowNumber(rowNumber)}
                              aria-label={`Delete row ${rowNumber}`}
                              title={language === 'vi' ? `Xóa dòng ${rowNumber}` : `Delete row ${rowNumber}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                        <td className="p-2"><Input aria-label={`Row ${rowNumber} date`} className="w-36" value={cellValue('date')} onChange={changeField('date')} onKeyDown={handleCellKeyDown} /></td>
                        <td className="p-2"><div className="flex gap-1"><Input aria-label={`Row ${rowNumber} start time`} className="w-24" value={cellValue('start_time')} onChange={changeField('start_time')} onKeyDown={handleCellKeyDown} /><Input aria-label={`Row ${rowNumber} end time`} className="w-24" value={cellValue('end_time')} onChange={changeField('end_time')} onKeyDown={handleCellKeyDown} /></div>{preview.row.crosses_midnight && <p className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-indigo-700"><Moon className="h-3 w-3" />{t('endsNextDay')}: {displayDate(preview.row.end_date)}</p>}</td>
                        <td className="p-2"><PreviewEntitySelect ariaLabel={`Row ${rowNumber} brand`} value={entityValue('brand_name', preview.row.brand_name)} onChange={value => draftChange(rowNumber, 'brand_name', value)} options={brands} /></td>
                        <td className="p-2"><PreviewEntitySelect ariaLabel={`Row ${rowNumber} platform`} value={entityValue('platform_name', preview.row.platform_name)} onChange={value => draftChange(rowNumber, 'platform_name', value)} options={platforms} /></td>
                        <td className="p-2"><select aria-label={`Row ${rowNumber} Agency / execution source`} className="h-9 rounded-md border bg-background px-2" value={cellValue('execution_source')} onChange={event => draftChange(rowNumber, 'execution_source', event.target.value)}><option value="">{language === 'vi' ? 'Chưa phân loại' : 'Unclassified'}</option><option value="internal">{language === 'vi' ? 'Nội bộ' : 'Internal'}</option><option value="agency">{language === 'vi' ? 'Bên ngoài' : 'External'}</option></select></td>
                        <td className="p-2">
                          <select
                            aria-label={`Row ${rowNumber} Agency`}
                            className="h-9 rounded-md border bg-background px-2"
                            value={cellValue('agency_code')}
                            onChange={event => {
                              const code = event.target.value
                              draftChange(rowNumber, 'agency_code', code)
                              if (code) {
                                draftChange(rowNumber, 'execution_source', executionSourceForAgency(code as AgencyCode) ?? '')
                              }
                            }}
                          >
                            <option value="">{language === 'vi' ? '— Không —' : '— None —'}</option>
                            <option value="ada">ADA</option>
                            <option value="snap">SNAP</option>
                            <option value="live_ai">Live AI</option>
                          </select>
                        </td>
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
                              onKeyDown={handleCellKeyDown}
                            />
                          </td>
                        ))}
                        {customColumnNames.map(name => {
                          const field = `custom:${name}` as DraftField
                          return <td className="p-2" key={name}><Input aria-label={`Row ${rowNumber} ${name}`} className="w-40" value={cellValue(field)} onChange={changeField(field)} onKeyDown={handleCellKeyDown} /></td>
                        })}
                        <td className="p-2">
                          {editing && (
                            <div className="mb-1 flex flex-wrap items-center gap-1">
                              <Button size="sm" variant="default" onClick={() => commitRow(rowNumber)} aria-label="Confirm edit"><Check className="h-3 w-3" /></Button>
                              <Button size="sm" variant="outline" onClick={() => cancelRow(rowNumber)} aria-label="Cancel edit"><X className="h-3 w-3" /></Button>
                            </div>
                          )}
                          {!editing && <Badge variant="outline">{importStatusLabel(rowStatus, t)}</Badge>}
                          {editing && <span className="text-xs text-amber-700">{language === 'vi' ? 'Đang sửa bản nháp — nhấn Enter để xác nhận' : 'Editing draft — Enter to confirm'}</span>}
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
              {paginatedPreviews.map(preview => {
                const status = previewStatusForRow(preview)
                const rowNum = preview.row.row_number
                const identity = [preview.row.date, `${preview.row.start_time}–${preview.row.end_time}`, preview.row.title || preview.row.brand_name].filter(Boolean).join(' · ')
                return <div key={rowNum} className={`rounded-md border p-3 ${rowStatusClass(status)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedRowNumbers.has(rowNum)}
                        onChange={e => {
                          setSelectedRowNumbers(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(rowNum)
                            else next.delete(rowNum)
                            return next
                          })
                        }}
                        aria-label={`Select mobile row ${rowNum}`}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('importSourceRow')} {rowNum}</p>
                        <p className="font-medium">{identity || t('importNoRows')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline">{importStatusLabel(status, t)}</Badge>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        onClick={() => setDeleteConfirmRowNumber(rowNum)}
                        aria-label={`Delete mobile row ${rowNum}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{preview.row.brand_name} · {preview.row.platform_name}{preview.row.campaign_name ? ` · ${preview.row.campaign_name}` : ''}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{language === 'vi' ? 'Nguồn thực hiện' : 'Execution Source'}: {executionSourceDisplayLabel(preview.row.execution_source, language) || (language === 'vi' ? 'Chưa phân loại' : 'Unclassified')}</p>
                  {Object.entries(preview.row.custom_fields ?? {}).map(([name, value]) => <p key={name} className="mt-1 break-words text-xs text-muted-foreground"><span className="font-medium text-foreground">{name}:</span> {value || '—'}</p>)}
                  {preview.row.errors.map(message => <p key={message} className="mt-1 text-xs text-red-700">{message}</p>)}
                  {preview.row.warnings.map(message => <p key={message} className="mt-1 text-xs text-amber-700">{message}</p>)}
                </div>
              })}
            </div>

            {visiblePreviews.length > previewPageSize && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" data-testid="schedule-import-pagination">
                <p className="text-xs text-muted-foreground">
                  {language === 'vi'
                    ? `Hiển thị ${(previewPage - 1) * previewPageSize + 1}–${Math.min(previewPage * previewPageSize, visiblePreviews.length)} trên tổng số ${visiblePreviews.length} dòng`
                    : `Showing ${(previewPage - 1) * previewPageSize + 1}–${Math.min(previewPage * previewPageSize, visiblePreviews.length)} of ${visiblePreviews.length} rows`}
                </p>
                <HistoryPagination
                  page={previewPage}
                  pageSize={previewPageSize}
                  total={visiblePreviews.length}
                  onPageChange={setPreviewPage}
                />
              </div>
            )}

            {(mappedResult?.invalidRows ?? 0) > 0 && <p className="text-sm text-red-700">{t('correctRows')}</p>}
            {mappedPreviewCounts && <p className="text-sm text-muted-foreground" data-testid="schedule-import-confirm-summary">{t('confirmImportSummary', { ready: importableCount, attention: previewAttention })}</p>}
            {source?.type === 'excel' && sourceFileStatus !== 'not_required' && <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
              <span className={sourceFileStatus === 'saved' ? 'text-emerald-700' : 'text-amber-700'}>
                {sourceFileStatus === 'saved' ? t('importSourceSaved') : sourceFileStatus === 'saving' ? t('importSourceSaving') : t('importSourceRequired')}
              </span>
              {sourceFileStatus === 'failed' && <Button type="button" variant="outline" size="sm" onClick={() => void retryOriginalScheduleSource()} disabled={busy}>
                {t('importSourceRetry')}
              </Button>}
            </div>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setCancelOpen(true)}>{t('cancel')}</Button>
              <Button onClick={confirmImport} disabled={busy || hasPendingDrafts || hasAgencySourceConflict || importableCount === 0 || (source?.type === 'excel' && (sourceFileStatus !== 'saved' || !sourceFileId))} aria-label={t('confirmImport')}>{busy ? t('loading') : t('confirmImport')}</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {completedImport && completedCounts && <div ref={completedImportRef} tabIndex={-1} className="space-y-3">
        <ImportCompletionCard completed={completedImport} counts={completedCounts} t={t} />
        {completedImport.archiveStatus && (
          <div className={`rounded-md border px-4 py-3 text-sm ${completedImport.archiveIncomplete ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900'}`}
            role="status" data-testid="schedule-import-drive-archive-status">
            <div>{completedImport.archiveStatus}</div>
            {incompleteArchiveRef.current && <Button type="button" variant="outline" size="sm" className="mt-2"
              onClick={() => void retryCompletedArchive()} disabled={retryingArchive}>
              {retryingArchive ? 'Đang đồng bộ...' : 'Thử lưu lại trên Drive'}
            </Button>}
          </div>
        )}
      </div>}
      {/* Bulk Edit Modal with Confirmation and Preview (Task 1: Issue #161) */}
      <Dialog open={bulkModalOpen} onOpenChange={setBulkModalOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-blue-600" />
              {language === 'vi' ? 'Chỉnh sửa hàng loạt các dòng đã chọn' : 'Bulk Edit Selected Rows'}
            </DialogTitle>
            <DialogDescription>
              {language === 'vi'
                ? `Bạn đang chuẩn bị áp dụng thay đổi cho ${selectedRowNumbers.size} dòng đã chọn.`
                : `You are about to apply updates to ${selectedRowNumbers.size} selected rows.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {language === 'vi' ? 'Nguồn thực hiện (Execution Source):' : 'Execution Source:'}
                </label>
                <select
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={bulkExecutionSource}
                  onChange={e => setBulkExecutionSource(e.target.value)}
                >
                  <option value="">{language === 'vi' ? '— Không đổi —' : '— No change —'}</option>
                  <option value="internal">{language === 'vi' ? 'Nội bộ' : 'Internal'}</option>
                    <option value="agency">{language === 'vi' ? 'Bên ngoài' : 'External'}</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Agency:</label>
                <select
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={bulkAgencyCode}
                  onChange={e => setBulkAgencyCode(e.target.value)}
                >
                  <option value="">{language === 'vi' ? '— Không đổi —' : '— No change —'}</option>
                  <option value="ada">ADA</option>
                  <option value="snap">SNAP</option>
                  <option value="live_ai">Live AI</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Brand:</label>
                <select
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={bulkBrandName}
                  onChange={e => setBulkBrandName(e.target.value)}
                >
                  <option value="">{language === 'vi' ? '— Không đổi —' : '— No change —'}</option>
                  {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Platform:</label>
                <select
                  className="w-full h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                  value={bulkPlatformName}
                  onChange={e => setBulkPlatformName(e.target.value)}
                >
                  <option value="">{language === 'vi' ? '— Không đổi —' : '— No change —'}</option>
                  {platforms.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-semibold text-slate-700 block mb-1">Studio:</label>
                <Input
                  placeholder={language === 'vi' ? 'Nhập tên Studio cần gán...' : 'Enter studio...'}
                  value={bulkStudio}
                  onChange={e => setBulkStudio(e.target.value)}
                  className="h-8 text-xs bg-white"
                />
              </div>
            </div>

            {/* Validation & Conflict Check (Owner ID 04 & Owner ID 02) */}
            {bulkExecutionSource === 'internal' && (bulkAgencyCode === 'snap' || bulkAgencyCode === 'live_ai') && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-xs text-red-900 flex items-start gap-2" role="alert">
                <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{language === 'vi' ? 'Xung đột Agency & Nguồn thực hiện:' : 'Agency & Execution Source conflict:'}</span>
                  <p className="mt-0.5">{language === 'vi' ? `Đối tác ${bulkAgencyCode.toUpperCase()} bắt buộc Nguồn thực hiện là 'Bên ngoài' (External). Không thể chọn 'Nội bộ'.` : `Partner ${bulkAgencyCode.toUpperCase()} requires 'External' execution source. Cannot use 'Internal'.`}</p>
                </div>
              </div>
            )}

            {/* Large change confirmation warning */}
            {selectedRowNumbers.size > 10 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{language === 'vi' ? 'Cảnh báo thay đổi số lượng lớn:' : 'Large bulk change warning:'}</span>
                  <p className="mt-0.5">{language === 'vi' ? `Bạn đang chuẩn bị thay đổi ${selectedRowNumbers.size} dòng (> 10 dòng). Thao tác này sẽ áp dụng các giá trị đã chọn cho toàn bộ nhóm dòng này.` : `You are updating ${selectedRowNumbers.size} rows at once (> 10 rows). Please verify carefully.`}</p>
                </div>
              </div>
            )}

            {/* Preview of changes */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 space-y-1">
              <span className="font-bold text-blue-900 block">
                {language === 'vi' ? 'Xem trước thay đổi (Change Preview):' : 'Change Preview:'}
              </span>
              <ul className="list-disc pl-4 text-blue-800 space-y-0.5">
                <li>{language === 'vi' ? `Số dòng bị ảnh hưởng: ${selectedRowNumbers.size} dòng` : `Rows affected: ${selectedRowNumbers.size}`}</li>
                {bulkExecutionSource && <li>{language === 'vi' ? `Nguồn thực hiện: ${executionSourceDisplayLabel(bulkExecutionSource as 'internal' | 'agency', language)}` : `Execution Source: ${executionSourceDisplayLabel(bulkExecutionSource as 'internal' | 'agency', language)}`}</li>}
                {bulkAgencyCode && <li>Agency: {bulkAgencyCode.toUpperCase()}</li>}
                {bulkBrandName && <li>Brand: {bulkBrandName}</li>}
                {bulkPlatformName && <li>Platform: {bulkPlatformName}</li>}
                {bulkStudio.trim() && <li>Studio: {bulkStudio.trim()}</li>}
                {!bulkExecutionSource && !bulkAgencyCode && !bulkBrandName && !bulkPlatformName && !bulkStudio.trim() && (
                  <li className="italic text-slate-500">{language === 'vi' ? 'Chưa chọn trường nào để thay đổi.' : 'No fields selected.'}</li>
                )}
              </ul>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              disabled={bulkSubmitting || (bulkExecutionSource === 'internal' && (bulkAgencyCode === 'snap' || bulkAgencyCode === 'live_ai')) || (!bulkExecutionSource && !bulkAgencyCode && !bulkBrandName && !bulkPlatformName && !bulkStudio.trim())}
              onClick={() => {
                if (bulkSubmitting) return
                setBulkSubmitting(true)
                try {
                  const updates: Parameters<typeof bulkUpdateSelected>[0] = {}
                  if (bulkExecutionSource) updates.execution_source = bulkExecutionSource
                  if (bulkAgencyCode) updates.agency_code = bulkAgencyCode
                  if (bulkBrandName) updates.brand_name = bulkBrandName
                  if (bulkPlatformName) updates.platform_name = bulkPlatformName
                  if (bulkStudio.trim()) updates.studio = bulkStudio.trim()
                  bulkUpdateSelected(updates)
                  setBulkModalOpen(false)
                } finally {
                  setBulkSubmitting(false)
                }
              }}
              data-testid="schedule-import-confirm-bulk-apply"
            >
              {bulkSubmitting ? t('loading') : (language === 'vi' ? `Xác nhận áp dụng (${selectedRowNumbers.size} dòng)` : `Confirm Apply (${selectedRowNumbers.size} rows)`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Row Delete Confirmation Dialog (Owner ID 03) */}
      <Dialog open={deleteConfirmRowNumber !== null} onOpenChange={open => { if (!open) setDeleteConfirmRowNumber(null) }}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" />
              {language === 'vi' ? 'Xác nhận xóa dòng' : 'Confirm Row Deletion'}
            </DialogTitle>
            <DialogDescription>
              {language === 'vi'
                ? `Bạn có chắc muốn xóa dòng số ${deleteConfirmRowNumber} khỏi bản nháp import? Bạn có thể nhấn Hoàn tác để khôi phục sau khi xóa.`
                : `Are you sure you want to delete row #${deleteConfirmRowNumber} from the import draft? You can undo after deletion.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmRowNumber(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="schedule-import-confirm-delete-row"
              onClick={() => {
                if (deleteConfirmRowNumber !== null) {
                  removePreviewRow(deleteConfirmRowNumber)
                  setDeleteConfirmRowNumber(null)
                }
              }}
            >
              {language === 'vi' ? 'Xác nhận xóa' : 'Confirm Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog (Owner ID 04) */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-5 w-5" />
              {language === 'vi' ? 'Xác nhận xóa hàng loạt' : 'Confirm Bulk Deletion'}
            </DialogTitle>
            <DialogDescription>
              {language === 'vi'
                ? `Bạn có chắc muốn xóa ${selectedRowNumbers.size} dòng đã chọn khỏi bản nháp import? Bạn có thể nhấn Hoàn tác để khôi phục sau khi xóa.`
                : `Are you sure you want to delete ${selectedRowNumbers.size} selected rows from the import draft? You can undo after deletion.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkDeleteConfirmOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="schedule-import-confirm-bulk-delete"
              onClick={() => {
                bulkDeleteSelected()
                setBulkDeleteConfirmOpen(false)
              }}
            >
              {language === 'vi' ? `Xác nhận xóa (${selectedRowNumbers.size} dòng)` : `Confirm Delete (${selectedRowNumbers.size} rows)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LifecycleActionDialog open={cancelOpen} onOpenChange={setCancelOpen} title="Remove import preview" impact={cancelImpact} confirmText="Remove preview" onConfirm={removePreview} />
    </div>
  )
}

type ImportTranslate = (key: TranslationKey, variables?: Record<string, string | number>) => string

function ImportSummary({ counts, t, persistedCount }: { counts: ImportPresentationCounts; t: ImportTranslate; persistedCount?: number }) {
  const items: Array<[TranslationKey, number, string]> = [
    ['readyToImport', counts.ready, 'text-emerald-700'],
    ['importWarning', counts.warning, 'text-amber-700'],
    ['importValidationFailed', counts.invalid, 'text-red-700'],
    ['importDuplicateSkipped', counts.duplicate, 'text-slate-700'],
    ['importRetryable', counts.retryable, 'text-orange-700'],
  ]
  return <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" data-testid="schedule-import-summary" aria-label={t('importSummary')}>
    <span className="font-semibold text-foreground">{t('totalRows')}: {counts.total}</span>
    {persistedCount !== undefined && <span className="font-semibold text-emerald-700" data-testid="schedule-import-persisted-count">{t('importedResult')}: {persistedCount}</span>}
    {items.map(([label, count, color]) => <span key={label} className={color}>{t(label)}: {count}</span>)}
  </div>
}

function ImportCompletionCard({ completed, counts, t }: { completed: CompletedImport; counts: ImportPresentationCounts; t: ImportTranslate }) {
  const [showAllValidation, setShowAllValidation] = React.useState(false)
  const [showAllRetryable, setShowAllRetryable] = React.useState(false)
  const [showAllWarnings, setShowAllWarnings] = React.useState(false)

  const warningRows = completed.rows.filter(row => row.status === 'warning')
  const notImportedRows = completed.rows.filter(isNotImportedResultRow)
  const duplicateRows = notImportedRows.filter(row => row.status === 'duplicate_skipped')

  const validationErrors = notImportedRows.filter(row => row.status === 'validation_failed')
  const retryableErrors = notImportedRows.filter(row => row.status === 'retryable')

  const persistedCount = persistedImportCount(counts)
  const attention = counts.warning + counts.duplicate + counts.invalid + counts.retryable

  let state: 'SUCCESS' | 'PARTIAL' | 'ACTION_REQUIRED' = 'SUCCESS'
  if (persistedCount === 0 && (counts.duplicate + counts.invalid + counts.retryable) > 0) state = 'ACTION_REQUIRED'
  else if (persistedCount > 0 && attention > 0) state = 'PARTIAL'

  const borderClass = state === 'SUCCESS' ? 'border-emerald-200' : state === 'PARTIAL' ? 'border-amber-200' : 'border-red-200'
  const headerClass = state === 'SUCCESS' ? 'bg-emerald-50/60 text-emerald-950' : state === 'PARTIAL' ? 'bg-amber-50/60 text-amber-950' : 'bg-red-50/60 text-red-950'

  const titleText = completed.batch.status === 'failed' ? t('importNotCompleted') : completed.batch.status === 'cancelled' ? t('cancelled') : state === 'SUCCESS'
    ? t('importCompleted')
    : state === 'PARTIAL'
      ? t('importPartialSuccess', { imported: persistedCount, attention: attention })
      : t('importNotCompleted', { defaultValue: 'Import Not Completed' })

  const visibleValidation = showAllValidation ? validationErrors : validationErrors.slice(0, 10)
  const visibleRetryable = showAllRetryable ? retryableErrors : retryableErrors.slice(0, 10)
  const visibleWarnings = showAllWarnings ? warningRows : warningRows.slice(0, 10)

  return (
    <Card data-testid="schedule-import-result" role="status" aria-live="polite" className={`overflow-hidden ${borderClass}`}>
      <CardHeader className={`border-b ${headerClass} px-5 py-4`}>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{titleText}</span>
          <Badge variant="outline" className="bg-background/80 shadow-sm border-slate-200 text-slate-800">{completed.source.name}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        <ImportSummary counts={counts} t={t} persistedCount={persistedCount} />

        {persistedCount === 0 && <p className="text-sm text-muted-foreground">{t('importNothingPersisted')}</p>}
        {notImportedRows.length > 0 && <section data-testid="schedule-import-not-imported-rows" className="space-y-3"><h3 className="text-sm font-semibold">{t('notImported')} ({notImportedRows.length})</h3>{duplicateRows.length > 0 && <details className="overflow-hidden rounded-lg border"><summary className="cursor-pointer bg-muted/30 px-3 py-2 text-sm font-medium">{t('importDuplicateSkipped')} ({duplicateRows.length})</summary><div className="max-h-[300px] overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">{t('importSourceRow')}</th><th className="p-2">{t('shiftDetail')}</th><th className="p-2">{t('reason')}</th></tr></thead><tbody>{duplicateRows.map(row=><tr key={row.id} className="border-t"><td className="p-2">{row.source_row_number}</td><td className="p-2">{row.normalized_values.title || row.normalized_values.brand_name}<p className="text-muted-foreground">{row.normalized_values.date} · {row.normalized_values.start_time} – {row.normalized_values.end_time}</p>{row.duplicate_of_shift_id && <p>{row.duplicate_of_shift_id}</p>}</td><td className="p-2">{row.normalized_values.warnings.join('; ') || t('importDuplicate')}</td></tr>)}</tbody></table></div></details>}</section>}

        {(validationErrors.length > 0 || retryableErrors.length > 0 || warningRows.length > 0) && (
          <div className="space-y-4">
            {validationErrors.length > 0 && (
              <details open className="group rounded-lg border border-red-200 bg-background shadow-sm overflow-hidden" data-testid="schedule-import-validation-errors">
                <summary className="bg-red-50/80 px-4 py-3 border-b border-red-100 flex items-center justify-between cursor-pointer hover:bg-red-50 transition-colors">
                  <h4 className="font-semibold text-red-900">{t('importValidationFailed')} ({validationErrors.length})</h4>
                  <span className="text-xs text-red-700 font-medium">{t('correctRows')}</span>
                </summary>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 sticky top-0"><tr className="border-b"><th className="px-4 py-2 font-medium text-slate-500 w-24">{t('importSourceRow')}</th><th className="px-4 py-2 font-medium text-slate-500">{t('error')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleValidation.map(row => (
                        <tr key={row.id}>
                          <td className="px-4 py-2 font-medium text-slate-700 align-top">{row.source_row_number}</td>
                          <td className="px-4 py-2">
                            {row.failure_code && <p className="font-mono text-xs text-red-800 mb-1">{t('importErrorCode')} {row.failure_code}</p>}
                            {row.validation_issues.map(issue => <p key={issue} className="text-red-700">{issue}</p>)}
                            {(!row.validation_issues || row.validation_issues.length === 0) && <p className="text-red-700">{t('importValidationDetails')}</p>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!showAllValidation && validationErrors.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllValidation(true)} className="text-slate-600 h-8">
                        {t('importShowMoreRows', { n: validationErrors.length - 10 })}
                      </Button>
                    </div>
                  )}
                  {showAllValidation && validationErrors.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllValidation(false)} className="text-slate-600 h-8">
                        {t('importCollapseRows')}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            )}

            {retryableErrors.length > 0 && (
              <details open className="group rounded-lg border border-orange-200 bg-background shadow-sm overflow-hidden" data-testid="schedule-import-retryable-errors">
                <summary className="bg-orange-50/80 px-4 py-3 border-b border-orange-100 flex items-center justify-between cursor-pointer hover:bg-orange-50 transition-colors">
                  <h4 className="font-semibold text-orange-900">{t('importRetryable')} ({retryableErrors.length})</h4>
                  <span className="text-xs text-orange-700 font-medium">{t('retryableRecovery')}</span>
                </summary>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 sticky top-0"><tr className="border-b"><th className="px-4 py-2 font-medium text-slate-500 w-24">{t('importSourceRow')}</th><th className="px-4 py-2 font-medium text-slate-500">{t('error')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRetryable.map(row => (
                        <tr key={row.id}>
                          <td className="px-4 py-2 font-medium text-slate-700 align-top">{row.source_row_number}</td>
                          <td className="px-4 py-2">
                            {row.failure_code && <p className="font-mono text-xs text-orange-900 mb-1">{t('importErrorCode')} {row.failure_code}</p>}
                            <p className="text-orange-800">{t('retryableRecovery')}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!showAllRetryable && retryableErrors.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllRetryable(true)} className="text-slate-600 h-8">
                        {t('importShowMoreRows', { n: retryableErrors.length - 10 })}
                      </Button>
                    </div>
                  )}
                  {showAllRetryable && retryableErrors.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllRetryable(false)} className="text-slate-600 h-8">
                        {t('importCollapseRows')}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            )}

            {warningRows.length > 0 && (
              <details className="group rounded-lg border border-amber-200 bg-background shadow-sm overflow-hidden" data-testid="schedule-import-warning-rows">
                <summary className="bg-amber-50/80 px-4 py-3 border-b border-amber-100 flex items-center justify-between cursor-pointer hover:bg-amber-50 transition-colors">
                  <h4 className="font-semibold text-amber-900">{t('importRowsImportedWithWarnings')} ({warningRows.length})</h4>
                  <span className="text-xs text-amber-700 font-medium">{t('importWarningPersistedHelp')}</span>
                </summary>
                <div className="max-h-[300px] overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 sticky top-0"><tr className="border-b"><th className="px-4 py-2 font-medium text-slate-500 w-24">{t('importSourceRow')}</th><th className="px-4 py-2 font-medium text-slate-500">{t('importWarning')}</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleWarnings.map(row => (
                        <tr key={row.id}>
                          <td className="px-4 py-2 font-medium text-slate-700 align-top">{row.source_row_number}</td>
                          <td className="px-4 py-2 text-amber-800">
                            {row.normalized_values.warnings.map(issue => <p key={issue}>{issue}</p>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!showAllWarnings && warningRows.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllWarnings(true)} className="text-slate-600 h-8">
                        {t('importShowMoreRows', { n: warningRows.length - 10 })}
                      </Button>
                    </div>
                  )}
                  {showAllWarnings && warningRows.length > 10 && (
                    <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-center">
                      <Button variant="ghost" size="sm" onClick={() => setShowAllWarnings(false)} className="text-slate-600 h-8">
                        {t('importCollapseRows')}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
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
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [filters, setFilters] = React.useState({ date: '', actorIds: [] as string[], actionIds: [] as string[], shiftIds: [] as string[], brandIds: [] as string[], sources: [] as string[] })
  const imports = usePagedList(scheduleImportHistoryService, 'import_history', {}, 20)
  const journal = usePagedList(scheduleChangeService, 'schedule_history', {
    from: filters.date || undefined, to: filters.date || undefined, actorIds: filters.actorIds, actionIds: filters.actionIds,
    shiftIds: filters.shiftIds, brandIds: filters.brandIds, sources: filters.sources,
  }, 20)
  const history = imports.items
  const changes = journal.items
  const importPage = imports.page, importPageSize = imports.pageSize, setImportPage = imports.setPage, setImportPageSize = imports.setPageSize
  const changePage = journal.page, changePageSize = journal.pageSize, setChangePage = journal.setPage, setChangePageSize = journal.setPageSize
  const loading = imports.loading || journal.loading
  const loadError = imports.error || journal.error
  const loadHistory = async () => { await Promise.all([imports.reload(), journal.reload()]) }
  const ids = changes.map(log => log.shift_id).filter(Boolean).join(',')
  React.useEffect(() => {
    let active = true
    void Promise.all([shiftService.getByIds(ids ? ids.split(',') : []), userService.getAll(), brandService.getAll()]).then(([shifts,users,brands]) => {
      if (active) { setShifts(shifts); setUsers(users); setBrands(brands) }
    })
    return () => { active = false }
  }, [ids])
  const updateChangeFilter = (key: keyof typeof filters, value: string | string[]) => {
    setFilters(current => ({ ...current, [key]: value }))
    setChangePage(1)
  }
  if (loading) return <div className="py-12 text-center" role="status" aria-live="polite" data-testid="schedule-import-history-loading">{t('loading')}</div>
  if (loadError) return <PageLoadError error={new Error(t('importLoadError'))} onRetry={() => void loadHistory()} />
  const pagedImports = history
  const pagedChanges = changes
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
          : <Card className="border-0 shadow-sm"><CardContent className="p-0">
              <div className="max-h-[600px] overflow-auto border rounded-t-xl">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm shadow-sm z-10">
                    <tr className="border-b text-left text-slate-500 font-medium">
                      <th className="p-3 pl-4 whitespace-nowrap">{t('date')}</th>
                      <th className="p-3 min-w-48">{t('source')}</th>
                      <th className="p-3">{t('status')}</th>
                      <th className="p-3 text-right">{t('totalRows')}</th>
                      <th className="p-3 text-right">{t('validRows')}</th>
                      <th className="p-3 text-right">{t('invalidRows')}</th>
                      <th className="p-3 text-right">{t('warningRows')}</th>
                      <th className="p-3 text-right">{t('importedResult')}</th>
                      <th className="p-3 text-right pr-4">{t('importRetryable')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pagedImports.map(batch => (
                      <tr className="hover:bg-slate-50/50 transition-colors" key={batch.id}>
                        <td className="p-3 pl-4 whitespace-nowrap text-slate-600">
                          {new Date(batch.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="p-3">
                          <p className="font-medium text-slate-900">{batch.source === 'google_sheets' ? t('importGoogleSheets') : t('importExcel')}</p>
                          <p className="max-w-72 truncate text-xs text-muted-foreground" title={batch.source_name}>{batch.source_name}</p>
                        </td>
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={
                              batch.status === 'confirmed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                              batch.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700' :
                              'border-slate-200 bg-slate-50 text-slate-700'
                            }
                          >
                            {batchStatusLabel(batch.status, t)}
                          </Badge>
                        </td>
                        <td className="p-3 text-right tabular-nums text-slate-600">{batch.total_rows}</td>
                        <td className="p-3 text-right tabular-nums text-emerald-600 font-medium">{batch.valid_rows}</td>
                        <td className="p-3 text-right tabular-nums text-red-600 font-medium">{batch.invalid_rows}</td>
                        <td className="p-3 text-right tabular-nums text-amber-600 font-medium">{batch.warning_rows}</td>
                        <td className="p-3 text-right tabular-nums text-slate-900 font-medium">{batch.imported_rows ?? '—'}</td>
                        <td className="p-3 text-right pr-4 tabular-nums text-orange-600 font-medium">{batch.retryable_rows ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border border-t-0 p-3 bg-slate-50/50 rounded-b-xl flex justify-between items-center">
                <HistoryPagination page={importPage} pageSize={importPageSize} total={imports.total} onPageChange={setImportPage} onPageSizeChange={setImportPageSize} />
              </div>
            </CardContent></Card>}
      </TabsContent>
      <TabsContent value="changes">
        <Card>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
              <Input type="date" value={filters.date} onChange={event => updateChangeFilter('date', event.target.value)} />
              <HistorySelect value={filters.actorIds} onChange={value => updateChangeFilter('actorIds', value)} allLabel={t('actor')} options={users.map(user => ({ id: user.id, name: user.full_name }))} />
              <HistorySelect value={filters.actionIds} onChange={value => updateChangeFilter('actionIds', value)} allLabel={t('action')} options={actions.map(action => ({ id: action, name: action }))} />
              <HistorySelect value={filters.shiftIds} onChange={value => updateChangeFilter('shiftIds', value)} allLabel={t('shiftTitle')} options={shifts.map(shift => ({ id: shift.id, name: shift.title || `${shift.date} ${shift.start_time}` }))} />
              <HistorySelect value={filters.brandIds} onChange={value => updateChangeFilter('brandIds', value)} allLabel={t('brand')} options={brands} />
              <HistorySelect value={filters.sources} onChange={value => updateChangeFilter('sources', value)} allLabel={t('source')} options={['manual','excel_import','google_sheets','system'].map(source => ({ id: source, name: source.replaceAll('_', ' ') }))} />
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="sticky top-0 bg-background"><tr className="border-b text-left"><th className="p-2">{t('date')}</th><th className="p-2">{t('actor')}</th><th className="p-2">{t('action')}</th><th className="p-2">{t('shiftTitle')}</th><th className="p-2">{t('before')}</th><th className="p-2">{t('after')}</th><th className="p-2">{t('source')}</th><th className="p-2">{t('reason')}</th><th className="p-2">{t('status')}</th></tr></thead>
                <tbody>{pagedChanges.map(log => <tr key={log.id} className="border-b align-top"><td className="p-2 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td><td className="p-2">{users.find(user => user.id === log.actor_id)?.full_name || log.actor_id}</td><td className="p-2"><Badge variant="outline">{log.action}</Badge></td><td className="p-2">{shifts.find(shift => shift.id === log.shift_id)?.title || log.shift_id}</td><td className="max-w-64 p-2 text-xs"><ChangeValue value={log.before} /></td><td className="max-w-64 p-2 text-xs"><ChangeValue value={log.after} /></td><td className="p-2">{log.source.replaceAll('_', ' ')}</td><td className="p-2">{log.reason || '—'}</td><td className="p-2"><Badge>{log.status}</Badge></td></tr>)}</tbody>
              </table>
            </div>
            <HistoryPagination page={changePage} pageSize={changePageSize} total={journal.total} onPageChange={setChangePage} onPageSizeChange={setChangePageSize} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

function HistorySelect({ value, onChange, allLabel, options }: { value: string[]; onChange: (value: string[]) => void; allLabel: string; options: Array<{ id: string; name: string }> }) {
  return <MultiSelectFilter label={allLabel} value={value} options={options.map(option => ({ value: option.id, label: option.name }))} onChange={onChange} />
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
