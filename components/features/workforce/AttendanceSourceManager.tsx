'use client'

import * as React from 'react'
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  Sliders,
  XCircle,
  Layers,
  FileCheck,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import {
  SourceProfileId,
  AttendanceSourceType,
  AttendanceMatchResult,
  AttendanceImportBatchSummary,
  DateOrderOption,
  RawAttendanceInputRow,
  ControlTimesheetRow,
} from '@/lib/workforce/historicalAttendanceTypes'
import { SOURCE_PROFILES, parseCanonicalDateWithOrder } from '@/lib/workforce/historicalAttendanceParser'
import { useTranslation } from '@/lib/i18n'

function mapJsonRowsToRawRows(
  jsonRows: Array<Record<string, unknown>>,
  mapping: {
    shiftIdCol: string
    dateCol: string
    timeCol: string
    hostCol: string
    supportCol: string
    techCol: string
    checkInCol: string
    checkOutCol: string
    notesCol: string
  },
  defaultBrand: string
): RawAttendanceInputRow[] {
  return jsonRows.map((row, idx) => {
    const findVal = (primary: string, fallbacks: string[] = []): string => {
      if (row[primary] !== undefined && row[primary] !== null && String(row[primary]).trim() !== '') {
        return String(row[primary]).trim()
      }
      const candidates = [primary, ...fallbacks].map(s => s.toLowerCase().trim())
      for (const [k, v] of Object.entries(row)) {
        if (candidates.includes(k.toLowerCase().trim()) && v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim()
        }
      }
      return ''
    }

    const dateHeaders = [mapping.dateCol, 'ngày', 'date', 'ngay'].map(h => h.toLowerCase().trim())
    const rawDateEntry = Object.entries(row).find(([key, value]) =>
      dateHeaders.includes(key.toLowerCase().trim()) && value !== null && value !== undefined && String(value).trim() !== ''
    )
    return {
      rowNumber: idx + 1,
      date: typeof rawDateEntry?.[1] === 'number' ? rawDateEntry[1] : findVal(mapping.dateCol, ['ngày', 'date', 'ngay']),
      timeRange: findVal(mapping.timeCol, ['khung giờ', 'khung gio', 'time', 'ca live', 'gio']),
      brand: findVal('Thương hiệu', ['nhãn hàng', 'brand', 'brand_name']) || defaultBrand,
      hostName: findVal(mapping.hostCol, ['host', 'mc']),
      assistantName: findVal(mapping.supportCol, ['trợ live', 'tro live', 'support', 'tro_live']),
      technicalName: findVal(mapping.techCol, ['kỹ thuật', 'ky thuat', 'tech', 'ky_thuat']),
      checkIn: findVal(mapping.checkInCol, ['check-in', 'check in', 'checkin', 'giờ vào']),
      checkOut: findVal(mapping.checkOutCol, ['check-out', 'check out', 'checkout', 'giờ ra']),
      notes: findVal(mapping.notesCol, ['ghi chú', 'ghi chu', 'note', 'notes', 'pass ca']),
      shiftCode: findVal(mapping.shiftIdCol, ['mã ca', 'ma ca', 'shiftid', 'shift_id']),
    }
  }).filter(r => r.date || r.timeRange || r.hostName || r.shiftCode)
}

function mapJsonRowsToControlRows(
  jsonRows: Array<Record<string, unknown>>
): ControlTimesheetRow[] {
  return jsonRows.map((row, idx) => {
    const findVal = (keys: string[]): string => {
      const candidates = keys.map(k => k.toLowerCase().trim())
      for (const [k, v] of Object.entries(row)) {
        if (candidates.includes(k.toLowerCase().trim()) && v !== undefined && v !== null && String(v).trim() !== '') {
          return String(v).trim()
        }
      }
      return ''
    }

    return {
      rowNumber: idx + 1,
      ShiftID: findVal(['shiftid', 'shift_id', 'mã ca', 'ma ca']),
      StaffEmail: findVal(['staffemail', 'staff_email', 'email', 'nhân sự']),
      WorkRole: findVal(['workrole', 'work_role', 'vai trò', 'role']),
      ActualStartLocal: findVal(['actualstartlocal', 'actual_start_local', 'checkin', 'check-in', 'start']),
      ActualEndLocal: findVal(['actualendlocal', 'actual_end_local', 'checkout', 'check-out', 'end']),
      Status: findVal(['status', 'trạng thái']) || 'Done',
      ConfirmedBy: findVal(['confirmedby', 'confirmed_by', 'người duyệt']),
      ConfirmedAt: findVal(['confirmedat', 'confirmed_at', 'ngày duyệt']),
      Note: findVal(['note', 'notes', 'ghi chú']),
    }
  }).filter(r => r.ShiftID || r.StaffEmail)
}

