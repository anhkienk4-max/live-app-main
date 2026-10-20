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
import { SOURCE_PROFILES } from '@/lib/workforce/historicalAttendanceParser'

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

    return {
      rowNumber: idx + 1,
      date: findVal(mapping.dateCol, ['ngày', 'date', 'ngay']),
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

  // State
  const [selectedProfile, setSelectedProfile] = React.useState<SourceProfileId>('opella_t10')
  const [sourceType, setSourceType] = React.useState<AttendanceSourceType>('google_sheets')
  const [dateOrder, setDateOrder] = React.useState<DateOrderOption>('month-first')
  const [sourceName, setSourceName] = React.useState('OPELLA_THÁNG_10_FINAL.xlsx')
  const [brandName, setBrandName] = React.useState('Opella')
  const [validateWeekday, setValidateWeekday] = React.useState(true)

  // Real data state
  const [parsedRawRows, setParsedRawRows] = React.useState<RawAttendanceInputRow[]>([])
  const [parsedControlRows, setParsedControlRows] = React.useState<ControlTimesheetRow[]>([])
  const [pasteText, setPasteText] = React.useState('')
  const [importMethod, setImportMethod] = React.useState<'upload' | 'paste'>('upload')

  // Simulation / Data state
  const [loading, setLoading] = React.useState(false)
  const [previewSummary, setPreviewSummary] = React.useState<AttendanceImportBatchSummary | null>(null)
  const [previewResults, setPreviewResults] = React.useState<AttendanceMatchResult[]>([])
  const [activeFilter, setActiveFilter] = React.useState<'all' | 'matched' | 'exception'>('all')
  const [confirming, setConfirming] = React.useState(false)

  // Column mapping profile state
  const [showMapping, setShowMapping] = React.useState(false)
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

  // Profile selection changes defaults
  const handleProfileChange = (profileId: SourceProfileId) => {
    setSelectedProfile(profileId)
    const prof = SOURCE_PROFILES[profileId]
    if (prof) {
      setDateOrder(prof.dateOrder)
      setSourceType(prof.sourceType)
      setValidateWeekday(Boolean(prof.validateWeekday))
      if (profileId === 'opella_t10') {
        setSourceName('OPELLA THÁNG 10 FINAL')
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
        setSourceName('PEPSICO THÁNG 10 FINAL')
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
        setSourceName('ADA SHIFT MANAGER · CONTROL')
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
        title: 'Đã lưu cấu hình ánh xạ cột',
        description: `Cấu hình ánh xạ cho nguồn '${sourceName}' đã được lưu thành công.`,
      })
    } catch {
      toast({
        title: 'Không thể lưu vào bộ nhớ cục bộ',
        variant: 'destructive',
      })
    }
    setShowMapping(false)
  }

  // Real Excel / CSV File Parsing via XLSX
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadedFileName(file.name)
    setSourceName(file.name)
    setSelectedProfile('custom')
    setSourceType(file.name.endsWith('.csv') ? 'csv_upload' : 'excel_upload')

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

      if (jsonRows.length === 0) {
        toast({
          title: 'Tệp không có dữ liệu',
          description: 'Bảng tính tải lên trống hoặc không tìm thấy dòng dữ liệu.',
          variant: 'destructive',
        })
        return
      }

      if (selectedProfile === 'control_timesheets') {
        const ctrlRows = mapJsonRowsToControlRows(jsonRows)
        setParsedControlRows(ctrlRows)
        setParsedRawRows([])
        toast({
          title: 'Đã nạp tệp CONTROL TIMESHEETS',
          description: `Tệp: ${file.name}. Đã phân tích ${ctrlRows.length} dòng chấm công kiểm soát.`,
        })
      } else {
        const rows = mapJsonRowsToRawRows(jsonRows, columnMapping, brandName)
        setParsedRawRows(rows)
        setParsedControlRows([])
        toast({
          title: 'Đã nạp tệp chấm công',
          description: `Tệp: ${file.name}. Đã phân tích thành công ${rows.length} dòng dữ liệu thực tế.`,
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Lỗi đọc tệp Excel/CSV',
        description: err instanceof Error ? err.message : 'Không thể đọc tệp dữ liệu',
        variant: 'destructive',
      })
    }
  }

  // Real Google Sheets Paste Table Parser (TSV format from clipboard)
  const handleParsePastedData = () => {
    if (!pasteText.trim()) {
      toast({
        title: 'Chưa có nội dung dán',
        description: 'Vui lòng dán dữ liệu bảng từ Google Sheets vào ô bên dưới.',
        variant: 'destructive',
      })
      return
    }

    const lines = pasteText.trim().split(/\r?\n/)
    if (lines.length < 2) {
      toast({
        title: 'Dữ liệu quá ngắn',
        description: 'Cần ít nhất 1 dòng tiêu đề cột và 1 dòng dữ liệu.',
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

    if (selectedProfile === 'control_timesheets') {
      const ctrlRows = mapJsonRowsToControlRows(jsonRows)
      setParsedControlRows(ctrlRows)
      setParsedRawRows([])
      toast({
        title: 'Đã phân tích bảng Google Sheets',
        description: `Đã nạp ${ctrlRows.length} dòng CONTROL TIMESHEETS thực tế.`,
      })
    } else {
      const rows = mapJsonRowsToRawRows(jsonRows, columnMapping, brandName)
      setParsedRawRows(rows)
      setParsedControlRows([])
      toast({
        title: 'Đã phân tích bảng Google Sheets',
        description: `Đã nạp ${rows.length} dòng chấm công thực tế từ Google Sheets.`,
      })
    }
  }

  // Run Preview via API (Zero Fake Fallbacks)
  const handleRunPreview = async () => {
    if (parsedRawRows.length === 0 && parsedControlRows.length === 0) {
      toast({
        title: 'Chưa có dữ liệu chấm công',
        description: 'Vui lòng tải lên tệp Excel/CSV hoặc dán dữ liệu từ Google Sheets trước khi phân tích.',
        variant: 'destructive',
      })
      return
    }

    setLoading(true)
    setPreviewSummary(null)
    setPreviewResults([])

    try {
      const res = await fetch('/api/workforce/attendance-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview',
          sourceProfileId: selectedProfile,
          sourceName,
          sourceType,
          brandName,
          rawRows: parsedRawRows,
          controlRows: parsedControlRows,
          validateWeekday,
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok || !data.ok) {
        const errMsg = data.error?.detail || data.error?.code || `Lỗi máy chủ (${res.status})`
        throw new Error(errMsg)
      }

      setPreviewSummary(data.summary)
      setPreviewResults(data.results || [])
      toast({
        title: 'Phân tích & Khớp nối hoàn tất',
        description: `Đã phân tích ${data.summary?.totalRows || 0} dòng: ${data.summary?.matchedRows || 0} hợp lệ, ${data.summary?.exceptionRows || 0} cần xử lý ngoại lệ.`,
      })
    } catch (err: unknown) {
      toast({
        title: 'Lỗi nạp nguồn chấm công',
        description: err instanceof Error ? err.message : 'Không thể kết nối API',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Confirm Drafts (Client only sends batchId; Server loads immutable staged rows)
  const handleConfirmDrafts = async () => {
    if (!previewSummary?.batchId) return
    setConfirming(true)
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
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.detail || data.error?.code || 'CONFIRM_FAILED')
      }

      toast({
        title: 'Đã tạo bản ghi Actual Staffing (DRAFT)',
        description: `Thành công tạo ${data.createdCount} ca chấm công nháp. Vui lòng chuyển Reviewer độc lập để kiểm duyệt.`,
      })
      setPreviewSummary(prev => prev ? { ...prev, status: 'confirmed', draftedSegments: data.createdCount } : null)
    } catch (err: unknown) {
      toast({
        title: 'Lỗi xác nhận bảng chấm công',
        description: err instanceof Error ? err.message : 'Xác nhận thất bại',
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

  return (
    <div className="space-y-6" data-testid="attendance-source-manager">
      {/* 1. SOURCE SELECTOR & COLUMN MAPPING CARD */}
      <Card className="border-slate-800 bg-slate-900/60 shadow-xl">
        <CardHeader className="border-b border-slate-800/80 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-lg font-semibold text-white">
                  Nhập chấm công lịch sử (Historical Attendance Importer)
                </CardTitle>
                <Badge variant="outline" className="border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs">
                  RC1.7C BOTH
                </Badge>
              </div>
              <CardDescription className="text-slate-400 text-xs">
                Chuẩn hóa dữ liệu từ Google Sheets / Excel về Actual Staffing có kiểm soát, phục vụ tính lương tự động.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMapping(!showMapping)}
                className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <Sliders className="mr-1.5 h-3.5 w-3.5" />
                {showMapping ? 'Đóng cấu hình cột' : 'Cấu hình ánh xạ cột'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunPreview}
                disabled={loading}
                className="border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Đang phân tích...' : 'Phân tích & Khớp nối'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          {/* Profile Picker */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              Nguồn / Tab dữ liệu
            </label>
            <select
              value={selectedProfile}
              onChange={e => handleProfileChange(e.target.value as SourceProfileId)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="opella_t10">OPELLA THÁNG 10 FINAL (MM/DD/YYYY)</option>
              <option value="pepsico_t10">PEPSICO THÁNG 10 FINAL (MM/DD/YYYY)</option>
              <option value="control_timesheets">ADA SHIFT MANAGER · CONTROL (TIMESHEETS)</option>
              <option value="custom">File Excel/CSV tải lên tùy chỉnh</option>
            </select>
          </div>

          {/* Date Order Setting */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              Quy tắc ngày tháng (Date Order)
            </label>
            <select
              value={dateOrder}
              onChange={e => setDateOrder(e.target.value as DateOrderOption)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="month-first">MM/DD/YYYY (Tháng trước - Opella/PepsiCo T10)</option>
              <option value="day-first">DD/MM/YYYY (Ngày trước - Mặc định VN)</option>
              <option value="iso">YYYY-MM-DD (ISO 8601)</option>
            </select>
          </div>

          {/* Brand Scope */}
          <div className="space-y-1.5">
            <label className="text-slate-300 font-medium">Nhãn hàng (Brand Filter)</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              placeholder="VD: Opella, PepsiCo"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* File Upload / Source Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-slate-400" />
                Phương thức nạp
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setImportMethod('upload')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${importMethod === 'upload' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  File
                </button>
                <button
                  type="button"
                  onClick={() => setImportMethod('paste')}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${importMethod === 'paste' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  Dán Sheets
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
                    Đã nạp: {uploadedFileName} ({parsedRawRows.length || parsedControlRows.length} dòng)
                  </span>
                )}
              </>
            ) : (
              <div className="space-y-1">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Dán các hàng copy từ Google Sheets vào đây (Ctrl+V)..."
                  rows={2}
                  className="w-full rounded border border-slate-700 bg-slate-950 p-1.5 text-[11px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleParsePastedData}
                  className="w-full h-6 text-[10px] bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
                >
                  Đọc dữ liệu dán ({parsedRawRows.length || parsedControlRows.length} dòng đã nạp)
                </Button>
              </div>
            )}
          </div>
        </CardContent>

        {/* GOOGLE SHEETS API STATUS BANNER */}
        {importMethod === 'paste' && (
          <div className="border-t border-slate-800/60 bg-amber-950/20 px-4 py-2 text-[11px] text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>
              Tính năng tự động đọc trực tiếp từ Google Sheets API yêu cầu cấu hình Service Account đã cấp quyền. Hiện tại bạn có thể copy-paste toàn bộ bảng dữ liệu vào đây hoặc tải lên file Excel xuất từ Google Sheets.
            </span>
          </div>
        )}

        {/* EXPANDABLE COLUMN MAPPING PROFILE */}
        {showMapping && (
          <div className="border-t border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5" /> Ánh xạ cột cho nguồn: {sourceName}
              </h4>
              <Button
                size="sm"
                onClick={handleSaveMappingProfile}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs h-7 px-3"
              >
                Lưu mẫu ánh xạ
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Cột Mã ca (Shift ID)</label>
                <input
                  type="text"
                  value={columnMapping.shiftIdCol}
                  onChange={e => setColumnMapping({ ...columnMapping, shiftIdCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Ngày live</label>
                <input
                  type="text"
                  value={columnMapping.dateCol}
                  onChange={e => setColumnMapping({ ...columnMapping, dateCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Khung giờ</label>
                <input
                  type="text"
                  value={columnMapping.timeCol}
                  onChange={e => setColumnMapping({ ...columnMapping, timeCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Host</label>
                <input
                  type="text"
                  value={columnMapping.hostCol}
                  onChange={e => setColumnMapping({ ...columnMapping, hostCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Trợ live (Support)</label>
                <input
                  type="text"
                  value={columnMapping.supportCol}
                  onChange={e => setColumnMapping({ ...columnMapping, supportCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Kỹ thuật (Technical)</label>
                <input
                  type="text"
                  value={columnMapping.techCol}
                  onChange={e => setColumnMapping({ ...columnMapping, techCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Check-in (Minh chứng)</label>
                <input
                  type="text"
                  value={columnMapping.checkInCol}
                  onChange={e => setColumnMapping({ ...columnMapping, checkInCol: e.target.value })}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-white"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Cột Check-out (Minh chứng)</label>
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
      </Card>

      {/* 2. RECONCILIATION SUMMARY TILES: 6 CORE RECONCILIATION METRICS */}
      {previewSummary && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3" data-testid="reconciliation-tiles">
          {/* Tile 1: Matched */}
          <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 text-center">
            <p className="text-xs text-emerald-400 font-medium">Hợp lệ (Matched)</p>
            <p className="text-xl font-bold text-emerald-400 mt-1">{previewSummary.matchedRows}</p>
          </div>

          {/* Tile 2: Ambiguous */}
          <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3 text-center">
            <p className="text-xs text-indigo-400 font-medium">Mơ hồ (Ambiguous)</p>
            <p className="text-xl font-bold text-indigo-400 mt-1">
              {(previewSummary.exceptionsSummary?.AMBIGUOUS_DATE_ORDER || 0) +
                (previewSummary.exceptionsSummary?.ROLE_AMBIGUOUS || 0)}
            </p>
          </div>

          {/* Tile 3: Missing Evidence */}
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-center">
            <p className="text-xs text-amber-400 font-medium">Thiếu chứng cứ</p>
            <p className="text-xl font-bold text-amber-400 mt-1">
              {previewSummary.exceptionsSummary?.MISSING_EVIDENCE || 0}
            </p>
          </div>

          {/* Tile 4: Duplicate / Overlap */}
          <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-center">
            <p className="text-xs text-rose-400 font-medium">Trùng / Chồng giờ</p>
            <p className="text-xl font-bold text-rose-400 mt-1">
              {previewSummary.exceptionsSummary?.OVERLAP_CONFLICT || 0}
            </p>
          </div>

          {/* Tile 5: Invalid Format / Times */}
          <div className="rounded-lg border border-orange-900/50 bg-orange-950/30 p-3 text-center">
            <p className="text-xs text-orange-400 font-medium">Sai định dạng</p>
            <p className="text-xl font-bold text-orange-400 mt-1">
              {(previewSummary.exceptionsSummary?.TIME_RANGE_INVALID || 0) +
                (previewSummary.exceptionsSummary?.WEEKDAY_MISMATCH || 0) +
                (previewSummary.exceptionsSummary?.INVALID_CONTROL_STRUCTURE || 0)}
            </p>
          </div>

          {/* Tile 6: Unmatched / Shift Not Completed */}
          <div className="rounded-lg border border-purple-900/50 bg-purple-950/30 p-3 text-center">
            <p className="text-xs text-purple-400 font-medium">Không khớp ca</p>
            <p className="text-xl font-bold text-purple-400 mt-1">
              {(previewSummary.exceptionsSummary?.SHIFT_NOT_FOUND || 0) +
                (previewSummary.exceptionsSummary?.STAFF_NOT_FOUND || 0) +
                (previewSummary.exceptionsSummary?.SHIFT_NOT_COMPLETED || 0)}
            </p>
          </div>
        </div>
      )}

      {/* 3. RECONCILIATION & EXCEPTION QUEUE TABLE */}
      {previewResults.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/60 shadow-xl">
          <CardHeader className="border-b border-slate-800/80 pb-3 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-indigo-400" />
              <CardTitle className="text-sm font-semibold text-white">
                Bảng đối soát & Hàng đợi ngoại lệ (Reconciliation & Exception Queue)
              </CardTitle>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <Button
                variant={activeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('all')}
                className="h-7 px-2.5 text-xs"
              >
                Tất cả ({previewResults.length})
              </Button>
              <Button
                variant={activeFilter === 'matched' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('matched')}
                className="h-7 px-2.5 text-xs border-emerald-800 text-emerald-400"
              >
                Hợp lệ ({previewSummary?.matchedRows || 0})
              </Button>
              <Button
                variant={activeFilter === 'exception' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveFilter('exception')}
                className="h-7 px-2.5 text-xs border-rose-800 text-rose-400"
              >
                Ngoại lệ ({previewSummary?.exceptionRows || 0})
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Dòng</th>
                    <th className="py-2.5 px-3 font-medium">Ngày live</th>
                    <th className="py-2.5 px-3 font-medium">Khung giờ</th>
                    <th className="py-2.5 px-3 font-medium">Nhân sự</th>
                    <th className="py-2.5 px-3 font-medium">Vai trò</th>
                    <th className="py-2.5 px-3 font-medium">Hình thức</th>
                    <th className="py-2.5 px-3 font-medium">Minh chứng</th>
                    <th className="py-2.5 px-3 font-medium">Trạng thái</th>
                    <th className="py-2.5 px-3 font-medium">Chi tiết lỗi / Ghi chú</th>
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
                              PASS ca
                            </Badge>
                          ) : (
                            <span className="text-slate-400">Chuẩn</span>
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
                              <ShieldCheck className="h-3 w-3" /> Lead duyệt
                            </span>
                          )}
                          {seg.evidenceKind === 'missing_evidence' && (
                            <span className="inline-flex items-center gap-1 text-amber-400 text-[11px]">
                              <AlertCircle className="h-3 w-3" /> Giờ lịch (Thiếu chứng cứ)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          {isMatched ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                              <CheckCircle2 className="h-3 w-3" /> Khớp ca completed
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

          {/* Footer action to draft actual staffing */}
          <CardFooter className="border-t border-slate-800/80 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-indigo-400" />
              <span>
                Nguyên tắc 4 mắt: Xác nhận sẽ tạo các ca ở trạng thái <strong className="text-white">DRAFT</strong>. Cần Reviewer độc lập ký duyệt trước khi chuyển sang Payroll.
              </span>
            </div>
            <Button
              onClick={handleConfirmDrafts}
              disabled={confirming || (previewSummary?.matchedRows || 0) === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
            >
              <FileCheck className="mr-1.5 h-3.5 w-3.5" />
              {confirming ? 'Đang tạo ca nháp...' : `Xác nhận & Chuyển vào Actual Staffing (${previewSummary?.matchedRows || 0} ca)`}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