export function AttendanceSourceManager() {
  const { toast } = useToast()
  const { language } = useTranslation()
  const en = language === 'en'
  const [step, setStep] = React.useState(1)
  const [error, setError] = React.useState('')

  // State
  const [selectedProfile, setSelectedProfile] = React.useState<SourceProfileId>('opella_t10')
  const [sourceType, setSourceType] = React.useState<AttendanceSourceType>('google_sheets')
  const [dateOrder, setDateOrder] = React.useState<DateOrderOption>('month-first')
  const [sourceName, setSourceName] = React.useState('')
  const [brandName, setBrandName] = React.useState('Opella')
  const [validateWeekday, setValidateWeekday] = React.useState(true)

  // Real data state
  const [sourceRows, setSourceRows] = React.useState<Array<Record<string, unknown>>>([])
  const [pasteText, setPasteText] = React.useState('')
  const [importMethod, setImportMethod] = React.useState<'upload' | 'paste'>('upload')

  // Simulation / Data state
  const [loading, setLoading] = React.useState(false)
  const [stagedSummary, setPreviewSummary] = React.useState<AttendanceImportBatchSummary | null>(null)
  const [stagedResults, setPreviewResults] = React.useState<AttendanceMatchResult[]>([])
  const [previewIdentity, setPreviewIdentity] = React.useState<string | null>(null)
  const [activeFilter, setActiveFilter] = React.useState<'all' | 'matched' | 'exception'>('all')
  const [confirming, setConfirming] = React.useState(false)
  const [stagedConfirmedCount, setConfirmedCount] = React.useState<number | null>(null)

  // Column mapping profile state
  const [showMapping, setShowMapping] = React.useState(true)
  const [columnMapping, setColumnMapping] = React.useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('attendance_mapping_opella_t10')
        if (saved) return JSON.parse(saved)
      } catch {
        // Ignore
      }
    }
    return {
      shiftIdCol: 'Mã ca',
      dateCol: 'Ngày (MM/DD/YYYY)',
      timeCol: 'Khung giờ',
      hostCol: 'Host',
      supportCol: 'Trợ live',
      techCol: 'Kỹ thuật',
      checkInCol: 'Check-in',
      checkOutCol: 'Check-out',
      notesCol: 'Ghi chú / PASS ca',
    }
  })
  const [uploadedFileName, setUploadedFileName] = React.useState<string | null>(null)
  const [availableTabs, setAvailableTabs] = React.useState<string[]>([])
  const [selectedTab, setSelectedTab] = React.useState('')
  const [pastedTabName, setPastedTabName] = React.useState('')
  const uploadedWorkbookRef = React.useRef<XLSX.WorkBook | null>(null)
  const parsedRawRows = React.useMemo(() => selectedProfile === 'control_timesheets' ? [] : mapJsonRowsToRawRows(sourceRows, columnMapping, brandName), [sourceRows, columnMapping, brandName, selectedProfile])
  const parsedControlRows = React.useMemo(() => selectedProfile === 'control_timesheets' ? mapJsonRowsToControlRows(sourceRows) : [], [sourceRows, selectedProfile])

  const sourceIdentity = React.useMemo(() => JSON.stringify({ selectedProfile, sourceName, sourceType, dateOrder, brandName, columnMapping, sourceRows, validateWeekday, selectedTab, pastedTabName }), [selectedProfile, sourceName, sourceType, dateOrder, brandName, columnMapping, sourceRows, validateWeekday, selectedTab, pastedTabName])
  const identityRef = React.useRef(sourceIdentity)
  React.useEffect(() => { identityRef.current = sourceIdentity }, [sourceIdentity])
  const previewSummary = previewIdentity === sourceIdentity ? stagedSummary : null
  const previewResults = previewIdentity === sourceIdentity ? stagedResults : []
  const confirmedCount = previewIdentity === sourceIdentity ? stagedConfirmedCount : null
  const unclearDates = selectedProfile === 'control_timesheets' ? 0 : parsedRawRows.filter(row => !parseCanonicalDateWithOrder(row.date ?? '', dateOrder).date).length
  const sourcePeriod = React.useMemo(() => {
    const dates = selectedProfile === 'control_timesheets'
      ? parsedControlRows.map(row => row.ActualStartLocal.slice(0, 10)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
      : parsedRawRows.map(row => parseCanonicalDateWithOrder(row.date ?? '', dateOrder).date).filter((value): value is string => Boolean(value))
    if (dates.length === 0) return '—'
    dates.sort()
    return dates[0] === dates[dates.length - 1] ? dates[0] : dates[0] + ' → ' + dates[dates.length - 1]
  }, [selectedProfile, parsedControlRows, parsedRawRows, dateOrder])

  // Profile selection changes defaults
  const handleProfileChange = (profileId: SourceProfileId) => {
    setSelectedProfile(profileId)
    const prof = SOURCE_PROFILES[profileId]
    if (prof) {
      setDateOrder(prof.dateOrder)
      setSourceType(importMethod === 'paste' ? 'google_sheets' : uploadedFileName ? (uploadedFileName.toLowerCase().endsWith('.csv') ? 'csv_upload' : 'excel_upload') : prof.sourceType)
      setValidateWeekday(Boolean(prof.validateWeekday))
      if (profileId === 'opella_t10') {
        setBrandName('Opella')
        setColumnMapping({
          shiftIdCol: 'Mã ca',
          dateCol: 'Ngày (MM/DD/YYYY)',
          timeCol: 'Khung giờ',
          hostCol: 'Host',
          supportCol: 'Trợ live',
          techCol: 'Kỹ thuật',
          checkInCol: 'Check-in',
          checkOutCol: 'Check-out',
          notesCol: 'Ghi chú / PASS ca',
        })
      } else if (profileId === 'pepsico_t10') {
        setBrandName('PepsiCo')
        setColumnMapping({
          shiftIdCol: 'Mã ca',
          dateCol: 'Ngày (MM/DD/YYYY)',
          timeCol: 'Khung giờ',
          hostCol: 'Host',
          supportCol: 'Trợ live',
          techCol: 'Kỹ thuật',
          checkInCol: 'Check-in',
          checkOutCol: 'Check-out',
          notesCol: 'Ghi chú / PASS ca',
        })
      } else if (profileId === 'control_timesheets') {
        setBrandName('')
        setColumnMapping({
          shiftIdCol: 'ShiftID',
          dateCol: 'ActualStartLocal',
          timeCol: 'ActualEndLocal',
          hostCol: 'StaffEmail',
          supportCol: 'WorkRole',
          techCol: 'BreakMinutes',
          checkInCol: 'ActualStartLocal',
          checkOutCol: 'ActualEndLocal',
          notesCol: 'Note',
        })
      }

      try {
        const saved = localStorage.getItem(`attendance_mapping_${profileId}`)
        if (saved) {
          setColumnMapping(JSON.parse(saved))
        }
      } catch {
        // Ignore
      }
    }
  }

  const handleSaveMappingProfile = () => {
    try {
      localStorage.setItem(`attendance_mapping_${selectedProfile}`, JSON.stringify(columnMapping))
      toast({
        title: en ? 'Column mapping saved' : 'Đã lưu cấu hình ánh xạ cột',
        description: en ? `Mapping for '${sourceName}' was saved.` : `Cấu hình ánh xạ cho nguồn '${sourceName}' đã được lưu thành công.`,
      })
    } catch {
      toast({
        title: en ? 'Could not save mapping locally' : 'Không thể lưu vào bộ nhớ cục bộ',
        variant: 'destructive',
      })
    }
    setShowMapping(false)
  }

  // Real Excel / CSV File Parsing via XLSX
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError(en ? 'Choose an Excel or CSV file.' : 'Chọn tệp Excel hoặc CSV.')
      return
    }

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      if (!firstSheetName) {
        setError(en ? 'Workbook has no worksheets.' : 'Tệp Excel không có sheet dữ liệu.')
        return
      }
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

      if (jsonRows.length === 0) {
        setError(en ? 'The file has no data rows.' : 'Tệp không có dòng dữ liệu.')
        toast({
          title: en ? 'Empty file' : 'Tệp không có dữ liệu',
          description: en ? 'No data rows were found.' : 'Bảng tính tải lên trống hoặc không tìm thấy dòng dữ liệu.',
          variant: 'destructive',
        })
        return
      }

      uploadedWorkbookRef.current = workbook
      setAvailableTabs(workbook.SheetNames)
      setSelectedTab(firstSheetName)
      setSourceRows(jsonRows)
      setUploadedFileName(file.name)
      setSourceName(file.name)
      setSourceType(file.name.toLowerCase().endsWith('.csv') ? 'csv_upload' : 'excel_upload')
      setError('')

      if (selectedProfile === 'control_timesheets') {
        const ctrlRows = mapJsonRowsToControlRows(jsonRows)
        toast({
          title: en ? 'CONTROL TIMESHEETS loaded' : 'Đã nạp tệp CONTROL TIMESHEETS',
          description: en ? `${file.name}: ${ctrlRows.length} rows.` : `Tệp: ${file.name}. Đã phân tích ${ctrlRows.length} dòng chấm công kiểm soát.`,
        })
      } else {
        const rows = mapJsonRowsToRawRows(jsonRows, columnMapping, brandName)
        toast({
          title: en ? 'Attendance file loaded' : 'Đã nạp tệp chấm công',
          description: en ? `${file.name}: ${rows.length} rows.` : `Tệp: ${file.name}. Đã phân tích thành công ${rows.length} dòng dữ liệu thực tế.`,
        })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'FILE_READ_FAILED')
      toast({
        title: en ? 'Could not read Excel/CSV file' : 'Lỗi đọc tệp Excel/CSV',
        description: err instanceof Error ? err.message : 'Không thể đọc tệp dữ liệu',
        variant: 'destructive',
      })
    }
  }

  // Profile is a mapping preset; this selector switches a real workbook tab.
  const handleWorksheetChange = (name: string) => {
    const sheet = uploadedWorkbookRef.current?.Sheets[name]
    if (!sheet || !availableTabs.includes(name)) return
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    setSelectedTab(name)
    setSourceRows(rows)
    setError(rows.length ? '' : (en ? 'Selected worksheet has no data rows.' : 'Sheet đã chọn không có dòng dữ liệu.'))
  }

  // Real Google Sheets Paste Table Parser (TSV format from clipboard)
  const handleParsePastedData = () => {
    if (/^\s*https?:\/\/(?:docs\.google\.com\/spreadsheets\/|drive\.google\.com\/)/i.test(pasteText)) {
      setSourceRows([])
      setError(en ? 'Google Sheets URLs cannot be imported. Copy cells including headers instead.' : 'Không hỗ trợ nhập URL Google Sheets. Hãy sao chép các ô kèm hàng tiêu đề.')
      return
    }
    if (!pasteText.trim()) {
      toast({
        title: en ? 'No pasted data' : 'Chưa có nội dung dán',
        description: en ? 'Paste rows from Google Sheets below.' : 'Vui lòng dán dữ liệu bảng từ Google Sheets vào ô bên dưới.',
        variant: 'destructive',
      })
      return
    }

    const lines = pasteText.trim().split(/\r?\n/)
    if (lines.length < 2) {
      toast({
        title: en ? 'Not enough rows' : 'Dữ liệu quá ngắn',
        description: en ? 'Include a header row and at least one data row.' : 'Cần ít nhất 1 dòng tiêu đề cột và 1 dòng dữ liệu.',
        variant: 'destructive',
      })
      return
    }

    const firstLine = lines[0]
    const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ','
    const headers = firstLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''))

    const jsonRows: Array<Record<string, unknown>> = []
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''))
      if (cols.every(c => !c)) continue
      const rowObj: Record<string, unknown> = {}
      headers.forEach((h, idx) => {
        rowObj[h] = cols[idx] || ''
      })
      jsonRows.push(rowObj)
    }

    setSourceRows(jsonRows)
    setSourceType('google_sheets')
    setAvailableTabs([])
    setSelectedTab('')
    uploadedWorkbookRef.current = null
    setUploadedFileName(null)
    setError('')

    if (selectedProfile === 'control_timesheets') {
      const ctrlRows = mapJsonRowsToControlRows(jsonRows)
      toast({
        title: en ? 'Pasted rows parsed' : 'Đã phân tích bảng Google Sheets',
        description: en ? `${ctrlRows.length} CONTROL TIMESHEETS rows loaded.` : `Đã nạp ${ctrlRows.length} dòng CONTROL TIMESHEETS thực tế.`,
      })
    } else {
      const rows = mapJsonRowsToRawRows(jsonRows, columnMapping, brandName)
      toast({
        title: en ? 'Pasted rows parsed' : 'Đã phân tích bảng Google Sheets',
        description: en ? `${rows.length} attendance rows loaded.` : `Đã nạp ${rows.length} dòng chấm công thực tế từ Google Sheets.`,
      })
    }
  }

  // Run Preview via API (Zero Fake Fallbacks)
  const handleRunPreview = async () => {
    if (!sourceName.trim()) {
      setError(en ? 'Enter a source name before preview.' : 'Nhập tên nguồn trước khi xem trước.')
      return
    }
    if (parsedRawRows.length === 0 && parsedControlRows.length === 0) {
      toast({
        title: en ? 'No attendance rows' : 'Chưa có dữ liệu chấm công',
        description: en ? 'Upload Excel/CSV or paste Google Sheets rows first.' : 'Vui lòng tải lên tệp Excel/CSV hoặc dán dữ liệu từ Google Sheets trước khi phân tích.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    setError('')
    setPreviewSummary(null)
    setPreviewResults([])
    const identity = sourceIdentity

    try {
      const res = await fetch('/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: selectedProfile,
          dateOrder,
          sourceName,
          sourceType,
          brandName,
          rawRows: parsedRawRows,
          controlRows: parsedControlRows,
          validateWeekday,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (identity !== identityRef.current) return

      if (!res.ok || !data.ok) {
        const errMsg = data.error?.detail || data.error?.code || `Lỗi máy chủ (${res.status})`
        throw new Error(errMsg)
      }

      setPreviewIdentity(identity)
      setConfirmedCount(null)
      setPreviewSummary(data.summary)
      setPreviewResults(data.results || [])
      toast({
        title: en ? 'Matching complete' : 'Phân tích & Khớp nối hoàn tất',
        description: en ? `${data.summary?.totalRows || 0} rows: ${data.summary?.matchedRows || 0} matched, ${data.summary?.exceptionRows || 0} exceptions.` : `Đã phân tích ${data.summary?.totalRows || 0} dòng: ${data.summary?.matchedRows || 0} hợp lệ, ${data.summary?.exceptionRows || 0} cần xử lý ngoại lệ.`,
      })
    } catch (err: unknown) {
      if (identity !== identityRef.current) return
      setError(err instanceof Error ? err.message : 'PREVIEW_FAILED')
      toast({
        title: en ? 'Attendance preview failed' : 'Lỗi nạp nguồn chấm công',
        description: err instanceof Error ? err.message : (en ? 'Could not reach the API' : 'Không thể kết nối API'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Confirm Drafts (Client only sends batchId; Server loads immutable staged rows)
  const handleConfirmDrafts = async () => {
    if (!previewSummary?.batchId || confirmedCount !== null || confirming || step !== 5) return
    setConfirming(true)
    setError('')
    const identity = sourceIdentity
    try {
      const res = await fetch('/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm_drafts',
          batchId: previewSummary.batchId,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (identity !== identityRef.current) return
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.detail || data.error?.code || 'CONFIRM_FAILED')
      }

      toast({
        title: en ? 'DRAFT attendance created' : 'Đã tạo bản ghi Actual Staffing (DRAFT)',
        description: en ? `Created ${data.createdCount} DRAFT records for independent review.` : `Thành công tạo ${data.createdCount} ca chấm công nháp. Vui lòng chuyển Reviewer độc lập để kiểm duyệt.`,
      })
      setConfirmedCount(data.createdCount)
    } catch (err: unknown) {
      if (identity !== identityRef.current) return
      setError(err instanceof Error ? err.message : 'CONFIRM_FAILED')
      toast({
        title: en ? 'Attendance confirmation failed' : 'Lỗi xác nhận bảng chấm công',
        description: err instanceof Error ? err.message : (en ? 'Confirmation failed' : 'Xác nhận thất bại'),
        variant: 'destructive',
      })
    } finally {
      setConfirming(false)
    }
  }

  const filteredResults = previewResults.filter(r => {
    if (activeFilter === 'matched') return r.status === 'matched'
    if (activeFilter === 'exception') return r.status === 'exception'
    return true
  })

  const stepLabels = en
    ? ['Source / File', 'Mapping', 'Matching', 'Exception Review', 'Confirm / Result']
    : ['Nguồn / Tệp', 'Ánh xạ', 'Đối chiếu', 'Rà soát ngoại lệ', 'Xác nhận / Kết quả']

  const goNext = () => {
    if (step === 1 && !sourceName.trim()) {
      setError(en ? 'Enter a source name.' : 'Nhập tên nguồn dữ liệu.')
      return
    }
    if (step === 1 && !sourceRows.length) {
      setError(en ? 'Upload a file or parse pasted rows first.' : 'Tải tệp hoặc đọc dữ liệu đã dán trước.')
      return
    }
    if (step === 2) {
      const headers = Object.keys(sourceRows[0] || {}).map(key => key.toLowerCase().trim())
      const hasColumn = (key: string) => headers.includes(key.toLowerCase().trim())
      const required = selectedProfile === 'control_timesheets'
        ? ['ShiftID', 'StaffEmail', 'WorkRole', 'ActualStartLocal', 'ActualEndLocal']
        : [columnMapping.dateCol, columnMapping.timeCol]
      const missing = required.filter(key => !hasColumn(key))
      if (missing.length) {
        setError(`${en ? 'Missing columns' : 'Thiếu cột'}: ${missing.join(', ')}`)
        return
      }
      if (!parsedRawRows.length && !parsedControlRows.length) {
        setError(en ? 'No readable rows.' : 'Không có dòng dữ liệu đọc được.')
        return
      }
    }
    if (step === 3 && !previewSummary) {
      setError(en ? 'Run matching before review.' : 'Chạy đối chiếu trước khi rà soát.')
      return
    }
    if (step === 4 && !previewSummary) return
    setError('')
    if (step === 3) setActiveFilter('exception')
    setStep(current => Math.min(current + 1, 5))
  }

  return (
    <div className="space-y-6" data-testid="attendance-source-manager">
      <nav aria-label={en ? 'Import steps' : 'Các bước nhập chấm công'} className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {stepLabels.map((label, index) => (
          <button key={label} type="button" aria-current={step === index + 1 ? 'step' : undefined}
            disabled={index + 1 > step || confirming || loading}
            onClick={() => { setStep(index + 1); setError('') }}
            className={`rounded-lg border px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-indigo-400 ${step === index + 1 ? 'border-indigo-400 bg-indigo-950 text-white' : 'border-slate-700 text-slate-400 disabled:opacity-60'}`}>
            <span className="mr-2 font-bold">{index + 1}</span>{label}
          </button>
        ))}
      </nav>
      {error && <p role="alert" className="rounded border border-rose-700 bg-rose-950/40 p-3 text-sm text-rose-300">{error}</p>}
      {/* 1. SOURCE SELECTOR & COLUMN MAPPING CARD */}
      {step <= 2 && <Card className="border-slate-800 bg-slate-900/60 shadow-xl">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-lg font-semibold text-white">
                  {en ? 'Historical Attendance Import' : 'Nhập chấm công lịch sử'}
                </CardTitle>
                <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs">
                  RC1.7C BOTH
                </Badge>
              </div>
              <CardDescription className="text-slate-400 text-xs">
                {en ? 'Review attendance from Google Sheets or Excel before creating DRAFT records.' : 'Rà soát dữ liệu Google Sheets / Excel trước khi tạo chấm công DRAFT.'}
              </CardDescription>
            </div>
            {step === 2 && <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMapping(!showMapping)}
                className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <Sliders className="mr-1.5 h-3.5 w-3.5" />
                {showMapping ? (en ? 'Hide column mapping' : 'Đóng cấu hình cột') : (en ? 'Configure column mapping' : 'Cấu hình ánh xạ cột')}
              </Button>
            </div>}
          </div>
        </CardHeader>

        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Profile Picker */}
          {step === 1 && <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              {en ? 'Source profile' : 'Nguồn / Tab dữ liệu'}
            </label>
            <select
              value={selectedProfile}
              onChange={e => handleProfileChange(e.target.value as SourceProfileId)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="opella_t10">{en ? 'OPELLA OCTOBER FINAL (MM/DD/YYYY)' : 'OPELLA THÁNG 10 FINAL (MM/DD/YYYY)'}</option>
              <option value="pepsico_t10">{en ? 'PEPSICO OCTOBER FINAL (MM/DD/YYYY)' : 'PEPSICO THÁNG 10 FINAL (MM/DD/YYYY)'}</option>
              <option value="control_timesheets">ADA SHIFT MANAGER · CONTROL (TIMESHEETS)</option>
              <option value="custom">{en ? 'Custom Excel/CSV upload' : 'File Excel/CSV tải lên tùy chỉnh'}</option>
            </select>
          </div>}

          {/* Date Order Setting */}
          {step === 2 && <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              {en ? 'Date order' : 'Quy tắc ngày tháng'}
            </label>
            <select
              value={dateOrder}
              onChange={e => setDateOrder(e.target.value as DateOrderOption)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="month-first">{en ? 'MM/DD/YYYY (month first)' : 'MM/DD/YYYY (Tháng trước - Opella/PepsiCo T10)'}</option>
              <option value="day-first">{en ? 'DD/MM/YYYY (day first)' : 'DD/MM/YYYY (Ngày trước - Mặc định VN)'}</option>
              <option value="iso">YYYY-MM-DD (ISO 8601)</option>
            </select>
          </div>}

          {/* Brand Scope */}
          {step === 1 && <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">{en ? 'Brand' : 'Nhãn hàng'}</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="VD: Opella, PepsiCo"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>}

          {/* File Upload / Source Name */}
          {step === 1 && <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-slate-400" />
                {en ? 'Import method' : 'Phương thức nạp'}
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => { if (importMethod !== 'upload') { setImportMethod('upload'); setSourceRows([]); setUploadedFileName(null); setSourceName('') } }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${importMethod === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  File
                </button>
                <button
                  type="button"
                  onClick={() => { if (importMethod !== 'paste') { setImportMethod('paste'); setSourceRows([]); setUploadedFileName(null); setSourceName('') } }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${importMethod === 'paste' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {en ? 'Paste Sheets' : 'Dán Sheets'}
                </button>
              </div>
            </div>

            {importMethod === 'upload' ? (
              <>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="w-full text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[11px] file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer"
                />
                {uploadedFileName && (
                  <span className="text-[10px] text-indigo-400 block truncate font-medium">
                    {en ? 'Loaded' : 'Đã nạp'}: {uploadedFileName} ({parsedRawRows.length || parsedControlRows.length} {en ? 'rows' : 'dòng'})
                  </span>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <input type="text" value={sourceName} onChange={e => setSourceName(e.target.value)}
                  aria-label={en ? 'Source name' : 'Tên nguồn'} placeholder={en ? 'Source name' : 'Tên nguồn dữ liệu'}
                  className="w-full rounded border border-slate-700 bg-slate-950 p-2 text-xs text-white" />
                <textarea
                  value={pasteText}
                  onChange={e => { setPasteText(e.target.value); setSourceRows([]) }}
                  aria-label={en ? 'Paste attendance rows' : 'Dán dữ liệu chấm công'}
                  placeholder={en ? 'Paste rows copied from Google Sheets here (Ctrl+V)...' : 'Dán các hàng copy từ Google Sheets vào đây (Ctrl+V)...'}
                  rows={2}
                  className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleParsePastedData}
                  className="w-full h-6 text-[10px] bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  {en ? 'Parse pasted rows' : 'Đọc dữ liệu dán'} ({parsedRawRows.length || parsedControlRows.length})
                </Button>
              </div>
            )}
          </div>}
        </CardContent>

        {/* GOOGLE SHEETS API STATUS BANNER */}
        {step === 1 && importMethod === 'paste' && (
          <div className="border-t border-slate-800/60 bg-amber-950/20 px-4 py-2 text-[11px] text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              {en ? 'Direct Google Sheets API access requires an authorized service account. Paste rows here or upload an exported Excel file.' : 'Tính năng tự động đọc trực tiếp từ Google Sheets API yêu cầu cấu hình Service Account đã cấp quyền. Hiện tại bạn có thể copy-paste toàn bộ bảng dữ liệu vào đây hoặc tải lên file Excel xuất từ Google Sheets.'}
            </span>
          </div>
        )}

        {/* EXPANDABLE COLUMN MAPPING PROFILE */}
        {step === 2 && showMapping && (
          <div className="border-t border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5" /> {en ? 'Column mapping for' : 'Ánh xạ cột cho nguồn'}: {sourceName}
              </h4>
              <Button
                size="sm"
                onClick={handleSaveMappingProfile}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-7 px-3"
              >
                {en ? 'Save mapping' : 'Lưu mẫu ánh xạ'}
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Shift ID column' : 'Cột Mã ca'}</label>
                <input
                  type="text"
                  value={columnMapping.shiftIdCol}
                  onChange={e => setColumnMapping({ ...columnMapping, shiftIdCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Date column' : 'Cột Ngày live'}</label>
                <input
                  type="text"
                  value={columnMapping.dateCol}
                  aria-label={en ? 'Date column mapping' : 'Ánh xạ cột ngày'}
                  onChange={e => setColumnMapping({ ...columnMapping, dateCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Time column' : 'Cột Khung giờ'}</label>
                <input
                  type="text"
                  value={columnMapping.timeCol}
                  aria-label={en ? 'Time column mapping' : 'Ánh xạ cột giờ'}
                  onChange={e => setColumnMapping({ ...columnMapping, timeCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Host column' : 'Cột Host'}</label>
                <input
                  type="text"
                  value={columnMapping.hostCol}
                  onChange={e => setColumnMapping({ ...columnMapping, hostCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Support column' : 'Cột Trợ live'}</label>
                <input
                  type="text"
                  value={columnMapping.supportCol}
                  onChange={e => setColumnMapping({ ...columnMapping, supportCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Technical column' : 'Cột Kỹ thuật'}</label>
                <input
                  type="text"
                  value={columnMapping.techCol}
                  onChange={e => setColumnMapping({ ...columnMapping, techCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Check-in column' : 'Cột Check-in'}</label>
                <input
                  type="text"
                  value={columnMapping.checkInCol}
                  onChange={e => setColumnMapping({ ...columnMapping, checkInCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">{en ? 'Check-out column' : 'Cột Check-out'}</label>
                <input
                  type="text"
                  value={columnMapping.checkOutCol}
                  onChange={e => setColumnMapping({ ...columnMapping, checkOutCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
            </div>
          </div>
        )}
      </Card>}

      {step === 2 && <div className="rounded border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">
        <p className="mb-2 font-medium">{en ? 'Read rows' : 'Dữ liệu đã đọc'}: {sourceRows.length}</p>
        {unclearDates > 0 && <p role="status" className="mb-2 text-amber-300">{unclearDates} {en ? 'rows have invalid or ambiguous dates; matching will show them as exceptions.' : 'dòng có ngày sai hoặc mơ hồ; bước đối chiếu sẽ liệt kê thành ngoại lệ.'}</p>}
        {sourceRows.length ? <div className="overflow-x-auto"><table className="min-w-full text-xs"><thead><tr>{Object.keys(sourceRows[0]).map(key => <th key={key} className="px-2 py-1 text-left">{key}</th>)}</tr></thead><tbody>{sourceRows.slice(0, 5).map((row, index) => <tr key={index}>{Object.keys(sourceRows[0]).map(key => <td key={key} className="px-2 py-1">{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div> : <p>{en ? 'No rows loaded.' : 'Chưa có dữ liệu.'}</p>}
      </div>}

      {step === 3 && <div className="rounded border border-slate-700 bg-slate-900 p-4">
        <p className="mb-3 text-sm text-slate-300">{en ? 'Match rows against completed shifts and staff. Preview stages a batch; it does not create actual attendance.' : 'Đối chiếu ca hoàn thành và nhân sự. Xem trước chỉ lưu batch tạm, chưa tạo chấm công thực tế.'}</p>
        <Button onClick={handleRunPreview} disabled={loading || confirming}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? (en ? 'Matching...' : 'Đang đối chiếu...') : (en ? 'Run matching' : 'Chạy đối chiếu')}
        </Button>
      </div>}

      {/* 2. RECONCILIATION SUMMARY TILES: 6 CORE RECONCILIATION METRICS */}
      {step >= 3 && previewSummary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="reconciliation-tiles">
          {/* Tile 1: Matched */}
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 text-center">
            <p className="text-xs text-emerald-400 font-medium">{en ? 'Matched' : 'Hợp lệ'}</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{previewSummary.matchedRows}</p>
          </div>

          {/* Tile 2: Ambiguous */}
          <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3 text-center">
            <p className="text-xs text-indigo-400 font-medium">{en ? 'Ambiguous' : 'Mơ hồ'}</p>
            <p className="text-xl font-bold text-indigo-400 mt-1">
              {(previewSummary.exceptionsSummary?.AMBIGUOUS_DATE_ORDER || 0) +
                (previewSummary.exceptionsSummary?.ROLE_AMBIGUOUS || 0)}
            </p>
          </div>

          {/* Tile 3: Missing Evidence */}
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-center">
            <p className="text-xs text-amber-400 font-medium">{en ? 'Missing evidence' : 'Thiếu chứng cứ'}</p>
            <p className="text-xl font-bold text-amber-400 mt-1">
              {previewSummary.exceptionsSummary?.MISSING_EVIDENCE || 0}
            </p>
          </div>

          {/* Tile 4: Duplicate / Overlap */}
          <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-center">
            <p className="text-xs text-rose-400 font-medium">{en ? 'Duplicate / overlap' : 'Trùng / Chồng giờ'}</p>
            <p className="text-xl font-bold text-rose-400 mt-1">
              {previewSummary.exceptionsSummary?.OVERLAP_CONFLICT || 0}
            </p>
          </div>

          {/* Tile 5: Invalid Format / Times */}
          <div className="rounded-lg border border-orange-900/50 bg-orange-950/30 p-3 text-center">
            <p className="text-xs text-orange-400 font-medium">{en ? 'Invalid format' : 'Sai định dạng'}</p>
            <p className="text-xl font-bold text-orange-400 mt-1">
              {(previewSummary.exceptionsSummary?.TIME_RANGE_INVALID || 0) +
                (previewSummary.exceptionsSummary?.WEEKDAY_MISMATCH || 0) +
                (previewSummary.exceptionsSummary?.INVALID_CONTROL_STRUCTURE || 0)}
            </p>
          </div>

          {/* Tile 6: Unmatched / Shift Not Completed */}
          <div className="rounded-lg border border-purple-900/50 bg-purple-950/30 p-3 text-center">
            <p className="text-xs text-purple-400 font-medium">{en ? 'Unmatched shift' : 'Không khớp ca'}</p>
            <p className="text-xl font-bold text-purple-400 mt-1">
              {(previewSummary.exceptionsSummary?.SHIFT_NOT_FOUND || 0) +
                (previewSummary.exceptionsSummary?.STAFF_NOT_FOUND || 0) +
                (previewSummary.exceptionsSummary?.SHIFT_NOT_COMPLETED || 0)}
            </p>
          </div>
        </div>
      )}

      {/* 3. RECONCILIATION & EXCEPTION QUEUE TABLE */}
      {step >= 3 && step <= 4 && previewResults.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl">
          <CardHeader className="border-b border-slate-800/80 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-indigo-400" />
              <CardTitle className="text-sm font-semibold text-white">
                {en ? 'Matching results and exceptions' : 'Bảng đối soát & Hàng đợi ngoại lệ'}
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Button
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('all')}
                className="h-7 px-2.5 text-xs"
              >
                {en ? 'All' : 'Tất cả'} ({previewResults.length})
              </Button>
              <Button
                variant={activeFilter === 'matched' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('matched')}
                className="h-7 px-2.5 text-xs border-emerald-800 text-emerald-400"
              >
                {en ? 'Matched' : 'Hợp lệ'} ({previewSummary?.matchedRows || 0})
              </Button>
              <Button
                variant={activeFilter === 'exception' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('exception')}
                className="h-7 px-2.5 text-xs border-rose-800 text-rose-400"
              >
                {en ? 'Exceptions' : 'Ngoại lệ'} ({previewSummary?.exceptionRows || 0})
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Row' : 'Dòng'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Date' : 'Ngày live'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Time' : 'Khung giờ'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Staff' : 'Nhân sự'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Role' : 'Vai trò'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Coverage' : 'Hình thức'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Evidence' : 'Minh chứng'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Status' : 'Trạng thái'}</th>
                    <th className="py-2.5 px-3 font-medium">{en ? 'Reason / Note' : 'Chi tiết lỗi / Ghi chú'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredResults.map(item => {
                    const isMatched = item.status === 'matched'
                    const seg = item.segment

                    return (
                      <tr key={`${item.rowNumber}-${seg.operationalRole}-${seg.normalizedStaffName}`} className="hover:bg-slate-800/30">
                        <td className="py-2 px-3 font-mono text-slate-400">#{item.rowNumber}</td>
                        <td className="py-2 px-3 font-medium text-white">{seg.parsedDate || '—'}</td>
                        <td className="py-2 px-3 text-slate-300">{seg.startTime} - {seg.endTime} ({seg.durationMinutes}p)</td>
                        <td className="py-2 px-3 font-medium text-white">
                          {seg.rawStaffName}
                          {seg.staffEmail && <span className="block text-[10px] text-slate-400">{seg.staffEmail}</span>}
                        </td>
                        <td className="py-2 px-3">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            seg.operationalRole === 'host' ? 'bg-indigo-900/40 text-indigo-300' :
                            seg.operationalRole === 'support' ? 'bg-cyan-900/40 text-cyan-300' :
                            'bg-amber-900/40 text-amber-300'
                          }`}>
                            {seg.operationalRole}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          {seg.coverageKind === 'cover' ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-[10px]">
                              {en ? 'Cover' : 'PASS ca'}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">{en ? 'Regular' : 'Chuẩn'}</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {seg.evidenceKind === 'actual_punch' && (
                            <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Check-in/out
                            </span>
                          )}
                          {seg.evidenceKind === 'supervisor_verified' && (
                            <span className="inline-flex items-center gap-1 text-cyan-400 text-[11px]">
                              <ShieldCheck className="h-3 w-3" /> {en ? 'Lead verified' : 'Lead duyệt'}
                            </span>
                          )}
                          {seg.evidenceKind === 'missing_evidence' && (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <AlertCircle className="h-3 w-3" /> {en ? 'Scheduled only (missing evidence)' : 'Giờ lịch (Thiếu chứng cứ)'}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isMatched ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> {en ? 'Completed shift matched' : 'Khớp ca completed'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950 text-rose-400 border border-rose-800">
                              <XCircle className="h-3 w-3" /> {item.exceptionCode}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-400 text-[11px] max-w-xs truncate" title={item.exceptionDetail || seg.rawNotes}>
                          {item.exceptionDetail || seg.rawNotes || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>

        </Card>
      )}
      {step === 4 && previewSummary && <p className="text-sm text-slate-300" role="status">
        {en ? 'Expected result' : 'Kết quả dự kiến'}: {previewSummary.matchedRows} DRAFT, {previewSummary.exceptionRows} {en ? 'exceptions require correction' : 'ngoại lệ cần xử lý'}.
      </p>}
      {step === 4 && previewSummary?.exceptionRows === 0 && <p className="rounded border border-emerald-800 p-3 text-sm text-emerald-300">{en ? 'No exceptions found.' : 'Không có dòng ngoại lệ.'}</p>}
      {step === 5 && previewSummary && <Card className="border-slate-700 bg-slate-900 text-slate-200">
        <CardContent className="space-y-3 pt-5 text-sm">
          <p>{en ? 'Matched rows to create as DRAFT' : 'Dòng hợp lệ sẽ tạo DRAFT'}: <strong>{previewSummary.matchedRows}</strong></p>
          <p>{en ? 'Exceptions not imported' : 'Ngoại lệ không được nhập'}: <strong>{previewSummary.exceptionRows}</strong></p>
          <p>{en ? 'Batch' : 'Batch'}: <code>{previewSummary.batchId}</code></p>
          <p>{en ? 'An independent reviewer must approve DRAFT attendance before payroll.' : 'Reviewer độc lập phải duyệt chấm công DRAFT trước khi tính lương.'}</p>
          {confirmedCount !== null && <p role="status" className="text-emerald-400">{en ? 'Confirmed' : 'Đã xác nhận'}: {confirmedCount} DRAFT</p>}
        </CardContent>
        <CardFooter>
          <Button onClick={handleConfirmDrafts} disabled={confirming || loading || confirmedCount !== null || previewSummary.matchedRows === 0}>
            <FileCheck className="mr-2 h-4 w-4" />
            {confirming ? (en ? 'Confirming...' : 'Đang xác nhận...') : (en ? 'Confirm DRAFT attendance' : 'Xác nhận chấm công DRAFT')}
          </Button>
        </CardFooter>
      </Card>}
      <div className="flex justify-between gap-3">
        <Button variant="outline" disabled={step === 1 || loading || confirming} onClick={() => { setStep(step - 1); setError('') }}>{en ? 'Back' : 'Quay lại'}</Button>
        {step < 5 && <Button disabled={loading || confirming} onClick={goNext}>{en ? 'Continue' : 'Tiếp tục'}</Button>}
      </div>
    </div>
  )
}
